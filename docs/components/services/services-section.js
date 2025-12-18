/* global window, document, fetch */
(function () {
  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const CSS_ID = "services-section-css";

  async function fetchText(url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  function ensureCss(href) {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  NS.loadServicesSection = async function loadServicesSection() {
    const mount = document.getElementById("services-section-mount");
    if (!mount) return;

    try {
      ensureCss("components/services/services-section.css");
      const html = await fetchText("components/services/services-section.html");
      mount.innerHTML = html;
    } catch (err) {
      console.warn("[services-section] failed to load", err);
      mount.innerHTML = `
        <div style="padding:1rem;border:1px solid #e6ecf3;border-radius:12px;background:#fff;">
          <strong>Services section failed to load.</strong>
          <div style="margin-top:.35rem;color:#667;">Check console for details.</div>
        </div>
      `;
    }
  };
})();