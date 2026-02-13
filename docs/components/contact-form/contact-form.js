(function () {
  const API_ORIGIN = "https://contact.haiphen.io";
  const ENDPOINT = `${API_ORIGIN}/api/contact`;

  const LOG_PREFIX = "[contact]";
  const WIRE_TIMEOUT_MS = 15000;

  function qsIn(root, id) {
    return (root || document).querySelector(`#${CSS.escape(id)}`);
  }

  function setStatus(root, msg) {
    const el = qsIn(root, "contactStatus");
    if (el) el.textContent = msg || "";
  }

  function disableForm(root, disabled) {
    const btn = qsIn(root, "contactSubmit");
    if (btn) btn.disabled = !!disabled;

    const form = qsIn(root, "contactForm");
    if (!form) return;

    [...form.elements].forEach((e) => {
      if (e && e.tagName && e.tagName !== "BUTTON") e.disabled = !!disabled;
    });
  }

  async function postJson(url, body) {
    console.debug(LOG_PREFIX, "POST", url, body);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}

    if (!resp.ok) {
      const msg = data?.error || `Request failed (${resp.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function showReceipt(root, data) {
    const form = qsIn(root, "contactForm");
    const receipt = qsIn(root, "contactReceipt");
    if (!form || !receipt) return;

    form.hidden = true;
    receipt.hidden = false;

    qsIn(root, "ticketId").textContent = data.ticketId || "—";
    qsIn(root, "ticketEmail").textContent = data.email || "—";
    qsIn(root, "ticketMeta").textContent =
      `Queue position: ${data.queuePosition ?? "—"} • Received: ${data.receivedAt || "—"}`;
  }

  function showForm(root) {
    const form = qsIn(root, "contactForm");
    const receipt = qsIn(root, "contactReceipt");
    if (!form || !receipt) return;

    form.hidden = false;
    receipt.hidden = true;
    form.reset();
    setStatus(root, "");
  }

  function attachOnce(root) {
    const form = qsIn(root, "contactForm");
    if (!form) return false;

    // Prevent double-wiring even if you re-inject
    if (form.dataset.hpWired === "1") return true;
    form.dataset.hpWired = "1";

    console.info(LOG_PREFIX, "wiring submit handler");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus(root, "");

      const fd = new FormData(form);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        message: String(fd.get("message") || "").trim(),
        website: String(fd.get("website") || "").trim(), // honeypot
        token: "", // optional
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
      };

      if (!payload.name || !payload.email || payload.message.length < 10) {
        setStatus(root, "Please fill name, email, and a longer message.");
        return;
      }

      disableForm(root, true);
      setStatus(root, "Submitting…");

      try {
        const data = await postJson(ENDPOINT, payload);
        setStatus(root, "");
        showReceipt(root, data);
      } catch (err) {
        console.warn(LOG_PREFIX, "submit failed", err);
        setStatus(root, err?.message || "Submit failed. Try again.");
      } finally {
        disableForm(root, false);
      }
    });

    const another = qsIn(root, "contactAnother");
    if (another && another.dataset.hpWired !== "1") {
      another.dataset.hpWired = "1";
      another.addEventListener("click", () => showForm(root));
    }

    return true;
  }

  function wireReveal(root) {
    var revealEls = (root || document).querySelectorAll('.hp-contact-reveal');
    if (!revealEls.length) return;
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(function(el) { io.observe(el); });
  }

  // ✅ PUBLIC INIT (no auto observer unless you call it)
  function init(rootEl) {
    const root = rootEl || document;

    // Fast-path: if the form exists now, wire immediately.
    if (attachOnce(root)) {
      wireReveal(root);
      return true;
    }

    // Optional: if you *do* want a wait mode, do it only when Contact is being opened.
    const startedAt = Date.now();
    const obs = new MutationObserver(() => {
      if (attachOnce(root)) {
        obs.disconnect();
        wireReveal(root);
      } else if (Date.now() - startedAt > WIRE_TIMEOUT_MS) {
        obs.disconnect();
        console.error(LOG_PREFIX, "timed out waiting for #contactForm to appear");
      }
    });

    obs.observe(root === document ? document.documentElement : root, {
      childList: true,
      subtree: true,
    });

    return false;
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.ContactForm = { init };
})();