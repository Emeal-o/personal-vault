// app/api/webauthn/auth-verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { SignJWT } from "jose";
import { RP_ID, ORIGIN, verifyChallengeToken, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn";
import { getCredentialById, updateCredentialCounter, ensureWebauthnTable } from "@/lib/db";
import { signFolderAccessToken, FOLDER_ACCESS_COOKIE_PREFIX } from "@/lib/folderAccess";

const SESSION_SECRET = process.env.SESSION_SECRET!;
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export async function POST(req: NextRequest) {
  try {
    await ensureWebauthnTable();
    const { scope, response: authResponse } = await req.json();
    if (!scope || typeof scope !== "string") {
      return NextResponse.json({ error: "scope is required." }, { status: 400 });
    }

    const challengeToken = req.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value;
    if (!challengeToken) {
      return NextResponse.json({ error: "No unlock in progress." }, { status: 400 });
    }

    const expectedChallenge = await verifyChallengeToken(challengeToken, scope);
    if (!expectedChallenge) {
      return NextResponse.json({ error: "Unlock expired. Try again." }, { status: 400 });
    }

    const stored = await getCredentialById(authResponse.id);
    if (!stored || stored.scope !== scope) {
      return NextResponse.json({ error: "Unknown credential." }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: stored.credential_id,
        publicKey: isoBase64URL.toBuffer(stored.public_key),
        counter: stored.counter,
        transports: stored.transports as any,
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Could not verify." }, { status: 401 });
    }

    await updateCredentialCounter(stored.credential_id, verification.authenticationInfo.newCounter);

    const res = NextResponse.json({ success: true });
    res.cookies.delete(WEBAUTHN_CHALLENGE_COOKIE);

    if (scope === "global") {
      const secret = new TextEncoder().encode(SESSION_SECRET);
      const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
        .sign(secret);
      res.cookies.set("session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: SESSION_DURATION_SECONDS,
        path: "/",
      });
    } else {
      const folderToken = await signFolderAccessToken(scope);
      res.cookies.set(`${FOLDER_ACCESS_COOKIE_PREFIX}${scope}`, folderToken, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 60 * 30,
        path: "/",
      });
    }

    return res;
  } catch (err) {
    console.error("webauthn/auth-verify error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
