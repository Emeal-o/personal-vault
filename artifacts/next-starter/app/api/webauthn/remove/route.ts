// app/api/webauthn/remove/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteCredentialsByScope, deleteFolderBiometricSecret, ensureWebauthnTable, ensureFolderBiometricSecretsTable } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await ensureWebauthnTable();
    await ensureFolderBiometricSecretsTable();
    const { scope } = await req.json();
    if (!scope || typeof scope !== "string") {
      return NextResponse.json({ error: "scope is required." }, { status: 400 });
    }
    await deleteCredentialsByScope(scope);
    await deleteFolderBiometricSecret(scope);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("webauthn/remove error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
