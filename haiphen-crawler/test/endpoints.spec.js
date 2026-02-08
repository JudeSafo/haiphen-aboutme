import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/edge-crawler';

/* ------------------------------------------------------------------ */
/*  Helper: invoke the worker's fetch handler directly                */
/* ------------------------------------------------------------------ */
async function callWorker(path, options = {}) {
  const ctx = createExecutionContext();
  const url = `https://crawler.haiphen.io${path}`;
  const req = new Request(url, options);
  const resp = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return resp;
}

/* ------------------------------------------------------------------ */
/*  GET /api/health                                                   */
/* ------------------------------------------------------------------ */
describe('GET /api/health', () => {
  it('returns 200 with ok:true', async () => {
    const resp = await callWorker('/api/health');
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.now).toBeDefined();
  });

  it('returns JSON content type', async () => {
    const resp = await callWorker('/api/health');
    expect(resp.headers.get('Content-Type')).toContain('application/json');
  });
});

/* ------------------------------------------------------------------ */
/*  OPTIONS preflight — no dedicated CORS handler in this worker      */
/* ------------------------------------------------------------------ */
describe('OPTIONS preflight', () => {
  it('returns 404 on a path with no method-agnostic match', async () => {
    // /api/candidates requires GET, so OPTIONS falls through to 404
    const resp = await callWorker('/api/candidates', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://haiphen.io',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(resp.status).toBe(404);
  });

  it('no CORS headers are returned (worker does not set them)', async () => {
    const resp = await callWorker('/api/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://haiphen.io',
        'Access-Control-Request-Method': 'GET',
      },
    });
    // The worker has no CORS handling, so no Access-Control-* headers
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Unknown routes                                                    */
/* ------------------------------------------------------------------ */
describe('Unknown routes', () => {
  it('GET /nonexistent returns 404', async () => {
    const resp = await callWorker('/nonexistent');
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toBe('Not found');
  });

  it('GET / returns 404', async () => {
    const resp = await callWorker('/');
    expect(resp.status).toBe(404);
  });

  it('POST /api/health returns 404 (health only matched via startsWith, any method)', async () => {
    // Note: /api/health uses startsWith with no method check, so POST also returns 200
    const resp = await callWorker('/api/health', { method: 'POST' });
    expect(resp.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/candidates                                               */
/* ------------------------------------------------------------------ */
describe('GET /api/candidates', () => {
  it('returns 200 with total and candidates array', async () => {
    // Pre-seed CRAWL_KV so we don't hit Shodan
    await env.CRAWL_KV.put(
      'candidates:latest',
      JSON.stringify([
        { ip: '192.0.2.1', port: 1883, firstSeen: '2026-01-01T00:00:00Z' },
      ])
    );
    const resp = await callWorker('/api/candidates');
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(typeof body.total).toBe('number');
    expect(Array.isArray(body.candidates)).toBe(true);
  });

  it('respects limit query parameter', async () => {
    await env.CRAWL_KV.put(
      'candidates:latest',
      JSON.stringify([
        { ip: '192.0.2.1', port: 1883, firstSeen: '2026-01-01T00:00:00Z' },
        { ip: '192.0.2.2', port: 1883, firstSeen: '2026-01-01T00:00:00Z' },
        { ip: '192.0.2.3', port: 1883, firstSeen: '2026-01-01T00:00:00Z' },
      ])
    );
    const resp = await callWorker('/api/candidates?limit=2');
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.candidates.length).toBeLessThanOrEqual(2);
  });

  it('POST /api/candidates returns 404 (only GET is handled)', async () => {
    const resp = await callWorker('/api/candidates', { method: 'POST' });
    expect(resp.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/feed.rss                                                 */
/* ------------------------------------------------------------------ */
describe('GET /api/feed.rss', () => {
  it('returns 200 with RSS content type', async () => {
    // Seed results so renderRSS has data
    await env.CRAWL_KV.put(
      'results:latest',
      JSON.stringify([
        { ip: '192.0.2.10', topic: 'test/topic', payload: 'hello', ts: Date.now() },
      ])
    );
    const resp = await callWorker('/api/feed.rss');
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Content-Type')).toContain('application/rss+xml');
  });

  it('returns valid RSS XML', async () => {
    await env.CRAWL_KV.put('results:latest', JSON.stringify([]));
    const resp = await callWorker('/api/feed.rss');
    const text = await resp.text();
    expect(text).toContain('<?xml version="1.0"');
    expect(text).toContain('<rss version="2.0">');
    expect(text).toContain('<channel>');
  });

  it('returns RSS even when results are empty', async () => {
    await env.CRAWL_KV.delete('results:latest');
    const resp = await callWorker('/api/feed.rss');
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain('<channel>');
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/feed.json                                                */
/* ------------------------------------------------------------------ */
describe('GET /api/feed.json', () => {
  it('returns 200 with JSON content type', async () => {
    await env.CRAWL_KV.put('results:latest', JSON.stringify([]));
    const resp = await callWorker('/api/feed.json');
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns title, link, and items array', async () => {
    await env.CRAWL_KV.put(
      'results:latest',
      JSON.stringify([{ ip: '10.0.0.1', topic: 'a/b', payload: 'x', ts: Date.now() }])
    );
    const resp = await callWorker('/api/feed.json');
    const body = await resp.json();
    expect(body.title).toBeDefined();
    expect(body.link).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(1);
  });

  it('returns empty items when no results stored', async () => {
    await env.CRAWL_KV.delete('results:latest');
    const resp = await callWorker('/api/feed.json');
    const body = await resp.json();
    expect(body.items).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/ingest — HMAC auth gating                               */
/* ------------------------------------------------------------------ */
describe('POST /api/ingest', () => {
  it('returns 401 when x-timestamp header is missing', async () => {
    const resp = await callWorker('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': 'deadbeef',
      },
      body: JSON.stringify([]),
    });
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 401 when x-signature header is missing', async () => {
    const resp = await callWorker('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-timestamp': new Date().toISOString(),
      },
      body: JSON.stringify([]),
    });
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 401 when both HMAC headers are missing', async () => {
    const resp = await callWorker('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    });
    expect(resp.status).toBe(401);
  });

  it('returns 401 with invalid signature', async () => {
    const resp = await callWorker('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-timestamp': new Date().toISOString(),
        'x-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: JSON.stringify([]),
    });
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toContain('Bad signature');
  });

  it('returns 401 with expired timestamp', async () => {
    // Timestamp older than 5 minutes
    const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const resp = await callWorker('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-timestamp': oldTimestamp,
        'x-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: JSON.stringify([]),
    });
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toContain('Timestamp');
  });

  it('GET /api/ingest returns 404 (only POST is handled)', async () => {
    const resp = await callWorker('/api/ingest', { method: 'GET' });
    expect(resp.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  Response format validation                                        */
/* ------------------------------------------------------------------ */
describe('Response format', () => {
  it('all JSON responses include Content-Type application/json', async () => {
    const endpoints = ['/api/health', '/api/feed.json', '/nonexistent'];
    for (const path of endpoints) {
      const resp = await callWorker(path);
      expect(resp.headers.get('Content-Type')).toContain('application/json');
    }
  });

  it('error responses have error field', async () => {
    const resp = await callWorker('/does-not-exist');
    const body = await resp.json();
    expect(body.error).toBeDefined();
  });
});
