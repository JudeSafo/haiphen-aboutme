/* docs/components/services-plans/services-plans.js */
(function () {
  'use strict';

  const LOG = '[services-plans]';

  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  // TODO: replace with real Square hosted checkout links (per plan)
  const SQUARE_CHECKOUT = {
    // Streaming / existing
    signals_starter: 'https://square.link/u/f3nO4ktd',
    fintech_pro: 'https://square.link/u/f3nO4ktd',
    enterprise_custom: 'https://square.link/u/f3nO4ktd',

    // Hard Tech (new)
    hardtech_starter: 'https://square.link/u/f3nO4ktd',
    hardtech_pro: 'https://square.link/u/f3nO4ktd',
    hardtech_enterprise: 'https://square.link/u/f3nO4ktd',
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

    // Avoid double insert
    if (mount.querySelector('.services-plans')) return;

    const html = await fetchText(htmlUrl);
    mount.innerHTML = html;
    wire(mount);
  }

  async function loadServicesPlans() {
    // Shared styles for both blocks
    await injectCssOnce('components/services-plans/services-plans.css');

    // Existing “Streaming” block (already in services-plans.html)
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