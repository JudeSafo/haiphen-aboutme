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
      q: "What deliverables do you actually ship?",
      aHtml:
        `Typically: (1) a working pipeline/service, (2) published artifacts (JSON, exports, screenshots), (3) observability (logs/metrics/traces) + runbooks, (4) reliability hardening (retries/idempotency/backfills), and (5) security boundaries (least privilege, key rotation posture).`,
      aText:
        "Typically: working pipeline/service, published artifacts, observability + runbooks, reliability hardening, and security boundaries.",
      tags: ["services", "engineering", "deliverables"],
    },
    {
      q: "What does a 'thin vertical slice' mean in practice?",
      a:
        "One signal → one decision → one output. Example: ingest a single source, compute a KPI, publish JSON, render one UI widget, and add monitoring. Once it’s reliable, scale horizontally (more signals).",
      tags: ["engineering", "services"],
    },
    {
      q: "How do you define success for a project?",
      a:
        "Success is measurable: latency/throughput targets, error budgets, alert coverage, correctness checks, and the ability to explain any output (lineage). If you can’t debug it, you don’t own it.",
      tags: ["engineering", "telemetry", "services"],
    },
    {
      q: "How do you handle sensitive data?",
      a:
        "We design for least privilege and separation of concerns: scoped tokens, minimized retention, audit logs, and clear data boundaries. If needed we can keep raw data in your environment and only publish derived artifacts.",
      tags: ["security", "services"],
    },
    {
      q: "Can you integrate with our existing stack?",
      a:
        "Yes — we usually meet you where you are: your cloud, your CI, your observability, your auth. The goal is to reduce operational friction, not add another mystery system.",
      tags: ["services", "engineering"],
    },
    {
      q: "What’s the relationship between Mission and the Trades telemetry?",
      aHtml:
        `Trades is a living example of the philosophy: publish artifacts, keep a daily archive, and make metrics clickable for diagnosis. Mission explains the general pattern; Trades shows it running. See <a href="#fintech">Trades</a> and <a href="#services">Services</a>.`,
      aText:
        "Trades is a living example of the philosophy: publish artifacts, keep a daily archive, and make metrics clickable for diagnosis.",
      tags: ["general", "telemetry", "navigation"],
    },    
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
        `Use hashes: <code>#fintech</code> (Featured), <code>#mission</code> (Mission), <code>#services</code> (Services), <code>#docs</code> (Documentation), <code>#contact-us</code> (Company). Example: click <a href="#mission">#mission</a> or <a href="#fintech">#fintech</a>.`,
      aText:
        "Use hashes: #fintech (Featured), #mission (Mission), #services (Services), #docs (Documentation), #contact-us (Company). Example: #mission or #fintech.",
      tags: ["navigation"],
    },
    {
      q: "Where can I see examples of prior work on this site?",
      aHtml:
        `The "Tech" dropdown inside Trades shows portfolio-style artifacts, and the OnePager includes case-study visuals. Start at <a href="#fintech">Trades</a> → <a data-faq-go="Trades:fintech-tech" href="#fintech-tech">Tech</a>, or jump to <a href="#mission">Mission</a>.`,
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
      q: "Where's the gallery of hardware / field work?",
      aHtml:
        `The gallery lives in Mission. Jump to <a href="#mission">Mission</a> and scroll to <a data-faq-go="OnePager:services-gallery" href="#mission:services-gallery">Gallery</a>.`,
      aText:
        "The gallery lives in OnePager. Jump to OnePager and scroll to Gallery.",
      tags: ["navigation", "services"],
    },
    {
      q: "What is Haiphen Secure?",
      aHtml:
        `Haiphen Secure provides automated vulnerability assessment and security posture monitoring for edge and industrial infrastructure. It correlates CVEs, enforces compliance policies, and generates remediation playbooks. See <a href="#docs:docs-secure">Secure docs</a>.`,
      aText:
        "Haiphen Secure provides automated vulnerability assessment and security posture monitoring. It correlates CVEs, enforces compliance, and generates remediation playbooks.",
      tags: ["services", "security"],
    },
    {
      q: "How does Network Trace work?",
      aHtml:
        `Network Trace performs packet-level inspection and protocol decoding for Modbus, OPC-UA, MQTT, and other industrial protocols. It detects traffic anomalies and reconstructs sessions for forensic analysis. See <a href="#docs:docs-network">Network Trace docs</a>.`,
      aText:
        "Network Trace performs packet-level inspection and protocol decoding for industrial protocols. It detects anomalies and reconstructs sessions.",
      tags: ["services", "engineering"],
    },
    {
      q: "What can I do with Knowledge Graph?",
      aHtml:
        `Knowledge Graph extracts entities from your data streams, infers relationships, and builds a queryable knowledge base via GraphQL. It deduplicates across sources and supports topology queries. See <a href="#docs:docs-graph">Knowledge Graph docs</a>.`,
      aText:
        "Knowledge Graph extracts entities, infers relationships, and builds a queryable knowledge base via GraphQL with cross-source deduplication.",
      tags: ["services", "engineering"],
    },
    {
      q: "How does Risk Analysis differ from standard VaR tools?",
      aHtml:
        `Risk Analysis goes beyond basic Value-at-Risk by combining Monte Carlo simulation, scenario stress testing, and portfolio correlation analysis. It computes both VaR and CVaR under configurable tail-risk scenarios. See <a href="#docs:docs-risk">Risk Analysis docs</a>.`,
      aText:
        "Risk Analysis combines Monte Carlo simulation, scenario stress testing, and portfolio correlation analysis beyond basic VaR computation.",
      tags: ["services", "trading"],
    },
    {
      q: "What is Causal Chain analysis?",
      aHtml:
        `Causal Chain builds causal graphs from event data, reconstructs incident timelines, and enables counterfactual reasoning — answering "what would have happened if X didn't occur?" for complex system failures. See <a href="#docs:docs-causal">Causal Chain docs</a>.`,
      aText:
        "Causal Chain builds causal graphs from event data, reconstructs incident timelines, and enables counterfactual reasoning for system failures.",
      tags: ["services", "engineering"],
    },
    {
      q: "How does Supply Chain Intel work?",
      aHtml:
        `Supply Chain Intel maps multi-tier supplier networks, scores disruption probability, suggests alternative sourcing, and overlays geopolitical risk data for real-time supply chain visibility. See <a href="#docs:docs-supply">Supply Chain docs</a>.`,
      aText:
        "Supply Chain Intel maps supplier networks, scores disruption probability, suggests alternative sourcing, and overlays geopolitical risk.",
      tags: ["services"],
    },
    {
      q: "How do I use the CLI to access services?",
      aHtml:
        `Install the CLI, then run <code>haiphen login</code> to authenticate, <code>haiphen services</code> to list available services, and service-specific commands like <code>haiphen secure scan</code> or <code>haiphen risk assess</code>. See <a href="#docs:docs-cli-commands">CLI docs</a>.`,
      aText:
        "Install the CLI, run haiphen login, haiphen services, and service-specific commands like haiphen secure scan or haiphen risk assess.",
      tags: ["services", "navigation", "cli"],
    },
    {
      q: "What subscription plans are available?",
      aHtml:
        `Haiphen offers Free, Pro, and Enterprise tiers. Free includes limited API requests. Pro unlocks higher rate limits and premium services. Enterprise adds custom SLAs and dedicated support. See <a href="#subscribe">Subscribe</a> for details.`,
      aText:
        "Haiphen offers Free, Pro, and Enterprise tiers with increasing rate limits, service access, and support levels.",
      tags: ["services", "pricing"],
    },
    {
      q: "How do I manage my API keys?",
      aHtml:
        `Navigate to <a href="#profile">Profile</a> to rotate, copy, and revoke API keys. Keys use Bearer token authentication and have scoped permissions (metrics:read, rss:read, webhooks:write). Raw tokens are shown only once at creation.`,
      aText:
        "Navigate to Profile to rotate, copy, and revoke API keys. Keys use Bearer token auth with scoped permissions and are shown only once.",
      tags: ["navigation", "security"],
    },
    {
      q: "What happens after I subscribe?",
      aHtml:
        `After checkout, you'll see a confirmation page with next steps: check your email for receipt, generate an API key in <a href="#profile">Profile</a>, and explore the <a href="#docs">Docs</a>. Your plan activates immediately.`,
      aText:
        "After checkout, you'll see a confirmation with next steps: check email, generate API key in Profile, and explore Docs. Plan activates immediately.",
      tags: ["navigation", "services"],
    },
    {
      q: "What is Haiphen's deployment model?",
      a:
        "Haiphen is fully cloud-native, running on Cloudflare Workers across 200+ global Points of Presence. There are no VMs, containers, or servers to manage. Every request is handled at the nearest edge location with sub-millisecond cold starts.",
      tags: ["cloud-native", "engineering", "general"],
    },
    {
      q: "Can I self-host Haiphen?",
      a:
        "Haiphen is designed as a managed service on Cloudflare's edge network. Self-hosting is not currently supported. However, the CLI gateway (haiphen serve) runs locally and proxies to the edge APIs, giving you a local development experience without managing infrastructure.",
      tags: ["cloud-native", "engineering"],
    },
    {
      q: "What infrastructure do I need to use Haiphen?",
      a:
        "None. Haiphen requires zero customer infrastructure. Install the CLI via Homebrew (brew tap haiphenAI/tap && brew install haiphen), authenticate with your GitHub account, and start making API calls. All compute, storage, and coordination happens on the edge.",
      tags: ["cloud-native", "services", "cli"],
    },
    {
      q: "What are the benefits of Haiphen's cloud-native architecture?",
      aHtml:
        `Key benefits: (1) <strong>Zero ops</strong> — no servers, patches, or scaling to manage, (2) <strong>Global low latency</strong> — requests served from 200+ edge PoPs, (3) <strong>Built-in resilience</strong> — automatic failover and redundancy, (4) <strong>Pay-per-use efficiency</strong> — no idle compute costs, and (5) <strong>Instant deployment</strong> — updates propagate globally in seconds.`,
      aText:
        "Zero ops, global low latency from 200+ edge PoPs, built-in resilience, pay-per-use efficiency, and instant global deployment.",
      tags: ["cloud-native", "engineering", "general"],
    },
    {
      q: "How do I get started with Haiphen?",
      aHtml:
        `Install the CLI (<code>brew tap haiphenAI/tap && brew install haiphen</code>), authenticate with <code>haiphen login</code>, and run <code>haiphen status</code> to verify your entitlement. From there, connect a data source or broker and start exploring services. See the full walkthrough at <a href="#getting-started">Getting Started</a>.`,
      aText:
        "Install the CLI via Homebrew, authenticate with haiphen login, and run haiphen status to verify your entitlement. Then connect a data source or broker and start exploring services.",
      tags: ["services", "cli", "general"],
    },
    {
      q: "Which brokers does Haiphen integrate with?",
      aHtml:
        `Haiphen supports integrations with Charles Schwab, Interactive Brokers, Alpaca, Fidelity, Robinhood, E*TRADE, TD Ameritrade, and Merrill. Each broker can be connected in live or sandbox mode. See <a href="#getting-started">Getting Started</a> for setup instructions.`,
      aText:
        "Haiphen supports Charles Schwab, Interactive Brokers, Alpaca, Fidelity, Robinhood, E*TRADE, TD Ameritrade, and Merrill in live or sandbox mode.",
      tags: ["services", "trading"],
    },
    {
      q: "Can I test Haiphen without connecting a live broker?",
      a:
        "Yes. Set HAIPHEN_ENV=sandbox in your environment, then run haiphen serve. Sandbox mode uses simulated market data and paper trades so you can verify your pipeline end-to-end without risking real capital or needing live broker credentials.",
      tags: ["services", "trading", "cli"],
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