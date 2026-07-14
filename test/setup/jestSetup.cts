process.env.NODE_ENV = 'test';

// Increase timeout for all tests
jest.setTimeout(30000);

// Silence console logs during tests to keep output clean
// Comment these out if you need to debug tests
global.console.log = jest.fn();
global.console.info = jest.fn();
global.console.warn = jest.fn();
// Keep error logs for debugging
// global.console.error = jest.fn();

// Add custom matchers if needed
expect.extend({
    // Example custom matcher
    toBeWithinRange(received, floor, ceiling) {
        const pass = received >= floor && received <= ceiling;
        if (pass) {
            return {
                message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
                pass: false,
            };
        }
    },
});

// Global afterAll hook to ensure all tests clean up properly
afterAll(async () => {
    // Add any global cleanup here if needed
    await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay to ensure all async operations complete
});