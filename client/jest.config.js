export default {
  displayName: "cliente-unitarias",
  testEnvironment: "node",
  transform: {},
  testTimeout: 10000,
  testMatch: ["<rootDir>/test/**/*.unit.test.js"],
  moduleNameMapper: { "\\.css$": "<rootDir>/test/setup/styleMock.js" },
  collectCoverage: false,
  coverageReporters: [],
};
