export default {
    preset: 'ts-jest',
    testEnvironment: 'node',

    // Treat TS files as ESM for Jest runtime
    extensionsToTreatAsEsm: ['.ts', '.tsx'],

    transform: {
        // move ts-jest options here (no globals deprecation warning)
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: './tsconfig.test.json',
            },
        ],
        '^.+\\.(js|jsx)$': 'babel-jest',
    },

    // Transform specific ESM node_modules packages.
    // Include docpouch-client and socket.io-client (add others if needed).
    transformIgnorePatterns: ['/node_modules/(?!(docpouch-client|socket.io-client)/)'],

    // Allow relative TS imports written with ".js" suffix
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^docpouch-client$': '<rootDir>/test/mocks/docpouch-client.js'
    },


    testMatch: ['**/test/**/*.test.ts'],
    verbose: true,
    forceExit: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
    setupFilesAfterEnv: ['<rootDir>/test/setup/jestSetup.cts'],
    globalSetup: '<rootDir>/test/setup/globalSetup.ts',
    globalTeardown: '<rootDir>/test/setup/globalTeardown.ts',
};