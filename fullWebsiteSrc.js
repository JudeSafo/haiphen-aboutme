
===== docs/assets/site.js =====
/* docs/assets/site.js
 * Shared bootloader for all pages: mounts header/sidebar/footer, session pill,
 * optional trades overlay, and snap-stack highlighting.
 */
(() => {
  const AUTH_ORIGIN = 'https://auth.haiphen.io'; // change if needed

  function safeLoad(fn, name) {
    if (typeof fn !== 'function') return;
    Promise.resolve()
      .then(() => fn())
      .catch((err) => console.warn(`[${name}] load failed`, err));
  }

  async function updateSessionWidget() {
    const slot = document.getElementById('session-slot');
    if (!slot) return;

    const showLogin = () => {
      slot.innerHTML = `<a href="${AUTH_ORIGIN}/login" class="login-btn">Login</a>`;
    };

    try {
      const resp = await fetch(`${AUTH_ORIGIN}/me`, { credentials: 'include' });
      if (!resp.ok) return showLogin();

      const user = await resp.json(); // {sub, name, avatar, email, ...}
      const displayName = user.name || user.sub || 'User';
      const avatar = user.avatar || 'assets/profile.png';

      slot.innerHTML = `
        <span class="session-user">
          <img src="${avatar}" alt="">
          ${displayName}
          <a class="logout-link" href="${AUTH_ORIGIN}/logout" title="Logout">×</a>
        </span>
      `;
    } catch (err) {
      console.warn('[session] failed to fetch /me', err);
      showLogin();
    }
  }

  // Snap stacks (your “one panel visible” Services behavior)
  function initSnapStacks(rootEl = document) {
    const stacks = rootEl.querySelectorAll('[data-snap-stack]');
    stacks.forEach((stack) => {
      if (stack.__snapWired) return;
      stack.__snapWired = true;

      const panels = Array.from(stack.querySelectorAll('.snap-panel'));
      if (!panels.length) return;

      panels.forEach((p, i) => p.classList.toggle('is-active', i === 0));

      const obs = new IntersectionObserver(
        (entries) => {
          let best = null;
          for (const e of entries) {
            if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
          }
          if (!best) return;

          panels.forEach((p) => p.classList.remove('is-active'));
          best.target.classList.add('is-active');
        },
        { root: stack, threshold: [0.35, 0.5, 0.65, 0.8] }
      );

      panels.forEach((p) => obs.observe(p));
      stack.__snapObserver = obs;
    });
  }

  function setActiveNavLink() {
    const path = (location.pathname || '').toLowerCase();
    const file = path.split('/').pop() || 'index.html';

    document.querySelectorAll('.nav-links a, .sidebar a').forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const isActive =
        href === file ||
        (file === '' && href.endsWith('index.html'));

      a.classList.toggle('active', isActive);
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const H = window.HAIPHEN || {};

    safeLoad(H.loadHeader, 'header');
    safeLoad(H.loadSidebar, 'sidebar');
    safeLoad(H.loadFooter, 'footer');

    // Optional components; harmless if not present
    safeLoad(H.loadTradesOverlay, 'trades-overlay');

    initSnapStacks(document);
    updateSessionWidget();
    setActiveNavLink();

    // Refresh session pill periodically (optional)
    setInterval(updateSessionWidget, 5 * 60 * 1000);
  });

  // Expose minimal hooks if you want them elsewhere
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.initSnapStacks = initSnapStacks;
})();
===== docs/components/faq/faq.html =====
<section class="faq">
  <header class="faq-head">
    <h2>FAQ</h2>
    <p class="faq-subtitle">
      Practical answers about collaboration, services, and the trading telemetry you’re seeing on this site.
    </p>
  </header>

  <div class="faq-controls">
    <label class="faq-search">
      <span class="sr-only">Search FAQs</span>
      <input id="faq-search" type="search" placeholder="Search questions…" autocomplete="off" />
    </label>

    <div class="faq-tags" id="faq-tags" aria-label="Filter FAQs by tag">
      <!-- tags injected -->
    </div>
  </div>

  <div class="faq-list" id="faq-list" aria-live="polite">
    <!-- items injected -->
  </div>

  <div class="faq-empty" id="faq-empty" hidden>
    No matches. Try a different search term.
  </div>
</section>
===== docs/components/faq/faq.js =====
(function () {
  window.HAIPHEN = window.HAIPHEN || {};

  /**
   * FAQ items support:
   *  - q: string
   *  - a: string (plain text)
   *  - aHtml: string (optional HTML; will be sanitized)
   *  - aText: string (optional plain text used for search/matching when aHtml is present)
   *  - tags: string[]
   */
  const DEFAULT_FAQS = [
    {
      q: "What is Haiphen in one sentence?",
      aHtml:
        `Haiphen is a signals-intelligence engineering studio: we build inspectable, production-grade pipelines for ML/NLP, security, and telemetry-heavy systems — including the trading telemetry you see on the <a href="#fintech">Trades</a> section.`,
      aText:
        "Haiphen is a signals-intelligence engineering studio. We build inspectable, production-grade pipelines for ML/NLP, security, and telemetry-heavy systems — including the trading telemetry you see on the Trades section.",
      tags: ["general"],
    },
    {
      q: "What does “API Everything” actually mean here?",
      aHtml:
        `It means every meaningful output is <em>addressable</em>: metrics are published as JSON, screenshots are generated deterministically, and internal steps emit traceable intermediate state. The UI is basically a viewer for those artifacts — see <a href="#fintech">Trades</a> (KPIs + archive) and the <a data-faq-go="OnePager:ethos" href="#ethos">Open Source ethos</a>.`,
      aText:
        "It means every meaningful output is addressable: metrics are published as JSON, screenshots are generated deterministically, and internal steps emit traceable intermediate state. The UI is a viewer for those artifacts.",
      tags: ["general", "telemetry", "navigation", "open-source"],
    },
    {
      q: "Are the trading metrics investment advice?",
      a:
        "No. They’re operational telemetry from an automated execution and risk system (volume, stability, daily outcomes). Nothing on this site is a recommendation to buy/sell any asset.",
      tags: ["trading", "disclaimer"],
    },
    {
      q: "What am I looking at in the Trades section?",
      aHtml:
        `Trades shows daily operational telemetry: a summary, a KPI strip, and an archive you can browse by date. Jump straight to <a href="#fintech">Trades</a>, then scroll to <a data-faq-go="Trades:fintech-metrics" href="#fintech-metrics">Metrics</a> or <a data-faq-go="Trades:trades-archive-track" href="#trades-archive-track">Archive</a>.`,
      aText:
        "Trades shows daily operational telemetry: a summary, a KPI strip, and an archive you can browse by date. Jump to Trades, then scroll to Metrics or Archive.",
      tags: ["trading", "telemetry", "navigation"],
    },
    {
      q: "What do KPI cards represent, and why are they clickable?",
      aHtml:
        `Each KPI card is a computed metric for the currently loaded day. Clicking opens a deeper overlay (time series / extremes when available) to help diagnose behavior rather than “celebrate numbers.” Start at <a href="#fintech">Trades</a> → <a data-faq-go="Trades:fintech-metrics" href="#fintech-metrics">Metrics</a>.`,
      aText:
        "Each KPI card is a computed metric for the currently loaded day. Clicking opens a deeper overlay when available to help diagnose behavior.",
      tags: ["trading", "telemetry"],
    },
    {
      q: "Why might the Archive show fallback metrics?",
      aHtml:
        `If the pipeline can’t reach the DB for a run (or a publisher step fails), the site may show a fallback payload for “latest” to avoid breaking the UI. We generally avoid overwriting historical archive days with fallback to keep the archive trustworthy. See <a data-faq-go="Trades:trades-archive-track" href="#trades-archive-track">Archive</a>.`,
      aText:
        "If the pipeline can’t reach the DB for a run (or a publisher step fails), the site may show a fallback payload for “latest” to avoid breaking the UI. We generally avoid overwriting historical archive days with fallback to keep the archive trustworthy.",
      tags: ["trading", "telemetry", "reliability"],
    },
    {
      q: "Where does the Trades data come from?",
      aHtml:
        `The UI reads published artifacts from <code>assets/trades/</code> (latest JSON + screenshot) and <code>assets/trades/trades_index.json</code> for the archive list. The KPIs are rendered from the day’s JSON rows (and optional overlay series). Browse: <a data-faq-go="Trades:trades-archive-track" href="#trades-archive-track">Archive</a>.`,
      aText:
        "The UI reads published artifacts from assets/trades (latest JSON + screenshot) and trades_index.json for the archive list. KPIs render from the day’s JSON rows (and optional overlay series).",
      tags: ["trading", "telemetry", "engineering"],
    },
    {
      q: "How do I request API access or collaboration?",
      aHtml:
        `Use <a href="#contact-us">Contact</a> to share (1) the problem, (2) constraints (timeline/budget/security), and (3) what “success” looks like. If you want a fast start, include a sample dataset, a system diagram, or logs.`,
      aText:
        "Use Contact to share the problem, constraints (timeline/budget/security), and what success looks like. Include a sample dataset, system diagram, or logs for a fast start.",
      tags: ["collaboration", "services"],
    },
    {
      q: "What’s the typical engagement structure for services?",
      a:
        "Usually: (1) discovery (constraints + architecture), (2) prototype (thin vertical slice), (3) hardening (tests, observability, docs), (4) deployment + monitoring. The goal is a system that survives contact with reality, not a demo.",
      tags: ["services", "collaboration"],
    },
    {
      q: "What kinds of systems do you actually build?",
      aHtml:
        `Broadly: signal ingestion, decision engines, event detection, and production ML/infra glue. The “Signals” section is the best conceptual overview: <a data-faq-go="OnePager:services-signals" href="#services-signals">Signals</a>.`,
      aText:
        "Broadly: signal ingestion, decision engines, event detection, and production ML/infra glue. The Signals section is the best conceptual overview.",
      tags: ["services", "general", "navigation"],
    },
    {
      q: "What’s your stance on open source and inspectability?",
      aHtml:
        `We bias toward “inspectable systems” — fewer black boxes, more traceability. That includes infrastructure, data lineage, and security posture. See <a data-faq-go="OnePager:ethos" href="#ethos">Ethos</a>.`,
      aText:
        "We bias toward inspectable systems — fewer black boxes, more traceability. That includes infrastructure, data lineage, and security posture.",
      tags: ["open-source", "security", "engineering"],
    },
    {
      q: "How do you think about security for telemetry-heavy systems?",
      aHtml:
        `Security is a system property, not a checkbox: least privilege, auditability, secret hygiene, and “assume compromise” boundaries. The site hints at this in the stack + secure sections: <a data-faq-go="OnePager:ethos" href="#ethos">Ethos</a>.`,
      aText:
        "Security is a system property, not a checkbox: least privilege, auditability, secret hygiene, and assume-compromise boundaries.",
      tags: ["security", "engineering"],
    },
    {
      q: "How do I navigate directly to a section (shareable links)?",
      aHtml:
        `Use hashes: <code>#fintech</code> (Trades), <code>#services</code>, <code>#collaborate</code> (OnePager), <code>#faq</code>, <code>#contact-us</code>. Example: click <a href="#faq">#faq</a> or <a href="#fintech">#fintech</a>.`,
      aText:
        "Use hashes: #fintech (Trades), #services, #collaborate (OnePager), #faq, #contact-us. Example: #faq or #fintech.",
      tags: ["navigation"],
    },
    {
      q: "Where can I see examples of prior work on this site?",
      aHtml:
        `The “Tech” dropdown inside Trades shows portfolio-style artifacts, and the OnePager includes case-study visuals. Start at <a href="#fintech">Trades</a> → <a data-faq-go="Trades:fintech-tech" href="#fintech-tech">Tech</a>, or jump to <a href="#collaborate">OnePager</a>.`,
      aText:
        "The Tech dropdown inside Trades shows portfolio-style artifacts, and the OnePager includes case-study visuals. Start at Trades → Tech, or jump to OnePager.",
      tags: ["navigation", "general"],
    },
    {
      q: "Can you build a custom version of this site/pipeline for my company?",
      a:
        "Yes. The usual approach is: identify your signals, define the decision/alert surface, then build the minimal pipeline with observability first. From there we harden the system: retries, idempotency, monitoring, docs, and deployment.",
      tags: ["services", "engineering"],
    },
    {
      q: "What’s the fastest way to get a meaningful first milestone?",
      a:
        "Pick a single signal → single decision → single output loop. Example: ingest one data source, compute one KPI, publish one JSON artifact + one UI widget. Once that works reliably, scale horizontally (more signals) instead of adding complexity vertically.",
      tags: ["engineering", "collaboration"],
    },
    {
      q: "Where’s the gallery of hardware / field work?",
      aHtml:
        `The gallery lives in OnePager. Jump to <a href="#collaborate">OnePager</a> and scroll to <a data-faq-go="OnePager:services-gallery" href="#services-gallery">Gallery</a>.`,
      aText:
        "The gallery lives in OnePager. Jump to OnePager and scroll to Gallery.",
      tags: ["navigation", "services"],
    },
  ];

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function normalize(s) {
    return String(s || "").trim().toLowerCase();
  }

  function matches(item, q, tag) {
    const qq = normalize(q);

    const hayA = item.aText ?? item.aHtml ?? item.a ?? "";
    const hay = `${item.q || ""} ${hayA} ${(item.tags || []).join(" ")}`;

    const hasQ = !qq || normalize(hay).includes(qq);
    const hasTag = !tag || (item.tags || []).includes(tag);
    return hasQ && hasTag;
  }

  function renderTags(root, tags, activeTag, onToggle) {
    root.innerHTML = tags
      .map((t) => {
        const pressed = t === activeTag ? "true" : "false";
        return `<button class="faq-tag" type="button" data-tag="${escapeHtml(
          t
        )}" aria-pressed="${pressed}">${escapeHtml(t)}</button>`;
      })
      .join("");

    root.querySelectorAll(".faq-tag").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tag = btn.getAttribute("data-tag");
        onToggle(tag);
      });
    });
  }

  function renderList(root, items) {
    root.innerHTML = items
      .map((it) => {
        const answer =
          it.aHtml != null
            ? sanitizeHtml(it.aHtml)
            : `<span>${escapeHtml(it.a)}</span>`;

        return `
          <details class="faq-item">
            <summary>${escapeHtml(it.q)}</summary>
            <div class="faq-a">${answer}</div>
          </details>
        `;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Tiny, defensive sanitizer:
   * Allows: a, code, em, strong, p, span, ul, ol, li, br
   * Allows attrs: href, target, rel, data-faq-go
   * Strips everything else.
   */
  function sanitizeHtml(html) {
    const allowedTags = new Set([
      "A",
      "CODE",
      "EM",
      "STRONG",
      "P",
      "SPAN",
      "UL",
      "OL",
      "LI",
      "BR",
    ]);
    const allowedAttrs = new Set(["href", "target", "rel", "data-faq-go"]);

    const tpl = document.createElement("template");
    tpl.innerHTML = String(html || "");

    const walk = (node) => {
      const children = Array.from(node.childNodes || []);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child;

          if (!allowedTags.has(el.tagName)) {
            // Replace disallowed element with its text content (preserve readability)
            const txt = document.createTextNode(el.textContent || "");
            el.replaceWith(txt);
            continue;
          }

          // Drop unsafe attributes
          for (const attr of Array.from(el.attributes || [])) {
            if (!allowedAttrs.has(attr.name)) {
              el.removeAttribute(attr.name);
              continue;
            }
            // basic href hardening
            if (attr.name === "href") {
              const v = String(attr.value || "").trim();
              // allow #hash, relative, or https links. Disallow javascript:
              if (/^javascript:/i.test(v)) el.removeAttribute("href");
            }
          }

          // Enforce safe link defaults
          if (el.tagName === "A") {
            const href = el.getAttribute("href") || "";
            const isExternal = /^https?:\/\//i.test(href);
            if (isExternal) {
              el.setAttribute("target", "_blank");
              el.setAttribute("rel", "noopener noreferrer");
            }
          }

          walk(el);
        } else if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
        }
      }
    };

    walk(tpl.content);
    return tpl.innerHTML;
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  function initFaqUI(container, faqs) {
    const searchEl = container.querySelector("#faq-search");
    const tagsEl = container.querySelector("#faq-tags");
    const listEl = container.querySelector("#faq-list");
    const emptyEl = container.querySelector("#faq-empty");

    let activeTag = null;

    const tags = uniq(faqs.flatMap((f) => f.tags || []).map((t) => String(t)))
      .sort((a, b) => a.localeCompare(b));

    // Event delegation for FAQ deep links (data-faq-go="Section:id")
    listEl?.addEventListener("click", (e) => {
      const a = e.target?.closest?.("a[data-faq-go]");
      if (!a) return;
      e.preventDefault();
      const spec = a.getAttribute("data-faq-go") || "";
      const [section, id] = spec.split(":");
      goTo(section, id);
    });

    const recompute = () => {
      const q = searchEl?.value || "";
      const filtered = faqs.filter((it) => matches(it, q, activeTag));
      renderList(listEl, filtered);
      emptyEl.hidden = filtered.length !== 0;
      renderTags(tagsEl, tags, activeTag, (tag) => {
        activeTag = activeTag === tag ? null : tag;
        recompute();
      });
    };

    if (searchEl) searchEl.addEventListener("input", recompute);

    renderTags(tagsEl, tags, activeTag, (tag) => {
      activeTag = activeTag === tag ? null : tag;
      recompute();
    });

    recompute();
  }

  /**
   * Navigate to an injected section and scroll to an element id within it.
   * Uses existing showSection() + scrollToWithHeaderOffset() if available.
   */
  async function goTo(sectionName, elementId) {
    try {
      const section = String(sectionName || "").trim();
      const id = String(elementId || "").trim();

      if (section && typeof window.showSection === "function") {
        window.showSection(section);
      }

      // Wait a couple frames so injected HTML exists and layout stabilizes
      await new Promise((r) => requestAnimationFrame(() => r()));
      await new Promise((r) => requestAnimationFrame(() => r()));

      if (!id) return;

      const target = document.getElementById(id);
      if (!target) return;

      if (typeof window.scrollToWithHeaderOffset === "function") {
        window.scrollToWithHeaderOffset(target, 12);
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      console.warn("[faq] goTo failed", err);
    }
  }

  /**
   * Mount FAQ HTML/CSS into the current content widget.
   * The caller will place <div id="faq-mount"></div> in section HTML.
   */
  window.HAIPHEN.loadFAQ = async function loadFAQ() {
    const mount = document.getElementById("faq-mount");
    if (!mount) return;

    // Load HTML
    try {
      const html = await fetchText("components/faq/faq.html");
      mount.innerHTML = html;
    } catch (e) {
      console.warn("[faq] failed to load faq.html", e);
      mount.innerHTML = `<div class="trades-muted">FAQ unavailable.</div>`;
      return;
    }

    // Ensure CSS is loaded once
    if (!document.querySelector('link[data-haiphen="faq-css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "components/faq/faq.css";
      link.dataset.haiphen = "faq-css";
      document.head.appendChild(link);
    }

    // Initialize UI
    initFaqUI(mount, DEFAULT_FAQS);
  };
})();
===== docs/components/footers/site-footer.html =====
<footer class="site-footer" role="contentinfo" aria-label="Site footer">
  <div class="site-footer__inner">
    <div class="site-footer__col">
      <div class="site-footer__label">© <span id="site-footer-year"></span> Haiphen</div>
      <div class="site-footer__muted">All rights reserved.</div>
    </div>

    <div class="site-footer__col">
      <div class="site-footer__label">Company</div>
      <a class="site-footer__link" href="https://haiphen.io" target="_blank" rel="noopener noreferrer">haiphen.io</a>
    </div>

    <div class="site-footer__col">
      <div class="site-footer__label">Legal</div>
      <a class="site-footer__link" href="docs/terms.html" onclick="return false;">Terms</a>
    </div>

  </div>
</footer>
===== docs/components/footers/site-footer.js =====
/* site-footer.js
 * Shows footer only when user reaches bottom sentinel.
 * Uses IntersectionObserver (fast) with a scroll fallback.
 */
(function () {
  'use strict';

  const FOOTER_ID = 'site-footer';
  const MOUNT_ID = 'footer-mount';
  const SENTINEL_ID = 'footer-sentinel';

  function qs(id) {
    return document.getElementById(id);
  }

  function setYear(footerEl) {
    const yearEl = footerEl.querySelector('#site-footer-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  function setVisible(footerEl, visible) {
    footerEl.classList.toggle('is-visible', Boolean(visible));
  }

  function installVisibilityController(footerEl) {
    const sentinel = qs(SENTINEL_ID);
    if (!sentinel) {
      // No sentinel: never show (safe default)
      console.warn('[footer] sentinel missing; footer will remain hidden');
      return;
    }

    // Preferred: IntersectionObserver
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          // When sentinel is visible, user is at/near bottom -> show footer
          setVisible(footerEl, entry && entry.isIntersecting);
        },
        {
          root: null,
          threshold: 0.01,
        }
      );
      io.observe(sentinel);
      return;
    }

    // Fallback: scroll check
    function onScroll() {
      const rect = sentinel.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom >= 0;
      setVisible(footerEl, inView);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function loadFooter() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[footer] mount missing');
      return;
    }

    // Avoid double-insert
    if (qs(FOOTER_ID)) return;

    // CSS first so no flash
    await injectCssOnce('components/footers/site-footer.css');

    const html = await fetchText('components/footers/site-footer.html');

    // Wrap so we can assign a stable id
    mount.innerHTML = `<div id="${FOOTER_ID}">${html}</div>`;
    const footerEl = mount.querySelector('.site-footer');
    if (!footerEl) {
      console.warn('[footer] failed to find .site-footer in loaded HTML');
      return;
    }

    setYear(footerEl);
    installVisibilityController(footerEl);
  }

  // Expose a tiny global for index.html to call
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadFooter = loadFooter;
})();
===== docs/components/headers/site-header.html =====
<header class="site-header" role="banner" aria-label="Site header">
  <div class="site-header__inner">
    <!-- Brand / Logo -->
    <a class="site-header__brand" href="javascript:void(0)" aria-label="Haiphen home">
      <img class="site-header__logo" src="assets/logo.png" alt="Haiphen Logo" />
    </a>

    <!-- Expanding menu -->
    <nav class="site-header__menu" aria-label="Primary">
      <div class="site-header__items">
        <!-- Follow -->
        <div class="site-header__item">
          <a class="site-header__link" href="javascript:void(0)" data-href="#" aria-haspopup="true" aria-expanded="false">
            Follow
          </a>
          <div class="site-header__dropdown" role="menu" aria-label="Follow menu">
            <a class="site-header__drop-link" href="https://twitter.com/" target="_blank" rel="noopener noreferrer" role="menuitem">
              <img class="site-header__icon" src="assets/icons/social/twitter.svg" alt="" aria-hidden="true" />
              Twitter
            </a>
            <a class="site-header__drop-link" href="https://www.linkedin.com/in/judesafo" target="_blank" rel="noopener noreferrer" role="menuitem">
              <img class="site-header__icon" src="assets/icons/social/linkedin.svg" alt="" aria-hidden="true" />
              LinkedIn
            </a>
            <a class="site-header__drop-link" href="https://facebook.com/" target="_blank" rel="noopener noreferrer" role="menuitem">
              <img class="site-header__icon" src="assets/icons/social/facebook.svg" alt="" aria-hidden="true" />
              Facebook
            </a>
          </div>
        </div>

        <!-- Subscribe -->
        <div class="site-header__item">
          <a class="site-header__link" href="javascript:void(0)" aria-haspopup="true" aria-expanded="false">
            Subscribe
          </a>
          <div class="site-header__dropdown" role="menu" aria-label="Services menu">
            <a class="site-header__drop-link" href="#services" data-route="Services" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/trade-engine.svg" alt="" aria-hidden="true" />
              Trade Engine
            </a>
            <a class="site-header__drop-link" href="#services" data-route="Services" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/rss.svg" alt="" aria-hidden="true" />
              RSS Feed
            </a>
            <a class="site-header__drop-link" href="#services" data-route="Services" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/shield.svg" alt="" aria-hidden="true" />
              Risk/Compliance
            </a>
            <a class="site-header__drop-link" href="#services" data-route="Services" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/shield.svg" alt="" aria-hidden="true" />
              Edge VPN
            </a>
            <a class="site-header__drop-link" href="#services" data-route="Services" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/shield.svg" alt="" aria-hidden="true" />
              ECM 
            </a>                        
          </div>
        </div>

        <!-- Consulting -->
        <div class="site-header__item">
          <a class="site-header__link" href="javascript:void(0)" aria-haspopup="true" aria-expanded="false">
            Consulting
          </a>
          <div class="site-header__dropdown" role="menu" aria-label="Inventory menu">
            <a class="site-header__drop-link" href="javascript:void(0)" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/ai.svg" alt="" aria-hidden="true" />
              Artificial Intelligence
            </a>
            <a class="site-header__drop-link" href="javascript:void(0)" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/link.svg" alt="" aria-hidden="true" />
              Knowledge Graph
            </a>            
            <a class="site-header__drop-link" href="javascript:void(0)" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/infra.svg" alt="" aria-hidden="true" />
              Infrastructure
            </a>
            <a class="site-header__drop-link" href="javascript:void(0)" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/link.svg" alt="" aria-hidden="true" />
              External Internet
            </a>
            <a class="site-header__drop-link" href="javascript:void(0)" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/link.svg" alt="" aria-hidden="true" />
              Reasoning Engine
            </a>
            <a class="site-header__drop-link" href="javascript:void(0)" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/link.svg" alt="" aria-hidden="true" />
              Supply Chain Optimization
            </a>               
          </div>
        </div>

        <!-- Contact -->
        <div class="site-header__item">
          <a class="site-header__link" href="javascript:void(0)" aria-haspopup="true" aria-expanded="false">
            Contact
          </a>
          <div class="site-header__dropdown" role="menu" aria-label="Contact menu">
            <a class="site-header__drop-link" href="mailto:pi@haiphenai.com" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/email.svg" alt="" aria-hidden="true" />
              Email
            </a>
            <a
              class="site-header__drop-link"
              href="https://calendar.app.google/jQzWz98eCC5jMLrQA"
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
            >
              <img class="site-header__icon" src="assets/icons/menu/calendar.svg" alt="" aria-hidden="true" />
              Calendar
            </a>        
            <a class="site-header__drop-link" href="#contact-us" data-scroll-to="contact-us" role="menuitem">
              <img class="site-header__icon" src="assets/icons/menu/company.svg" alt="" aria-hidden="true" />
              Company
            </a>
          </div>
        </div>
      </div>
    </nav>

    <!-- Keep your existing session widget behavior -->
    <div class="site-header__session">
      <span id="session-slot">
        <a href="https://auth.haiphen.io/login" class="login-btn">Login</a>
      </span>
      <!-- NEW: Site search button -->
      <button
        id="site-search-btn"
        class="site-header__iconbtn"
        type="button"
        aria-label="Search"
        title="Search (Ctrl+K / /)"
      >
        <img
          class="site-header__icon"
          src="assets/icons/search.svg"
          alt=""
          aria-hidden="true"
          width="18"
          height="18"
          decoding="async"
        />
      </button>    
    </div>
  </div>
</header>
===== docs/components/headers/site-header.js =====
/* site-header.js
 * Injects header HTML/CSS, expands menu on logo hover, adds "lighter grey" header hover state.
 */
(function () {
  'use strict';

  const HEADER_ID = 'site-header';
  const MOUNT_ID = 'header-mount';

  function qs(id) {
    return document.getElementById(id);
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function wireInteractions(root) {
    const headerEl = root.querySelector('.site-header');
    const brandEl = root.querySelector('.site-header__brand');
    if (!headerEl || !brandEl) return;

    let openedByBrand = false;

    function openHeader(reason) {
      headerEl.classList.add('is-expanded');
      if (reason === 'brand') headerEl.classList.add('is-brand-hover');
    }

    function closeHeader() {
      headerEl.classList.remove('is-expanded');
      headerEl.classList.remove('is-brand-hover');
      openedByBrand = false;
      // reset aria-expanded for accessibility
      root.querySelectorAll('.site-header__link[aria-expanded="true"]').forEach((a) => {
        a.setAttribute('aria-expanded', 'false');
      });
    }

    // Expand when hovering the logo
    brandEl.addEventListener('mouseenter', () => {
      openedByBrand = true;
      openHeader('brand');
    });

    // IMPORTANT: do NOT collapse on brand mouseleave.
    // Collapse only when leaving the entire header region.
    headerEl.addEventListener('mouseleave', () => {
      if (openedByBrand) closeHeader();
    });

    // Keep expanded while interacting anywhere inside the header (menu + dropdowns)
    headerEl.addEventListener('mouseenter', () => {
      if (openedByBrand) openHeader(); // keep it open if it was opened by brand
    });

    // Update aria-expanded based on hover/focus state per item
    const items = root.querySelectorAll('.site-header__item');
    items.forEach((item) => {
      const trigger = item.querySelector('.site-header__link');
      if (!trigger) return;

      const setExpanded = (v) => trigger.setAttribute('aria-expanded', v ? 'true' : 'false');

      item.addEventListener('mouseenter', () => setExpanded(true));
      item.addEventListener('mouseleave', () => setExpanded(false));

      // Keyboard accessibility: focus within opens dropdown via CSS :focus-within
      trigger.addEventListener('focus', () => setExpanded(true));
      item.addEventListener('focusout', () => setExpanded(false));
    });

    // ESC closes any open menu state
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHeader();
    });

    // Click logo -> your existing resetLanding()
    brandEl.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.resetLanding === 'function') window.resetLanding();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  }

  async function loadHeader() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[header] mount missing');
      return;
    }

    // Avoid double insert
    if (qs(HEADER_ID)) return;

    await injectCssOnce('components/headers/site-header.css');

    const html = await fetchText('components/headers/site-header.html');
    mount.innerHTML = `<div id="${HEADER_ID}">${html}</div>`;

    wireInteractions(mount);
    // After header is injected + wired
    window.dispatchEvent(new CustomEvent("haiphen:header:ready", {
      detail: { headerId: HEADER_ID }
    }));    
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadHeader = loadHeader;
})();
===== docs/components/mission/mission.html =====
<!-- docs/components/mission/mission.html -->
<section class="mission hp-subsection" id="fintech-mission" aria-label="Mission">
  <header class="mission__head">
    <div class="mission__kicker">Mission</div>
    <h2 class="mission__title">Signals intelligence, built like infrastructure</h2>
    <p class="mission__sub">
      Open-source, scalable systems for NLP/ML, embedded/edge, and operational security.
      We build real systems for real problems—inspectable plumbing, not vibes.
    </p>
  </header>

  <div class="mission__grid">
    <div class="mission__card hp-card">
      <h3 id="fintech-mission-what" class="mission__h3 haiphen-nav-target">What we do</h3>
      <p>
        We process large-scale signals (web + data streams) into reliable downstream artifacts:
        APIs, structured datasets, telemetry, and decision engines.
      </p>
      <ul class="mission__list">
        <li>Data pipelines / ETL / enrichment</li>
        <li>Entity extraction, clustering, pruning</li>
        <li>Knowledge graph + retrieval infrastructure</li>
        <li>Security hardening & operational controls</li>
      </ul>
    </div>

    <div class="mission__card hp-card">
      <h3 id="fintech-mission-how" class="mission__h3 haiphen-nav-target">How we work</h3>
      <p>
        Domain-agnostic, solve-first. We meet problems where they live: research labs, fintech stacks,
        edge devices, and everything between.
      </p>
      <div class="mission__pills" aria-label="Focus areas">
        <span class="pill">Decision engines</span>
        <span class="pill pill-muted">Risk analysis</span>
        <span class="pill">Telemetry</span>
        <span class="pill pill-muted">Zero-trust</span>
        <span class="pill">Open source</span>
      </div>
    </div>
  </div>

  <div class="mission__cta hp-card">
    <h3 id="fintech-mission-collab" class="haiphen-nav-target">Collaborate</h3>
    <p>
      Schedule time, request API access, or describe a build. We’ll respond with a crisp scope + next steps.
    </p>
    <div class="mission__actions">
      <button class="btn btn-primary" type="button" onclick="showSection('Contact')">
        Contact
      </button>
      <!-- Optional: keep your calendar link here too (replace href) -->
      <a class="btn btn-ghost" href="#contact-us">
        Jump to contact
      </a>
    </div>
  </div>
</section>
===== docs/components/mission/mission.js =====
/* docs/components/mission/mission.js
 * Mounts the Mission subsection and wires “subsection focus” (scroll-snap + observer).
 */
(function () {
  'use strict';

  const LOG = '[mission]';
  const MOUNT_ID = 'mission-mount';

  function qs(id) { return document.getElementById(id); }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function initSubsectionFocus(scrollerEl) {
    if (!scrollerEl) return;

    const subs = Array.from(scrollerEl.querySelectorAll('.hp-subsection'));
    if (subs.length < 2) return;

    // initial state: first active
    subs.forEach((s, i) => s.classList.toggle('is-dimmed', i !== 0));

    const io = new IntersectionObserver((entries) => {
      // choose the subsection with highest intersection ratio
      let best = null;
      for (const e of entries) {
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
      }
      if (!best) return;

      const active = best.target;
      subs.forEach((s) => s.classList.toggle('is-dimmed', s !== active));
    }, {
      root: scrollerEl,
      threshold: [0.35, 0.55, 0.75],
    });

    subs.forEach((s) => io.observe(s));

    // expose disposer if you ever need it later
    scrollerEl._hpSubsectionObserver = io;
  }

  async function loadMission() {
    const mount = qs(MOUNT_ID);
    if (!mount) return;

    // prevent double insert
    if (mount.querySelector('.mission')) return;

    await injectCssOnce('components/mission/mission.css');
    const html = await fetchText('components/mission/mission.html');
    mount.innerHTML = html;

    // “focus” is controlled at the Fin/Tech scroller level
    const scroller = mount.closest('.hp-subsections');
    initSubsectionFocus(scroller);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadMission = loadMission;
})();
===== docs/components/navigation/anchor-nav.js =====

===== docs/components/section-menu/section-menu.html =====
<!-- docs/components/section-menu/section-menu.html -->
<div class="section-menu" role="navigation" aria-label="Primary sections">
  <button class="section-menu__btn" type="button" data-section="Trades">
    Fin/Tech
  </button>
  <button class="section-menu__btn" type="button" data-section="Services">
    Services
  </button>
  <button class="section-menu__btn" type="button" data-section="OnePager">
    Collaborate
  </button>
  <button class="section-menu__btn" type="button" data-section="FAQ">
    FAQ
  </button>
</div>
===== docs/components/section-menu/section-menu.js =====
/* docs/components/section-menu/section-menu.js
 * Injects the middle buttons and wires them to showSection().
 */
(function () {
  'use strict';

  const MENU_ID = 'section-menu';
  const MOUNT_ID = 'section-menu-mount';

  function qs(id) {
    return document.getElementById(id);
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function setActive(root, sectionName) {
    root.querySelectorAll('[data-section]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-section') === sectionName);
    });
  }

  function wire(root) {
    const SECTION_HASH = {
      Trades: 'fintech',
      Services: 'services',
      OnePager: 'collaborate',
      FAQ: 'faq',
      Inventory: 'archives',
      Contact: 'contact-us',
    };

    function setHash(section) {
      const slug = SECTION_HASH[section];
      if (!slug) return;
      const next = `#${slug}`;
      if (window.location.hash !== next) window.location.hash = next;
    }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-section]');
      if (!btn) return;

      const section = btn.getAttribute('data-section');
      if (!section) return;

      // Set hash first (so sharing / history is correct)
      setHash(section);

      // Then render content (hash router will also do this on hashchange,
      // but doing it here makes UI feel instant even if hashchange is delayed)
      if (typeof window.showSection === 'function') {
        window.showSection(section);
        setActive(root, section);
      }
    });
  }

  async function loadSectionMenu() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[section-menu] mount missing');
      return;
    }

    if (qs(MENU_ID)) return;

    await injectCssOnce('assets/base.css');
    await injectCssOnce('components/section-menu/section-menu.css');

    const html = await fetchText('components/section-menu/section-menu.html');
    mount.innerHTML = `<div id="${MENU_ID}">${html}</div>`;

    wire(mount);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSectionMenu = loadSectionMenu;
})();
===== docs/components/services-plans/service-plans.html =====
<!-- docs/components/services-plans/services-plans.html -->
<section class="services-plans" aria-label="Plans and subscriptions">
  <header class="services-plans__head">
    <div class="services-plans__kicker">Subscriptions</div>
    <h2 class="services-plans__title">Choose a plan</h2>
    <p class="services-plans__sub">
      Start instantly. Monthly billing. Cancel anytime. Checkout will route through Square (soon).
    </p>
  </header>

  <div class="services-plans__grid" role="list">
    <!-- Starter -->
    <article class="plan" role="listitem" data-plan="signals_starter">
      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/rss.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">Signals Starter</div>
          <div class="plan__price">
            <span class="plan__amt">$29</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Lightweight access to curated signals + alerts. Best for testing workflows.
      </p>

      <ul class="plan__bullets">
        <li>Daily signal digest</li>
        <li>Email notifications</li>
        <li>Basic API docs</li>
      </ul>

      <button class="plan__cta btn btn-primary" type="button" data-action="subscribe">
        Subscribe
      </button>

      <div class="plan__foot">
        <span class="pill">Fast setup</span>
        <span class="pill pill-muted">Most popular entry</span>
      </div>
    </article>

    <!-- Pro -->
    <article class="plan plan--featured" role="listitem" data-plan="fintech_pro">
      <div class="plan__badge" aria-hidden="true">Recommended</div>

      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/trade-engine.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">Fintech Pro</div>
          <div class="plan__price">
            <span class="plan__amt">$149</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Production-ready access patterns for decision engines, risk evaluation, and reporting.
      </p>

      <ul class="plan__bullets">
        <li>Higher-rate API access</li>
        <li>Telemetry + KPI templates</li>
        <li>Priority support</li>
      </ul>

      <button class="plan__cta btn btn-primary" type="button" data-action="subscribe">
        Subscribe
      </button>

      <div class="plan__foot">
        <span class="pill">Best value</span>
        <span class="pill pill-muted">Teams</span>
      </div>
    </article>

    <!-- Enterprise -->
    <article class="plan" role="listitem" data-plan="enterprise_custom">
      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/infra.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">Enterprise / Custom</div>
          <div class="plan__price">
            <span class="plan__amt">$499</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Dedicated builds, integration support, and custom SLAs for serious deployments.
      </p>

      <ul class="plan__bullets">
        <li>Custom workflows + integration</li>
        <li>Security review + hardening</li>
        <li>Direct engineering channel</li>
      </ul>

      <a
        class="plan__cta btn btn-ghost"
        href="https://calendar.app.google/jQzWz98eCC5jMLrQA"
        target="_blank"
        rel="noopener noreferrer"
        data-action="contact"
      >
        Contact sales
      </a>

      <div class="plan__foot">
        <span class="pill">SLA</span>
        <span class="pill pill-muted">Custom scope</span>
      </div>
    </article>
  </div>

  <div class="services-plans__note">
    <div class="note">
      <div class="note__ic" aria-hidden="true">
        <img src="assets/icons/shield.svg" alt="" />
      </div>
      <div class="note__txt">
        <strong>Secure by design:</strong> checkout will require login and will route through Square hosted links.
      </div>
    </div>
  </div>
</section>
===== docs/components/services-plans/service-plans.js =====
/* docs/components/services-plans/services-plans.js
 * Renders a pricing/subscription block for Services.
 * - Mount inside the Services section via <div id="services-plans-mount"></div>
 * - Click handlers:
 *    - Subscribe: ensure login, then redirect to Square hosted link (placeholder)
 *    - Contact: jumps to Contact section
 */
(function () {
  'use strict';

  const LOG = '[services-plans]';
  const MOUNT_ID = 'services-plans-mount';

  // Keep consistent with index.html
  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  // TODO: replace with real Square hosted checkout links (per plan)
  const SQUARE_CHECKOUT = {
    signals_starter: 'https://square.link/u/f3nO4ktd',
    fintech_pro: 'https://square.link/u/f3nO4ktd',
    enterprise_custom: 'https://square.link/u/f3nO4ktd',
  };

  function qs(id) { return document.getElementById(id); }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function isLoggedIn() {
    try {
      const resp = await fetch(`${AUTH_ORIGIN}/me`, { credentials: 'include' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  function redirectToLogin(nextUrl) {
    const next = encodeURIComponent(nextUrl || window.location.href);
    window.location.href = `${AUTH_ORIGIN}/login?next=${next}`;
  }

  function goToSquare(planKey) {
    const url = SQUARE_CHECKOUT[planKey];
    if (!url || url.includes('REPLACE_')) {
      console.warn(`${LOG} missing Square link for plan`, planKey);
      alert('Checkout link not configured yet for this plan.');
      return;
    }
    window.location.href = url;
  }

  async function handleSubscribe(planKey) {
    const ok = await isLoggedIn();
    if (!ok) {
      // after login, return to same page (you can later pass a plan param too)
      redirectToLogin(window.location.href);
      return;
    }
    goToSquare(planKey);
  }

  function handleContact() {
    if (typeof window.showSection === 'function') window.showSection('Contact');
    else window.location.hash = '#contact';
  }

  function wire(root) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const card = btn.closest('.plan');
      const planKey = card?.getAttribute('data-plan') || '';

      if (action === 'subscribe') {
        await handleSubscribe(planKey);
        return;
      }
      if (action === 'contact') {
        handleContact();
        return;
      }
    });
  }

  async function loadServicesPlans() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      // Not an error: only exists when Services section is rendered
      return;
    }

    // Avoid double insert
    if (mount.querySelector('.services-plans')) return;

    await injectCssOnce('components/services-plans/services-plans.css');

    const html = await fetchText('components/services-plans/services-plans.html');
    mount.innerHTML = html;

    wire(mount);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadServicesPlans = loadServicesPlans;
})();
===== docs/components/services-plans/services-hardtech.html =====
<!-- docs/components/services-plans/services-hardtech.html -->
<section class="services-plans" aria-label="Hard Tech subscriptions">
  <header class="services-plans__head">
    <div class="services-plans__kicker">Tech</div>
    <h2 class="services-plans__title">Hard Tech</h2>
    <p class="services-plans__sub">
      Fieldable builds: embedded, robotics, edge compute, custom tooling. Monthly. Cancel anytime.
    </p>
  </header>

  <div class="services-plans__grid" role="list">
    <!-- Starter -->
    <article class="plan" role="listitem" data-plan="hardtech_starter">
      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/infra.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">HT Starter</div>
          <div class="plan__price">
            <span class="plan__amt">$99</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Lightweight engineering help for scoping + unblocking hardware/edge work.
      </p>

      <ul class="plan__bullets">
        <li>Architecture review</li>
        <li>Weekly async support</li>
        <li>Bill of materials guidance</li>
      </ul>

      <button class="plan__cta btn btn-primary" type="button" data-action="subscribe">
        Subscribe
      </button>

      <div class="plan__foot">
        <span class="pill">Quick start</span>
        <span class="pill pill-muted">Individuals</span>
      </div>
    </article>

    <!-- Pro -->
    <article class="plan plan--featured" role="listitem" data-plan="hardtech_pro">
      <div class="plan__badge" aria-hidden="true">Recommended</div>

      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/trade-engine.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">HT Pro</div>
          <div class="plan__price">
            <span class="plan__amt">$349</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Hands-on builds: prototypes, firmware, edge pipelines, test harnesses.
      </p>

      <ul class="plan__bullets">
        <li>Design + implementation</li>
        <li>Test + validation plan</li>
        <li>Priority support</li>
      </ul>

      <button class="plan__cta btn btn-primary" type="button" data-action="subscribe">
        Subscribe
      </button>

      <div class="plan__foot">
        <span class="pill">Best value</span>
        <span class="pill pill-muted">Teams</span>
      </div>
    </article>

    <!-- Enterprise -->
    <article class="plan" role="listitem" data-plan="hardtech_enterprise">
      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/infra.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">HT Custom</div>
          <div class="plan__price">
            <span class="plan__amt">$999</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Integration + long-running support with SLAs, security, and deployment help.
      </p>

      <ul class="plan__bullets">
        <li>Custom scope + SLA</li>
        <li>Deployment support</li>
        <li>Direct engineering channel</li>
      </ul>

      <button class="plan__cta btn btn-ghost" type="button" data-action="contact">
        Contact sales
      </button>

      <div class="plan__foot">
        <span class="pill">SLA</span>
        <span class="pill pill-muted">Custom</span>
      </div>
    </article>
  </div>
</section>

===== docs/components/services-plans/services-plans.html =====
<!-- docs/components/services-plans/services-plans.html -->
<section class="services-plans" aria-label="Plans and subscriptions">
  <header class="services-plans__head">
    <div class="services-plans__kicker">Financial</div>
    <h2 class="services-plans__title">Streaming</h2>
    <p class="services-plans__sub">
      Subscribe for regular data feeds, archival data or customizations based on your needs. 
    </p>
  </header>

  <div class="services-plans__grid" role="list">
    <!-- Starter -->
    <article class="plan" role="listitem" data-plan="signals_starter">
      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/rss.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">Signals Starter</div>
          <div class="plan__price">
            <span class="plan__amt">$29</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Lightweight access to curated signals + alerts. Best for testing workflows.
      </p>

      <ul class="plan__bullets">
        <li>Daily signal digest</li>
        <li>Email notifications</li>
        <li>Basic API docs</li>
      </ul>

      <button class="plan__cta btn btn-primary" type="button" data-action="subscribe">
        Subscribe
      </button>

      <div class="plan__foot">
        <span class="pill">Fast setup</span>
        <span class="pill pill-muted">Most popular entry</span>
      </div>
    </article>

    <!-- Pro -->
    <article class="plan plan--featured" role="listitem" data-plan="fintech_pro">
      <div class="plan__badge" aria-hidden="true">Recommended</div>

      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/trade-engine.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">Fintech Pro</div>
          <div class="plan__price">
            <span class="plan__amt">$149</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Production-ready access patterns for decision engines, risk evaluation, and reporting.
      </p>

      <ul class="plan__bullets">
        <li>Higher-rate API access</li>
        <li>Telemetry + KPI templates</li>
        <li>Priority support</li>
      </ul>

      <button class="plan__cta btn btn-primary" type="button" data-action="subscribe">
        Subscribe
      </button>

      <div class="plan__foot">
        <span class="pill">Best value</span>
        <span class="pill pill-muted">Teams</span>
      </div>
    </article>

    <!-- Enterprise -->
    <article class="plan" role="listitem" data-plan="enterprise_custom">
      <div class="plan__top">
        <div class="plan__icon" aria-hidden="true">
          <img src="assets/icons/menu/infra.svg" alt="" />
        </div>
        <div class="plan__meta">
          <div class="plan__name">Enterprise / Custom</div>
          <div class="plan__price">
            <span class="plan__amt">$499</span><span class="plan__per">/mo</span>
          </div>
        </div>
      </div>

      <p class="plan__desc">
        Dedicated builds, integration support, and custom SLAs for serious deployments.
      </p>

      <ul class="plan__bullets">
        <li>Custom workflows + integration</li>
        <li>Security review + hardening</li>
        <li>Direct engineering channel</li>
      </ul>

      <button class="plan__cta btn btn-ghost" type="button" data-action="contact">
        Contact sales
      </button>

      <div class="plan__foot">
        <span class="pill">SLA</span>
        <span class="pill pill-muted">Custom scope</span>
      </div>
    </article>
  </div>

</section>
===== docs/components/services-plans/services-plans.js =====
/* docs/components/services-plans/services-plans.js */
(function () {
  'use strict';

  const LOG = '[services-plans]';

  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  // TODO: replace with real Square hosted checkout links (per plan)
  const SQUARE_CHECKOUT = {
    // Streaming / existing
    signals_starter: 'https://square.link/u/f3nO4ktd',
    fintech_pro: 'https://square.link/u/f3nO4ktd',
    enterprise_custom: 'https://square.link/u/f3nO4ktd',

    // Hard Tech (new)
    hardtech_starter: 'https://square.link/u/f3nO4ktd',
    hardtech_pro: 'https://square.link/u/f3nO4ktd',
    hardtech_enterprise: 'https://square.link/u/f3nO4ktd',
  };

  function qs(id) { return document.getElementById(id); }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function isLoggedIn() {
    try {
      const resp = await fetch(`${AUTH_ORIGIN}/me`, { credentials: 'include' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  function redirectToLogin(nextUrl) {
    const next = encodeURIComponent(nextUrl || window.location.href);
    window.location.href = `${AUTH_ORIGIN}/login?next=${next}`;
  }

  function goToSquare(planKey) {
    const url = SQUARE_CHECKOUT[planKey];
    if (!url || url.includes('REPLACE_')) {
      console.warn(`${LOG} missing Square link for plan`, planKey);
      alert('Checkout link not configured yet for this plan.');
      return;
    }
    window.location.href = url;
  }

  async function handleSubscribe(planKey) {
    const ok = await isLoggedIn();
    if (!ok) {
      redirectToLogin(window.location.href);
      return;
    }
    goToSquare(planKey);
  }

  function handleContact() {
    if (typeof window.showSection === 'function') window.showSection('Contact');
    else window.location.hash = '#contact';
  }

  function wire(root) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const card = btn.closest('.plan');
      const planKey = card?.getAttribute('data-plan') || '';

      if (action === 'subscribe') {
        await handleSubscribe(planKey);
        return;
      }
      if (action === 'contact') {
        handleContact();
        return;
      }
    });
  }

  async function mountBlock({ mountId, htmlUrl }) {
    const mount = qs(mountId);
    if (!mount) return;

    // Avoid double insert
    if (mount.querySelector('.services-plans')) return;

    const html = await fetchText(htmlUrl);
    mount.innerHTML = html;
    wire(mount);
  }

  async function loadServicesPlans() {
    // Shared styles for both blocks
    await injectCssOnce('components/services-plans/services-plans.css');

    // Existing “Streaming” block (already in services-plans.html)
    await mountBlock({
      mountId: 'services-plans-mount',
      htmlUrl: 'components/services-plans/services-plans.html',
    });

    // New “Hard Tech” block
    await mountBlock({
      mountId: 'services-hardtech-mount',
      htmlUrl: 'components/services-plans/services-hardtech.html',
    });
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadServicesPlans = loadServicesPlans;
})();
===== docs/components/services/services-section.html =====
<section class="svc">
  <!-- Mission / Positioning -->
  <div class="svc-grid">
    <article class="svc-card svc-hero">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/menu/company.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h2 class="svc-title">Services</h2>
          <p class="svc-subtitle">
            Open-source, production-grade engineering for data, ML, infra, security, and edge systems.
          </p>
        </div>
      </header>

      <div class="svc-callout">
        <div class="svc-callout-row">
          <span class="svc-pill">API Everything</span>
          <span class="svc-pill">Inspectability</span>
          <span class="svc-pill">Measured outcomes</span>
          <span class="svc-pill">No fluff</span>
        </div>
        <p class="svc-muted" style="margin-top:.6rem;">
          Haiphen builds custom systems where complexity is real: ambiguous data, messy pipelines, “works on my machine” infra,
          and security constraints that actually matter.
        </p>
      </div>

      <div class="svc-cta-row">
        <a class="svc-btn svc-btn-primary" href="javascript:void(0)" onclick="showSection('Contact')">
          <span class="svc-btn-ic"><img src="assets/icons/link.svg" alt="" aria-hidden="true"/></span>
          Start a project
        </a>

        <a class="svc-btn" href="https://haiphen.io" target="_blank" rel="noopener noreferrer">
          <span class="svc-btn-ic"><img src="assets/icons/external.svg" alt="" aria-hidden="true"/></span>
          Docs / Lineage
        </a>

        <a class="svc-btn" href="https://github.com/judesafo" target="_blank" rel="noopener noreferrer">
          <span class="svc-btn-ic"><img src="assets/icons/external.svg" alt="" aria-hidden="true"/></span>
          Open source
        </a>
      </div>
    </article>

    <!-- Quick “Capabilities” cards -->
    <article class="svc-card">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/menu/ai.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h3>AI / ML Systems</h3>
          <p class="svc-muted">Deployable pipelines, evals, reliability, and real telemetry.</p>
        </div>
      </header>

      <details class="svc-acc" open>
        <summary>What we ship</summary>
        <ul>
          <li>RAG + retrieval pipelines with measurable evaluation harnesses</li>
          <li>ETL → feature store → training → deployment (with rollback)</li>
          <li>Data quality gates + drift detection + alerting</li>
          <li>Batch + streaming inference (Kafka / queues) with SLOs</li>
        </ul>
      </details>

      <details class="svc-acc">
        <summary>Common outcomes</summary>
        <ul>
          <li>Reduced latency & cost per inference</li>
          <li>Fewer “silent failures” via dashboards + alerts</li>
          <li>Higher precision/recall through structured feedback loops</li>
        </ul>
      </details>
    </article>

    <article class="svc-card">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/menu/infra.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h3>Infrastructure</h3>
          <p class="svc-muted">Kubernetes, Terraform, CI/CD, observability, cost control.</p>
        </div>
      </header>

      <details class="svc-acc" open>
        <summary>Focus areas</summary>
        <ul>
          <li>Infra-as-code (Terraform/Ansible) + reproducible environments</li>
          <li>Containerization + K8s deployments + runtime guardrails</li>
          <li>Monitoring (Prometheus/Grafana) + logs (ELK) + tracing</li>
          <li>Cost optimization + capacity planning</li>
        </ul>
      </details>

      <details class="svc-acc">
        <summary>Typical deliverables</summary>
        <ul>
          <li>Terraform modules + documented runbooks</li>
          <li>Dashboards + alert rules aligned to SLOs</li>
          <li>CI pipelines (lint/test/security scans) + release strategy</li>
        </ul>
      </details>
    </article>

    <article class="svc-card">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/menu/trade-engine.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h3>Decision Engines</h3>
          <p class="svc-muted">Signals → scoring → execution → monitoring → reporting.</p>
        </div>
      </header>

      <div class="svc-mini-pipeline" aria-label="Decision engine pipeline">
        <div class="svc-node">Ingest</div><div class="svc-arrow">→</div>
        <div class="svc-node">Normalize</div><div class="svc-arrow">→</div>
        <div class="svc-node">Score</div><div class="svc-arrow">→</div>
        <div class="svc-node">Act</div><div class="svc-arrow">→</div>
        <div class="svc-node">Audit</div>
      </div>

      <details class="svc-acc">
        <summary>Use cases</summary>
        <ul>
          <li>Event detection + alerting (news, markets, ops incidents)</li>
          <li>Risk analysis + policy enforcement</li>
          <li>Automated decision routing + human-in-the-loop review</li>
        </ul>
      </details>
    </article>

    <article class="svc-card">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/menu/rss.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h3>Signals & Data</h3>
          <p class="svc-muted">Entity extraction, enrichment, clustering, lineage, KG foundations.</p>
        </div>
      </header>

      <details class="svc-acc" open>
        <summary>What this means in practice</summary>
        <ul>
          <li>Scrapers + parsers for “hostile” formats (PDFs, HTML, feeds)</li>
          <li>Entity extraction + dedupe + normalization</li>
          <li>Storage design (Postgres / Redis / object storage) + lineage</li>
          <li>Knowledge graph bootstrapping (schema + ingestion + query)</li>
        </ul>
      </details>

      <details class="svc-acc">
        <summary>When you know you need this</summary>
        <ul>
          <li>Your data is “technically there” but unusable</li>
          <li>Teams disagree on definitions (same term, different meaning)</li>
          <li>You can’t explain where a number came from</li>
        </ul>
      </details>
    </article>

    <article class="svc-card">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/menu/email.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h3>Security & OpSec</h3>
          <p class="svc-muted">Zero-trust patterns, hardening, threat modeling, safe-by-default builds.</p>
        </div>
      </header>

      <details class="svc-acc" open>
        <summary>What we do</summary>
        <ul>
          <li>Secure deployment patterns (least privilege, secrets hygiene)</li>
          <li>Supply chain hygiene + provenance + dependency scanning</li>
          <li>Access control models (RBAC/ABAC), auditability</li>
          <li>Runbooks: incident response + recovery drills</li>
        </ul>
      </details>
    </article>
  </div>

  <!-- Process / Engagement -->
  <div class="svc-split">
    <article class="svc-card">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/bolt.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h3>How we work</h3>
          <p class="svc-muted">Clear phases, visible progress, and a paper trail you can reuse.</p>
        </div>
      </header>

      <div class="svc-timeline">
        <div class="svc-step">
          <div class="svc-step-badge">1</div>
          <div class="svc-step-body">
            <div class="svc-step-title">Diagnose</div>
            <div class="svc-muted">Requirements, constraints, “what breaks first,” and success metrics.</div>
          </div>
        </div>

        <div class="svc-step">
          <div class="svc-step-badge">2</div>
          <div class="svc-step-body">
            <div class="svc-step-title">Prototype</div>
            <div class="svc-muted">Small demo with real data paths (no fake slides).</div>
          </div>
        </div>

        <div class="svc-step">
          <div class="svc-step-badge">3</div>
          <div class="svc-step-body">
            <div class="svc-step-title">Harden</div>
            <div class="svc-muted">Observability, tests, failure modes, and secure defaults.</div>
          </div>
        </div>

        <div class="svc-step">
          <div class="svc-step-badge">4</div>
          <div class="svc-step-body">
            <div class="svc-step-title">Ship</div>
            <div class="svc-muted">Deploy with runbooks + rollback + “how to operate it.”</div>
          </div>
        </div>
      </div>

      <details class="svc-acc">
        <summary>What you get (every time)</summary>
        <ul>
          <li>Architecture diagram + system boundaries</li>
          <li>Deployment/runbook docs + operational checklist</li>
          <li>Tests + monitoring + measurable KPIs</li>
          <li>Source code you can own and extend</li>
        </ul>
      </details>
    </article>

    <article class="svc-card">
      <header class="svc-card-head">
        <div class="svc-ic">
          <img src="assets/icons/shield.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h3>Deliverables menu</h3>
          <p class="svc-muted">Pick what you need. We’ll tell you what you don’t.</p>
        </div>
      </header>

      <div class="svc-deliverables">
        <div class="svc-chip">Architecture + threat model</div>
        <div class="svc-chip">Infra-as-code</div>
        <div class="svc-chip">K8s deployment</div>
        <div class="svc-chip">ETL + pipelines</div>
        <div class="svc-chip">Model eval harness</div>
        <div class="svc-chip">Dashboards + alerts</div>
        <div class="svc-chip">Data contracts</div>
        <div class="svc-chip">Runbooks + oncall</div>
        <div class="svc-chip">Security hardening</div>
        <div class="svc-chip">Cost optimization</div>
      </div>

      <details class="svc-acc">
        <summary>Engagement modes</summary>
        <ul>
          <li><strong>One-off build:</strong> scoped delivery with a finish line</li>
          <li><strong>Retainer:</strong> ongoing systems ownership + improvements</li>
          <li><strong>Advisory:</strong> architecture, reviews, and unblockers</li>
        </ul>
      </details>

      <div class="svc-note">
        <strong>Rule:</strong> if it can’t be explained, measured, and operated, it isn’t “done.”
      </div>
    </article>
  </div>

  <!-- Proof / Visuals you already have -->
  <article class="svc-card">
    <header class="svc-card-head">
      <div class="svc-ic">
        <img src="assets/icons/chart.svg" alt="" aria-hidden="true" />
      </div>
      <div>
        <h3>Visuals & artifacts</h3>
        <p class="svc-muted">These are already in your repo—now they’re presented like a product page.</p>
      </div>
    </header>

    <div class="svc-artifacts">
      <div class="svc-art">
        <div class="svc-art-title">Signal chain</div>
        <object type="image/svg+xml" data="assets/signal_chain.svg" class="svc-svg">SVG unsupported.</object>
      </div>

      <div class="svc-art">
        <div class="svc-art-title">Data sorter</div>
        <object type="image/svg+xml" data="assets/data_sorter1.svg" class="svc-svg">SVG unsupported.</object>
      </div>

      <div class="svc-art">
        <div class="svc-art-title">System animation</div>
        <object type="image/svg+xml" data="assets/tech_animated.svg" class="svc-svg">SVG unsupported.</object>
      </div>
    </div>
  </article>

  <!-- FAQ -->
  <article class="svc-card">
    <header class="svc-card-head">
      <div class="svc-ic">
        <img src="assets/icons/link.svg" alt="" aria-hidden="true" />
      </div>
      <div>
        <h3>FAQ</h3>
        <p class="svc-muted">Short answers. No mysticism.</p>
      </div>
    </header>

    <div class="svc-faq">
      <details class="svc-acc">
        <summary>Do you only do “big company” work?</summary>
        <div class="svc-muted svc-acc-body">
          No. The constraint is seriousness, not brand size. If the work matters and the inputs are real, we’ll talk.
        </div>
      </details>

      <details class="svc-acc">
        <summary>How do you keep projects from ballooning?</summary>
        <div class="svc-muted svc-acc-body">
          We agree on measurable outcomes early (latency, cost, quality, reliability). If a task doesn’t move a metric, it’s optional.
        </div>
      </details>

      <details class="svc-acc">
        <summary>What do you need from us to start?</summary>
        <div class="svc-muted svc-acc-body">
          A short problem statement, access to a representative sample of data/logs, and clarity on constraints (budget, time, security).
        </div>
      </details>
    </div>
  </article>

  <!-- Closing CTA -->
  <article class="svc-card svc-final">
    <div class="svc-final-inner">
      <div>
        <h3>Ready to build something real?</h3>
        <p class="svc-muted">
          We can start with a short diagnostic and turn it into a plan you can execute with or without us.
        </p>
      </div>
      <div class="svc-cta-row">
        <a class="svc-btn svc-btn-primary" href="javascript:void(0)" onclick="showSection('Contact')">
          <span class="svc-btn-ic"><img src="assets/icons/link.svg" alt="" aria-hidden="true"/></span>
          Contact
        </a>
        <a class="svc-btn" href="https://docs.google.com/forms/d/e/1FAIpQLSc8HhR9nIEE-DBgtKq2CQ-Y4PJ8Mr0pbE07fzGE15FhcfqG6g/viewform?usp=header"
           target="_blank" rel="noopener noreferrer">
          <span class="svc-btn-ic"><img src="assets/icons/external.svg" alt="" aria-hidden="true"/></span>
          Intake form
        </a>
      </div>
    </div>
  </article>
</section>
===== docs/components/services/services-section.js =====
/* global window, document, fetch */
(function () {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const CSS_ID = "services-section-css";

  async function fetchText(url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  function ensureCss(href) {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  NS.loadServicesSection = async function loadServicesSection() {
    const mount = document.getElementById("services-section-mount");
    if (!mount) return;

    try {
      ensureCss("components/services/services-section.css");
      const html = await fetchText("components/services/services-section.html");
      mount.innerHTML = html;
    } catch (err) {
      console.warn("[services-section] failed to load", err);
      mount.innerHTML = `
        <div style="padding:1rem;border:1px solid #e6ecf3;border-radius:12px;background:#fff;">
          <strong>Services section failed to load.</strong>
          <div style="margin-top:.35rem;color:#667;">Check console for details.</div>
        </div>
      `;
    }
  };
})();
===== docs/components/sidebar/sidebar-nav.js =====
/* docs/components/sidebar/sidebar-nav.js
 * Sidebar deep-link navigation:
 * - ensure section is visible (via showSection)
 * - scroll to a target element inside the section
 * - flash/outline the emphasized element (the "line" the user lands on)
 */
(function () {
  'use strict';

  const LOG_PREFIX = '[sidebar-nav]';

  function getHeaderHeightPx() {
    const header =
      document.querySelector('.site-header') ||
      document.querySelector('#site-header .site-header') ||
      document.querySelector('nav.navbar');

    const cssVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--header-h')
      .trim();

    const fallback = Number.parseInt(cssVar || '70', 10) || 70;
    const measured = header?.getBoundingClientRect().height || 0;

    return Math.max(fallback, measured || 0);
  }

  function scrollToWithHeaderOffset(targetEl, extra = 12) {
    if (!targetEl) return;

    const headerH = getHeaderHeightPx();
    const y = window.scrollY + targetEl.getBoundingClientRect().top - headerH - extra;

    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  function openAnyDetailsAncestors(el) {
    // If target is inside <details>, open them so the user actually sees it.
    let node = el?.parentElement;
    while (node) {
      if (node.tagName === 'DETAILS' && !node.open) node.open = true;
      node = node.parentElement;
    }
  }

  function flashEmphasis(el, ms = 1600) {
    if (!el) return;

    openAnyDetailsAncestors(el);

    // Remove then re-add so repeated clicks retrigger animation reliably
    el.classList.remove('haiphen-nav-flash');
    // force reflow
    void el.offsetWidth;
    el.classList.add('haiphen-nav-flash');

    window.setTimeout(() => {
      el.classList.remove('haiphen-nav-flash');
    }, ms);
  }

  function waitForElement(root, selector, timeoutMs = 2500) {
    return new Promise((resolve) => {
      if (!root) return resolve(null);
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const obs = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });

      obs.observe(root, { childList: true, subtree: true });

      window.setTimeout(() => {
        obs.disconnect();
        resolve(root.querySelector(selector) || null);
      }, timeoutMs);
    });
  }

  async function navigate({ section, target, emphasize, extraOffset = 12 }) {
    const contentRoot = document.getElementById('content-widget');

    if (!section || typeof window.showSection !== 'function') {
      console.warn(`${LOG_PREFIX} missing section or showSection()`, { section });
      return;
    }

    // 1) Ensure the section is rendered (showSection does sync innerHTML injection)
    window.showSection(section);

    // 2) Wait for target to exist (content is injected dynamically)
    // Prefer emphasize selector; fallback to target selector; fallback to contentRoot.
    const pickSelector = emphasize || target;
    let el = null;

    if (pickSelector) {
      el = await waitForElement(contentRoot, pickSelector);
    }

    const fallbackTarget = el || (target ? contentRoot?.querySelector(target) : null) || contentRoot;
    if (!fallbackTarget) return;

    // 3) Scroll to it with header offset
    // Delay one frame so layout settles after showSection's own scroll
    requestAnimationFrame(() => {
      scrollToWithHeaderOffset(fallbackTarget, extraOffset);
      // 4) Flash the emphasized "line"
      flashEmphasis(el || fallbackTarget);
    });
  }

  // Expose on your existing namespace
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.sidebarNavigate = navigate;
})();
===== docs/components/sidebar/site-sidebar.html =====
<!-- docs/components/sidebar/site-sidebar.html -->
<aside class="site-sidebar" role="complementary" aria-label="Quick sections">
  <nav class="site-sidebar__nav" aria-label="Quick links">
    <a class="site-sidebar__link"
       href="#"
       data-section="Services"
       data-target="#ethos"
       data-emph="#ethos">
      OpSec
    </a>

    <a class="site-sidebar__link"
       href="#"
       data-section="Services"
       data-target="#services-signals"
       data-emph="#services-signals">
      Signals
    </a>

    <a class="site-sidebar__link"
       href="#"
       data-section="Trades"
       data-target="#trades-pipeline"
       data-emph="#trades-pipeline">
      Encryption
    </a>

    <a class="site-sidebar__link"
       href="#"
       data-section="Inventory"
       data-target="#portfolio-top"
       data-emph="#portfolio-top">
      Embedded
    </a>

    <a class="site-sidebar__link"
       href="#"
       data-section="Services"
       data-target="#services-gallery"
       data-emph="#services-gallery">
      Robotics
    </a>

    <a class="site-sidebar__link"
       href="#"
       data-section="Contact"
       data-target="#contact-cta"
       data-emph="#contact-cta">
      Edge
    </a>
  </nav>
</aside>
===== docs/components/sidebar/site-sidebar.js =====
/* docs/components/sidebar/site-sidebar.js
 * Injects a professional sidebar and wires it to showSection().
 */
(function () {
  'use strict';

  const SIDEBAR_ID = 'site-sidebar';
  const MOUNT_ID = 'sidebar-mount';

  function qs(id) {
    return document.getElementById(id);
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function setActive(root, sectionName) {
    root.querySelectorAll('[data-section]').forEach((a) => {
      a.classList.toggle('is-active', a.getAttribute('data-section') === sectionName);
    });
  }

  function wire(root) {
    root.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-section]');
      if (!a) return;

      e.preventDefault();

      const section = a.getAttribute('data-section') || '';
      const target = a.getAttribute('data-target') || '';
      const emph = a.getAttribute('data-emph') || '';

      // Prefer deep-link navigation if available
      if (typeof window.HAIPHEN?.sidebarNavigate === 'function' && section) {
        window.HAIPHEN.sidebarNavigate({
          section,
          target: target || null,
          emphasize: emph || target || null,
        });
        setActive(root, section);
        return;
      }

      // Fallback: old behavior
      if (section && typeof window.showSection === 'function') {
        window.showSection(section);
        setActive(root, section);
      }

      // Legacy optional behavior
      if (a.getAttribute('data-action') === 'scroll-ethos' && typeof window.scrollToEthos === 'function') {
        window.scrollToEthos();
      }
    });
  }

  async function loadSidebar() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[sidebar] mount missing');
      return;
    }

    if (qs(SIDEBAR_ID)) return;

    await injectCssOnce('assets/base.css'); // ensure tokens exist
    await injectCssOnce('components/sidebar/site-sidebar.css');

    const html = await fetchText('components/sidebar/site-sidebar.html');
    mount.innerHTML = `<div id="${SIDEBAR_ID}">${html}</div>`;

    wire(mount);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSidebar = loadSidebar;
})();
===== docs/components/site-search/site-search-index.js =====
/* docs/components/site-search/site-search-index.js
 * Base navigation index. Add items as you sprinkle more ids in the DOM.
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(() => {
    const api = window.HAIPHEN?.SiteSearch;
    if (!api) return;

    api.setIndex([
      // --- Trades
      { label: "Trades", section: "Trades", elementId: "trades-top", keywords: ["fintech", "trading", "options", "intraday"] },
      { label: "Trades • Metrics", section: "Trades", elementId: "fintech-metrics", keywords: ["kpi", "metrics", "pnl", "win rate"] },
      { label: "Trades • Archive", section: "Trades", elementId: "trades-archive", keywords: ["archive", "history", "daily"] },
      { label: "Trades • Tech", section: "Trades", elementId: "portfolio-top", keywords: ["tech", "portfolio", "system"] },

      // Portfolio sub-anchors
      { label: "Portfolio • ETL Ingestion Engine", section: "Trades", elementId: "portfolio-etl", keywords: ["etl", "pipeline", "ingestion", "pdf"] },
      { label: "Portfolio • Protein Biomarker Indexing", section: "Trades", elementId: "portfolio-genomics", keywords: ["genomics", "pubmed", "biomarker"] },
      { label: "Portfolio • Web Crawler", section: "Trades", elementId: "portfolio-crawler", keywords: ["crawler", "search", "parsing"] },
      { label: "Portfolio • Distilled RAG LLM", section: "Trades", elementId: "portfolio-llm", keywords: ["rag", "llm", "qa"] },
      { label: "Portfolio • ZeroDays Follina", section: "Trades", elementId: "portfolio-follina", keywords: ["follina", "confluence", "security"] },

      // --- Services section (snap stack)
      { label: "Services", section: "Services", elementId: "services-plans-mount", keywords: ["services", "plans", "pricing"] },
      { label: "Services • Plans", section: "Services", elementId: "services-plans-mount", keywords: ["plans", "pricing", "tiers"] },
      { label: "Services • Hardtech", section: "Services", elementId: "services-hardtech-mount", keywords: ["hardware", "embedded", "robotics"] },

      // --- OnePager / Mission (your “Collaborate” section)
      { label: "Mission", section: "OnePager", elementId: "mission-top", keywords: ["mission", "about", "haiphen"] },
      { label: "OnePager", section: "OnePager", elementId: "onepager-top", keywords: ["onepager", "genomics", "zerodays"] },
      { label: "How it works", section: "OnePager", elementId: "how-it-works", keywords: ["pipeline", "ingest", "score", "execute", "monitor"] },
      { label: "Signals", section: "OnePager", elementId: "services-signals", keywords: ["signals", "decision engines", "risk"] },
      { label: "Ethos", section: "OnePager", elementId: "ethos", keywords: ["ethos", "open source", "security"] },
      { label: "Gallery", section: "OnePager", elementId: "services-gallery", keywords: ["gallery", "inventory", "images"] },

      // --- FAQ / Contact
      { label: "FAQ", section: "FAQ", elementId: "faq-mount", keywords: ["faq", "questions", "help"] },
      { label: "Contact", section: "Contact", elementId: "contact-us", keywords: ["contact", "email", "calendar"] },
    ]);
  });
})();
===== docs/components/site-search/site-search.js =====
/* docs/components/site-search/site-search.js
 * Lightweight command-palette navigation (not a crawler/search engine).
 * - Click 🔍 (right of login) or Ctrl+K or '/' to open.
 * - Filter through a curated index (plus registered sub-indexes).
 * - Navigate via showSection(section) + scroll to #elementId.
 */
(function () {
  "use strict";

  const CSS_HREF = "components/site-search/site-search.css";

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function normalize(s) {
    return String(s || "").trim().toLowerCase();
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;

    link.addEventListener("error", () => {
      console.warn("[site-search] failed to load css:", href);
    });

    document.head.appendChild(link);
  }

  function isTypingContext(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  // Prefer your existing helper if present, else do a safe offset scroll
  function scrollToIdWithHeaderOffset(elementId) {
    const el = byId(elementId);
    if (!el) return false;

    if (typeof window.scrollToWithHeaderOffset === "function") {
      window.scrollToWithHeaderOffset(el, 12);
      return true;
    }

    const header =
      qs(".site-header") ||
      qs("#site-header .site-header") ||
      qs("nav.navbar");

    const headerH = header?.getBoundingClientRect().height || 70;
    const y = window.scrollY + el.getBoundingClientRect().top - headerH - 12;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    return true;
  }

  function scoreMatch(item, q) {
    const qq = normalize(q);
    if (!qq) return 1;

    const label = normalize(item.label);
    const kws = (item.keywords || []).map(normalize);

    // Simple scoring (fast, predictable)
    if (label.startsWith(qq)) return 120;
    if (label.includes(qq)) return 80;
    if (kws.some((k) => k.startsWith(qq))) return 55;
    if (kws.some((k) => k.includes(qq))) return 30;

    return 0;
  }

  function ensureOverlay() {
    let overlay = byId("site-search-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "site-search-overlay";
    overlay.className = "site-search__overlay";
    overlay.innerHTML = `
      <div class="site-search__modal" role="dialog" aria-modal="true" aria-label="Site search">
        <div class="site-search__top">
          <input id="site-search-input" class="site-search__input" type="search" placeholder="Search… (Enter to jump)" autocomplete="off" />
          <span class="site-search__kbd" aria-hidden="true">Esc</span>
        </div>
        <div id="site-search-results" class="site-search__results" role="listbox" aria-label="Search results"></div>
      </div>
    `;

    // Click outside closes
    overlay.addEventListener("mousedown", (e) => {
      const modal = overlay.querySelector(".site-search__modal");
      if (modal && !modal.contains(e.target)) closeOverlay();
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  // -------- Index storage + registration API --------

  const state = {
    open: false,
    activePos: 0,
    // this is the working index; site-search-index.js can seed it
    index: [],
    // registered entries accumulate here (for component sub-indexes)
    registered: [],
  };

  function setIndex(entries) {
    state.index = Array.isArray(entries) ? entries.slice() : [];
  }

  function register(entries) {
    const list = Array.isArray(entries) ? entries : [];
    state.registered.push(...list);
  }

  // Merge base + registered; de-dupe by stable key
  function mergedIndex() {
    const all = [...state.index, ...state.registered];
    const seen = new Set();
    const out = [];

    for (const it of all) {
      const key = `${it.section || ""}|${it.elementId || ""}|${it.hash || ""}|${it.label || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }

  // -------- Rendering + navigation --------

  function renderResults(results, q) {
    const root = byId("site-search-results");
    if (!root) return;

    if (!results.length) {
      root.innerHTML = `<div class="site-search__empty">No matches for “${escapeHtml(q)}”.</div>`;
      return;
    }

    root.innerHTML = results
      .map((it, i) => {
        const meta =
          it.section ? `Section: ${it.section}${it.elementId ? ` • #${it.elementId}` : ""}` :
          it.hash ? `#${it.hash}` :
          it.elementId ? `#${it.elementId}` :
          "";

        const cls = i === state.activePos ? "site-search__item is-active" : "site-search__item";
        return `
          <div class="${cls}" role="option" aria-selected="${i === state.activePos ? "true" : "false"}" data-idx="${i}">
            <div class="site-search__label">${escapeHtml(it.label)}</div>
            <div class="site-search__meta">${escapeHtml(meta)}</div>
          </div>
        `;
      })
      .join("");

    root.querySelectorAll(".site-search__item").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const idx = Number(el.getAttribute("data-idx") || "0");
        state.activePos = Number.isFinite(idx) ? idx : 0;
        const input = byId("site-search-input");
        updateFromQuery(input ? input.value : "");
      });

      el.addEventListener("click", () => {
        const idx = Number(el.getAttribute("data-idx") || "0");
        const target = results[idx];
        if (target) navigateTo(target);
      });
    });
  }

  function updateFromQuery(q) {
    const all = mergedIndex();

    const scored = all
      .map((it) => ({ it, s: scoreMatch(it, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.it.label.localeCompare(b.it.label))
      .map((x) => x.it);

    state.activePos = Math.max(0, Math.min(state.activePos, Math.max(0, scored.length - 1)));
    renderResults(scored, q);
    return scored;
  }

  function openOverlay() {
    injectCssOnce(CSS_HREF);
    ensureOverlay();

    const overlay = byId("site-search-overlay");
    const input = byId("site-search-input");
    if (!overlay || !input) return;

    overlay.classList.add("is-open");
    overlay.style.display = "flex"; // ✅ failsafe: always visible
    state.open = true;
    state.activePos = 0;

    input.value = "";
    updateFromQuery("");

    setTimeout(() => input.focus(), 0);
  }

  function closeOverlay() {
    const overlay = byId("site-search-overlay");
    if (overlay) {
      overlay.classList.remove("is-open");
      overlay.style.display = "none"; // ✅ failsafe
    }
    state.open = false;
    state.activePos = 0;
  }

  function navigateTo(entry) {
    closeOverlay();

    // Preferred: use your hash router (shareable + consistent)
    if (entry.section && typeof window.setHashForSection === "function") {
      const sub = entry.elementId || entry.hash || "";
      window.setHashForSection(entry.section, sub);
      return;
    }

    // Fallback: direct section + scroll (still works if router missing)
    if (entry.section && typeof window.showSection === "function") {
      window.showSection(entry.section);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (entry.elementId && scrollToIdWithHeaderOffset(entry.elementId)) return;
          if (entry.hash) window.location.hash = `#${entry.hash}`;
        });
      });
      return;
    }

    // Last resort: hash/scroll only
    if (entry.hash) {
      window.location.hash = `#${entry.hash}`;
      return;
    }
    if (entry.elementId) scrollToIdWithHeaderOffset(entry.elementId);
  }

  function wireOverlayInputs() {
    const input = byId("site-search-input");
    if (!input || input.__wired) return;
    input.__wired = true;

    input.addEventListener("input", () => {
      state.activePos = 0;
      updateFromQuery(input.value);
    });

    input.addEventListener("keydown", (e) => {
      const results = updateFromQuery(input.value);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.activePos = Math.min(state.activePos + 1, Math.max(0, results.length - 1));
        updateFromQuery(input.value);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        state.activePos = Math.max(0, state.activePos - 1);
        updateFromQuery(input.value);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = results[state.activePos];
        if (target) navigateTo(target);
      }
    });
  }

  function wireGlobalShortcuts() {
    if (window.__haiphenSiteSearchShortcuts) return;
    window.__haiphenSiteSearchShortcuts = true;

    window.addEventListener("keydown", (e) => {
      const active = document.activeElement;

      // Esc closes
      if (state.open && e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
        return;
      }

      // Ctrl+K / Cmd+K opens
      const isK = (e.key || "").toLowerCase() === "k";
      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        openOverlay();
        wireOverlayInputs();
        return;
      }

      // '/' opens (unless typing)
      if (!e.ctrlKey && !e.metaKey && e.key === "/" && !isTypingContext(active)) {
        e.preventDefault();
        openOverlay();
        wireOverlayInputs();
        return;
      }
    });
  }

  function wireHeaderButton() {
    const btn = byId("site-search-btn");
    if (!btn || btn.__wired) return;
    btn.__wired = true;

    btn.addEventListener("click", () => {
      openOverlay();
      wireOverlayInputs();
    });
  }

  function bindWhenHeaderReady() {
    // Try immediately (in case header is already there)
    wireHeaderButton();

    // Then listen for header ready event
    window.addEventListener("haiphen:header:ready", () => {
      wireHeaderButton();
    }, { once: false });
  }

  function bindHeaderButton() {
    wireHeaderButton();
    window.addEventListener("haiphen:header:ready", wireHeaderButton);
  }

  async function loadSiteSearch() {
    injectCssOnce(CSS_HREF);
    ensureOverlay();
    wireGlobalShortcuts();
    wireOverlayInputs();
    bindHeaderButton();
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSiteSearch = loadSiteSearch;

  // Expose a small public API for index seeding + sub-index registration
  window.HAIPHEN.SiteSearch = {
    setIndex,
    register,
    open: openOverlay,
    close: closeOverlay,
  };
})();
===== docs/components/trades-overlay/trades-overlay.html =====
<!-- docs/components/trades-overlay/trades-overlay.html -->
<div class="haiphen-overlay" role="dialog" aria-modal="true" aria-label="KPI detail" aria-hidden="true">
  <div class="haiphen-overlay__backdrop" data-close="1"></div>

  <!-- backdrop image (set dynamically) -->
  <div class="haiphen-overlay__bg" aria-hidden="true"></div>

  <div class="haiphen-overlay__panel" role="document">
    <header class="haiphen-overlay__header">
      <div class="haiphen-overlay__titles">
        <div class="haiphen-overlay__kicker">KPI Drilldown</div>
        <h3 class="haiphen-overlay__title" id="haiphen-overlay-title">Metric</h3>
        <div class="haiphen-overlay__subtitle" id="haiphen-overlay-subtitle">
          Random series • interactive controls • replace with entity JSON later
        </div>
      </div>

      <button class="haiphen-overlay__close" type="button" aria-label="Close" title="Close (Esc)">
        ×
      </button>
    </header>

    <section class="haiphen-overlay__body">
      <div class="haiphen-overlay__chartWrap">
        <canvas id="haiphen-overlay-chart" class="haiphen-overlay__canvas" width="900" height="420"></canvas>

        <div class="haiphen-overlay__stats" aria-label="Quick stats">
          <div class="haiphen-overlay__stat">
            <div class="k">Last</div>
            <div class="v" id="haiphen-stat-last">—</div>
          </div>
          <div class="haiphen-overlay__stat">
            <div class="k">Min</div>
            <div class="v" id="haiphen-stat-min">—</div>
          </div>
          <div class="haiphen-overlay__stat">
            <div class="k">Max</div>
            <div class="v" id="haiphen-stat-max">—</div>
          </div>
          <div class="haiphen-overlay__stat">
            <div class="k">Δ</div>
            <div class="v" id="haiphen-stat-delta">—</div>
          </div>
        </div>
      </div>

      <!-- Add inside .haiphen-overlay__body, under the chartWrap (or after it) -->

      <div class="haiphen-overlay__entityRow">
        <div class="haiphen-overlay__badge" id="haiphen-overlay-badge">Metrics coverage</div>
        <div class="haiphen-overlay__meta" id="haiphen-overlay-meta"></div>
      </div>

      <!-- Portfolio mode -->
      <div class="haiphen-overlay__portfolio" id="haiphen-portfolio" hidden>
        <label for="haiphen-portfolio-select">Portfolio contracts</label>
        <select id="haiphen-portfolio-select"></select>
      </div>

      <!-- Extremes (hi/lo contracts) -->
      <div class="haiphen-overlay__extremes" id="haiphen-extremes" hidden></div>
      <aside class="haiphen-overlay__controls" aria-label="Controls">
        <div class="haiphen-overlay__control">
          <label for="haiphen-chart-type">Chart</label>
          <select id="haiphen-chart-type">
            <option value="line" selected>Line</option>
            <option value="area">Area</option>
            <option value="bars">Bars</option>
          </select>
        </div>

        <div class="haiphen-overlay__control">
          <label for="haiphen-points">Points <span id="haiphen-points-label" class="pill">96</span></label>
          <input id="haiphen-points" type="range" min="24" max="240" step="12" value="96" />
        </div>

        <div class="haiphen-overlay__control">
          <label for="haiphen-vol">Volatility <span id="haiphen-vol-label" class="pill">0.65</span></label>
          <input id="haiphen-vol" type="range" min="0.10" max="2.00" step="0.05" value="0.65" />
        </div>

        <div class="haiphen-overlay__control">
          <label class="haiphen-overlay__checkbox">
            <input id="haiphen-smooth" type="checkbox" checked />
            <span>Smoothed</span>
          </label>
        </div>

        <div class="haiphen-overlay__buttons">
          <button id="haiphen-regenerate" class="btn btn-primary" type="button">Regenerate</button>
          <button id="haiphen-export" class="btn btn-ghost" type="button">Export PNG</button>
        </div>

        <div class="haiphen-overlay__note">
          Disclaimer: Not a financial adviser, use discretion for personal finances.
        </div>
      </aside>
    </section>
  </div>
</div>
===== docs/components/trades-overlay/trades-overlay.js =====
  /* docs/components/trades-overlay/trades-overlay.js
   * KPI overlay with synthetic interactive chart.
   * - Mount once (index.html adds #trades-overlay-mount)
   * - Open via window.HAIPHEN.TradesOverlay.open({ title, screenshotUrl, seed })
   */
  (function () {
    'use strict';

    const LOG = '[trades-overlay]';
    const MOUNT_ID = 'trades-overlay-mount';

    function qs(id) { return document.getElementById(id); }

    async function fetchText(url) {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return await resp.text();
    }

    async function injectCssOnce(href) {
      const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
      if (already) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    // Small deterministic PRNG so "random" can be stable per KPI if desired
    function mulberry32(seed) {
      let t = seed >>> 0;
      return function () {
        t += 0x6D2B79F5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
    }

    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    function movingAverage(arr, win) {
      const w = Math.max(1, win | 0);
      if (w <= 1) return arr.slice();
      const out = new Array(arr.length);
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        sum += arr[i];
        if (i >= w) sum -= arr[i - w];
        const denom = Math.min(i + 1, w);
        out[i] = sum / denom;
      }
      return out;
    }

    function genSeries({ points, vol, seed }) {
      const rand = mulberry32(seed);
      const arr = [];
      let v = 50 + rand() * 50;
      for (let i = 0; i < points; i++) {
        // random walk with gentle mean reversion + shocks
        const shock = (rand() - 0.5) * 10 * vol;
        const drift = (50 - v) * 0.015; // pull toward 50
        v = v + drift + shock;
        v = clamp(v, -50, 150);
        arr.push(v);
      }
      return arr;
    }
    function formatNum(x) {
      const n = Number(x);
      if (!Number.isFinite(n)) return '—';
      const abs = Math.abs(n);
      if (abs >= 1000) return n.toFixed(0);
      if (abs >= 100) return n.toFixed(1);
      return n.toFixed(2);
    }
    function formatNumForKpi(kpiTitle, x) {
      if (!Number.isFinite(x)) return '—';
      const k = String(kpiTitle || '').toLowerCase();

      // Greeks: keep meaningful decimals
      if (/(delta|gamma|theta|vega|rho)/.test(k)) {
        return x.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
      }

      // Percent-like
      if (/percent|win rate|drawdown/.test(k)) {
        return x.toFixed(2);
      }

      // USD-ish
      const abs = Math.abs(x);
      if (abs >= 1000) return x.toFixed(0);
      if (abs >= 100) return x.toFixed(1);
      return x.toFixed(2);
    }

    function escapeHtml(s) {
      return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function formatTimeLabel(ts) {
      try {
        const d = new Date(ts);
        if (!Number.isFinite(d.getTime())) return String(ts || '');

        // If it looks like a date-only series (daily MV), show "Dec 27"
        const mm = d.toLocaleString(undefined, { month: 'short' });
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm} ${dd}`;
      } catch {
        return String(ts || '');
      }
    }

    function renderExtremes(extremes, kpiTitle) {
      const el = qs('haiphen-extremes');
      if (!el) return;

      const hi = extremes?.hi || [];
      const lo = extremes?.lo || [];
      el.hidden = (hi.length + lo.length) === 0;

      const metricLabel = (() => {
        const k = String(kpiTitle || '');
        if (/pnl/i.test(k)) return 'Impact (USD)';
        if (/percent/i.test(k)) return 'Impact (%)';
        if (/liquidity/i.test(k)) return 'Impact';
        if (/unrealized/i.test(k)) return 'Impact (USD)';
        return 'Impact';
      })();

      const row = (r) => `
        <div class="xrow">
          <div class="cn">${escapeHtml(r.contract_name || '')}</div>
          <div class="sym">${escapeHtml(r.symbol || '')}</div>
          <div class="pnl">${escapeHtml(formatNumForKpi(kpiTitle, Number(r.metric_value)))}</div>
        </div>
      `;

      el.innerHTML = `
        <div class="xbox">
          <div class="xtitle">Top impact (${escapeHtml(metricLabel)})</div>
          ${hi.map(row).join('') || '<div class="muted">—</div>'}
        </div>
        <div class="xbox">
          <div class="xtitle">Lowest impact (${escapeHtml(metricLabel)})</div>
          ${lo.map(row).join('') || '<div class="muted">—</div>'}
        </div>
      `;
    }

    function renderPortfolio(portfolioAssets) {
      const wrap = qs('haiphen-portfolio');
      const sel = qs('haiphen-portfolio-select');
      if (!wrap || !sel) return;

      const assets = Array.isArray(portfolioAssets) ? portfolioAssets : [];
      wrap.hidden = assets.length === 0;

      sel.innerHTML = assets
        .map((a, i) => {
          const sym = String(a.symbol || '').trim();
          const cn = String(a.contract_name || '').trim();
          const label = sym && cn ? `${sym} • ${cn}` : (sym || cn || `Contract ${i + 1}`);
          return `<option value="${i}">${escapeHtml(label)}</option>`;
        })
        .join('');
    }

    function normalizeExtremesPayload(extremesPayload, kpiTitle) {
      // Supports:
      // - { hi: [...], lo: [...] }  (legacy)
      // - { items: [...] }          (newer)
      // - [...]                     (newer)
      const payload = extremesPayload ?? {};
      const items = Array.isArray(payload) ? payload
        : Array.isArray(payload.items) ? payload.items
        : (Array.isArray(payload.hi) || Array.isArray(payload.lo)) ? [
            ...(payload.hi || []).map(x => ({ ...x, side: 'hi' })),
            ...(payload.lo || []).map(x => ({ ...x, side: 'lo' })),
          ]
        : [];

      // Choose a sensible value field based on KPI name, with fallbacks
      const pickValue = (r) => {
        // Prefer metric_raw if present (it’s your “signed” impact)
        if (Number.isFinite(Number(r.metric_raw))) return Number(r.metric_raw);

        const k = String(kpiTitle || '');
        if (/pnl/i.test(k) && Number.isFinite(Number(r.individual_pnl))) return Number(r.individual_pnl);
        if (/liquidity/i.test(k) && Number.isFinite(Number(r.liquidity_drag))) return Number(r.liquidity_drag);

        // last resort: abs metric
        if (Number.isFinite(Number(r.metric_abs))) return Number(r.metric_abs);
        return NaN;
      };

      const out = { hi: [], lo: [] };
      for (const r of items) {
        const side = String(r.side || '').toLowerCase();
        const norm = {
          trade_id: r.trade_id,
          symbol: r.symbol,
          contract_name: r.contract_name,
          metric_value: pickValue(r),
          // keep originals if you want to debug in-console later
          _raw: r,
        };
        if (side === 'hi') out.hi.push(norm);
        else if (side === 'lo') out.lo.push(norm);
      }

      // Sort: hi descending, lo ascending (or by abs if you prefer)
      out.hi.sort((a, b) => (Number(b.metric_value) || -Infinity) - (Number(a.metric_value) || -Infinity));
      out.lo.sort((a, b) => (Number(a.metric_value) || Infinity) - (Number(b.metric_value) || Infinity));

      return out;
    }

    function pickExtremesForKpi(extremesPayload, kpiTitle) {
      const p = extremesPayload || {};
      const byKpi = p.byKpi && typeof p.byKpi === 'object' ? p.byKpi : null;
      if (!byKpi) return p;

      const want = String(kpiTitle || '').trim();
      if (!want) return p;

      // 1) exact key
      if (byKpi[want]) return byKpi[want];

      // 2) case-insensitive key match
      const wantLc = want.toLowerCase();
      for (const key of Object.keys(byKpi)) {
        if (String(key).toLowerCase() === wantLc) return byKpi[key];
      }

      // 3) legacyKpi fallback
      const legacy = p.legacyKpi && byKpi[p.legacyKpi] ? byKpi[p.legacyKpi] : null;
      if (legacy) return legacy;

      // 4) first KPI as last resort
      const first = Object.keys(byKpi)[0];
      return first ? byKpi[first] : p;
    }
    
    function computeSeriesSourceBadge(seriesMeta) {
      // seriesMeta items look like {t,v,src} where src is 'real' or 'synthetic'
      const badge = qs('haiphen-overlay-badge');
      const meta = qs('haiphen-overlay-meta');
      if (!badge || !meta) return;

      const pts = Array.isArray(seriesMeta) ? seriesMeta : [];
      const real = pts.filter(p => !p?.src || p?.src === 'real').length;
      const syn = pts.filter(p => p?.src === 'synthetic').length;

      badge.classList.remove('is-real', 'is-mixed');

      if (pts.length === 0) {
        badge.textContent = 'metrics';
        meta.textContent = 'No published series points for this KPI.';
        return;
      }

      if (syn === 0 && real > 0) {
        badge.textContent = 'real';
        badge.classList.add('is-real');
      } else if (real === 0 && syn > 0) {
        badge.textContent = 'derivatives';
      } else {
        badge.textContent = 'metrics';
        badge.classList.add('is-mixed');
      }

      meta.textContent = `${real} real points • ${syn} synthetic • ${pts.length} total`;
    }  

    function drawChart(ctx, opts) {
      const { w, h, type, series, smooth, xLabel, yLabel, xTicks } = opts;

      // HiDPI
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      ctx.canvas.width = Math.floor(w * dpr);
      ctx.canvas.height = Math.floor(h * dpr);
      ctx.canvas.style.width = `${w}px`;
      ctx.canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, w, h);

      // padding
      const padL = 44, padR = 16, padT = 18, padB = 34;
      const iw = w - padL - padR;
      const ih = h - padT - padB;

      const raw = series.slice();
      const data = smooth ? movingAverage(raw, 6) : raw;

      let min = Infinity, max = -Infinity;
      for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        min = 0; max = 1;
      }
      const range = (max - min) || 1;
      const yMin = min - range * 0.08;
      const yMax = max + range * 0.08;

      function xAt(i) { return padL + (i / Math.max(1, data.length - 1)) * iw; }
      function yAt(v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * ih; }

      // soft grid
      ctx.save();
      ctx.strokeStyle = 'rgba(20,32,51,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = padT + (i / 5) * ih;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + iw, y);
        ctx.stroke();
      }
      ctx.restore();

      // axes labels
      ctx.save();
      ctx.fillStyle = 'rgba(20,32,51,0.55)';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 2; i++) {
        const t = i / 2;
        const v = yMax - t * (yMax - yMin);
        const y = padT + t * ih;
        ctx.fillText(formatNum(v), padL - 8, y);
      }
      ctx.restore();

      // axis titles
      ctx.save();
      ctx.fillStyle = 'rgba(20,32,51,0.60)';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

      // Y label (rotated)
      if (yLabel) {
        ctx.translate(14, padT + ih / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(yLabel), 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // X label
      if (xLabel) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(xLabel), padL + iw / 2, padT + ih + 18);
      }
      ctx.restore();
      // gradient stroke
      const grad = ctx.createLinearGradient(padL, padT, padL + iw, padT + ih);
      grad.addColorStop(0, '#7c3aed');  // purple
      grad.addColorStop(0.5, '#06b6d4'); // cyan
      grad.addColorStop(1, '#22c55e');   // green

      const baseLine = yAt(0);

      if (type === 'bars') {
        ctx.save();
        const barW = iw / data.length;
        for (let i = 0; i < data.length; i++) {
          const x = padL + i * barW;
          const y = yAt(data[i]);
          const y0 = clamp(baseLine, padT, padT + ih);
          const top = Math.min(y, y0);
          const height = Math.abs(y - y0);
          ctx.fillStyle = (data[i] >= 0) ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)';
          ctx.fillRect(x + 0.15 * barW, top, Math.max(1, 0.7 * barW), height);
        }
        ctx.restore();
        return { min, max, last: data[data.length - 1] };
      }

      // area fill (optional)
      if (type === 'area') {
        ctx.save();
        const fill = ctx.createLinearGradient(padL, padT, padL, padT + ih);
        fill.addColorStop(0, 'rgba(6,182,212,0.25)');
        fill.addColorStop(1, 'rgba(124,58,237,0.06)');

        ctx.beginPath();
        ctx.moveTo(xAt(0), clamp(baseLine, padT, padT + ih));
        for (let i = 0; i < data.length; i++) ctx.lineTo(xAt(i), yAt(data[i]));
        ctx.lineTo(xAt(data.length - 1), clamp(baseLine, padT, padT + ih));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
      }

      // x ticks (few labels)
      if (Array.isArray(xTicks) && xTicks.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(20,32,51,0.55)';
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const n = xTicks.length;
        const marks = Math.min(5, n);
        for (let i = 0; i < marks; i++) {
          const idx = Math.round((i / (marks - 1)) * (n - 1));
          const x = padL + (idx / Math.max(1, n - 1)) * iw;
          const y = padT + ih + 6;
          const lab = xTicks[idx] ?? '';
          ctx.fillText(String(lab), x, y);
        }
        ctx.restore();
      }
      // main line
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = grad;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = xAt(i);
        const y = yAt(data[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // last point highlight
      const lx = xAt(data.length - 1);
      const ly = yAt(data[data.length - 1]);
      ctx.save();
      ctx.fillStyle = '#0ea5e9';
      ctx.shadowColor = 'rgba(14,165,233,0.35)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      return { min, max, last: data[data.length - 1] };
    }

    function getAxisForKpi(kpiTitle) {
      const k = String(kpiTitle || '').trim();

      // Keep these aligned with your KPI tile names / DB kpi names
      if (/pnl/i.test(k)) return { xLabel: 'Time', yLabel: 'PnL (USD)' };
      if (/percent/i.test(k)) return { xLabel: 'Time', yLabel: 'Percent change (%)' };
      if (/liquidity/i.test(k)) return { xLabel: 'Time', yLabel: 'Liquidity ratio' };
      if (/unrealized/i.test(k)) return { xLabel: 'Time', yLabel: 'Unrealized P/L (USD)' };

      return { xLabel: 'Time', yLabel: '' };
    }

    function hashSeedFromString(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function getCurrentTradesScreenshotUrl() {
      const img = document.getElementById('trades-img');
      const src = img?.getAttribute('src') || img?.src || '';
      return src || 'assets/trades/alpaca_screenshot.png';
    }

    function installOverlayBehavior(root) {
      const overlay = root.querySelector('.haiphen-overlay');
      const bg = root.querySelector('.haiphen-overlay__bg');
      const closeBtn = root.querySelector('.haiphen-overlay__close');
      const titleEl = qs('haiphen-overlay-title');
      const subtitleEl = qs('haiphen-overlay-subtitle');

      const canvas = qs('haiphen-overlay-chart');
      const typeSel = qs('haiphen-chart-type');
      const pointsEl = qs('haiphen-points');
      const pointsLabel = qs('haiphen-points-label');
      const volEl = qs('haiphen-vol');
      const volLabel = qs('haiphen-vol-label');
      const smoothEl = qs('haiphen-smooth');
      const regenBtn = qs('haiphen-regenerate');
      const exportBtn = qs('haiphen-export');

      const statLast = qs('haiphen-stat-last');
      const statMin = qs('haiphen-stat-min');
      const statMax = qs('haiphen-stat-max');
      const statDelta = qs('haiphen-stat-delta');
      const DEFAULT_POINTS = 96;
      const MIN_POINTS = 24;
      const MAX_POINTS_SYNTH = 288; // e.g. 5-min resolution for 24h = 288

      if (pointsEl) {
        pointsEl.min = String(MIN_POINTS);

        // if HTML shipped with max=24, override it
        pointsEl.max = String(MAX_POINTS_SYNTH);

        // ensure a reasonable default
        if (!pointsEl.value || Number(pointsEl.value) < MIN_POINTS) {
          pointsEl.value = String(DEFAULT_POINTS);
        }

        if (pointsLabel) pointsLabel.textContent = String(pointsEl.value);
      }
      if (!overlay || !bg || !canvas) {
        console.warn(`${LOG} missing overlay nodes`);
        return null;
      }

      const ctx = canvas.getContext('2d');

      const state = {
        title: 'Metric',
        subtitle: '—',
        seed: 12345,

        // NEW: seriesMeta is authoritative if provided
        series: [],
        seriesMeta: null,     // [{t,v,src}]
        isReal: false,

        // NEW: entity drilldowns
        extremes: { hi: [], lo: [] },
        portfolioAssets: [],
      };

      function resizeCanvasAndRender() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(280, Math.floor(rect.width));
        const h = Math.max(180, Math.floor(rect.height));
        const points = Number(pointsEl?.value || 96);
        const vol = Number(volEl?.value || 0.65);
        const type = String(typeSel?.value || 'line');
        const smooth = Boolean(smoothEl?.checked);

        // Only generate synthetic series when we *don't* have real series
        if (!state.isReal) {
          if (!state.series || state.series.length !== points) {
            state.series = genSeries({ points, vol, seed: state.seed });
          }
        } else {
          // Keep the real series aligned to the slider
          const meta = (state.seriesMeta || []).slice(-points);
          state.series = meta.map(p => Number(p.v));
        }

        // Derive x ticks from real series timestamps when available
        let xTicks = null;
        if (state.seriesMeta && state.seriesMeta.length) {
          const meta = state.seriesMeta.slice(-points);
          xTicks = meta.map(p => formatTimeLabel(p.t));
        } else {
          xTicks = Array.from({ length: state.series.length }, (_, i) => String(i + 1));
        }

        // KPI-specific axis labels (fallbacks)
        const axis = getAxisForKpi(state.title);

        const stats = drawChart(ctx, {
          w, h, type,
          series: state.series,
          smooth,
          xLabel: axis.xLabel,
          yLabel: axis.yLabel,
          xTicks
        });

        const last = stats?.last ?? NaN;
        const min = stats?.min ?? NaN;
        const max = stats?.max ?? NaN;
        const delta = (Number.isFinite(last) && state.series.length > 1)
          ? (last - state.series[0])
          : NaN;

        if (statLast) statLast.textContent = formatNumForKpi(state.title, last);
        if (statMin) statMin.textContent = formatNumForKpi(state.title, min);
        if (statMax) statMax.textContent = formatNumForKpi(state.title, max);
        if (statDelta) statDelta.textContent = formatNumForKpi(state.title, delta);
      }

      function open({ title, subtitle, screenshotUrl, seed, series, extremes, portfolioAssets } = {}) {
        state.title = title || 'Metric';
        state.subtitle = subtitle || '';
        state.seed = Number.isFinite(seed) ? seed : hashSeedFromString(state.title);

        // Accept published entity series: [{t,v,src}] (already hybrid-filled in your publisher)
        state.seriesMeta = Array.isArray(series) ? series : null;
        state.isReal = Boolean(state.seriesMeta && state.seriesMeta.length);

        const chosenExtremes = pickExtremesForKpi(extremes, state.title);
        state.extremes = normalizeExtremesPayload(chosenExtremes, state.title);
        state.portfolioAssets = Array.isArray(portfolioAssets) ? portfolioAssets : [];

        if (titleEl) titleEl.textContent = state.title;

        // Update the “kicker”/subtitle in a truthy way
        if (subtitleEl) {
          // Only show what the caller provides; otherwise keep it neutral.
          subtitleEl.textContent = state.subtitle || 'KPI series & contract extremes';
        }

        const bgUrl = screenshotUrl || getCurrentTradesScreenshotUrl();
        bg.style.backgroundImage = `url("${bgUrl}")`;

        // Show portfolio UI only for Portfolio tile
        const isPortfolio = (state.title || '').toLowerCase() === 'portfolio';

        const canvasEl = qs('haiphen-overlay-chart');
        const chartWrap = canvasEl?.closest('.haiphen-overlay__chartWrap');
        const controls = root.querySelector('.haiphen-overlay__controls');
        const extremesEl = qs('haiphen-extremes');

        if (chartWrap) chartWrap.style.display = isPortfolio ? 'none' : '';
        if (controls) controls.style.display = isPortfolio ? 'none' : '';
        if (extremesEl) extremesEl.hidden = true; // always hidden for Portfolio

        renderPortfolio(isPortfolio ? state.portfolioAssets : []);
        if (!isPortfolio) renderExtremes(state.extremes, state.title);

        // Sync labels
        if (pointsLabel && pointsEl) pointsLabel.textContent = String(pointsEl.value);
        if (volLabel && volEl) volLabel.textContent = String(volEl.value);

        // IMPORTANT:
        // - if real series exists, DO NOT generate with genSeries()
        // - instead, use the published seriesMeta and slice to requested points
        if (!isPortfolio) {
          const points = Number(pointsEl?.value || 96);

          if (state.isReal) {
            const meta = state.seriesMeta.slice(-points);
            state.series = meta.map(p => Number(p.v));
            computeSeriesSourceBadge(meta);
          } else {
            const vol = Number(volEl?.value || 0.65);
            state.series = genSeries({ points, vol, seed: state.seed });
            computeSeriesSourceBadge([]);
          }
        } else {
          // Portfolio is dropdown-only. No badge, no chart, no stats.
          computeSeriesSourceBadge([]);
        }
        // Clamp points slider to real series length when real series exists
        if (pointsEl) {
          if (state.seriesMeta && state.seriesMeta.length) {
            const n = state.seriesMeta.length;
            pointsEl.max = String(Math.max(MIN_POINTS, n));
            if (Number(pointsEl.value) > n) pointsEl.value = String(n);
          } else {
            pointsEl.max = String(MAX_POINTS_SYNTH);
          }
          if (pointsLabel) pointsLabel.textContent = String(pointsEl.value);
        }
        // Disable “regenerate” if we have real series
        if (regenBtn) regenBtn.disabled = state.isReal || isPortfolio;

        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('haiphen-overlay-lock');
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(resizeCanvasAndRender);
      }

      function close() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('haiphen-overlay-lock');
        document.body.style.overflow = '';
      }

      // handlers
      closeBtn?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
      });

      function onControlChange() {
        if (pointsLabel && pointsEl) pointsLabel.textContent = String(pointsEl.value);
        if (volLabel && volEl) volLabel.textContent = String(volEl.value);

        const points = Number(pointsEl?.value || 96);

        if (state.isReal && state.seriesMeta && state.seriesMeta.length) {
          const meta = state.seriesMeta.slice(-points);
          state.series = meta.map(p => Number(p.v));
          computeSeriesSourceBadge(meta);
        } else {
          const vol = Number(volEl?.value || 0.65);
          state.series = genSeries({ points, vol, seed: state.seed });
          computeSeriesSourceBadge([]);
        }

        resizeCanvasAndRender();
      }

      pointsEl?.addEventListener('input', onControlChange);
      volEl?.addEventListener('input', onControlChange);
      typeSel?.addEventListener('change', resizeCanvasAndRender);
      smoothEl?.addEventListener('change', resizeCanvasAndRender);

      regenBtn?.addEventListener('click', () => {
        if (state.isReal) return; // ignore regenerate when real data provided
        state.seed = (state.seed + 1337) >>> 0;
        onControlChange();
      });

      exportBtn?.addEventListener('click', () => {
        try {
          const a = document.createElement('a');
          a.download = `${(state.title || 'metric').replaceAll(/\s+/g, '_')}.png`;
          a.href = canvas.toDataURL('image/png');
          a.click();
        } catch (err) {
          console.warn(`${LOG} export failed`, err);
        }
      });

      // resize when window changes
      window.addEventListener('resize', () => {
        if (!overlay.classList.contains('is-open')) return;
        resizeCanvasAndRender();
      });

      return { open, close };
    }

    async function loadOverlay() {
      const mount = qs(MOUNT_ID);
      if (!mount) {
        console.warn(`${LOG} mount missing (#${MOUNT_ID})`);
        return;
      }

      // avoid double insert
      if (mount.querySelector('.haiphen-overlay')) return;

      await injectCssOnce('components/trades-overlay/trades-overlay.css');
      const html = await fetchText('components/trades-overlay/trades-overlay.html');
      mount.innerHTML = html;

      const api = installOverlayBehavior(mount);
      if (!api) return;

      window.HAIPHEN = window.HAIPHEN || {};
      window.HAIPHEN.TradesOverlay = api;
    }

    // expose loader like your other components
    window.HAIPHEN = window.HAIPHEN || {};
    window.HAIPHEN.loadTradesOverlay = loadOverlay;
  })();
===== docs/contact.html =====
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Haiphen — Contact</title>
  <link rel="icon" href="assets/favicon.ico">

  <!-- Keep your existing OG/Twitter/JSON-LD blocks here (copy from index.html) -->

  <link rel="stylesheet" href="assets/base.css" />

  <script src="components/headers/site-header.js"></script>
  <script src="components/sidebar/site-sidebar.js"></script>
  <script src="components/footers/site-footer.js"></script>
  <script src="assets/site.js"></script>
</head>

<body>
  <div id="header-mount"></div>
  <div id="sidebar-mount"></div>

  <main class="main-container">
    <h1>Contact</h1>

    <section id="contact-us">
      <p>Founder: <a href="https://linkedin.com/in/judesafo" target="_blank" rel="noopener noreferrer">Jude Safo</a></p>
      <p>Email: <a href="mailto:pi@haiphenai.com">pi@haiphenai.com</a></p>
      <p>Phone: (512) 910-4544</p>
      <p>Address: Manhattan, New York, USA</p>

      <div style="margin-top: 2rem; text-align:center;">
        <a href="https://docs.google.com/forms/d/e/1FAIpQLSc8HhR9nIEE-DBgtKq2CQ-Y4PJ8Mr0pbE07fzGE15FhcfqG6g/viewform?usp=header"
           target="_blank" rel="noopener noreferrer">
          <img src="assets/nature.png" alt="Nature" style="max-width:80%; border-radius: 4px;">
        </a>
      </div>

      <p style="margin-top: 2rem;">"No man is a failure who has friends" - Angel Clarence</p>
    </section>
  </main>

  <div id="footer-sentinel" aria-hidden="true" style="height:1px;"></div>
  <div id="footer-mount"></div>
</body>
</html>
===== docs/index.html =====
<!DOCTYPE html>
<html lang="en">
<head>
   <!-- Basic SEO -->
  <meta name="description" content="Haiphen is a signals intelligence    open-source, scalable infrastructure for NLP, machine learning, embedded systems, and operational security." />
  <meta name="author" content="J. S." />
  <meta name="keywords" content="Haiphen, Signals intelligence, NLP, machine learning consulting, open source infrastructure, cybersecurity, Jude Safo" />

  <!-- Open Graph for LinkedIn/Facebook -->
  <meta property="og:title" content="Haiphen | Signals Intelligence & Automated Trading Infrastructure" />
  <meta property="og:description" content="Signals intelligence + production-grade ML/NLP infrastructure, including automated trading telemetry, risk analytics, and event-driven pipelines. Build with us." />
  <meta property="og:image" content="https://judesafo.github.io/assets/robot_haiphen.svg" />
  <meta property="og:url" content="https://haiphen.io" />
  <meta property="og:type" content="website" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Haiphen - Open Source Signals Intelligence Engineering" />
  <meta name="twitter:description" content="Custom signal processing + ML/NLP infrastructure. We build real systems for real problems. API everything." />
  <meta name="twitter:image" content="https://haiphen.io/haiphen-aboutme/assets/robot_haiphen.svg" />
 
  <link rel="stylesheet" href="assets/base.css" />

  <script src="components/headers/site-header.js"></script>
  <script src="components/sidebar/site-sidebar.js"></script>
  <script src="components/section-menu/section-menu.js"></script>
  <script src="components/footers/site-footer.js"></script>
  <script src="components/sidebar/sidebar-nav.js"></script>
  <script src="components/trades-overlay/trades-overlay.js"></script>
  <script src="components/services-plans/services-plans.js"></script>
  <script src="components/services/services-section.js"></script>
  <script src="components/faq/faq.js"></script>
  <script src="components/site-search/site-search.js"></script>
  <script src="components/site-search/site-search-index.js"></script>

  <!-- 🔽 Structured Data for SEO -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Haiphen",
    "url": "https://haiphen.io",
    "logo": "https://haiphen.io/assets/robot_haiphen.png",
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+1-512-910-4544",
      "contactType": "Sales",
      "areaServed": "US",
      "availableLanguage": ["English"]
    },
    "sameAs": [
      "https://linkedin.com/in/judesafo",
      "https://github.com/judesafo"
    ]
  }
  </script>

  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Haiphen</title>
  <style>
    /* ============================================================
       Reset & Base Styles
    ============================================================ */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: var(--font-sans);
      color: var(--text);
      background: url('./assets/background.svg') no-repeat center center fixed;
      background-size: cover;
      padding-top: 70px;
      min-height: 100vh;
    }
    
    /* ============================================================
       Fixed Navbar (Top)
    ============================================================ */
    nav.navbar {
      position: fixed;
      top: 0; left: 0; width: 100%;
      background: rgba(255, 255, 255, 0.95);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.5rem 1rem;
      z-index: 1000;
    }
    nav.navbar .logo {
      cursor: pointer;
    }
    nav.navbar .logo img {
      height: 40px;
    }
    nav.navbar .nav-links {
      display: flex; gap: 1rem;
    }
    nav.navbar .nav-links a {
      text-decoration: none; color: #2c3e50; font-weight: bold;
      padding: 0.5rem 1rem; transition: background 0.3s ease;
    }
    nav.navbar .nav-links a:hover {
      background: #ecf0f1; border-radius: 4px;
    }
    
    /* ============================================================
       Hero Section (with solid background for readability)
    ============================================================ */
    .hero {
      background: rgba(255, 255, 255, 0.0);
      padding: 0; border-radius: 8px;
      margin-bottom: 4rem;
    }
    .hero h1 {
      font-size: 3rem; color: #2c3e50; margin-bottom: 1rem;
    }
    .hero-logo img {
      max-width: 400px; width: 100%; height: auto;
      display: block; margin: 0 auto 10px; transform: translateX(-115px) translateY(-55px); /* shift left by 20px */
    }
    .hero p {
      font-size: 1.05rem; color: #555; margin-bottom: 3rem; margin-top: 0rem;  transform: translateX(-110px) translateY(-45px); /* shift left by 20px */
    }
    
    /* Navbar “Login” button */
    nav.navbar .login-btn {
      background: #5A9BD4;           /* your brand blue */
      color: #fff;                   /* white text */
      padding: 0.4rem 0.9rem;        /* a little breathing room */
      border-radius: 9999px;         /* pill-shape */
      text-decoration: none;         /* remove underline */
      font-weight: bold;
      margin-left: 1rem;             /* space from the other links */
      transition: background 0.2s ease;
    }
    nav.navbar .login-btn:hover {
      background: #34495e;           /* darker on hover */
    }    
    /* ============================================================
       Section Menu
    ============================================================ */
    .section-menu {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 5rem;
      flex-wrap: wrap;
    }
    .section-menu button {
      background: #5A9BD4;
      color: #fff;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.3s ease;
    }
    .section-menu button:hover {
      background: #34495e;
    }
    
    /* ============================================================
       Content Widget (Accordion-Like Area)
    ============================================================ */
    .content-widget {
      max-width: 960px; width: 100%;
      background: #fff; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      display: none; /* hidden by default */
      opacity: 0; /* hidden by default */
      transition: opacity 0.5s ease;
    }
    .content-widget.active {
      display: block; opacity: 1;
    }
    
    /* ============================================================
       Bottom Left Contact Widget (Profile)
    ============================================================ */
    .contact-widget {
      position: fixed; bottom: 20px; left: 20px;
      width: 50px; height: 50px; cursor: pointer; z-index: 1000;
    }
    .contact-widget img {
      width: 100%; height: auto; border-radius: 50%;
      border: 2px solid #2c3e50;
    }
    .contact-popup {
      position: absolute; bottom: 60px; left: 0;
      background: rgba(255, 255, 255, 0.95); border: 1px solid #2c3e50;
      border-radius: 4px; padding: 0.5rem 1rem; display: none;
      white-space: nowrap; font-size: 0.9rem;
    }
    .contact-widget:hover .contact-popup {
      display: block;
    }



    /* ============================================================
       Session Avatar
    ============================================================ */
    /* === Session display (replaces Login after auth) === */
    .session-user {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      border: 2px solid #5A9BD4;
      background: rgba(90,155,212,0.1);
      color: #2c3e50;
      font-size: 0.9rem;
      font-weight: bold;
      line-height: 1;
    }
    .session-user img {
      width: 20px;
      height: 20px;
      border-radius: 50%;
    }
    .session-user .logout-link {
      margin-left: 0.25rem;
      font-weight: bold;
      text-decoration: none;
      color: #5A9BD4;
    }
    .session-user .logout-link:hover {
      text-decoration: underline;
      color: #34495e;
    }

	:root{
	  --sidebar-w: 220px;
	  --header-h: 70px;
	}

	.main-container{
	  min-height: 100vh;
	  display: flex;
	  flex-direction: column;
	  align-items: center;
	  padding: 4rem 2rem;
	  text-align: center;
	}

	/* If sidebar is present on desktop, reserve space consistently */
	@media (min-width: 920px){
	  .main-container{
	    padding-left: calc(2rem + var(--sidebar-w));
	  }
	}  
    /* ============================================================
       Service Keys Popup Styling
    ============================================================ */
    .service-keys {
      background-color: #f2f2f2;
      padding: 1rem;
      margin-top: 2rem;
      border-radius: 4px;
      text-align: left;
      display: inline-block;
    }
    .service-keys strong {
      margin-right: 0.5rem;
    }
    .service-key {
      position: relative;
      color: #5A9BD4;
      text-decoration: none;
      font-weight: bold;
      margin-right: 0.5rem;
      cursor: pointer;
    }
    .service-tooltip {
      display: none;
      position: absolute;
      bottom: 120%;
      left: 50%;
      transform: translateX(-50%);
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      padding: 0.5rem;
      /* Key changes here: */
      width: 300px;           /* fixed width so all popups are the same size */
      /* max-width: 100%;    <-- remove this if it conflicts */
      color: #000;
      font-weight: normal;
      text-decoration: none;
      z-index: 100;
      white-space: normal;    /* enables line wrapping */
      word-wrap: break-word;  /* breaks long words if needed */
      text-align: left;
    }
    .service-key:hover .service-tooltip,
    .service-tooltip:hover {
      display: block;
    }

    /* === Services gallery (NEW) === */
    .services-gallery-wrapper{
      max-height:450px;          /* keeps the widget compact */
      overflow-y:auto;
      padding-right:.4rem;       /* room for scrollbar */
      margin-top:2rem;
    }
    .services-gallery{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
      gap:1.5rem;
    }
    .gallery-item{
      display:flex;
      flex-direction:column;
      align-items:center;
    }
    .gallery-item img{
      width:100%;
      aspect-ratio:4/3;
      object-fit:cover;
      border-radius:8px;
      box-shadow:0 2px 8px rgba(0,0,0,.08);
      cursor:pointer;
      transition:transform .25s ease;
    }
    .gallery-item img:hover{transform:scale(1.04);}
    .gallery-item figcaption{
      margin-top:.4rem;
      font-size:.85rem;
      color:#555;
      text-align:center;
    }    
    /* Lightbox overlay */
    #lightbox{
      position:fixed;
      inset:0;
      display:none;               /* hidden until opened */
      align-items:center;
      justify-content:center;
      background:rgba(0,0,0,.85);
      z-index:2000;
    }
    #lightbox img{
      max-width:90%;
      max-height:90%;
      border-radius:8px;
    }    
    /* ============================================================
       Step by Step
    ============================================================ */
    /* Steps Section */
    .steps-container {
      display: flex; justify-content: center; gap: 2rem;
      margin-bottom: 2rem; flex-wrap: nowrap; width: 100%; max-width: 900px;
    }
    .step {
      flex: 1; min-width: 150px; text-align: center;
    }
    .step img {
      max-width: 100%; height: auto; display: block; margin: 0 auto;
    }
    .step p {
      margin-top: 0.5rem; font-size: 1rem; color: #555;
    }
    
    /* ============================================================
       OnePager Carousel Styles
    ============================================================ */
    .onepager-container {
      position: relative; display: inline-block;
      max-width: 800px; width: 100%;
    }
    .onepager-container img {
      width: 100%; display: block;
    }
    .onepager-click-zone {
      position: absolute; top: 0; width: 50%; height: 100%; cursor: pointer;
    }
    .onepager-click-left { left: 0; }
    .onepager-click-right { right: 0; }
    .onepager-arrow {
      position: absolute; top: 50%; transform: translateY(-50%);
      background: rgba(0,0,0,0.2); color: white; border: none;
      padding: 1rem; cursor: pointer; font-size: 2rem; border-radius: 50%;
      opacity: 0; transition: opacity 0.3s ease, background 0.3s ease;
    }
    .onepager-prev { left: 10px; }
    .onepager-next { right: 10px; }
    /* Show arrows only if user hovers over left or right zone */
    .onepager-click-left:hover ~ .onepager-prev,
    .onepager-click-right:hover ~ .onepager-next {
      opacity: 1; background: rgba(0,0,0,0.5);
    }
    .onepager-arrow:hover {
      background: rgba(0,0,0,0.8);
    }

    /* 2️⃣  drop this anywhere in a <style> block (after the existing .tech-right rule) */
    .svg-stack{
      display:flex;               /* turn the column itself into a flex-box            */
      flex-direction:column;      /* stack children vertically                         */
      gap:1.5rem;                 /* space between the two illustrations               */
      align-items:center;         /* centre them horizontally                          */
      overflow-x:auto;            /* safety-net: allow horizontal scroll if ever needed*/
    }
    .svg-stack .tech-svg {
      width: 100%;
      max-width: 600px;
      height: auto;
      min-height: 220px; /* ✅ Give each SVG a visible presence */
      display: block;
    }


    #ethos.flash {
      background: #fff8b0;
      transition: background 2s ease;
    }
    .tech-bullets ul {
      columns: 2; /* easy responsive layout */
      -webkit-columns: 2;
      -moz-columns: 2;
      list-style-type: disc;
      padding-left: 1.5rem;
      font-size: 1rem;
      line-height: 1.6;
      margin-top: 0.5rem;
    }
    .inline-bullets {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;         /* ✅ Center the list */
      gap: 0.75rem 1.5rem;             /* ✅ Row gap, column gap */
      padding: 0;
      margin: 0.5rem auto 1rem;  /* ⬅️ top margin reduced from 1rem to 0.5rem */
      list-style: none;                /* Remove default bullets */
      max-width: 700px;                /* Optional: cap total width */
    }

    .inline-bullets li::before {
      content: "•";
      color: #5A9BD4;
      margin-right: 0.4rem;
      font-weight: bold;
    }

    .inline-bullets li {
      font-size: 0.95rem;
      line-height: 1.6;
    }
    /* ============================================================
       Tech animated
    ============================================================ */
	  .tech-container {
	    display: flex;
	    gap: 1rem;
	    align-items: stretch;
	    justify-content: center;
	    flex-wrap: wrap;
	    text-align: left;
	    margin-top: 1rem;
	  }
	  .tech-left {
	    flex: 0.1;      /* smaller width for text column */
	    min-width: 280px;
	  }
	  .tech-right {
	    flex: 1.2;      /* larger width for SVG */
	    min-width: 280px;
	  }
	  .tech-svg {
	    width: 100%;
	    max-width: 600px; /* increased size for better legibility */
	    height: auto;
	    display: block;
	    margin: auto;
	  }

	/* give space so content doesn't sit under sidebar on wide screens */
	@media (min-width: 920px) {
	  .main-container { padding-left: 220px; }
	}

	/* ============================================================
	   Snap Sections (one full section visible at a time)
	============================================================ */

	/* A scrollable stack that snap-locks to each child panel */
	.snap-stack{
	  /* viewport minus fixed header and a little breathing room */
	  height: calc(100vh - var(--header-h) - 24px);
	  overflow-y: auto;
	  overscroll-behavior: contain;
	  scroll-snap-type: y mandatory;
	  scroll-behavior: smooth;

	  /* spacer so one panel sits “alone” in the viewport */
	  padding: 12vh 0;

	  /* nicer on iOS */
	  -webkit-overflow-scrolling: touch;
	}

	/* Each snap panel is a full “screen” */
	.snap-panel{
	  scroll-snap-align: center;
	  scroll-snap-stop: always;

	  min-height: calc(100vh - var(--header-h) - 24px);
	  display: flex;
	  align-items: center;
	  justify-content: center;

	  padding: 2rem 0;

	  /* “hide” non-active panels until you scroll */
	  opacity: 0.18;
	  filter: blur(1px);
	  transform: scale(0.985);
	  pointer-events: none;

	  transition: opacity 220ms ease, filter 220ms ease, transform 220ms ease;
	}

	.snap-panel.is-active{
	  opacity: 1;
	  filter: none;
	  transform: scale(1);
	  pointer-events: auto;
	}

	/* Respect reduced motion */
	@media (prefers-reduced-motion: reduce){
	  .snap-stack{ scroll-behavior: auto; }
	  .snap-panel{ transition: none; }
	}	
	.stat-btn{
	  appearance: none;
	  -webkit-appearance: none;
	  border: 1px solid #e6ecf3;
	  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
	  border-radius: 14px;
	  padding: .85rem .9rem;
	  box-shadow: 0 2px 10px rgba(0,0,0,.05);
	  text-align: left;
	  width: 100%;
	  cursor: pointer;
	}

	.stat-btn:hover{
	  transform: translateY(-1px);
	  box-shadow: 0 10px 24px rgba(0,0,0,0.08);
	  border-color: rgba(90,155,212,0.45);
	}

	.stat-btn:focus-visible{
	  outline: none;
	  box-shadow: 0 0 0 3px rgba(90,155,212,0.25);
	}	
	/* ============================================================
	   Fintech/Trades: Collapsible "Tech" subsection
	============================================================ */
	.fintech-tech {
	  margin-top: 1.75rem;
	  border-top: 1px solid #eef2f7;
	  padding-top: 1.25rem;
	  text-align: left;
	}

	.fintech-tech > summary {
	  list-style: none; /* remove default marker */
	  cursor: pointer;
	  display: flex;
	  align-items: center;
	  justify-content: center; /* keeps your centered vibe */
	  gap: 0.6rem;
	  user-select: none;
	  font-weight: 800;
	  color: #2c3e50;
	  font-size: 1.6rem; /* close to h2 */
	  margin: 0.25rem 0 0.75rem;
	}

	/* hide the default triangle in Chrome/Safari */
	.fintech-tech > summary::-webkit-details-marker {
	  display: none;
	}

	.fintech-tech > summary::after {
	  content: "▾";
	  font-size: 1.1rem;
	  transform: translateY(1px);
	  transition: transform 160ms ease;
	  opacity: 0.85;
	}

	.fintech-tech[open] > summary::after {
	  transform: rotate(180deg) translateY(-1px);
	}

	/* a subtle hover state */
	.fintech-tech > summary:hover {
	  color: #34495e;
	}	
    /* ============================================================
      Trades KPI Grid
    ============================================================ */

	/* Let the user scroll/drag on the strip; only the actual button is clickable */
	.trades-archive-viewport { position: relative; }
	.archive-nav {
	  pointer-events: auto; /* button itself is clickable */
	}

	.trades-archive-viewport{
	  position: relative;
	  display: flex;                 /* <-- add */
	  align-items: center;           /* <-- add */
	  gap: .35rem;                   /* space so buttons don't cover content */
	  overflow-x: auto;
	  overflow-y: hidden;
	  scroll-behavior: smooth;
	  -webkit-overflow-scrolling: touch;
	  scrollbar-width: none;
	}
	.trades-archive-viewport::-webkit-scrollbar {
	  display: none;                    /* Chrome/Safari */
	}

	.trades-archive-track {
	  display: flex;
	  gap: .65rem;
	  padding: .1rem;                   /* tiny padding so focus rings aren't clipped */
	}

	.trades-thumb {
	  flex: 0 0 calc((100% - 2 * .65rem) / 3);  /* 3 visible */
	}

	/* nav buttons stay pinned to the viewport edges while content scrolls */
	.archive-nav{
	  position: sticky;              /* <-- key change */
	  top: 50%;
	  transform: translateY(-50%);
	  background: rgba(0,0,0,0.35);
	  color: #fff;
	  border: none;
	  width: 36px;
	  height: 36px;
	  border-radius: 9999px;
	  font-size: 1.6rem;
	  cursor: pointer;
	  opacity: 0;
	  transition: opacity .2s ease, background .2s ease;
	  z-index: 5;                    /* above thumbnails */
	  flex: 0 0 auto;                /* don’t shrink */
	  pointer-events: auto;
	}

	.archive-prev{ left: 6px; }
	.archive-next{ right: 6px; }

	.trades-archive-viewport:hover .archive-nav{ opacity: 1; }
	.archive-nav:hover{ background: rgba(0,0,0,0.55); }

	.trades-archive-viewport:hover .archive-nav {
	  opacity: 1;
	}

	.archive-prev { left: 6px; }
	.archive-next { right: 6px; }

	.trades-archive-dropdown {
	  margin-top: .75rem;
	}
    .trades-kpi-strip {
      margin-top: 1.2rem;
      padding-bottom: 0.25rem;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .trades-kpi-grid {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(130px, 1fr);
      grid-template-rows: repeat(2, auto); /* 2 rows visible = 8x2 feel */
      gap: 0.75rem;
      padding-bottom: 0.5rem;
    }

    .trades-kpi-card {
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
      border: 1px solid #e6ecf3;
      border-radius: 14px;
      padding: 0.75rem 0.8rem;
      cursor: pointer;
      user-select: none;
      transition:
        transform 0.12s ease,
        box-shadow 0.12s ease,
        border-color 0.12s ease;
      min-height: 96px;
    }

    .trades-kpi-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(0,0,0,0.08);
      border-color: rgba(90,155,212,0.45);
    }

    .trades-kpi-card:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(90,155,212,0.25);
    }

    .trades-kpi-icon {
      width: 28px;
      height: 28px;
      border-radius: 10px;
      background: rgba(90,155,212,0.12);
      border: 1px solid rgba(90,155,212,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.45rem;
    }

    .trades-kpi-icon img {
      width: 16px;
      height: 16px;
    }

    .trades-kpi-name {
      font-size: 0.78rem;
      font-weight: 700;
      color: #667;
      line-height: 1.2;
    }

    .trades-kpi-value {
      font-size: 1.05rem;
      font-weight: 800;
      color: #2c3e50;
      margin-top: 0.15rem;
    }

    /* Mobile: fewer visible columns */
    @media (max-width: 640px) {
      .trades-kpi-grid {
        grid-auto-columns: minmax(150px, 1fr);
        grid-template-rows: repeat(1, auto);
      }
    }	
    /* ============================================================
      Trades Pro UI
    ============================================================ */
    #trades-lightbox{
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,.85);
      z-index: 3000;
      padding: 2rem;
    }
    #trades-lightbox img{
      max-width: 92%;
      max-height: 92%;
      border-radius: 14px;
    }

    /* make header actually center in the widget */
    .trades-wrap{
      max-width: 960px;
      margin: 0 auto;
    }

    .trades-header{
      align-items: center;            /* instead of flex-start */
    }

    .trades-title{
      text-align: left;               /* keep text readable */
    }

    .trades-cta{
      margin-left: auto;
    }

    /* --- archive strip --- */
    .trades-archive{
      margin-top: 1.1rem;
    }

    .trades-archive-grid{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr)); /* 3 across */
      gap: .65rem;
      margin-top: .65rem;
    }

    @media (max-width: 720px){
      .trades-archive-grid{ grid-template-columns: 1fr; } /* stack on mobile */
    }

    .trades-thumb{
      border: 1px solid #e6ecf3;
      background: #fff;
      border-radius: 12px;
      padding: .5rem;
      cursor: pointer;
      user-select: none;
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
      outline: none;
    }

    .trades-thumb:hover{
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(0,0,0,0.08);
      border-color: rgba(90,155,212,0.45);
    }

    .trades-thumb:focus-visible{
      box-shadow: 0 0 0 3px rgba(90,155,212,0.25);
    }

    .trades-thumb.active{
      border-color: #5A9BD4;
      box-shadow: 0 0 0 3px rgba(90,155,212,0.15);
    }

    .trades-thumb-date{
      font-size: .78rem;
      font-weight: 800;
      color: #2c3e50;
      margin-bottom: .35rem;
    }

    .trades-thumb img{
      width: 100%;
      height: 92px;              /* small thumbnail height */
      object-fit: cover;
      border-radius: 10px;
      display: block;
      pointer-events: none;      /* ensures parent gets click */
    }
    .trades-pro h2 { margin-top: 0.25rem; }

    .trades-header{
      display:flex;
      justify-content: space-between;
      align-items: center;  /* was flex-start */
      gap: 1rem;
      flex-wrap: wrap;
    }

    .trades-title{
      flex: 1;
      min-width: 280px;
    }

    .trades-cta{
      margin-left: auto;          /* ensures it hugs right cleanly */
      justify-content: flex-end;
    }
    .trades-subtitle{ color:#555; margin-top:.25rem; line-height:1.55; }

    .trades-badge{
      display:inline-flex;
      align-items:center;
      gap:.5rem;
      font-size:.85rem;
      color:#34495e;
      background: rgba(90,155,212,0.10);
      border: 1px solid rgba(90,155,212,0.25);
      padding: .25rem .6rem;
      border-radius: 9999px;
    }
    .trades-badge .dot{
      width:8px; height:8px; border-radius:50%;
      background:#2ecc71;
      box-shadow: 0 0 0 3px rgba(46,204,113,0.15);
    }

    .btn{
      display:inline-flex;
      align-items:center;
      gap:.5rem;
      padding:.55rem .85rem;
      border-radius: 10px;
      font-weight: 700;
      text-decoration: none;
      border: 1px solid #e6ecf3;
      background:#fff;
      cursor:pointer;
      transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
    }
    .btn:hover{
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(0,0,0,0.08);
    }
    .btn-ic img{ width: 16px; height: 16px; display:block; }

    .btn-primary{
      background:#5A9BD4;
      color:#fff;
      border-color:#5A9BD4;
    }
    .btn-primary:hover{ background:#3c7fb8; }

    .btn-ghost{
      color:#2c3e50;
      background: #fff;
    }

    .trades-stats{
      display:grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: .85rem;
      margin: 1rem 0 1.15rem;
    }
    .stat{
      border: 1px solid #e6ecf3;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
      border-radius: 14px;
      padding: .85rem .9rem;
      box-shadow: 0 2px 10px rgba(0,0,0,.05);
    }
    .stat-ic{
      width: 34px; height: 34px;
      border-radius: 10px;
      display:flex; align-items:center; justify-content:center;
      background: rgba(90,155,212,0.12);
      border: 1px solid rgba(90,155,212,0.25);
      margin-bottom: .55rem;
      color:#2c3e50;
    }
    .stat-ic img{ width:18px; height:18px; }
    .stat-k{ font-size:.82rem; color:#667; }
    .stat-v{ font-size:1.05rem; margin-top:.15rem; }
    .stat-s{ font-size:.82rem; color:#667; margin-top:.25rem; line-height:1.35; }

    .trades-panel{
      border: 1px solid #e6ecf3;
      background: #fff;
      border-radius: 14px;
      padding: 1rem;
      margin-bottom: 1.1rem;
    }

    .panel-head h3{ margin-bottom: .2rem; }
    .pipeline{
      display:flex;
      align-items: center;
      flex-wrap: wrap;
      gap: .55rem;
      margin-top: .75rem;
      margin-bottom: .85rem;
    }
    .pipe-step{
      display:flex;
      align-items:center;
      gap:.6rem;
      border: 1px solid #eef2f7;
      background: #fbfcfe;
      border-radius: 12px;
      padding: .55rem .7rem;
    }
    .pipe-node{
      width: 28px; height: 28px;
      border-radius: 10px;
      display:flex; align-items:center; justify-content:center;
      font-weight:800;
      color:#2c3e50;
      background: rgba(90,155,212,0.14);
      border: 1px solid rgba(90,155,212,0.28);
    }
    .pipe-title{ font-weight:800; color:#2c3e50; line-height:1.1; }
    .pipe-sub{ font-size:.82rem; color:#667; margin-top:.1rem; }
    .pipe-arrow{ color:#99a; font-weight:900; }

    .trades-accordions{
      display:grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .75rem;
    }
    .acc{
      border: 1px solid #eef2f7;
      border-radius: 12px;
      padding: .65rem .75rem;
      background: #fbfcfe;
    }
    .acc summary{
      cursor:pointer;
      font-weight: 800;
      color:#2c3e50;
    }
    .acc ul{ margin-top: .55rem; padding-left: 1.15rem; line-height: 1.6; color:#555; }

    /* reuse your existing .trades-summary-box; make it look more premium */
    .trades-summary-box{
      background: #fbfcfe;
      border: 1px solid #e6ecf3;
      border-left: 4px solid #5A9BD4;
      border-radius: 12px;
    }

    /* Responsive */
    @media (max-width: 920px){
      .trades-stats{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px){
      .trades-stats{ grid-template-columns: 1fr; }
      .trades-accordions{ grid-template-columns: 1fr; }
      .trades-cta{ justify-content:flex-start; }
    }
    /* ============================================================
       Responsive Adjustments
    ============================================================ */
    @media (max-width: 600px) {
      .hero h1 { font-size: 2.5rem; }
      .section-menu { flex-direction: column; align-items: center; }
    }
  </style>
</head>
<body>
  <!-- Fixed Navbar -->
  <div id="header-mount"></div>
  
  <div id="sidebar-mount"></div>

  <!-- Main Content -->
  <div class="main-container">
    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-logo">
        <img src="assets/robot_haiphen.svg" alt="Haiphen Robot Logo">
      </div>
      <!-- Primary Tagline -->
      <p style="margin-bottom: 0.5rem;">API Everything [<span style="color: red;">♥</span>]</p>

    </section>
    
    <div id="section-menu-mount"></div>

    <!-- Content Widget (Appears on Click) -->
    <div id="content-widget" class="content-widget"></div>
  </div>
  
  <!-- Bottom Left Contact Widget -->
  <div class="contact-widget" onclick="showSection('Contact')">
    <img src="assets/profile.png" alt="Profile">
    <div class="contact-popup">
      <p><strong>Contact</strong></p>
      <p>Founder: <a href="https://linkedin.com/in/judesafo" target="_blank" rel="noopener noreferrer">Jude Safo</a></p>
      <p>Email: <a href="mailto:pi@haiphenai.com">pi@haiphenai.com</a></p>
      <p>Phone: (512) 910-4544</p>
    </div>
  </div>
	<div id="trades-lightbox" onclick="closeTradesLightbox()" style="display:none;">
	  <img src="" alt="trades preview">
	</div>  
	<!-- Footer sentinel: becomes visible only when user scrolls to the very bottom -->
	<div id="footer-sentinel" aria-hidden="true" style="height: 1px;"></div>

	<!-- Footer mount: injected footer lives here -->
	<div id="footer-mount"></div>  
	<div id="trades-overlay-mount"></div>	
  <!-- JavaScript for Interactivity -->
  <script>
    /* ------------------------------------------------------------
       0) Trades Section Helpers
    ------------------------------------------------------------ */
	function openTradesLightbox(src){
	  const lb = document.getElementById('trades-lightbox');
	  const img = lb?.querySelector('img');
	  if (!lb || !img) return;
	  img.src = src;
	  lb.style.display = 'flex';
	}
	function closeTradesLightbox(){
	  const lb = document.getElementById('trades-lightbox');
	  if (lb) lb.style.display = 'none';
	}    
	async function fetchJson(url) {
	  const resp = await fetch(url, { cache: 'no-store' });
	  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
	  return await resp.json();
	}

	function setActiveThumb(dateKey) {
	  document.querySelectorAll('.trades-thumb').forEach((el) => {
	    el.classList.toggle('active', el.getAttribute('data-date') === dateKey);
	  });
	}
	async function openFintechMetricByIdx(kpiIdx) {
	  try {
	    // 1) Scroll to metrics anchor (above KPI strip, above Archive)
	    const anchor = document.getElementById('fintech-metrics') || document.getElementById('trades-kpi-grid');
	    if (anchor) scrollToWithHeaderOffset(anchor, 12);

	    // 2) Ensure KPI grid exists; if not, try loading trades data (safe no-op if already loaded)
	    const grid = document.getElementById('trades-kpi-grid');
	    if (!grid) {
	      console.warn('[fintech] KPI grid missing; are we in Trades section?');
	      return;
	    }

	    // Helper to attempt opening a KPI card by idx
	    const tryOpen = () => {
	      const card = grid.querySelector(`.trades-kpi-card[data-idx="${String(kpiIdx)}"]`);
	      if (!card) return false;
	      card.click(); // uses the existing renderTradesKpiGrid() open() logic
	      return true;
	    };

	    // If cards not present yet (async render), wait a tick and retry.
	    if (tryOpen()) return;

	    // If nothing rendered yet, attempt to (re)load trades data once, then retry.
	    try {
	      await loadTradesData();
	    } catch (e) {
	      console.warn('[fintech] loadTradesData failed while opening KPI overlay', e);
	    }

	    requestAnimationFrame(() => {
	      if (!tryOpen()) {
	        console.warn('[fintech] KPI idx not found in grid', { kpiIdx });
	      }
	    });
	  } catch (err) {
	    console.warn('[fintech] openFintechMetricByIdx failed', err);
	  }
	}
	async function loadTradesByJsonUrl(jsonUrl, screenshotUrl, dateKey) {
	  const dateEl = document.getElementById('trades-date');
	  const updatedEl = document.getElementById('trades-updated');
	  const headlineEl = document.getElementById('trades-headline');
	  const summaryEl = document.getElementById('trades-summary');
	  const img = document.getElementById('trades-img');

	  try {
	    const data = await fetchJson(jsonUrl);

	    window.HAIPHEN = window.HAIPHEN || {};
	    window.HAIPHEN.CurrentTradesDay = data; // ✅ after fetch

	    renderTradesKpiGrid(data.rows);

	    if (dateEl) dateEl.textContent = dateKey || data.date || '—';
	    if (updatedEl) updatedEl.textContent = data.updated_at || '—';
	    if (headlineEl) headlineEl.textContent = data.headline || '—';
	    if (summaryEl) summaryEl.textContent = data.summary || '—';

	    if (img && screenshotUrl) {
	      img.style.display = '';
	      document.getElementById('trades-img-missing').style.display = 'none';
	      img.src = screenshotUrl;
	    }

	    if (dateKey) setActiveThumb(dateKey);
	  } catch (err) {
	    console.warn('[trades] failed to load', { jsonUrl, err });
	    renderTradesKpiGrid([]);
	  }
	}

	const PAGE_SIZE = 3;
	const CAROUSEL_MAX_THUMBS = 15; // still fine, dropdown shows full history

	function renderArchive(allItems) {
	  const track = document.getElementById('trades-archive-track');
	  const viewport = track?.parentElement; // .trades-archive-viewport
	  const nextBtn = document.querySelector('.archive-next');
	  const prevBtn = document.querySelector('.archive-prev');
	  const dropdownWrap = document.getElementById('trades-archive-dropdown');
	  const select = document.getElementById('trades-archive-select');
	  
	  let userHasPannedRight = false;

	  if (!track || !viewport || !nextBtn || !prevBtn || !dropdownWrap || !select) {
	    console.warn('[trades] archive elements missing; check ids/classes in Trades template');
	    return;
	  }

	  const items = Array.isArray(allItems) ? allItems : [];
	  const carouselItems = items.slice(0, CAROUSEL_MAX_THUMBS);

	  track.innerHTML = carouselItems.map(it => `
	    <div class="trades-thumb" data-date="${escapeHtml(it.date)}" tabindex="0">
	      <div class="trades-thumb-date">${escapeHtml(it.date)}</div>
	      <img src="${escapeHtml(it.screenshot)}" alt="">
	    </div>
	  `).join('');

	  const byDate = new Map(items.map(it => [String(it.date), it]));

	  // thumb clicks (carousel subset)
	  track.querySelectorAll('.trades-thumb').forEach(el => {
	    const date = el.dataset.date;
	    const it = byDate.get(String(date));
	    if (!it) return;

	    const open = () => loadTradesByJsonUrl(it.json, deriveTradesScreenshotUrl(it), it.date);

	    el.addEventListener('click', open);
	    el.addEventListener('keydown', e => {
	      if (e.key === 'Enter' || e.key === ' ') {
	        e.preventDefault();
	        open();
	      }
	    });
	  });

	  // dropdown (FULL history)
	  select.innerHTML = items.map(it =>
	    `<option value="${escapeHtml(it.date)}">${escapeHtml(it.date)}</option>`
	  ).join('');

	  select.onchange = () => {
	    const it = byDate.get(String(select.value));
	    if (it) loadTradesByJsonUrl(it.json, deriveTradesScreenshotUrl(it), it.date);
	  };

      function setNavVisibility() {
        const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
        const atStart = viewport.scrollLeft <= 2;
        const atEnd = viewport.scrollLeft >= (maxScrollLeft - 2);

        // Requested behavior:
        // - once user pans right even a little, hide both arrows
        // - only show arrows again when they return fully left
        if (!atStart) userHasPannedRight = true;
        if (atStart) userHasPannedRight = false;

        // If you haven't panned right yet, behave normally (show only what’s usable)
        const show = !userHasPannedRight && maxScrollLeft > 2;

        prevBtn.hidden = !(show && !atStart);
        nextBtn.hidden = !(show && !atEnd);
      }

      function updateNav() {
        dropdownWrap.hidden = items.length <= carouselItems.length;

        // If there isn't more than one page worth, no nav needed.
        const needsNav = carouselItems.length > PAGE_SIZE;
        if (!needsNav) {
          prevBtn.hidden = true;
          nextBtn.hidden = true;
          return;
        }

        setNavVisibility();
      }

	  prevBtn.onclick = () => {
	    viewport.scrollBy({ left: -viewport.clientWidth, behavior: 'smooth' });
	  };
	  nextBtn.onclick = () => {
	    viewport.scrollBy({ left: viewport.clientWidth, behavior: 'smooth' });
	  };

	  viewport.addEventListener('scroll', updateNav, { passive: true });
	  window.addEventListener('resize', updateNav, { passive: true });

	  // reset to start (newest)
      viewport.scrollLeft = 0;
      userHasPannedRight = false;
      updateNav();
	}

	async function loadTradesData() {
	  // Always load “latest” first
	  await loadTradesByJsonUrl(
	    'assets/trades/trades.json',
	    'assets/trades/alpaca_screenshot.png',
	    null
	  );

	  // If Trades section isn't mounted yet, bail quietly
	  const track = document.getElementById('trades-archive-track');
	  if (!track) return;

	  try {
	    const idx = await fetchJson('assets/trades/trades_index.json');
	    const items = Array.isArray(idx.items) ? idx.items : [];

	    if (items.length === 0) {
	      track.innerHTML = `<div class="trades-muted">No archive yet.</div>`;
	      return;
	    }

	    // Optional: sort newest first if dates are YYYY-MM-DD
	    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));

	    // ✅ THIS WAS MISSING
	    renderArchive(items);

	    // Optional: auto-load newest archive item immediately (instead of leaving “latest”)
	    // const first = items[0];
	    // if (first) loadTradesByJsonUrl(first.json, deriveTradesScreenshotUrl(first), first.date);

	  } catch (err) {
	    console.warn('[trades] failed to load trades_index.json', err);
	    track.innerHTML = `<div class="trades-muted">Archive unavailable.</div>`;
	  }
	}

	function escapeHtml(s) {
	  return (s || '')
	    .replaceAll('&', '&amp;')
	    .replaceAll('<', '&lt;')
	    .replaceAll('>', '&gt;')
	    .replaceAll('"', '&quot;')
	    .replaceAll("'", '&#039;');
	}  	

    const KPI_ICON_MAP = {
      'Signals scanned': 'radar.svg',
      'Opportunities flagged': 'flag.svg',
      'Notifications sent': 'bell.svg',
      'Entries opened': 'enter.svg',
      'Exits closed': 'exit.svg',
      'Avg hold time': 'clock.svg',
      'Daily PnL': 'dollar.svg',
      'Win rate': 'percent.svg',
      'Max drawdown': 'downtrend.svg',
      'Sharpe ratio': 'chart.svg',
      'Delta': 'delta.svg',
      'Gamma': 'gamma.svg',
      'Theta': 'theta.svg',
      'Vega': 'vega.svg',
      'Rho': 'rho.svg',
      'Liquidity Ratios': 'liquidity.svg',
    };

	function renderTradesKpiGrid(rows) {
	  const grid = document.getElementById('trades-kpi-grid');
	  if (!grid) return;

	  const safeRows = Array.isArray(rows) ? rows : [];

	  grid.innerHTML = safeRows.map((r, idx) => {
	    const kpi = escapeHtml(r.kpi || '');
	    const value = escapeHtml(r.value || '—');
	    const icon = KPI_ICON_MAP[r.kpi] || 'chart.svg';

	    return `
	      <div
	        class="trades-kpi-card"
	        role="button"
	        tabindex="0"
	        data-kpi="${kpi}"
	        data-value="${value}"
	        data-idx="${idx}"
	        aria-label="${kpi}: ${value}"
	      >
	        <div class="trades-kpi-icon">
	          <img src="assets/icons/kpi/${icon}" alt="" aria-hidden="true" />
	        </div>
	        <div class="trades-kpi-name">${kpi}</div>
	        <div class="trades-kpi-value">${value}</div>
	      </div>
	    `;
	  }).join('');

	  // Wire interactions after injection
	  const cards = grid.querySelectorAll('.trades-kpi-card');
	  cards.forEach((card) => {
		const open = () => {
		  try {
		    const title = card.getAttribute('data-kpi') || 'Metric';
		    const value = card.getAttribute('data-value') || '—';

		    // prefer currently-loaded screenshot in the Trades section
		    const img = document.getElementById('trades-img');
		    const screenshotUrl =
		      img?.getAttribute('src') ||
		      img?.src ||
		      'assets/trades/alpaca_screenshot.png';

		    const day = window.HAIPHEN?.CurrentTradesDay;
		    const overlay = day?.overlay || {};

		    const series = overlay?.seriesByKpi?.[title] || null;
		    const hasSeries = Array.isArray(series) && series.length > 0;

		    const subtitle = `Current: ${value} • ${hasSeries ? 'Options day trading metrics' : 'day trading'}`;

		    const extremes = overlay?.extremes || { hi: [], lo: [] };
		    const portfolioAssets = overlay?.portfolioAssets || [];

		    const opener = window.HAIPHEN?.TradesOverlay?.open;
		    if (typeof opener === 'function') {
		      opener({
		        title,
		        subtitle,
		        screenshotUrl,
		        series,
		        extremes,
		        portfolioAssets,
		      });
		    } else {
		      console.warn('[kpi] overlay not loaded yet');
		    }
		  } catch (err) {
		    console.warn('[kpi] failed to open overlay', err);
		  }
		};

	    card.addEventListener('click', open);
	    card.addEventListener('keydown', (e) => {
	      if (e.key === 'Enter' || e.key === ' ') {
	        e.preventDefault();
	        open();
	      }
	    });
	  });
	}	
    /* ------------------------------------------------------------
       1) Global Variables: OnePager Carousel
    ------------------------------------------------------------ */
    let currentOnePagerType = 'default';
    let currentPageIndex = 0;
    // Your sets of PNG page images for each PDF
    const onePagerData = {
      default: [
        "assets/onepager/page-01.png",
        "assets/onepager/page-02.png",
        "assets/onepager/page-03.png",
        "assets/onepager/page-04.png",
        "assets/onepager/page-05.png",
        "assets/onepager/page-06.png",
        "assets/onepager/page-07.png",
        "assets/onepager/page-08.png",
        "assets/onepager/page-09.png",
        "assets/onepager/page-10.png",
        "assets/onepager/page-11.png",
        "assets/onepager/page-12.png",
        "assets/onepager/page-13.png",
        "assets/onepager/page-14.png",
        "assets/onepager/page-15.png"
      ],
      zerodays: [
        "assets/onepager_zerodays/page-01.png",
        "assets/onepager_zerodays/page-02.png",
        "assets/onepager_zerodays/page-03.png",
        "assets/onepager_zerodays/page-04.png",
        "assets/onepager_zerodays/page-05.png"
        // ... add additional pages as needed
      ]
    };
    /* --- inventory images for Services gallery --- */
    const servicesImages = [
      {file: '1.jpg', cap: 'Fig. 1'},
      {file: '2.jpg', cap: 'Fig. 2'},
      {file: '3.jpg', cap: 'Fig. 3'},
      {file: '4.jpg', cap: 'Fig. 4'},
      {file: '5.jpg', cap: 'Fig. 5'},
      {file: '6.jpg', cap: 'Fig. 6'},
      {file: '7.jpeg', cap: 'Fig. 7'},
      {file: '8.png', cap: 'Fig. 8'},
      {file: '9.png', cap: 'Fig. 9'},
      {file: '10.png', cap: 'Fig. 10'},
      {file: 'signals_screenshot.png', cap: 'Fig. 11: Signals'},
      {file: 'signals_2.png', cap: 'Fig. 11: Signals 2'}
    ];
    /* ------------------------------------------------------------
       2) OnePager Carousel Logic
    ------------------------------------------------------------ */
    function renderOnePagerPage() {
      const imageElement = document.getElementById("onepager-image");
      if (!imageElement) return;
      const pages = onePagerData[currentOnePagerType];
      imageElement.src = pages[currentPageIndex];
    }

    function changePage(delta) {
      const pages = onePagerData[currentOnePagerType];
      currentPageIndex += delta;
      if (currentPageIndex < 0) {
        currentPageIndex = 0;
      } else if (currentPageIndex >= pages.length) {
        currentPageIndex = pages.length - 1;
      }
      renderOnePagerPage();
    }

    function toggleOnePager(mode) {
      // Switch the "type" of OnePager
      currentOnePagerType = mode;
      currentPageIndex = 0;
      renderOnePagerPage();
    }

    function openLightbox(src){
      const lbImg = document.querySelector('#lightbox img');
      lbImg.src = src;
      document.getElementById('lightbox').style.display = 'flex';
    }
    function closeLightbox(){
      document.getElementById('lightbox').style.display = 'none';
    }
    /* ------------------------------------------------------------
       3) Section Content (Accordion-Like) with new OnePager
    ------------------------------------------------------------ */
    const sectionContent = {
        "Trades": `
          <section id="trades-top" class="trades-wrap trades-pro">

            <!-- Header -->
            <header class="trades-header">
              <div class="trades-title">
                <div class="trades-badge">
                  <span class="dot"></span>
                  <span>High-freq. • automated • intraday</span>
                </div>
                <h2>Trades</h2>
                <p class="trades-subtitle">
                  High frequency, Risk profile, No overnight holiding, Transparent daily pnl & metrics, Production-grade <strong>options execution + risk assessment</strong> system. 
                  
                </p>
              </div>

              <!-- CTA Buttons -->
              <div class="trades-cta">
                <button class="btn btn-primary" onclick="showSection('Contact')">
                  <span class="btn-ic"><img src="assets/icons/link.svg" alt=""></span>
                  Request API access
                </button>

                <a class="btn btn-ghost" href="https://haiphen.io" target="_blank" rel="noopener noreferrer">
                  <span class="btn-ic"><img src="assets/icons/external.svg" alt=""></span>
                  Docs / Lineage
                </a>

                <a class="btn btn-ghost" href="https://twitter.com/" target="_blank" rel="noopener noreferrer">
                  <span class="btn-ic"><img src="assets/icons/external.svg" alt=""></span>
                  Follow daily bot
                </a>
              </div>
            </header>
            <!-- Stat Cards -->
			<div class="trades-stats">
			  <button class="stat stat-btn" type="button" data-kpi-idx="0" onclick="openFintechMetricByIdx(0)">
			    <div class="stat-ic"><img src="assets/icons/cpu.svg" alt=""></div>
			    <div class="stat-k">Signals/day</div>
			    <div class="stat-v"><strong>800K – 1.5M</strong></div>
			    <div class="stat-s">Scanned for pricing dislocations</div>
			  </button>

			  <button class="stat stat-btn" type="button" data-kpi-idx="1" onclick="openFintechMetricByIdx(1)">
			    <div class="stat-ic"><img src="assets/icons/chart.svg" alt=""></div>
			    <div class="stat-k">Contracts/day</div>
			    <div class="stat-v"><strong>2K – 15K</strong></div>
			    <div class="stat-s">Automated entry + exit</div>
			  </button>

			  <button class="stat stat-btn" type="button" data-kpi-idx="2" onclick="openFintechMetricByIdx(2)">
			    <div class="stat-ic"><img src="assets/icons/bolt.svg" alt=""></div>
			    <div class="stat-k">Avg hold time</div>
			    <div class="stat-v"><strong>~6.7s</strong></div>
			    <div class="stat-s">Designed for speed & repeatability</div>
			  </button>

			  <button class="stat stat-btn" type="button" data-kpi-idx="3" onclick="openFintechMetricByIdx(3)">
			    <div class="stat-ic"><img src="assets/icons/shield.svg" alt=""></div>
			    <div class="stat-k">Overnight exposure</div>
			    <div class="stat-v"><strong>None</strong></div>
			    <div class="stat-s">Portfolio returns flat daily</div>
			  </button>
			</div>

            <!-- Screenshot + meta (KEEP IDS) -->
            <div class="trades-hero">
              <img
                id="trades-img"
                class="trades-img"
                src="assets/trades/alpaca_screenshot.png"
                alt="Alpaca dashboard screenshot"
                onerror="this.style.display='none'; document.getElementById('trades-img-missing').style.display='block';"
              />
              <div id="trades-img-missing" class="trades-muted" style="display:none;">
                Screenshot not found yet. Run:
                <code>node twitter-bot/src/screenshot.js</code> →
                <code>node twitter-bot/src/crop-screenshot.js</code> →
                <code>node twitter-bot/src/publish-aboutme-trades.js</code>
              </div>

            </div>

            <!-- Summary (KEEP ID) -->
            <div class="trades-summary-box">
              <p id="trades-summary">—</p>
            </div>
			<!-- Metrics anchor (stat cards scroll here) -->
			<div id="fintech-metrics"></div>

			<div class="trades-kpi-strip" aria-label="KPI strip">
			  <div id="trades-kpi-grid" class="trades-kpi-grid"></div>
			</div>

            <!-- Archive (KEEP IDS) -->
			<div id="trades-archive" class="trades-archive">
			  <h3>Archive</h3>

			  <div class="trades-archive-viewport">
			    <button class="archive-nav archive-prev" aria-label="Previous" hidden>‹</button>

			    <div id="trades-archive-track" class="trades-archive-track">
			      <!-- thumbs injected here -->
			    </div>

			    <button class="archive-nav archive-next" aria-label="Next">›</button>
			  </div>

			  <div id="trades-archive-dropdown" class="trades-archive-dropdown" hidden>
			    <label>
			      Jump to date
			      <select id="trades-archive-select"></select>
			    </label>
			  </div>

			  <div class="trades-meta">
			    <div><strong>Date:</strong> <span id="trades-date">—</span></div>
			    <div><strong>Updated:</strong> <span id="trades-updated">—</span></div>
			    <div><strong>Headline:</strong> <span id="trades-headline">—</span></div>
			  </div>
			</div>
			<details class="fintech-tech" id="fintech-tech">
			  <summary id="portfolio-top">Tech</summary>
			  <div id="portfolio-content-top" aria-hidden="true" style="height:1px;"></div>

			  <ul style="margin-top: 0.5rem;">
			    <!-- First Portfolio Item: ETL Ingestion Engine -->
			    <li id="portfolio-etl" style="list-style: disc; margin-bottom: 2rem;">
			      <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
			        <strong>ETL Ingestion Engine:</strong> Prior work with a DEI tech startup
			        to build out their data infrastructure pipeline from crawling raw
			        unstructured pdf data to building a basic KG database.
			      </p>
			      <div style="text-align: center;">
			        <a href="https://github.com/JudeSafo/All_Language_Model" target="_blank" rel="noopener noreferrer">
			          <img src="assets/gitPortfolio_esg.png" alt="All Language Model"
			            style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
			        </a>
			      </div>
			    </li>

			    <!-- Second Portfolio Item: Protein Biomarker Indexing (Genomics Use Case) -->
			    <li id="portfolio-genomics" style="list-style: disc; margin-bottom: 2rem;">
			      <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
			        <strong>Protein Biomarker Indexing:</strong> Engagmenet with a Harvard Genetics research lab,
			        crawling PubMed articles to identify co-occurrences of diseases and biomarker
			        conditions for potential overlapping treatment options.
			      </p>
			      <div style="text-align: center;">
			        <a href="javascript:void(0)" onclick="showSection('OnePager')">
			          <img src="assets/genomics_usecase.png" alt="Genomics Use Case"
			            style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
			        </a>
			      </div>
			    </li>

			    <!-- Third Portfolio Item: Web Crawler -->
			    <li id="portfolio-crawler" style="list-style: disc; margin-bottom: 2rem;">
			      <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
			        <strong>Web Crawler:</strong> Custom, open src search engine for curating and parsing
			        unstructured pdf data (e.g. research, financials) for downstream applications.
			      </p>
			      <div style="text-align: center;">
			        <img src="assets/haiphen-gif5.gif" alt="Haiphen AI Showcase"
			          style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
			      </div>
			    </li>

			    <!-- Fourth Portfolio Item: Distilled LLM -->
			    <li style="list-style: disc; margin-bottom: 2rem;">
			      <p style="margin-bottom: 0.5rem; font-size: 1.1rem;">
			        <strong>Distilled RAG LLM:</strong> Custom open src LLM for specific business use cases,
			        e.g. answering DEI questions.
			      </p>
			      <div style="text-align: center;">
			        <img src="assets/haiphen-gif3.gif" alt="LLM"
			          style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
			      </div>
			    </li>

			    <!-- Fifth Portfolio Item: ZeroDays Follina Investigation -->
			    <li id="portfolio-follina" style="list-style: disc; margin-bottom: 2rem;">
			      <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
			        <strong>ZeroDays Follina Investigation:</strong> An in-depth investigation
			        of Confluence vulnerabilities with Follina, producing actionable security insights.
			      </p>
			      <div style="text-align: center;">
			        <a href="javascript:void(0)" onclick="showSection('OnePager')">
			          <img src="assets/haiphen-follina-screenshot.png" alt="ZeroDays Investigation"
			            style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
			        </a>
			      </div>
			    </li>
			  </ul>
			</details>

          </section>
        `,
		"Services": `
		  <div class="snap-stack" data-snap-stack="services">
		    <section class="snap-panel">
		      <div id="services-plans-mount"></div>
		    </section>

		    <section class="snap-panel">
		      <div id="services-hardtech-mount"></div>
		    </section>
		  </div>
		`,
      "OnePager": `
        <h2>Mission</h2>
        <br>
        <p>
          <a href="https://haiphen.io" target="_blank" rel="noopener noreferrer"><strong>Haiphen</strong></a>[Hi-fen]: Haiphen is a <strong>signals intelligence</strong> software startup focused on delivering custom, open src solutions to various cloud, edge, and infra obstacles across a variety of technical, business, and scientific domains.
        </p>

        <div class="about-columns">
          <div class="about-col">
            <p>
              We process 2M+ signals across the internet each day for downstream applications and usecases. With a deep foundation in <strong>Computational Linguistics</strong>, <strong>NLP</strong>, and <strong>ML</strong>, we geek out over building the plumbing and infra (e.g. data pipelines, ETL, entity extraction, pruning, clustering) that simplifies unwanted haziness into reliable API calls. Consider us your personal DBA (database admin) but with a domain expertise that actively persists in your data through its entire lifecycle.
            </p>
          </div>

          <div class="about-col">
            <p>
              We're excited about the future: the more <strong>custom solutions</strong> we're able deliver, the closer we move towards our vision of productizing <strong>knowledge graphs</strong> into every company (without the headache). <i>Note</i>: we're intentional barebones as you may have noticed. We believe good software was and should be transparent, inspectable and about what's under the hood.
            </p>
          </div>
        </div>
        </div>
        <h2>Haiphen One Pager</h2>
        <div id="onepager-buttons" style="margin-bottom: 1rem;">
          <button onclick="toggleOnePager('default')">Genomics</button>
          <button onclick="toggleOnePager('zerodays')">ZeroDays</button>
        </div>
        <div id="onepager-container" class="onepager-container">
          <!-- Left Click Zone for Back Navigation -->
          <div class="onepager-click-zone onepager-click-left" onclick="changePage(-1)"></div>

          <!-- Displayed Page Image -->
          <img id="onepager-image" src="" alt="One Pager Page">

          <!-- Right Click Zone for Next Navigation -->
          <div class="onepager-click-zone onepager-click-right" onclick="changePage(1)"></div>

          <!-- Navigation Arrows -->
          <button id="onepager-prev" class="onepager-arrow onepager-prev" onclick="changePage(-1)">&#10094;</button>
          <button id="onepager-next" class="onepager-arrow onepager-next" onclick="changePage(1)">&#10095;</button>
        </div>
          <!-- How it works (compact visual) -->
          <div class="trades-panel">
            <div class="panel-head">
              <h3>How it works</h3>
              <p class="trades-muted">Derivatives ingestion, processing pipeline (details expandable below).</p>
            </div>

            <div id="trades-pipeline" class="pipeline">
              <div class="pipe-step">
                <div class="pipe-node">1</div>
                <div class="pipe-text">
                  <div class="pipe-title">Ingest</div>
                  <div class="pipe-sub">Market data + signals</div>
                </div>
              </div>
              <div class="pipe-arrow">→</div>

              <div class="pipe-step">
                <div class="pipe-node">2</div>
                <div class="pipe-text">
                  <div class="pipe-title">Score</div>
                  <div class="pipe-sub">Arb & risk filters</div>
                </div>
              </div>
              <div class="pipe-arrow">→</div>

              <div class="pipe-step">
                <div class="pipe-node">3</div>
                <div class="pipe-text">
                  <div class="pipe-title">Execute</div>
                  <div class="pipe-sub">Orders + guardrails</div>
                </div>
              </div>
              <div class="pipe-arrow">→</div>

              <div class="pipe-step">
                <div class="pipe-node">4</div>
                <div class="pipe-text">
                  <div class="pipe-title">Monitor</div>
                  <div class="pipe-sub">Telemetry + exits</div>
                </div>
              </div>
              <div class="pipe-arrow">→</div>

              <div class="pipe-step">
                <div class="pipe-node">5</div>
                <div class="pipe-text">
                  <div class="pipe-title">Report</div>
                  <div class="pipe-sub">KPIs + archive</div>
                </div>
              </div>
            </div>


            <br>
            <!-- New Steps Row -->
            <div class="steps-container">
              <div class="step">
                <a href="https://example.com/step1" target="_blank" rel="noopener noreferrer">
                  <img src="assets/step1.svg" alt="Step 1">
                </a>
                <p>Diagnose &amp; Draft</p>
              </div>
              <div class="step">
                <a href="https://example.com/step2" target="_blank" rel="noopener noreferrer">
                  <img src="assets/step2.svg" alt="Step 2">
                </a>
                <p>Execute &amp; Enrich</p>
              </div>
              <div class="step">
                <a href="https://example.com/step3" target="_blank" rel="noopener noreferrer">
                  <img src="assets/step3.svg" alt="Step 3">
                </a>
                <p>Review &amp; Revise</p>
              </div>
            </div>
            <br>

            <div class="trades-accordions">
              <details class="acc" open>
                <summary>Risk posture & controls</summary>
                <ul>
                  <li><strong>Intraday only:</strong> no overnight holdings; exposure is exited daily.</li>
                  <li><strong>Speed-first strategy:</strong> short-lived positions, frequent reuse of edges.</li>
                  <li><strong>Monitoring & exits:</strong> automated close logic + portfolio teardown.</li>
                  <li><em>(You can expand this list with your real controls: locks, limits, slippage checks, etc.)</em></li>
                </ul>
              </details>

              <details class="acc">
                <summary>What these metrics represent</summary>
                <p class="trades-muted" style="margin-top:.5rem;">
                  The table below is populated from daily runs. It summarizes execution volume, P&L deltas,
                  and stability indicators. Archive cards allow day-to-day comparison.
                </p>
              </details>
            </div>
          </div>          
        <div class="about-columns">
        <!-- about/paragraph placeholders -->
        <div class="services-about">
          <h3>Services</h3>
          <p>The current landscape of 'Tech' problems go beyond traditional verticals that can be arbitrarily segregated by legacy labels and/or specialties. We've taken a 'hacker-centric', solve first ask later, domain agnostic approach of simply meeting problems where they reside. That can be anywhere from the knowledge graph db powering a Harvard research lab to the firmware needed to customize your lawn mower. We freelance with commercial and residential clients putting out current fires wherever they reside. This removes the frothy silicon valley VC environment of contrived 'luxury' solutions to problems that don't exist.</p>
          <ul class="inline-bullets">
            <li><a href="https://example.com/robotics" target="_blank" rel="noopener noreferrer">Robotics</a></li>
            <li><a href="https://example.com/opsec" target="_blank" rel="noopener noreferrer">Operational Security</a></li>
            <li><a href="https://example.com/event-detection" target="_blank" rel="noopener noreferrer">Event Detection</a></li>
            <li><a href="https://example.com/welding" target="_blank" rel="noopener noreferrer">Decision Engine</a></li>
            <li><a href="https://example.com/carpentry" target="_blank" rel="noopener noreferrer">Dissasemblers</a></li>
          </ul>            
        </div>

        <div class="tech-container">
        <div class="tech-right svg-stack" style="display:flex; justify-content:center; align-items:center; padding:1rem 0;">
            <object type="image/svg+xml" data="assets/signal_chain.svg" class="tech-svg">
              Your browser does not support SVG.
            </object>
            <br>
            <object type="image/svg+xml" data="assets/data_sorter1.svg" class="tech-svg">
              Your browser does not support SVG.
            </object>              
          </div>
          <div class="tech-left">
            <h3 id="services-signals">Signals</h3>
            <p style="text-indent: 2em;">
              The difference between the Google(s), Amazon(s), Twitter(s) big tech giants and the consumers using those products comes down to signals. Users are always handicapped by an asymmetry in information and ability to act on them. This is not un-intentional. 
            </p>
            <p style="text-indent: 2em;">
            The infrastructure needed to <strong>scale</strong>, process and automate your <strong>decision making</strong> are the cornerstone of any business no matter the industry or the product. We're building infrastructure to make this accessible to every participant on the internet, as it should be.
            </p>
            <br>
            <div class="tech-bullets">
              <ul>
                <li>Decision engines</li>
                <li>Algorithmic day trading</li>
                <li>Risk analysis</li>
                <li>Portfolio optimization</li>
                <li>News alert feed</li>
                <li>Underwriting</li>
                <li>Data pruning</li>
                <li>Data enrichment</li>
                <li>Concept mapping</li>
                <li>Domain segregation</li>
                <li>QA</li>
              </ul>
            </div> 
            <br>             
            <p>
              <strong>Note</strong>: On a given day, in a given month of a given year our [redacted] engine processed 268,640 signals, flagged 5821 opportunities, executed on 980 events and saw a +7.80% appreciation in the value of those assets. You can envision applying this any speculative industry where returns are driven event driven input.
            </p>              
          </div>            
        </div>

        <style>
          .tech-container {
            display: flex; gap: 2rem; align-items: center;
            justify-content: center; flex-wrap: wrap; text-align: left;
            margin-top: 2rem;
          }
          .tech-left {
            flex: 1; min-width: 280px;
          }
          .tech-right {
            flex: 1; min-width: 280px;
          }
          .tech-list {
            list-style-type: disc; padding-left: 20px;
            font-size: 1rem; line-height: 1.8;
          }
          .tech-list li i {
            font-style: italic; font-weight: normal;
          }
        </style>          

        <div class="tech-container">
          <div class="tech-left">
            <h3 id="ethos">Ethos</h3>
            <p style="text-indent: 2em;">
              <strong>Open Source</strong> everything: We spent years building our own stand alone OS environment
              to train, test and deploy all of our models. Hence we're able to provide unmatched
              value proposition: chain of custody insight and transparency into every asset
              build so you minimize <strong>vulnerabilities</strong>. That includes the website your viewing now. 
              All the code available via github. You're free to contribute as you see fit. 
            </p>
            <br>
            <h3>Stack</h3>
            <ul class="tech-list">
              <li><i>Backend:</i> Apache Framework, Redis, Postgres</li>
              <li><i>Data:</i> Scala, HDFS, Postgres</li>
              <li><i>Network:</i> Istio, SD-WAN solutions</li>
              <li><i>Platform:</i> Ansible, Terraform, Kubernetes</li>
              <li><i>Access Control:</i> Keycloak, OpenFGA</li>
              <li><i>Telemetry:</i> Prometheus, Grafana, ELK Stack</li>
            </ul>
            <br>
            <h3>Secure</h3>
            <p style="text-indent: 2em;">
              Industry best practices, zero-trust <strong>security protocols</strong> (e.g. SALSA, GUAC) alongside 
              with proactive threat detection and mitigation to protect
              your critical systems.
            </p>
          </div>
          <div class="tech-right">
            <object type="image/svg+xml" data="assets/tech_animated.svg" class="tech-svg">
              Your browser does not support SVG.
            </object>
          </div>
        </div>
        <style>
          .tech-container {
            display: flex; gap: 2rem; align-items: center;
            justify-content: center; flex-wrap: wrap; text-align: left;
            margin-top: 2rem;
          }
          .tech-left {
            flex: 1; min-width: 280px;
          }
          .tech-right {
            flex: 1; min-width: 280px;
          }
          .tech-list {
            list-style-type: disc; padding-left: 20px;
            font-size: 1rem; line-height: 1.8;
          }
          .tech-list li i {
            font-style: italic; font-weight: normal;
          }
        </style>
        <div id="lightbox" onclick="closeLightbox()">
          <img src="" alt="preview">
        </div>
        <br>
        <div class="services-about">
          <h3>Collaborate</h3>
          <p>Contact us here, schedule a service appointment here, look through our past client work here  </p>
          <p><!-- paragraph 2 --></p>          
        </div>
        <br>          
        <!-- scrollable gallery -->
        <h3 id="services-gallery">Gallery</h3>
        <div class="services-gallery-wrapper">
          <div class="services-gallery">
            ${servicesImages
              .map(({file,cap}) =>
                `<figure class="gallery-item">
                  <img src="assets/robotics/${file}" alt="${cap}"
                        onclick="openLightbox(this.src)">
                  <figcaption>${cap}</figcaption>
                </figure>`
              ).join('')}
          </div>
        </div>


        <p class="service-keys">
          <strong>Services:</strong>
          <a class="service-key" href="https://docs.google.com/forms/d/e/1FAIpQLSc8HhR9nIEE-DBgtKq2CQ-Y4PJ8Mr0pbE07fzGE15FhcfqG6g/viewform?usp=header" target="_blank" rel="noopener noreferrer">
            Consulting
            <span class="service-tooltip">Hardvard, Fidelity, Techstars: Be our next collaborater. Fill in your information (below) or contact us directly to get started</span>
          </a>,
          <a class="service-key" href="https://en.wikipedia.org/wiki/Consultant" target="_blank" rel="noopener noreferrer">
            Knowledge Graph DB
            <span class="service-tooltip"><strong>Intelligent persistent data-store</strong>: We build machine learning intelligence into the foundation of your data pipeline so you get predictable, reliable intelligence downstream.</span>
          </a>,
          <a class="service-key" href="https://en.wikipedia.org/wiki/Quality_assurance" target="_blank" rel="noopener noreferrer">
            QA
            <span class="service-tooltip"><strong>AI/ML QA</strong> can be surprisingly different from normal. Leverage in-built elements of our event driven architecture for real-time detection, telemetry, pruning and improvement from the time of inception of your data.</span>
          </a>, 
          <a class="service-key" href="https://en.wikipedia.org/wiki/Access_control" target="_blank" rel="noopener noreferrer">
            Access Control
            <span class="service-tooltip">Beyond authentication, full <strong>ZeroTrust</strong>, real-time, tracking of assets and data <strong>telemetry</strong> built directly into your data pipeline</span>
          </a>,
          <a class="service-key" href="https://en.wikipedia.org/wiki/Open_source" target="_blank" rel="noopener noreferrer">
            Open Src
            <span class="service-tooltip">Most importantly, we build everything on open src so you have full transparency and ownership</span>
          </a>,
          <a class="service-key" href="javascript:void(0);" onclick="showSection('Tech')">
            Infra.
            <span class="service-tooltip">Robust infrastructure design and management.</span>
          </a>
        </p>
        <style>
          .about-columns {
            display: flex;
            gap: 2rem;
            margin: 2rem 0;
            flex-wrap: wrap;
          }
          .about-col {
            flex: 1;
            min-width: 280px;
            text-align: left;
          }
        </style>        

		<ul style="margin-top: 0.5rem;">
		  <!-- First Portfolio Item: ETL Ingestion Engine -->
		  <li style="list-style: disc; margin-bottom: 2rem;">
		    <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
		      <strong>ETL Ingestion Engine:</strong> Prior work with a DEI tech startup
		      to build out their data infrastructure pipeline from crawling raw
		      unstructured pdf data to building a basic KG database.
		    </p>
		    <div style="text-align: center;">
		      <a href="https://github.com/JudeSafo/All_Language_Model" target="_blank" rel="noopener noreferrer">
		        <img src="assets/gitPortfolio_esg.png" alt="All Language Model"
		          style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
		      </a>
		    </div>
		  </li>

		  <!-- Second Portfolio Item: Protein Biomarker Indexing (Genomics Use Case) -->
		  <li style="list-style: disc; margin-bottom: 2rem;">
		    <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
		      <strong>Protein Biomarker Indexing:</strong> Engagmenet with a Harvard Genetics research lab,
		      crawling PubMed articles to identify co-occurrences of diseases and biomarker
		      conditions for potential overlapping treatment options.
		    </p>
		    <div style="text-align: center;">
		      <a href="javascript:void(0)" onclick="showSection('OnePager')">
		        <img src="assets/genomics_usecase.png" alt="Genomics Use Case"
		          style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
		      </a>
		    </div>
		  </li>

		  <!-- Third Portfolio Item: Web Crawler -->
		  <li style="list-style: disc; margin-bottom: 2rem;">
		    <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
		      <strong>Web Crawler:</strong> Custom, open src search engine for curating and parsing
		      unstructured pdf data (e.g. research, financials) for downstream applications.
		    </p>
		    <div style="text-align: center;">
		      <img src="assets/haiphen-gif5.gif" alt="Haiphen AI Showcase"
		        style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
		    </div>
		  </li>

		  <!-- Fourth Portfolio Item: Distilled LLM -->
		  <li style="list-style: disc; margin-bottom: 2rem;">
		    <p style="margin-bottom: 0.5rem; font-size: 1.1rem;">
		      <strong>Distilled RAG LLM:</strong> Custom open src LLM for specific business use cases,
		      e.g. answering DEI questions.
		    </p>
		    <div style="text-align: center;">
		      <img src="assets/haiphen-gif3.gif" alt="LLM"
		        style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
		    </div>
		  </li>

		  <!-- Fifth Portfolio Item: ZeroDays Follina Investigation -->
		  <li style="list-style: disc; margin-bottom: 2rem;">
		    <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
		      <strong>ZeroDays Follina Investigation:</strong> An in-depth investigation
		      of Confluence vulnerabilities with Follina, producing actionable security insights.
		    </p>
		    <div style="text-align: center;">
		      <a href="javascript:void(0)" onclick="showSection('OnePager')">
		        <img src="assets/haiphen-follina-screenshot.png" alt="ZeroDays Investigation"
		          style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
		      </a>
		    </div>
		  </li>
		</ul>        
      `,
	  "FAQ": `
	    <section id="faq">
	      <div id="faq-mount"></div>
	    </section>
	  `,
      "Tech": `
        <h2>Tech Stack</h2>
        <div class="tech-container">
          <div class="tech-left">
            <h3>Ethos</h3>
            <p>
              Open Source Everything: We spent years building our own stand alone OS environment
              to train, test and deploy all of our models. Hence we're able to provide unmatched
              value proposition: chain of custody insight and transparency into every asset
              build so you minimize vulnerabilities. That includes the website your viewing now. 
              All the code available via github. You're free to contribute as you see fit. 
            </p>
            <br>
            <h3>Stack</h3>
            <ul class="tech-list">
              <li><i>Backend:</i> Apache Framework, Redis, Postgres</li>
              <li><i>Network:</i> Istio, SD-WAN solutions</li>
              <li><i>Platform:</i> Ansible, Terraform, Kubernetes</li>
              <li><i>Access Control:</i> Keycloak, OpenFGA</li>
              <li><i>Telemetry:</i> Prometheus, Grafana, ELK Stack</li>
            </ul>
            <br>
            <h3>Secure</h3>
            <p>
              Industry best practices, zero-trust <strong>security protocols</strong> (e.g. SALSA, GUAC) alongside 
                with proactive threat detection and mitigation to protect
                your critical systems.
            </p>
          </div>
          <div class="tech-right">
            <object type="image/svg+xml" data="assets/tech_animated.svg" class="tech-svg">
              Your browser does not support SVG.
            </object>
          </div>
        </div>
        <style>
          .tech-container {
            display: flex; gap: 2rem; align-items: center;
            justify-content: center; flex-wrap: wrap; text-align: left;
            margin-top: 2rem;
          }
          .tech-left {
            flex: 1; min-width: 280px;
          }
          .tech-right {
            flex: 1; min-width: 280px;
          }
          .tech-list {
            list-style-type: disc; padding-left: 20px;
            font-size: 1rem; line-height: 1.8;
          }
          .tech-list li i {
            font-style: italic; font-weight: normal;
          }
        </style>
      `,
      "Contact": `
        <section id="contact-us">
          <h2>Contact Us</h2>
          <p>Founder: <a href="https://linkedin.com/in/judesafo"
            target="_blank" rel="noopener noreferrer">Jude Safo</a></p>
          <p>Email: <a href="mailto:pi@haiphenai.com">pi@haiphenai.com</a></p>
          <p>Phone: (512) 910-4544</p>
          <p>Address: Manhattan, New York, USA</p>
          <br><br>
          <div style="text-align: center;">
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSc8HhR9nIEE-DBgtKq2CQ-Y4PJ8Mr0pbE07fzGE15FhcfqG6g/viewform?usp=header"
              target="_blank" rel="noopener noreferrer">
              <img src="assets/nature.png" alt="Nature" style="max-width:80%; border-radius: 4px;">
            </a>
          </div>
          <br><br>
          <p>"No man is a failure who has friends" - Angel Clarence</p>
        </section>
      `
    };
    
    /* ------------------------------------------------------------
       4) Show Section (Accordion-Like Display)
    ------------------------------------------------------------ */
	function deriveTradesScreenshotUrl({ json, screenshot, date }) {
	  // If index provides a screenshot, use it.
	  if (screenshot) return screenshot;

	  // If archive json is like: assets/trades/archive/2025-12-16.json
	  // then focus screenshot should be: assets/trades/archive/2025-12-16.png
	  if (json && json.endsWith('.json')) return json.replace(/\.json$/i, '.png');

	  // Fallback (latest)
	  return 'assets/trades/alpaca_screenshot.png';
	}    
    function scrollToWithHeaderOffset(targetEl, extra = 12) {
      if (!targetEl) return;

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

	/* ------------------------------------------------------------
	   Snap stacks: highlight the section currently in view
	------------------------------------------------------------ */
	function initSnapStacks(rootEl = document) {
	  const stacks = rootEl.querySelectorAll('[data-snap-stack]');
	  stacks.forEach((stack) => {
	    // Avoid double wiring
	    if (stack.__snapWired) return;
	    stack.__snapWired = true;

	    const panels = Array.from(stack.querySelectorAll('.snap-panel'));
	    if (panels.length === 0) return;

	    // Default active = first
	    panels.forEach((p, i) => p.classList.toggle('is-active', i === 0));

	    const obs = new IntersectionObserver(
	      (entries) => {
	        // pick the most visible panel as active
	        let best = null;
	        for (const e of entries) {
	          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
	        }
	        if (!best) return;

	        panels.forEach((p) => p.classList.remove('is-active'));
	        best.target.classList.add('is-active');
	      },
	      {
	        root: stack,
	        threshold: [0.35, 0.5, 0.65, 0.8],
	      }
	    );

	    panels.forEach((p) => obs.observe(p));

	    // keep a handle for cleanup if you ever need it
	    stack.__snapObserver = obs;
	  });
	}

	function showSection(sectionName) {
	  const contentWidget = document.getElementById("content-widget");
	  if (!contentWidget) return;

	  // Normalize + alias (prevents case/whitespace mismatches from menu components)
	  const raw = String(sectionName || "");
	  const key = raw.trim();

	  const ALIASES = {
	    faq: "FAQ",
	    Faq: "FAQ",
	    "Faq ": "faq",
	    collaborate: "OnePager",
	    Collaborate: "OnePager",
	    fintech: "Trades",
	    Fintech: "Trades",
	  };

	  const resolved = ALIASES[key] || ALIASES[key.toLowerCase()] || key;

	  const html = sectionContent[resolved];
	  contentWidget.innerHTML = html || `<p>No content available.</p>`;
	  contentWidget.classList.add("active");

	  initSnapStacks(contentWidget);

	  // Section-specific bootstrapping
	  if (resolved === "Services") {
	    (async () => {
	      try { await window.HAIPHEN?.loadServicesPlans?.(); }
	      catch (e) { console.warn("[Services] loadServicesPlans failed", e); }
	      initSnapStacks(contentWidget);
	    })();
	  }

	  if (resolved === "FAQ") {
	    (async () => {
	      try { await window.HAIPHEN?.loadFAQ?.(); }
	      catch (e) { console.warn("[FAQ] loadFAQ failed", e); }
	    })();
	  }

	  if (resolved === "OnePager") {
	    currentPageIndex = 0;
	    renderOnePagerPage();
	  }

	  // Default scroll behavior for non-Trades sections
	  if (resolved === "FAQ") {
	    (async () => {
	      try {
	        // 1) Mount FAQ content (async)
	        await window.HAIPHEN?.loadFAQ?.();
	      } catch (e) {
	        console.warn("[FAQ] loadFAQ failed", e);
	      }

	      // 2) After the DOM actually exists + has size, scroll to it
	      requestAnimationFrame(() => {
	        const faqEl = document.getElementById("faq") || document.getElementById("faq-mount") || contentWidget;
	        scrollToWithHeaderOffset(faqEl, 12);
	      });
	    })();

	    // Important: don't fall through to the generic scroll below
	    return;
	  }

	  // Trades: wait for async content + DOM inflation, then scroll
	  if (resolved === "Trades") {
	    (async () => {
	      try {
	        await loadTradesData();
	      } catch (e) {
	        console.warn("[Trades] loadTradesData failed", e);
	      }

	      requestAnimationFrame(() => {
	        const tradesTop = document.getElementById("trades-top");
	        scrollToWithHeaderOffset(tradesTop || contentWidget, 12);

	        // wire the Tech dropdown behavior now that Trades DOM exists
	        initFintechTechDropdown(contentWidget);
	      });
	    })();

	    return;
	  }

	  // Non-Trades: default scroll to widget top
	  requestAnimationFrame(() => {
	    scrollToWithHeaderOffset(contentWidget, 12);
	  });
	}

	// ------------------------------------------------------------
	// Hash routing (shareable URLs for injected sections)
	// ------------------------------------------------------------
	const SECTION_HASH = {
	  Trades: 'fintech',
	  Services: 'services',
	  OnePager: 'collaborate',
	  FAQ: 'faq',
	  Contact: 'contact-us',
	};

	const HASH_SECTION = Object.fromEntries(
	  Object.entries(SECTION_HASH).map(([k, v]) => [v, k])
	);

	function clearHash({ replace = false } = {}) {
	  const url = window.location.pathname + window.location.search;
	  if (replace) history.replaceState(null, '', url);
	  else history.pushState(null, '', url);
	}

	function activateSectionMenuFor(sectionName) {
	  // Let section-menu own the styling if it’s loaded
	  const api = window.HAIPHEN?.SectionMenu;
	  if (api?.setActive) api.setActive(sectionName);
	}

	function parseHash() {
	  // supports: #faq or #faq:faq-some-id
	  const raw = String(window.location.hash || "").replace(/^#/, "").trim();
	  if (!raw) return { slug: "", subId: "" };

	  const [slugPart, subPart] = raw.split(":");
	  return {
	    slug: (slugPart || "").toLowerCase(),
	    subId: (subPart || "").trim(),
	  };
	}

	function setHashForSection(sectionName, subId = "", { replace = false } = {}) {
	  const slug = SECTION_HASH[sectionName];
	  if (!slug) return;

	  const next = subId ? `#${slug}:${subId}` : `#${slug}`;
	  if (window.location.hash === next) return;

	  if (replace) {
	    // Replace without adding a history entry, but still update the hash.
	    history.replaceState(null, "", next);

	    // replaceState does NOT trigger hashchange; call router manually.
	    routeFromHash();
	  } else {
	    // This WILL trigger `hashchange` and therefore `routeFromHash()`.
	    window.location.hash = next;
	  }
	}

	function routeFromHash() {
	  const { slug, subId } = parseHash();

	  if (!slug) {
	    activateSectionMenuFor(null);
	    return;
	  }

	  const section = HASH_SECTION[slug];
	  if (!section) return;

	  if (typeof window.showSection === "function") {
	    window.showSection(section);
	    activateSectionMenuFor(section);
	  }

	  if (!subId) return;

	  // Wait for injected DOM, then scroll to subId if present
	  requestAnimationFrame(() => {
	    requestAnimationFrame(() => {
	      const el = document.getElementById(subId);
	      if (el) scrollToWithHeaderOffset(el, 12);
	    });
	  });
	}

	window.addEventListener("hashchange", routeFromHash);
	document.addEventListener("DOMContentLoaded", routeFromHash);
	// Also: make resetLanding clear the hash so home is shareable as the base URL
	const _resetLanding = window.resetLanding;
	window.resetLanding = function resetLandingWithHashClear() {
	  clearHash({ replace: true });
	  if (typeof _resetLanding === 'function') _resetLanding();
	};

    /* ------------------------------------------------------------
       5) Reset Landing
    ------------------------------------------------------------ */
    function resetLanding() {
      document.getElementById("content-widget").classList.remove("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    /* Optional - If you had an openTechModal() from the code snippet:
       You can define it here if needed. Right now it's just a placeholder. */
    function openTechModal() {
      alert("Tech Modal placeholder. Implement as needed.");
    }
    function scrollToEthos() {
      // slight delay so innerHTML has rendered
      setTimeout(() => {
        const el = document.getElementById("ethos");
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("flash");
        // remove highlight after a couple seconds
        setTimeout(() => el.classList.remove("flash"), 2000);
      }, 200);
    }

	function initFintechTechDropdown(root = document) {
	  const details = root.querySelector('#fintech-tech');
	  const summary = root.querySelector('#portfolio-top');
	  if (!details || !summary) return;

	  // Avoid double wiring
	  if (details.__wired) return;
	  details.__wired = true;

	  // 1) On open, scroll Tech into focus
	  details.addEventListener('toggle', () => {
	    if (details.open) {
	      requestAnimationFrame(() => {
	        scrollToWithHeaderOffset(summary, 12);
	        summary.focus?.({ preventScroll: true });
	      });
	    }
	  });

	  // 2) Collapse when user scrolls UP to any content above Tech title
	  let lastY = window.scrollY;

	  const onScroll = () => {
	    const y = window.scrollY;
	    const scrollingUp = y < lastY;
	    lastY = y;

	    if (!details.open || !scrollingUp) return;

	    const header =
	      document.querySelector('.site-header') ||
	      document.querySelector('#site-header .site-header') ||
	      document.querySelector('nav.navbar');

	    const headerH =
	      header?.getBoundingClientRect().height ||
	      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h') || '70', 10) ||
	      70;

	    const top = summary.getBoundingClientRect().top;

	    // If the Tech summary is below the header line while scrolling up,
	    // we are "above" Tech => collapse for legibility.
	    if (top > headerH + 16) {
	      details.open = false;
	    }
	  };

	  window.addEventListener('scroll', onScroll, { passive: true });
	  details.__teardown = () => window.removeEventListener('scroll', onScroll);
	}
    /* ------------------------------------------------------------
       Session widget: detect login state & update navbar
    ------------------------------------------------------------ */
    const AUTH_ORIGIN = 'https://auth.haiphen.io';  // change if needed

    async function updateSessionWidget() {
      const slot = document.getElementById('session-slot');
      if (!slot) return;

      // Helper: show Login pill
      function showLogin() {
        slot.innerHTML = `<a href="${AUTH_ORIGIN}/login" class="login-btn">Login</a>`;
      }

      try {
        const resp = await fetch(`${AUTH_ORIGIN}/me`, {
          credentials: 'include', // send auth cookie across subdomain
        });

        if (!resp.ok) {
          showLogin();
          return;
        }

        const user = await resp.json(); // {sub, name, avatar, email, ...}
        const displayName = user.name || user.sub || 'User';
        const avatar = user.avatar || 'assets/profile.png';

        slot.innerHTML = `
          <span class="session-user">
            <img src="${avatar}" alt="">
            ${displayName}
            <a class="logout-link" href="${AUTH_ORIGIN}/logout" title="Logout">×</a>
          </span>
        `;
      } catch (err) {
        console.warn('[session] failed to fetch /me', err);
        showLogin();
      }
    }

    // run on load & periodically refresh
    document.addEventListener('DOMContentLoaded', updateSessionWidget);
    setInterval(updateSessionWidget, 5 * 60 * 1000); // refresh every 5m (optional)

	document.addEventListener('DOMContentLoaded', () => {
	  const H = window.HAIPHEN || {};

	  const safe = (fn, name) => {
	    if (typeof fn !== 'function') return;
	    try {
	      // Works whether fn returns a Promise or not
	      Promise.resolve(fn()).catch((err) => console.warn(`[${name}] load failed`, err));
	    } catch (err) {
	      console.warn(`[${name}] load threw`, err);
	    }
	  };

	  safe(H.loadHeader, 'header');
	  safe(H.loadSidebar, 'sidebar');
	  safe(H.loadSectionMenu, 'section-menu');
	  safe(H.loadFooter, 'footer');
	  safe(H.loadTradesOverlay, 'trades-overlay');
	  safe(H.loadSiteSearch, 'site-search');

	  updateSessionWidget();
	});
  </script>
</body>
</html>
===== docs/inventory.html =====
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Haiphen — Portfolio</title>
  <link rel="icon" href="assets/favicon.ico">

  <!-- Keep your existing OG/Twitter/JSON-LD blocks here (copy from index.html) -->

  <link rel="stylesheet" href="assets/base.css" />

  <script src="components/headers/site-header.js"></script>
  <script src="components/sidebar/site-sidebar.js"></script>
  <script src="components/footers/site-footer.js"></script>
  <script src="assets/site.js"></script>
</head>

<body>
  <div id="header-mount"></div>
  <div id="sidebar-mount"></div>

  <main class="main-container">
    <h1>Portfolio</h1>

    <!-- Paste your portfolio <ul> here (from sectionContent["Inventory"]) -->
    <ul>
      <!-- Example item (keep your real content) -->
      <li style="list-style: disc; margin-bottom: 2rem;">
        <p style="margin-bottom: 0.5rem; font-size: 1.1rem; text-align: center;">
          <strong>ETL Ingestion Engine:</strong> Prior work with a DEI tech startup...
        </p>
        <div style="text-align: center;">
          <a href="https://github.com/JudeSafo/All_Language_Model" target="_blank" rel="noopener noreferrer">
            <img src="assets/gitPortfolio_esg.png" alt="All Language Model"
              style="max-width:80%; height:auto; border: 1px solid #ccc; border-radius: 4px;">
          </a>
        </div>
      </li>
      <!-- ...rest of your items -->
    </ul>
  </main>

  <div id="footer-sentinel" aria-hidden="true" style="height:1px;"></div>
  <div id="footer-mount"></div>
</body>
</html>
===== docs/logged-in.html =====
<!-- docs/logged-in.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>You’re Logged In</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 4rem; }
    a { color: #5A9BD4; text-decoration: none; font-weight: bold; }
  </style>
</head>
<body>
  <h1>🎉 You’re Logged In!</h1>
  <p>Thanks for authenticating. <a href="/">Return to the home page →</a></p>
</body>
</html>

===== docs/main.js =====
/**
 * main.js
 * Provides interactive features such as a back-to-top button.
 */
(function () {
  'use strict';

  const backToTopButton = document.getElementById('backToTop');

  // Toggle back-to-top button visibility on scroll
  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
      backToTopButton.style.display = 'block';
    } else {
      backToTopButton.style.display = 'none';
    }
  });

  // Smooth scroll to top on button click
  backToTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

===== docs/services.html =====
<!doctype html>
<html lang="en">
<head>
  <!-- Basic SEO -->
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Haiphen — Services</title>
  <link rel="icon" href="assets/favicon.ico">

  <!-- Keep your existing OG/Twitter/JSON-LD blocks here (copy from index.html) -->

  <link rel="stylesheet" href="assets/base.css" />

  <!-- Component loaders -->
  <script src="components/headers/site-header.js"></script>
  <script src="components/sidebar/site-sidebar.js"></script>
  <script src="components/footers/site-footer.js"></script>

  <!-- Shared bootloader -->
  <script src="assets/site.js"></script>
</head>

<body>
  <div id="header-mount"></div>
  <div id="sidebar-mount"></div>

  <main class="main-container">
    <h1>Services</h1>

    <!-- Snap stack (this is your injected “Services” section, but now it’s a real page) -->
    <div class="snap-stack" data-snap-stack="services">
      <section class="snap-panel">
        <div id="services-plans-mount"></div>
      </section>

      <section class="snap-panel">
        <div id="services-hardtech-mount"></div>
      </section>
    </div>
  </main>

  <div id="footer-sentinel" aria-hidden="true" style="height:1px;"></div>
  <div id="footer-mount"></div>

  <script>
    // If your services components provide a loader, call it here:
    document.addEventListener('DOMContentLoaded', async () => {
      try { await window.HAIPHEN?.loadServicesPlans?.(); }
      catch (e) { console.warn('[Services] loadServicesPlans failed', e); }

      // Re-init snap stacks after async mount changes height
      window.HAIPHEN?.initSnapStacks?.(document);
    });
  </script>
</body>
</html>
===== docs/tech.html =====
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Haiphen — Tech</title>
  <link rel="icon" href="assets/favicon.ico">

  <!-- Keep your existing OG/Twitter/JSON-LD blocks here (copy from index.html) -->

  <link rel="stylesheet" href="assets/base.css" />

  <script src="components/headers/site-header.js"></script>
  <script src="components/sidebar/site-sidebar.js"></script>
  <script src="components/footers/site-footer.js"></script>
  <script src="assets/site.js"></script>
</head>

<body>
  <div id="header-mount"></div>
  <div id="sidebar-mount"></div>

  <main class="main-container">
    <h1>Tech Stack</h1>

    <!-- Paste Tech content here (from sectionContent["Tech"]) -->
    <section class="tech-container">
      <div class="tech-left">
        <h3>Ethos</h3>
        <p>
          Open Source Everything: ... (your real text)
        </p>

        <h3>Stack</h3>
        <ul class="tech-list">
          <li><i>Backend:</i> Apache Framework, Redis, Postgres</li>
          <li><i>Network:</i> Istio, SD-WAN solutions</li>
          <li><i>Platform:</i> Ansible, Terraform, Kubernetes</li>
          <li><i>Access Control:</i> Keycloak, OpenFGA</li>
          <li><i>Telemetry:</i> Prometheus, Grafana, ELK Stack</li>
        </ul>

        <h3>Secure</h3>
        <p>
          Industry best practices, zero-trust <strong>security protocols</strong>...
        </p>
      </div>

      <div class="tech-right">
        <object type="image/svg+xml" data="assets/tech_animated.svg" class="tech-svg">
          Your browser does not support SVG.
        </object>
      </div>
    </section>
  </main>

  <div id="footer-sentinel" aria-hidden="true" style="height:1px;"></div>
  <div id="footer-mount"></div>
</body>
</html>