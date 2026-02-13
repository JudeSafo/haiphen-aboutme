// ---------------------------------------------------------------------------
// SendGrid daily usage digest — sends jude@haiphen.io a snapshot of
// CF usage, quota, rate limits, failover status, and watchdog health.
// ---------------------------------------------------------------------------

import type { Env, WatchdogState } from "./index";
import type { ResourceKey, ResourceUsage, UsageMap } from "./thresholds";
import { CF_LIMITS } from "./thresholds";

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";

// ---------------------------------------------------------------------------
// Human-readable resource labels
// ---------------------------------------------------------------------------

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  workerRequests: "Worker Requests",
  d1RowsRead:    "D1 Rows Read",
  d1RowsWritten: "D1 Rows Written",
  kvReads:       "KV Reads",
  kvWrites:      "KV Writes",
  doRequests:    "DO Requests",
};

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return n.toFixed(1) + "%";
}

function levelEmoji(level: string): string {
  switch (level) {
    case "critical": return "CRITICAL";
    case "failover": return "FAILOVER";
    case "warning":  return "WARNING";
    default:         return "NORMAL";
  }
}

function levelColor(level: string): string {
  switch (level) {
    case "critical": return "#ef4444";
    case "failover": return "#F59E0B";
    case "warning":  return "#F59E0B";
    default:         return "#10B981";
  }
}

function barColor(pct: number): string {
  if (pct >= 80) return "#ef4444";
  if (pct >= 60) return "#F59E0B";
  return "#5A9BD4";
}

// ---------------------------------------------------------------------------
// Build dynamic template data for SendGrid
// ---------------------------------------------------------------------------

export interface DigestTemplateData {
  date_label: string;
  month_label: string;
  level: string;
  level_color: string;
  days_remaining: number;
  resources: Array<{
    label: string;
    current: string;
    limit: string;
    pct: string;
    pct_num: number;
    bar_color: string;
  }>;
  failedOver: string[];
  has_failovers: boolean;
  routing: Array<{
    worker: string;
    target: string;
    since: string;
  }>;
  watchdog_url: string;
  manage_url: string;
  fetch_errors: string[];
  has_errors: boolean;
}

export function buildDigestData(state: WatchdogState): DigestTemplateData {
  const now = new Date();
  const dateLabel = now.toISOString().split("T")[0];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabel = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  // Days remaining in billing month
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysRemaining = Math.ceil((nextMonth.getTime() - now.getTime()) / 86_400_000);

  // Build resource rows
  const resources = (Object.keys(CF_LIMITS) as ResourceKey[]).map(key => {
    const data: ResourceUsage = state.usage?.[key] ?? { current: 0, limit: CF_LIMITS[key], pct: 0 };
    return {
      label:     RESOURCE_LABELS[key],
      current:   fmt(data.current),
      limit:     fmt(data.limit),
      pct:       fmtPct(data.pct),
      pct_num:   Math.min(data.pct, 100),
      bar_color: barColor(data.pct),
    };
  });

  // Build routing rows
  const routing = Object.entries(state.routing ?? {}).map(([worker, record]) => ({
    worker,
    target: record.gcpTarget,
    since:  record.failedAt?.split("T")[0] ?? "—",
  }));

  // Collect any fetch errors from the last usage check
  const fetchErrors: string[] = (state as any).lastErrors ?? [];

  return {
    date_label:     dateLabel,
    month_label:    monthLabel,
    level:          levelEmoji(state.level),
    level_color:    levelColor(state.level),
    days_remaining: daysRemaining,
    resources,
    failedOver:     state.failedOver ?? [],
    has_failovers:  (state.failedOver?.length ?? 0) > 0,
    routing,
    watchdog_url:   "https://haiphen.io/#watchdog",
    manage_url:     "https://haiphen.io/#profile",
    fetch_errors:   fetchErrors,
    has_errors:     fetchErrors.length > 0,
  };
}

// ---------------------------------------------------------------------------
// SendGrid send
// ---------------------------------------------------------------------------

interface SendResult {
  ok: boolean;
  status: number;
  messageId?: string | null;
}

export async function sendDigestEmail(
  env: Env,
  state: WatchdogState,
): Promise<SendResult> {
  const templateData = buildDigestData(state);

  // If we have a SendGrid template ID, use dynamic template
  // Otherwise fall back to inline HTML
  const useTemplate = !!env.WATCHDOG_DIGEST_TEMPLATE_ID;

  const body: Record<string, unknown> = {
    from: {
      email: env.DIGEST_FROM_EMAIL || "jude@haiphen.io",
      name:  env.DIGEST_FROM_NAME || "Haiphen Watchdog",
    },
    personalizations: [{
      to: [{ email: env.DIGEST_TO_EMAIL || "jude@haiphen.io" }],
      ...(useTemplate
        ? { dynamic_template_data: templateData }
        : { subject: `Haiphen Watchdog — ${templateData.date_label} [${templateData.level}]` }),
    }],
  };

  if (useTemplate) {
    body.template_id = env.WATCHDOG_DIGEST_TEMPLATE_ID;
  } else {
    body.subject = `Haiphen Watchdog — ${templateData.date_label} [${templateData.level}]`;
    body.content = [{
      type: "text/html",
      value: buildInlineHtml(templateData),
    }];
  }

  const res = await fetch(SENDGRID_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const messageId = res.headers.get("x-message-id");

  if (!res.ok) {
    const details = await res.json().catch(() => null);
    console.error("[watchdog-email] SendGrid error:", res.status, details);
    return { ok: false, status: res.status, messageId };
  }

  return { ok: true, status: res.status, messageId };
}

// ---------------------------------------------------------------------------
// Inline HTML fallback (used when no SendGrid template ID is configured)
// ---------------------------------------------------------------------------

function buildInlineHtml(data: DigestTemplateData): string {
  const resourceRows = data.resources.map(r => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#556;border-top:1px solid #eef2f7;">${r.label}</td>
      <td style="padding:8px 0;font-size:13px;color:#2c3e50;font-weight:700;text-align:right;border-top:1px solid #eef2f7;">${r.current}</td>
      <td style="padding:8px 0;font-size:13px;color:#667;text-align:right;border-top:1px solid #eef2f7;">${r.limit}</td>
      <td style="padding:8px 12px;border-top:1px solid #eef2f7;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="background-color:#e6ecf3;border-radius:4px;height:8px;padding:0;">
            <div style="background-color:${r.bar_color};border-radius:4px;height:8px;width:${r.pct_num}%;max-width:100%;"></div>
          </td></tr>
        </table>
      </td>
      <td style="padding:8px 0;font-size:13px;font-weight:800;color:${r.bar_color};text-align:right;border-top:1px solid #eef2f7;white-space:nowrap;">${r.pct}</td>
    </tr>`).join("");

  const errorSection = data.has_errors
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;margin-top:20px;">
         <div style="font-size:13px;font-weight:900;color:#991b1b;margin-bottom:8px;">⚠ Data Collection Errors (${data.fetch_errors.length})</div>
         <div style="font-size:12px;color:#7f1d1d;line-height:1.6;">
           Usage values of 0 above may be inaccurate. The following queries failed:
         </div>
         <ul style="margin:8px 0 0;padding-left:18px;">
           ${data.fetch_errors.map(e => `<li style="font-size:11px;color:#991b1b;font-family:monospace;margin-bottom:4px;">${e}</li>`).join("")}
         </ul>
         <div style="font-size:11px;color:#991b1b;margin-top:8px;">
           Check: <code style="background:#fecaca;padding:1px 4px;border-radius:3px;">wrangler secret list -n haiphen-watchdog</code> to verify CF_API_TOKEN is set.
         </div>
       </div>`
    : "";

  const failoverSection = data.has_failovers
    ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-top:20px;">
         <div style="font-size:13px;font-weight:900;color:#92400e;margin-bottom:10px;">Active Failovers (${data.failedOver.length})</div>
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
           <tr>
             <td style="padding:6px 0;font-size:12px;color:#92400e;font-weight:700;">Worker</td>
             <td style="padding:6px 0;font-size:12px;color:#92400e;font-weight:700;">GCP Target</td>
             <td style="padding:6px 0;font-size:12px;color:#92400e;font-weight:700;text-align:right;">Since</td>
           </tr>
           ${data.routing.map(r => `
           <tr>
             <td style="padding:5px 0;font-size:12px;color:#2c3e50;border-top:1px solid #fde68a;font-family:monospace;">${r.worker}</td>
             <td style="padding:5px 0;font-size:12px;color:#556;border-top:1px solid #fde68a;font-family:monospace;">${r.target}</td>
             <td style="padding:5px 0;font-size:12px;color:#667;border-top:1px solid #fde68a;text-align:right;">${r.since}</td>
           </tr>`).join("")}
         </table>
       </div>`
    : `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px 14px;margin-top:20px;">
         <div style="font-size:13px;font-weight:700;color:#065f46;">All workers running on Cloudflare — no active failovers</div>
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Haiphen Watchdog Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f8fb;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <div style="display:none;font-size:1px;color:#f6f8fb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    CF usage: ${data.resources.map(r => r.label + " " + r.pct).join(", ")} — Status: ${data.level}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f6f8fb;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e6ecf3;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:22px 28px 14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <div style="font-weight:900;font-size:18px;color:#2c3e50;line-height:1.3;">Haiphen Watchdog</div>
                    <div style="font-size:12px;color:#667;line-height:1.4;margin-top:2px;">Daily CF usage &bull; quota &bull; failover status</div>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <div style="display:inline-block;background-color:${data.level_color};color:#ffffff;font-size:11px;font-weight:900;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;">${data.level}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="padding:0 28px;"><div style="height:1px;background:#e6ecf3;"></div></td></tr>

          <!-- Date + billing context -->
          <tr>
            <td style="padding:14px 28px 10px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:14px;color:#2c3e50;font-weight:700;">${data.date_label}</td>
                  <td style="font-size:13px;color:#667;text-align:right;">
                    Billing: <strong style="color:#5A9BD4;">${data.month_label}</strong> &bull;
                    <strong>${data.days_remaining}</strong> days left
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Usage table -->
          <tr>
            <td style="padding:10px 28px 18px;">
              <div style="background:#fbfcfe;border:1px solid #e6ecf3;border-radius:12px;padding:14px;overflow-x:auto;">
                <div style="font-size:13px;font-weight:900;color:#2c3e50;margin-bottom:10px;">Resource Usage — $5/mo Workers Paid</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:6px 0;font-size:11px;color:#667;font-weight:700;">Resource</td>
                    <td style="padding:6px 0;font-size:11px;color:#667;font-weight:700;text-align:right;">Used</td>
                    <td style="padding:6px 0;font-size:11px;color:#667;font-weight:700;text-align:right;">Limit</td>
                    <td style="padding:6px 12px;font-size:11px;color:#667;font-weight:700;width:80px;"></td>
                    <td style="padding:6px 0;font-size:11px;color:#667;font-weight:700;text-align:right;">%</td>
                  </tr>
                  ${resourceRows}
                </table>
              </div>
            </td>
          </tr>

          <!-- Data collection errors (if any) -->
          ${errorSection ? `<tr><td style="padding:0 28px 10px;">${errorSection}</td></tr>` : ""}

          <!-- Failover status -->
          <tr>
            <td style="padding:0 28px 20px;">
              ${failoverSection}
            </td>
          </tr>

          <!-- Quick actions -->
          <tr>
            <td style="padding:0 28px 22px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-right:8px;">
                    <a href="https://dash.cloudflare.com" style="display:inline-block;background-color:#5A9BD4;color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;padding:10px 20px;border-radius:10px;">CF Dashboard</a>
                  </td>
                  <td align="center" style="padding-left:8px;">
                    <a href="https://console.cloud.google.com" style="display:inline-block;background-color:#2c3e50;color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;padding:10px 20px;border-radius:10px;">GCP Console</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr><td style="padding:0 28px;"><div style="height:1px;background:#e6ecf3;"></div></td></tr>
          <tr>
            <td style="padding:18px 28px 22px;">
              <p style="margin:0 0 6px;font-size:11px;color:#778;line-height:1.5;text-align:center;">
                Haiphen Watchdog &bull; Automated daily digest &bull; <a href="mailto:pi@haiphenai.com" style="color:#778;text-decoration:none;">pi@haiphenai.com</a>
              </p>
              <p style="margin:0;font-size:11px;color:#778;line-height:1.5;text-align:center;">
                Disable this digest by removing <code style="background:#eef2f7;padding:1px 4px;border-radius:3px;">SENDGRID_API_KEY</code> from the watchdog worker.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
