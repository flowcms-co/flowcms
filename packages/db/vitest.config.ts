import { defineConfig } from "vitest/config";

// Integration specs that require a live Postgres (set RUN_DB_TESTS=1 + DATABASE_URL).
// They self-skip when RUN_DB_TESTS is unset, so the default unit run stays offline.
export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["prisma/**/*.spec.ts"],
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
