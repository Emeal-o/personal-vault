import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { listObjects, getDownloadUrl } from "@/lib/r2";
import { getFolderMetadata } from "@/lib/folders";
import { verifyFolderAccessToken, FOLDER_ACCESS_COOKIE_PREFIX } from "@/lib/folderAccess";
import { getFileMeta } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const folderId = req.nextUrl.searchParams.get("folderId");

  let prefix = "";

  if (folderId) {
    const folder = await getFolderMetadata(folderId);
    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    if (folder.protected) {
      const token = req.cookies.get(`${FOLDER_ACCESS_COOKIE_PREFIX}${folderId}`)?.value;
      const valid = token ? await verifyFolderAccessToken(token, folderId) : false;
      if (!valid) {
        return NextResponse.json(
          { error: "Folder is locked. Unlock it first." },
          { status: 401 }
        );
      }
    }

    prefix = `folders/${folderId}/`;
  }

  const objects = await listObjects(prefix);

  const filtered = objects
    .filter((obj) => !obj.Key?.endsWith("metadata.json"))
    .filter((obj) => folderId || !obj.Key?.startsWith("folders/"));

  const keys = filtered.map((obj) => obj.Key!).filter(Boolean);
  let meta: Record<string, { displayName: string; isFavorite: boolean; tags: string[] }> = {};
  try {
    meta = await getFileMeta(keys);
  } catch {
    // Postgres unreachable — fall back to key-derived names client-side, favorites/tags unavailable
  }

  const files = await Promise.all(
    filtered.map(async (obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      downloadUrl: await getDownloadUrl(obj.Key!),
      displayName: meta[obj.Key!]?.displayName || null,
      isFavorite: meta[obj.Key!]?.isFavorite || false,
      tags: meta[obj.Key!]?.tags || [],
    }))
  );

  return NextResponse.json({ files });
}
