/* docs/components/theme-toggle/theme-toggle.js */
(function () {
  "use strict";

  const STORAGE_KEY = "haiphen.theme";
  const THEME_ATTR = "data-theme";
  const MODE_ATTR = "data-theme-mode";
  const CSS_HREF = "components/theme-toggle/theme-toggle.css";
  const MOUNT_ID = "theme-toggle-mount";
  const COMPONENT_ID = "theme-toggle";
  const ROOT = document.documentElement;

  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let currentMode = normalizeMode(readStorage() || "system");

  function normalizeMode(mode) {
    return mode === "light" || mode === "dark" || mode === "system" ? mode : "system";
  }

  function readStorage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_err) {
      return null;
    }
  }

  function writeStorage(value) {
    try {
      if (!value) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch (_err) {
      // ignore storage failures
    }
  }

  function resolveTheme(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    return media && media.matches ? "dark" : "light";
  }

  function applyTheme(mode) {
    const resolved = resolveTheme(mode);
    if (resolved === "dark") ROOT.setAttribute(THEME_ATTR, "dark");
    else ROOT.removeAttribute(THEME_ATTR);
    ROOT.setAttribute(MODE_ATTR, mode);
    return resolved;
  }

  function emitTheme(mode, resolved) {
    window.dispatchEvent(new CustomEvent("haiphen:theme", {
      detail: { mode, resolved }
    }));
  }

  function setTheme(mode) {
    const normalized = normalizeMode(mode);
    currentMode = normalized;

    if (normalized === "system") writeStorage(null);
    else writeStorage(normalized);

    const resolved = applyTheme(normalized);
    emitTheme(normalized, resolved);
    return resolved;
  }

  function getTheme() {
    return currentMode || "system";
  }

  function toggleTheme() {
    const currentResolved = resolveTheme(getTheme());
    const next = currentResolved === "dark" ? "light" : "dark";
    return setTheme(next);
  }

  function initTheme() {
    const resolved = applyTheme(currentMode);
    requestAnimationFrame(() => {
      ROOT.classList.add("theme-anim");
    });
    emitTheme(currentMode, resolved);
  }

  function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  function wireToggle(root) {
    const btn = root.querySelector(".theme-toggle__btn");
    if (!btn) return;

    const sync = () => {
      const mode = getTheme();
      const resolved = resolveTheme(mode);
      const label = resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
      btn.setAttribute("data-theme-resolved", resolved);
      btn.setAttribute("data-theme-mode", mode);
    };

    btn.addEventListener("click", () => {
      toggleTheme();
      sync();
    });

    window.addEventListener("haiphen:theme", sync);
    sync();
  }

  async function loadThemeToggle() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    if (document.getElementById(COMPONENT_ID)) return;

    injectCssOnce(CSS_HREF);
    const html = await fetchText("components/theme-toggle/theme-toggle.html");
    mount.innerHTML = `<div id="${COMPONENT_ID}">${html}</div>`;

    wireToggle(mount);
  }

  if (media && typeof media.addEventListener === "function") {
    media.addEventListener("change", () => {
      if (getTheme() === "system") {
        const resolved = applyTheme("system");
        emitTheme("system", resolved);
      }
    });
  } else if (media && typeof media.addListener === "function") {
    media.addListener(() => {
      if (getTheme() === "system") {
        const resolved = applyTheme("system");
        emitTheme("system", resolved);
      }
    });
  }

  initTheme();

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.theme = {
    get: getTheme,
    set: setTheme,
    toggle: toggleTheme
  };
  window.HAIPHEN.loadThemeToggle = loadThemeToggle;
})();
