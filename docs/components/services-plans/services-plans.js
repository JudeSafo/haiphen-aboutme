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

  function goToStripeCheckout(planKey) {
    try {
      if (planKey) sessionStorage.setItem(STORAGE.selectedPlan, String(planKey));
      sessionStorage.setItem(STORAGE.returnTo, window.location.href);
    } catch {}
    window.location.assign(STRIPE_CHECKOUT_URL);
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

  async function handleSubscribe(planKey) {
    // If you already have a global gate object, let it run first (optional).
    // This makes the site consistent if EntitlementGate also handles login redirects.
    const gate = window?.HAIPHEN?.EntitlementGate?.requireEntitlement;
    if (typeof gate === 'function') {
      // Gate checks entitlement for “services” and handles login redirects.
      // If user is entitled, it should return ok:true, entitled:true (depending on your impl).
      // We still fall back to /v1/me below to avoid stale local state.
      try {
        const gateRes = await gate('services', { returnTo: window.location.href });
        // If gate explicitly says “not logged in / not ok”, stop.
        if (gateRes && gateRes.ok === false) return;
      } catch (e) {
        console.warn(`${LOG} EntitlementGate failed; falling back to /v1/me`, e);
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
      alert('Unable to verify your subscription right now. Please refresh and try again.');
      return;
    }

    const entitled = hasServicesEntitlement(me.entitlements);

    if (entitled) {
      // ✅ Already paid/entitled → don’t send them to checkout
      routeEntitledUser();
      return;
    }

    // Not entitled → route to Stripe checkout
    goToStripeCheckout(planKey);
  }

  function handleContact() {
    if (typeof window.showSection === 'function') window.showSection('Contact');
    else window.location.hash = '#contact';
  }

  function wire(root) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const card = btn.closest('.plan');
      const planKey = card?.getAttribute('data-plan') || '';

      if (action === 'subscribe') {
        await handleSubscribe(planKey);
        return;
      }
      if (action === 'contact') {
        handleContact();
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