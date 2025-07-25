import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

/**
 * Utility: CORS headers
 */
function corsHeaders(origin) {
  // allow only these sites; expand if needed
  const allowedOrigins = [
    'https://haiphen.io',
    'https://www.haiphen.io',       // if you CNAME it
    'https://app.haiphen.io',
    'https://auth.haiphen.io',
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
      ...corsHeaders(origin),
    },
  });
}
function textResponse(txt, origin, status = 200) {
  return new Response(txt, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
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

/**
 * Parse cookie by key.
 */
function getCookieValue(header, key) {
  return header?.match(new RegExp(`${key}=([^;]+)`))?.[1];
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
  console.log('🔍 GitHub raw token response:', text);
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

  // Revocation check
  if (payload.jti) {
    const revoked = await env.REVOKE_KV.get(`revoke:${payload.jti}`);
    if (revoked) throw new Error('Token revoked');
  }
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
    // capture optional ?to=<url> for post-login redirect
    const to = url.searchParams.get('to') || 'https://app.haiphen.io/';
    // Use GitHub "state" param to carry return-to
    const state = encodeURIComponent(to);
    const redirect = encodeURIComponent(callbackURL);
    const gh = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirect}&state=${state}`;
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
      const exp = now + 60 * 60; // 1h
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
      const cookie = [
        `auth=${jwt}`,
        'Domain=haiphen.io',
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Max-Age=3600',
      ].join('; ');

      // where to send user after auth
      let returnTo = 'https://app.haiphen.io/';
      if (state) {
        try {
          const cand = decodeURIComponent(state);
          // light validation: must start with https:// and contain haiphen.io
          if (/^https:\/\/[^ ]+haiphen\.io/i.test(cand)) {
            returnTo = cand;
          }
        } catch (_e) {}
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
    const token = getCookieValue(req.headers.get('Cookie'), 'auth');
    if (!token) return textResponse('Unauthorized', origin, 401);
    try {
      const user = await getUserFromToken(token, jwtKey, env);
      return jsonResponse(user, origin);
    } catch (err) {
      console.error('❌ /me JWT verify error:', err);
      return textResponse('Invalid token', origin, 401);
    }
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
    const clear = [
      'auth=',
      'Domain=haiphen.io',
      'Path=/',
      'Max-Age=0',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ].join('; ');
    return new Response('Logged out', {
      status: 200,
      headers: {
        'Set-Cookie': clear,
        ...corsHeaders(origin),
      },
    });
  }

  // ---- /kv-test (debug) ----
  if (url.pathname === '/kv-test') {
    await env.REVOKE_KV.put('test-key', 'test-value', { expirationTtl: 60 });
    const val = await env.REVOKE_KV.get('test-key');
    return textResponse(`✅ KV response: ${val}`, origin);
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
  let paid = false;
  try {
    paid = await env.ENTITLE_KV.get(`paid:${claims.sub}`);
  } catch (err) {
    console.error('❌ ENTITLE_KV error:', err);
  }
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

export default {
  async fetch(req, env, ctx) {
    const { JWT_SECRET } = env;
    const jwtKey = encoder.encode(JWT_SECRET);
    const url = new URL(req.url);
    const host = url.hostname;

    // Dispatch by hostname
    if (host === 'auth.haiphen.io') {
      return handleAuth(req, env, jwtKey);
    }
    if (host === 'app.haiphen.io') {
      return handleApp(req, env, jwtKey);
    }

    // Any other host: pass-through (public site assets unaffected)
    return fetch(req);
  },
};