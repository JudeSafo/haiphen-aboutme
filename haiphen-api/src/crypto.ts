export function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest);
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return hex(sig);
}

/**
 * Timing-safe compare for hex strings (best-effort in JS).
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function json<T>(v: T): string {
  return JSON.stringify(v);
}

export function uuid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Envelope encryption for prospect credentials (AES-256-GCM)
// Blob format: base64(dek_iv[12] + wrapped_dek[48] + data_iv[12] + ciphertext[len+16])
// ---------------------------------------------------------------------------

export function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function fromBase64(str: string): ArrayBuffer {
  const raw = atob(str);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

export async function importMasterKey(hexSecret: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(hexSecret.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptCredential(masterKey: CryptoKey, plaintext: string): Promise<string> {
  // Generate random DEK (256-bit)
  const dekRaw = crypto.getRandomValues(new Uint8Array(32));
  const dek = await crypto.subtle.importKey("raw", dekRaw, { name: "AES-GCM" }, true, ["encrypt"]);

  // Wrap DEK with master key
  const dekIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedDek = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: dekIv }, masterKey, dekRaw));

  // Encrypt plaintext with DEK
  const dataIv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: dataIv },
    dek,
    new TextEncoder().encode(plaintext),
  ));

  // Assemble blob: dek_iv(12) + wrapped_dek(48) + data_iv(12) + ciphertext
  const blob = new Uint8Array(12 + wrappedDek.length + 12 + ciphertext.length);
  blob.set(dekIv, 0);
  blob.set(wrappedDek, 12);
  blob.set(dataIv, 12 + wrappedDek.length);
  blob.set(ciphertext, 12 + wrappedDek.length + 12);

  return toBase64(blob.buffer);
}

export async function decryptCredential(masterKey: CryptoKey, blob: string): Promise<string> {
  const buf = new Uint8Array(fromBase64(blob));

  const dekIv = buf.slice(0, 12);
  const wrappedDek = buf.slice(12, 60); // 48 bytes (32 + 16 tag)
  const dataIv = buf.slice(60, 72);
  const ciphertext = buf.slice(72);

  // Unwrap DEK
  const dekRaw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: dekIv }, masterKey, wrappedDek);
  const dek = await crypto.subtle.importKey("raw", dekRaw, { name: "AES-GCM" }, false, ["decrypt"]);

  // Decrypt data
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: dataIv }, dek, ciphertext);
  return new TextDecoder().decode(plainBuf);
}