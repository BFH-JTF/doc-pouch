import {exec, spawn} from 'child_process';
import {promisify} from 'util';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

async function waitForServer(url: string, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            await new Promise<void>((resolve, reject) => {
                http.get(url, (res) => resolve()).on('error', reject);
            });
            return true;
        } catch {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    throw new Error(`Server did not start within ${timeout}ms`);
}

export default async function globalSetup() {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3030';
    process.env.MEMORY_ONLY = 'true';
    process.env.OIDC_ISSUER = process.env.OIDC_ISSUER || 'http://localhost:3030/oidc';
    process.env.OIDC_COOKIE_KEY = process.env.OIDC_COOKIE_KEY || 'docpouch-test-cookie-secret';

    // Optional: run the full suite against the MongoDB backend by starting
    // an in-memory MongoDB instance here and pointing both the spawned
    // server and the test workers at it (TEST_STORAGE_BACKEND=mongodb).
    let mongodUri: string | undefined;
    if ((process.env.TEST_STORAGE_BACKEND || '').toLowerCase() === 'mongodb') {
        const {MongoMemoryServer} = await import('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        mongodUri = mongod.getUri('docpouch_test');
        process.env.MONGODB_URI = mongodUri;
        (globalThis as any).__MONGOD__ = mongod;
        console.log(`In-memory MongoDB started at ${mongodUri}`);
    }

    await execAsync('npm run build:backend', {cwd: projectRoot});
    await execAsync('npm run build:frontend', {cwd: projectRoot});

    const serverPath = path.join(projectRoot, 'dist/srv/main.js');
    const serverEnv: Record<string, string | undefined> = {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3030',
        MEMORY_ONLY: 'true',
        OIDC_ISSUER: process.env.OIDC_ISSUER,
        OIDC_COOKIE_KEY: process.env.OIDC_COOKIE_KEY
    };
    if (mongodUri) {
        serverEnv.STORAGE_BACKEND = 'mongodb';
        serverEnv.MONGODB_URI = mongodUri;
        serverEnv.MONGODB_DB = 'docpouch_test';
    }
    const serverProcess = spawn('node', [serverPath], {
        cwd: projectRoot,
        env: serverEnv,
        stdio: 'inherit'
    });

    globalThis.__SERVER_PID__ = serverProcess.pid;

    await waitForServer('http://localhost:3030');
    console.log('Server started successfully');
}
