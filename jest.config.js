module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  setupFilesAfterEnv: ["<rootDir>/setup-tests.ts"],
  // Build-time flag set by webpack's DefinePlugin (see src/globals.d.ts)
  globals: {
    __HFGS_DEV__: true,
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/coverage/"],
};
