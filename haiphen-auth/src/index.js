import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();
const DEFAULT_LOGOUT_REDIRECT = 'https://haiphen.io/';

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
async function handleAuth(req, env, jwtKey) {
  const origin = req.headers.get('Origin') || 'https://haiphen.io';
  const url = new URL(req.url);
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env;
  const callbackURL = 'https://auth.haiphen.io/callback';

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // ---- /login ----
  if (url.pathname === '/login') {
    const toRaw =
      url.searchParams.get('to') ||
      url.searchParams.get('return_to') ||
      'https://haiphen.io/';

    const to = safeReturnToWithNative(toRaw);

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

    // Use GitHub "state" param to carry return-to
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
      return handleAuth(req, env, jwtKey);
    }
    if (host === 'app.haiphen.io') {
      return handleApp(req, env, jwtKey);
    }

    // Any other host: pass-through (public site assets unaffected)
    return new Response('Not found', { status: 404 });
  },
};