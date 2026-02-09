(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const STORAGE_KEY = 'haiphen.welcome_seen';

  // Capture session early (before async template fetch)
  let _sessionUser = undefined; // undefined = not yet received
  window.addEventListener('haiphen:session:ready', (e) => {
    _sessionUser = e.detail?.user || null;
  }, { once: true });

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

  function alreadySeen() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch { /* noop */ }
  }

  NS.WelcomeOverlay = {
    async init(mountSelector) {
      if (alreadySeen()) return;

      const mount = document.querySelector(mountSelector);
      if (!mount) return;

      injectCssOnce('components/welcome-overlay/welcome-overlay.css');

      try {
        const html = await fetchText('components/welcome-overlay/welcome-overlay.html');
        mount.innerHTML = html;
      } catch (e) {
        console.warn('[welcome-overlay] failed to load template', e);
        return;
      }

      const backdrop = mount.querySelector('[data-welcome-overlay]');
      if (!backdrop) return;

      function show() {
        setTimeout(() => {
          backdrop.classList.add('is-visible');
        }, 600);
      }

      // Session may have already fired before template loaded
      if (_sessionUser !== undefined) {
        if (_sessionUser) show();
      } else {
        // Still waiting — listen again
        window.addEventListener('haiphen:session:ready', (e) => {
          if (e.detail?.user) show();
        }, { once: true });
      }

      // Also check if session pill already exists (logged in)
      if (_sessionUser === undefined && document.querySelector('.session-pill')) {
        show();
      }

      // Wire buttons
      backdrop.addEventListener('click', (e) => {
        const action = e.target.closest('[data-welcome-action]');
        if (!action) {
          if (e.target === backdrop) dismiss();
          return;
        }

        const act = action.getAttribute('data-welcome-action');
        if (act === 'explore') {
          markSeen();
          hide();
          if (typeof window.showSection === 'function') {
            window.showSection('GettingStarted');
            window.location.hash = '#getting-started';
          }
        } else if (act === 'dismiss') {
          dismiss();
        }
      });

      function dismiss() {
        markSeen();
        hide();
      }

      function hide() {
        backdrop.classList.remove('is-visible');
        setTimeout(() => { mount.innerHTML = ''; }, 400);
      }

      const onKey = (e) => {
        if (e.key === 'Escape') {
          dismiss();
          document.removeEventListener('keydown', onKey);
        }
      };
      document.addEventListener('keydown', onKey);
    }
  };
})();
