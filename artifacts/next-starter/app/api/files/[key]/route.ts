import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { deleteObject } from "@/lib/r2";
import { deleteFileRecord, ensureFilesTable, ensureWebauthnTable, renameFile, setFavorite, setFileTags, getFileMeta } from "@/lib/db";

function folderIdFromKey(key: string): string | null {
  const match = key.match(/^folders\/([^/]+)\//);
  return match ? match[1] : null;
}

function fallbackDisplayName(key: string): string {
  const parts = key.split("/");
  const last = parts[parts.length - 1];
  return last.replace(/^\d+-/, "");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  await deleteObject(decodedKey);

  try {
    await deleteFileRecord(decodedKey);
  } catch {
    // Postgres unreachable — the file is still deleted from storage
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  const body = await req.json();
  const { displayName, isFavorite, tags } = body as { displayName?: string; isFavorite?: boolean; tags?: string[] };

  if (displayName === undefined && isFavorite === undefined && tags === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await ensureFilesTable();
  await ensureWebauthnTable();
  const folderId = folderIdFromKey(decodedKey);

  if (displayName !== undefined) {
    if (typeof displayName !== "string" || !displayName.trim()) {
      return NextResponse.json({ error: "displayName is required." }, { status: 400 });
    }
    await renameFile(decodedKey, folderId, displayName.trim());
  }

  let nameForUpsert: string | undefined;
  if (isFavorite !== undefined || tags !== undefined) {
    nameForUpsert = typeof displayName === "string" ? displayName.trim() : undefined;
    if (!nameForUpsert) {
      try {
        const meta = await getFileMeta([decodedKey]);
        nameForUpsert = meta[decodedKey]?.displayName;
      } catch {
        // fall through to key-derived fallback
      }
    }
    if (!nameForUpsert) {
      nameForUpsert = fallbackDisplayName(decodedKey);
    }
  }

  if (isFavorite !== undefined) {
    if (typeof isFavorite !== "boolean") {
      return NextResponse.json({ error: "isFavorite must be a boolean." }, { status: 400 });
    }
    await setFavorite(decodedKey, folderId, nameForUpsert!, isFavorite);
  }

  if (tags !== undefined) {
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
      return NextResponse.json({ error: "tags must be an array of strings." }, { status: 400 });
    }
    const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, 20);
    await setFileTags(decodedKey, folderId, nameForUpsert!, cleaned);
  }

  return NextResponse.json({ success: true });
}
