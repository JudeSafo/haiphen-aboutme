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
      { label: "Services • Cohort Checkout", section: "Services", elementId: "services-subscribe-banner", keywords: ["subscribe", "checkout", "cohort", "onboarding"] },
      { label: "Services • Plans", section: "Services", elementId: "services-plans-mount", keywords: ["plans", "pricing", "tiers"] },
      { label: "Services • Tech", section: "Services", elementId: "services-plans-mount", keywords: ["security", "network", "graph", "risk", "supply chain"] },

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
      { label: "Cohort Program", section: "Trades", elementId: "cohort", keywords: ["cohort", "onboarding", "program", "signals"] },
      { label: "Cohort Briefing Video", section: "Trades", elementId: "cohort-video", keywords: ["cohort", "video", "briefing"] },
      { label: "Profile", section: "Profile", elementId: "profile", keywords: ["profile", "account", "keys"] },
      { label: "Onboarding Hub", section: "Onboarding", elementId: "profile-onboarding", keywords: ["onboarding", "setup", "welcome", "assets"] },

      // --- Docs sections
      { label: "Docs • Overview", section: "Docs", elementId: "docs-overview", keywords: ["docs", "api", "overview", "reference"] },
      { label: "Docs • Authentication", section: "Docs", elementId: "docs-auth", keywords: ["docs", "auth", "jwt", "token", "bearer"] },
      { label: "Docs • Endpoints", section: "Docs", elementId: "docs-endpoints", keywords: ["docs", "endpoints", "routes", "api"] },
      { label: "Docs • Haiphen Secure", section: "Docs", elementId: "docs-secure", keywords: ["docs", "secure", "vulnerability", "scanning", "cve"] },
      { label: "Docs • Network Trace", section: "Docs", elementId: "docs-network", keywords: ["docs", "network", "trace", "protocol", "packet"] },
      { label: "Docs • Knowledge Graph", section: "Docs", elementId: "docs-graph", keywords: ["docs", "knowledge", "graph", "entity", "relationship"] },
      { label: "Docs • Risk Analysis", section: "Docs", elementId: "docs-risk", keywords: ["docs", "risk", "analysis", "var", "monte carlo"] },
      { label: "Docs • Causal Chain", section: "Docs", elementId: "docs-causal", keywords: ["docs", "causal", "chain", "root cause", "incident"] },
      { label: "Docs • Supply Chain", section: "Docs", elementId: "docs-supply", keywords: ["docs", "supply", "chain", "disruption", "supplier"] },
      { label: "Docs • CLI Commands", section: "Docs", elementId: "docs-cli-commands", keywords: ["docs", "cli", "commands", "haiphen", "terminal"] },

      // --- Platform & Tech services (mission spotlight)
      { label: "Trading Telemetry Suite", section: "OnePager", elementId: "svc-platform", hash: "mission:svc-platform", keywords: ["platform", "suite", "telemetry", "trading", "full platform", "all services", "aggregate"] },
      { label: "Haiphen Secure", section: "OnePager", elementId: "svc-secure", hash: "mission:svc-secure", keywords: ["secure", "security", "vulnerability", "scanning", "compliance", "cve", "infrastructure"] },
      { label: "Network Trace", section: "OnePager", elementId: "svc-network", hash: "mission:svc-network", keywords: ["network", "trace", "protocol", "fix", "itch", "ouch", "market data", "latency", "feed"] },
      { label: "Knowledge Graph", section: "OnePager", elementId: "svc-graph", hash: "mission:svc-graph", keywords: ["knowledge", "graph", "entity", "extraction", "sec filings", "ownership", "intelligence"] },
      { label: "Risk Analysis", section: "OnePager", elementId: "svc-risk", hash: "mission:svc-risk", keywords: ["risk", "analysis", "monte carlo", "var", "portfolio", "stress test", "sharpe"] },
      { label: "Causal Chain", section: "OnePager", elementId: "svc-causal", hash: "mission:svc-causal", keywords: ["causal", "chain", "event", "propagation", "execution", "trade chain", "post-trade"] },
      { label: "Counterparty Intel", section: "OnePager", elementId: "svc-supply", hash: "mission:svc-supply", keywords: ["counterparty", "exposure", "concentration", "broker", "clearing", "risk"] },

      // --- Profile subsections
      { label: "Profile • API Keys", section: "Profile", elementId: "profile", keywords: ["api", "keys", "rotate", "revoke", "bearer"] },
      { label: "Profile • Email Preferences", section: "Profile", elementId: "profile", keywords: ["email", "preferences", "digest", "newsletter"] },
      { label: "Profile • Service Quick Start", section: "Onboarding", elementId: "profile-onboarding", keywords: ["service", "quick start", "getting started", "cli"] },

      // --- Cohort
      { label: "Cohort • Program Details", section: "Trades", elementId: "cohort", keywords: ["cohort", "program", "details", "timeline"] },
      { label: "Cohort • Apply / Survey", section: "Trades", hash: "cohort:survey", keywords: ["cohort", "apply", "survey", "join"] },

      // --- Subscribe / Checkout
      { label: "Subscribe", section: "Services", elementId: "services-subscribe-banner", keywords: ["subscribe", "checkout", "payment", "plan", "pricing"] },
    ]);
  });
})();
