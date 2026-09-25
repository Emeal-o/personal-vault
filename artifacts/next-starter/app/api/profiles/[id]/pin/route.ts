import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { verifyMasterPin } from "@/lib/masterPin";
import {
  getProfileById,
  setProfilePin,
  removeProfilePin,
  verifyProfilePin,
} from "@/lib/db";

// POST: set a PIN for the first time, or change an existing one.
// Setting for the first time (no current pin_hash) needs nothing extra.
// Changing an existing PIN requires the current PIN as proof.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { newPin, currentPin } = body;

  if (!newPin || typeof newPin !== "string" || newPin.length < 4) {
    return NextResponse.json(
      { error: "New PIN must be at least 4 characters" },
      { status: 400 }
    );
  }

  const profile = await getProfileById(id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.pin_hash) {
    const valid =
      typeof currentPin === "string" &&
      (await verifyProfilePin(currentPin, profile.pin_hash));
    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect current PIN" },
        { status: 401 }
      );
    }
  }

  await setProfilePin(id, newPin);
  return NextResponse.json({ success: true });
}

// DELETE: remove PIN protection entirely. Requires the master PIN,
// not the profile's own PIN — this is a protection-stripping action.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { masterPin } = body;

  const masterValid = await verifyMasterPin(masterPin);
  if (!masterValid) {
    return NextResponse.json({ error: "Incorrect master PIN" }, { status: 401 });
  }

  const profile = await getProfileById(id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  await removeProfilePin(id);
  return NextResponse.json({ success: true });
}