import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getProfileById } from "@/lib/db";
import { setActiveProfileCookie, getActiveProfileId } from "@/lib/activeProfile";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ activeProfileId: null });
  }

  // Confirm the profile still exists — if it was deleted since the cookie
  // was set, clear it now rather than silently pointing at a dead profile.
  const profile = await getProfileById(profileId);
  if (!profile) {
    await setActiveProfileCookie(null);
    return NextResponse.json({ activeProfileId: null });
  }

  return NextResponse.json({ activeProfileId: profileId });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !("profileId" in body)) {
    return NextResponse.json({ error: "profileId is required (string or null)" }, { status: 400 });
  }

  const { profileId } = body as { profileId: string | null };

  if (profileId !== null) {
    const profile = await getProfileById(profileId);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
  }

  await setActiveProfileCookie(profileId);
  return NextResponse.json({ activeProfileId: profileId });
}