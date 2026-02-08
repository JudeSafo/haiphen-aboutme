/* docs/components/profile/profile.js
 *
 * Profile page:
 * - cookie-auth user + plan info (via API /v1/me)
 * - list API keys (via /v1/keys/list)
 * - rotate key (via /v1/keys/rotate) and show raw key ONCE
 * - revoke key (via /v1/keys/revoke)
 *
 * Integration:
 * - exposes window.HAIPHEN.showProfile()
 * - listens for sidebar event haiphen:session:navigate { page: "profile" }
 */
(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const LOG = '[profile]';

  const API_ORIGIN = 'https://api.haiphen.io';
  const AUTH_ORIGIN = 'https://auth.haiphen.io';
  const CONTACT_ORIGIN = 'https://contact.haiphen.io';

  const MOUNT_ID = 'content-widget'; // your dynamic content root

  // Keep reveal sticky until user dismisses it.
  const STATE = {
    revealVisible: false,
    revealRawKey: '',
    revealMasked: false, // default show; allow hide toggle
  };

  const ONBOARDING_LINK_DEFAULTS = {
    app_url: 'https://app.haiphen.io/',
    docs_url: '#docs',
    profile_url: '#profile',
    cohort_url: '#cohort',
    calendar_url: 'https://calendar.app.google/jQzWz98eCC5jMLrQA',
    support_email: 'mailto:pi@haiphenai.com',
    cli_docs_url: '#docs:docs-cli-commands',
    metrics_docs_url: '#docs:docs-endpoints',
    secure_docs_url: '#docs:docs-secure',
    network_docs_url: '#docs:docs-network',
    graph_docs_url: '#docs:docs-graph',
    risk_docs_url: '#docs:docs-risk',
    causal_docs_url: '#docs:docs-causal',
    supply_docs_url: '#docs:docs-supply',
  };

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qa(sel, root = document) {
    return [...root.querySelectorAll(sel)];
  }

  function setText(el, v) {
    if (!el) return;
    el.textContent = v == null || v === '' ? '—' : String(v);
  }

  function fmtIso(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function escapeHtml(v) {
    const s = v == null ? '' : String(v);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(v) {
    return escapeHtml(v).replace(/`/g, '&#96;');
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function shouldAutoOpenProfile() {
    const h = String(window.location.hash || '').toLowerCase();
    return h === '#profile' || h.startsWith('#profile/') || h.startsWith('#profile:');
  }

  function hashSubId() {
    try {
      const raw = String(window.location.hash || '');
      // Support both slash (new) and colon (legacy) separators
      const m = raw.match(/^#profile[/:](.+)$/i);
      return (m?.[1] || '').trim();
    } catch {
      return '';
    }
  }

  function setProfileHash(subId = '') {
    try {
      const h = String(window.location.hash || '').toLowerCase();
      const target = subId ? `#profile/${subId}` : '#profile';
      if (h !== String(target).toLowerCase()) window.location.hash = target;
    } catch {
      /* noop */
    }
  }

  function applyOnboardingLinks(root, links) {
    const merged = Object.assign({}, ONBOARDING_LINK_DEFAULTS, links || {});
    qa('[data-onboarding-link]', root).forEach((el) => {
      const key = String(el.getAttribute('data-onboarding-link') || '').trim();
      if (!key || !merged[key]) return;

      const val = String(merged[key]).trim();
      if (!val) return;

      if (key === 'support_email' && !/^mailto:/i.test(val)) {
        el.setAttribute('href', `mailto:${val}`);
      } else {
        el.setAttribute('href', val);
      }
    });
  }

  async function hydrateOnboardingLinks(root) {
    applyOnboardingLinks(root, ONBOARDING_LINK_DEFAULTS);
    try {
      const data = await getJson(`${API_ORIGIN}/v1/onboarding/resources`);
      applyOnboardingLinks(root, data?.links || {});
    } catch (e) {
      // Fallback defaults are already applied.
      console.warn(LOG, 'failed to load onboarding resources', e);
    }
  }

  async function getJson(url) {
    const r = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${r.status}`;
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function postJson(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body || {}),
    });

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${r.status}`;
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function redirectToLogin() {
    const here = window.location.href;
    const u = new URL(`${AUTH_ORIGIN}/login`);
    u.searchParams.set('to', here);
    window.location.assign(u.toString());
  }

  function setStatus(root, msg, kind /* "ok" | "warn" | "" */) {
    const el = qs('[data-profile-status]', root);
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('hp-status--ok', 'hp-status--warn');
      return;
    }
    el.hidden = false;
    el.textContent = String(msg);
    el.classList.remove('hp-status--ok', 'hp-status--warn');
    if (kind === 'ok') el.classList.add('hp-status--ok');
    if (kind === 'warn') el.classList.add('hp-status--warn');
  }

  function setPrefStatus(root, msg, kind /* "ok" | "warn" | "" */) {
    const el = qs('[data-profile-pref-status]', root);
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('hp-status--ok', 'hp-status--warn');
      return;
    }
    el.hidden = false;
    el.textContent = String(msg);
    el.classList.remove('hp-status--ok', 'hp-status--warn');
    if (kind === 'ok') el.classList.add('hp-status--ok');
    if (kind === 'warn') el.classList.add('hp-status--warn');
  }

  function applyPreferencesToForm(root, prefs) {
    const defaults = {
      daily_digest: true,
      weekly_summary: true,
      product_updates: true,
      cohort_comms: true,
    };
    const merged = Object.assign({}, defaults, prefs || {});
    Object.keys(merged).forEach((k) => {
      const el = root.querySelector(`input[name="${k}"]`);
      if (el) el.checked = !!merged[k];
    });
  }

  function collectPreferences(root) {
    return {
      daily_digest: !!qs('input[name="daily_digest"]', root)?.checked,
      weekly_summary: !!qs('input[name="weekly_summary"]', root)?.checked,
      product_updates: !!qs('input[name="product_updates"]', root)?.checked,
      cohort_comms: !!qs('input[name="cohort_comms"]', root)?.checked,
    };
  }

  async function hydratePreferences(root) {
    const form = qs('[data-profile-pref-form]', root);
    if (!form) return;
    try {
      const data = await getJson(`${CONTACT_ORIGIN}/preferences/subscriptions`);
      const prefs = data?.preferences || {};
      applyPreferencesToForm(root, prefs);
      setPrefStatus(root, '', '');
    } catch (e) {
      // If user isn't authenticated to the contact service yet, don't scream.
      if (e && (e.status === 401 || e.status === 403)) {
        setPrefStatus(root, 'Log in to manage email preferences.', 'warn');
        return;
      }
      console.warn(LOG, 'failed to load email preferences', e);
      setPrefStatus(root, 'Unable to load email preferences.', 'warn');
    }
  }

  async function savePreferences(root) {
    const btn = qs('[data-profile-pref-save]', root);
    if (btn) btn.disabled = true;
    setPrefStatus(root, 'Saving preferences…', '');
    try {
      const prefs = collectPreferences(root);
      const res = await postJson(`${CONTACT_ORIGIN}/preferences/subscriptions`, { preferences: prefs });
      applyPreferencesToForm(root, res?.preferences || prefs);
      setPrefStatus(root, 'Preferences saved.', 'ok');
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        setPrefStatus(root, 'Log in to save email preferences.', 'warn');
        return;
      }
      setPrefStatus(root, `Save failed: ${e?.message || e}`, 'warn');
    }
  }

  async function copyToClipboard(text) {
    const raw = String(text || '');
    if (!raw) return false;

    try {
      await navigator.clipboard.writeText(raw);
      return true;
    } catch {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = raw;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  function ensureMountEl() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) throw new Error(`${LOG} missing #${MOUNT_ID}`);
    return mount;
  }

  async function ensureMounted(opts = {}) {
    const mount = ensureMountEl();

    await injectCssOnce('assets/base.css');
    await injectCssOnce('components/profile/profile.css');

    if (!mount.__haiphenProfileMounted) {
      const html = await fetchText('components/profile/profile.html');
      mount.innerHTML = html;
      wire(mount);
      mount.__haiphenProfileMounted = true;
    }

    await hydrate(mount);

    // Switch to requested tab if specified
    const tab = String(opts?.tab || '').trim();
    if (tab) switchTab(mount, tab);

    requestAnimationFrame(() => {
      const requestedSubId = String(opts?.subId || '').trim();
      const target =
        (requestedSubId && document.getElementById(requestedSubId)) ||
        mount.querySelector('.hp-profile__title') ||
        mount;
      scrollToWithHeaderOffsetCompat(target, 12);
      try {
        target?.setAttribute?.('tabindex', '-1');
        target?.focus?.({ preventScroll: true });
      } catch {
        /* noop */
      }
    });
  }

  function renderReveal(root) {
    const reveal = qs('[data-profile-reveal]', root);
    const keyEl = qs('[data-profile-newkey]', root);
    const toggleBtn = qs('[data-profile-action="toggle-visibility"]', root);

    if (!reveal || !keyEl) return;

    if (!STATE.revealVisible || !STATE.revealRawKey) {
      reveal.hidden = true;
      return;
    }

    reveal.hidden = false;

    if (STATE.revealMasked) {
      keyEl.textContent = '••••••••••••••••••••••••••••••••';
      keyEl.setAttribute('data-masked', '1');
      if (toggleBtn) toggleBtn.textContent = 'Show';
    } else {
      keyEl.textContent = STATE.revealRawKey;
      keyEl.removeAttribute('data-masked');
      if (toggleBtn) toggleBtn.textContent = 'Hide';
    }
  }

  async function hydrate(root) {
    setStatus(root, '', '');

    // 1) cookie-auth user + plan + active key metadata
    let me;
    try {
      me = await getJson(`${API_ORIGIN}/v1/me`);
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        redirectToLogin();
        return;
      }
      console.warn(LOG, 'failed to load /v1/me', e);
      throw e;
    }

    setText(qs('[data-profile-user]', root), me?.user_login || '—');
    setText(qs('[data-profile-email]', root), me?.user?.email || me?.email || '—');

    const plan = me?.plan || me?.entitlements?.plan || 'free';
    setText(qs('[data-profile-plan]', root), plan);
    applyPlanBadge(root, plan);
    updateStepStatuses(root, me);

    const k = me?.api_key || null;
    setText(qs('[data-profile-active-prefix]', root), k?.key_prefix || '—');
    setText(qs('[data-profile-active-created]', root), fmtIso(k?.created_at));
    setText(qs('[data-profile-active-used]', root), k?.last_used_at ? fmtIso(k.last_used_at) : '—');
    setText(
      qs('[data-profile-active-scopes]', root),
      Array.isArray(k?.scopes) ? k.scopes.join(', ') : '—'
    );
    setText(qs('[data-profile-active-id]', root), k?.key_id || '—');

    // 2) list keys table
    await refreshKeysTable(root);

    // 2b) email preferences
    await hydratePreferences(root);

    // 2c) onboarding links
    await hydrateOnboardingLinks(root);

    // 2d) billing tab
    await hydrateBillingTab(root, me);

    // 3) render sticky reveal (if present)
    renderReveal(root);
  }

  async function refreshKeysTable(root) {
    const tbody = qs('[data-profile-keys-tbody]', root);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="hp-muted">Loading…</td></tr>`;

    let data;
    try {
      data = await getJson(`${API_ORIGIN}/v1/keys/list`);
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        redirectToLogin();
        return;
      }
      console.warn(LOG, 'failed to load keys list', e);
      tbody.innerHTML = `<tr><td colspan="7" class="hp-muted">Unable to load keys.</td></tr>`;
      return;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="hp-muted">No keys found.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((k) => {
        const isActive = k.status === 'active';
        const badgeClass = isActive ? 'hp-badge hp-badge--active' : 'hp-badge hp-badge--revoked';
        const badgeText = isActive ? 'active' : 'revoked';
        const scopes = Array.isArray(k.scopes) ? k.scopes.join(', ') : '—';

        const actions = isActive
          ? `
            <span class="hp-rowActions">
              <button class="hp-rowBtn" type="button" data-profile-action="copy-prefix-row" data-key-prefix="${escapeAttr(
                k.key_prefix || ''
              )}">Copy prefix</button>
              <button class="hp-rowBtn" type="button" data-profile-action="revoke" data-key-id="${escapeAttr(
                k.key_id
              )}">Revoke</button>
            </span>
          `
          : `<span class="hp-muted">—</span>`;

        return `
        <tr>
          <td><span class="${badgeClass}">${badgeText}</span></td>
          <td><code class="hp-code" style="display:inline-block; padding:2px 8px;">${escapeHtml(
            k.key_prefix || '—'
          )}</code></td>
          <td>${escapeHtml(scopes)}</td>
          <td>${escapeHtml(fmtIso(k.created_at))}</td>
          <td>${escapeHtml(k.last_used_at ? fmtIso(k.last_used_at) : '—')}</td>
          <td>${escapeHtml(k.revoked_at ? fmtIso(k.revoked_at) : '—')}</td>
          <td style="text-align:right;">${actions}</td>
        </tr>
      `;
      })
      .join('');
  }

  async function rotateKey(root) {
    const btn = qs('[data-profile-action="rotate"]', root);
    if (!btn) return;

    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Rotating…';
    setStatus(root, 'Rotating key…', '');

    try {
      // Find current active key_id from /v1/keys/list (so rotate can revoke it)
      const list = await getJson(`${API_ORIGIN}/v1/keys/list`);
      const active =
        (Array.isArray(list?.items) ? list.items : []).find((k) => k.status === 'active') || null;

      const res = await postJson(`${API_ORIGIN}/v1/keys/rotate`, {
        revoke_key_id: active?.key_id || undefined,
      });

      const raw = res?.api_key;
      if (!raw) throw new Error('Rotate succeeded but API did not return api_key');

      // Sticky reveal until dismissed (prevents “I never saw it”)
      STATE.revealRawKey = String(raw);
      STATE.revealVisible = true;
      STATE.revealMasked = false;

      setStatus(root, 'New API key created. Copy it now (shown only once).', 'ok');

      await hydrate(root);
    } catch (e) {
      console.warn(LOG, 'rotate failed', e);
      setStatus(root, `Rotate failed: ${e?.message || e}`, 'warn');
    } finally {
      btn.textContent = prev;
      btn.disabled = false;
    }
  }

  async function revokeKey(root, keyId) {
    if (!keyId) return;

    const ok = window.confirm('Revoke this key? Any clients using it will immediately lose access.');
    if (!ok) return;

    try {
      setStatus(root, 'Revoking key…', '');
      await postJson(`${API_ORIGIN}/v1/keys/revoke`, { key_id: String(keyId) });

      // If user revoked active, also clear reveal state (raw key is no longer useful)
      const activeId = (qs('[data-profile-active-id]', root)?.textContent || '').trim();
      if (activeId && String(activeId) === String(keyId)) {
        STATE.revealVisible = false;
        STATE.revealRawKey = '';
      }

      setStatus(root, 'Key revoked.', 'ok');
      await hydrate(root);
    } catch (e) {
      console.warn(LOG, 'revoke failed', e);
      setStatus(root, `Revoke failed: ${e?.message || e}`, 'warn');
    }
  }

  async function revokeActiveKey(root) {
    const activeId = (qs('[data-profile-active-id]', root)?.textContent || '').trim();
    if (!activeId || activeId === '—') {
      setStatus(root, 'No active key found.', 'warn');
      return;
    }
    await revokeKey(root, activeId);
  }

  async function copyNewKey(root) {
    const keyEl = qs('[data-profile-newkey]', root);
    const isMasked = keyEl?.getAttribute('data-masked') === '1';

    if (!STATE.revealRawKey || !STATE.revealVisible) {
      setStatus(root, 'No new key to copy. Click “Rotate key” to generate one.', 'warn');
      return;
    }
    if (isMasked) {
      setStatus(root, 'Key is hidden. Click “Show” first, then copy.', 'warn');
      return;
    }

    const ok = await copyToClipboard(STATE.revealRawKey);
    setStatus(root, ok ? 'Copied.' : 'Copy failed. Your browser may block clipboard access.', ok ? 'ok' : 'warn');
  }

  async function copyPrefix(root) {
    const prefix = (qs('[data-profile-active-prefix]', root)?.textContent || '').trim();
    if (!prefix || prefix === '—') {
      setStatus(root, 'No active prefix to copy.', 'warn');
      return;
    }
    const ok = await copyToClipboard(prefix);
    setStatus(root, ok ? 'Prefix copied.' : 'Copy failed.', ok ? 'ok' : 'warn');
  }

  function toggleRevealVisibility(root) {
    if (!STATE.revealVisible) return;
    STATE.revealMasked = !STATE.revealMasked;
    renderReveal(root);
  }

  function dismissReveal(root) {
    STATE.revealVisible = false;
    STATE.revealRawKey = '';
    STATE.revealMasked = false;
    setStatus(root, 'Dismissed. (Raw token can’t be viewed again.)', '');
    renderReveal(root);
  }

  function scrollToWithHeaderOffsetCompat(targetEl, extra = 12) {
    if (!targetEl) return;

    if (typeof window.scrollToWithHeaderOffset === 'function') {
      window.scrollToWithHeaderOffset(targetEl, extra);
      return;
    }

    const header =
      document.querySelector('.site-header') ||
      document.querySelector('#site-header .site-header') ||
      document.querySelector('nav.navbar');

    const headerH =
      header?.getBoundingClientRect().height ||
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h') || '70', 10) ||
      70;

    const y = window.scrollY + targetEl.getBoundingClientRect().top - headerH - extra;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  function ensureContentWidgetVisible() {
    const widget = document.getElementById(MOUNT_ID);
    if (widget) widget.classList.add('active');
    return widget;
  }

  function updateStepStatuses(root, me) {
    const steps = qa('[data-step]', root);
    for (const step of steps) {
      const name = step.getAttribute('data-step');
      const num = qs('.hp-step__num', step);
      if (!num) continue;

      let completed = false;
      if (name === 'login') completed = !!me?.user_login;
      if (name === 'subscribe') completed = me?.plan && me.plan !== 'free';
      if (name === 'apikey') completed = !!me?.api_key?.key_id;

      num.setAttribute('data-step-status', completed ? 'completed' : 'pending');
      if (completed) num.textContent = '\u2713';
    }
  }

  function applyPlanBadge(root, plan) {
    const pillEl = qs('[data-profile-plan]', root);
    if (!pillEl) return;

    pillEl.classList.remove('hp-pill--free', 'hp-pill--pro', 'hp-pill--enterprise');
    const p = String(plan || 'free').toLowerCase();
    pillEl.classList.add(`hp-pill--${p}`);

    // Add upgrade link for free users
    const existing = qs('.hp-pill__upgrade', root);
    if (existing) existing.remove();
    if (p === 'free') {
      const link = document.createElement('a');
      link.className = 'hp-pill__upgrade';
      link.href = '#subscribe';
      link.textContent = 'Upgrade';
      pillEl.parentElement.appendChild(link);
    }
  }

  function wireServicesToggle(root) {
    const btn = qs('[data-services-toggle]', root);
    const grid = qs('[data-services-grid]', root);
    if (!btn || !grid) return;

    btn.addEventListener('click', () => {
      const hidden = grid.hidden;
      grid.hidden = !hidden;
      btn.textContent = hidden ? 'Hide services' : 'Show services';
    });
  }

  function switchTab(root, tabName) {
    const tabs = qa('[data-profile-tab]', root);
    const panels = qa('[data-profile-panel]', root);

    tabs.forEach((t) => {
      const selected = t.getAttribute('data-profile-tab') === tabName;
      t.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    panels.forEach((p) => {
      const active = p.getAttribute('data-profile-panel') === tabName;
      p.hidden = !active;
    });
  }

  function wireProfileTabs(root) {
    const tabBar = qs('.hp-profile__tabs', root);
    if (!tabBar) return;

    tabBar.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-profile-tab]');
      if (!tab) return;
      const name = tab.getAttribute('data-profile-tab');
      switchTab(root, name);
      const hash = name === 'overview' ? '#profile' : '#profile/' + name;
      history.replaceState(null, '', hash);
    });
  }

  const CHECKOUT_ORIGIN = 'https://checkout.haiphen.io';

  function setBillingStatus(root, msg, kind) {
    const el = qs('[data-profile-billing-status]', root);
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; el.classList.remove('hp-status--ok', 'hp-status--warn'); return; }
    el.hidden = false;
    el.textContent = String(msg);
    el.classList.remove('hp-status--ok', 'hp-status--warn');
    if (kind === 'ok') el.classList.add('hp-status--ok');
    if (kind === 'warn') el.classList.add('hp-status--warn');
  }

  async function hydrateBillingTab(root, me) {
    const plan = me?.plan || me?.entitlements?.plan || 'free';
    const billingPlanEl = qs('[data-profile-billing-plan]', root);
    if (billingPlanEl) {
      setText(billingPlanEl, plan);
      billingPlanEl.classList.remove('hp-pill--free', 'hp-pill--pro', 'hp-pill--enterprise');
      billingPlanEl.classList.add(`hp-pill--${plan.toLowerCase()}`);
    }

    const RATE_LIMITS = { free: '60/min', pro: '600/min', enterprise: '6,000/min' };
    const QUOTAS = { free: '200/day', pro: '10,000/day', enterprise: '50,000/day' };
    setText(qs('[data-profile-rate-limit]', root), RATE_LIMITS[plan.toLowerCase()] || '60/min');
    setText(qs('[data-profile-daily-quota]', root), QUOTAS[plan.toLowerCase()] || '200/day');

    // Fetch live billing data from checkout worker
    let accountData = null;
    try {
      accountData = await getJson(`${CHECKOUT_ORIGIN}/v1/account/status`);
    } catch (e) {
      // Non-critical: if checkout is unreachable, static data is still shown
      console.warn(LOG, 'failed to load account status', e);
    }

    if (accountData?.ok) {
      // Plan status
      const statusText = accountData.plan_active ? 'Active' : (accountData.entitled ? 'Entitled' : 'Inactive');
      setText(qs('[data-profile-plan-status]', root), statusText);

      // Update plan from live data if different
      const livePlan = accountData.plan || plan;
      if (billingPlanEl) {
        setText(billingPlanEl, livePlan);
        billingPlanEl.classList.remove('hp-pill--free', 'hp-pill--pro', 'hp-pill--enterprise');
        billingPlanEl.classList.add(`hp-pill--${livePlan.toLowerCase()}`);
      }
      setText(qs('[data-profile-rate-limit]', root), RATE_LIMITS[livePlan.toLowerCase()] || '60/min');
      setText(qs('[data-profile-daily-quota]', root), QUOTAS[livePlan.toLowerCase()] || '200/day');

      // Subscriptions table
      const subs = Array.isArray(accountData.subscriptions) ? accountData.subscriptions : [];
      const subsSection = qs('[data-profile-subs-section]', root);
      const subsTbody = qs('[data-profile-subs-tbody]', root);

      if (subs.length > 0 && subsSection && subsTbody) {
        subsSection.hidden = false;
        subsTbody.innerHTML = subs.map((s) => {
          const sid = escapeHtml(s.service_id || '—');
          const status = escapeHtml(s.status || '—');
          const since = s.current_period_start ? escapeHtml(fmtIso(s.current_period_start)) : '—';
          const badgeClass = s.status === 'active' ? 'hp-badge hp-badge--active' :
                             s.status === 'trialing' ? 'hp-badge hp-badge--active' :
                             'hp-badge hp-badge--revoked';
          return `<tr><td>${sid}</td><td><span class="${badgeClass}">${status}</span></td><td>${since}</td></tr>`;
        }).join('');
      }

      // Show portal + cancel buttons for paying users
      const portalBtn = qs('[data-profile-action="portal"]', root);
      const suspendBtn = qs('[data-profile-action="suspend"]', root);
      const hasStripeCustomer = !!accountData.stripe_customer_id;
      const hasActiveSubs = subs.some((s) => s.status === 'active' || s.status === 'trialing');

      if (portalBtn && hasStripeCustomer) portalBtn.hidden = false;
      if (suspendBtn && hasActiveSubs) suspendBtn.hidden = false;

      // Update note text for paid users
      const noteEl = qs('[data-profile-billing-note]', root);
      if (noteEl && hasActiveSubs) {
        noteEl.textContent = 'Manage your subscription or cancel anytime.';
      }
    } else {
      setText(qs('[data-profile-plan-status]', root), plan === 'free' ? 'Free tier' : '—');
    }
  }

  function wire(root) {
    if (root.__haiphenProfileWired) return;
    root.__haiphenProfileWired = true;

    wireServicesToggle(root);
    wireProfileTabs(root);

    root.addEventListener('click', async (e) => {
      const t = e.target;

      const rotate = t?.closest?.('[data-profile-action="rotate"]');
      if (rotate) {
        e.preventDefault();
        await rotateKey(root);
        return;
      }

      const copy = t?.closest?.('[data-profile-action="copy-new"]');
      if (copy) {
        e.preventDefault();
        await copyNewKey(root);
        return;
      }

      const toggleVis = t?.closest?.('[data-profile-action="toggle-visibility"]');
      if (toggleVis) {
        e.preventDefault();
        toggleRevealVisibility(root);
        return;
      }

      const dismiss = t?.closest?.('[data-profile-action="dismiss-reveal"]');
      if (dismiss) {
        e.preventDefault();
        dismissReveal(root);
        return;
      }

      const revoke = t?.closest?.('[data-profile-action="revoke"]');
      if (revoke) {
        e.preventDefault();
        const keyId = revoke.getAttribute('data-key-id');
        await revokeKey(root, keyId);
        return;
      }

      const revokeActive = t?.closest?.('[data-profile-action="revoke-active"]');
      if (revokeActive) {
        e.preventDefault();
        await revokeActiveKey(root);
        return;
      }

      const copyPrefixBtn = t?.closest?.('[data-profile-action="copy-prefix"]');
      if (copyPrefixBtn) {
        e.preventDefault();
        await copyPrefix(root);
        return;
      }

      const copyPrefixRow = t?.closest?.('[data-profile-action="copy-prefix-row"]');
      if (copyPrefixRow) {
        e.preventDefault();
        const prefix = copyPrefixRow.getAttribute('data-key-prefix') || '';
        const ok = await copyToClipboard(prefix);
        setStatus(root, ok ? 'Prefix copied.' : 'Copy failed.', ok ? 'ok' : 'warn');
        return;
      }

      const portal = t?.closest?.('[data-profile-action="portal"]');
      if (portal) {
        e.preventDefault();
        portal.disabled = true;
        portal.textContent = 'Opening…';
        setBillingStatus(root, 'Opening Stripe billing portal…', '');
        try {
          const res = await postJson(`${CHECKOUT_ORIGIN}/v1/billing/portal`, {});
          if (res?.url) {
            window.location.assign(res.url);
          } else {
            setBillingStatus(root, 'Unable to open billing portal.', 'warn');
          }
        } catch (err) {
          setBillingStatus(root, `Portal error: ${err?.message || err}`, 'warn');
        } finally {
          portal.disabled = false;
          portal.textContent = 'Manage Billing';
        }
        return;
      }

      const suspend = t?.closest?.('[data-profile-action="suspend"]');
      if (suspend) {
        e.preventDefault();
        const confirmed = window.confirm(
          'Cancel your plan? All active subscriptions will be canceled with a prorated refund. You will be downgraded to the free tier.'
        );
        if (!confirmed) return;

        suspend.disabled = true;
        suspend.textContent = 'Canceling…';
        setBillingStatus(root, 'Canceling subscriptions…', '');
        try {
          const res = await postJson(`${CHECKOUT_ORIGIN}/v1/account/suspend`, {});
          if (res?.ok) {
            const note = res.refund_note || 'Plan canceled.';
            setBillingStatus(root, `Plan canceled. ${note}`, 'ok');
            // Refresh billing tab to show updated state
            await hydrate(root);
          } else {
            setBillingStatus(root, `Cancel failed: ${res?.error || 'Unknown error'}`, 'warn');
          }
        } catch (err) {
          setBillingStatus(root, `Cancel failed: ${err?.message || err}`, 'warn');
        } finally {
          suspend.disabled = false;
          suspend.textContent = 'Cancel Plan';
        }
        return;
      }

      // Not present in your current HTML, but harmless to keep.
      const close = t?.closest?.('[data-profile-action="close"]');
      if (close) {
        e.preventDefault();
        try {
          if (typeof NS.hideOverlay === 'function') NS.hideOverlay();
        } catch {
          /* noop */
        }
      }
    });

    const prefForm = qs('[data-profile-pref-form]', root);
    if (prefForm) {
      prefForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await savePreferences(root);
      });
    }
  }

  async function showProfile(opts = {}) {
    try {
      ensureContentWidgetVisible();
      await ensureMounted(opts);
    } catch (e) {
      console.warn(LOG, 'failed to mount profile', e);
      setStatus(ensureMountEl(), `Unable to load profile: ${e?.message || e}`, 'warn');
      try {
        window.alert(`Unable to load profile: ${e?.message || e}`);
      } catch {
        /* noop */
      }
    }
  }

  // ---- Public API (single assignment, wrapped once) ----
  NS.showProfile = async function showProfileWithHash(opts = {}) {
    const preserveHash = !!opts?.preserveHash;
    const subId = String(opts?.subId || '').trim();
    const tab = String(opts?.tab || opts?.subId || '').trim();
    if (!preserveHash) setProfileHash(subId);
    return await showProfile({ subId, tab });
  };

  // Optional: auto-open if user visits /#profile directly
  window.addEventListener('DOMContentLoaded', () => {
    if (shouldAutoOpenProfile()) {
      NS.showProfile({ preserveHash: true, subId: hashSubId() }).catch((e) =>
        console.warn(LOG, 'auto-open profile failed', e)
      );
    }
  });

  // Sidebar/header navigation hook
  window.addEventListener('haiphen:session:navigate', (ev) => {
    const page = ev?.detail?.page;
    const tab = ev?.detail?.tab || null;
    const profilePages = ['profile', 'settings', 'billing', 'quota', 'apikeys'];
    if (profilePages.includes(page)) {
      ensureContentWidgetVisible();
      if (typeof window.showSection === 'function') window.showSection('Profile');
      NS.showProfile({ tab }).catch((e) => console.warn(LOG, 'showProfile failed', e));
    }
  });
})();
