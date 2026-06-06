import type {NextFunction, Request, Response} from 'express';
import express from 'express';
import path from 'path';
import cors from 'cors';
import crypto from 'crypto';
import type {I_UserCreation, I_UserEntry, I_UserUpdate} from "docpouch-client";
import NeDbWrapper, {type DatabaseCollection, type ImportMode} from "./NeDbWrapper.js";
import winston from "winston";
import jwt from "jsonwebtoken"
import SchemaValidator from "./SchemaValidator.js";
import IoSocketServer from "./IoSocketServer.js";
import * as http from "node:http";
import * as os from "node:os";
import fs from "fs";
import multer from "multer";
import { ZipArchive } from "archiver";
import AdmZip from "adm-zip";
import {JWTOptions} from "./webTokenStuff.js";
import {getCachedUpdateResult} from "./updateChecker.js";
import * as oidc from "oidc-provider";
import OidcAdapter from "./OidcAdapter.js";
import type {I_CorsOption} from "../types.ts";
const DATABASE_COLLECTIONS: DatabaseCollection[] = ["users", "documents", "structures"];
type DatabaseScope = DatabaseCollection | "all";
type ExportFormat = "json" | "zip";

function isDatabaseCollection(value: string): value is DatabaseCollection {
    return DATABASE_COLLECTIONS.includes(value as DatabaseCollection);
}

function parseDatabaseScope(rawScope: unknown): DatabaseScope {
    if (typeof rawScope !== "string" || rawScope.trim().length < 1) {
        return "all";
    }

    const normalized = rawScope.trim().toLowerCase();
    if (normalized === "all") {
        return "all";
    }

    if (isDatabaseCollection(normalized)) {
        return normalized;
    }

    throw new Error("Invalid scope. Allowed values: all, users, documents, structures.");
}

function parseExportFormat(rawFormat: unknown): ExportFormat {
    if (typeof rawFormat !== "string" || rawFormat.trim().length < 1) {
        return "zip";
    }

    const normalized = rawFormat.trim().toLowerCase();
    if (normalized === "zip" || normalized === "json") {
        return normalized;
    }

    throw new Error("Invalid format. Allowed values: zip, json.");
}

function parseImportMode(rawMode: unknown): ImportMode {
    if (typeof rawMode !== "string" || rawMode.trim().length < 1) {
        return "replace";
    }

    const normalized = rawMode.trim().toLowerCase();
    if (normalized === "replace" || normalized === "add" || normalized === "skip") {
        return normalized as ImportMode;
    }

    throw new Error("Invalid import mode. Allowed values: replace, add, skip.");
}

export function cspMiddleware(req: Request, res: Response, next: NextFunction) {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;
    const csp = [
        "default-src 'none'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        `style-src 'self' 'nonce-${nonce}'`,
        "img-src 'self' https:",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        ...(process.env.NODE_ENV === 'production' ? ["upgrade-insecure-requests"] : []),
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);
    next();
}

export default class NetworkManager {
    corsOptions: any;
    port: number;
    private readonly expressApp: express.Application;
    dataManager: NeDbWrapper;
    private socketServer: IoSocketServer
    webServer: http.Server
    logger: winston.Logger
    validator: SchemaValidator
    oidcProvider: any

    constructor(logger: winston.Logger, dataManager: NeDbWrapper, port: number, corsOptions: I_CorsOption) {
        this.corsOptions = corsOptions;
        this.port = port;
        this.expressApp = express();
        this.expressApp.set('trust proxy', true);
        this.dataManager = dataManager;
        this.logger = logger;
        this.validator = new SchemaValidator(logger);
        const jwksFile = path.join(process.cwd(), 'db', 'oidc-jwks.json');

        let jwks: any;
        if (fs.existsSync(jwksFile)) {
            jwks = JSON.parse(fs.readFileSync(jwksFile, 'utf8'));
            this.logger.info('Loaded existing JWKS from disk');
        } else {
            // Generate static JWKS for token signing (development/simple setup)
            this.logger.info('Generating new JWKS key pair');
            const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: {type: 'spki', format: 'pem'},
                privateKeyEncoding: {type: 'pkcs8', format: 'pem'}
            });

            const keyPair = crypto.createPrivateKey(privateKey);
            const jwk = keyPair.export({format: 'jwk'});
            const publicJwk = crypto.createPublicKey(publicKey).export({format: 'jwk'});

            jwks = {
                keys: [{
                    kty: 'RSA',
                    use: 'sig',
                    alg: 'RS256',
                    kid: 'docpouch-key-1',
                    ...publicJwk,
                    d: jwk.d,
                    p: jwk.p,
                    dp: jwk.dp,
                    dq: jwk.dq,
                    q: jwk.q,
                    qi: jwk.qi
                }]
            };

            if (!fs.existsSync(path.dirname(jwksFile))) {
                fs.mkdirSync(path.dirname(jwksFile), {recursive: true});
            }
            fs.writeFileSync(jwksFile, JSON.stringify(jwks, null, 2), 'utf8');
            this.logger.info('Persisted new JWKS to disk');
        }

        // Determine the correct issuer based on environment
        if (!process.env.OIDC_ISSUER) {
            throw new Error('OIDC_ISSUER environment variable is required for OIDC provider initialization');
        }
        const issuer = process.env.OIDC_ISSUER;
        this.logger.info(`Initializing OIDC provider with issuer: ${issuer}`);

        this.oidcProvider = new oidc.Provider(issuer, {
            adapter: OidcAdapter,
            jwks: jwks,
            cookies: {
                keys: [process.env.OIDC_COOKIE_KEY || 'docpouch-cookie-secret-change-in-production'],
                long: {
                    secure: process.env.OIDC_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
                    httpOnly: true,
                    sameSite: 'lax'
                },
                short: {
                    secure: process.env.OIDC_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
                    httpOnly: true,
                    sameSite: 'lax'
                },
                names: {
                    session: '_session',
                    interaction: '_interaction',
                    resume: '_interaction_resume'
                }
            },
            features: {
                devInteractions: {enabled: false},
                rpInitiatedLogout: {
                    enabled: true,
                    logoutSource: async function (ctx: any, form: string) {
                        ctx.logger?.debug('Rendering logout confirmation page');
                        const htmlPath = fs.existsSync(path.resolve(process.cwd(), 'dist/srv/oidc-logout.html'))
                            ? path.resolve(process.cwd(), 'dist/srv/oidc-logout.html')
                            : path.resolve(process.cwd(), 'src/srv/oidc-logout.html');
                        let html = fs.readFileSync(htmlPath, 'utf8');
                        const actionMatch = form.match(/action="([^"]+)"/);
                        const xsrfMatch = form.match(/name="xsrf" value="([^"]+)"/);
                        const rawRedirectUri = ctx.oidc?.session?.state?.postLogoutRedirectUri || '/';
                        // If the URI is a proxy (contains a nested post_logout_redirect_uri query param),
                        // extract the actual RP return URL for the cancel button
                        const nestedMatch = rawRedirectUri.match(/[?&]post_logout_redirect_uri=([^&]+)/);
                        const cancelUrl = nestedMatch ? decodeURIComponent(nestedMatch[1]) : rawRedirectUri;
                        html = html.replace(/__NONCE__/g, ctx.res.locals?.nonce || '');
                        html = html.replace('__ACTION_URL__', actionMatch ? actionMatch[1] : '');
                        html = html.replace('__XSRF__', xsrfMatch ? xsrfMatch[1] : '');
                        html = html.replace('__POST_LOGOUT_REDIRECT_URI__', cancelUrl);
                        ctx.body = html;
                    },
                    postLogoutSuccessSource: async function renderLogoutSuccessPage(ctx: any) {
                        // Clear all oidc-provider session cookies to ensure re-authentication is required
                        const cookieNames = ['_session', '_interaction', '_interaction_resume'];
                        const cookieOptions = {
                            path: '/',
                            httpOnly: true,
                            secure: process.env.OIDC_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
                            sameSite: 'lax' as const,
                            maxAge: 0
                        };

                        cookieNames.forEach(name => {
                            ctx.cookies.set(name, '', cookieOptions);
                            ctx.cookies.set(`${name}.sig`, '', cookieOptions);
                        });

                        // Also destroy the session in the backend store
                        try {
                            const sessionUid = ctx.oidc?.session?.uid;
                            if (sessionUid) {
                                const sessionAdapter = new (ctx.oidc?.provider?.Adapter || function () {
                                })('Session');
                                if (sessionAdapter.destroy) {
                                    await sessionAdapter.destroy(sessionUid);
                                    ctx.logger?.debug(`Destroyed session ${sessionUid}`);
                                }
                            }
                        } catch (err) {
                            ctx.logger?.debug('Session destruction not critical:', err);
                        }
                        
                        const display = ctx.oidc.client?.clientName || ctx.oidc.client?.clientId;

                        ctx.body = `<!DOCTYPE html>
                          <html lang="en">
                          <head>
                            <meta charset="UTF-8">
                            <meta content="width=device-width, initial-scale=1.0" name="viewport">
                            <title>DocPouch - Logout Success</title>
                            <style nonce="${ctx.res.locals?.nonce || ''}">
                              * {
                                margin: 0;
                                padding: 0;
                                box-sizing: border-box;
                              }
                              
                              body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                min-height: 100vh;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                padding: 20px;
                              }
                              
                              .login-container {
                                background: white;
                                border-radius: 12px;
                                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                                padding: 40px;
                                max-width: 400px;
                                width: 100%;
                                text-align: center;
                              }
                              
                              .logo {
                                text-align: center;
                                margin-bottom: 30px;
                              }
                              
                              .logo-img {
                                width: 80px;
                                height: 80px;
                                margin-bottom: 12px;
                              }
                              
                              .logo h1 {
                                color: #667eea;
                                font-size: 32px;
                                margin-bottom: 8px;
                              }
                              
                              .success-message {
                                background: #e8f5e9;
                                color: #2e7d32;
                                padding: 16px;
                                border-radius: 8px;
                                margin: 20px 0;
                                font-size: 16px;
                              }
                              
                              .info {
                                background: #e3f2fd;
                                color: #1976d2;
                                padding: 12px;
                                border-radius: 8px;
                                margin-top: 20px;
                                font-size: 14px;
                              }
                              
                              button {
                                width: 100%;
                                padding: 14px;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                color: white;
                                border: none;
                                border-radius: 8px;
                                font-size: 16px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: transform 0.2s, box-shadow 0.2s;
                                margin-top: 20px;
                              }
                              
                              button:hover {
                                transform: translateY(-2px);
                                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                              }
                            </style>
                          </head>
                          <body>
                            <div class="login-container">
                              <div class="logo">
                                <img alt="DocPouch" class="logo-img" src="/oidc/static/docPouch.png">
                                <h1>DocPouch</h1>
                                <p>Sign out successful</p>
                              </div>
                              
                              <div class="success-message">
                                Your sign-out ${display ? `with ${display}` : ''} was successful.
                              </div>
                              
                              <div class="info">
                                You have been successfully signed out of DocPouch.
                              </div>
                              
                              <button id="returnToAppBtn">
                                Return to Application
                              </button>
                            </div>
                          </body>
                          <script nonce="${ctx.res.locals?.nonce || ''}">
                            document.getElementById('returnToAppBtn').addEventListener('click', () => {
                              window.location.href = '/';
                            });
                          </script>
                          </html>`;
                    }
                },
                revocation: {enabled: true},
                backchannelLogout: {enabled: true},
                pushedAuthorizationRequests: {enabled: true},
                registration: {
                    enabled: true,
                    initialAccessToken: process.env.OIDC_REGISTRATION_TOKEN,
                    issueRegistrationAccessToken: true,
                    secretFactory: (ctx) => {
                        return crypto.randomBytes(64).toString('base64url');
                    }
                },
                registrationManagement: {enabled: true, rotateRegistrationAccessToken: false},
            },
            // Additional configuration for proper logout handling
            clients: [
                {
                    client_id: 'docpouch-admin-ui',
                    client_name: 'DocPouch Admin UI',
                    redirect_uris: [process.env.OIDC_REDIRECT_URI || `${issuer.replace('/oidc', '')}/`],
                    post_logout_redirect_uris: [
                        process.env.OIDC_POST_LOGOUT_REDIRECT_URI || process.env.OIDC_REDIRECT_URI || `${issuer.replace('/oidc', '')}/`,
                        `${issuer.replace('/oidc', '')}/oidc/logout-redirect`,
                    ],
                    grant_types: ['authorization_code', 'refresh_token'],
                    response_types: ['code'],
                    token_endpoint_auth_method: 'none',
                    application_type: 'web',
                }
            ],
            // Configure which scopes are available to clients
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            // Add specific configuration for end_session endpoint
            routes: {
                authorization: '/auth',
                token: '/token',
                userinfo: '/userinfo',
                jwks: '/jwks',
                revocation: '/revocation',
                registration: '/reg',
                end_session: '/end_session',  // Explicitly define the end_session route
                introspection: '/introspection',
                pushed_authorization_request: '/par'
            },
            interactions: {
                url: (ctx, interaction) => {
                    return `/interaction/${interaction.uid}`;
                }
            },
            findAccount: async (ctx, sub, token) => {
                const user = await (this as any).dataManager.getUserByID(sub);
                if (!user) return undefined;
                return {
                    accountId: sub,
                    async claims(use, scope) {
                        const result: Record<string, unknown> = {sub};
                        if (scope) {
                            const scopes = scope.split(' ');
                            if (scopes.includes('profile')) {
                                result.name = (user as any).name;
                            }
                            if (scopes.includes('email') && (user as any).email) {
                                result.email = (user as any).email;
                            }
                        }
                        return result as any;
                    }
                };
            },
            ttl: {
                Session: 3600,           // 1 hour
                Grant: 3600,             // 1 hour
                AccessToken: 3600,       // 1 hour
                IdToken: 3600,           // 1 hour
                RefreshToken: 86400,     // 24 hours
                Interaction: 300,        // 5 minutes
            },
            renderError: (ctx, out, error) => {
                const err = error as any;
                console.error('OIDC renderError:', err.message, err.error_description, err.error_detail, err.stack);
                ctx.status = err?.status || 500;
                ctx.body = {
                    error: err?.message || 'Unknown error',
                    error_description: err?.error_description || err?.description || 'An error occurred'
                };
            }
        });

        this.oidcProvider.proxy = true;

        // Configure trusted headers for proxy
        this.oidcProvider.app.proxy = true;
        this.oidcProvider.app.keys = [process.env.OIDC_COOKIE_KEY || 'docpouch-cookie-secret-change-in-production'];

        this.webServer = this.expressApp.listen(this.port, () => {
            const networkInterfaces = os.networkInterfaces();
            let hostAddress = 'localhost';

            for (const key in networkInterfaces) {
                if (key.includes('docker') || key.includes('br-') || key.toLowerCase().includes('vethernet')) continue;
                const addresses = networkInterfaces[key];
                if (!addresses) continue;
                for (const address of addresses) {
                    if (address.family === 'IPv4' && !address.internal) {
                        hostAddress = address.address;
                        break;
                    }
                }
            }

            this.logger.log("info", `Server is running on ${hostAddress}:${this.port}`);
        });
        this.socketServer = new IoSocketServer(this, {
            secret: JWTOptions.secret,
            algorithm: JWTOptions.settings.algorithm
        })
        this.initializeExpress();
    }

    public stop(): Promise<void> {
        return new Promise((resolve) => {
            this.socketServer.close();
            this.dataManager.stop();
            this.webServer.close(() => resolve());
        });
    }

    private initializeExpress(): void {
        const vuePath = path.resolve(process.cwd(), 'dist/srv/vue');
        this.logger.info(`Serving static files from: ${vuePath}`);

        this.expressApp.use(cors(this.corsOptions));
        this.expressApp.use(express.static(vuePath));
        // Serve OIDC login page and static assets
        const oidcStaticPath = fs.existsSync(path.resolve(process.cwd(), 'dist/srv'))
            ? path.resolve(process.cwd(), 'dist/srv')
            : path.resolve(process.cwd(), 'src/srv');
        this.expressApp.use('/oidc/static', express.static(oidcStaticPath));
        this.expressApp.use(cspMiddleware);
        this.expressApp.disable('etag'); // Disable ETag header to prevent caching of responses

        // OIDC client config endpoint (must be before the OIDC provider mount)
        this.expressApp.get('/api/oidc-client-config', async (req, res) => {
            try {
                if (!process.env.OIDC_ISSUER) {
                    res.json({configured: false});
                    return;
                }
                const host = req.headers.host || `localhost:${this.port}`;
                const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
                const redirectUri = `${protocol}://${host}/`;
                const clientId = 'docpouch-admin-ui';
                const clientAdapter = new OidcAdapter('Client');
                const existing = await clientAdapter.find(clientId);

                let registeredClientId: string | null = null;

                const logoutRedirectUri = `${protocol}://${host}/oidc/logout-redirect`;

                if (existing) {
                    registeredClientId = (existing.client_id || existing._id || clientId) as string;
                    const existingUris = existing.redirect_uris || [];
                    const existingPostLogoutUris = existing.post_logout_redirect_uris || [];
                    const updatedUris = existingUris.includes(redirectUri) ? existingUris : [...existingUris, redirectUri];
                    const updatedPostLogoutUris = existingPostLogoutUris.includes(logoutRedirectUri) ? existingPostLogoutUris : [...existingPostLogoutUris, logoutRedirectUri];
                    if (updatedUris !== existingUris || updatedPostLogoutUris !== existingPostLogoutUris) {
                        await clientAdapter.upsert(registeredClientId, {
                            ...existing,
                            redirect_uris: updatedUris,
                            post_logout_redirect_uris: updatedPostLogoutUris,
                        }, existing.expiresAt);
                        this.logger.info(`Updated OIDC client redirect URIs: ${JSON.stringify(updatedUris)}`);
                        this.logger.info(`Updated OIDC client post-logout redirect URIs: ${JSON.stringify(updatedPostLogoutUris)}`);
                    }
                } else {
                    // Create client with fixed ID (skip dynamic registration for admin UI)
                    try {
                        const client = new this.oidcProvider.Client({
                            client_id: clientId,
                            client_name: 'DocPouch Admin UI',
                            redirect_uris: [redirectUri],
                            post_logout_redirect_uris: [logoutRedirectUri],
                            grant_types: ['authorization_code', 'refresh_token'],
                            response_types: ['code'],
                            token_endpoint_auth_method: 'none',
                            application_type: 'web',
                            default_max_age: 86400,
                            require_auth_time: false,
                        });
                        // Persist the client with allowed scopes
                        const clientMetadata = client.metadata();
                        clientMetadata.allowed_scopes = 'openid profile email offline_access';
                        await clientAdapter.upsert(client.clientId, clientMetadata, client.expiresAt);
                        registeredClientId = client.clientId;
                        this.logger.info(`Admin UI OIDC client created: ${registeredClientId}`);
                    } catch (err: any) {
                        this.logger.error(`Client creation failed: ${err.message}`);
                        res.status(500).json({error: 'Failed to create OIDC client'});
                        return;
                    }
                }

                res.json({
                    configured: true,
                    issuer: process.env.OIDC_ISSUER,
                    clientId: registeredClientId,
                    redirectUri,
                    postLogoutRedirectUri: `${protocol}://${host}/oidc/logout-redirect`,
                    scope: 'openid profile email offline_access',
                });
            } catch (err: any) {
                this.logger.error(`OIDC client config error: ${err.message}`);
                res.status(500).json({error: 'Failed to get OIDC configuration'});
            }
        });



        // Error handling middleware for the app
        this.expressApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
            this.logger.error(`Express error: ${err.message}`, err);
            if (res.headersSent) {
                return next(err);
            }
            res.status(500).json({error: 'Internal server error', message: err.message});
        });

        // Error handling middleware for the app
        this.expressApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
            this.logger.error(`Express error: ${err.message}`, err);
            if (res.headersSent) {
                return next(err);
            }
            res.status(500).json({error: 'Internal server error', message: err.message});
        });

        // Logout redirect handler - must be before OIDC provider mount
        // Ensures cookies are cleared after oidc-provider logout
        this.expressApp.get('/oidc/logout-redirect', async (req, res) => {
            this.logger.debug('Logout redirect handler called');
            const postLogoutRedirectUri = req.query.post_logout_redirect_uri as string || '/';

            const cookieOptions = {
                httpOnly: true,
                secure: process.env.OIDC_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
                sameSite: 'lax' as const,
                path: '/'
            };

            ['_session', '_interaction', '_interaction_resume'].forEach(name => {
                res.clearCookie(name, cookieOptions);
                res.clearCookie(`${name}.legacy`, cookieOptions);
                res.clearCookie(`${name}.sig`, cookieOptions);
            });

            this.logger.debug('Redirecting to:', postLogoutRedirectUri);
            res.redirect(postLogoutRedirectUri);
        });

        // Log all OIDC requests for debugging
        this.expressApp.use("/oidc", (req: Request, res: Response, next: NextFunction) => {
            this.logger.debug('=== OIDC Request ===');
            this.logger.debug(`${req.method} ${req.url}`);
            this.logger.debug('Query: ' + JSON.stringify(req.query));
            this.logger.debug('Headers: ' + JSON.stringify(req.headers));

            // Log response when it finishes
            res.on('finish', () => {
                this.logger.debug(`Response sent: ${res.statusCode} for ${req.method} ${req.originalUrl}`);
            });

            next();
        });

        // Mount OIDC provider (it has its own body parser)
        this.expressApp.use("/oidc", (req: Request, res: Response, next: NextFunction) => {
            this.oidcProvider.callback()(req, res, (err: any) => {
                if (err) {
                    this.logger.error(`OIDC callback error: ${err.message}`, err);
                    next(err);
                } else {
                    next();
                }
            });
        });

        // Body parser for non-OIDC routes only (must be after OIDC provider)
        this.expressApp.use(express.json());
        this.expressApp.use(express.urlencoded({extended: true}));


        // Configure multer for file uploads
        const upload = multer({
            dest: 'uploads/',
            limits: {fileSize: 100 * 1024 * 1024} // 100MB limit
        });

        // Serve OIDC login page
        this.expressApp.get('/interaction/:uid', async (req, res) => {
            try {
                const interaction = await this.oidcProvider.interactionDetails(req, res);

                // Auto-accept consent for the admin UI (user already authenticated)
                if (interaction.prompt?.name === 'consent') {
                    const grant = new this.oidcProvider.Grant({
                        accountId: interaction.session?.accountId,
                        clientId: interaction.params?.client_id,
                    });
                    if (interaction.prompt.details?.missingOIDCScope) {
                        grant.addOIDCScope(interaction.prompt.details.missingOIDCScope.join(' '));
                    }
                    if (interaction.prompt.details?.missingOIDCClaims) {
                        grant.addOIDCClaims(interaction.prompt.details.missingOIDCClaims);
                    }
                    const grantId = await grant.save();
                    await this.oidcProvider.interactionFinished(req, res, {consent: {grantId}}, {mergeWithLastSubmission: true});
                    return;
                }

                // Try dist first (production), fall back to src (development)
                const htmlPath = fs.existsSync(path.resolve(process.cwd(), 'dist/srv/oidc-login.html'))
                    ? path.resolve(process.cwd(), 'dist/srv/oidc-login.html')
                    : path.resolve(process.cwd(), 'src/srv/oidc-login.html');
                let html = fs.readFileSync(htmlPath, 'utf8');
                html = html.replace(/__NONCE__/g, res.locals.nonce);
                html = html.replace(/__UID__/g, req.params.uid);
                res.type('html').send(html);
            } catch (err) {
                res.status(400).send('Invalid or expired login session. Please try again.');
            }
        });

        // API endpoint to get interaction details (for displaying client info)
        this.expressApp.get('/interaction/:uid/details', async (req, res) => {
            try {
                const interaction = await this.oidcProvider.interactionDetails(req, res);
                const client = interaction.params?.client_id
                    ? await this.oidcProvider.Client.find(interaction.params.client_id)
                    : null;

                res.json({
                    clientName: client?.clientName || client?.client_id || 'Unknown Client',
                    prompt: interaction.prompt?.name || 'login'
                });
            } catch (err) {
                res.status(400).json({error: 'Invalid interaction'});
            }
        });

        // Handle login form submission
        this.expressApp.post('/interaction/:uid', async (req, res) => {
            this.logger.debug('=== Interaction POST Request ===');
            this.logger.debug('URL: ' + req.url);
            this.logger.debug('Method: ' + req.method);
            this.logger.debug('Body: ' + JSON.stringify(req.body));
            this.logger.debug('Params: ' + JSON.stringify(req.params));
            
            try {
                const interaction = await this.oidcProvider.interactionDetails(req, res);
                this.logger.debug('Interaction details: ' + JSON.stringify(interaction, null, 2));
                
                const {uid, prompt} = interaction;
                this.logger.debug('Prompt name: ' + prompt?.name);
                this.logger.debug('Prompt details: ' + JSON.stringify(prompt?.details));

                if (prompt?.name === 'login') {
                    const {name, password} = req.body;
                    const user = await this.dataManager.validateUser(name, password);
                    if (typeof user === 'number') {
                        res.redirect(`/interaction/${uid}?error=Invalid+username+or+password`);
                        return;
                    }
                    this.logger.debug('Login successful for user: ' + user._id);
                    // Complete login and immediately grant consent for all requested scopes
                    const grant = new this.oidcProvider.Grant({
                        accountId: user._id,
                        clientId: interaction.params?.client_id,
                    });
                    // Use the full scope from the original authorization request
                    const requestedScope = interaction.params?.scope || 'openid profile email offline_access';
                    this.logger.debug('Granting scopes: ' + requestedScope);
                    grant.addOIDCScope(requestedScope);
                    const grantId = await grant.save();
                    this.logger.debug('Grant created with ID: ' + grantId);
                    await this.oidcProvider.interactionFinished(req, res, {
                        login: {accountId: user._id},
                        consent: {grantId}
                    }, {mergeWithLastSubmission: false});
                    this.logger.debug('Login and consent interaction finished');
                    return;
                } else if (prompt?.name === 'consent') {
                    const grant = new this.oidcProvider.Grant({
                        accountId: interaction.session?.accountId,
                        clientId: interaction.params?.client_id,
                    });
                    if (prompt.details?.missingOIDCScope) {
                        grant.addOIDCScope(prompt.details.missingOIDCScope.join(' '));
                    }
                    if (prompt.details?.missingOIDCClaims) {
                        grant.addOIDCClaims(prompt.details.missingOIDCClaims);
                    }
                    const grantId = await grant.save();
                    await this.oidcProvider.interactionFinished(req, res, {consent: {grantId}}, {mergeWithLastSubmission: true});
                } else if (prompt?.name === 'logout') {
                    this.logger.debug('Handling logout prompt');
                    this.logger.debug('Logout value from form: ' + req.body.logout);

                    if (req.body.logout === 'no') {
                        this.logger.debug('User cancelled logout - redirecting back without logging out');
                        const redirectUri = interaction.params?.post_logout_redirect_uri || '/';
                        res.redirect(redirectUri);
                        return;
                    } else {
                        this.logger.debug('User confirmed logout - proceeding with logout');
                        await this.oidcProvider.interactionFinished(req, res, {logout: {}}, {mergeWithLastSubmission: false});
                        return;
                    }
                }
            } catch (err) {
                this.logger.error('Interaction handling error: ' + err);
                res.redirect(`/interaction/${req.params.uid}?error=Login+failed.+Please+try+again.`);
            }
        });
        // Proxy well-known OIDC discovery to the OIDC provider (mounted at /oidc)
        this.expressApp.get('/.well-known/openid-configuration', (req, res) => {
            const options = {
                hostname: 'localhost',
                port: this.port,
                path: '/oidc/.well-known/openid-configuration',
                method: 'GET',
                headers: req.headers
            };
            const proxyReq = http.request(options, (proxyRes) => {
                res.status(proxyRes.statusCode || 500);
                ['content-type', 'content-length', 'cache-control'].forEach(header => {
                    if (proxyRes.headers[header]) {
                        res.setHeader(header, proxyRes.headers[header] as string);
                    }
                });
                proxyRes.pipe(res);
            });
            proxyReq.on('error', () => {
                res.status(500).json({error: 'Failed to fetch OIDC configuration'});
            });
            proxyReq.end();
        });

        this.expressApp.get('/users/list', this.authenticate, (req, res) => {
            this.dataManager.getUsers(req.userid)
                .then((users: I_UserEntry[]) => {
                    res.status(200).json(users);
                }).catch((error) => {
                res.status(error).json({error: error.message});
            });
        });

        this.expressApp.post("/users/create", this.authenticate, (req, res) => {
            let validatedObject = this.validator.getValidatedObject("userCreation", req.body);
            if (validatedObject !== false) {
                this.dataManager.isAdmin(req.userid).then((isAdmin) => {
                    if (isAdmin) {
                        this.dataManager.createUser(validatedObject as I_UserCreation)
                            .then((newUser) => {
                                this.socketServer.sendEventToAdmins(req.socketID, "newUser", {newUser: newUser});
                                this.logger.info(`New user created: ${JSON.stringify(newUser)}`);
                                res.status(200).json(newUser);
                            })
                            .catch((error) => {
                                res.status(500).json({error: error.message});
                            });
                    } else
                        res.status(401).json({error: "Not authorized to create users"});
                })
            } else
                res.status(400).json({error: "Invalid user data"});
        })

        this.expressApp.post("/users/login", (req: Request, res: Response) => {
            this.logger.info("Login request received");

            try {
                const validatedObject = this.validator.getValidatedObject("userLogin", req.body);
                this.logger.debug(`Validation result: ${JSON.stringify(validatedObject)}`);

                if (validatedObject) {
                    this.logger.debug("Validation passed, calling validateUser");
                    this.dataManager.validateUser(req.body.name, req.body.password)
                        .then((user: I_UserEntry | number) => {
                            if (typeof user === "number") {
                                res.status(user).json({error: "Invalid user or password"});
                            } else {
                                user = user as I_UserEntry;
                                this.logger.debug("User validation result:", user ? "User found" : "User not found");
                                if (user) {
                                    this.logger.info("Creating JWT token");
                                    let token = jwt.sign({id: user._id}, JWTOptions.secret, JWTOptions.settings as jwt.SignOptions);
                                    this.logger.debug("Sending successful response");
                                    res.json({
                                        token: token,
                                        isAdmin: user.isAdmin || false,
                                        userName: user.name,
                                        _id: user._id
                                    });
                                } else {
                                    res.status(401).json({error: "Invalid user or password"});
                                }
                            }
                        })
                } else {
                    this.logger.error("Validation failed - Invalid user data");
                    res.status(401).json({error: "Invalid user data"});
                }
            } catch (error) {
                this.logger.error("Unexpected error in login route:", error);
                res.status(500).json({error: "Internal server error"});
            }
        })

        this.expressApp.get("/users/whoami", this.authenticate, async (req, res) => {
            try {
                const user = await this.dataManager.getUserByID(req.userid);
                if (user) {
                    res.json({
                        _id: user._id,
                        name: user.name,
                        isAdmin: user.isAdmin || false,
                        email: user.email,
                    });
                } else {
                    res.status(404).json({error: 'User not found'});
                }
            } catch (err) {
                res.status(500).json({error: 'Error fetching user info'});
            }
        });

        this.expressApp.patch("/users/update/:userID", this.authenticate, (req: Request, res: Response) => {
            const validatedObject = this.validator.getValidatedObject("userUpdate", req.body);

            if (validatedObject !== false && req.params.userID !== undefined) {
                const userID = req.params.userID as string;
                const checkPermission = async () => {
                    if (req.userid === userID && !("isAdmin" in validatedObject)) {
                        return true; // User can update their own profile
                    }
                    return await this.dataManager.isAdmin(req.userid);
                };
                checkPermission().then((isAuthorized: boolean) => {
                    if (req.userid !== userID) {
                        if (!isAuthorized)
                            return res.status(401).json({error: "Not authorized to update this user"});
                    }

                    const updateData: I_UserUpdate = {};
                    updateData._id = userID;
                    if (req.body.name) updateData.name = req.body.name;
                    if (req.body.password) updateData.password = req.body.password;
                    if (req.body.email) updateData.email = req.body.email;
                    if (req.body.department) updateData.department = req.body.department;
                    if (req.body.group) updateData.group = req.body.group;
                    if (req.body.isAdmin !== undefined) updateData.isAdmin = req.body.isAdmin;

                    this.dataManager.updateUser(userID, updateData)
                        .then((numUpdated: number) => {
                            if (numUpdated < 1) {
                                res.status(404).json({error: "User not found"});
                            } else if (numUpdated > 1)
                                res.status(500).json({error: "Multiple users with the same ID found"});
                            else {
                                this.socketServer.sendEventToAdmins(req.socketID, "changedUser", {changedUser: updateData})
                                res.status(200).json({message: "User has been successfully updated"});
                            }
                        })
                        .catch((error) => {
                            if (error.message.includes("not found")) {
                                res.status(404).json({error: "User not found"});
                            } else {
                                res.status(500).json({error: error.message});
                            }
                        })
                })

            } else
                res.status(503).json({error: "Invalid user data"});
        });

        this.expressApp.delete("/users/remove/:userID", this.authenticate, (req, res) => {
            this.dataManager.isAdmin(req.userid).then((isAdmin: boolean) => {
                if (!isAdmin)
                    return res.status(401).json({error: "Not authorized to remove this user"});
                else if (req.params.userID !== undefined) {
                    this.dataManager.removeUser(req.params.userID as string).then(() => {
                        this.socketServer.sendEventToAdmins(req.socketID, "removedUser", {removedID: req.params.userID as string})
                        res.status(200).json({message: "User has been successfully removed"});
                    }).catch((error) => {
                        res.status(404).json({error: error.message});
                    });
                }
            })
        })

        // Document endpoints with access control
        this.expressApp.get("/docs/list", this.authenticate, (req, res) => {
            this.dataManager.getAllDocuments(req.userid)
                .then((documents) => {
                    res.status(200).json(documents);
                })
                .catch((error) => {
                    res.status(500).json({error: error.message});
                });
        });

        this.expressApp.post("/docs/fetch", this.authenticate, (req, res) => {
            let queryObject = req.body;
            this.validator.getValidatedObject("documentFetch", queryObject);

            this.dataManager.fetchDocuments(req.body, req.userid)
                .then((documents) => {
                    res.status(200).json(documents);
                })
                .catch((error) => {
                    if (error === "Document not found") {
                        res.status(404).json({error: error});
                    } else if (error === "Not authorized to access this document") {
                        res.status(403).json({error: error});
                    } else {
                        res.status(500).json({error: error.message || error});
                    }
                });
        });

        this.expressApp.post("/docs/create", this.authenticate, (req, res) => {
            this.logger.debug(`Document creation request received with body: ${JSON.stringify(req.body)}`);
            if (this.validator.getValidatedObject("documentCreation", req.body)) {
                this.logger.debug("Document creation validation passed");
                // Check if the document should be anonymous
                const isAnonymous = req.body.anonymous === true;
                this.logger.debug(`Anonymous flag: ${isAnonymous}`);
                
                this.dataManager.createDocument(req.body, req.userid, isAnonymous)
                    .then((document) => {
                        this.logger.debug(`Document created successfully: ${JSON.stringify(document)}`);
                        // Send to document owner and users with access
                        if (document._id) {
                            this.socketServer.sendEventToDocumentAccessors(req.socketID, document._id, "newDocument", {newDocument: document});
                        } else {
                            this.socketServer.sendEventToUser(req.socketID, req.userid, "newDocument", {newDocument: document});
                            this.socketServer.sendEventToAdmins(req.socketID, "newDocument", {newDocument: document})
                        }
                        this.logger.info(`New document created: ${JSON.stringify(document)}`);
                        res.status(200).json(document);
                    })
                    .catch((error) => {
                        this.logger.error(`Document creation failed: ${error.message || error}`, error);
                        res.status(500).json({error: error.message || "Document creation failed"});
                    });
            } else {
                this.logger.error("Document creation validation failed");
                res.status(400).json({
                    error: "Invalid document data",
                });
            }
        });

        this.expressApp.patch("/docs/update/:documentID", this.authenticate, (req, res) => {
            if (this.validator.getValidatedObject("documentUpdate", req.body) && req.params.documentID !== undefined) {
                this.dataManager.updateDocument(req.params.documentID as string, req.body, req.userid)
                    .then((numUpdated) => {
                        if (numUpdated > 0 && req.params.documentID !== undefined) {
                            req.body._id = req.params.documentID;
                            this.socketServer.sendEventToDocumentAccessors(req.socketID, req.params.documentID as string, "changedDocument", {changedDocument: req.body});
                            res.status(200).json({message: "Document updated successfully"});
                        } else {
                            res.status(404).json({error: "Document not found"});
                        }
                    })
                    .catch((error) => {
                        res.status(error).json({error: error});
                    });
            } else {
                res.status(404).json({error: "Invalid document data"});
            }
        });

        this.expressApp.delete("/docs/remove/:documentID", this.authenticate, (req, res) => {
            if (req.params.documentID !== undefined) {
                this.socketServer.sendEventToDocumentAccessors(req.socketID, req.params.documentID as string, "removedDocument", {removedID: req.params.documentID as string}).then(() => {
                    if (req.params.documentID !== undefined) {
                        this.dataManager.removeDocument(req.params.documentID as string, req.userid)
                            .then((numRemoved) => {
                                if (numRemoved > 0) {
                                    res.status(200).json({message: "Document removed successfully"});

                                    this.logger.info(`Document removed: ${req.params.documentID}`);
                                } else {
                                    res.status(404).json({error: "Document not found"});
                                }
                            })
                            .catch((error) => {
                                res.status(error).json({error: error});
                            });
                    }
                })
            }
        });

        // Structure endpoints with access control
        this.expressApp.get("/structures/list", this.authenticate, (req, res) => {
            this.dataManager.getStructures()
                .then((structures) => {
                    res.status(200).json(structures);
                })
                .catch((error) => {
                    res.status(500).json({error: error.message || error});
                });
        });

        this.expressApp.post("/structures/create", this.authenticate, (req, res) => {
            if (this.validator.getValidatedObject("structureCreation", req.body)) {
                this.dataManager.createStructure(req.body, req.userid)
                    .then((structure) => {
                        this.socketServer.sendEventToAllClients(req.socketID, "newStructure", {newStructure: structure});
                        this.logger.info("New structure created:", structure);
                        res.status(200).json(structure);
                    })
                    .catch((error) => {
                        if (error === "Only admins can create structures") {
                            res.status(401).json({error: error});
                        } else {
                            res.status(500).json({error: error.message || error});
                        }
                    });
            } else {
                res.status(400).json({error: "Invalid structure data"});
            }
        });

        this.expressApp.patch("/structures/update/:structureID", this.authenticate, (req, res) => {
            if (this.validator.getValidatedObject("structureUpdate", req.body) && req.params.structureID !== undefined) {
                const structureID = req.params.structureID;
                this.dataManager.updateStructure(structureID as string, req.body, req.userid)
                    .then((numUpdated) => {
                        if (numUpdated > 0) {
                            res.status(200).json({message: "Structure updated successfully"});
                            req.body._id = req.params.structureID;
                            this.socketServer.sendEventToAllClients(req.socketID, "changedStructure", {changedStructure: req.body});
                            this.logger.info("Structure updated:", req.body);
                        } else {
                            res.status(404).json({error: "Structure not found"});
                        }
                    })
                    .catch((error) => {
                        res.status(error).json({error: "Unauthorized access"});
                    });
            } else {
                res.status(400).json({error: "Invalid structure data"});
            }
        });

        this.expressApp.delete("/structures/remove/:structureID", this.authenticate, (req, res) => {
            const structureID = req.params.structureID;
            if (structureID !== undefined) {
                this.dataManager.removeStructure(structureID as string, req.userid)
                    .then((numRemoved) => {
                        if (numRemoved > 0) {
                            res.status(200).json({message: "Structure removed successfully"});
                            this.socketServer.sendEventToAllClients(req.socketID, "removedStructure", {removedID: structureID as string});
                            this.logger.info("Structure removed:", structureID);
                        } else {
                            res.status(404).json({error: "Structure not found"});
                        }
                    })
                    .catch((error) => {
                        res.status(error).json({error: error.message || error});
                    });
            }
        });

        this.expressApp.get("/version/check", (req, res) => {
            const updateResult = getCachedUpdateResult();
            if (updateResult) {
                res.status(200).json(updateResult);
            } else {
                res.status(503).json({error: "Update check not available yet"});
            }
        });

        // Database export endpoint
        this.expressApp.get("/database/export", this.authenticate, (req, res) => {
            this.dataManager.isAdmin(req.userid).then(async (isAdmin) => {
                if (!isAdmin) {
                    return res.status(403).json({error: "Only admins can export the database"});
                }

                let scope: DatabaseScope;
                let format: ExportFormat;

                try {
                    scope = parseDatabaseScope(req.query.scope);
                    format = parseExportFormat(req.query.format);
                } catch (error) {
                    return res.status(400).json({error: (error as Error).message});
                }

                try {
                    if (format === "json") {
                        if (scope === "all") {
                            const exportData = await this.dataManager.exportAllData();
                            res.setHeader("Content-Type", "application/json");
                            res.setHeader("Content-Disposition", 'attachment; filename="docpouch-database.json"');
                            return res.status(200).send(JSON.stringify(exportData, null, 2));
                        }

                        const scopedData = await this.dataManager.exportCollection(scope);
                        res.setHeader("Content-Type", "application/json");
                        res.setHeader("Content-Disposition", `attachment; filename="docpouch-${scope}.json"`);
                        return res.status(200).send(JSON.stringify(scopedData, null, 2));
                    }

                    if (scope !== "all") {
                        return res.status(400).json({error: "ZIP export supports only scope=all. Use format=json for scoped export."});
                    }

                    const zipFilename = `docpouch-database-${Date.now()}.zip`;
                    const output = fs.createWriteStream(zipFilename);
                    const archive = new ZipArchive({
                        zlib: {level: 9}
                    });

                    output.on('close', () => {
                        this.logger.info(`Database exported: ${archive.pointer()} total bytes`);
                        res.download(zipFilename, "docpouch-database.zip", (err) => {
                            if (err) {
                                this.logger.error("Error sending zip file:", err);
                            }
                            fs.unlink(zipFilename, (unlinkError) => {
                                if (unlinkError) {
                                    this.logger.error("Error deleting temporary zip file:", unlinkError);
                                }
                            });
                        });
                    });

                    archive.on('error', (err) => {
                        this.logger.error("Error creating zip archive:", err);
                        res.status(500).json({error: "Error creating zip archive"});
                    });

                    archive.pipe(output);
                    const exportData = await this.dataManager.exportAllData();
                    archive.append(JSON.stringify(exportData.users, null, 2), {name: 'docpouch-users.json'});
                    archive.append(JSON.stringify(exportData.documents, null, 2), {name: 'docpouch-documents.json'});
                    archive.append(JSON.stringify(exportData.structures, null, 2), {name: 'docpouch-structures.json'});
                    await archive.finalize();
                    return;
                } catch (error) {
                    this.logger.error("Error exporting database:", error);
                    return res.status(500).json({error: "Error exporting database"});
                }
            }).catch((error) => {
                this.logger.error("Error checking admin status:", error);
                res.status(500).json({error: "Error checking admin status"});
            });
        });

        // Database import endpoint
        this.expressApp.post("/database/import", this.authenticate, upload.single('file'), (req, res) => {
            this.dataManager.isAdmin(req.userid).then(async (isAdmin) => {
                if (!isAdmin) {
                    return res.status(403).json({error: "Only admins can import the database"});
                }

                if (!req.file) {
                    return res.status(400).json({error: "No file uploaded"});
                }

                const uploadedFile = req.file;

                try {
                    const scope = parseDatabaseScope(req.body.scope);
                    const mode = parseImportMode(req.body.mode);
                    const originalName = uploadedFile.originalname.toLowerCase();

                    if (originalName.endsWith('.json')) {
                        const rawContent = fs.readFileSync(uploadedFile.path, "utf8");
                        const parsed = JSON.parse(rawContent);

                        if (scope === "all") {
                            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                                fs.unlinkSync(uploadedFile.path);
                                return res.status(400).json({error: "Invalid JSON payload. Expected an object with one or more collections."});
                            }

                            await this.dataManager.importCollections(parsed as {
                                users?: any[];
                                documents?: any[];
                                structures?: any[];
                                types?: any[];
                            }, mode);

                            fs.unlinkSync(uploadedFile.path);
                            this.logger.info(`Database JSON import successful for scope=all, mode=${mode}`);
                            return res.status(200).json({message: "Database imported successfully"});
                        }

                        const scopedData = Array.isArray(parsed)
                            ? parsed
                            : (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as Record<string, unknown>)[scope])
                                ? (parsed as Record<string, any[]>)[scope]
                                : null);

                        if (!scopedData) {
                            fs.unlinkSync(uploadedFile.path);
                            return res.status(400).json({error: `Invalid JSON payload for scope '${scope}'. Expected an array or an object containing '${scope}'.`});
                        }

                        await this.dataManager.importCollections({[scope]: scopedData}, mode);
                        fs.unlinkSync(uploadedFile.path);
                        this.logger.info(`Database JSON import successful for scope=${scope}, mode=${mode}`);
                        return res.status(200).json({message: `${scope} imported successfully`});
                    }

                    if (!originalName.endsWith('.zip')) {
                        fs.unlinkSync(uploadedFile.path);
                        return res.status(400).json({error: "Uploaded file must be a JSON or ZIP file"});
                    }

                    if (scope !== "all") {
                        fs.unlinkSync(uploadedFile.path);
                        return res.status(400).json({error: "ZIP import supports only scope=all. Use JSON files for scoped import."});
                    }

                    const zip = new AdmZip(uploadedFile.path);
                    const zipEntries = zip.getEntries();

                    const collectionsData: any = {};
                    const collections: DatabaseCollection[] = ["users", "documents", "structures"];

                    for (const entry of zipEntries) {
                        const entryName = entry.name.toLowerCase();
                        for (const collection of collections) {
                            if (entryName.includes(collection)) {
                                const content = entry.getData().toString('utf8');
                                if (entryName.endsWith('.json')) {
                                    collectionsData[collection] = JSON.parse(content);
                                } else if (entryName.endsWith('.db')) {
                                    collectionsData[collection] = content.split('\n')
                                        .filter(line => line.trim().length > 0)
                                        .map(line => JSON.parse(line));
                                }
                            }
                        }
                    }

                    if (Object.keys(collectionsData).length === 0) {
                        fs.unlinkSync(uploadedFile.path);
                        return res.status(400).json({error: "ZIP file does not contain any valid database files (.json or .db)"});
                    }

                    await this.dataManager.importCollections(collectionsData, mode);
                    fs.unlinkSync(uploadedFile.path);

                    this.logger.info(`Database ZIP import successful, mode=${mode}`);
                    return res.status(200).json({message: "Database imported successfully"});
                } catch (error) {
                    if ((error as Error).message?.startsWith("Invalid scope")) {
                        if (fs.existsSync(uploadedFile.path)) {
                            fs.unlinkSync(uploadedFile.path);
                        }
                        return res.status(400).json({error: (error as Error).message});
                    }

                    this.logger.error("Error importing database:", error);

                    // Delete the uploaded file if it exists
                    if (fs.existsSync(uploadedFile.path)) {
                        fs.unlinkSync(uploadedFile.path);
                    }

                    res.status(500).json({error: "Error importing database"});
                }
            }).catch((error) => {
                this.logger.error("Error checking admin status:", error);

                // Delete the uploaded file if it exists
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }

                res.status(500).json({error: "Error checking admin status"});
            });
        });

        this.expressApp.use((req, res, next) => {
            // Skip for API routes that are already handled
            if (req.path.startsWith('/api') ||
                req.path.startsWith('/users') ||
                req.path.startsWith('/docs') ||
                req.path.startsWith('/types') ||
                req.path.startsWith('/structures') ||
                req.path.startsWith('/database') ||
                req.path.startsWith('/.well-known') ||
                req.path.startsWith('/oidc')) {
                return next();
            }

            // For all other routes, serve the index.html file
            res.sendFile(path.join(vuePath, 'index.html'));
        });


    }

    private authenticate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers['authorization'];
            if (!authHeader) {
                res.status(401).json({error: "No authorization header"});
                return;
            }

            const token = authHeader.split(' ')[1];
            if (!token) {
                res.status(401).json({error: "No token provided"});
                return;
            }

            // Try JWT token first (from /users/login)
            try {
                const payload = jwt.verify(token, JWTOptions.secret) as any;
                const user = await this.dataManager.getUserByID(payload.id);
                if (!user) {
                    res.status(401).json({error: "User not found"});
                    return;
                }
                req.userid = payload.id;
                if (req.headers['x-socket-id'])
                    req.socketID = req.headers['x-socket-id'] as string;
                return next();
            } catch (jwtError) {
                // JWT verification failed, try OIDC token
            }

            // Try OIDC access token (from OIDC flow)
            try {
                // Use oidc-provider's AccessToken.find to validate
                const accessToken = await this.oidcProvider.AccessToken.find(token);

                if (accessToken && accessToken.accountId) {
                    req.userid = accessToken.accountId;
                    if (req.headers['x-socket-id'])
                        req.socketID = req.headers['x-socket-id'] as string;
                    return next();
                }
            } catch (oidcError) {
                // OIDC token validation failed, fall through to 401
            }

            // Both methods failed
            res.status(401).json({error: "Invalid token"});
            return;

        } catch (error) {
            res.status(500).json({error: "Authentication error"});
            return;
        }
    };

}
