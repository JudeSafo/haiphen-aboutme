/* docs/components/services-plans/services-plans.js
 * Renders a pricing/subscription block for Services.
 * - Mount inside the Services section via <div id="services-plans-mount"></div>
 * - Click handlers:
 *    - Subscribe: ensure login, then redirect to Square hosted link (placeholder)
 *    - Contact: jumps to Contact section
 */
(function () {
  'use strict';

  const LOG = '[services-plans]';
  const MOUNT_ID = 'services-plans-mount';

  // Keep consistent with index.html
  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  // TODO: replace with real Square hosted checkout links (per plan)
  const SQUARE_CHECKOUT = {
    signals_starter: 'https://square.link/u/REPLACE_SIGNALS_STARTER',
    fintech_pro: 'https://square.link/u/REPLACE_FINTECH_PRO',
    enterprise_custom: 'https://square.link/u/REPLACE_ENTERPRISE_CUSTOM',
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

  async function isLoggedIn() {
    try {
      const resp = await fetch(`${AUTH_ORIGIN}/me`, { credentials: 'include' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  function redirectToLogin(nextUrl) {
    const next = encodeURIComponent(nextUrl || window.location.href);
    window.location.href = `${AUTH_ORIGIN}/login?next=${next}`;
  }

  function goToSquare(planKey) {
    const url = SQUARE_CHECKOUT[planKey];
    if (!url || url.includes('REPLACE_')) {
      console.warn(`${LOG} missing Square link for plan`, planKey);
      alert('Checkout link not configured yet for this plan.');
      return;
    }
    window.location.href = url;
  }

  async function handleSubscribe(planKey) {
    const ok = await isLoggedIn();
    if (!ok) {
      // after login, return to same page (you can later pass a plan param too)
      redirectToLogin(window.location.href);
      return;
    }
    goToSquare(planKey);
  }

  function handleContact() {
    if (typeof window.showSection === 'function') window.showSection('Contact');
    else window.location.hash = '#contact';
  }

  function wire(root) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
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

  async function loadServicesPlans() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      // Not an error: only exists when Services section is rendered
      return;
    }

    // Avoid double insert
    if (mount.querySelector('.services-plans')) return;

    await injectCssOnce('components/services-plans/services-plans.css');

    const html = await fetchText('components/services-plans/services-plans.html');
    mount.innerHTML = html;

    wire(mount);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadServicesPlans = loadServicesPlans;
})();