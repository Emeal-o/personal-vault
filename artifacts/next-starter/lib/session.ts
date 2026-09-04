// lib/session.ts
// Verifies the signed session cookie issued by /api/auth.
// Use this at the top of any protected API route.

import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_SECRET = process.env.SESSION_SECRET!;

export async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("session")?.value;

  if (!token) {
    return false;
  }

  try {
    const secret = new TextEncoder().encode(SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.authenticated === true;
  } catch {
    // Token invalid, expired, or tampered with
    return false;
  }
}