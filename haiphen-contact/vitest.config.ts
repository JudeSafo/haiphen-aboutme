import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Stub external service bindings that aren't available in test
          serviceBindings: {
            SVC_API: () => new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json" },
            }),
          },
        },
      },
    },
  },
});
