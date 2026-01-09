/* docs/components/services-plans/services-plans.js
 * Renders pricing/subscription blocks for Services.
 * - Mounts multiple plan sections (Streaming + Hard Tech).
 * - Subscribe flow:
 *    1) Ensure login via auth cookie check
 *    2) Redirect to Stripe hosted checkout link
 *
 * NOTE:
 * - Do NOT entitlement-gate “Subscribe” (users subscribe because they are NOT entitled yet).
 * - Entitlement gating belongs on *using* paid features elsewhere (services pages, docs try-it, etc.).
 */
(function () {
  'use strict';

  const LOG = '[services-plans]';

  // Keep consistent across your site; your EntitlementGate currently supports auth cookie at /me
  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  // ✅ Stripe hosted link (single for now)
  const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/28E28saW7f1Cead9PpaAw03';

  // Optional: persist plan choice for analytics / post-checkout UX
  const STORAGE = {
    selectedPlan: 'haiphen.checkout.selected_plan',
    returnTo: 'haiphen.checkout.return_to',
  };

  function qs(id) {
    return document.getElementById(id);
  }

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

  async function isLoggedIn() {
    try {
      const resp = await fetch(`${AUTH_ORIGIN}/me`, {
        credentials: 'include',
        cache: 'no-store',
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  function redirectToLogin(returnTo) {
    // Standardize on one param across your app.
    // Your EntitlementGate uses `to=`, ApiAccess uses `return_to=`, older code used `next=`.
    // Pick one and make auth worker accept it consistently; here we align to `to=`.
    const rt = encodeURIComponent(returnTo || window.location.href);
    window.location.assign(`${AUTH_ORIGIN}/login?to=${rt}`);
  }

  function goToStripeCheckout({ planKey } = {}) {
    try {
      if (planKey) sessionStorage.setItem(STORAGE.selectedPlan, String(planKey));
      sessionStorage.setItem(STORAGE.returnTo, window.location.href);
    } catch {}

    // Hosted link can’t reliably take arbitrary metadata like Checkout Session API can.
    // If you need per-plan pricing later, you’ll likely move to:
    //   POST https://api.haiphen.io/v1/billing/checkout { planKey, return_to }
    // which returns a session URL.
    window.location.assign(STRIPE_CHECKOUT_URL);
  }

  async function handleSubscribe(planKey) {
    const ok = await isLoggedIn();
    if (!ok) {
      redirectToLogin(window.location.href);
      return;
    }
    goToStripeCheckout({ planKey });
  }

  function handleContact() {
    if (typeof window.showSection === 'function') window.showSection('Contact');
    else window.location.hash = '#contact';
  }

  function wire(root) {
    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.getAttribute('data-action');
      const card = el.closest('.plan');
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

    // Avoid double insert
    if (mount.querySelector('.services-plans')) return;

    const html = await fetchText(htmlUrl);
    mount.innerHTML = html;
    wire(mount);
  }

  async function loadServicesPlans() {
    // Shared styles for both blocks
    await injectCssOnce('components/services-plans/services-plans.css');

    // Existing “Streaming” block
    await mountBlock({
      mountId: 'services-plans-mount',
      htmlUrl: 'components/services-plans/services-plans.html',
    });

    // New “Hard Tech” block
    await mountBlock({
      mountId: 'services-hardtech-mount',
      htmlUrl: 'components/services-plans/services-hardtech.html',
    });
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadServicesPlans = loadServicesPlans;
})();