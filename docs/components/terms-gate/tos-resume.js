/* docs/components/terms-gate/tos-resume.js
 *
 * If backend redirects user to:
 *   https://haiphen.io/#services?tos=required&tos_version=...&resume=...
 * then this auto-opens the Terms Gate modal and resumes checkout after acceptance.
 */
(function () {
  "use strict";

  const LOG = "[tos-resume]";

  function parseParams() {
    // supports both querystring and hash query (? inside hash)
    const url = new URL(window.location.href);

    const out = new URLSearchParams(url.search);

    // if hash has query like #services?tos=required&...
    const hash = url.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex >= 0) {
      const qs = hash.slice(qIndex + 1);
      for (const [k, v] of new URLSearchParams(qs).entries()) {
        out.set(k, v);
      }
    }

    return out;
  }

  function safeResume(raw) {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:") return null;
      const h = u.hostname.toLowerCase();
      if (h === "checkout.haiphen.io" || h.endsWith(".haiphen.io")) return u.toString();
    } catch {}
    return null;
  }

  async function run() {
    const p = parseParams();
    const tos = (p.get("tos") || "").trim();
    if (tos !== "required") return;

    const tosVersion = (p.get("tos_version") || "sla_v0.2_2026-01-22").trim();
    const resume = safeResume(p.get("resume"));

    if (!resume) {
      console.warn(`${LOG} missing/invalid resume url`);
      return;
    }

    // Ensure TermsGate is available
    if (!window.HaiphenTermsGate || typeof window.HaiphenTermsGate.open !== "function") {
      console.warn(`${LOG} TermsGate not loaded`);
      return;
    }

    console.log(`${LOG} opening terms gate`, { tosVersion });

    // We need a "resume mode". Easiest: store resume in localStorage for onContinue().
    try {
      localStorage.setItem("haiphen.tos.resume_url", resume);
      localStorage.setItem("haiphen.tos.resume_version", tosVersion);
    } catch {}

    await window.HaiphenTermsGate.open({
      tosVersion,
      // priceId/plan not needed; we resume server-side
      priceId: "resume",
      plan: "resume",
      checkoutOrigin: "https://checkout.haiphen.io",
      contentUrl: "/components/terms-gate/terms-content.html",
      resumeUrl: resume, // requires tiny change in terms-gate.js (below)
    });
  }

  // run once DOM is ready-ish
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void run());
  } else {
    void run();
  }
})();