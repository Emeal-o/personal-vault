// lib/folderAccess.ts
// Issues and verifies short-lived tokens proving a protected folder was unlocked.

import { SignJWT, jwtVerify } from "jose";

const SESSION_SECRET = process.env.SESSION_SECRET!;
const FOLDER_ACCESS_DURATION_SECONDS = 60 * 30; // 30 minutes

export async function signFolderAccessToken(folderId: string): Promise<string> {
  const secret = new TextEncoder().encode(SESSION_SECRET);
  return new SignJWT({ folderId, unlocked: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${FOLDER_ACCESS_DURATION_SECONDS}s`)
    .sign(secret);
}

export async function verifyFolderAccessToken(
  token: string,
  folderId: string
): Promise<boolean> {
  try {
    const secret = new TextEncoder().encode(SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.unlocked === true && payload.folderId === folderId;
  } catch {
    return false;
  }
}

export const FOLDER_ACCESS_COOKIE_PREFIX = "folder_access_";