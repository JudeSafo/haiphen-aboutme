import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import worker from '../src/index';

/* ── Helpers ── */

const BASE = 'https://auth.haiphen.io';

function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  return new Request(url, opts);
}

async function call(request) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

/**
 * Mint a valid JWT that will pass verification.
 * Uses the same secret from .dev.vars (env.JWT_SECRET).
 */
async function mintJWT({ sub = 'testuser', jti, exp } = {}) {
  const encoder = new TextEncoder();
  const secret = encoder.encode(env.JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const id = jti || crypto.randomUUID();

  return new SignJWT({
    sub,
    name: 'Test User',
    avatar: 'https://example.com/avatar.png',
    email: 'test@example.com',
    jti: id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp || now + 3600)
    .setAudience('haiphen-auth')
    .sign(secret);
}

/* ────────────────────────────────────────────────────────────
 * 1. Health / Unknown Routes
 * ──────────────────────────────────────────────────────────── */
describe('Health & unknown routes', () => {
  it('GET / returns 404 with "Not found"', async () => {
    const res = await call(req('/'));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain('Not found');
  });

  it('GET /nonexistent returns 404', async () => {
    const res = await call(req('/nonexistent'));
    expect(res.status).toBe(404);
  });

  it('GET /foo/bar/baz returns 404', async () => {
    const res = await call(req('/foo/bar/baz'));
    expect(res.status).toBe(404);
  });

  it('unknown host returns 404', async () => {
    const request = new Request('https://unknown.example.com/');
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
  });
});

/* ────────────────────────────────────────────────────────────
 * 2. CORS Preflight
 * ──────────────────────────────────────────────────────────── */
describe('CORS preflight', () => {
  it('OPTIONS on /me returns 204 with CORS headers', async () => {
    const res = await call(
      req('/me', {
        method: 'OPTIONS',
        headers: { Origin: 'https://haiphen.io' },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://haiphen.io');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('OPTIONS on /login returns 204', async () => {
    const res = await call(
      req('/login', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.haiphen.io' },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.haiphen.io');
  });

  it('OPTIONS on unknown path returns 204 (preflight always succeeds)', async () => {
    const res = await call(
      req('/unknown', {
        method: 'OPTIONS',
        headers: { Origin: 'https://haiphen.io' },
      })
    );
    expect(res.status).toBe(204);
  });
});

/* ────────────────────────────────────────────────────────────
 * 3. /login (GitHub — default provider)
 * ──────────────────────────────────────────────────────────── */
describe('GET /login (GitHub)', () => {
  it('redirects to GitHub OAuth authorize URL', async () => {
    const res = await call(req('/login'));
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('https://github.com/login/oauth/authorize');
    expect(location).toContain('client_id=');
  });

  it('passes return_to as state parameter', async () => {
    const res = await call(req('/login?to=https%3A%2F%2Fhaiphen.io%2Fprofile'));
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('state=');
  });

  it('includes client_id from env', async () => {
    const res = await call(req('/login'));
    const location = res.headers.get('Location');
    expect(location).toContain(`client_id=${env.GITHUB_CLIENT_ID}`);
  });
});

/* ────────────────────────────────────────────────────────────
 * 4. /login?provider=google
 * ──────────────────────────────────────────────────────────── */
describe('GET /login?provider=google', () => {
  it('redirects to Google OAuth authorize URL', async () => {
    const res = await call(req('/login?provider=google'));
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('includes Google client_id from env', async () => {
    const res = await call(req('/login?provider=google'));
    const location = res.headers.get('Location');
    expect(location).toContain(`client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}`);
  });

  it('requests openid email profile scopes', async () => {
    const res = await call(req('/login?provider=google'));
    const location = res.headers.get('Location');
    expect(location).toContain('scope=');
    expect(location).toContain('openid');
  });

  it('encodes state as JSON with provider field', async () => {
    const res = await call(req('/login?provider=google&to=https%3A%2F%2Fhaiphen.io%2F'));
    const location = res.headers.get('Location');
    const url = new URL(location);
    const state = JSON.parse(decodeURIComponent(url.searchParams.get('state')));
    expect(state.provider).toBe('google');
    expect(state.to).toBeDefined();
  });
});

/* ────────────────────────────────────────────────────────────
 * 5. /me — unauthenticated
 * ──────────────────────────────────────────────────────────── */
describe('GET /me', () => {
  it('returns 401 without auth cookie or Bearer token', async () => {
    const res = await call(req('/me'));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain('Unauthorized');
  });

  it('returns 401 with an invalid/expired token', async () => {
    const res = await call(
      req('/me', {
        headers: { Cookie: 'auth=invalid.jwt.token' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid JWT in cookie', async () => {
    const token = await mintJWT();
    // Ensure the token's jti is NOT marked as revoked in KV
    const res = await call(
      req('/me', {
        headers: { Cookie: `auth=${token}` },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sub).toBe('testuser');
    expect(body.name).toBe('Test User');
    expect(body.jti).toBeDefined();
  });

  it('returns 200 with valid JWT in Authorization Bearer header', async () => {
    const token = await mintJWT();
    const res = await call(
      req('/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sub).toBe('testuser');
  });

  it('returns 401 when token jti is revoked in KV', async () => {
    const jti = crypto.randomUUID();
    const token = await mintJWT({ jti });
    // Mark it as revoked
    await env.REVOKE_KV.put(`revoke:${jti}`, '1');
    const res = await call(
      req('/me', {
        headers: { Cookie: `auth=${token}` },
      })
    );
    expect(res.status).toBe(401);
    // Cleanup
    await env.REVOKE_KV.delete(`revoke:${jti}`);
  });
});

/* ────────────────────────────────────────────────────────────
 * 6. /entitlement — unauthenticated
 * ──────────────────────────────────────────────────────────── */
describe('GET /entitlement', () => {
  it('returns 401 with entitled:false without auth', async () => {
    const res = await call(req('/entitlement'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.entitled).toBe(false);
  });

  it('returns entitled:false for authenticated user without payment', async () => {
    const token = await mintJWT({ sub: 'freeuser' });
    const res = await call(
      req('/entitlement', {
        headers: { Cookie: `auth=${token}` },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entitled).toBe(false);
  });

  it('returns entitled:true for authenticated user with paid entitlement', async () => {
    const sub = 'paiduser';
    const token = await mintJWT({ sub });
    // Set entitlement in KV
    await env.ENTITLE_KV.put(`paid:${sub}`, '1');
    const res = await call(
      req('/entitlement', {
        headers: { Cookie: `auth=${token}` },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entitled).toBe(true);
    // Cleanup
    await env.ENTITLE_KV.delete(`paid:${sub}`);
  });
});

/* ────────────────────────────────────────────────────────────
 * 7. /logout
 * ──────────────────────────────────────────────────────────── */
describe('GET /logout', () => {
  it('clears the auth cookie and redirects for browser navigation', async () => {
    const token = await mintJWT();
    const res = await call(
      req('/logout', {
        headers: {
          Cookie: `auth=${token}`,
          Accept: 'text/html',
        },
      })
    );
    expect(res.status).toBe(302);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('auth=');
    expect(setCookie).toContain('Max-Age=0');
    const location = res.headers.get('Location');
    expect(location).toBe('https://haiphen.io/');
  });

  it('returns 204 for fetch-style logout (no navigation headers)', async () => {
    const token = await mintJWT();
    const res = await call(
      req('/logout', {
        headers: {
          Cookie: `auth=${token}`,
          Origin: 'https://haiphen.io',
        },
      })
    );
    expect(res.status).toBe(204);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('honors safe return_to parameter', async () => {
    const token = await mintJWT();
    const res = await call(
      req('/logout?to=https%3A%2F%2Fwww.haiphen.io%2Fprofile', {
        headers: {
          Cookie: `auth=${token}`,
          Accept: 'text/html',
        },
      })
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://www.haiphen.io/profile');
  });

  it('ignores unsafe return_to and falls back to default', async () => {
    const token = await mintJWT();
    const res = await call(
      req('/logout?to=https%3A%2F%2Fevil.com%2F', {
        headers: {
          Cookie: `auth=${token}`,
          Accept: 'text/html',
        },
      })
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://haiphen.io/');
  });

  it('revokes the token jti in REVOKE_KV on logout', async () => {
    const jti = crypto.randomUUID();
    const token = await mintJWT({ jti });
    await call(
      req('/logout', {
        headers: {
          Cookie: `auth=${token}`,
          Accept: 'text/html',
        },
      })
    );
    const revoked = await env.REVOKE_KV.get(`revoke:${jti}`);
    expect(revoked).toBe('1');
    // Cleanup
    await env.REVOKE_KV.delete(`revoke:${jti}`);
  });

  it('handles reauth=1 by redirecting to /login?force=1', async () => {
    const token = await mintJWT();
    const res = await call(
      req('/logout?reauth=1', {
        headers: {
          Cookie: `auth=${token}`,
          Accept: 'text/html',
        },
      })
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('login?force=1');
  });
});

/* ────────────────────────────────────────────────────────────
 * 8. Rate Limiting
 * ──────────────────────────────────────────────────────────── */
describe('Rate limiting on /login', () => {
  it('returns 429 after exceeding 10 requests per IP', async () => {
    // Use a unique IP to avoid interference from other tests
    const uniqueIp = `10.0.0.${Math.floor(Math.random() * 255)}`;

    // The rate limiter allows 10 per minute per IP for /login
    const responses = [];
    for (let i = 0; i < 11; i++) {
      const res = await call(
        req('/login', {
          headers: { 'CF-Connecting-IP': uniqueIp },
        })
      );
      responses.push(res);
    }

    // First 10 should succeed (302 redirect)
    for (let i = 0; i < 10; i++) {
      expect(responses[i].status).toBe(302);
    }

    // The 11th should be rate limited
    expect(responses[10].status).toBe(429);
    const body = await responses[10].json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Too many');
    expect(responses[10].headers.get('Retry-After')).toBe('60');
  });
});

/* ────────────────────────────────────────────────────────────
 * 9. CORS Origin Validation
 * ──────────────────────────────────────────────────────────── */
describe('CORS origin validation', () => {
  it('reflects allowed origin: https://haiphen.io', async () => {
    const res = await call(
      req('/me', {
        headers: { Origin: 'https://haiphen.io' },
      })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://haiphen.io');
  });

  it('reflects allowed origin: https://app.haiphen.io', async () => {
    const res = await call(
      req('/me', {
        headers: { Origin: 'https://app.haiphen.io' },
      })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.haiphen.io');
  });

  it('reflects localhost origins for dev', async () => {
    const res = await call(
      req('/me', {
        headers: { Origin: 'http://localhost:3000' },
      })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
  });

  it('defaults to https://haiphen.io for unknown origins', async () => {
    const res = await call(
      req('/me', {
        headers: { Origin: 'https://evil.com' },
      })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://haiphen.io');
  });

  it('defaults to https://haiphen.io when no origin header is set', async () => {
    const res = await call(req('/me'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://haiphen.io');
  });

  it('always includes Vary: Origin header', async () => {
    const res = await call(
      req('/me', {
        headers: { Origin: 'https://haiphen.io' },
      })
    );
    expect(res.headers.get('Vary')).toBe('Origin');
  });
});

/* ────────────────────────────────────────────────────────────
 * 10. /checkout route
 * ──────────────────────────────────────────────────────────── */
describe('GET /checkout', () => {
  it('redirects to /login when unauthenticated', async () => {
    const res = await call(req('/checkout'));
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('auth.haiphen.io/login');
  });

  it('redirects to checkout.haiphen.io when authenticated', async () => {
    const token = await mintJWT();
    const res = await call(
      req('/checkout', {
        headers: { Cookie: `auth=${token}` },
      })
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('checkout.haiphen.io/v1/checkout/start');
  });
});

/* ────────────────────────────────────────────────────────────
 * 11. /login with existing valid cookie (skip OAuth)
 * ──────────────────────────────────────────────────────────── */
describe('GET /login with existing valid session', () => {
  it('skips OAuth and redirects to return_to when cookie is valid', async () => {
    const token = await mintJWT();
    // Note: safeReturnToWithNative regex requires a subdomain prefix before haiphen.io
    // (e.g. www.haiphen.io or app.haiphen.io), bare haiphen.io/path falls back to default
    const res = await call(
      req('/login?to=https%3A%2F%2Fwww.haiphen.io%2Fdashboard', {
        headers: { Cookie: `auth=${token}` },
      })
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toBe('https://www.haiphen.io/dashboard');
  });

  it('forces OAuth when force=1 even with valid cookie', async () => {
    const token = await mintJWT();
    // Use a unique IP to avoid rate limiting from test 8
    const res = await call(
      req('/login?force=1', {
        headers: {
          Cookie: `auth=${token}`,
          'CF-Connecting-IP': '192.168.99.1',
        },
      })
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('github.com/login/oauth/authorize');
  });
});

/* ────────────────────────────────────────────────────────────
 * 12. app.haiphen.io routing
 * ──────────────────────────────────────────────────────────── */
describe('app.haiphen.io', () => {
  it('redirects to login when no auth cookie is present', async () => {
    const request = new Request('https://app.haiphen.io/');
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('auth.haiphen.io/login');
  });

  it('returns 402 for authenticated user without entitlement', async () => {
    const token = await mintJWT({ sub: 'noentitlement' });
    const request = new Request('https://app.haiphen.io/', {
      headers: { Cookie: `auth=${token}` },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(402);
    const body = await res.text();
    expect(body).toContain('Payment Required');
  });

  it('returns 200 with app content for entitled user', async () => {
    const sub = 'appuser';
    const token = await mintJWT({ sub });
    await env.ENTITLE_KV.put(`paid:${sub}`, '1');
    const request = new Request('https://app.haiphen.io/', {
      headers: { Cookie: `auth=${token}` },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Welcome');
    // Cleanup
    await env.ENTITLE_KV.delete(`paid:${sub}`);
  });
});
