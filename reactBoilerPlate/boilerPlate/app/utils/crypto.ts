// app/utils/crypto.ts
import HmacSHA256 from "crypto-js/hmac-sha256";
import Hex from "crypto-js/enc-hex";

/**
 * Generate an HMAC-SHA256 signature over `${timestamp}.${body}`.
 *
 * @param secret   HMAC secret key.
 * @param timestamp  Milliseconds-since-epoch, as a string.
 * @param body     The payload to sign (string or JSON-serializable).
 * @returns        Hex-encoded HMAC-SHA256 signature.
 */
export function hmacSignatureHex(
  secret: string,
  timestamp: string,
  body: string | object
): string {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const data = `${timestamp}.${raw}`;
  if (!secret) {
    throw new Error("[crypto] hmacSignatureHex called with empty secret");
  }
  const hmac = HmacSHA256(data, secret);
  return Hex.stringify(hmac);  
}

/**
 * Build the standard auth headers for an HMAC-signed request.
 *
 * @param secret  HMAC secret key.
 * @param body    The request body to sign.
 * @returns       `{ "X-Timestamp": string; "X-Signature": string }`
 */
export function createHmacHeaders(
  secret: string,
  body: string | object
): { "X-Timestamp": string; "X-Signature": string } {
  if (!secret) {
    console.error("[crypto] INGEST_HMAC_SECRET is missing!", secret)
  }  
  const timestamp = new Date().toISOString();  
  const signature = hmacSignatureHex(secret, timestamp, body);
  console.debug("[crypto] createHmacHeaders", { timestamp, signature });
  return {
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
}