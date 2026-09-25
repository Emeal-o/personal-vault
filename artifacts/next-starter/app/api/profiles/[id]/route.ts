import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { verifyMasterPin } from "@/lib/masterPin";
import { getProfileById, updateProfileDetails, deleteProfile } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, avatarId, avatarUrl } = body;

  const existing = await getProfileById(id);
  if (!existing) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = await updateProfileDetails(id, { name, avatarId, avatarUrl });
  return NextResponse.json({ profile });
}

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

  const existing = await getProfileById(id);
  if (!existing) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  await deleteProfile(id);
  return NextResponse.json({ success: true });
}