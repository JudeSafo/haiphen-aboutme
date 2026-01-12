/* docs/components/services-plans/services-plans.js
 * Services pricing/subscription UI.
 *
 * Behavior:
 * - If NOT logged in: redirect to auth login.
 * - If logged in AND entitled for services: do NOT send to checkout; route to services content.
 * - If logged in AND NOT entitled: route to Stripe checkout.
 *
 * Notes:
 * - Square has been removed entirely.
 * - Entitlement is checked via https://api.haiphen.io/v1/me (cookie-auth).
 */
(function () {
  'use strict';

  const LOG = '[services-plans]';

  const API_ORIGIN = 'https://api.haiphen.io';
  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  // ✅ Stripe hosted link (for now)
  // Later, consider: POST /v1/billing/checkout { planKey, return_to } => session.url
  const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/28E28saW7f1Cead9PpaAw03';

  // Where to send entitled users when they click “Subscribe”.
  // Pick something real in your site (a section id or route).
  const SERVICES_DESTINATION_HASH = '#services';

  const STORAGE = {
    selectedPlan: 'haiphen.checkout.selected_plan',
    returnTo: 'haiphen.checkout.return_to',
  };

  function qs(id) { return document.getElementById(id); }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function redirectToLogin(returnTo) {
    const rt = encodeURIComponent(returnTo || window.location.href);
    // Align with your site’s preferred param. If auth supports `next=` or `to=`, pick one.
    window.location.assign(`${AUTH_ORIGIN}/login?to=${rt}`);
  }

  async function goToCanonicalCheckout({ planKey, priceId, tosVersion, checkoutOrigin }) {
    // Fallback mapping only when priceId isn't provided by the HTML.
    const PRICE_BY_PLAN = {
      signals_starter: "price_1SmGzEJRL3AYFpZZIjsqhB1T",
      fintech_pro: "price_1SmGzEJRL3AYFpZZIjsqhB1T",
      enterprise_custom: "price_1SmGzEJRL3AYFpZZIjsqhB1T",
      hardtech_starter: "price_1SmGzEJRL3AYFpZZIjsqhB1T",
      hardtech_pro: "price_1SmGzEJRL3AYFpZZIjsqhB1T",
      hardtech_enterprise: "price_1SmGzEJRL3AYFpZZIjsqhB1T",
    };

    const resolvedPlanKey = String(planKey || "").trim();
    const resolvedPriceId = String(priceId || "").trim() || PRICE_BY_PLAN[resolvedPlanKey];

    if (!resolvedPlanKey) {
      alert("Missing plan key for checkout.");
      return;
    }
    if (!resolvedPriceId) {
      alert("Missing Stripe priceId (no data-checkout-price-id and no local mapping).");
      return;
    }

    const resolvedTosVersion = String(tosVersion || "sla_v0.1_2026-01-10").trim();
    const resolvedCheckoutOrigin = String(checkoutOrigin || "https://checkout.haiphen.io").trim();

    // Prefer the official API exposed by checkout-router.js
    const start = window?.HAIPHEN?.startCheckout;
    if (typeof start === "function") {
      await start({
        priceId: resolvedPriceId,
        plan: resolvedPlanKey,
        tosVersion: resolvedTosVersion,
        checkoutOrigin: resolvedCheckoutOrigin,
      });
      return;
    }

    // Fallback: if terms gate exists but router API not loaded
    if (window.HaiphenTermsGate?.open) {
      await window.HaiphenTermsGate.open({
        priceId: resolvedPriceId,
        plan: resolvedPlanKey,
        tosVersion: resolvedTosVersion,
        checkoutOrigin: resolvedCheckoutOrigin,
        contentUrl: "components/terms-gate/terms-content.html",
      });
      return;
    }

    alert("Checkout components not loaded (terms gate / checkout router).");
  }

  function routeEntitledUser() {
    // If you have a better deep-link (e.g. #services:dashboard), use it.
    if (typeof window.showSection === 'function') window.showSection('Services');
    else window.location.hash = SERVICES_DESTINATION_HASH;
  }

  async function getEntitlements() {
    // Cookie-auth to API
    const url = `${API_ORIGIN}/v1/me`;
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });

    if (!resp.ok) {
      return { ok: false, status: resp.status, entitlements: null };
    }

    const data = await resp.json().catch(() => null);
    return { ok: true, status: 200, entitlements: data?.entitlements ?? null };
  }

  function hasServicesEntitlement(entitlements) {
    // Expected shape:
    // entitlements: { active: boolean, features: { services: boolean, ... } }
    return Boolean(entitlements?.active && entitlements?.features?.services);
  }

  async function handleSubscribe(optsOrPlanKey) {
    // Support both:
    //   handleSubscribe("fintech_pro")                      (legacy)
    //   handleSubscribe({ planKey, priceId, tosVersion, checkoutOrigin }) (new)
    const opts =
      typeof optsOrPlanKey === "string"
        ? { planKey: optsOrPlanKey }
        : (optsOrPlanKey || {});

    const planKey = String(opts.planKey || "").trim();
    const priceId = String(opts.priceId || "").trim();
    const tosVersion = String(opts.tosVersion || "sla_v0.1_2026-01-10").trim();
    const checkoutOrigin = String(opts.checkoutOrigin || "https://checkout.haiphen.io").trim();

    // If you already have a global gate object, let it run first (optional).
    async function isLoggedInViaAuthCookie() {
      try {
        const r = await fetch(`${AUTH_ORIGIN}/me`, { credentials: "include", cache: "no-store" });
        return r.ok;
      } catch {
        return false;
      }
    }

    // Canonical check via API
    const me = await getEntitlements();

    // Not logged in (401/403): send to auth
    if (!me.ok && (me.status === 401 || me.status === 403)) {
      redirectToLogin(window.location.href);
      return;
    }

    // Logged in but some other failure: be conservative, don’t redirect blindly
    if (!me.ok) {
      console.warn(`${LOG} /v1/me failed`, me.status);
      alert("Unable to verify your subscription right now. Please refresh and try again.");
      return;
    }

    const entitled = hasServicesEntitlement(me.entitlements);

    if (entitled) {
      routeEntitledUser();
      return;
    }

    // Not entitled → route to checkout.
    // ✅ Prefer passed priceId (from HTML), fallback to mapping in goToCanonicalCheckout().
    await goToCanonicalCheckout({
      planKey,
      priceId,
      tosVersion,
      checkoutOrigin,
    });
  }

  function handleContact() {
    if (typeof window.showSection === 'function') window.showSection('Contact');
    else window.location.hash = '#contact';
  }

  function wire(root) {
    root.addEventListener('click', async (e) => {
      // Prefer explicit checkout buttons (new style)
      const checkoutBtn = e.target.closest('[data-checkout-price-id]');
      if (checkoutBtn) {
        const priceId = (checkoutBtn.getAttribute('data-checkout-price-id') || '').trim();
        if (!priceId) return;

        const plan =
          (checkoutBtn.getAttribute('data-plan') || '').trim() ||
          (checkoutBtn.closest('.plan')?.getAttribute('data-plan') || '').trim();

        const tosVersion = (checkoutBtn.getAttribute('data-tos-version') || 'sla_v0.1_2026-01-10').trim();
        const checkoutOrigin = (checkoutBtn.getAttribute('data-checkout-origin') || 'https://checkout.haiphen.io').trim();

        await handleSubscribe({
          planKey: plan || '',
          priceId,
          tosVersion,
          checkoutOrigin,
        });
        return;
      }

      // Legacy handler (old style)
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const card = btn.closest('.plan');
      const planKey = card?.getAttribute('data-plan') || '';

      if (action === 'subscribe') {
        await handleSubscribe({
          planKey,
          // legacy buttons don't carry these, so we default:
          tosVersion: "sla_v0.1_2026-01-10",
          checkoutOrigin: "https://checkout.haiphen.io",
        });
        return;
      }
    });
  }

  async function mountBlock({ mountId, htmlUrl }) {
    const mount = qs(mountId);
    if (!mount) return;

    if (mount.querySelector('.services-plans')) return;

    const html = await fetchText(htmlUrl);
    mount.innerHTML = html;
    wire(mount);
  }

  async function loadServicesPlans() {
    await injectCssOnce('components/services-plans/services-plans.css');

    await mountBlock({
      mountId: 'services-plans-mount',
      htmlUrl: 'components/services-plans/services-plans.html',
    });

    await mountBlock({
      mountId: 'services-hardtech-mount',
      htmlUrl: 'components/services-plans/services-hardtech.html',
    });
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadServicesPlans = loadServicesPlans;
})();