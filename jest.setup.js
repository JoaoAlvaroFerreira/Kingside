// Jest setup file for global test configuration
// Add any global test setup here

// React Native global — defined by Metro in production but not in Jest's Node environment
global.__DEV__ = true;

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };
