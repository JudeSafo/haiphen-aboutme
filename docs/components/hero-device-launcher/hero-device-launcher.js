// docs/components/hero-device-launcher/hero-device-launcher.js
(() => {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const LOG = '[hero-device]';

  const INSTALL_HASH = '#docs:docs-install-brew';
  const INSTALL_COMMAND = 'brew install haiphen';

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
  function lazyLoadDemo(root) {
    if (!root) return;
    const gif = root.querySelector('.hdl-demo-gif');
    const demo = root.querySelector('.hdl-demo');
    if (!gif || !demo || demo.classList.contains('is-loaded')) return;
    const src = gif.getAttribute('data-hdl-demo-src');
    if (!src) return;
    gif.src = src;
    gif.onload = () => demo.classList.add('is-loaded');
  }

  function open(root) {
    if (!root) return;
    root.classList.add('is-open');
    const panel = root.querySelector('[data-hdl-panel]');
    if (panel) panel.setAttribute('aria-hidden', 'false');
    lazyLoadDemo(root);

    // Scroll so the GIF is centered in viewport
    const hdl = root.closest('.hdl') || root;
    try {
      hdl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {}
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

    // Fill the command text in the CTA block, if present.
    const cmdEl = root.querySelector('[data-hdl-command]');
    if (cmdEl) cmdEl.textContent = INSTALL_COMMAND;

    // --- Debounced hover on the entire .hero zone ---
    let openTimer = null;
    let closeTimer = null;
    const isMobile = () => window.matchMedia('(hover: none)').matches;

    function scheduleOpen() {
      if (isMobile()) return;
      clearTimeout(closeTimer);
      closeTimer = null;
      if (isOpen(root)) return;
      openTimer = setTimeout(() => { open(root); openTimer = null; }, 200);
    }

    function scheduleClose() {
      if (isMobile()) return;
      clearTimeout(openTimer);
      openTimer = null;
      if (!isOpen(root)) return;
      closeTimer = setTimeout(() => { close(root); closeTimer = null; }, 400);
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

    // ESC closes
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          clearTimeout(openTimer);
          close(root);
        }
      },
      { passive: true }
    );

    // Click anywhere outside the hero closes
    document.addEventListener('click', (e) => {
      const t = e.target;
      const clickedInHero = !!(hero && hero.contains(t));
      const clickedInPanel = !!(root && root.contains(t));
      if (!clickedInHero && !clickedInPanel) close(root);
    });

    // Nav button dismissal: clicking section nav buttons closes the panel
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-section]');
      if (btn && isOpen(root)) {
        clearTimeout(openTimer);
        close(root);
      }
    });

    // IntersectionObserver: close when hero scrolls out of view
    if (hero && typeof IntersectionObserver !== 'undefined') {
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting && isOpen(root)) {
              clearTimeout(openTimer);
              close(root);
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
