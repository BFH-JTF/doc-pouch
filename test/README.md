# DocPouch Automated Tests

This directory contains automated tests for the DocPouch server endpoints, including both HTTP REST API and WebSocket
events.

## Test Structure

The tests are organized into the following directories:

- `setup/`: Contains test setup files and utilities
- `http/`: Contains tests for HTTP REST API endpoints
- `websocket/`: Contains tests for WebSocket events
- `integration/`: Reserved for future integration tests

## Test Setup

The test setup is defined in `setup/testSetup.ts` and includes:

- Setting up a test server instance
- Creating test users (admin and regular user)
- Providing utility functions for test cleanup
- Defining constants for API and WebSocket URLs

Global Jest configuration is in `setup/jestSetup.ts`.

## HTTP Endpoint Tests

HTTP endpoint tests verify the functionality of the REST API endpoints defined in the OpenAPI specification (
`docpouch_openAPI.yaml`). These tests are organized by endpoint category:

- `users.test.ts`: Tests for user management endpoints
- `documents.test.ts`: Tests for document management endpoints
- `structures.test.ts`: Tests for data structure endpoints

Each test file covers:

- Creating resources
- Listing resources
- Updating resources
- Removing resources
- Access control (admin vs. regular user permissions)
- Error handling

## WebSocket Event Tests

WebSocket event tests verify the real-time event functionality defined in the Socket.io API documentation (
`docs/socketIoApi.md`). These tests are organized by event category:

- `document.events.test.ts`: Tests for document-related events
- `user.events.test.ts`: Tests for user-related events
- `structure.events.test.ts`: Tests for structure-related events

Each test file covers:

- Event emission when resources are created
- Event emission when resources are updated
- Event emission when resources are deleted
- Event distribution based on access control rules

## Running the Tests

To run the tests, you need to have Node.js and npm installed. Then, you can use the following commands:

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test categories
npm run test:http        # Run HTTP endpoint tests
npm run test:websocket   # Run WebSocket event tests
npm run test:integration # Run integration tests (future use)

# Run tests in watch mode (useful during development)
npm run test:watch
```

## Test Environment

The tests run against an isolated test server instance with its own in-memory database. This ensures that tests don't
interfere with each other and don't modify any production data.

Key aspects of the test environment:

- Tests run on port 3031 (different from the default server port)
- Test database is stored in `db/test/`
- Test logs are written to `log/test.log`

## Adding New Tests

When adding new tests:

1. Follow the existing patterns for HTTP or WebSocket tests
2. Use the utility functions in `setup/testSetup.ts`
3. Ensure proper cleanup in `afterEach` and `afterAll` blocks
4. Test both happy paths and error cases
5. Verify access control rules

## Test Coverage

The tests cover:

- All HTTP endpoints defined in the OpenAPI specification
- All WebSocket events defined in the Socket.io API documentation
- Different user roles (admin and regular user)
- Access control rules
- Error handling

## Future Improvements

Potential future improvements to the test suite:

1. Add integration tests that combine HTTP and WebSocket functionality
2. Add performance tests for high-load scenarios
3. Add tests for edge cases and rare error conditions
4. Add tests for database import/export functionality
