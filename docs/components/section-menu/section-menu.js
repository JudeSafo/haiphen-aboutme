/* docs/components/section-menu/section-menu.js
 * Injects the middle buttons and wires them to showSection().
 */
(function () {
  'use strict';

  const MENU_ID = 'section-menu';
  const MOUNT_ID = 'section-menu-mount';

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

  function setActive(root, sectionName) {
    root.querySelectorAll('[data-section]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-section') === sectionName);
    });
  }

  /* ---- Typewriter hint (long-hover easter egg) ---- */

  const HINT_LINES = {
    Trades:   'Live options flow, volatility skew, and momentum signals \u2014 refreshed every 30 minutes.',
    OnePager: 'Six autonomous services. One pipeline. Every threat vector from CVE to counterparty.',
    Docs:     'One API key unlocks trade telemetry, risk scores, and infrastructure intelligence.',
    Services: 'Free tier included. Scale to enterprise with usage-based pricing.',
  };

  const LONG_HOVER_MS  = 1800;   /* cursor must rest this long before typing starts */
  const CHAR_DELAY_MS  = 38;     /* milliseconds between each character */

  let _twTimer   = null;   /* setTimeout id for long-hover detection */
  let _twRaf     = null;   /* requestAnimationFrame / setTimeout chain for typing */
  let _twEl      = null;   /* the .section-menu__hint element */

  function ensureHintEl(root) {
    if (_twEl) return _twEl;
    _twEl = document.createElement('span');
    _twEl.className = 'section-menu__hint';
    _twEl.setAttribute('aria-hidden', 'true');
    /* Append inside the mount div (root) so the absolute positioning
       is relative to the section-menu-wrap container, not the page. */
    root.appendChild(_twEl);
    return _twEl;
  }

  function clearTypewriter() {
    if (_twTimer) { clearTimeout(_twTimer); _twTimer = null; }
    if (_twRaf)   { clearTimeout(_twRaf);   _twRaf = null; }
    if (_twEl) {
      _twEl.classList.remove('is-typing');
      _twEl.textContent = '';
    }
  }

  function startTypewriter(root, text) {
    const el = ensureHintEl(root);
    el.textContent = '';
    el.classList.add('is-typing');

    /* Add blinking cursor span */
    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';

    let idx = 0;
    function tick() {
      if (idx <= text.length) {
        el.textContent = text.slice(0, idx);
        el.appendChild(cursor);
        idx++;
        _twRaf = setTimeout(tick, CHAR_DELAY_MS);
      }
      /* when done, cursor keeps blinking until mouse leaves */
    }
    tick();
  }

  function wireHints(root) {
    /* Only on devices with fine pointer (desktop) — skip on touch */
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    /* Make the mount div position:relative for absolute hint placement */
    root.classList.add('section-menu-wrap');

    root.querySelectorAll('[data-section]').forEach(function (btn) {
      btn.addEventListener('mouseenter', function () {
        const section = btn.getAttribute('data-section');
        const line = HINT_LINES[section];
        if (!line) return;

        clearTypewriter();
        _twTimer = setTimeout(function () {
          startTypewriter(root, line);
        }, LONG_HOVER_MS);
      });

      btn.addEventListener('mouseleave', function () {
        clearTypewriter();
      });
    });
  }

  /* ---- Core wiring ---- */

  function wire(root) {
    const SECTION_HASH = {
      Trades: 'fintech',
      Services: 'services',
      OnePager: 'mission',
      FAQ: 'faq',
      Inventory: 'archives',
      Contact: 'contact-us',
      Docs: 'docs',
    };

    function setHash(section) {
      const slug = SECTION_HASH[section];
      if (!slug) return;
      const next = `#${slug}`;
      if (window.location.hash !== next) window.location.hash = next;
    }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-section]');
      if (!btn) return;

      const section = btn.getAttribute('data-section');
      if (!section) return;

      /* Clear any in-progress typewriter on click */
      clearTypewriter();

      // Set hash first (so sharing / history is correct)
      setHash(section);

      // Then render content (hash router will also do this on hashchange,
      // but doing it here makes UI feel instant even if hashchange is delayed)
      if (typeof window.showSection === 'function') {
        window.showSection(section);
        setActive(root, section);
      }
    });

    /* Wire the long-hover typewriter hints */
    wireHints(root);
  }

  async function loadSectionMenu() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[section-menu] mount missing');
      return;
    }

    if (qs(MENU_ID)) return;

    await injectCssOnce('assets/base.css');
    await injectCssOnce('components/section-menu/section-menu.css');

    const html = await fetchText('components/section-menu/section-menu.html');
    mount.innerHTML = `<div id="${MENU_ID}">${html}</div>`;

    wire(mount);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSectionMenu = loadSectionMenu;
})();