import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();
const DEFAULT_LOGOUT_REDIRECT = 'https://haiphen.io/';

/* ── IP-based rate limiter (in-memory, per-isolate) ── */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_LOGIN = 10;     // 10 login attempts per minute per IP
const RATE_LIMIT_MAX_CALLBACK = 20;  // 20 callback attempts per minute per IP
const _rl = new Map();

function rateLimit(ip, bucket, max) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  let entry = _rl.get(key);
  if (!entry || now - entry.ts > RATE_LIMIT_WINDOW_MS) {
    entry = { ts: now, count: 0 };
  }
  entry.count++;
  _rl.set(key, entry);
  // Lazy cleanup: prune stale entries every 100 calls
  if (_rl.size > 500) {
    for (const [k, v] of _rl) {
      if (now - v.ts > RATE_LIMIT_WINDOW_MS) _rl.delete(k);
    }
  }
  return entry.count > max;
}

/**
 * Utility: CORS headers
 */
function safeReturnTo(raw) {
  const fallback = DEFAULT_LOGOUT_REDIRECT;
  if (!raw) return fallback;
  try {
    const cand = decodeURIComponent(String(raw));
    // keep it tight: must be https and under haiphen.io
    if (/^https:\/\/[^ ]+haiphen\.io(\/|$)/i.test(cand)) return cand;
  } catch (_) {}
  return fallback;
}

function shouldRedirectToHtml(req) {
  // Navigation to /logout should redirect; fetch() calls should not force a top-level nav.
  const dest = (req.headers.get('Sec-Fetch-Dest') || '').toLowerCase();
  const mode = (req.headers.get('Sec-Fetch-Mode') || '').toLowerCase();
  const accept = (req.headers.get('Accept') || '').toLowerCase();
  return dest === 'document' || mode === 'navigate' || accept.includes('text/html');
}

function corsHeaders(origin) {
  // allow only these sites; expand if needed
  const allowedOrigins = [
    'https://haiphen.io',
    'https://www.haiphen.io',       // if you CNAME it
    'https://app.haiphen.io',
    'https://auth.haiphen.io',
    'https://contact.haiphen.io',
  ];
  // Allow localhost origins for local development
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    allowedOrigins.push(origin);
  }
  const o = allowedOrigins.includes(origin) ? origin : 'https://haiphen.io';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
  };
}

/**
 * Utility: small Response helpers
 */
function jsonResponse(obj, origin, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      ...corsHeaders(origin),
    },
  });
}

function textResponse(txt, origin, status = 200) {
  return new Response(txt, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...corsHeaders(origin),
    },
  });
}
function redirectResponse(url, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}

function buildAuthCookie(jwt, { maxAge = 60 * 60 * 24 * 7, clear = false } = {}) {
  // Use ".haiphen.io" to be unambiguous about subdomain scope.
  // Note: leading dot is optional per spec, but it avoids head-scratching.
  const domain = '.haiphen.io';

  const parts = [
    `auth=${clear ? '' : jwt}`,
    `Domain=${domain}`,
    'Path=/',
    `Max-Age=${clear ? 0 : maxAge}`,
    'HttpOnly',
    'Secure',

    // If you truly want the cookie sent in *all* contexts (including cross-site),
    // you need SameSite=None.
    'SameSite=None',
  ];

  return parts.join('; ');
}

/**
 * Parse cookie by key.
 */
function getCookieValue(header, key) {
  if (!header) return undefined;
  const parts = header.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === key) return rest.join('=');
  }
  return undefined;
}

/**
 * Exchange Google OAuth code for an access token.
 */
async function googleToken(code, clientId, clientSecret, redirectUri) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await tokenRes.json();
  console.log('google.token.exchange', { ok: tokenRes.ok, status: tokenRes.status });
  return data;
}

/**
 * Upsert user record in D1 during OAuth callback.
 * Returns { isNew } so caller can trigger first-login flows.
 * Best-effort: never block the login flow if DB write fails.
 */
async function ensureUserInDb(env, userLogin, name, email) {
  if (!env.DB) return { isNew: false };
  try {
    // Check if user already exists (for first-login detection)
    const existing = await env.DB.prepare(
      `SELECT user_login FROM users WHERE user_login = ?`
    ).bind(userLogin).first();
    const isNew = !existing;

    await env.DB.prepare(`
      INSERT INTO users(user_login, name, email, last_seen_at)
      VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(user_login) DO UPDATE SET
        name = COALESCE(excluded.name, users.name),
        email = COALESCE(excluded.email, users.email),
        last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).bind(userLogin, name || null, email || null).run();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO plans(user_login, plan, active) VALUES (?, 'free', 1)
    `).bind(userLogin).run();

    return { isNew };
  } catch (e) {
    console.error('ensureUserInDb failed (non-fatal):', e);
    return { isNew: false };
  }
}

/**
 * Send first-login notification emails:
 *  1) Admin alert to OWNER_EMAIL (jude@haiphen.io)
 *  2) Welcome email to the new user
 * Idempotent via welcome_emails table.
 */
async function sendFirstLoginEmails(env, userLogin, name, email, provider) {
  if (!env.SENDGRID_API_KEY || !env.DB) return;
  const ownerEmail = env.OWNER_EMAIL || 'jude@haiphen.io';
  const fromEmail = env.FROM_EMAIL || 'jude@haiphen.io';
  const fromName = env.FROM_NAME || 'Haiphen';

  try {
    // Idempotency check — skip if already sent
    const already = await env.DB.prepare(
      `SELECT sent_at FROM welcome_emails WHERE user_login = ? LIMIT 1`
    ).bind(userLogin).first();
    if (already) return;

    const now = new Date();
    const signupDate = now.toISOString().slice(0, 10);
    const signupTime = now.toISOString().slice(11, 19) + ' UTC';
    const outreachBy = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const displayName = name || userLogin;
    const displayEmail = email || '(none)';
    const providerLabel = (provider || 'github').charAt(0).toUpperCase()
      + (provider || 'github').slice(1);

    // ── 1) Admin notification to jude@haiphen.io ──
    const adminHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fb;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #e6ecf3;border-radius:16px;overflow:hidden;">

  <tr><td style="padding:22px 28px 14px;">
    <div style="font-weight:900;font-size:18px;color:#2c3e50;">New User Signup</div>
    <div style="font-size:12px;color:#667;margin-top:2px;">Haiphen &bull; ${signupDate}</div>
  </td></tr>

  <tr><td style="padding:0 28px;"><div style="height:1px;background:#e6ecf3;"></div></td></tr>

  <tr><td style="padding:14px 28px;">
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px 14px;">
      <div style="font-size:13px;font-weight:800;color:#065f46;">A new user just signed up via ${providerLabel}</div>
    </div>
  </td></tr>

  <tr><td style="padding:10px 28px 22px;">
    <div style="background:#fbfcfe;border:1px solid #e6ecf3;border-radius:12px;padding:14px;margin-bottom:16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#667;">Name</td>
          <td style="padding:7px 0;font-size:13px;color:#2c3e50;font-weight:700;text-align:right;">${escHtml(displayName)}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#667;border-top:1px solid #eef2f7;">Email</td>
          <td style="padding:7px 0;font-size:13px;color:#2c3e50;font-weight:700;text-align:right;">${escHtml(displayEmail)}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#667;border-top:1px solid #eef2f7;">User ID</td>
          <td style="padding:7px 0;font-size:13px;color:#2c3e50;font-weight:700;text-align:right;">${escHtml(userLogin)}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#667;border-top:1px solid #eef2f7;">Provider</td>
          <td style="padding:7px 0;font-size:13px;color:#5A9BD4;font-weight:700;text-align:right;">${providerLabel}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#667;border-top:1px solid #eef2f7;">Signed up</td>
          <td style="padding:7px 0;font-size:13px;color:#2c3e50;font-weight:700;text-align:right;">${signupDate} ${signupTime}</td>
        </tr>
      </table>
    </div>

    <div style="font-size:14px;font-weight:900;color:#2c3e50;margin-bottom:10px;">Suggested outreach</div>
    <div style="background:#fbfcfe;border:1px solid #e6ecf3;border-left:3px solid #5A9BD4;border-radius:12px;padding:14px;margin-bottom:16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:18px;">
            <div style="width:6px;height:6px;border-radius:50%;background:#5A9BD4;margin-top:6px;"></div>
          </td>
          <td style="padding:5px 0 5px 8px;font-size:13px;line-height:1.5;color:#556;">
            <strong style="color:#2c3e50;">Within 48 hours</strong> (by ${outreachBy}) &mdash; Send a personal welcome email introducing yourself and asking about their use case.
          </td>
        </tr>
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:18px;">
            <div style="width:6px;height:6px;border-radius:50%;background:#5A9BD4;margin-top:6px;"></div>
          </td>
          <td style="padding:5px 0 5px 8px;font-size:13px;line-height:1.5;color:#556;">
            <strong style="color:#2c3e50;">Day 3&ndash;5</strong> &mdash; Follow up with a quick demo link or schedule a 15-min call via your <a href="https://calendar.app.google/jQzWz98eCC5jMLrQA" style="color:#5A9BD4;text-decoration:none;font-weight:700;">booking calendar</a>.
          </td>
        </tr>
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:18px;">
            <div style="width:6px;height:6px;border-radius:50%;background:#5A9BD4;margin-top:6px;"></div>
          </td>
          <td style="padding:5px 0 5px 8px;font-size:13px;line-height:1.5;color:#556;">
            <strong style="color:#2c3e50;">Day 7</strong> &mdash; If no response, send a final nudge with a link to the cohort program or a relevant case study.
          </td>
        </tr>
      </table>
    </div>

    <div style="font-size:13px;color:#667;line-height:1.6;">
      Quick links:
      <a href="https://haiphen.io/#profile" style="color:#5A9BD4;text-decoration:none;font-weight:700;">User profile</a> &bull;
      <a href="https://haiphen.io/#docs" style="color:#5A9BD4;text-decoration:none;font-weight:700;">API docs</a> &bull;
      <a href="https://haiphen.io/#cohort" style="color:#5A9BD4;text-decoration:none;font-weight:700;">Cohort program</a>
    </div>
  </td></tr>

  <tr><td style="padding:0 28px;"><div style="height:1px;background:#e6ecf3;"></div></td></tr>
  <tr><td style="padding:14px 28px;text-align:center;">
    <div style="font-size:11px;color:#778;">Haiphen internal notification &bull; ${signupDate}</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

    await sgSend(env.SENDGRID_API_KEY, {
      from: { email: fromEmail, name: fromName },
      personalizations: [{
        to: [{ email: ownerEmail }],
        subject: `New signup: ${displayName} (${displayEmail}) via ${providerLabel}`,
      }],
      content: [
        { type: 'text/html', value: adminHtml },
      ],
    });
    console.log('[first-login] admin notification sent', { userLogin, email: ownerEmail });

    // ── 2) Welcome email to the new user ──
    if (email) {
      const userHtml = buildWelcomeHtml(displayName, userLogin, providerLabel);
      await sgSend(env.SENDGRID_API_KEY, {
        from: { email: fromEmail, name: fromName },
        personalizations: [{
          to: [{ email, name: displayName }],
          subject: 'Welcome to Haiphen',
        }],
        content: [
          { type: 'text/html', value: userHtml },
        ],
      });
      console.log('[first-login] welcome email sent', { userLogin, email });
    }

    // ── 3) Record in welcome_emails for idempotency ──
    await env.DB.prepare(
      `INSERT OR IGNORE INTO welcome_emails(user_login, sent_at, source, details_json)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'oauth_callback', ?)`
    ).bind(userLogin, JSON.stringify({ name, email, provider })).run();

  } catch (e) {
    console.error('[first-login] email send failed (non-fatal):', e);
  }
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildWelcomeHtml(name, userLogin, provider) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fb;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e6ecf3;border-radius:16px;overflow:hidden;">

  <tr><td style="padding:22px 28px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td align="left" style="vertical-align:middle;">
        <div style="font-weight:900;font-size:18px;color:#2c3e50;line-height:1.3;">Haiphen</div>
        <div style="font-size:12px;color:#667;line-height:1.4;margin-top:2px;">Signals intelligence &bull; automated trading telemetry &bull; API Everything &hearts;</div>
      </td>
      <td align="right" style="vertical-align:middle;">
        <a href="https://haiphen.io" style="font-size:12px;color:#5A9BD4;font-weight:700;text-decoration:none;">haiphen.io</a>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 28px;"><div style="height:1px;background:#e6ecf3;"></div></td></tr>

  <tr><td style="padding:14px 28px;">
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px 14px;">
      <div style="font-size:13px;font-weight:800;color:#065f46;">Welcome to Haiphen, ${escHtml(name)}!</div>
    </div>
  </td></tr>

  <tr><td style="padding:10px 28px 22px;">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2c3e50;font-weight:700;">
      Hi ${escHtml(name)},
    </p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#556;">
      Your account has been created. Here are a few things to get you started:
    </p>

    <div style="background:#fbfcfe;border:1px solid #e6ecf3;border-radius:12px;padding:14px;margin-bottom:20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:18px;">
            <div style="width:6px;height:6px;border-radius:50%;background:#10B981;margin-top:6px;"></div>
          </td>
          <td style="padding:5px 0 5px 8px;font-size:13px;line-height:1.5;color:#556;">
            <strong style="color:#2c3e50;">Explore the API docs</strong> &mdash; See endpoints, try live requests, and generate your API key.
          </td>
        </tr>
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:18px;">
            <div style="width:6px;height:6px;border-radius:50%;background:#10B981;margin-top:6px;"></div>
          </td>
          <td style="padding:5px 0 5px 8px;font-size:13px;line-height:1.5;color:#556;">
            <strong style="color:#2c3e50;">Set up your profile</strong> &mdash; Configure notification preferences and manage API keys.
          </td>
        </tr>
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:18px;">
            <div style="width:6px;height:6px;border-radius:50%;background:#10B981;margin-top:6px;"></div>
          </td>
          <td style="padding:5px 0 5px 8px;font-size:13px;line-height:1.5;color:#556;">
            <strong style="color:#2c3e50;">Join the cohort program</strong> &mdash; Connect with other users and get early access to new features.
          </td>
        </tr>
      </table>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="center">
          <a href="https://haiphen.io/#getting-started" style="display:inline-block;background-color:#5A9BD4;color:#ffffff;font-size:14px;font-weight:900;text-decoration:none;padding:12px 28px;border-radius:12px;">Get Started</a>
        </td>
      </tr>
    </table>

    <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#667;">
      Questions? Reply to this email or reach us at <a href="mailto:pi@haiphenai.com" style="color:#5A9BD4;text-decoration:none;font-weight:700;">pi@haiphenai.com</a>.
    </p>
  </td></tr>

  <tr><td style="padding:0 28px;"><div style="height:1px;background:#e6ecf3;"></div></td></tr>
  <tr><td style="padding:18px 28px 22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center">
      <p style="margin:0 0 6px;font-size:11px;color:#778;line-height:1.5;">
        Haiphen &bull; Manhattan, NY &bull; <a href="mailto:pi@haiphenai.com" style="color:#778;text-decoration:none;">pi@haiphenai.com</a> &bull; (512) 910-4544
      </p>
      <p style="margin:0;font-size:11px;color:#778;line-height:1.5;">
        You received this because you just signed up on <a href="https://haiphen.io" style="color:#5A9BD4;text-decoration:none;font-weight:700;">haiphen.io</a>.
      </p>
    </td></tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

async function sgSend(apiKey, body) {
  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error('[sgSend] failed', { status: resp.status, body: text });
  }
  return resp;
}


/**
 * Fetch Google user profile.
 */
async function googleUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Google userinfo ${res.status}`);
  return res.json();
}

/**
 * Exchange GitHub OAuth code for an access token.
 */
async function githubToken(code, clientId, clientSecret) {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  const text = await tokenRes.text();
  console.log('github.token.exchange', { ok: tokenRes.ok, status: tokenRes.status });
  const ct = tokenRes.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return JSON.parse(text);
  return Object.fromEntries(new URLSearchParams(text));
}

/**
 * Verify + return claims; enforce audience & revocation.
 */
async function getUserFromToken(token, jwtKey, env) {
  const { payload } = await jwtVerify(token, jwtKey, {
    audience: 'haiphen-auth',
  });

  // Revocation check — fail closed: reject tokens without jti or when KV is unbound
  if (!payload.jti) {
    throw new Error('Token missing jti claim');
  }
  if (!env.REVOKE_KV) {
    throw new Error('REVOKE_KV binding not available');
  }
  const revoked = await env.REVOKE_KV.get(`revoke:${payload.jti}`);
  if (revoked) throw new Error('Token revoked');

  return payload;
}

/**
 * Handle all requests to auth.haiphen.io
 */
async function handleAuth(req, env, jwtKey, ctx) {
  const origin = req.headers.get('Origin') || 'https://haiphen.io';
  const url = new URL(req.url);
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env;
  const callbackURL = 'https://auth.haiphen.io/callback';

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const clientIp = req.headers.get('CF-Connecting-IP') || 'unknown';

  // ---- /login ----
  if (url.pathname === '/login') {
    if (rateLimit(clientIp, 'login', RATE_LIMIT_MAX_LOGIN)) {
      return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }

    const toRaw =
      url.searchParams.get('to') ||
      url.searchParams.get('return_to') ||
      'https://haiphen.io/';

    const to = safeReturnToWithNative(toRaw);
    const provider = (url.searchParams.get('provider') || 'github').toLowerCase();

    // "native=1" tells auth to hand a token back to localhost callback.
    const native = url.searchParams.get('native') === '1' || isNativeReturnTo(to);

    // force=1 means "always run OAuth" (account switching)
    const force = url.searchParams.get('force') === '1';

    // If user already has a valid cookie, we usually skip OAuth.
    // BUT: for native flows we MUST include token in the redirect.
    if (!force) {
      const token = getCookieValue(req.headers.get('Cookie'), 'auth');
      if (token) {
        try {
          // Verify token is valid + not revoked
          await getUserFromToken(token, jwtKey, env);

          // Native handoff: redirect to localhost with ?token=...
          if (native && isNativeReturnTo(to)) {
            return redirectResponse(withTokenFragment(to, token));
          }

          // Normal browser redirect
          return redirectResponse(to);
        } catch (e) {
          console.warn('login: existing token invalid; continuing to OAuth');
        }
      }
    }

    if (provider === 'google') {
      // Google OAuth flow
      const googleRedirectUri = env.GOOGLE_REDIRECT_URI || 'https://auth.haiphen.io/callback/google';
      const state = encodeURIComponent(JSON.stringify({ to, provider: 'google' }));
      const googleUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(googleRedirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('openid email profile')}` +
        `&state=${state}` +
        `&access_type=online`;
      return redirectResponse(googleUrl);
    }

    // Default: GitHub OAuth flow
    const state = encodeURIComponent(to);
    const redirect = encodeURIComponent(callbackURL);
    const gh =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${GITHUB_CLIENT_ID}` +
      `&redirect_uri=${redirect}` +
      `&state=${state}`;

    return redirectResponse(gh);
  }

  // ---- /callback ----
  if (url.pathname === '/callback') {
    if (rateLimit(clientIp, 'callback', RATE_LIMIT_MAX_CALLBACK)) {
      return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }

    try {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state'); // encoded return URL
      if (!code) return textResponse('Missing code', origin, 400);

      const { access_token } = await githubToken(code, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET);
      if (!access_token) throw new Error('Missing access_token');

      // fetch user
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/json',
          'User-Agent': 'haiphen-auth-worker',
        },
      });
      const user = await userRes.json();
      console.log('🔍 GitHub user:', user.login);

      const now = Math.floor(Date.now() / 1000);
      const exp = now + 60 * 60 * 24 * 7; // 7d
      const jti = crypto.randomUUID();

      const jwt = await new SignJWT({
        sub: user.login,
        name: user.name,
        avatar: user.avatar_url,
        email: user.email,
        jti,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .setAudience('haiphen-auth')
        .sign(jwtKey);

      // Persist user in D1 + send first-login emails (best-effort, non-blocking)
      ctx.waitUntil((async () => {
        const { isNew } = await ensureUserInDb(env, user.login, user.name, user.email);
        if (isNew) await sendFirstLoginEmails(env, user.login, user.name, user.email, 'github');
      })());

      // wide cookie across *.haiphen.io
      const cookie = buildAuthCookie(jwt, { maxAge: 604800 });

      // Determine return URL (state carries return-to)
      let returnTo = safeReturnToWithNative(state ?? null);

      // If returning to localhost (native CLI), include token in query
      if (returnTo.startsWith('http://127.0.0.1') || returnTo.startsWith('http://localhost')) {
        const u = new URL(returnTo);
        // return token in fragment so it won't be sent as a request or stored in server logs
        u.hash = `token=${encodeURIComponent(jwt)}`;
        returnTo = u.toString();
      }

      return new Response(null, {
        status: 302,
        headers: {
          'Set-Cookie': cookie,
          Location: returnTo,
          ...corsHeaders(origin),
        },
      });
    } catch (err) {
      console.error('❌ Callback error:', err);
      return textResponse('Internal Error', origin, 500);
    }
  }

  // ---- /callback/google ----
  if (url.pathname === '/callback/google') {
    if (rateLimit(clientIp, 'callback', RATE_LIMIT_MAX_CALLBACK)) {
      return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }

    try {
      const code = url.searchParams.get('code');
      const stateRaw = url.searchParams.get('state');
      if (!code) return textResponse('Missing code', origin, 400);

      // Parse state to recover return URL
      let returnToFromState = 'https://haiphen.io/';
      try {
        const parsed = JSON.parse(decodeURIComponent(stateRaw || ''));
        if (parsed?.to) returnToFromState = parsed.to;
      } catch {
        // state might be a plain URL (fallback)
        if (stateRaw) returnToFromState = decodeURIComponent(stateRaw);
      }

      const googleRedirectUri = env.GOOGLE_REDIRECT_URI || 'https://auth.haiphen.io/callback/google';
      const tokenData = await googleToken(code, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, googleRedirectUri);
      if (!tokenData.access_token) throw new Error('Missing access_token from Google');

      const gUser = await googleUserInfo(tokenData.access_token);
      console.log('🔍 Google user:', gUser.email);

      const now = Math.floor(Date.now() / 1000);
      const exp = now + 60 * 60 * 24 * 7; // 7d
      const jti = crypto.randomUUID();

      const jwt = await new SignJWT({
        sub: `google:${gUser.id}`,
        name: gUser.name || gUser.email,
        avatar: gUser.picture || '',
        email: gUser.email,
        provider: 'google',
        jti,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .setAudience('haiphen-auth')
        .sign(jwtKey);

      // Persist user in D1 + send first-login emails (best-effort, non-blocking)
      ctx.waitUntil((async () => {
        const { isNew } = await ensureUserInDb(env, `google:${gUser.id}`, gUser.name || gUser.email, gUser.email);
        if (isNew) await sendFirstLoginEmails(env, `google:${gUser.id}`, gUser.name || gUser.email, gUser.email, 'google');
      })());

      const cookie = buildAuthCookie(jwt, { maxAge: 604800 });

      let returnTo = safeReturnToWithNative(returnToFromState);

      // Native CLI handoff
      if (returnTo.startsWith('http://127.0.0.1') || returnTo.startsWith('http://localhost')) {
        const u = new URL(returnTo);
        u.hash = `token=${encodeURIComponent(jwt)}`;
        returnTo = u.toString();
      }

      return new Response(null, {
        status: 302,
        headers: {
          'Set-Cookie': cookie,
          Location: returnTo,
          ...corsHeaders(origin),
        },
      });
    } catch (err) {
      console.error('❌ Google callback error:', err);
      return textResponse('Internal Error', origin, 500);
    }
  }

  // ---- /me ----
  if (url.pathname === '/me') {
    const token = getAuthToken(req);
    if (!token) return textResponse('Unauthorized', origin, 401);
    try {
      const user = await getUserFromToken(token, jwtKey, env);
      return jsonResponse(user, origin);
    } catch (err) {
      return textResponse('Invalid token', origin, 401);
    }
  }

  if (url.pathname === '/entitlement') {
    const token = getAuthToken(req);
    if (!token) return jsonResponse({ entitled: false }, origin, 401);

    try {
      const claims = await getUserFromToken(token, jwtKey, env);
      const paidVal = await env.ENTITLE_KV.get(`paid:${claims.sub}`);
      const entitled = paidVal === '1' || paidVal === 'true';

      return jsonResponse(
        { entitled, entitled_until: null },
        origin,
        200
      );
    } catch {
      return jsonResponse({ entitled: false }, origin, 401);
    }
  }

  if (url.pathname === '/checkout') {
    const token = getAuthToken(req);
    if (!token) {
      const to = encodeURIComponent('https://auth.haiphen.io/checkout');
      return redirectResponse(`https://auth.haiphen.io/login?to=${to}`);
    }

    // send user to checkout start
    // (price_id can be hardcoded for MVP or carried from querystring)
    const priceId = url.searchParams.get('price_id') || 'price_XXXXX';
    const tosVersion = url.searchParams.get('tos_version') || 'sla_v0.1_2026-01-10';

    const start = new URL('https://checkout.haiphen.io/v1/checkout/start');
    start.searchParams.set('price_id', priceId);
    start.searchParams.set('tos_version', tosVersion);
    // optional: start.searchParams.set('plan', 'pro');

    return redirectResponse(start.toString());
  }  

  // ---- /logout ----
  if (url.pathname === '/logout') {
    const token = getCookieValue(req.headers.get('Cookie'), 'auth');
    if (token) {
      try {
        const { payload } = await jwtVerify(token, jwtKey, { audience: 'haiphen-auth' });
        const ttl = payload.exp && payload.iat ? payload.exp - payload.iat : 3600;
        if (payload.jti) {
          await env.REVOKE_KV.put(`revoke:${payload.jti}`, '1', { expirationTtl: ttl });
        }
      } catch (err) {
        console.error('❌ /logout verify error:', err);
      }
    }
    // clear cookie across domain
    const clear = buildAuthCookie('', { clear: true });
    const returnTo = safeReturnTo(url.searchParams.get('to'));
    const reauth = url.searchParams.get('reauth') === '1';

    // If user navigated to /logout in the browser, bounce them back to haiphen.io.
    if (shouldRedirectToHtml(req)) {
      const location = reauth
        ? `https://auth.haiphen.io/login?force=1&to=${encodeURIComponent(returnTo)}`
        : returnTo;

      return new Response(null, {
        status: 302,
        headers: {
          'Set-Cookie': clear,
          'Location': location,
          'Cache-Control': 'no-store',
          ...corsHeaders(origin),
        },
      });
    }

    // If called via fetch(), just clear cookie and return no-content.
    return new Response(null, {
      status: 204,
      headers: {
        'Set-Cookie': clear,
        'Cache-Control': 'no-store',
        ...corsHeaders(origin),
      },
    });
  }

  return textResponse('Not found', origin, 404);
}

/**
 * Handle all requests to app.haiphen.io
 * Requires valid, non-revoked token AND entitlement.
 */
async function handleApp(req, env, jwtKey) {
  const origin = req.headers.get('Origin') || 'https://haiphen.io';
  const url = new URL(req.url);

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Get token
  const token = getCookieValue(req.headers.get('Cookie'), 'auth');
  if (!token) {
    // bounce to auth with return URL
    const to = encodeURIComponent(url.toString());
    return redirectResponse(`https://auth.haiphen.io/login?to=${to}`);
  }

  // Verify & check revocation
  let claims;
  try {
    claims = await getUserFromToken(token, jwtKey, env); // {sub, name, ...}
  } catch (err) {
    console.error('❌ app verify error:', err);
    const to = encodeURIComponent(url.toString());
    return redirectResponse(`https://auth.haiphen.io/login?to=${to}`);
  }

  // Entitlement check
  const paidVal = await env.ENTITLE_KV.get(`paid:${claims.sub}`);
  const paid = paidVal === '1' || paidVal === 'true';
  if (!paid) {
    // 402 Payment Required
    const body = `
      <!doctype html>
      <html><head><title>Payment Required</title></head>
      <body style="font-family:sans-serif;padding:2rem;">
        <h1>Payment Required</h1>
        <p>Hi ${claims.name || claims.sub}, your account doesn’t yet have access to the Haiphen app.</p>
        <p><a href="https://auth.haiphen.io/logout">Logout</a></p>
        <p><a href="https://haiphen.io">Return to site</a></p>
        <p><a href="https://stripe.example/checkout?u=${encodeURIComponent(claims.sub)}">Upgrade (placeholder)</a></p>
      </body></html>`;
    return new Response(body, {
      status: 402,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  }

  // Serve placeholder app content (replace w/ real app build later)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const body = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Haiphen App</title>
      </head>
      <body style="font-family:sans-serif;padding:2rem;">
        <h1>Welcome, ${claims.name || claims.sub}!</h1>
        <img src="${claims.avatar || ''}" alt="" width="64" height="64" style="border-radius:50%;"><br>
        <p>You are entitled to the app environment.</p>
        <p>Your GitHub: ${claims.sub}</p>
        <p><a href="https://haiphen.io">Back to site</a> | <a href="https://auth.haiphen.io/logout">Logout</a></p>
      </body>
      </html>`;
    return new Response(body, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...corsHeaders(origin),
      },
    });
  }

  // All other paths 404 (or later proxy to storage bucket / asset)
  return new Response('Not found in app.', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

function isNativeReturnTo(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return (u.protocol === 'http:' && (host === '127.0.0.1' || host === 'localhost'));
  } catch {
    return false;
  }
}

function withTokenFragment(returnTo, token) {
  const u = new URL(returnTo);
  // DO NOT use query string for tokens
  u.hash = `token=${encodeURIComponent(token)}`;
  return u.toString();
}

function getBearerToken(req) {
  const h = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!h) return undefined;
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : undefined;
}

function getAuthToken(req) {
  const cookie = getCookieValue(req.headers.get('Cookie'), 'auth');
  return cookie || getBearerToken(req);
}

function safeReturnToWithNative(raw) {
  const fallback = DEFAULT_LOGOUT_REDIRECT;
  if (!raw) return fallback;

  try {
    const cand = decodeURIComponent(String(raw));
    const u = new URL(cand);

    // allow local native callback
    const host = u.hostname.toLowerCase();
    if ((host === '127.0.0.1' || host === 'localhost') && u.protocol === 'http:') {
      return u.toString();
    }

    // existing rule for browser targets
    if (/^https:\/\/[^ ]+haiphen\.io(\/|$)/i.test(cand)) return cand;
  } catch (_) {}

  return fallback;
}

export default {
  async fetch(req, env, ctx) {
    const { JWT_SECRET } = env;
    const jwtKey = encoder.encode(JWT_SECRET);
    const url = new URL(req.url);
    const host = url.hostname;
    console.log('FETCH', url.hostname, url.pathname);

    // Dispatch by hostname
    if (host === 'auth.haiphen.io') {
      return handleAuth(req, env, jwtKey, ctx);
    }
    if (host === 'app.haiphen.io') {
      return handleApp(req, env, jwtKey);
    }

    // Any other host: pass-through (public site assets unaffected)
    return new Response('Not found', { status: 404 });
  },
};