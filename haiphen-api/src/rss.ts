type DailyMetricRow = { kpi: string; value: string };
type DailyMetrics = {
  date: string;
  updated_at: string;
  headline: string;
  summary: string;
  rows: DailyMetricRow[];
  overlay: unknown;
};

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildRss(d: DailyMetrics): string {
  const title = `Haiphen Trading Metrics — ${d.date}`;
  const link = `https://haiphen.io/docs/#docs:metrics-daily`;
  const guid = `haiphen-metrics:${d.date}`;

  const rows = d.rows
    .map(r => `<li><strong>${esc(r.kpi)}:</strong> ${esc(r.value)}</li>`)
    .join("");

  const desc = `
    <p>${esc(d.headline)}</p>
    <p>${esc(d.summary)}</p>
    <ul>${rows}</ul>
  `.trim();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc("Haiphen Trading Metrics")}</title>
    <link>${esc(link)}</link>
    <description>${esc("Daily high-frequency execution telemetry, delivered as RSS.")}</description>
    <language>en-us</language>

    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(guid)}</guid>
      <pubDate>${esc(new Date(d.updated_at).toUTCString())}</pubDate>
      <description><![CDATA[${desc}]]></description>
    </item>
  </channel>
</rss>`;
}