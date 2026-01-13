// docs/components/hero-device-launcher/hero-device-launcher.js
(() => {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});

  /**
   * Optional runtime handler map the page can override:
   *   window.HAIPHEN.HeroDeviceLauncher.setHandlers({
   *     android: () => ...,
   *     mac: () => ...,
   *     iphone: () => ...,
   *   })
   */
  const state = {
    handlers: {
      android: () => routeToDocsViaAccessGate('hero_device_android'),
      mac: () => routeToDocsViaAccessGate('hero_device_mac'),
      iphone: () => routeToDocsViaAccessGate('hero_device_iphone'),
    },
  };

  function routeToDocsViaAccessGate(source = 'hero_device') {
    try {
      const fn = window?.HAIPHEN?.ApiAccess?.requestAccess;
      if (typeof fn === 'function') {
        fn({ returnHash: '#docs', source });
        return;
      }
    } catch (err) {
      console.warn('[hero-device] requestAccess failed', err);
    }

    // conservative fallback
    try {
      if (typeof window.showSection === 'function') window.showSection('Docs');
    } catch {}
    window.location.hash = '#docs';
  }

  function setHandlers(next) {
    if (!next || typeof next !== 'object') return;
    state.handlers = { ...state.handlers, ...next };
  }


  function isOpen(root) {
    return root?.classList?.contains('is-open');
  }
  function open(root) {
    if (!root) return;
    root.classList.add('is-open');
    const panel = root.querySelector('[data-hdl-panel]');
    if (panel) panel.setAttribute('aria-hidden', 'false');
  }
  function close(root) {
    if (!root) return;
    root.classList.remove('is-open');
    const panel = root.querySelector('[data-hdl-panel]');
    if (panel) panel.setAttribute('aria-hidden', 'true');
  }
  function toggle(root) {
    if (!root) return;
    if (isOpen(root)) close(root);
    else open(root);
  }

  function init(rootEl = document) {
    const root = rootEl.querySelector('[data-hdl-root]') || rootEl;
    if (!root || root.__hdlWired) return;
    root.__hdlWired = true;

    const hero = document.querySelector('section.hero');
    const trigger = document.querySelector('[data-hdl-trigger]');

    // Keep open when hovering the trigger region OR the panel itself
    const hoverTargets = [trigger, root].filter(Boolean);

    hoverTargets.forEach((el) => {
      el.addEventListener('mouseenter', () => open(root));
      el.addEventListener('mouseleave', () => close(root));
    });

    // Click/tap anywhere in the trigger region toggles (mobile + desktop)
    if (trigger) {
      trigger.style.cursor = 'pointer';

      trigger.addEventListener('click', (e) => {
        // prevent text selection / accidental drag
        e.preventDefault?.();
        e.stopPropagation?.();
        toggle(root);
      });

      // Keyboard accessibility (Enter/Space)
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault?.();
          e.stopPropagation?.();
          toggle(root);
        }
      });
    }
    // ESC closes
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') close(root);
      },
      { passive: true }
    );

    // Click handlers for icons
    root.querySelectorAll('.hdl-btn[data-device]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = String(btn.getAttribute('data-device') || '').trim();
        const fn = state.handlers[key];
        try {
          if (typeof fn === 'function') fn();
        } catch (err) {
          console.warn('[hero-device] handler failed', { key, err });
        }
      });
    });

    // If user clicks anywhere outside the hero, close it (nice UX)
    document.addEventListener('click', (e) => {
      const t = e.target;
      const clickedInHero = !!(hero && hero.contains(t));
      const clickedInPanel = !!(root && root.contains(t));
      if (!clickedInHero && !clickedInPanel) close(root);
    });
  }

  async function loadHeroDeviceLauncher(mountSelector = '#hero-device-launcher-mount') {
    const mount = document.querySelector(mountSelector);
    if (!mount) return;

    try {
      const resp = await fetch('components/hero-device-launcher/hero-device-launcher.html', { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} loading hero-device-launcher.html`);
      mount.innerHTML = await resp.text();
      init(mount);
    } catch (err) {
      console.warn('[hero-device] failed to load', err);
    }
  }

  NS.HeroDeviceLauncher = { init, load: loadHeroDeviceLauncher, setHandlers };
  NS.loadHeroDeviceLauncher = loadHeroDeviceLauncher;
})();