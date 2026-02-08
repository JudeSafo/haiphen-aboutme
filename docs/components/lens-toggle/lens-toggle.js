/* docs/components/lens-toggle/lens-toggle.js */
(function () {
  'use strict';

  var NS = (window.HAIPHEN = window.HAIPHEN || {});

  var STORAGE_KEY  = 'haiphen.lens';
  var INTRO_KEY    = 'haiphen.lens_intro_seen';
  var LENS_ATTR    = 'data-lens';
  var CSS_ID       = 'lens-toggle-css';

  /* ---- Public API ---- */

  function getLens() {
    try { return localStorage.getItem(STORAGE_KEY) || 'tech'; }
    catch (_) { return 'tech'; }
  }

  function setLens(value) {
    if (value !== 'tech' && value !== 'finance') return;
    try { localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
    applyLens(value);
    window.dispatchEvent(new CustomEvent('haiphen:lens', { detail: { lens: value } }));
  }

  function applyLens(value) {
    var html = document.documentElement;
    /* Add transition class briefly for smooth color change */
    html.classList.add('lens-transition');
    if (value === 'finance') {
      html.setAttribute(LENS_ATTR, 'finance');
    } else {
      html.removeAttribute(LENS_ATTR);
    }
    /* Remove transition class after animation completes */
    setTimeout(function () { html.classList.remove('lens-transition'); }, 600);
  }

  NS.lens = { get: getLens, set: setLens, toggle: function () {
    setLens(getLens() === 'tech' ? 'finance' : 'tech');
  }};

  /* ---- Apply saved lens immediately (before DOM ready) ---- */
  applyLens(getLens());

  /* ---- CSS injection ---- */

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = 'components/lens-toggle/lens-toggle.css';
    document.head.appendChild(link);
  }

  /* ---- Load component ---- */

  NS.loadLensToggle = async function loadLensToggle() {
    var mount = document.getElementById('lens-toggle-mount');
    if (!mount) return;

    ensureCss();

    try {
      var resp = await fetch('components/lens-toggle/lens-toggle.html', { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      mount.innerHTML = await resp.text();
    } catch (err) {
      console.warn('[lens-toggle] failed to load', err);
      return;
    }

    var root     = mount.querySelector('.lens-toggle');
    var btn      = mount.querySelector('.lens-toggle__btn');
    var dropdown = mount.querySelector('.lens-toggle__dropdown');
    var bubble   = mount.querySelector('.lens-toggle__bubble');
    var options  = mount.querySelectorAll('.lens-toggle__option');

    if (!root || !btn || !dropdown) return;

    /* ---- Highlight current lens ---- */
    function syncActive() {
      var current = getLens();
      options.forEach(function (opt) {
        opt.classList.toggle('is-active', opt.getAttribute('data-lens') === current);
      });
    }
    syncActive();

    /* ---- Dropdown open/close ---- */
    function openDropdown()  { dropdown.classList.add('is-open'); closeBubble(); }
    function closeDropdown() { dropdown.classList.remove('is-open'); }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown.classList.contains('is-open')) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    /* Close on outside click */
    document.addEventListener('click', function (e) {
      if (!root.contains(e.target)) closeDropdown();
    });

    /* Escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDropdown();
    });

    /* ---- Option click → switch lens ---- */
    options.forEach(function (opt) {
      opt.addEventListener('click', function () {
        var lens = opt.getAttribute('data-lens');
        setLens(lens);
        syncActive();
        closeDropdown();
      });
    });

    /* ---- First-time instruction bubble ---- */
    function closeBubble() {
      if (!bubble) return;
      bubble.classList.remove('is-visible');
      try { localStorage.setItem(INTRO_KEY, '1'); } catch (_) {}
    }

    var introSeen = false;
    try { introSeen = localStorage.getItem(INTRO_KEY) === '1'; } catch (_) {}

    if (!introSeen && bubble) {
      /* Short delay so it appears after page settles */
      setTimeout(function () { bubble.classList.add('is-visible'); }, 1200);
      /* Auto-dismiss after 6s */
      setTimeout(closeBubble, 7200);
      /* Dismiss on any click */
      document.addEventListener('click', closeBubble, { once: true });
    }

    /* ---- Sync if lens changes externally ---- */
    window.addEventListener('haiphen:lens', syncActive);
  };
})();
