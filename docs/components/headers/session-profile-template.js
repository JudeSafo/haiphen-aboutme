/* components/headers/session-profile-template.js */
(function () {
  'use strict';

  function loginHref() {
    const AUTH_ORIGIN = 'https://auth.haiphen.io';
    const here = window.location.href;
    const u = new URL(`${AUTH_ORIGIN}/login`);
    u.searchParams.set('to', here);
    return u.toString();
  }

  function apiCredBlockHtml() {
    return `
      <div class="api-cred-loggedout" data-api-logged-out hidden>
        <div style="font-weight:900;font-size:12px;margin-bottom:6px;">Session</div>
        <div style="opacity:.8;font-weight:700;font-size:12px;margin-bottom:10px;">
          You’re not logged in.
        </div>
        <a class="login-btn" href="${loginHref()}" style="display:inline-flex;padding:8px 12px;font-size:12px;">
          Login
        </a>
      </div>

      <div class="api-cred" data-api-cred hidden>
        <div class="api-cred-left">
          <div class="api-cred-title">API Credentials</div>
          <div class="api-cred-sub">
            <span data-api-user-name>—</span>
            <span class="api-dot">•</span>
            <span data-api-user-email>—</span>
            <span class="api-dot">•</span>
            <span data-api-user-plan>—</span>
          </div>
        </div>

        <div class="api-cred-right">
          <div class="api-cred-row">
            <span class="api-cred-k">API Key</span>

            <!-- ✅ Hover/focus dropdown trigger -->
            <span class="api-key-menu" data-api-key-menu>
              <code class="api-cred-v" data-api-key tabindex="0" aria-haspopup="true" aria-label="Account menu">
                ••••••••••••••••
              </code>

              <div class="api-key-dropdown" role="menu" aria-label="Account quick menu">
                <button class="api-key-item" type="button" role="menuitem" data-session-action="open-profile">
                  Profile
                </button>
                <button class="api-key-item" type="button" role="menuitem" data-session-action="open-settings">
                  Settings
                </button>
                <div class="api-key-sep" aria-hidden="true"></div>
                <button class="api-key-item api-key-danger" type="button" role="menuitem" data-session-action="logout">
                  Logout
                </button>
              </div>
            </span>

            <button class="api-copy" type="button" data-copy-btn data-api-copy-key aria-label="Copy API key">Copy</button>
            <button class="api-btn api-btn-ghost" type="button" data-api-rotate-key>Rotate</button>
          </div>

          <div class="api-cred-meta api-muted">
            <span>Created:</span> <span data-api-key-created>—</span>
            <span class="api-dot">•</span>
            <span>Last used:</span> <span data-api-key-last-used>—</span>
          </div>
        </div>
      </div>
    `;
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.SessionProfileTemplate = { apiCredBlockHtml };
})();