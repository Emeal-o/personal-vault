import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getUploadUrl } from "@/lib/r2";
import { getFolderMetadata, folderFileKey } from "@/lib/folders";
import { verifyFolderAccessToken, FOLDER_ACCESS_COOKIE_PREFIX } from "@/lib/folderAccess";

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { filename, folderId } = await req.json();

  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required." }, { status: 400 });
  }

  // Sanitize the filename to prevent path traversal (e.g. "../../etc/passwd")
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  let key: string;

  if (folderId) {
    // Uploading into a specific folder — check it exists and, if protected,
    // that the caller has already unlocked it.
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

    key = folderFileKey(folderId, `${Date.now()}-${safeName}`);
  } else {
    // Default vault upload (unchanged behavior, no folder)
    key = `${Date.now()}-${safeName}`;
  }

  const uploadUrl = await getUploadUrl(key);

  return NextResponse.json({ uploadUrl, key });
}