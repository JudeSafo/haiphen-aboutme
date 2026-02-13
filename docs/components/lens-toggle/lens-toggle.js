/* docs/components/lens-toggle/lens-toggle.js */
(function () {
  'use strict';

  var NS = (window.HAIPHEN = window.HAIPHEN || {});

  var STORAGE_KEY  = 'haiphen.lens';
  var FLASH_KEY    = 'haiphen.lens_flash';   // JSON object: { Trades:1, Services:1, ... }
  var LENS_ATTR    = 'data-lens';
  var CSS_ID       = 'lens-toggle-css';

  /* Sections that trigger the first-visit flash */
  var FLASH_SECTIONS = ['Trades', 'Services', 'OnePager', 'FAQ', 'Contact', 'Docs', 'GettingStarted'];

  /* Active flash interval ID (so we can cancel it on acknowledge) */
  var _flashInterval = null;

  /* ---- Public API ---- */

  function getLens() {
    try { return localStorage.getItem(STORAGE_KEY) || 'tech'; }
    catch (_) { return 'tech'; }
  }

  function setLens(value) {
    if (value !== 'tech' && value !== 'finance') return;
    try { localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
    applyLens(value);
    updateDropdownState(value);
    window.dispatchEvent(new CustomEvent('haiphen:lens', { detail: { lens: value } }));
  }

  function applyLens(value) {
    var html = document.documentElement;
    html.classList.add('lens-transition');
    if (value === 'finance') {
      html.setAttribute(LENS_ATTR, 'finance');
    } else {
      html.removeAttribute(LENS_ATTR);
    }
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

  /* ---- Dropdown state management ---- */

  /*
   * Highlighting logic:
   *   tech mode  → "Tech Perspective" is highlighted (active), "Finance" is dimmed
   *   finance mode → "Finance Perspective" is highlighted (active), "Tech" is dimmed
   * The NON-current option is the clickable switch target.
   */
  function updateDropdownState(lens) {
    var finOpt  = document.querySelector('.lens-toggle__option--finance');
    var techOpt = document.querySelector('.lens-toggle__option--tech');
    if (!finOpt || !techOpt) return;

    if (lens === 'finance') {
      finOpt.classList.remove('is-current');
      techOpt.classList.add('is-current');
    } else {
      techOpt.classList.remove('is-current');
      finOpt.classList.add('is-current');
    }
  }

  /* ---- Flash (first-visit per section) ---- */

  function getFlashState() {
    try {
      var raw = localStorage.getItem(FLASH_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function markFlashed(section) {
    var state = getFlashState();
    state[section] = 1;
    try { localStorage.setItem(FLASH_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function shouldFlash(section) {
    if (FLASH_SECTIONS.indexOf(section) === -1) return false;
    var state = getFlashState();
    return !state[section];
  }

  function stopFlashing() {
    if (_flashInterval) {
      clearInterval(_flashInterval);
      _flashInterval = null;
    }
    var btn = document.querySelector('.lens-toggle__btn');
    if (btn) btn.classList.remove('is-flashing');
  }

  function doPulse() {
    var btn = document.querySelector('.lens-toggle__btn');
    if (!btn) return;
    btn.classList.remove('is-flashing');
    void btn.offsetWidth; /* force reflow to restart animation */
    btn.classList.add('is-flashing');
  }

  function flashToggle(section) {
    var btn = document.querySelector('.lens-toggle__btn');
    if (!btn) return;

    markFlashed(section);

    /* Stop any existing flash loop */
    stopFlashing();

    /* Start repeating pulse every 3s (animation is 2.2s + 0.8s gap) */
    setTimeout(function () {
      doPulse();
      _flashInterval = setInterval(doPulse, 3000);
    }, 400);
  }

  /* Expose for showSection() to call */
  NS.lensFlashForSection = function (sectionName) {
    var ALIASES = {
      fintech: 'Trades', Fintech: 'Trades',
      collaborate: 'OnePager', Collaborate: 'OnePager',
      faq: 'FAQ', Faq: 'FAQ',
      services: 'Services'
    };
    var resolved = ALIASES[sectionName] || sectionName;
    if (shouldFlash(resolved)) flashToggle(resolved);
  };

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

    var btn      = mount.querySelector('.lens-toggle__btn');
    var dropdown = mount.querySelector('.lens-toggle__dropdown');
    var wrapper  = mount.querySelector('.lens-toggle');

    if (!btn) return;

    /* Detect touch device (no fine pointer = mobile/tablet) */
    var isTouchDevice = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* Set initial dropdown state */
    updateDropdownState(getLens());

    /* ---- Hover acknowledges (stops) the flash ---- */
    if (wrapper) {
      wrapper.addEventListener('mouseenter', function () {
        stopFlashing();
      });
    }

    /* ---- Close dropdown helper ---- */
    function closeDropdown() {
      if (dropdown) dropdown.classList.remove('is-open');
    }

    function toggleDropdown() {
      if (dropdown) dropdown.classList.toggle('is-open');
    }

    /* ---- Click button ---- */
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      stopFlashing();

      if (isTouchDevice) {
        /* Mobile: toggle dropdown open/closed */
        toggleDropdown();
      } else {
        /* Desktop: direct toggle lens */
        setLens(getLens() === 'tech' ? 'finance' : 'tech');
      }
    });

    /* ---- Click dropdown options → pick specific lens ---- */
    if (dropdown) {
      dropdown.addEventListener('click', function (e) {
        var opt = e.target.closest('[data-lens-pick]');
        if (!opt) return;
        e.stopPropagation();
        stopFlashing();
        var pick = opt.getAttribute('data-lens-pick');
        if (pick && !opt.classList.contains('is-current')) {
          setLens(pick);
        }
        closeDropdown();
      });
    }

    /* ---- Close dropdown on outside tap ---- */
    document.addEventListener('click', function (e) {
      if (dropdown && dropdown.classList.contains('is-open') && !wrapper.contains(e.target)) {
        closeDropdown();
      }
    });
  };
})();
