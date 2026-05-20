import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Calling async data-fetching helpers (fetchXxx, loadXxx) inside useEffect
      // is an established pattern across this codebase and does not cause bugs.
      // The rule fires because the helpers call setState internally, but the
      // effect dependencies are correctly managed.
      "react-hooks/set-state-in-effect": "off",

      // window.location.href assignment is intentional (hard-navigation after
      // auth cookie is set so middleware re-reads the updated JWT).
      "react-hooks/immutability": "off",

      // <img> is intentional in components that handle third-party image URLs
      // where next/image's domain whitelist cannot be pre-configured.
      "@next/next/no-img-element": "off",

      // Allow variables/parameters prefixed with _ to be unused.
      // This is a common convention for intentionally-unused destructured values
      // and required parameters that must be declared (e.g. Next.js route handlers).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "vars": "all",
          "args": "all",
          "ignoreRestSiblings": true,
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
