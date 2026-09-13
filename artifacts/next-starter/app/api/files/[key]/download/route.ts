import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getObjectBytes } from "@/lib/r2";
import { getFolderMetadata } from "@/lib/folders";
import { verifyFolderAccessToken, FOLDER_ACCESS_COOKIE_PREFIX } from "@/lib/folderAccess";

function folderIdFromKey(key: string): string | null {
  const match = key.match(/^folders\/([^/]+)\//);
  return match ? match[1] : null;
}

// Streams a file's bytes through our own server (same-origin) instead of the
// browser fetching R2's presigned URL directly. Used internally for
// decryption, Move/Copy, and Share — NOT for plain <img>/<a download> tags,
// which already work fine via the direct R2 URL and shouldn't add server load.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  const folderId = folderIdFromKey(decodedKey);

  if (folderId) {
    const folder = await getFolderMetadata(folderId);
    if (folder?.protected) {
      const token = req.cookies.get(`${FOLDER_ACCESS_COOKIE_PREFIX}${folderId}`)?.value;
      const valid = token ? await verifyFolderAccessToken(token, folderId) : false;
      if (!valid) {
        return NextResponse.json({ error: "Folder is locked." }, { status: 401 });
      }
    }
  }

  try {
    const { bytes, contentType } = await getObjectBytes(decodedKey);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read file." }, { status: 500 });
  }
}
