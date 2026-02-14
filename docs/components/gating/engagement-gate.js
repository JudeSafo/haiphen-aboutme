/* docs/components/gating/engagement-gate.js
 *
 * Two gate modes:
 *   preview — always gated (Docs): top half visible, bottom fades out, login card
 *   clicks  — in-section click-count gated (Mission, Fintech): full blur after N clicks
 *
 * Anti-bypass (Layer 1+2):
 *   - Counters mirrored to both localStorage AND a cookie. The TRUE count
 *     is always MAX(localStorage, cookie) so clearing one doesn't help.
 *   - A "high watermark" cookie tracks the peak count. If localStorage drops
 *     below the watermark, that's a detected reset — a strikes counter
 *     increments. After MAX_RESETS strikes the gate locks permanently for
 *     that browser (cookie-based, survives localStorage wipes).
 *
 * Logged-in users (cached or verified via /me) skip all gates.
 * Auth result cached 30 min in localStorage.
 */
(function () {
  'use strict';

  var LOG = '[engage-gate]';
  var AUTH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  var MAX_RESETS = 3; // after 3 detected resets, permanent gate
  var COOKIE_DAYS = 365;

  var GATED = {
    Docs:     { mode: 'preview' },
    OnePager: { mode: 'clicks', clicks: 15 },
    Trades:   { mode: 'clicks', clicks: 15 },
  };

  var OVERLAY_ID  = 'engage-gate-overlay';
  var WRAPPER_CLS = 'engage-gate-wrap';
  var GATED_CLS   = 'engage-gated';

  // Currently active section (set by check(), read by click handler)
  var _activeSection = null;

  // ── Cookie helpers ────────────────────────────────────────────

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() +
      ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(prefix) === 0) return decodeURIComponent(c.substring(prefix.length));
    }
    return null;
  }

  // ── localStorage helpers ──────────────────────────────────────

  function lsGet(k)    { try { return localStorage.getItem(k); } catch(e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch(e) {} }

  // ── Multi-layer click counter ─────────────────────────────────
  // TRUE count = MAX(localStorage, cookie). Both are updated on every write.

  var CK_PREFIX = 'hp_eg_';  // cookie prefix (short to save header bytes)

  function getClicks(section) {
    var ls = parseInt(lsGet('haiphen.engage.' + section + '.clicks'), 10) || 0;
    var ck = parseInt(getCookie(CK_PREFIX + section), 10) || 0;
    return Math.max(ls, ck);
  }

  function setClicks(section, n) {
    lsSet('haiphen.engage.' + section + '.clicks', n);
    setCookie(CK_PREFIX + section, n, COOKIE_DAYS);
  }

  function incClicks(section) {
    var n = getClicks(section) + 1;
    setClicks(section, n);
    syncWatermark(section, n);
    return n;
  }

  // ── High-watermark + reset detection (Layer 2) ────────────────
  // Watermark cookie stores the highest click count ever seen.
  // If localStorage is lower than the watermark, user cleared it.

  function getWatermark(section) {
    return parseInt(getCookie(CK_PREFIX + 'hw_' + section), 10) || 0;
  }

  function syncWatermark(section, clicks) {
    var hw = getWatermark(section);
    if (clicks > hw) {
      setCookie(CK_PREFIX + 'hw_' + section, clicks, COOKIE_DAYS);
    }
  }

  function getResets() {
    return parseInt(getCookie(CK_PREFIX + 'resets'), 10) || 0;
  }

  function incResets() {
    var n = getResets() + 1;
    setCookie(CK_PREFIX + 'resets', n, COOKIE_DAYS);
    return n;
  }

  function isLockedOut() {
    return getResets() >= MAX_RESETS;
  }

  // Detect if localStorage was cleared for any gated section
  function detectResets() {
    var sections = Object.keys(GATED);
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (GATED[s].mode !== 'clicks') continue;
      var hw = getWatermark(s);
      if (hw === 0) continue; // no watermark yet, nothing to detect
      var ls = parseInt(lsGet('haiphen.engage.' + s + '.clicks'), 10) || 0;
      if (ls < hw) {
        // Reset detected — restore counter from watermark and record strike
        lsSet('haiphen.engage.' + s + '.clicks', hw);
        incResets();
        console.warn(LOG, 'reset detected for', s, '(strike ' + getResets() + '/' + MAX_RESETS + ')');
      }
    }
  }

  // ── Auth cache ────────────────────────────────────────────────

  function getCachedAuth() {
    try {
      var raw = lsGet('haiphen.engage.auth_ok');
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.ts < AUTH_CACHE_TTL) return true;
    } catch(e) {}
    return null;
  }
  function setCachedAuth() {
    lsSet('haiphen.engage.auth_ok', JSON.stringify({ ts: Date.now() }));
  }

  // ── Shared card markup ────────────────────────────────────────

  function buildCard() {
    return '<div class="engage-gate-card">' +
      '<h3 class="engage-gate-card__title">Unlock Full Access</h3>' +
      '<p class="engage-gate-card__text">' +
        'Sign in to explore live dashboards, API documentation, and production infrastructure deep-dives.' +
      '</p>' +
      '<a class="engage-gate-card__btn" id="engage-gate-login-btn">Sign in</a>' +
      '<div class="engage-gate-card__links">' +
        '<a href="#services" class="engage-gate-link" data-gate-nav="Services">Explore Services</a>' +
        '<span class="engage-gate-link__sep"></span>' +
        '<a href="#contact-us:hp-schedule" class="engage-gate-link" data-gate-nav="Contact:hp-schedule">Schedule a Demo</a>' +
        '<span class="engage-gate-link__sep"></span>' +
        '<a href="#cohort" class="engage-gate-link" data-gate-nav="Trades">Join Newsletter</a>' +
      '</div>' +
    '</div>';
  }

  function wireOverlay(overlay) {
    var btn = document.getElementById('engage-gate-login-btn');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var auth = window.HAIPHEN?.AuthSession;
        if (auth?.redirectToLogin) auth.redirectToLogin(window.location.href);
      });
    }
    overlay.querySelectorAll('[data-gate-nav]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var section = link.getAttribute('data-gate-nav');
        if (typeof window.showSection === 'function') window.showSection(section);
      });
    });
  }

  // ── DOM: clear any gate ───────────────────────────────────────

  function clearGate() {
    var ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.remove();

    var cw = document.getElementById('content-widget');
    if (!cw) return;
    var wrapper = cw.querySelector('.' + WRAPPER_CLS);
    if (wrapper) {
      while (wrapper.firstChild) cw.insertBefore(wrapper.firstChild, wrapper);
      wrapper.remove();
    }
  }

  // ── DOM: full-blur gate (clicks mode) ─────────────────────────

  function applyBlurGate() {
    var cw = document.getElementById('content-widget');
    if (!cw || cw.querySelector('.' + WRAPPER_CLS)) return;

    cw.style.position = 'relative';

    var wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLS + ' ' + GATED_CLS;
    while (cw.firstChild) wrapper.appendChild(cw.firstChild);
    cw.appendChild(wrapper);

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'engage-gate-overlay';
    overlay.innerHTML = buildCard();
    cw.appendChild(overlay);

    wireOverlay(overlay);
  }

  // ── DOM: preview gate (Docs — top visible, bottom faded) ──────

  function applyPreviewGate() {
    var cw = document.getElementById('content-widget');
    if (!cw || document.getElementById(OVERLAY_ID)) return;

    cw.style.position = 'relative';

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'engage-gate-overlay engage-gate-overlay--preview';
    overlay.innerHTML = buildCard();
    cw.appendChild(overlay);

    wireOverlay(overlay);
  }

  // ── Background auth check ─────────────────────────────────────

  function runBackgroundAuth() {
    var authFn = window.HAIPHEN?.AuthSession?.isLoggedInViaAuthCookie;
    if (typeof authFn === 'function') {
      authFn().then(function (loggedIn) {
        if (loggedIn) {
          setCachedAuth();
          clearGate();
        }
      }).catch(function (e) {
        console.warn(LOG, 'auth check failed', e);
      });
    }
  }

  // ── In-section click handler (delegated) ──────────────────────

  function onContentClick(e) {
    if (!_activeSection) return;

    var cfg = GATED[_activeSection];
    if (!cfg || cfg.mode !== 'clicks') return;

    // Don't count clicks on the gate overlay itself
    if (e.target.closest('#' + OVERLAY_ID)) return;

    // Logged-in users don't need counting
    if (getCachedAuth() === true) return;

    var clicks = incClicks(_activeSection);

    // Just crossed the threshold — apply the gate live
    if (clicks > cfg.clicks && !document.getElementById(OVERLAY_ID)) {
      applyBlurGate();
      runBackgroundAuth();
    }
  }

  // ── Install click listener (once) ─────────────────────────────

  function installClickListener() {
    var cw = document.getElementById('content-widget');
    if (cw) {
      cw.addEventListener('click', onContentClick);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installClickListener);
  } else {
    installClickListener();
  }

  // ── Run reset detection on load ───────────────────────────────

  detectResets();

  // ── Main gate check (called by showSection) ───────────────────

  function check(section) {
    clearGate();
    _activeSection = section;

    var cfg = GATED[section];
    if (!cfg) return { allowed: true };

    // Logged-in users always pass
    if (getCachedAuth() === true) return { allowed: true };

    // Lockout: too many resets detected — permanent gate on all click-gated sections
    if (cfg.mode === 'clicks' && isLockedOut()) {
      applyBlurGate();
      runBackgroundAuth();
      return { allowed: false };
    }

    // Preview mode (Docs): always gate for anonymous users
    if (cfg.mode === 'preview') {
      applyPreviewGate();
      runBackgroundAuth();
      return { allowed: false };
    }

    // Clicks mode: check if already over threshold
    if (cfg.mode === 'clicks') {
      if (getClicks(section) > cfg.clicks) {
        applyBlurGate();
        runBackgroundAuth();
        return { allowed: false };
      }
      // Under threshold — allow through, warm auth cache in background
      runBackgroundAuth();
      return { allowed: true };
    }

    return { allowed: true };
  }

  // ── Public API ────────────────────────────────────────────────

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.EngagementGate = {
    check: check,
    _debug: {
      clearGate: clearGate, GATED: GATED, getClicks: getClicks,
      getResets: getResets, getWatermark: getWatermark, isLockedOut: isLockedOut,
    },
  };
})();
