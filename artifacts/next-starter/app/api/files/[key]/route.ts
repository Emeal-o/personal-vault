import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { deleteObject } from "@/lib/r2";
import { deleteFileRecord, ensureFilesTable, renameFile, setFavorite, getFileMeta } from "@/lib/db";

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
  const { displayName, isFavorite } = body as { displayName?: string; isFavorite?: boolean };

  if (displayName === undefined && isFavorite === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await ensureFilesTable();
  const folderId = folderIdFromKey(decodedKey);

  if (displayName !== undefined) {
    if (typeof displayName !== "string" || !displayName.trim()) {
      return NextResponse.json({ error: "displayName is required." }, { status: 400 });
    }
    await renameFile(decodedKey, folderId, displayName.trim());
  }

  if (isFavorite !== undefined) {
    if (typeof isFavorite !== "boolean") {
      return NextResponse.json({ error: "isFavorite must be a boolean." }, { status: 400 });
    }

    let nameForUpsert = typeof displayName === "string" ? displayName.trim() : undefined;
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

    await setFavorite(decodedKey, folderId, nameForUpsert, isFavorite);
  }

  return NextResponse.json({ success: true });
}