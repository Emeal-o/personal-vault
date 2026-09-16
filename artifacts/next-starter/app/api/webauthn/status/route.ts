// app/api/webauthn/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isBiometricEnabled, ensureWebauthnTable } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await ensureWebauthnTable();
    const { scope } = await req.json();
    if (!scope || typeof scope !== "string") {
      return NextResponse.json({ error: "scope is required." }, { status: 400 });
    }
    const enabled = await isBiometricEnabled(scope);
    return NextResponse.json({ enabled });
  } catch (err) {
    console.error("webauthn/status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
