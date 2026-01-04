(function () {
  window.HAIPHEN = window.HAIPHEN || {};

  const DEFAULT_FAQS = [
    {
      q: "What is Haiphen?",
      a: "Haiphen is a signals-intelligence engineering studio. We build production-grade pipelines for ML/NLP, security, and telemetry-heavy systems — and we do it in a way you can inspect and maintain.",
      tags: ["general"],
    },
    {
      q: "How do I collaborate or request services?",
      a: "Use the Contact tab or the service intake form. Include a short problem statement, your constraints (timeline/budget/security), and what “success” looks like.",
      tags: ["collaboration", "services"],
    },
    {
      q: "Are the trading metrics investment advice?",
      a: "No. They’re operational telemetry from an automated execution system (volume, stability, daily outcomes). Nothing on this page is a recommendation to buy/sell any asset.",
      tags: ["trading", "disclaimer"],
    },
    {
      q: "Why might the Archive show fallback metrics?",
      a: "If the data pipeline can’t reach the DB for a run, the publisher will emit a fallback payload. We typically avoid overwriting historical archive days with fallback to keep history trustworthy.",
      tags: ["trading", "telemetry"],
    },
    {
      q: "Can you build a custom version of this site/pipeline for my company?",
      a: "Yes — typically as a scoped engagement: (1) discovery, (2) prototype, (3) hardening + documentation, (4) deployment + monitoring. We bias toward simple systems that survive contact with reality.",
      tags: ["services"],
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
    const hasQ =
      !qq ||
      normalize(item.q).includes(qq) ||
      normalize(item.a).includes(qq) ||
      (item.tags || []).some((t) => normalize(t).includes(qq));

    const hasTag = !tag || (item.tags || []).includes(tag);
    return hasQ && hasTag;
  }

  function renderTags(root, tags, activeTag, onToggle) {
    root.innerHTML = tags
      .map((t) => {
        const pressed = t === activeTag ? "true" : "false";
        return `<button class="faq-tag" type="button" data-tag="${t}" aria-pressed="${pressed}">${t}</button>`;
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
      .map(
        (it) => `
      <details class="faq-item">
        <summary>${escapeHtml(it.q)}</summary>
        <div class="faq-a">${escapeHtml(it.a)}</div>
      </details>
    `
      )
      .join("");
  }

  function escapeHtml(s) {
    return (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

    const tags = uniq(
      faqs.flatMap((f) => f.tags || []).map((t) => String(t))
    ).sort((a, b) => a.localeCompare(b));

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

    if (searchEl) {
      searchEl.addEventListener("input", recompute);
    }

    renderTags(tagsEl, tags, activeTag, (tag) => {
      activeTag = activeTag === tag ? null : tag;
      recompute();
    });

    recompute();
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