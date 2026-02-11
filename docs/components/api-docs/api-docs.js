(function () {
  'use strict';

  const DEFAULT_SECTIONS = [
    { id: 'docs-overview', label: 'Overview', financeLabel: 'Overview' },
    { id: 'docs-install', label: 'Install', financeLabel: 'Install' },
    { id: 'docs-quickstart', label: 'Quickstart', financeLabel: 'Quickstart' },
    { id: 'docs-try', label: 'Try it', financeLabel: 'Try it' },
    { id: 'docs-auth', label: 'Authentication', financeLabel: 'Authentication' },
    { id: 'docs-rate-limits', label: 'Rate limits', financeLabel: 'Rate limits' },
    { id: 'docs-data-model', label: 'Data model', financeLabel: 'Data model' },
    { id: 'docs-endpoints', label: 'Endpoints', financeLabel: 'Endpoints' },
    { id: 'docs-trade-telemetry', label: 'Trade Telemetry', financeLabel: 'Trade Signals' },
    { id: 'docs-secure', label: 'Secure', financeLabel: 'Compliance' },
    { id: 'docs-network', label: 'Network Trace', financeLabel: 'Market Data' },
    { id: 'docs-graph', label: 'Knowledge Graph', financeLabel: 'Entity Intel' },
    { id: 'docs-risk', label: 'Risk Analysis', financeLabel: 'Portfolio Risk' },
    { id: 'docs-causal', label: 'Causal Chain', financeLabel: 'Trade Chains' },
    { id: 'docs-supply', label: 'Supply Chain', financeLabel: 'Counterparty' },
    { id: 'docs-prospect', label: 'Prospect Engine', financeLabel: 'Vuln Intel' },
    { id: 'docs-cli-commands', label: 'CLI Commands', financeLabel: 'CLI Commands' },
    { id: 'docs-errors', label: 'Errors', financeLabel: 'Errors' },
    { id: 'docs-lineage', label: 'Lineage', financeLabel: 'Data Lineage' },
    { id: 'docs-changelog', label: 'Changelog', financeLabel: 'Changelog' },
    { id: 'docs-rss-overview', label: 'RSS / Atom', financeLabel: 'RSS / Atom' },
    { id: 'docs-webhooks', label: 'Webhooks', financeLabel: 'Webhooks' },
  ];

  const TRY_STORAGE = {
    base: 'haiphen.docs.api_base',
    key: 'haiphen.docs.api_key',
  };

  function qs(root, sel) {
    return (root || document).querySelector(sel);
  }
  function qsa(root, sel) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getHeaderHeight() {
    const header =
      document.querySelector('.site-header') ||
      document.querySelector('#site-header .site-header') ||
      document.querySelector('nav.navbar');
    const h = header?.getBoundingClientRect().height;
    return Number.isFinite(h) && h > 0 ? h : 70;
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return;

    const headerH = getHeaderHeight();
    const y = window.scrollY + el.getBoundingClientRect().top - headerH - 12;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
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

  function setToast(root, msg) {
    let toast = qs(root, '[data-api-toast]');
    if (!toast) {
      toast = document.createElement('div');
      toast.setAttribute('data-api-toast', '1');
      toast.style.position = 'fixed';
      toast.style.right = '16px';
      toast.style.bottom = '16px';
      toast.style.zIndex = '4000';
      toast.style.background = 'rgba(15,23,42,0.92)';
      toast.style.color = '#fff';
      toast.style.padding = '10px 12px';
      toast.style.borderRadius = '12px';
      toast.style.fontWeight = '800';
      toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'opacity 160ms ease, transform 160ms ease';
      document.body.appendChild(toast);
    }

    toast.textContent = msg;
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    window.clearTimeout(toast.__t);
    toast.__t = window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
    }, 1200);
  }

  function setActiveNav(nav, id) {
    qsa(nav, 'a[data-doc-id]').forEach((a) => {
      const active = a.getAttribute('data-doc-id') === id;
      a.classList.toggle('is-active', active);
      if (active) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function buildNav(root) {
    const nav = qs(root, '[data-api-nav]');
    const main = qs(root, '[data-api-main]');
    if (!nav || !main) return;

    const presentIds = new Set(
      qsa(root, '[data-api-section]')
        .map((s) => s.id)
        .filter(Boolean)
    );

    const sections = DEFAULT_SECTIONS.filter((s) => presentIds.has(s.id));

    nav.innerHTML = sections
      .map(
        (s) =>
          `<a href="javascript:void(0)" data-doc-id="${s.id}" aria-label="Jump to ${s.label}">
            ${s.label}
          </a>`
      )
      .join('');

    nav.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-doc-id]');
      if (!a) return;
      const id = a.getAttribute('data-doc-id');
      if (!id) return;
      setActiveNav(nav, id);
      scrollToId(id);

      // Update the URL hash without triggering the SPA router (which would
      // re-mount the entire Docs section and scroll to the top).
      try {
        history.replaceState(null, '', `#docs:${id}`);
      } catch {}
    });

    const obs = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((x) => x.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        setActiveNav(nav, best.target.id);
      },
      { root: null, threshold: [0.25, 0.4, 0.55, 0.7] }
    );

    qsa(root, '[data-api-section]').forEach((sec) => obs.observe(sec));
    root.__apiNavObs = obs;
  }

  function wireTabs(root) {
    const tabs = qsa(root, '[data-api-tab]');
    const panels = qsa(root, '[data-api-panel]');
    if (tabs.length === 0 || panels.length === 0) return;

    function activate(name) {
      tabs.forEach((t) => {
        const on = t.getAttribute('data-api-tab') === name;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-api-panel') === name));
    }

    tabs.forEach((t) => t.addEventListener('click', () => activate(t.getAttribute('data-api-tab'))));
  }

  function wireCopy(root) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-copy-btn]');
      if (!btn) return;
      const text = btn.getAttribute('data-copy-btn') || '';
      if (!text) return;
      const ok = await copyText(text);
      setToast(root, ok ? 'Copied' : 'Copy failed');
    });

    root.addEventListener('click', async (e) => {
      const code = e.target.closest('code[data-copy]');
      if (!code) return;
      const text = code.getAttribute('data-copy') || code.textContent || '';
      if (!text) return;
      const ok = await copyText(text.trim());
      setToast(root, ok ? 'Copied' : 'Copy failed');
    });
  }

  function wireCodeCopy(root) {
    qsa(root, 'pre.api-code').forEach(function (pre) {
      // Skip the try-it output block
      if (pre.classList.contains('api-try-out')) return;
      var btn = document.createElement('button');
      btn.className = 'api-code-copy';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var code = pre.querySelector('code');
        var text = code ? code.textContent : pre.textContent;
        var ok = await copyText(text.trim());
        setToast(root, ok ? 'Copied' : 'Copy failed');
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1200);
      });
      pre.appendChild(btn);
    });
  }

  function buildFilterIndex(root) {
    var nav = qs(root, '[data-api-nav]');
    if (!nav) return {};
    var idx = {};
    qsa(nav, 'a[data-doc-id]').forEach(function (a) {
      var id = a.getAttribute('data-doc-id');
      var label = (a.textContent || '').trim().toLowerCase();
      var sec = id && root.querySelector('#' + id);
      var body = sec ? (sec.textContent || '').toLowerCase() : '';
      idx[id] = label + ' ' + body;
    });
    root.__filterIndex = idx;
    return idx;
  }

  function wireFilter(root) {
    const input = qs(root, '[data-api-filter]');
    const nav = qs(root, '[data-api-nav]');
    if (!input || !nav) return;

    buildFilterIndex(root);

    input.addEventListener('input', () => {
      const q = String(input.value || '').trim().toLowerCase();
      const idx = root.__filterIndex || {};
      qsa(nav, 'a[data-doc-id]').forEach((a) => {
        var id = a.getAttribute('data-doc-id');
        var haystack = idx[id] || '';
        a.style.display = q && !haystack.includes(q) ? 'none' : '';
      });
    });
  }

  function wireActions(root) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-api-action]');
      if (!el) return;
      const action = el.getAttribute('data-api-action');

      if (action === 'request-access') {
        // Auth + Stripe + return to docs
        const fn = window?.HAIPHEN?.ApiAccess?.requestAccess;
        if (typeof fn === 'function') {
          fn({ returnHash: '#docs' });
        } else {
          // fallback
          if (typeof window.showSection === 'function') window.showSection('Contact');
        }
        return;
      }

      if (action === 'view-changelog') {
        scrollToId('docs-changelog');
        return;
      }
    });
  }

  function maybeScrollFromHash() {
    try {
      const raw = String(window.location.hash || '').replace(/^#/, '').trim();
      if (!raw) return;
      const [slug, subId] = raw.split(':');
      if (String(slug || '').toLowerCase() !== 'docs') return;
      if (!subId) return;
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToId(subId)));
    } catch {}
  }

  function normalizeBaseUrl(s) {
    const raw = String(s || '').trim();
    if (!raw) return '';
    const noTrail = raw.replace(/\/+$/, '');
    // accept either https://api.haiphen.io OR https://api.haiphen.io/v1 in UI
    return noTrail;
  }

  function ensureV1(base) {
    const b = normalizeBaseUrl(base);
    if (!b) return '';
    return /\/v1$/i.test(b) ? b : `${b}/v1`;
  }

  async function tryFetchJson(url, headers) {
    const resp = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {
      ok: resp.ok,
      status: resp.status,
      headers: {
        requestId: resp.headers.get('x-request-id') || resp.headers.get('X-Request-Id') || null,
        contentType: resp.headers.get('content-type') || null,
      },
      bodyText: text,
      bodyJson: json,
    };
  }

  function wireTryIt(root) {
    const baseInput = qs(root, '[data-api-try-base]');
    const keyInput = qs(root, '[data-api-try-key]');
    const saveBtn = qs(root, '[data-api-try-save]');
    const clearBtn = qs(root, '[data-api-try-clear]');
    const out = qs(root, '[data-api-try-out]');
    if (!baseInput || !keyInput || !saveBtn || !clearBtn || !out) return;

    const savedBase = sessionStorage.getItem(TRY_STORAGE.base) || 'https://api.haiphen.io';
    const savedKey = sessionStorage.getItem(TRY_STORAGE.key) || '';
    baseInput.value = savedBase;
    keyInput.value = savedKey;

    function render(obj) {
      const pretty = JSON.stringify(obj, null, 2);
      out.textContent = pretty;
    }

    saveBtn.addEventListener('click', () => {
      const base = normalizeBaseUrl(baseInput.value);
      const key = String(keyInput.value || '').trim();
      if (!base) { setToast(root, 'Base URL required'); return; }
      sessionStorage.setItem(TRY_STORAGE.base, base);
      sessionStorage.setItem(TRY_STORAGE.key, key);
      setToast(root, 'Saved');
    });

    clearBtn.addEventListener('click', () => {
      sessionStorage.removeItem(TRY_STORAGE.base);
      sessionStorage.removeItem(TRY_STORAGE.key);
      baseInput.value = 'https://api.haiphen.io';
      keyInput.value = '';
      setToast(root, 'Cleared');
      render({ hint: 'Click a request above. Output will render here.' });
    });

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-api-try]');
      if (!btn) return;
      
      // 🔒 entitlement gate: blocks “Try it” unless user has API entitlement
      const gate = window.HAIPHEN?.EntitlementGate?.requireEntitlement;
      if (typeof gate === 'function') {
        const result = await gate('api');     // feature key: 'api'
        if (!result?.ok) return;              // gate already redirected / showed UI
      }

      const mode = btn.getAttribute('data-api-try');
      const base = sessionStorage.getItem(TRY_STORAGE.base) || baseInput.value;
      const key = sessionStorage.getItem(TRY_STORAGE.key) || keyInput.value;

      const v1 = ensureV1(base);
      if (!v1) { setToast(root, 'Base URL required'); return; }
      if (!key) { setToast(root, 'API key required'); return; }

      let path = '/metrics/kpis';
      if (mode === 'assets') path = '/metrics/portfolio-assets?limit=5';
      if (mode === 'series') path = '/metrics/series?kpi=Daily%20PnL&limit=5';

      render({ loading: true, url: `${v1}${path}` });

      try {
        const res = await tryFetchJson(`${v1}${path}`, {
          Authorization: `Bearer ${key}`,
        });

        const payload = res.bodyJson || { raw: res.bodyText };
        render({
          request: { url: `${v1}${path}` },
          response: {
            ok: res.ok,
            status: res.status,
            request_id: res.headers.requestId,
            content_type: res.headers.contentType,
          },
          body: payload,
        });

        setToast(root, res.ok ? 'OK' : `HTTP ${res.status}`);
      } catch (err) {
        render({ error: String(err && err.message ? err.message : err) });
        setToast(root, 'Request failed');
      }
    });
  }

  function init(root) {
    if (!root || root.__apiDocsWired) return;
    root.__apiDocsWired = true;

    buildNav(root);
    wireTabs(root);
    wireCopy(root);
    wireCodeCopy(root);
    wireFilter(root);
    wireActions(root);
    wireTryIt(root);
    maybeScrollFromHash();
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadApiDocs = async function loadApiDocs(mountSelector = '#api-docs-mount') {
    const mount = document.querySelector(mountSelector);
    if (!mount) return;

    if (mount.__apiDocsMounted) return;
    mount.__apiDocsMounted = true;

    const basePath = 'components/api-docs';

    try {
      const [htmlResp, cssResp] = await Promise.all([
        fetch(`${basePath}/api-docs.html`, { cache: 'no-store' }),
        fetch(`${basePath}/api-docs.css`, { cache: 'no-store' }),
      ]);

      if (!htmlResp.ok) throw new Error(`Failed to load api-docs.html (${htmlResp.status})`);
      if (!cssResp.ok) throw new Error(`Failed to load api-docs.css (${cssResp.status})`);

      const [html, css] = await Promise.all([htmlResp.text(), cssResp.text()]);

      if (!document.getElementById('api-docs-css')) {
        const style = document.createElement('style');
        style.id = 'api-docs-css';
        style.textContent = css;
        document.head.appendChild(style);
      }

      mount.innerHTML = html;

      const root = mount.querySelector('#api-docs') || mount;
      init(root);

      // Load finance overrides + apply current lens
      loadFinanceOverrides(root);
    } catch (err) {
      console.warn('[api-docs] failed to mount', err);
      mount.innerHTML = `<div style="text-align:left;">
        <h3>Docs unavailable</h3>
        <p class="api-muted">Failed to load API documentation assets.</p>
      </div>`;
    }
  };

  /* ── Finance lens overrides ── */

  let _financeTemplates = null;  // Map<id, DocumentFragment>
  let _techOriginals = null;     // Map<id, HTMLElement>

  async function loadFinanceOverrides(root) {
    if (_financeTemplates) {
      applyLensToApiDocs(root);
      return;
    }

    try {
      const resp = await fetch('components/api-docs/api-docs-finance.html', { cache: 'no-store' });
      if (!resp.ok) return;
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const templates = doc.querySelectorAll('template[data-finance-override]');

      _financeTemplates = new Map();
      templates.forEach(function (tmpl) {
        const id = tmpl.getAttribute('data-finance-override');
        if (id) _financeTemplates.set(id, tmpl.content);
      });

      // Cache tech originals
      _techOriginals = new Map();
      _financeTemplates.forEach(function (_, id) {
        var el = root.querySelector('#' + id);
        if (el) _techOriginals.set(id, el.cloneNode(true));
      });

      applyLensToApiDocs(root);
    } catch (e) {
      console.warn('[api-docs] finance overrides failed', e);
    }

    // Listen for future lens changes
    window.addEventListener('haiphen:lens', function () {
      var docsRoot = document.querySelector('#api-docs') || document.querySelector('#api-docs-mount');
      if (docsRoot) applyLensToApiDocs(docsRoot);
    });
  }

  function refreshNavLabels(root) {
    var lens = document.documentElement.getAttribute('data-lens') || 'tech';
    var nav = qs(root, '[data-api-nav]');
    if (!nav) return;

    DEFAULT_SECTIONS.forEach(function (s) {
      var a = nav.querySelector('a[data-doc-id="' + s.id + '"]');
      if (!a) return;
      var label = (lens === 'finance' && s.financeLabel) ? s.financeLabel : s.label;
      a.textContent = label;
      a.setAttribute('aria-label', 'Jump to ' + label);
    });
  }

  function applyLensToApiDocs(root) {
    if (!_financeTemplates || !_techOriginals) return;
    var lens = document.documentElement.getAttribute('data-lens') || 'tech';

    _financeTemplates.forEach(function (fragment, id) {
      var target = root.querySelector('#' + id);
      if (!target) return;

      if (lens === 'finance') {
        var clone = fragment.cloneNode(true);
        var newEl = clone.querySelector('#' + id);
        if (newEl) target.replaceWith(newEl);
      } else {
        var orig = _techOriginals.get(id);
        if (orig) target.replaceWith(orig.cloneNode(true));
      }
    });

    // Update nav labels to match current lens
    refreshNavLabels(root);

    // Re-wire code copy buttons on swapped sections (skip already-wired pre blocks)
    qsa(root, 'pre.api-code').forEach(function (pre) {
      if (pre.classList.contains('api-try-out')) return;
      if (pre.querySelector('.api-code-copy')) return;
      var btn = document.createElement('button');
      btn.className = 'api-code-copy';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var code = pre.querySelector('code');
        var text = code ? code.textContent : pre.textContent;
        var ok = await copyText(text.trim());
        setToast(root, ok ? 'Copied' : 'Copy failed');
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1200);
      });
      pre.appendChild(btn);
    });

    // Rebuild filter index so body-text search reflects swapped content
    buildFilterIndex(root);
  }
})();