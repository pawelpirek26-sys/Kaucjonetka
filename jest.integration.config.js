// Integration tests talk to a real (local) Supabase, so they run in plain Node with the
// native fetch instead of the jest-expo preset (which installs React Native polyfills).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  transform: { '\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  globalSetup: '<rootDir>/tests/jest.global-setup.js',
};
