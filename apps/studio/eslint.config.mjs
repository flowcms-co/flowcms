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
      // eslint-plugin-react-hooks v7 promotes this to "error" in its recommended
      // preset (which eslint-config-next pulls in). Our synchronous setState in an
      // effect is intentional in a few hooks (hydration-safe init, reset-before-
      // fetch), so keep it visible as a warning rather than a hard failure.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
