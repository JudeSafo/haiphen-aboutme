import Config from "app/config"
import { createHmacHeaders } from "app/utils/crypto"

const ORCH = Config.ORCH_URL

export async function discoverHeads(): Promise<string[]> {
  const res = await fetch(`${ORCH}/vpn/discover`)
  const j   = await res.json()
  return j?.urls ?? []
}

export async function getPreauthKey(user = "mobile", expiry = "24h") {
  const body = { user, expiry }
  const { "X-Timestamp": ts, "X-Signature": sig } = createHmacHeaders(
    Config.INGEST_HMAC_SECRET,
    body
  )

  const res = await fetch(`${ORCH}/vpn/preauth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Timestamp": ts,
      "X-Signature": sig,
    },
    body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j?.error || "preauth-failed")
  return j as { authKey: string; base: string }
}

// --- Simple HTTP helper
async function jfetch(url: string, init: RequestInit = {}) {
  const r = await fetch(url, init)
  if (!r.ok) {
    const t = await r.text().catch(() => "")
    throw new Error(`HTTP ${r.status} ${t}`)
  }
  return r.json()
}

// --- Orchestrator endpoints
export async function pingOrchestrator() {
  const url = `${Config.ORCH_URL}/health`
  try {
    const j = await jfetch(url)
    return Boolean(j?.ok)
  } catch {
    return false
  }
}

export async function registerRunner(
  runnerId: string,
  labels: string[] = [],
  meta: Record<string, any> = {},
) {
  const url = `${Config.ORCH_URL}/runners/register`
  const body = JSON.stringify({ runnerId, labels, meta })
  const { ts, sig } = createHmacHeaders(Config.INGEST_HMAC_SECRET, body)
  return jfetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-timestamp": ts,
      "x-signature": sig,
    },
    body,
  })
}