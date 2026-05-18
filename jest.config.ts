import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/server"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@server/(.*)$": "<rootDir>/src/server/$1",
    "^@client/(.*)$": "<rootDir>/src/client/$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        moduleResolution: "node",
      },
    }],
  },
  collectCoverageFrom: [
    "src/lib/services/**/*.ts",
    "src/lib/repositories/**/*.ts",
    "!src/**/*.d.ts",
  ],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
  setupFilesAfterEnv: [],
};

export default config;
