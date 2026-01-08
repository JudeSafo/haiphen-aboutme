(function () {
  const API_ORIGIN = "https://haiphen-contact.pi-307.workers.dev";
  const ENDPOINT = `${API_ORIGIN}/api/contact`;

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

  function mountTurnstile() {
    const mount = qs("cf-turnstile");
    if (!mount) return;

    const siteKey = window.HAIPHEN?.TURNSTILE_SITE_KEY;
    if (!siteKey) {
      console.warn("[contact] missing TURNSTILE_SITE_KEY (set window.HAIPHEN.TURNSTILE_SITE_KEY)");
      return;
    }
    if (!window.turnstile) {
      console.warn("[contact] turnstile not loaded yet");
      return;
    }
    if (mount.__rendered) return;
    mount.__rendered = true;

    window.turnstile.render(mount, {
      sitekey: siteKey,
      theme: "light",
    });
  }

  function getTurnstileToken() {
    try {
      if (!window.turnstile) return "";
      return window.turnstile.getResponse() || "";
    } catch (_) {
      return "";
    }
  }

  function resetTurnstile() {
    try {
      if (window.turnstile) window.turnstile.reset();
    } catch (_) {}
  }

  function showReceipt(data) {
    const form = qs("contactForm");
    const receipt = qs("contactReceipt");
    if (!form || !receipt) return;

    form.hidden = true;
    receipt.hidden = false;

    qs("ticketId").textContent = data.ticketId || "—";
    // Your Worker currently returns { ok, ticketId } only; so this will show "—" unless you add fields server-side.
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
    resetTurnstile();
    setStatus("");
  }

  function wire() {
    const form = qs("contactForm");
    if (!form) return;

    mountTurnstile();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus("");

      const fd = new FormData(form);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        message: String(fd.get("message") || "").trim(),
        company: String(fd.get("company") || "").trim(), // honeypot
        token: getTurnstileToken(),                      // ✅ matches Worker: payload.token
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
        console.warn("[contact] submit failed", err);
        setStatus(err?.message || "Submit failed. Try again.");
        resetTurnstile();
      } finally {
        disableForm(false);
      }
    });

    const another = qs("contactAnother");
    if (another) another.addEventListener("click", showForm);

    const tries = 8;
    let i = 0;
    const t = setInterval(() => {
      i++;
      mountTurnstile();
      if (qs("cf-turnstile")?.__rendered || i >= tries) clearInterval(t);
    }, 350);
  }

  setTimeout(wire, 0);
})();