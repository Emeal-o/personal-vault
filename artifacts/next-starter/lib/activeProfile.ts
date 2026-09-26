import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "active_profile";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Signs and sets the active-profile cookie. Pass profileId = null to clear
 * the active profile (e.g. returning to the vault-wide / no-profile view).
 */
export async function setActiveProfileCookie(profileId: string | null): Promise<void> {
  const cookieStore = await cookies();

  if (profileId === null) {
    cookieStore.delete(COOKIE_NAME);
    return;
  }

  const token = await new SignJWT({ profileId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Reads and verifies the active-profile cookie. Returns null if absent,
 * expired, or tampered with (bad signature) — never throws for those cases,
 * so callers can always safely fall back to "no active profile."
 */
export async function getActiveProfileId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.profileId === "string" ? payload.profileId : null;
  } catch {
    return null;
  }
}