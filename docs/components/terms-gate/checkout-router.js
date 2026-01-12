/* global window, document */
(function () {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});

  const DEFAULTS = {
    checkoutOrigin: "https://checkout.haiphen.io",
    tosVersion: "sla_v0.1_2026-01-10",
    contentUrl: "components/terms-gate/terms-content.html",
  };

  let inFlight = false;

  function warn(...args) {
    console.warn("[checkout-router]", ...args);
  }

  async function openGate({ priceId, plan, tosVersion, checkoutOrigin }) {
    if (!window.HaiphenTermsGate || typeof window.HaiphenTermsGate.open !== "function") {
      warn("HaiphenTermsGate not loaded. Did you include terms-gate script?");
      throw new Error("Terms gate unavailable");
    }
    await window.HaiphenTermsGate.open({
      priceId,
      plan,
      tosVersion,
      contentUrl: DEFAULTS.contentUrl,
      checkoutOrigin,
    });
  }

  async function handleCheckoutClick(btn) {
    const priceId = (btn.getAttribute("data-checkout-price-id") || "").trim();
    if (!priceId) return;

    const plan = (btn.getAttribute("data-plan") || "pro").trim();
    const tosVersion = (btn.getAttribute("data-tos-version") || DEFAULTS.tosVersion).trim();
    const checkoutOrigin = (btn.getAttribute("data-checkout-origin") || DEFAULTS.checkoutOrigin).trim();

    if (inFlight) return;
    inFlight = true;

    try {
      await openGate({ priceId, plan, tosVersion, checkoutOrigin });
    } finally {
      inFlight = false;
    }
  }

  // Public API (optional, for programmatic calls)
  NS.startCheckout = async function startCheckout(opts) {
    const priceId = String(opts?.priceId ?? "").trim();
    if (!priceId) throw new Error("startCheckout missing priceId");

    await openGate({
      priceId,
      plan: String(opts?.plan ?? "pro").trim(),
      tosVersion: String(opts?.tosVersion ?? DEFAULTS.tosVersion).trim(),
      checkoutOrigin: String(opts?.checkoutOrigin ?? DEFAULTS.checkoutOrigin).trim(),
    });
  };

  // Intentionally no global click handler:
  // all checkout initiation should be routed through window.HAIPHEN.startCheckout(...)
  // so we don't double-trigger flows (services-plans also wires buttons).
})();