// app/api/webauthn/register-options/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import { RP_NAME, RP_ID, signChallengeToken, WEBAUTHN_CHALLENGE_COOKIE, getPrfSaltBase64Url } from "@/lib/webauthn";
import { getCredentialsByScope, ensureWebauthnTable } from "@/lib/db";

const OWNER_USER_ID = isoUint8Array.fromUTF8String("vault-owner");

export async function POST(req: NextRequest) {
  try {
    await ensureWebauthnTable();
    const { scope } = await req.json();
    if (!scope || typeof scope !== "string") {
      return NextResponse.json({ error: "scope is required." }, { status: 400 });
    }

    const existing = await getCredentialsByScope(scope);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: OWNER_USER_ID,
      userName: scope === "global" ? "vault-pin" : `folder-${scope}`,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.credential_id })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
    });

    const challengeToken = await signChallengeToken(options.challenge, scope);

    const response = NextResponse.json({ ...options, prfSalt: getPrfSaltBase64Url(scope) });
    response.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, challengeToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 5,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("webauthn/register-options error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
