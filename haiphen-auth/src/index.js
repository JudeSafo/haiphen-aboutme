import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

// domains
const ROOT_DOMAIN   = 'haiphen.io';
const AUTH_DOMAIN   = 'auth.haiphen.io';
const APP_DOMAIN    = 'app.haiphen.io';   // future use, safe to leave now
const LOGIN_URL     = `https://${AUTH_DOMAIN}/login`;
const CALLBACK_URL  = `https://${AUTH_DOMAIN}/callback`;
const HOME_URL      = `https://${ROOT_DOMAIN}/`;

// cookie attrs (shared across subdomains)
const COOKIE_BASE   = `Path=/; Domain=${ROOT_DOMAIN}; HttpOnly; Secure; SameSite=Lax`;
const COOKIE_CLEAR  = `Path=/; Domain=${ROOT_DOMAIN}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

// allow front-end calls from these sites
const ALLOWED_ORIGINS = new Set([
  `https://${ROOT_DOMAIN}`,
  `https://${AUTH_DOMAIN}`,
  `https://${APP_DOMAIN}`,
]);

function corsHeaders(origin, extra = {}) {
  const h = new Headers(extra);
  if (ALLOWED_ORIGINS.has(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Credentials', 'true');
    h.set('Vary', 'Origin');
  }
  return h;
}

function corsPreflight(origin, reqHeaders) {
  const h = corsHeaders(origin, {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders || '*',
    'Access-Control-Max-Age': '86400',
  });
  return new Response(null, { status: 204, headers: h });
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const url = new URL(req.url);
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET, REVOKE_KV } = env;
    const jwtKey = encoder.encode(JWT_SECRET);

    // ---------- preflight ----------
    if (req.method === 'OPTIONS') {
      const reqHeaders = req.headers.get('Access-Control-Request-Headers') || '';
      return corsPreflight(origin, reqHeaders);
    }

    // ---------- helpers ----------
    function getCookieValue(header, key) {
      return header?.match(new RegExp(`${key}=([^;]+)`))?.[1];
    }

    async function githubToken(code) {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const text = await tokenRes.text();
      console.log('🔍 GitHub raw token response:', text);
      const ct = tokenRes.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) return JSON.parse(text);
      return Object.fromEntries(new URLSearchParams(text));
    }

    async function getUserFromToken(token) {
      const { payload } = await jwtVerify(token, jwtKey, {
        audience: 'haiphen-auth',
      });
      // blacklist check
      if (await REVOKE_KV.get(`revoke:${payload.jti}`)) {
        throw new Error('Token is revoked');
      }
      return payload;
    }

    function redirectToLogin() {
      return Response.redirect(LOGIN_URL, 302);
    }

    // ---------- /login ----------
    if (url.pathname === '/login') {
      const redirect = encodeURIComponent(CALLBACK_URL);
      return Response.redirect(
        `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirect}`,
        302
      );
    }

    // ---------- /callback ----------
    if (url.pathname === '/callback') {
      try {
        const code = url.searchParams.get('code');
        if (!code) return new Response('Missing code', { status: 400 });

        const { access_token } = await githubToken(code);
        if (!access_token) throw new Error('Missing access_token');

        const userRes = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Accept: 'application/json',
            'User-Agent': 'haiphen-auth-worker',
          },
        });
        const user = await userRes.json();
        const now = Math.floor(Date.now() / 1000);

        const jwt = await new SignJWT({
          sub: user.login,
          name: user.name,
          avatar: user.avatar_url,
          email: user.email,
          jti: crypto.randomUUID(),
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt(now)
          .setExpirationTime(now + 60 * 60) // 1 hour
          .setAudience('haiphen-auth')
          .sign(jwtKey);

        return new Response(null, {
          status: 302,
          headers: {
            'Set-Cookie': `auth=${jwt}; ${COOKIE_BASE}; Max-Age=3600`,
            Location: HOME_URL, // go to public site; you can change later
          },
        });
      } catch (err) {
        console.error('❌ Callback error:', err);
        return new Response('Internal Error', { status: 500 });
      }
    }

    // ---------- /me ----------
    if (url.pathname === '/me') {
      const token = getCookieValue(req.headers.get('Cookie'), 'auth');
      if (!token) {
        return new Response('Unauthorized', {
          status: 401,
          headers: corsHeaders(origin, { 'Content-Type': 'text/plain' }),
        });
      }
      try {
        const user = await getUserFromToken(token);
        return new Response(JSON.stringify(user, null, 2), {
          status: 200,
          headers: corsHeaders(origin, { 'Content-Type': 'application/json' }),
        });
      } catch (err) {
        console.error('❌ /me JWT verify error:', err);
        return new Response('Invalid token', {
          status: 401,
          headers: corsHeaders(origin, { 'Content-Type': 'text/plain' }),
        });
      }
    }

    // ---------- /kv-test ----------
    if (url.pathname === '/kv-test') {
      try {
        await REVOKE_KV.put('test-key', 'test-value', { expirationTtl: 60 });
        const val = await REVOKE_KV.get('test-key');
        return new Response(`✅ KV response: ${val}`, {
          headers: corsHeaders(origin, { 'Content-Type': 'text/plain' }),
        });
      } catch (err) {
        console.error('❌ KV test error:', err);
        return new Response('KV error', {
          status: 500,
          headers: corsHeaders(origin, { 'Content-Type': 'text/plain' }),
        });
      }
    }

    // ---------- /logout ----------
    if (url.pathname === '/logout') {
      const token = getCookieValue(req.headers.get('Cookie'), 'auth');
      if (token) {
        try {
          const { payload } = await jwtVerify(token, jwtKey, {
            audience: 'haiphen-auth',
          });
          const ttl = Math.max(0, (payload.exp ?? 0) - (payload.iat ?? 0));
          await REVOKE_KV.put(`revoke:${payload.jti}`, '1', { expirationTtl: ttl || 60 });
        } catch (err) {
          console.error('❌ /logout error:', err);
        }
      }
      // Clear cookie + redirect back to root site
      return new Response(null, {
        status: 302,
        headers: {
          'Set-Cookie': `auth=; ${COOKIE_CLEAR}`,
          Location: HOME_URL,
        },
      });
    }

    // ---------- protected proxy ----------
    const token = getCookieValue(req.headers.get('Cookie'), 'auth');
    if (!token) return redirectToLogin();

    try {
      await getUserFromToken(token);
    } catch (err) {
      console.error('❌ JWT verify error:', err);
      return redirectToLogin();
    }

    // Pass through to static origin (haiphen.io)
    const originURL = new URL(req.url);
    originURL.hostname = ROOT_DOMAIN;
    originURL.protocol = 'https:';
    return fetch(originURL.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      redirect: 'follow',
    });
  },
};