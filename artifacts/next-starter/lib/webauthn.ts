// lib/webauthn.ts
// WebAuthn (biometric unlock) shared config + short-lived signed
// challenge tokens, plus a deterministic per-scope PRF salt.
//
// The PRF salt is safe to compute server-side and hand to the client
// in the options response — it's not secret, it's just an input to
// the authenticator's PRF function. The actual derived secret that
// comes back from the authenticator is never sent to the server.
import { SignJWT, jwtVerify } from "jose";
import { createHash } from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET!;
const CHALLENGE_DURATION_SECONDS = 60 * 5; // 5 minutes to complete a ceremony

export const RP_NAME = "Vault";
export const RP_ID = process.env.WEBAUTHN_RP_ID ?? "emealo.vercel.app";
export const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "https://emealo.vercel.app";

export const WEBAUTHN_CHALLENGE_COOKIE = "webauthn_challenge";

export async function signChallengeToken(challenge: string, scope: string): Promise<string> {
  const secret = new TextEncoder().encode(SESSION_SECRET);
  return new SignJWT({ challenge, scope })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_DURATION_SECONDS}s`)
    .sign(secret);
}

export async function verifyChallengeToken(
  token: string,
  scope: string
): Promise<string | null> {
  try {
    const secret = new TextEncoder().encode(SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.scope !== scope || typeof payload.challenge !== "string") {
      return null;
    }
    return payload.challenge;
  } catch {
    return null;
  }
}

// Deterministic 32-byte salt per scope, base64url-encoded for the
// client to decode and pass into the PRF extension's `eval.first`.
export function getPrfSaltBase64Url(scope: string): string {
  const digest = createHash("sha256").update(`vault-prf-salt:${scope}`).digest();
  return digest.toString("base64url");
}
