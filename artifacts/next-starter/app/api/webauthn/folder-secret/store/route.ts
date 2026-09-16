// app/api/webauthn/folder-secret/store/route.ts
// Stores an opaque PRF-wrapped folder passphrase. The server never
// sees the plaintext passphrase's key here — only ciphertext + iv
// that were produced entirely in the browser.
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { setFolderBiometricSecret, ensureFolderBiometricSecretsTable } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthenticated(req))) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    await ensureFolderBiometricSecretsTable();
    const { scope, wrapped, iv } = await req.json();
    if (!scope || !wrapped || !iv) {
      return NextResponse.json({ error: "scope, wrapped, and iv are required." }, { status: 400 });
    }
    await setFolderBiometricSecret(scope, wrapped, iv);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("webauthn/folder-secret/store error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
