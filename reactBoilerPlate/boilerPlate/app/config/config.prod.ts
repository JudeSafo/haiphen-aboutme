/**
 * These are configuration settings for the production environment.
 *
 * Do not include API secrets in this file or anywhere in your JS.
 *
 * https://reactnative.dev/docs/security#storing-sensitive-info
 */
export default {
  ORCH_URL: "https://orchestrator.haiphen.io",
  HMAC_SECRET: "0d5d14c8758a296ea778347d89196549c9f261d6a1bce80b5165cfe40c55ee4b", // plan to inject at build time (EAS secrets, etc.)
  DEFAULT_LABELS: ["lan", "mobile"],
}
