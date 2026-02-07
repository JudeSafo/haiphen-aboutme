(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});

  function injectCssOnce(href) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Context-aware prompt suggestions mapped to navigation targets
  const PROMPT_MAP = {
    default: [
      { text: 'What services are available?', section: 'Services', elementId: 'services-plans-mount' },
      { text: 'Show me the trading metrics', section: 'Trades', elementId: 'fintech-metrics' },
      { text: 'How do I get started?', section: 'Onboarding', elementId: 'profile-onboarding' },
      { text: 'Read the API docs', section: 'Docs', elementId: 'docs-overview' },
      { text: 'Contact the team', section: 'Contact', elementId: 'contact-us' },
    ],
    Trades: [
      { text: 'View today\'s KPIs', section: 'Trades', elementId: 'fintech-metrics' },
      { text: 'Open the archive', section: 'Trades', elementId: 'trades-archive' },
      { text: 'See tech portfolio', section: 'Trades', elementId: 'portfolio-top' },
      { text: 'Cohort program details', section: 'Trades', elementId: 'cohort' },
    ],
    Docs: [
      { text: 'How do I authenticate?', section: 'Docs', elementId: 'docs-auth' },
      { text: 'Show CLI commands', section: 'Docs', elementId: 'docs-cli-commands' },
      { text: 'API endpoints reference', section: 'Docs', elementId: 'docs-endpoints' },
      { text: 'Security scanning docs', section: 'Docs', elementId: 'docs-secure' },
    ],
    Services: [
      { text: 'See all pricing plans', section: 'Services', elementId: 'services-plans-mount' },
      { text: 'Subscribe to a plan', section: 'Services', elementId: 'services-subscribe-banner' },
      { text: 'Explore tech services', section: 'Services', elementId: 'services-plans-mount' },
    ],
    OnePager: [
      { text: 'How the platform works', section: 'OnePager', elementId: 'how-it-works' },
      { text: 'Security ethos', section: 'OnePager', elementId: 'ethos' },
      { text: 'View the gallery', section: 'OnePager', elementId: 'services-gallery' },
      { text: 'Signals overview', section: 'OnePager', elementId: 'services-signals' },
    ],
    Profile: [
      { text: 'Generate an API key', section: 'Profile', elementId: 'profile' },
      { text: 'Check my plan status', section: 'Profile', elementId: 'profile' },
      { text: 'View onboarding steps', section: 'Onboarding', elementId: 'profile-onboarding' },
      { text: 'Email preferences', section: 'Profile', elementId: 'profile' },
    ],
    FAQ: [
      { text: 'What is Haiphen?', section: 'FAQ', elementId: 'faq-mount' },
      { text: 'How do I navigate?', section: 'FAQ', elementId: 'faq-mount' },
      { text: 'What about security?', section: 'FAQ', elementId: 'faq-mount' },
    ],
  };

  function getCurrentSection() {
    const hash = String(window.location.hash || '').replace('#', '').split(':')[0];
    const SECTION_MAP = {
      fintech: 'Trades', services: 'Services', collaborate: 'OnePager',
      docs: 'Docs', faq: 'FAQ', profile: 'Profile', onboarding: 'Profile',
      'contact-us': 'Contact', cohort: 'Trades', subscribe: 'Services',
    };
    return SECTION_MAP[hash.toLowerCase()] || 'default';
  }

  function getPrompts() {
    const section = getCurrentSection();
    return PROMPT_MAP[section] || PROMPT_MAP.default;
  }

  function navigate(entry) {
    const ss = NS.SiteSearch;
    if (ss?.close) ss.close();

    if (entry.section && typeof window.showSection === 'function') {
      window.showSection(entry.section);
      if (entry.elementId && typeof window.scrollToIdWhenReady === 'function') {
        window.scrollToIdWhenReady(entry.elementId, { maxAttempts: 80, delayMs: 50, extra: 12 });
      }
      if (typeof window.setHashForSection === 'function') {
        window.setHashForSection(entry.section, entry.elementId || '');
      }
    } else if (entry.elementId) {
      window.location.hash = `#${entry.elementId}`;
    }
  }

  function searchIndex(q) {
    if (!q || q.length < 2) return [];
    const qq = q.trim().toLowerCase();
    const results = [];
    for (const [, prompts] of Object.entries(PROMPT_MAP)) {
      for (const p of prompts) {
        if (p.text.toLowerCase().includes(qq)) {
          results.push(p);
        }
      }
    }
    return results.slice(0, 6);
  }

  NS.Chatbot = {
    async init(mountSelector) {
      const mount = document.querySelector(mountSelector);
      if (!mount) return;

      injectCssOnce('components/chatbot/chatbot.css');

      try {
        const html = await fetchText('components/chatbot/chatbot.html');
        mount.innerHTML = html;
      } catch (e) {
        console.warn('[chatbot] failed to load template', e);
        return;
      }

      const fab = mount.querySelector('[data-chatbot-toggle]');
      const panel = mount.querySelector('[data-chatbot-panel]');
      const hoverBar = mount.querySelector('[data-chatbot-hover-bar]');
      const hoverInput = mount.querySelector('[data-chatbot-hover-input]');
      const closeBtn = mount.querySelector('[data-chatbot-close]');
      const promptsEl = mount.querySelector('[data-chatbot-prompts]');
      const input = mount.querySelector('[data-chatbot-input]');
      const resultsEl = mount.querySelector('[data-chatbot-results]');
      if (!fab || !panel) return;

      let peekTimer = null;
      let isFullOpen = false;

      /* ---- State helpers ---- */

      const closeAll = () => {
        panel.classList.remove('is-open', 'is-peek');
        if (hoverBar) hoverBar.classList.remove('is-visible');
        if (resultsEl) resultsEl.classList.remove('is-visible');
        isFullOpen = false;
        if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
      };

      const openFull = () => {
        closeAll();
        renderPrompts();
        panel.classList.add('is-open');
        isFullOpen = true;
        if (input) { input.value = ''; input.focus(); }
      };

      const showPeek = () => {
        renderPrompts();
        panel.classList.add('is-peek');
        peekTimer = setTimeout(() => {
          panel.classList.remove('is-peek');
          peekTimer = null;
        }, 8000);
      };

      /* ---- Prompt rendering ---- */

      const renderPrompts = () => {
        const prompts = getPrompts();
        if (!promptsEl) return;
        promptsEl.innerHTML = prompts.map(p =>
          `<button class="hp-chatbot__prompt" type="button">${escapeHtml(p.text)}</button>`
        ).join('');
        promptsEl.querySelectorAll('.hp-chatbot__prompt').forEach((btn, i) => {
          btn.addEventListener('click', () => {
            navigate(prompts[i]);
            closeAll();
          });
        });
      };

      /* ---- FAB click: toggle full panel ---- */

      fab.addEventListener('click', () => {
        // If peek is showing, promote to full open
        if (panel.classList.contains('is-peek')) {
          panel.classList.remove('is-peek');
          if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
          openFull();
          return;
        }
        if (isFullOpen) closeAll(); else openFull();
      });

      /* ---- Hover bar: show on FAB mouseenter, hide on mouseleave ---- */

      let hoverIntent = null;

      fab.addEventListener('mouseenter', () => {
        // Only show hover bar when panel is not open
        if (isFullOpen || panel.classList.contains('is-peek')) return;
        hoverIntent = setTimeout(() => {
          if (hoverBar) hoverBar.classList.add('is-visible');
        }, 150);
      });

      const hideHoverBar = () => {
        if (hoverIntent) { clearTimeout(hoverIntent); hoverIntent = null; }
        // Small delay so user can move cursor from FAB to hover bar
        setTimeout(() => {
          if (hoverBar && !hoverBar.matches(':hover') && !fab.matches(':hover')) {
            hoverBar.classList.remove('is-visible');
          }
        }, 200);
      };

      fab.addEventListener('mouseleave', hideHoverBar);
      if (hoverBar) hoverBar.addEventListener('mouseleave', hideHoverBar);

      /* ---- Hover input: Enter key opens full panel with search ---- */

      if (hoverInput) {
        hoverInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const q = hoverInput.value.trim();
            openFull();
            if (hoverBar) hoverBar.classList.remove('is-visible');
            if (input && q) {
              input.value = q;
              input.dispatchEvent(new Event('input'));
            }
          }
        });
      }

      /* ---- Close button ---- */

      if (closeBtn) closeBtn.addEventListener('click', closeAll);

      /* ---- Close on outside click ---- */

      document.addEventListener('mousedown', (e) => {
        if (isFullOpen && !mount.contains(e.target)) closeAll();
      });

      /* ---- Close on Escape ---- */

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAll();
      });

      /* ---- Close panel and refresh prompts on hash change ---- */

      window.addEventListener('hashchange', () => {
        if (isFullOpen) closeAll();
      });

      /* ---- Free-text search in full panel ---- */

      if (input && resultsEl) {
        input.addEventListener('input', () => {
          const q = input.value.trim();
          if (q.length < 2) {
            resultsEl.classList.remove('is-visible');
            return;
          }
          const matches = searchIndex(q);
          if (!matches.length) {
            resultsEl.classList.remove('is-visible');
            return;
          }
          resultsEl.classList.add('is-visible');
          resultsEl.innerHTML = matches.map(m =>
            `<div class="hp-chatbot__result">${escapeHtml(m.text)}<div class="hp-chatbot__result-meta">${escapeHtml(m.section || '')}</div></div>`
          ).join('');
          resultsEl.querySelectorAll('.hp-chatbot__result').forEach((el, i) => {
            el.addEventListener('click', () => {
              navigate(matches[i]);
              closeAll();
            });
          });
        });
      }

      /* ---- Initial peek on first visit ---- */

      setTimeout(showPeek, 1500);
    }
  };
})();
