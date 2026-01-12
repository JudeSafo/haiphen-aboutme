/* global window, document, fetch */
(function () {
  const DEFAULTS = {
    tosVersion: "sla_v0.1_2026-01-10",
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
      // if base html not injected yet, inject synchronously by fetching
      const html = await fetchText("/components/terms-gate/terms-gate.html");
      const host = document.createElement("div");
      host.innerHTML = html;
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

    // Load content (versioned)
    const html = await fetchText(cfg.contentUrl);
    content.innerHTML = html;

    // Show modal + lock body scroll
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Close handler
    function close() {
      root.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      root.removeEventListener("click", onRootClick);
      scroll.removeEventListener("scroll", onScroll);
      agree.removeEventListener("change", onAgree);
      cont.removeEventListener("click", onContinue);
      window.removeEventListener("keydown", onKeyDown);
    }

    function onRootClick(e) {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "1") close();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") close();
    }

    function onScroll() {
      if (nearBottom(scroll)) {
        agree.disabled = false;
      }
      cont.disabled = !(nearBottom(scroll) && agree.checked);
    }

    function onAgree() {
      cont.disabled = !(nearBottom(scroll) && agree.checked);
    }

    async function onContinue() {
      try {
        cont.disabled = true;
        setHidden(error, true);

        // 1) record acceptance (server-side)
        await postJson(`${cfg.checkoutOrigin}/v1/tos/accept`, {
          tos_version: cfg.tosVersion,
          content_url: cfg.contentUrl,
          page_url: window.location.href,
        });

        // 2) create checkout session (your existing API)
        const session = await postJson(`${cfg.checkoutOrigin}/v1/checkout/session`, {
          price_id: cfg.priceId,
          plan: cfg.plan,
          tos_version: cfg.tosVersion,
        });

        // 3) redirect to Stripe
        if (!session?.url) throw new Error("Missing checkout URL from server");
        window.location.assign(session.url);
      } catch (e) {
        if (e && (e.status === 401 || e.status === 403 || /unauthorized/i.test(e.message))) {
          redirectToLogin(e?.data?.login_url);
          return;
        }        
        console.error("terms-gate: continue failed", e);
        error.textContent = e?.message || "Failed to continue";
        setHidden(error, false);
        cont.disabled = false;
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

    // return close hook if callers want it
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