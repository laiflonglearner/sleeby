module.exports = {
  preset: 'jest-expo',
  maxWorkers: 1,
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
  // The shared packages import their own .ts files with .js specifiers.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};
