// app/api/webauthn/auth-options/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { RP_ID, signChallengeToken, WEBAUTHN_CHALLENGE_COOKIE, getPrfSaltBase64Url } from "@/lib/webauthn";
import { getCredentialsByScope, ensureWebauthnTable } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await ensureWebauthnTable();
    const { scope } = await req.json();
    if (!scope || typeof scope !== "string") {
      return NextResponse.json({ error: "scope is required." }, { status: 400 });
    }

    const credentials = await getCredentialsByScope(scope);
    if (credentials.length === 0) {
      return NextResponse.json({ error: "Biometric not enabled for this." }, { status: 404 });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "required",
      allowCredentials: credentials.map((c) => ({
        id: c.credential_id,
        transports: c.transports as any,
      })),
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
    console.error("webauthn/auth-options error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
