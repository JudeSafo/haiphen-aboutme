// docs/components/hero-device-launcher/hero-device-launcher.js
(() => {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});

  /**
   * Optional runtime handler map the page can override:
   *   window.HAIPHEN.HeroDeviceLauncher.setHandlers({
   *     android: ({ device, btn, event }) => ...,
   *     mac: ({ device, btn, event }) => ...,
   *     iphone: ({ device, btn, event }) => ...,
   *   })
   *
   * If a handler returns:
   *   - false => suppress default navigation (we assume you handled it)
   *   - true/undefined => allow default routing fallback if needed
   */
  const state = {
    handlers: {},
  };

  function isSameHash(targetHash) {
    const a = String(window.location.hash || "").trim();
    const b = String(targetHash || "").trim();
    return a === b;
  }

  function safeShowDocs() {
    try {
      if (typeof window.showSection === "function") {
        window.showSection("Docs");
      }
    } catch (err) {
      console.warn("[hero-device] showSection('Docs') failed", err);
    }
  }

  /**
   * Route to Docs in a way that works even if:
   * - hash router is present (#docs)
   * - the content widget needs injection (showSection)
   * - we're *already* on #docs (hashchange won't fire)
   */
  function routeToDocs({ source = "hero_device", device = "" } = {}) {
    // 1) Prefer your access gate if present (it may choose to show Terms / gate first)
    try {
      const fn = window?.HAIPHEN?.ApiAccess?.requestAccess;
      if (typeof fn === "function") {
        fn({ returnHash: "#docs", source, device });
        return;
      }
    } catch (err) {
      console.warn("[hero-device] requestAccess failed", err);
      // continue to fallback
    }

    // 2) Hash-based routing (shareable URLs)
    try {
      if (!isSameHash("#docs")) {
        window.location.hash = "#docs";
        return;
      }
    } catch (err) {
      console.warn("[hero-device] location.hash set failed", err);
    }

    // 3) If hash already #docs, hashchange won’t fire — force section injection
    safeShowDocs();
  }

  function setHandlers(next) {
    if (!next || typeof next !== "object") return;
    state.handlers = { ...state.handlers, ...next };
  }

  // defaults (these will navigate, not just log)
  state.handlers = {
    android: ({ device }) => {
      console.log("[hero-device] android clicked");
      routeToDocs({ source: "hero_device", device });
      return false;
    },
    mac: ({ device }) => {
      console.log("[hero-device] mac clicked");
      routeToDocs({ source: "hero_device", device });
      return false;
    },
    iphone: ({ device }) => {
      console.log("[hero-device] iphone clicked");
      routeToDocs({ source: "hero_device", device });
      return false;
    },
  };

  function isOpen(root) {
    return root?.classList?.contains("is-open");
  }
  function open(root) {
    if (!root) return;
    root.classList.add("is-open");
    const panel = root.querySelector("[data-hdl-panel]");
    if (panel) panel.setAttribute("aria-hidden", "false");
  }
  function close(root) {
    if (!root) return;
    root.classList.remove("is-open");
    const panel = root.querySelector("[data-hdl-panel]");
    if (panel) panel.setAttribute("aria-hidden", "true");
  }
  function toggle(root) {
    if (!root) return;
    if (isOpen(root)) close(root);
    else open(root);
  }

  function init(rootEl = document) {
    const root = rootEl.querySelector("[data-hdl-root]") || rootEl;
    if (!root || root.__hdlWired) return;
    root.__hdlWired = true;

    const hero = document.querySelector("section.hero");
    const trigger = document.querySelector("[data-hdl-trigger]");

    // Keep open when hovering the trigger region OR the panel itself
    const hoverTargets = [trigger, root].filter(Boolean);

    hoverTargets.forEach((el) => {
      el.addEventListener("mouseenter", () => open(root));
      el.addEventListener("mouseleave", () => close(root));
    });

    // Click/tap anywhere in the trigger region toggles (mobile + desktop)
    if (trigger) {
      trigger.style.cursor = "pointer";

      trigger.addEventListener("click", (e) => {
        e.preventDefault?.();
        e.stopPropagation?.();
        toggle(root);
      });

      // Keyboard accessibility (Enter/Space)
      trigger.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault?.();
          e.stopPropagation?.();
          toggle(root);
        }
      });
    }

    // ESC closes
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") close(root);
      },
      { passive: true }
    );

    // Click handlers for icons
    root.querySelectorAll(".hdl-btn[data-device]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // Always prevent default because we route intentionally (and may gate)
        e.preventDefault?.();
        e.stopPropagation?.();

        const key = String(btn.getAttribute("data-device") || "").trim();
        const fn = state.handlers[key];

        const before = String(window.location.hash || "");
        let handlerResult;

        try {
          if (typeof fn === "function") {
            handlerResult = fn({ device: key, btn, event: e });
          }
        } catch (err) {
          console.warn("[hero-device] handler failed", { key, err });
        }

        // If the handler didn't explicitly suppress default navigation,
        // and we haven't navigated anywhere, do the safe docs route fallback.
        const after = String(window.location.hash || "");
        const navigated = before !== after;

        if (handlerResult !== false && !navigated) {
          routeToDocs({ source: "hero_device", device: key });
        }

        // close after selection (nice UX)
        close(root);
      });
    });

    // If user clicks anywhere outside the hero, close it
    document.addEventListener("click", (e) => {
      const t = e.target;
      const clickedInHero = !!(hero && hero.contains(t));
      const clickedInPanel = !!(root && root.contains(t));
      if (!clickedInHero && !clickedInPanel) close(root);
    });
  }

  async function loadHeroDeviceLauncher(mountSelector = "#hero-device-launcher-mount") {
    const mount = document.querySelector(mountSelector);
    if (!mount) return;

    try {
      const resp = await fetch("components/hero-device-launcher/hero-device-launcher.html", {
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} loading hero-device-launcher.html`);
      mount.innerHTML = await resp.text();
      init(mount);
    } catch (err) {
      console.warn("[hero-device] failed to load", err);
    }
  }

  NS.HeroDeviceLauncher = {
    init,
    load: loadHeroDeviceLauncher,
    setHandlers,
    routeToDocs,
  };
  NS.loadHeroDeviceLauncher = loadHeroDeviceLauncher;
})();