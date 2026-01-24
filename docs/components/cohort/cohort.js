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
 *  - Overlay lives inside the Contact section mount (#cohort-mount).
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
    return attachOnce(root);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.Cohort = {
    init,
    open: openOverlay,
    close: closeOverlay,
    isOpen: isOverlayOpen,
  };
})();