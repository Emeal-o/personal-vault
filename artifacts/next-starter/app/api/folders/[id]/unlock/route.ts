import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getFolderMetadata, verifyPassphrase } from "@/lib/folders";
import { signFolderAccessToken, FOLDER_ACCESS_COOKIE_PREFIX } from "@/lib/folderAccess";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { passphrase } = await req.json();

  if (!passphrase || typeof passphrase !== "string") {
    return NextResponse.json({ error: "Passphrase required" }, { status: 400 });
  }

  const folder = await getFolderMetadata(id);

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (!folder.protected || !folder.passphraseHash) {
    return NextResponse.json(
      { error: "This folder is not protected" },
      { status: 400 }
    );
  }

  const valid = await verifyPassphrase(passphrase, folder.passphraseHash);

  if (!valid) {
    return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
  }

  const token = await signFolderAccessToken(id);

  const response = NextResponse.json({ success: true });
  response.cookies.set(`${FOLDER_ACCESS_COOKIE_PREFIX}${id}`, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 60 * 30,
    path: "/",
  });

  return response;
}