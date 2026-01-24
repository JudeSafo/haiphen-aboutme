/* docs/components/cohort/cohort-banner.js
 *
 * Cohort banner (fixed at top above header).
 * Responsibilities:
 *  - Ensure banner DOM exists (inject if missing)
 *  - Show/hide banner (persist dismissal)
 *  - Maintain CSS var: --cohort-banner-offset (used by header/sidebar scroll offsets)
 *
 * Debugging:
 *  - LOG prefix "[cohort-banner]"
 *  - In console: document.querySelector('.hp-cohort-banner') should be non-null after DOMContentLoaded
 */
(function () {
  'use strict';

  const LOG = '[cohort-banner]';

  const CONFIG = {
    // Persist dismissal for a while; tweak as you like.
    dismissTtlMs: 14 * 24 * 60 * 60 * 1000, // 14 days

    // Storage key for dismissal timestamp.
    storageKey: 'haiphen.cohort_banner.dismissed_at',

    // Default content
    badgeText: '2-minute Survey',
    messageText: 'Intelligence Cohort Screening 🧠+📊',
    ctaText: 'Take Survey',
    // Set this to your desired target:
    // - '#contact-us' routes to Contact section hash already in your router
    // - 'https://...' external link
    ctaHref: '#cohort',

    // Banner should show on these pages (most static sites = always true)
    shouldShow: () => true,
  };

  function now() {
    return Date.now();
  }

  function safeGetStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSetStorage(key, val) {
    try {
      window.localStorage.setItem(key, val);
    } catch {
      // ignore
    }
  }

  function safeRemoveStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  function isDismissed() {
    const raw = safeGetStorage(CONFIG.storageKey);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;

    // Expire dismissal after TTL
    if (now() - ts > CONFIG.dismissTtlMs) {
      safeRemoveStorage(CONFIG.storageKey);
      return false;
    }
    return true;
  }

  function markDismissed() {
    safeSetStorage(CONFIG.storageKey, String(now()));
  }

  function setOffsetPx(px) {
    const val = `${Math.max(0, Math.floor(px))}px`;
    document.documentElement.style.setProperty('--cohort-banner-offset', val);
  }

  function getBannerEl() {
    return document.querySelector('.hp-cohort-banner');
  }

  function buildBannerEl() {
    const el = document.createElement('div');
    el.className = 'hp-cohort-banner';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Cohort banner');
    el.hidden = true;

    el.innerHTML = `
      <div class="hp-cohort-banner__inner">
        <div class="hp-cohort-banner__left">
          <span class="hp-cohort-banner__badge">${escapeHtml(CONFIG.badgeText)}</span>
          <span class="hp-cohort-banner__msg">${escapeHtml(CONFIG.messageText)}</span>
        </div>
        <div class="hp-cohort-banner__actions">
          <a class="hp-cohort-banner__cta" href="${escapeAttr(CONFIG.ctaHref)}">
            ${escapeHtml(CONFIG.ctaText)} <span aria-hidden="true">→</span>
          </a>
          <button class="hp-cohort-banner__x" type="button" aria-label="Dismiss banner">×</button>
        </div>
      </div>
    `.trim();

    return el;
  }

  function escapeHtml(s) {
    const str = String(s ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function ensureBannerInDom() {
    let banner = getBannerEl();
    if (banner) return banner;

    banner = buildBannerEl();

    // Insert as the FIRST thing in <body> so it sits above everything.
    const body = document.body;
    if (!body) {
      // If called too early, caller should retry on DOMContentLoaded
      console.warn(`${LOG} document.body not ready; cannot inject banner yet`);
      return null;
    }

    body.insertBefore(banner, body.firstChild);
    console.info(`${LOG} injected banner element`);
    return banner;
  }

  function measureAndSetOffset(banner) {
    if (!banner || banner.hidden) {
      setOffsetPx(0);
      return;
    }

    // Use rAF to ensure layout is settled
    requestAnimationFrame(() => {
      const h = banner.getBoundingClientRect().height || 0;
      setOffsetPx(h);
    });
  }

  function showBanner(banner) {
    if (!banner) return;
    banner.hidden = false;
    measureAndSetOffset(banner);
  }

  function hideBanner(banner) {
    if (!banner) return;
    banner.hidden = true;
    setOffsetPx(0);
  }

  function wireInteractions(banner) {
    if (!banner || banner.__wired) return;
    banner.__wired = true;

    const dismissBtn = banner.querySelector('.hp-cohort-banner__x');
    dismissBtn?.addEventListener('click', () => {
      markDismissed();
      hideBanner(banner);
      console.info(`${LOG} dismissed`);
    });

    // Keep offset correct if fonts load / viewport changes
    const onResize = () => measureAndSetOffset(banner);
    window.addEventListener('resize', onResize, { passive: true });

    // If you want: update offset when page finishes loading resources
    window.addEventListener('load', onResize, { passive: true });

    // Optional: observe size changes (more robust than resize-only)
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => measureAndSetOffset(banner));
      ro.observe(banner);
      banner.__ro = ro;
    }
  }

  function init() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (!CONFIG.shouldShow()) {
      console.info(`${LOG} shouldShow() returned false; banner will not render`);
      return;
    }

    const banner = ensureBannerInDom();
    if (!banner) return;

    wireInteractions(banner);

    if (isDismissed()) {
      hideBanner(banner);
      console.info(`${LOG} not showing (dismissed)`);
      return;
    }

    showBanner(banner);
    console.info(`${LOG} showing`);
  }

  // Export small API for debugging / manual control
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.CohortBanner = {
    init,
    show: () => {
      const b = ensureBannerInDom();
      if (!b) return;
      safeRemoveStorage(CONFIG.storageKey);
      wireInteractions(b);
      showBanner(b);
    },
    hide: () => {
      const b = getBannerEl();
      if (b) hideBanner(b);
    },
    resetDismissal: () => safeRemoveStorage(CONFIG.storageKey),
  };

  // Run at the right time
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();