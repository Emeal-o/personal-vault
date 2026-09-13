// app/api/auth/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const PIN_HASH = process.env.PIN_HASH!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Very simple in-memory rate limiting (resets on server restart).
// Good enough for a single-user app; not meant for high-traffic production.
const attempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function getClientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") ?? "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    const now = Date.now();
    const record = attempts.get(clientKey);

    if (record && record.lockedUntil > now) {
      const secondsLeft = Math.ceil((record.lockedUntil - now) / 1000);
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${secondsLeft} seconds.` },
        { status: 429 }
      );
    }

    const { pin } = await req.json();

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN is required." }, { status: 400 });
    }

    const isValid = await bcrypt.compare(pin, PIN_HASH);

    if (!isValid) {
      const newCount = (record?.count ?? 0) + 1;
      attempts.set(clientKey, {
        count: newCount,
        lockedUntil: newCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0,
      });
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    // Success — clear attempt tracking and issue a signed session token.
    attempts.delete(clientKey);

    const secret = new TextEncoder().encode(SESSION_SECRET);
    const token = await new SignJWT({ authenticated: true })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
      .sign(secret);

    const response = NextResponse.json({ success: true });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: SESSION_DURATION_SECONDS,
      path: "/",
    });

    return response;
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}