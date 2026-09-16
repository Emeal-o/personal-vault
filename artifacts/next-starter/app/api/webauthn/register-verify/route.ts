// app/api/webauthn/register-verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { RP_ID, ORIGIN, verifyChallengeToken, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn";
import { addCredential, ensureWebauthnTable } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await ensureWebauthnTable();
    const { scope, response: attResponse } = await req.json();
    if (!scope || typeof scope !== "string") {
      return NextResponse.json({ error: "scope is required." }, { status: 400 });
    }

    const challengeToken = req.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value;
    if (!challengeToken) {
      return NextResponse.json({ error: "No registration in progress." }, { status: 400 });
    }

    const expectedChallenge = await verifyChallengeToken(challengeToken, scope);
    if (!expectedChallenge) {
      return NextResponse.json({ error: "Registration expired. Try again." }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: attResponse,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Could not verify device." }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;

    await addCredential({
      credentialId: credential.id,
      scope,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
    });

    const res = NextResponse.json({ success: true });
    res.cookies.delete(WEBAUTHN_CHALLENGE_COOKIE);
    return res;
  } catch (err) {
    console.error("webauthn/register-verify error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
