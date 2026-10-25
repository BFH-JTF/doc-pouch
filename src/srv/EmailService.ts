import nodemailer from "nodemailer";
import type {Transporter} from "nodemailer";
import winston from "winston";

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
}

export interface EmailDeliveryResult {
    sent: boolean;
    message: string;
}

/**
 * #114: whether generated passwords may be returned in API/MCP responses
 * when email delivery is unavailable. Off by default — the fallback is an
 * explicit operator opt-in (PASSWORD_IN_RESPONSE=true).
 */
export function passwordInResponseAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.PASSWORD_IN_RESPONSE === 'true';
}

export default class EmailService {
    private transporter: Transporter | null = null;
    private readonly fromAddress: string;
    private readonly configured: boolean;
    private readonly logger: winston.Logger;
    private readonly baseUrl: string;

    constructor(smtpConfig: SmtpConfig | null, logger: winston.Logger, baseUrl: string, options: {suppressWarning?: boolean} = {}) {
        this.logger = logger;
        this.baseUrl = baseUrl;
        this.fromAddress = smtpConfig?.from || "DocPouch <noreply@localhost>";

        if (smtpConfig && smtpConfig.host) {
            this.transporter = nodemailer.createTransport({
                host: smtpConfig.host,
                port: smtpConfig.port || 587,
                secure: smtpConfig.secure || false,
                auth: smtpConfig.user ? {
                    user: smtpConfig.user,
                    pass: smtpConfig.pass,
                } : undefined,
            });
            this.configured = true;
            this.logger.info(`EmailService configured: SMTP ${smtpConfig.host}:${smtpConfig.port}, from=${this.fromAddress}`);
        } else {
            this.configured = false;
            if (!options.suppressWarning) {
                this.logger.warn("EmailService: SMTP not configured. Email delivery is disabled. Generated passwords are NOT returned in API responses unless PASSWORD_IN_RESPONSE=true is set.");
            }
        }
    }

    isConfigured(): boolean {
        return this.configured;
    }

    /**
     * Builds the reset-password link from the trusted, configured base URL
     * (#110). The reset token must be the raw token value; callers must
     * never pass a complete URL here (older call sites did, producing
     * doubly-concatenated, unusable links).
     */
    buildResetUrl(resetToken: string): string {
        return `${this.baseUrl}/reset-password?token=${resetToken}`;
    }

    async sendWelcomeEmail(to: string, username: string, password: string): Promise<EmailDeliveryResult> {
        if (!this.configured || !this.transporter) {
            return {sent: false, message: "SMTP not configured"};
        }

        const subject = "Your DocPouch Account Has Been Created";
        const text = [
            `Hello ${username},`,
            "",
            "A DocPouch account has been created for you.",
            "",
            `Username: ${username}`,
            `Password: ${password}`,
            "",
            `You can log in at: ${this.baseUrl}`,
            "",
            "Please change your password after your first login.",
            "",
            "Best regards,",
            "DocPouch",
        ].join("\r\n");

        return this.sendEmail(to, subject, text);
    }

    async sendPasswordResetEmail(to: string, username: string, newPassword: string): Promise<EmailDeliveryResult> {
        if (!this.configured || !this.transporter) {
            return {sent: false, message: "SMTP not configured"};
        }

        const subject = "Your DocPouch Password Has Been Reset";
        const text = [
            `Hello ${username},`,
            "",
            "Your password has been reset by an administrator.",
            "",
            `New password: ${newPassword}`,
            "",
            `You can log in at: ${this.baseUrl}`,
            "",
            "Please change your password after your next login.",
            "",
            "Best regards,",
            "DocPouch",
        ].join("\r\n");

        return this.sendEmail(to, subject, text);
    }

    async sendForgotPasswordEmail(to: string, username: string, resetToken: string): Promise<EmailDeliveryResult> {
        if (!this.configured || !this.transporter) {
            return {sent: false, message: "SMTP not configured"};
        }

        const resetUrl = this.buildResetUrl(resetToken);
        const subject = "Reset Your DocPouch Password";
        const text = [
            `Hello ${username},`,
            "",
            "A password reset was requested for your DocPouch account.",
            "",
            `Click the link below to set a new password:`,
            resetUrl,
            "",
            "This link will expire in 1 hour.",
            "",
            "If you did not request this, you can safely ignore this email.",
            "",
            "Best regards,",
            "DocPouch",
        ].join("\r\n");

        return this.sendEmail(to, subject, text);
    }

    private async sendEmail(to: string, subject: string, text: string): Promise<EmailDeliveryResult> {
        try {
            const result = await this.transporter!.sendMail({
                from: this.fromAddress,
                to,
                subject,
                text,
            });
            this.logger.info(`Email sent to ${to}: ${result.messageId}`);
            return {sent: true, message: `Password sent to ${to}`};
        } catch (error: any) {
            this.logger.error(`Failed to send email to ${to}: ${error.message}`);
            return {sent: false, message: `Email delivery failed: ${error.message}`};
        }
    }
}