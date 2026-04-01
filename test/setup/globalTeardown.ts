declare global {
    var __SERVER_PID__: number | undefined;
}

export default async function globalTeardown() {
    if (global.__SERVER_PID__) {
        try {
            process.kill(global.__SERVER_PID__, 'SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            console.log('Server stopped successfully');
        } catch (err) {
            console.error(`Failed to kill server process ${global.__SERVER_PID__}:`, err);
        }
    }
}
