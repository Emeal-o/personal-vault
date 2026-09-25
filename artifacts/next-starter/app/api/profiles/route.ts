import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { verifyMasterPin } from "@/lib/masterPin";
import { ensureProfilesTable, getProfiles, createProfile } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureProfilesTable();
  const profiles = await getProfiles();
  return NextResponse.json({ profiles });
}

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, avatarId, avatarUrl, pin, masterPin } = body;

  const masterValid = await verifyMasterPin(masterPin);
  if (!masterValid) {
    return NextResponse.json({ error: "Incorrect master PIN" }, { status: 401 });
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Profile name required" }, { status: 400 });
  }

  if (pin && (typeof pin !== "string" || pin.length < 4)) {
    return NextResponse.json({ error: "PIN must be at least 4 characters" }, { status: 400 });
  }

  await ensureProfilesTable();
  const profile = await createProfile({
    name: name.trim(),
    avatarId: avatarId ?? null,
    avatarUrl: avatarUrl ?? null,
    pin: pin ?? null,
  });

  return NextResponse.json({ profile });
}