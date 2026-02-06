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
      { label: "Cohort Program", section: "Trades", elementId: "cohort", keywords: ["cohort", "onboarding", "program", "signals"] },
      { label: "Cohort Briefing Video", section: "Trades", elementId: "cohort-video", keywords: ["cohort", "video", "briefing"] },
      { label: "Profile", section: "Profile", elementId: "profile", keywords: ["profile", "account", "keys"] },
      { label: "Onboarding Hub", section: "Onboarding", elementId: "profile-onboarding", keywords: ["onboarding", "setup", "welcome", "assets"] },
    ]);
  });
})();
