// docs/components/hero-device-launcher/hero-device-launcher.js
(() => {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const LOG = '[hero-device]';

  const INSTALL_HASH = '#docs:docs-install-brew';
  const INSTALL_COMMAND = 'brew install haiphen';

  /* ── Timing constants ── */
  const OPEN_DELAY   = 200;   // ms before opening on hover
  const CLOSE_DELAY  = 400;   // ms before closing on mouse-leave
  const COOLDOWN_MS  = 800;   // suppress re-trigger window after close
  const SCROLL_WAIT  = 300;   // ms to wait for panel expand before focus-scroll
  const SCROLL_GUARD = 1500;  // ms to suppress IntersectionObserver during scroll

  function routeToDocsInstall(source = 'hero_install_cta') {
    try {
      const fn = window?.HAIPHEN?.ApiAccess?.requestAccess;
      if (typeof fn === 'function') {
        fn({ returnHash: INSTALL_HASH, source });
        return;
      }
    } catch (err) {
      console.warn(`${LOG} requestAccess failed`, err);
    }

    try {
      if (typeof window.showSection === 'function') window.showSection('Docs');
    } catch {}
    try {
      window.location.hash = INSTALL_HASH;
    } catch {}
  }

  async function copyToClipboard(text) {
    const raw = String(text || '');
    if (!raw) return false;

    try {
      await navigator.clipboard.writeText(raw);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = raw;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return !!ok;
      } catch {
        return false;
      }
    }
  }

  function isOpen(root) {
    return root?.classList?.contains('is-open');
  }

  const DEMO_SRC_TECH = 'assets/demos/cli-workflow.gif';
  const DEMO_SRC_FINANCE = 'assets/demos/finance-dashboard.svg';

  function currentLens() {
    return document.documentElement.getAttribute('data-lens') || 'tech';
  }

  function lazyLoadDemo(root) {
    if (!root) return;
    const gif = root.querySelector('.hdl-demo-gif');
    const demo = root.querySelector('.hdl-demo');
    if (!gif || !demo) return;

    const lens = currentLens();
    const wantSrc = lens === 'finance' ? DEMO_SRC_FINANCE : DEMO_SRC_TECH;
    const curSrc = gif.getAttribute('src') || '';

    // If already showing the correct source, skip
    if (curSrc === wantSrc && demo.classList.contains('is-loaded')) return;

    // Switch source
    demo.classList.remove('is-loaded');
    gif.src = wantSrc;
    gif.onload = () => demo.classList.add('is-loaded');
  }

  /* ── Focus-scroll state ── */
  let focusScrollActive = false;   // true while viewport is shifted to GIF
  let scrollingForFocus  = false;  // true during the scroll animation (guards Observer)

  function open(root) {
    if (!root) return;
    root.classList.add('is-open');
    const panel = root.querySelector('[data-hdl-panel]');
    if (panel) panel.setAttribute('aria-hidden', 'false');
    lazyLoadDemo(root);

    // Focus-scroll: wait for CSS max-height transition to settle, then
    // scroll so the panel top meets the header bottom (via scroll-margin-top)
    // and the panel fills down to the viewport bottom.
    focusScrollActive = true;
    scrollingForFocus = true;
    setTimeout(() => {
      if (!isOpen(root)) { scrollingForFocus = false; return; }
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Release scroll guard after scroll animation finishes
      setTimeout(() => { scrollingForFocus = false; }, SCROLL_GUARD);
    }, SCROLL_WAIT);
  }

  /**
   * Close the panel and restore scroll position.
   * @param {'hero'|'sections'} scrollTarget — where to scroll back
   */
  function close(root, scrollTarget = 'hero') {
    if (!root) return;
    root.classList.remove('is-open');
    const panel = root.querySelector('[data-hdl-panel]');
    if (panel) panel.setAttribute('aria-hidden', 'true');

    if (focusScrollActive) {
      focusScrollActive = false;
      if (scrollTarget === 'hero') {
        const hero = document.querySelector('section.hero');
        if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // 'sections' — scroll to section menu so buttons are visible
        const menu = document.querySelector('#section-menu-mount');
        if (menu) menu.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function toggle(root) {
    if (!root) return;
    if (isOpen(root)) close(root, 'hero');
    else open(root);
  }

  function init(rootEl = document) {
    const root = rootEl.querySelector('[data-hdl-root]') || rootEl;
    if (!root || root.__hdlWired) return;
    root.__hdlWired = true;

    const hero = document.querySelector('section.hero');
    const trigger = document.querySelector('[data-hdl-trigger]');

    // Fill the command text in the CTA block, if present.
    const cmdEl = root.querySelector('[data-hdl-command]');
    if (cmdEl) cmdEl.textContent = INSTALL_COMMAND;

    // --- Debounced hover with cooldown throttle ---
    let openTimer  = null;
    let closeTimer = null;
    let cooldownUntil = 0;          // timestamp: suppress re-open before this
    let lastLeaveY = 0;             // track mouse exit Y for directional close

    const isMobile = () => window.matchMedia('(hover: none)').matches;

    function scheduleOpen() {
      if (isMobile()) return;
      // Suppress during cooldown window (prevents flicker on meta positions)
      if (Date.now() < cooldownUntil) return;
      clearTimeout(closeTimer);
      closeTimer = null;
      if (isOpen(root)) return;
      openTimer = setTimeout(() => { open(root); openTimer = null; }, OPEN_DELAY);
    }

    function scheduleClose(e) {
      if (isMobile()) return;
      clearTimeout(openTimer);
      openTimer = null;
      if (!isOpen(root)) return;

      // Capture exit direction from mouse event
      if (e && typeof e.clientY === 'number') lastLeaveY = e.clientY;

      closeTimer = setTimeout(() => {
        // Determine scroll restoration based on exit direction
        const panelEl = root.querySelector('[data-hdl-panel]');
        const panelRect = panelEl?.getBoundingClientRect();
        // If cursor exited above the panel midpoint → user went up → restore hero
        // If cursor exited below → user went down → show section buttons
        const midY = panelRect ? (panelRect.top + panelRect.bottom) / 2 : Infinity;
        const target = lastLeaveY < midY ? 'hero' : 'sections';

        close(root, target);
        closeTimer = null;
        cooldownUntil = Date.now() + COOLDOWN_MS;
      }, CLOSE_DELAY);
    }

    // Hover zone: entire .hero section + the panel itself
    const hoverZones = [hero, root].filter(Boolean);
    hoverZones.forEach((el) => {
      el.addEventListener('mouseenter', scheduleOpen);
      el.addEventListener('mouseleave', scheduleClose);
    });

    // Click/tap on trigger toggles (mobile + desktop fallback)
    if (trigger) {
      trigger.style.cursor = 'pointer';

      trigger.addEventListener('click', (e) => {
        e.preventDefault?.();
        e.stopPropagation?.();
        toggle(root);
      });

      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault?.();
          e.stopPropagation?.();
          toggle(root);
        }
      });
    }

    // ESC closes (always restores hero)
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          clearTimeout(openTimer);
          close(root, 'hero');
          cooldownUntil = Date.now() + COOLDOWN_MS;
        }
      },
      { passive: true }
    );

    // Click anywhere outside the hero closes
    document.addEventListener('click', (e) => {
      const t = e.target;
      const clickedInHero  = !!(hero && hero.contains(t));
      const clickedInPanel = !!(root && root.contains(t));
      if (!clickedInHero && !clickedInPanel) {
        close(root, 'hero');
        cooldownUntil = Date.now() + COOLDOWN_MS;
      }
    });

    // Nav button dismissal: clicking section nav buttons closes the panel
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-section]');
      if (btn && isOpen(root)) {
        clearTimeout(openTimer);
        close(root, 'sections');
        cooldownUntil = Date.now() + COOLDOWN_MS;
      }
    });

    // IntersectionObserver: close when hero scrolls out of view
    // IMPORTANT: suppressed during focus-scroll (we EXPECT hero to leave view)
    if (hero && typeof IntersectionObserver !== 'undefined') {
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting && isOpen(root) && !scrollingForFocus) {
              clearTimeout(openTimer);
              close(root, 'hero');
              cooldownUntil = Date.now() + COOLDOWN_MS;
            }
          }
        },
        { threshold: 0.3 }
      );
      obs.observe(hero);
    }

    // CTA: copy
    const copyBtn = root.querySelector('[data-hdl-action="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault?.();
        e.stopPropagation?.();

        const ok = await copyToClipboard(INSTALL_COMMAND);
        const prev = copyBtn.textContent;
        copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
        copyBtn.disabled = true;
        window.setTimeout(() => {
          copyBtn.textContent = prev || 'Copy';
          copyBtn.disabled = false;
        }, 900);
      });
    }

    // CTA: docs
    const docsBtn = root.querySelector('[data-hdl-action="docs"]');
    if (docsBtn) {
      docsBtn.addEventListener('click', (e) => {
        e.preventDefault?.();
        e.stopPropagation?.();
        routeToDocsInstall('hero_install_docs');
      });
    }

    // Lens switch: swap demo asset when lens changes
    window.addEventListener('haiphen:lens', () => {
      if (isOpen(root)) lazyLoadDemo(root);
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
      console.warn(`${LOG} failed to load`, err);
    }
  }

  NS.HeroDeviceLauncher = { init, load: loadHeroDeviceLauncher };
  NS.loadHeroDeviceLauncher = loadHeroDeviceLauncher;
})();
