/* docs/components/gating/auth-session.js
 *
 * Single source of truth for:
 * - "am I logged in?" check (auth cookie via AUTH /me)
 * - login redirect param conventions
 *
 * This stays small and dependency-free so it can be loaded early.
 */
(function () {
  'use strict';

  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  function currentUrl() {
    return window.location.href;
  }

  // Prefer ONE param name everywhere. Pick `return_to` (matches api-access.js intent).
  // If your auth worker accepts `to` as well, it can alias it server-side.
  function loginUrl(returnTo) {
    const u = new URL(`${AUTH_ORIGIN}/login`);
    u.searchParams.set('to', String(returnTo || currentUrl()));
    return u.toString();
  }

  async function isLoggedInViaAuthCookie() {
    try {
      const r = await fetch(`${AUTH_ORIGIN}/me`, {
        credentials: 'include',
        cache: 'no-store',
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  function redirectToLogin(returnTo) {
    window.location.assign(loginUrl(returnTo));
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.AuthSession = {
    isLoggedInViaAuthCookie,
    redirectToLogin,
    loginUrl,
    _debug: { AUTH_ORIGIN },
  };
})();