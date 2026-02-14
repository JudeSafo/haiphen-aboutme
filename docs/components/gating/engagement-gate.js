/* docs/components/gating/engagement-gate.js
 *
 * Auth-gated blur for Trades, OnePager, Docs.
 * Blur by default until auth is confirmed (zero threshold).
 *
 * - Content renders first, then gets wrapped + blurred.
 * - Overlay card sits OUTSIDE the blurred wrapper (so it stays sharp).
 * - Background auth check removes blur if user is logged in.
 * - Auth result cached 30 min in localStorage (at most 1 /me call per window).
 */
(function () {
  'use strict';

  var LOG = '[engage-gate]';
  var GATED_SECTIONS = { Trades: true, OnePager: true, Docs: true };
  var AUTH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  var OVERLAY_ID  = 'engage-gate-overlay';
  var WRAPPER_CLS = 'engage-gate-wrap';
  var GATED_CLS   = 'engage-gated';

  // ── localStorage helpers ──────────────────────────────────────

  function lsGet(k)    { try { return localStorage.getItem(k); } catch(e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch(e) {} }

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

  // ── DOM manipulation ──────────────────────────────────────────

  function clearGate() {
    // Remove overlay
    var ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.remove();

    // Unwrap blurred content back into content-widget
    var cw = document.getElementById('content-widget');
    if (!cw) return;
    var wrapper = cw.querySelector('.' + WRAPPER_CLS);
    if (wrapper) {
      while (wrapper.firstChild) cw.insertBefore(wrapper.firstChild, wrapper);
      wrapper.remove();
    }
  }

  function applyGate() {
    var cw = document.getElementById('content-widget');
    if (!cw || cw.querySelector('.' + WRAPPER_CLS)) return; // already applied

    cw.style.position = 'relative';

    // Move all content into a blurred wrapper
    var wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLS + ' ' + GATED_CLS;
    while (cw.firstChild) wrapper.appendChild(cw.firstChild);
    cw.appendChild(wrapper);

    // Overlay as sibling of wrapper — stays sharp (outside filter)
    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'engage-gate-overlay';
    overlay.innerHTML =
      '<div class="engage-gate-card">' +
        '<h3 class="engage-gate-card__title">Unlock Full Access</h3>' +
        '<p class="engage-gate-card__text">' +
          'Sign in to explore live dashboards, API documentation, and production infrastructure deep-dives.' +
        '</p>' +
        '<a class="engage-gate-card__btn" id="engage-gate-login-btn">Sign in</a>' +
        '<div class="engage-gate-card__links">' +
          '<a href="#services" class="engage-gate-link" data-gate-nav="Services">Explore Services</a>' +
          '<span class="engage-gate-link__sep"></span>' +
          '<a href="#contact-us" class="engage-gate-link" data-gate-nav="Contact">Schedule a Demo</a>' +
          '<span class="engage-gate-link__sep"></span>' +
          '<a href="#cohort" class="engage-gate-link" data-gate-nav="Trades">Join Newsletter</a>' +
        '</div>' +
      '</div>';
    cw.appendChild(overlay);

    // Wire login button
    var btn = document.getElementById('engage-gate-login-btn');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var auth = window.HAIPHEN?.AuthSession;
        if (auth?.redirectToLogin) auth.redirectToLogin(window.location.href);
      });
    }

    // Wire secondary nav links (navigate via showSection so gate clears properly)
    overlay.querySelectorAll('[data-gate-nav]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var section = link.getAttribute('data-gate-nav');
        if (typeof window.showSection === 'function') window.showSection(section);
      });
    });
  }

  // ── Main gate check (synchronous + background auth) ───────────

  function check(section) {
    // Always clear previous gate first
    clearGate();

    if (!GATED_SECTIONS[section]) {
      return { allowed: true };
    }

    // Cached auth → allow immediately, no blur
    if (getCachedAuth() === true) {
      return { allowed: true };
    }

    // Auth unknown → blur + overlay now, check auth in background
    applyGate();

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

    return { allowed: false };
  }

  // ── Public API ────────────────────────────────────────────────

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.EngagementGate = {
    check: check,
    _debug: { clearGate: clearGate, GATED_SECTIONS: GATED_SECTIONS },
  };
})();
