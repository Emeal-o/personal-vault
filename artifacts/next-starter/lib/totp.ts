// lib/totp.ts
// RFC 6238 TOTP implementation using the Web Crypto API — no external library needed.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

function counterToBytes(counter: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Counter fits comfortably in the low 32 bits for the foreseeable future.
  view.setUint32(4, counter, false);
  return new Uint8Array(buf);
}

async function hmacSha1(keyBytes: Uint8Array, msgBytes: Uint8Array): Promise<Uint8Array> {
  // .slice().buffer avoids the Uint8Array.buffer -> ArrayBufferLike widening issue
  // that broke Web Crypto calls on Vercel's TS toolchain in prfCrypto.ts.
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.slice().buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgBytes.slice().buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

export function isValidBase32Secret(secret: string): boolean {
  const clean = secret.toUpperCase().replace(/[\s=]/g, "");
  return clean.length > 0 && /^[A-Z2-7]+$/.test(clean);
}

export async function generateTotp(
  secret: string,
  timeStepSeconds = 30,
  digits = 6
): Promise<{ code: string; secondsRemaining: number }> {
  const keyBytes = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStepSeconds);
  const counterBytes = counterToBytes(counter);

  const hmac = await hmacSha1(keyBytes, counterBytes);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = (binary % 10 ** digits).toString().padStart(digits, "0");
  const secondsRemaining = timeStepSeconds - (epoch % timeStepSeconds);

  return { code, secondsRemaining };
}
