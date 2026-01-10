(function () {
  const API_ORIGIN = "https://haiphen-contact.pi-307.workers.dev";
  const ENDPOINT = `${API_ORIGIN}/api/contact`;

  const LOG_PREFIX = "[contact]";
  const WIRE_TIMEOUT_MS = 15000;

  function qs(id) { return document.getElementById(id); }

  function setStatus(msg) {
    const el = qs("contactStatus");
    if (el) el.textContent = msg || "";
  }

  function disableForm(disabled) {
    const btn = qs("contactSubmit");
    if (btn) btn.disabled = !!disabled;
    const form = qs("contactForm");
    if (!form) return;
    [...form.elements].forEach((e) => {
      if (e && e.tagName && e.tagName !== "BUTTON") e.disabled = !!disabled;
    });
  }

  async function postJson(url, body) {
    // Helpful debug: you should see this in Network when wired correctly.
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

  function showReceipt(data) {
    const form = qs("contactForm");
    const receipt = qs("contactReceipt");
    if (!form || !receipt) return;

    form.hidden = true;
    receipt.hidden = false;

    qs("ticketId").textContent = data.ticketId || "—";
    qs("ticketEmail").textContent = data.email || "—";
    qs("ticketMeta").textContent =
      `Queue position: ${data.queuePosition ?? "—"} • Received: ${data.receivedAt || "—"}`;
  }

  function showForm() {
    const form = qs("contactForm");
    const receipt = qs("contactReceipt");
    if (!form || !receipt) return;
    form.hidden = false;
    receipt.hidden = true;
    form.reset();
    setStatus("");
  }

  function attachOnce() {
    const form = qs("contactForm");
    if (!form) return false;

    // Prevent double-wiring if components re-render.
    if (form.dataset.hpWired === "1") return true;
    form.dataset.hpWired = "1";

    console.info(LOG_PREFIX, "wiring submit handler");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus("");

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
        setStatus("Please fill name, email, and a longer message.");
        return;
      }

      disableForm(true);
      setStatus("Submitting…");

      try {
        const data = await postJson(ENDPOINT, payload);
        setStatus("");
        showReceipt(data);
      } catch (err) {
        console.warn(LOG_PREFIX, "submit failed", err);
        setStatus(err?.message || "Submit failed. Try again.");
      } finally {
        disableForm(false);
      }
    });

    const another = qs("contactAnother");
    if (another && another.dataset.hpWired !== "1") {
      another.dataset.hpWired = "1";
      another.addEventListener("click", showForm);
    }

    return true;
  }

  function waitForWire() {
    // Fast path
    if (attachOnce()) return;

    console.info(LOG_PREFIX, "form not found yet; waiting for DOM injection…");

    const startedAt = Date.now();

    const obs = new MutationObserver(() => {
      if (attachOnce()) {
        obs.disconnect();
      } else if (Date.now() - startedAt > WIRE_TIMEOUT_MS) {
        obs.disconnect();
        console.error(LOG_PREFIX, "timed out waiting for #contactForm to appear");
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Also set a hard timeout (in case MutationObserver never fires for some reason)
    setTimeout(() => {
      if (qs("contactForm") && attachOnce()) {
        obs.disconnect();
      } else if (!qs("contactForm")) {
        obs.disconnect();
        console.error(LOG_PREFIX, "timed out waiting for #contactForm to appear");
      }
    }, WIRE_TIMEOUT_MS);
  }

  // Start when DOM is ready-ish.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForWire, { once: true });
  } else {
    waitForWire();
  }
})();