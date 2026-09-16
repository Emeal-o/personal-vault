// lib/prfCrypto.ts
// Browser-only. Wraps/unwraps a folder passphrase using raw key
// material from the WebAuthn PRF extension's output. This key
// material is derived and used entirely client-side — it is never
// sent to the server, only the resulting ciphertext + iv are.
//
// Every value handed to Web Crypto / WebAuthn below is a plain
// ArrayBuffer (never a bare Uint8Array view) — newer TypeScript
// toolchains type Uint8Array.buffer as the wider ArrayBufferLike,
// which fails to satisfy the stricter BufferSource-typed parameters
// these APIs expect.

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns a real ArrayBuffer so callers can hand it straight to
// crypto.subtle / navigator.credentials APIs typed as BufferSource.
export function prfSaltToBytes(saltBase64Url: string): ArrayBuffer {
  return toArrayBuffer(base64UrlToBytes(saltBase64Url));
}

async function deriveAesKey(prfSecret: ArrayBuffer): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", prfSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("vault-folder-biometric") },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapPassphraseWithPrf(
  passphrase: string,
  prfSecret: ArrayBuffer
): Promise<{ wrapped: string; iv: string }> {
  const key = await deriveAesKey(prfSecret);
  const iv = toArrayBuffer(crypto.getRandomValues(new Uint8Array(12)));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(passphrase)
  );
  return { wrapped: bytesToBase64Url(ciphertext), iv: bytesToBase64Url(iv) };
}

export async function unwrapPassphraseWithPrf(
  wrapped: string,
  iv: string,
  prfSecret: ArrayBuffer
): Promise<string> {
  const key = await deriveAesKey(prfSecret);
  const ivBuffer = toArrayBuffer(base64UrlToBytes(iv));
  const dataBuffer = toArrayBuffer(base64UrlToBytes(wrapped));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    dataBuffer
  );
  return new TextDecoder().decode(plaintext);
}

// Normalizes whatever shape the browser hands back for a PRF result —
// some return a raw ArrayBuffer, some a base64url string.
export function normalizePrfSecret(raw: unknown): ArrayBuffer | null {
  if (!raw) return null;
  if (raw instanceof ArrayBuffer) return raw;
  if (raw instanceof Uint8Array) return toArrayBuffer(raw);
  if (typeof raw === "string") return prfSaltToBytes(raw);
  return null;
}
