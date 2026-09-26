import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import {
  ensureFilesTable,
  ensureWebauthnTable,
  insertFileRecord,
  getProfileById,
  getProfileStorageUsedBytes,
  setFileProfileId,
} from "@/lib/db";
import { getActiveProfileId } from "@/lib/activeProfile";

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { key, filename, folderId, sizeBytes } = await req.json();

  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required." }, { status: 400 });
  }
  if (typeof sizeBytes !== "number" || sizeBytes < 0) {
    return NextResponse.json({ error: "sizeBytes must be a non-negative number." }, { status: 400 });
  }

  await ensureFilesTable();
  await ensureWebauthnTable();

  // Quota enforcement: only applies if an active profile is set AND that
  // profile has a storage limit configured. No active profile, or a profile
  // with no limit set, means unlimited (matches "quota is opt-in" design).
  const activeProfileId = await getActiveProfileId();

  if (activeProfileId) {
    const profile = await getProfileById(activeProfileId);

    // Active profile cookie points at a deleted profile — don't block the
    // upload over a stale reference, just skip quota enforcement for it.
    if (profile && profile.storage_limit_bytes !== null) {
      const usedBytes = await getProfileStorageUsedBytes(activeProfileId);
      if (usedBytes + sizeBytes > profile.storage_limit_bytes) {
        return NextResponse.json(
          {
            error: "Storage limit exceeded for this profile.",
            usedBytes,
            limitBytes: profile.storage_limit_bytes,
          },
          { status: 413 }
        );
      }
    }
  }

  await insertFileRecord({
    fileKey: key,
    folderId: folderId ?? null,
    displayName: filename,
    sizeBytes,
  });

  if (activeProfileId) {
    await setFileProfileId(key, activeProfileId);
  }

  return NextResponse.json({ success: true });
}