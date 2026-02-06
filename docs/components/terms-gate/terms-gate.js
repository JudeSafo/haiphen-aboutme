/* global window, document, fetch */
(function () {
  const DEFAULTS = {
    tosVersion: "sla_v0.2_2026-01-22",
    title: "Service Agreement",
    // where the HTML content lives (static)
     contentUrl: "/components/terms-gate/terms-content.html",
    // checkout worker endpoint
    checkoutOrigin: "https://checkout.haiphen.io",
  };

  // ✅ ADD THIS (browser-side version)
  function safeReturnTo(raw) {
    const fallback = window.location.href;
    if (!raw) return fallback;
    try {
      const cand = String(raw);
      // Must be https + on haiphen.io (or subdomain)
      if (/^https:\/\/([a-z0-9-]+\.)*haiphen\.io(\/|$)/i.test(cand)) return cand;
    } catch (_) {}
    return fallback;
  }

  function qs(sel, root = document) {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`terms-gate: missing element ${sel}`);
    return el;
  }

  function setHidden(el, hidden) {
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  async function fetchText(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.text();
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;   // ✅ add
      err.data = data;           // ✅ add
      throw err;
    }
    return data;
  }

  function nearBottom(scrollEl) {
    const thresholdPx = 24; // allow a tiny margin
    return scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - thresholdPx;
  }

  function mountOverlayHtmlOnce() {
    if (document.getElementById("termsGateRoot")) return;

    const host = document.createElement("div");
    host.setAttribute("data-terms-gate-host", "1");
    document.body.appendChild(host);

    // You already have a component loader style; simplest is inline fetch
    // If you prefer your existing loader system, swap this to your import mechanism.
    fetchText("/components/terms-gate/terms-gate.html")
      .then((html) => {
        host.innerHTML = html;
      })
      .catch((e) => console.error("terms-gate: failed to load base html", e));
  }

  async function getJson(url) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { "accept": "application/json" },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function redirectToLogin(loginUrl) {
    // Fallback if server didn't provide one
    const fallback = `https://auth.haiphen.io/login?to=${encodeURIComponent(window.location.href)}`;
    window.location.assign(String(loginUrl || fallback));
  }

  async function openTermsGate(opts) {
    const cfg = { ...DEFAULTS, ...(opts || {}) };

    // Support resume flow (tos-resume.js passes this)
    const resumeUrl = (() => {
      const raw = cfg.resumeUrl;
      if (!raw) return null;
      try {
        const u = new URL(String(raw));
        if (u.protocol !== "https:") return null;
        const h = u.hostname.toLowerCase();
        if (h === "checkout.haiphen.io" || h.endsWith(".haiphen.io")) return u.toString();
      } catch (_) {}
      return null;
    })();

    // 0) Require login BEFORE showing terms gate
    try {
      const rt = encodeURIComponent(window.location.href);
      await getJson(`${cfg.checkoutOrigin}/v1/auth/require?return_to=${rt}`);
    } catch (e) {
      // If not logged in, bounce to auth
      if (e && (e.status === 401 || e.status === 403)) {
        redirectToLogin(e?.data?.login_url);
        return { close() {} };
      }
      throw e;
    }

    // Ensure HTML exists
    if (!document.getElementById("termsGateRoot")) {
      const baseHtml = await fetchText("/components/terms-gate/terms-gate.html");
      const host = document.createElement("div");
      host.innerHTML = baseHtml;
      document.body.appendChild(host);
    }

    // Ensure CSS loaded (idempotent)
    if (!document.querySelector('link[data-terms-gate-css="1"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/components/terms-gate/terms-gate.css";
      link.setAttribute("data-terms-gate-css", "1");
      document.head.appendChild(link);
    }

    const root = qs("#termsGateRoot");
    const content = qs("#termsGateContent", root);
    const scroll = qs("#termsGateScroll", root);
    const agree = qs("#termsGateAgree", root);
    const cont = qs("#termsGateContinue", root);
    const subtitle = qs("#termsGateSubtitle", root);
    const error = qs("#termsGateError", root);

    // Reset state
    setHidden(error, true);
    error.textContent = "";
    agree.checked = false;
    agree.disabled = true;
    cont.disabled = true;
    scroll.scrollTop = 0;

    subtitle.textContent = `Version: ${cfg.tosVersion}`;

    // Load ToS content
    const tosHtml = await fetchText(cfg.contentUrl);
    content.innerHTML = tosHtml;

    // Show modal + lock body scroll
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;

      root.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      root.removeEventListener("click", onRootClick);
      scroll.removeEventListener("scroll", onScroll);
      agree.removeEventListener("change", onAgree);
      cont.removeEventListener("click", onContinue);
      window.removeEventListener("keydown", onKeyDown);
    }

    function showError(msg) {
      error.textContent = String(msg || "Something went wrong.");
      setHidden(error, false);
    }

    function onRootClick(e) {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "1") close();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") close();
    }

    function onScroll() {
      if (nearBottom(scroll)) agree.disabled = false;
      cont.disabled = !(nearBottom(scroll) && agree.checked);
    }

    function onAgree() {
      cont.disabled = !(nearBottom(scroll) && agree.checked);
    }

    async function onContinue() {
      cont.disabled = true;
      setHidden(error, true);

      try {
        // 1) Record acceptance (server-side)
        // If user already accepted (unique constraint), treat as success.
        try {
          await postJson(`${cfg.checkoutOrigin}/v1/tos/accept`, {
            tos_version: cfg.tosVersion,
            content_url: cfg.contentUrl,
            page_url: window.location.href,
          });
        } catch (e) {
          // Make "already accepted" non-fatal. Your worker currently doesn't upsert.
          const msg = String(e?.message || "");
          const isConflictish =
            e?.status === 409 ||
            msg.toLowerCase().includes("unique") ||
            msg.toLowerCase().includes("constraint") ||
            msg.toLowerCase().includes("already");
          if (!isConflictish) throw e;
        }

        // 2) Resume mode: go back to /v1/checkout/start (server creates Stripe session)
        if (resumeUrl) {
          window.location.assign(resumeUrl);
          return;
        }

        // 3) Normal mode: create checkout session then redirect to Stripe
        const session = await postJson(`${cfg.checkoutOrigin}/v1/checkout/session`, {
          price_id: String(cfg.priceId || "").trim(),
          plan: String(cfg.plan || "").trim(),
          tos_version: cfg.tosVersion,
        });

        if (!session?.url) throw new Error("Missing checkout URL from server");
        window.location.assign(session.url);
      } catch (e) {
        console.error("terms-gate: continue failed", e);
        showError(e?.message || "Unable to continue to checkout.");
        cont.disabled = !(nearBottom(scroll) && agree.checked);
      }
    }

    // wire events
    root.addEventListener("click", onRootClick);
    window.addEventListener("keydown", onKeyDown);
    scroll.addEventListener("scroll", onScroll, { passive: true });
    agree.addEventListener("change", onAgree);
    cont.addEventListener("click", onContinue);

    // initial check
    onScroll();

    return { close };
  }

  // Expose a stable API for services page
  window.HaiphenTermsGate = {
    open: openTermsGate,
    mount: mountOverlayHtmlOnce,
  };

  // Mount eagerly for snappy UX
  try { mountOverlayHtmlOnce(); } catch (_) {}
})();
