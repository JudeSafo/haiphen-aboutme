import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/orchestrator';

/**
 * Helper: build a request with optional method, body, and headers.
 */
function makeRequest(path, opts = {}) {
  const { method = 'GET', body, headers = {} } = opts;
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['Content-Type']) {
      init.headers['Content-Type'] = 'application/json';
    }
  }
  return new Request(`http://orchestrator.haiphen.io${path}`, init);
}

/**
 * Helper: invoke the worker and return the response + parsed JSON.
 */
async function callWorker(path, opts = {}) {
  const req = makeRequest(path, opts);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  const json = await res.json();
  return { res, json };
}

/**
 * Helper: compute HMAC-SHA256 hex signature for the orchestrator's verifyAndRead() function.
 * Signs `${timestamp}.${body}` with the INGEST_HMAC_SECRET from env.
 */
async function signRequest(body, timestamp, secret) {
  const enc = new TextEncoder();
  const data = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const bytes = new Uint8Array(sig);
  const hex = [];
  for (let i = 0; i < bytes.length; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return hex.join('');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('haiphen-orchestrator endpoints', () => {

  // ---- Health ----
  describe('GET /health', () => {
    it('returns 200 with ok:true', async () => {
      const { res, json } = await callWorker('/health');
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json).toHaveProperty('now');
    });
  });

  // ---- Unknown routes ----
  describe('unknown routes', () => {
    it('GET /nonexistent returns 404', async () => {
      const { res, json } = await callWorker('/nonexistent');
      expect(res.status).toBe(404);
      expect(json.error).toBe('not found');
    });

    it('POST /nonexistent returns 404', async () => {
      const { res, json } = await callWorker('/nonexistent', {
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(404);
      expect(json.error).toBe('not found');
    });

    it('DELETE / returns 404', async () => {
      const { res, json } = await callWorker('/', { method: 'DELETE' });
      expect(res.status).toBe(404);
      expect(json.error).toBe('not found');
    });
  });

  // ---- VPN Discovery (public) ----
  describe('GET /vpn/discover', () => {
    it('returns 200 with urls array', async () => {
      const { res, json } = await callWorker('/vpn/discover');
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.urls)).toBe(true);
      expect(json).toHaveProperty('ts');
    });
  });

  // ---- Tasks: HMAC-gated endpoints ----
  describe('POST /tasks/submit — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/tasks/submit', {
        method: 'POST',
        body: { type: 'test', payload: {} },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });

    it('returns 401 with only x-timestamp (no signature)', async () => {
      const { res, json } = await callWorker('/tasks/submit', {
        method: 'POST',
        body: { type: 'test', payload: {} },
        headers: { 'x-timestamp': new Date().toISOString() },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });

    it('returns 401 with only x-signature (no timestamp)', async () => {
      const { res, json } = await callWorker('/tasks/submit', {
        method: 'POST',
        body: { type: 'test', payload: {} },
        headers: { 'x-signature': 'deadbeef' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });

    it('returns 401 with invalid (forged) signature', async () => {
      const { res, json } = await callWorker('/tasks/submit', {
        method: 'POST',
        body: { type: 'test', payload: {} },
        headers: {
          'x-timestamp': new Date().toISOString(),
          'x-signature': 'aaaa'.repeat(16), // 64-char hex but wrong
        },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });

    it('returns 401 with expired timestamp', async () => {
      // 10 minutes ago — exceeds the 5-minute drift window
      const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const bodyStr = JSON.stringify({ type: 'test', payload: {} });
      const sig = await signRequest(bodyStr, stale, env.INGEST_HMAC_SECRET);
      const { res, json } = await callWorker('/tasks/submit', {
        method: 'POST',
        body: bodyStr,
        headers: {
          'x-timestamp': stale,
          'x-signature': sig,
        },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  describe('POST /tasks/lease — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/tasks/lease', {
        method: 'POST',
        body: { runnerId: 'r1' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  describe('POST /tasks/heartbeat — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/tasks/heartbeat', {
        method: 'POST',
        body: { runnerId: 'r1', leaseId: 'l1' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  describe('POST /tasks/result — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/tasks/result', {
        method: 'POST',
        body: { runnerId: 'r1', leaseId: 'l1', taskId: 't1', status: 'succeeded' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  describe('POST /tasks/admin/clear — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/tasks/admin/clear', {
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  // GET /tasks/stats is PUBLIC (no HMAC required per source code comment)
  describe('GET /tasks/stats — public', () => {
    it('returns 200 with stats object', async () => {
      const { res, json } = await callWorker('/tasks/stats');
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json).toHaveProperty('stats');
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('leases');
    });
  });

  // ---- VPN preauth — HMAC gated ----
  describe('POST /vpn/preauth — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/vpn/preauth', {
        method: 'POST',
        body: { user: 'orchestrator' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  // ---- Subnet endpoints — HMAC gated ----
  describe('POST /subnet/join — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/subnet/join', {
        method: 'POST',
        body: { subnetId: 'abc' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  describe('POST /subnet/create — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/subnet/create', {
        method: 'POST',
        body: { user: 'orchestrator' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  // ---- LAN endpoints — HMAC gated ----
  describe('POST /lan/enqueue-scan — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/lan/enqueue-scan', {
        method: 'POST',
        body: { cidr: '192.168.1.0/24' },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  describe('POST /lan/submit-inventory — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/lan/submit-inventory', {
        method: 'POST',
        body: { runnerId: 'r1', leaseId: 'l1', taskId: 't1', hosts: [] },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  // ---- Shodan — HMAC gated ----
  describe('POST /shodan/enqueue-mqtt — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/shodan/enqueue-mqtt', {
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  // ---- Runner registration — HMAC gated ----
  describe('POST /runners/register — HMAC gating', () => {
    it('returns 401 without HMAC headers', async () => {
      const { res, json } = await callWorker('/runners/register', {
        method: 'POST',
        body: { runnerId: 'r1', labels: ['lan'] },
      });
      expect(res.status).toBe(401);
      expect(json.error).toBe('unauthorized');
    });
  });

  // ---- LAN inventory public read endpoints ----
  describe('GET /lan/inventory', () => {
    it('returns 200 with todo placeholder', async () => {
      const { res, json } = await callWorker('/lan/inventory');
      expect(res.status).toBe(200);
      expect(json).toHaveProperty('todo');
    });
  });

  describe('GET /lan/inventory/list', () => {
    it('returns 400 when runnerId is missing', async () => {
      const { res, json } = await callWorker('/lan/inventory/list');
      expect(res.status).toBe(400);
      expect(json.error).toBe('runnerId required');
    });

    it('returns 200 with keys array when runnerId is provided', async () => {
      const { res, json } = await callWorker('/lan/inventory/list?runnerId=test-runner');
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.keys)).toBe(true);
    });
  });

  describe('GET /lan/inventory/get', () => {
    it('returns 400 when key is missing', async () => {
      const { res, json } = await callWorker('/lan/inventory/get');
      expect(res.status).toBe(400);
      expect(json.error).toBe('key required');
    });

    it('returns 404 for a nonexistent key', async () => {
      const { res, json } = await callWorker('/lan/inventory/get?key=does-not-exist');
      expect(res.status).toBe(404);
      expect(json.error).toBe('not found');
    });
  });

  describe('GET /lan/inventory/latest', () => {
    it('returns 400 when runnerId is missing', async () => {
      const { res, json } = await callWorker('/lan/inventory/latest');
      expect(res.status).toBe(400);
      expect(json.error).toBe('runnerId required');
    });

    it('returns 200 with latest:null when no inventory exists', async () => {
      const { res, json } = await callWorker('/lan/inventory/latest?runnerId=nonexistent');
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.latest).toBeNull();
    });
  });

  // ---- Response format ----
  describe('response format', () => {
    it('returns Content-Type application/json on all responses', async () => {
      const { res } = await callWorker('/health');
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });

    it('404 responses also return application/json', async () => {
      const { res } = await callWorker('/does-not-exist');
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });
  });

  // ---- Method mismatch ----
  describe('method mismatch', () => {
    it('GET /tasks/submit returns 404 (only POST accepted)', async () => {
      const { res, json } = await callWorker('/tasks/submit');
      expect(res.status).toBe(404);
      expect(json.error).toBe('not found');
    });

    it('POST /health still returns 200 (no method guard on /health)', async () => {
      // The /health endpoint does not check req.method — any method returns health info
      const { res, json } = await callWorker('/health', { method: 'POST', body: {} });
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('POST /vpn/discover returns 404 (only GET accepted)', async () => {
      const { res, json } = await callWorker('/vpn/discover', { method: 'POST', body: {} });
      expect(res.status).toBe(404);
      expect(json.error).toBe('not found');
    });
  });

  // ---- Valid HMAC: authenticated task submission ----
  describe('POST /tasks/submit — with valid HMAC', () => {
    it('accepts a task when properly signed', async () => {
      const bodyObj = [{ type: 'test-task', payload: { msg: 'hello' }, priority: 5 }];
      const bodyStr = JSON.stringify(bodyObj);
      const ts = new Date().toISOString();
      const sig = await signRequest(bodyStr, ts, env.INGEST_HMAC_SECRET);

      const { res, json } = await callWorker('/tasks/submit', {
        method: 'POST',
        body: bodyStr,
        headers: {
          'x-timestamp': ts,
          'x-signature': sig,
        },
      });
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.accepted).toBe(1);
    });
  });

  // ---- Valid HMAC: runners/register with missing runnerId ----
  describe('POST /runners/register — validation', () => {
    it('returns 400 when runnerId is missing (even with valid HMAC)', async () => {
      const bodyObj = { labels: ['lan'] }; // missing runnerId
      const bodyStr = JSON.stringify(bodyObj);
      const ts = new Date().toISOString();
      const sig = await signRequest(bodyStr, ts, env.INGEST_HMAC_SECRET);

      const { res, json } = await callWorker('/runners/register', {
        method: 'POST',
        body: bodyStr,
        headers: {
          'x-timestamp': ts,
          'x-signature': sig,
        },
      });
      expect(res.status).toBe(400);
      expect(json.error).toBe('runnerId required');
    });
  });

  // ---- Valid HMAC: subnet/join with missing subnetId ----
  describe('POST /subnet/join — validation', () => {
    it('returns 400 when subnetId is missing (even with valid HMAC)', async () => {
      const bodyObj = {};
      const bodyStr = JSON.stringify(bodyObj);
      const ts = new Date().toISOString();
      const sig = await signRequest(bodyStr, ts, env.INGEST_HMAC_SECRET);

      const { res, json } = await callWorker('/subnet/join', {
        method: 'POST',
        body: bodyStr,
        headers: {
          'x-timestamp': ts,
          'x-signature': sig,
        },
      });
      expect(res.status).toBe(400);
      expect(json.error).toBe('subnetId required');
    });
  });

  // ---- Valid HMAC: lan/enqueue-scan with missing cidr ----
  describe('POST /lan/enqueue-scan — validation', () => {
    it('returns 400 when cidr is missing (even with valid HMAC)', async () => {
      const bodyObj = { ports: [80, 443] }; // missing cidr
      const bodyStr = JSON.stringify(bodyObj);
      const ts = new Date().toISOString();
      const sig = await signRequest(bodyStr, ts, env.INGEST_HMAC_SECRET);

      const { res, json } = await callWorker('/lan/enqueue-scan', {
        method: 'POST',
        body: bodyStr,
        headers: {
          'x-timestamp': ts,
          'x-signature': sig,
        },
      });
      expect(res.status).toBe(400);
      expect(json.error).toBe('cidr required');
    });
  });
});
