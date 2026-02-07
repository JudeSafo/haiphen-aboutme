(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const STORAGE_KEY = 'haiphen.cookie_consent';

  function injectCssOnce(href) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }

  function getStoredPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function storePrefs(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch { /* noop */ }
  }

  function emitEvent(prefs) {
    try {
      window.dispatchEvent(new CustomEvent('haiphen:consent:updated', { detail: prefs }));
    } catch { /* noop */ }
  }

  NS.CookieConsent = {
    async init(mountSelector) {
      // Don't show if already consented
      const stored = getStoredPrefs();
      if (stored) return;

      const mount = document.querySelector(mountSelector);
      if (!mount) return;

      injectCssOnce('components/cookie-consent/cookie-consent.css');

      try {
        const html = await fetchText('components/cookie-consent/cookie-consent.html');
        mount.innerHTML = html;
      } catch (e) {
        console.warn('[cookie-consent] failed to load template', e);
        return;
      }

      const banner = mount.querySelector('.hp-consent__banner');
      if (!banner) return;

      // Show banner after 1s delay
      setTimeout(() => banner.classList.add('is-visible'), 1000);

      const hide = () => {
        banner.classList.remove('is-visible');
        setTimeout(() => { mount.innerHTML = ''; }, 400);
      };

      const collectPrefs = () => ({
        essential: true,
        analytics: !!mount.querySelector('input[name="analytics"]')?.checked,
        marketing: !!mount.querySelector('input[name="marketing"]')?.checked,
        saved_at: new Date().toISOString(),
      });

      // Accept All
      const acceptBtn = mount.querySelector('[data-consent-accept-all]');
      if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
          const prefs = { essential: true, analytics: true, marketing: true, saved_at: new Date().toISOString() };
          storePrefs(prefs);
          emitEvent(prefs);
          hide();
        });
      }

      // Save Preferences
      const saveBtn = mount.querySelector('[data-consent-save]');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const prefs = collectPrefs();
          storePrefs(prefs);
          emitEvent(prefs);
          hide();
        });
      }
    },

    getPrefs() {
      return getStoredPrefs();
    }
  };
})();
