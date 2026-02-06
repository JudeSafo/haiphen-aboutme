/**
 * Cohort Survey Overlay
 *
 * Public API:
 *  - window.HAIPHEN.Cohort.init(rootEl)
 *  - window.HAIPHEN.Cohort.open([rootEl])   // opens overlay + focuses email
 *  - window.HAIPHEN.Cohort.close([rootEl])  // closes overlay + resets form
 *  - window.HAIPHEN.Cohort.isOpen([rootEl]) // boolean
 *
 * Notes:
 *  - Used by banner routing (#cohort) and header/menu triggers.
 *  - Overlay lives inside the Trades section mount (#cohort-mount).
 */
(function () {
  const API_ORIGIN = "https://haiphen-contact.pi-307.workers.dev";
  const ENDPOINT = `${API_ORIGIN}/api/cohort/submit`;

  const LOG = "[cohort]";
  const KEY_OPEN_ATTR = "data-open";

  let lastRoot = null;

  function q(root, sel) { return (root || document).querySelector(sel); }
  function qa(root, sel) { return [...(root || document).querySelectorAll(sel)]; }

  async function postJson(url, body) {
    console.debug(LOG, "POST", url, body);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!resp.ok) throw new Error(data?.error || `Request failed (${resp.status})`);
    return data;
  }

  function setOverlayOpen(root, open) {
    const overlay = q(root, "[data-cohort-overlay]");
    if (!overlay) return;

    overlay.hidden = !open;
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    document.documentElement.style.overflow = open ? "hidden" : "";
  }

  function isOverlayOpen(root) {
    const overlay = q(root, "[data-cohort-overlay]");
    if (!overlay) return false;
    return !overlay.hidden;
  }

  function setStatus(root, msg) {
    const el = q(root, "[data-cohort-status]");
    if (el) el.textContent = msg || "";
  }

  function showReceipt(root, data, email) {
    const form = q(root, "[data-cohort-form]");
    const receipt = q(root, "[data-cohort-receipt]");
    if (!form || !receipt) return;

    form.hidden = true;
    receipt.hidden = false;

    const emailEl = q(root, "[data-cohort-receipt-email]");
    const idEl = q(root, "[data-cohort-receipt-id]");
    if (emailEl) emailEl.textContent = email || "—";
    if (idEl) idEl.textContent = data?.submissionId || "—";
  }

  function showForm(root) {
    const form = q(root, "[data-cohort-form]");
    const receipt = q(root, "[data-cohort-receipt]");
    if (!form || !receipt) return;
    form.hidden = false;
    receipt.hidden = true;
    form.reset();
    setStatus(root, "");
    const formEl = q(root, "[data-cohort-form]");
    if (formEl) renderProgress(root, formEl);    
  }

  function disableForm(root, disabled) {
    const form = q(root, "[data-cohort-form]");
    const btn = q(root, "[data-cohort-submit]");
    if (btn) btn.disabled = !!disabled;
    if (!form) return;
    [...form.elements].forEach((e) => {
      if (e && e.tagName && e.tagName !== "BUTTON") e.disabled = !!disabled;
    });
  }

  function openOverlay(root) {
    const r = root || lastRoot || document;
    setOverlayOpen(r, true);
    showForm(r);
    const first = q(r, 'input[name="email"]');
    if (first) first.focus();
  }

  function closeOverlay(root) {
    const r = root || lastRoot || document;
    setOverlayOpen(r, false);
    showForm(r);
  }

  function wireMenuOpeners(root) {
    qa(document, `[${KEY_OPEN_ATTR}="cohort"]`).forEach((a) => {
      if (a.dataset.hpWired === "1") return;
      a.dataset.hpWired = "1";
      a.addEventListener("click", () => {
        setTimeout(() => openOverlay(root), 0);
      });
    });
  }

  function attachOnce(root) {
    const openBtn = q(root, "[data-cohort-open]");
    const overlay = q(root, "[data-cohort-overlay]");
    const form = q(root, "[data-cohort-form]");
    if (!openBtn || !overlay || !form) return false;

    if (root.dataset.hpCohortWired === "1") return true;
    root.dataset.hpCohortWired = "1";
    lastRoot = root;

    openBtn.addEventListener("click", () => openOverlay(root));

    qa(root, "[data-cohort-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeOverlay(root));
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!overlay.hidden) closeOverlay(root);
      }
    });

    // Progress wiring
    renderProgress(root, form);

    const onInput = () => renderProgress(root, form);
    form.addEventListener("input", onInput, { passive: true });
    form.addEventListener("change", onInput, { passive: true });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus(root, "");

      const fd = new FormData(form);
      const email = String(fd.get("email") || "").trim();
      const payload = {
        name: String(fd.get("name") || "").trim(),
        email,
        occupation: String(fd.get("occupation") || "").trim(),
        education: String(fd.get("education") || "").trim(),
        linkedin: String(fd.get("linkedin") || "").trim(),
        financial_affiliation: String(fd.get("financial_affiliation") || "").trim(),
        entrepreneurial_background: String(fd.get("entrepreneurial_background") || "").trim(),
        sigint_familiarity: String(fd.get("sigint_familiarity") || "").trim(),
        trading_experience: String(fd.get("trading_experience") || "").trim(),
        retirement_portfolio: String(fd.get("retirement_portfolio") || "").trim(),
        tech_background: String(fd.get("tech_background") || "").trim(),
        macro_interest: String(fd.get("macro_interest") || "").trim(),
        subscribeDaily: fd.get("subscribeDaily") === "on",
        website: String(fd.get("website") || "").trim(),
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        token: "",
      };

      if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        setStatus(root, "Please enter a valid email.");
        return;
      }

      disableForm(root, true);
      setStatus(root, "Submitting…");

      try {
        const data = await postJson(ENDPOINT, payload);
        setStatus(root, "");
        showReceipt(root, data, email);
      } catch (err) {
        console.warn(LOG, "submit failed", err);
        setStatus(root, err?.message || "Submit failed. Try again.");
      } finally {
        disableForm(root, false);
      }
    });

    wireMenuOpeners(root);
    return true;
  }

  function init(rootEl) {
    const root = rootEl || document;
    const ok = attachOnce(root);
    applyEmbedLinks(root);
    wireLightbox(root);
    if (ok) initCohortProgram(root);
    return ok;
  }

  function applyEmbedLinks(root) {
    qa(root, "[data-embed-src]").forEach((link) => {
      if (link.dataset.hpEmbedWired === "1") return;
      const src = link.dataset.embedSrc;
      if (!src) return;
      try {
        const abs = new URL(src, window.location.origin).href;
        const viewer = new URL("https://view.officeapps.live.com/op/embed.aspx");
        viewer.searchParams.set("src", abs);
        link.href = viewer.toString();
        link.dataset.hpEmbedWired = "1";
      } catch (_) {}
    });
  }

  function wireLightbox(root) {
    if (!root || root.dataset.hpCohortLightbox === "1") return;
    root.dataset.hpCohortLightbox = "1";

    root.addEventListener("click", (e) => {
      const img = e.target?.closest?.("img[data-lightbox]");
      if (img && typeof window.openLightbox === "function") {
        const src = img.getAttribute("src");
        if (src) window.openLightbox(src);
        return;
      }

      const svg = e.target?.closest?.("svg[data-lightbox-svg]");
      if (svg && typeof window.openLightbox === "function") {
        const serialized = new XMLSerializer().serializeToString(svg);
        const encoded = encodeURIComponent(serialized)
          .replace(/'/g, "%27")
          .replace(/\"/g, "%22");
        const dataUri = `data:image/svg+xml;charset=UTF-8,${encoded}`;
        window.openLightbox(dataUri);
      }
    });
  }


  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function computeProgressFromForm(form) {
    // Treat these as “core” for completion intent:
    // - email is required
    // - the 7 numbered questions are the real “survey”
    const keys = [
      "email",
      "financial_affiliation",
      "entrepreneurial_background",
      "sigint_familiarity",
      "trading_experience",
      "retirement_portfolio",
      "tech_background",
      "macro_interest",
    ];

    const getVal = (name) => {
      const el = form.elements.namedItem(name);
      if (!el) return "";
      // for NodeList-like, pick first
      const node = Array.isArray(el) ? el[0] : el;
      return String(node?.value ?? "").trim();
    };

    let answered = 0;
    for (const k of keys) {
      const v = getVal(k);
      if (v.length > 0) answered++;
    }

    const total = keys.length;
    const pct = Math.round((answered / total) * 100);
    return { answered, total, pct };
  }

  function renderProgress(root, form) {
    const barFill = q(root, "[data-cohort-progress-bar]");
    const textEl = q(root, "[data-cohort-progress-text]");
    const bar = q(root, ".hp-cohort-hero__bar");

    if (!form || !barFill || !textEl || !bar) return;

    const p = computeProgressFromForm(form);
    const pct = clamp(p.pct, 0, 100);

    barFill.style.width = `${pct}%`;
    textEl.textContent = `Progress: ${pct}%`;

    bar.setAttribute("aria-valuenow", String(pct));
  }

  // ---- Cohort program interactions (non-survey) ----
  function initCohortProgram(root) {
    const scope = root || document;

    // 1) Scroll reveal
    const revealEls = [...scope.querySelectorAll('.hp-cohort-reveal')];
    if (revealEls.length) {
      const obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add('is-visible');
              obs.unobserve(e.target);
            }
          }
        },
        { threshold: 0.15 }
      );
      revealEls.forEach((el) => obs.observe(el));
    }

    // 2) Timeline phase highlighting
    const phases = [...scope.querySelectorAll('.hp-cohort-phase')];
    if (phases.length) {
      const phaseObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              phases.forEach((p) => p.classList.remove('is-active'));
              e.target.classList.add('is-active');
            }
          });
        },
        { threshold: 0.6 }
      );
      phases.forEach((el) => phaseObs.observe(el));
    }

    // 3) FAQ smooth open/close
    const faqs = [...scope.querySelectorAll('.hp-cohort-faq')];
    faqs.forEach((d) => {
      d.addEventListener('toggle', () => {
        if (d.open) {
          d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    });
  }
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.Cohort = {
    init,
    open: openOverlay,
    close: closeOverlay,
    isOpen: isOverlayOpen,
  };
})();
