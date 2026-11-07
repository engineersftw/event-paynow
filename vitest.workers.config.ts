import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // Run bindings in-process with per-test storage snapshots (the classic
      // vitest-pool-workers isolation model); remote bindings persist across
      // tests in a file and break the seeded-fixture tests.
      remoteBindings: false,
      miniflare: {
        compatibilityDate: "2024-12-05",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          TELEGRAM_BOT_TOKEN: "test-secret-token",
        },
      },
    }),
  ],
  test: {
    name: "workers",
    include: ["test/workers/**/*.test.ts"],
  },
});
