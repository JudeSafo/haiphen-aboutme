(function () {
  'use strict';

  const DEFAULT_SECTIONS = [
    { id: 'docs-overview', label: 'Overview' },
    { id: 'docs-auth', label: 'Authentication' },
    { id: 'docs-rate-limits', label: 'Rate limits' },
    { id: 'docs-endpoints', label: 'Endpoints' },
    { id: 'docs-errors', label: 'Errors' },
    { id: 'docs-lineage', label: 'Lineage' },
    { id: 'docs-changelog', label: 'Changelog' },
    { id: 'docs-rss-overview', label: 'RSS / Atom' },
    { id: 'docs-webhooks', label: 'Webhooks' },
  ];

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
      // fallback
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
    // lightweight inline feedback (no global dependency)
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
      a.classList.toggle('is-active', a.getAttribute('data-doc-id') === id);
    });
  }

  function buildNav(root) {
    const nav = qs(root, '[data-api-nav]');
    const main = qs(root, '[data-api-main]');
    if (!nav || !main) return;

    // Prefer actual sections present in DOM, fall back to defaults.
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

      // also update hash routing style used by your site
      // expected format: #docs:docs-overview
      try {
        if (typeof window.setHashForSection === 'function') {
          window.setHashForSection('Docs', id, { replace: false });
        } else {
          window.location.hash = `#docs:${id}`;
        }
      } catch {}
    });

    // Intersection observer: highlight current section in view
    const obs = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((x) => x.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        setActiveNav(nav, best.target.id);
      },
      {
        root: null,
        threshold: [0.25, 0.4, 0.55, 0.7],
      }
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

    tabs.forEach((t) => {
      t.addEventListener('click', () => activate(t.getAttribute('data-api-tab')));
    });
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

    // optional: click on <code data-copy="..."> itself
    root.addEventListener('click', async (e) => {
      const code = e.target.closest('code[data-copy]');
      if (!code) return;
      const text = code.getAttribute('data-copy') || code.textContent || '';
      if (!text) return;
      const ok = await copyText(text.trim());
      setToast(root, ok ? 'Copied' : 'Copy failed');
    });
  }

  function wireFilter(root) {
    const input = qs(root, '[data-api-filter]');
    const nav = qs(root, '[data-api-nav]');
    if (!input || !nav) return;

    input.addEventListener('input', () => {
      const q = String(input.value || '').trim().toLowerCase();
      qsa(nav, 'a[data-doc-id]').forEach((a) => {
        const label = a.textContent.trim().toLowerCase();
        a.style.display = q && !label.includes(q) ? 'none' : '';
      });
    });
  }

  function wireActions(root) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-api-action]');
      if (!el) return;
      const action = el.getAttribute('data-api-action');

      if (action === 'request-access') {
        // reuse your existing Contact section
        if (typeof window.showSection === 'function') window.showSection('Contact');
        return;
      }

      if (action === 'view-changelog') {
        scrollToId('docs-changelog');
        return;
      }
    });
  }

  function maybeScrollFromHash(root) {
    // supports: #docs or #docs:docs-auth (your existing router supports slug:subId)
    try {
      const raw = String(window.location.hash || '').replace(/^#/, '').trim();
      if (!raw) return;
      const [slug, subId] = raw.split(':');
      if (String(slug || '').toLowerCase() !== 'docs') return;
      if (!subId) return;

      // wait for layout, then scroll
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToId(subId)));
    } catch {}
  }

  function init(root) {
    if (!root || root.__apiDocsWired) return;
    root.__apiDocsWired = true;

    buildNav(root);
    wireTabs(root);
    wireCopy(root);
    wireFilter(root);
    wireActions(root);
    maybeScrollFromHash(root);
  }

  // Public loader used by docs/index.html
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadApiDocs = async function loadApiDocs(mountSelector = '#api-docs-mount') {
    const mount = document.querySelector(mountSelector);
    if (!mount) return;

    // Avoid reloading if already mounted
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

      // Inject CSS once
      if (!document.getElementById('api-docs-css')) {
        const style = document.createElement('style');
        style.id = 'api-docs-css';
        style.textContent = css;
        document.head.appendChild(style);
      }

      mount.innerHTML = html;

      const root = mount.querySelector('#api-docs') || mount;
      init(root);
    } catch (err) {
      console.warn('[api-docs] failed to mount', err);
      mount.innerHTML = `<div style="text-align:left;">
        <h3>Docs unavailable</h3>
        <p class="api-muted">Failed to load API documentation assets.</p>
      </div>`;
    }
  };
})();