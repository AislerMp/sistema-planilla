const base = {
  testEnvironment: "node",
  transform: {},
  testTimeout: 10000,
  setupFiles: ["<rootDir>/test/setup/environment.js"],
  setupFilesAfterEnv: ["<rootDir>/test/setup/database.js"],
};

export default {
  projects: [
    {
      ...base,
      displayName: "servidor-unitarias",
      testMatch: ["<rootDir>/test/**/*.unit.test.js"],
    },
    {
      ...base,
      displayName: "servidor-integracion",
      testMatch: ["<rootDir>/test/**/*.integration.test.js"],
    },
  ],
  collectCoverage: false,
  coverageReporters: [],
};
