// app/api/webauthn/folder-secret/fetch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getFolderBiometricSecret, ensureFolderBiometricSecretsTable } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthenticated(req))) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    await ensureFolderBiometricSecretsTable();
    const { scope } = await req.json();
    if (!scope) {
      return NextResponse.json({ error: "scope is required." }, { status: 400 });
    }
    const record = await getFolderBiometricSecret(scope);
    if (!record) {
      return NextResponse.json({ error: "No wrapped secret for this folder." }, { status: 404 });
    }
    return NextResponse.json({ wrapped: record.wrapped_secret, iv: record.iv });
  } catch (err) {
    console.error("webauthn/folder-secret/fetch error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
