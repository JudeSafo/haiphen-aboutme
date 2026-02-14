/* docs/components/gating/engagement-gate.js
 *
 * Two gate modes:
 *   preview  — always gated (Docs): top half visible, bottom fades out, login card
 *   visits   — click-count gated (Mission, Fintech): full blur after N visits
 *
 * Logged-in users (cached or verified via /me) skip all gates.
 * Auth result cached 30 min in localStorage.
 */
(function () {
  'use strict';

  var LOG = '[engage-gate]';
  var AUTH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  var GATED = {
    Docs:     { mode: 'preview' },
    OnePager: { mode: 'visits', visits: 10 },
    Trades:   { mode: 'visits', visits: 10 },
  };

  var OVERLAY_ID  = 'engage-gate-overlay';
  var WRAPPER_CLS = 'engage-gate-wrap';
  var GATED_CLS   = 'engage-gated';

  // ── localStorage helpers ──────────────────────────────────────

  function lsGet(k)    { try { return localStorage.getItem(k); } catch(e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch(e) {} }

  function getVisits(section) {
    return parseInt(lsGet('haiphen.engage.' + section + '.visits'), 10) || 0;
  }
  function incVisits(section) {
    var n = getVisits(section) + 1;
    lsSet('haiphen.engage.' + section + '.visits', n);
    return n;
  }

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
        '<a href="#contact-us" class="engage-gate-link" data-gate-nav="Contact">Schedule a Demo</a>' +
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

  // ── DOM: full-blur gate (visits mode) ─────────────────────────

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

  // ── Main gate check ───────────────────────────────────────────

  function check(section) {
    clearGate();

    var cfg = GATED[section];
    if (!cfg) return { allowed: true };

    // Logged-in users always pass
    if (getCachedAuth() === true) return { allowed: true };

    // Preview mode (Docs): always gate for anonymous users
    if (cfg.mode === 'preview') {
      applyPreviewGate();
      runBackgroundAuth();
      return { allowed: false };
    }

    // Visits mode (Mission, Trades): count navigations, gate after threshold
    var visits = incVisits(section);
    if (visits <= cfg.visits) {
      // Under threshold — allow through, no gate
      // Still fire a background auth check to warm the cache
      runBackgroundAuth();
      return { allowed: true };
    }

    // Over threshold + not logged in → full blur
    applyBlurGate();
    runBackgroundAuth();
    return { allowed: false };
  }

  // ── Public API ────────────────────────────────────────────────

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.EngagementGate = {
    check: check,
    _debug: { clearGate: clearGate, GATED: GATED, getVisits: getVisits },
  };
})();
