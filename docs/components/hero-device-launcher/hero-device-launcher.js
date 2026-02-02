// docs/components/hero-device-launcher/hero-device-launcher.js
(() => {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const LOG = '[hero-device]';

  // ✅ Align these with your docs install section.
  const INSTALL_HASH = '#docs:docs-install-brew';

  // ✅ The Claude-like command shown + copied.
  // Update to match whatever your docs recommend.
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

    // Fill the command text in the CTA block, if present.
    const cmdEl = root.querySelector('[data-hdl-command]');
    if (cmdEl) cmdEl.textContent = INSTALL_COMMAND;

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
        if (e.key === 'Escape') close(root);
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