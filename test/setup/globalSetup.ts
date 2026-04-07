import {exec, spawn} from 'child_process';
import {promisify} from 'util';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

async function waitForServer(url, timeout = 30000) {
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
    process.env.PORT = '3030';
    process.env.MEMORY_ONLY = 'true';

    await execAsync('npm run build:backend', {cwd: projectRoot});

    const serverPath = path.join(projectRoot, 'dist/srv/main.js');
    const serverProcess = spawn('node', [serverPath], {
        cwd: projectRoot,
        env: {
            ...process.env,
            PORT: '3030',
            MEMORY_ONLY: 'true'
        },
        stdio: 'inherit'
    });

    globalThis.__SERVER_PID__ = serverProcess.pid;

    await waitForServer('http://localhost:3030');
    console.log('Server started successfully');
}
