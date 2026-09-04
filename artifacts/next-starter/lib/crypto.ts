// lib/crypto.ts
// Client-side encryption using the browser's native Web Crypto API.
// Files/secrets are encrypted here BEFORE upload — R2 only ever stores ciphertext.

const PBKDF2_ITERATIONS = 250_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // recommended for AES-GCM

/**
 * Derives a strong AES-256 key from the user's passphrase using PBKDF2.
 * A random salt is used per-derivation so the same passphrase never
 * produces the same key twice.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a File or Blob with a passphrase.
 * Returns a single Blob: [salt][iv][ciphertext] — everything needed to
 * decrypt later is bundled together except the passphrase itself.
 */
export async function encryptBlob(data: Blob, passphrase: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const plaintext = await data.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  // Bundle salt + iv + ciphertext into one package
  return new Blob([salt, iv, ciphertext]);
}

/**
 * Decrypts a Blob produced by encryptBlob, given the same passphrase.
 * Throws if the passphrase is wrong or the data was tampered with
 * (AES-GCM authenticates the ciphertext).
 */
export async function decryptBlob(data: Blob, passphrase: string): Promise<Blob> {
  const buffer = await data.arrayBuffer();

  const salt = new Uint8Array(buffer.slice(0, SALT_LENGTH));
  const iv = new Uint8Array(buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH));
  const ciphertext = buffer.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(passphrase, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new Blob([plaintext]);
}

/**
 * Convenience helper: encrypts a plain text string (e.g. a password/secret note).
 */
export async function encryptText(text: string, passphrase: string): Promise<Blob> {
  return encryptBlob(new Blob([text]), passphrase);
}

/**
 * Convenience helper: decrypts back to a plain text string.
 */
export async function decryptText(data: Blob, passphrase: string): Promise<string> {
  const blob = await decryptBlob(data, passphrase);
  return blob.text();
}