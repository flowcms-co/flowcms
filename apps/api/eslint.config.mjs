import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
    globalIgnores(["dist/**", "storage/**"]),
    ...tseslint.configs.recommended,
    {
        rules: {
            // Leading-underscore names mark a deliberately unused argument or binding.
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
        },
    },
    {
        // ponytail: these files read untyped third-party JSON (Google, SEO and keyword
        // providers), where `any` is the honest type today. Typing those payloads is
        // the upgrade path; the rule stays an error everywhere else.
        files: ["src/seo/seo.service.ts", "src/seo/seo.controller.ts", "src/analytics/analytics.service.ts"],
        rules: { "@typescript-eslint/no-explicit-any": "off" },
    },
]);
