/* components/headers/session-profile-template.js */
(function () {
  'use strict';

  function apiCredBlockHtml() {
    return `
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
            <code class="api-cred-v" data-api-key>••••••••••••••••</code>
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