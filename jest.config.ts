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
    "src/server/services/**/*.ts",
    "src/server/lib/errors.ts",
    "src/server/lib/utils.ts",
    // Exclude video pipeline services — require FFmpeg/S3/Polly that need integration env
    "!src/server/services/frame-extractor.service.ts",
    "!src/server/services/frame-transformer.service.ts",
    "!src/server/services/narration.service.ts",
    "!src/server/services/video-assembler.service.ts",
    "!src/server/services/video-job.service.ts",
    // Exclude AWS-heavy services tested via integration tests or requiring live platform credentials
    "!src/server/services/credential.service.ts",
    // Exclude prompt translator (tested indirectly via image generation)
    "!src/server/services/promptTranslator.ts",
    // Exclude large platform integration services (tested via paid-traffic.integration.test.ts)
    "!src/server/services/ab-test.service.ts",
    "!src/server/services/automation-rules.service.ts",
    "!src/server/services/budget-intelligence.service.ts",
    "!src/server/services/campaign.service.ts",
    "!src/server/services/performance-monitor.service.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts",
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 60,
      statements: 80,
    },
  },
  setupFilesAfterEnv: [],
};

export default config;
