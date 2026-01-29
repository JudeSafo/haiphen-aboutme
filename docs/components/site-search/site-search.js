/* docs/components/site-search/site-search.js
 * Lightweight command-palette navigation (not a crawler/search engine).
 * - Click 🔍 (right of login) or Ctrl+K or '/' to open.
 * - Filter through a curated index (plus registered sub-indexes).
 * - Navigate via showSection(section) + scroll to #elementId.
 */
(function () {
  "use strict";

  const CSS_HREF = "components/site-search/site-search.css";

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function normalize(s) {
    return String(s || "").trim().toLowerCase();
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;

    link.addEventListener("error", () => {
      console.warn("[site-search] failed to load css:", href);
    });

    document.head.appendChild(link);
  }

  function isTypingContext(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  // Prefer your existing helper if present, else do a safe offset scroll
  function scrollToIdWithHeaderOffset(elementId) {
    const el = byId(elementId);
    if (!el) return false;

    if (typeof window.scrollToWithHeaderOffset === "function") {
      window.scrollToWithHeaderOffset(el, 12);
      return true;
    }

    const header =
      qs(".site-header") ||
      qs("#site-header .site-header") ||
      qs("nav.navbar");

    const headerH = header?.getBoundingClientRect().height || 70;
    const y = window.scrollY + el.getBoundingClientRect().top - headerH - 12;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    return true;
  }

  function scoreMatch(item, q) {
    const qq = normalize(q);
    if (!qq) return 1;

    const label = normalize(item.label);
    const kws = (item.keywords || []).map(normalize);

    // Simple scoring (fast, predictable)
    if (label.startsWith(qq)) return 120;
    if (label.includes(qq)) return 80;
    if (kws.some((k) => k.startsWith(qq))) return 55;
    if (kws.some((k) => k.includes(qq))) return 30;

    return 0;
  }

  function ensureOverlay() {
    let overlay = byId("site-search-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "site-search-overlay";
    overlay.className = "site-search__overlay";
    overlay.innerHTML = `
      <div class="site-search__modal" role="dialog" aria-modal="true" aria-label="Site search">
        <div class="site-search__top">
          <input id="site-search-input" class="site-search__input" type="search" placeholder="Search… (Enter to jump)" autocomplete="off" />
          <span class="site-search__kbd" aria-hidden="true">Esc</span>
        </div>
        <div id="site-search-results" class="site-search__results" role="listbox" aria-label="Search results"></div>
      </div>
    `;

    // Click outside closes
    overlay.addEventListener("mousedown", (e) => {
      const modal = overlay.querySelector(".site-search__modal");
      if (modal && !modal.contains(e.target)) closeOverlay();
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  // -------- Index storage + registration API --------

  const state = {
    open: false,
    activePos: 0,
    // this is the working index; site-search-index.js can seed it
    index: [],
    // registered entries accumulate here (for component sub-indexes)
    registered: [],
  };

  function setIndex(entries) {
    state.index = Array.isArray(entries) ? entries.slice() : [];
  }

  function register(entries) {
    const list = Array.isArray(entries) ? entries : [];
    state.registered.push(...list);
  }

  // Merge base + registered; de-dupe by stable key
  function mergedIndex() {
    const all = [...state.index, ...state.registered];
    const seen = new Set();
    const out = [];

    for (const it of all) {
      const key = `${it.section || ""}|${it.elementId || ""}|${it.hash || ""}|${it.label || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }

  // -------- Rendering + navigation --------

  function renderResults(results, q) {
    const root = byId("site-search-results");
    if (!root) return;

    if (!results.length) {
      root.innerHTML = `<div class="site-search__empty">No matches for “${escapeHtml(q)}”.</div>`;
      return;
    }

    root.innerHTML = results
      .map((it, i) => {
        const meta =
          it.section ? `Section: ${it.section}${it.elementId ? ` • #${it.elementId}` : ""}` :
          it.hash ? `#${it.hash}` :
          it.elementId ? `#${it.elementId}` :
          "";

        const cls = i === state.activePos ? "site-search__item is-active" : "site-search__item";
        return `
          <div class="${cls}" role="option" aria-selected="${i === state.activePos ? "true" : "false"}" data-idx="${i}">
            <div class="site-search__label">${escapeHtml(it.label)}</div>
            <div class="site-search__meta">${escapeHtml(meta)}</div>
          </div>
        `;
      })
      .join("");

    root.querySelectorAll(".site-search__item").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const idx = Number(el.getAttribute("data-idx") || "0");
        state.activePos = Number.isFinite(idx) ? idx : 0;
        const input = byId("site-search-input");
        updateFromQuery(input ? input.value : "");
      });

      el.addEventListener("click", () => {
        const idx = Number(el.getAttribute("data-idx") || "0");
        const target = results[idx];
        if (target) navigateTo(target);
      });
    });
  }

  function updateFromQuery(q) {
    const all = mergedIndex();

    const scored = all
      .map((it) => ({ it, s: scoreMatch(it, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.it.label.localeCompare(b.it.label))
      .map((x) => x.it);

    state.activePos = Math.max(0, Math.min(state.activePos, Math.max(0, scored.length - 1)));
    renderResults(scored, q);
    return scored;
  }

  function openOverlay() {
    injectCssOnce(CSS_HREF);
    ensureOverlay();

    const overlay = byId("site-search-overlay");
    const input = byId("site-search-input");
    if (!overlay || !input) return;

    overlay.classList.add("is-open");
    overlay.style.display = "flex"; // ✅ failsafe: always visible
    state.open = true;
    state.activePos = 0;

    input.value = "";
    updateFromQuery("");

    setTimeout(() => input.focus(), 0);
  }

  function closeOverlay() {
    const overlay = byId("site-search-overlay");
    if (overlay) {
      overlay.classList.remove("is-open");
      overlay.style.display = "none"; // ✅ failsafe
    }
    state.open = false;
    state.activePos = 0;
  }

  function navigateTo(entry) {
    closeOverlay();

    // Preferred: use your hash router (shareable + consistent)
    if (entry.section && typeof window.setHashForSection === "function") {
      const sub = entry.elementId || entry.hash || "";
      window.setHashForSection(entry.section, sub);
      return;
    }

    // inside navigateTo(entry), in the "Fallback: direct section + scroll" branch:
    if (entry.section && typeof window.showSection === "function") {
      window.showSection(entry.section);

      // Wait for the element to exist (in injected content), then scroll
      if (entry.elementId && typeof window.scrollToIdWhenReady === 'function') {
        window.scrollToIdWhenReady(entry.elementId, { maxAttempts: 80, delayMs: 50, extra: 12 });
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (entry.elementId && scrollToIdWithHeaderOffset(entry.elementId)) return;
          if (entry.hash) window.location.hash = `#${entry.hash}`;
        });
      });
      return;
    }

    // Last resort: hash/scroll only
    if (entry.hash) {
      window.location.hash = `#${entry.hash}`;
      return;
    }
    if (entry.elementId) scrollToIdWithHeaderOffset(entry.elementId);
  }

  function navigateTo(entry) {
    closeOverlay();

    const sub = entry.elementId || entry.hash || "";

    // 1) Imperative navigation first (gives immediate UI response)
    if (entry.section && typeof window.showSection === "function") {
      window.showSection(entry.section);

      // Try to scroll once the element exists; retry briefly for async mounts
      if (entry.elementId) {
        const id = entry.elementId;
        let tries = 0;
        const maxTries = 80;

        const tick = () => {
          tries++;
          const ok = typeof window.scrollToIdSmart === 'function'
            ? window.scrollToIdSmart(id, 12)
            : scrollToIdWithHeaderOffset(id);

          if (ok) return;
          if (tries >= maxTries) return;
          setTimeout(tick, 50);
        };

        tick();
      }

      // 2) Update hash for shareability after UI is already moving
      if (typeof window.setHashForSection === "function") {
        window.setHashForSection(entry.section, sub);
      }

      return;
    }

    // Fallbacks (if showSection isn't available)
    if (entry.section && typeof window.setHashForSection === "function") {
      window.setHashForSection(entry.section, sub);
      return;
    }

    if (entry.hash) {
      window.location.hash = `#${entry.hash}`;
      return;
    }
    if (entry.elementId) scrollToIdWithHeaderOffset(entry.elementId);
  }

  function wireOverlayInputs() {
    const input = byId("site-search-input");
    if (!input || input.__wired) return;
    input.__wired = true;

    input.addEventListener("input", () => {
      state.activePos = 0;
      updateFromQuery(input.value);
    });

    input.addEventListener("keydown", (e) => {
      const results = updateFromQuery(input.value);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.activePos = Math.min(state.activePos + 1, Math.max(0, results.length - 1));
        updateFromQuery(input.value);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        state.activePos = Math.max(0, state.activePos - 1);
        updateFromQuery(input.value);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = results[state.activePos];
        if (target) navigateTo(target);
      }
    });
  }

  function wireGlobalShortcuts() {
    if (window.__haiphenSiteSearchShortcuts) return;
    window.__haiphenSiteSearchShortcuts = true;

    window.addEventListener("keydown", (e) => {
      const active = document.activeElement;

      // Esc closes
      if (state.open && e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
        return;
      }

      // Ctrl+K / Cmd+K opens
      const isK = (e.key || "").toLowerCase() === "k";
      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        openOverlay();
        wireOverlayInputs();
        return;
      }

      // '/' opens (unless typing)
      if (!e.ctrlKey && !e.metaKey && e.key === "/" && !isTypingContext(active)) {
        e.preventDefault();
        openOverlay();
        wireOverlayInputs();
        return;
      }
    });
  }

  function wireHeaderButton() {
    const btn = byId("site-search-btn");
    if (!btn || btn.__wired) return;
    btn.__wired = true;

    btn.addEventListener("click", () => {
      openOverlay();
      wireOverlayInputs();
    });
  }

  function bindWhenHeaderReady() {
    // Try immediately (in case header is already there)
    wireHeaderButton();

    // Then listen for header ready event
    window.addEventListener("haiphen:header:ready", () => {
      wireHeaderButton();
    }, { once: false });
  }

  function bindHeaderButton() {
    wireHeaderButton();
    window.addEventListener("haiphen:header:ready", wireHeaderButton);
  }

  async function loadSiteSearch() {
    injectCssOnce(CSS_HREF);
    ensureOverlay();
    wireGlobalShortcuts();
    wireOverlayInputs();
    bindHeaderButton();
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSiteSearch = loadSiteSearch;

  // Expose a small public API for index seeding + sub-index registration
  window.HAIPHEN.SiteSearch = {
    setIndex,
    register,
    open: openOverlay,
    close: closeOverlay,
  };
})();