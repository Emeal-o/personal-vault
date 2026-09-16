// app/api/auth/verify-pin/route.ts
// PIN-only check, no session cookie issued. Used to gate turning
// biometric unlock on/off (global or per-folder) — every toggle flip
// must pass through here first.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const PIN_HASH = process.env.PIN_HASH!;

const attempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

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

    attempts.delete(clientKey);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
