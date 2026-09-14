declare global {
    var __SERVER_PID__: number | undefined;
    var __MONGOD__: {stop: () => Promise<void>} | undefined;
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
    if (global.__MONGOD__) {
        try {
            await global.__MONGOD__.stop();
            console.log('In-memory MongoDB stopped');
        } catch (err) {
            console.error('Failed to stop in-memory MongoDB:', err);
        }
    }
}
