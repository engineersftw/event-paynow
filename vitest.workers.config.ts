import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
  test: {
    name: "workers",
    include: ["test/workers/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          compatibilityDate: "2024-12-05",
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            TELEGRAM_BOT_TOKEN: "test-secret-token",
          },
        },
      },
    },
  },
});
