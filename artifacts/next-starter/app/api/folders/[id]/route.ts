import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { deleteObject, listObjects } from "@/lib/r2";
import { getFolderMetadata, verifyPassphrase } from "@/lib/folders";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const folder = await getFolderMetadata(id);
  if (!folder) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }

  if (folder.deleteProtected) {
    let passphrase = "";
    try {
      const body = await req.json();
      passphrase = body?.passphrase || "";
    } catch {
      // no body provided
    }

    const hashToCheck = folder.deleteUsesUnlockPassphrase
      ? folder.passphraseHash
      : folder.deletePassphraseHash;

    if (!hashToCheck || !passphrase || !(await verifyPassphrase(passphrase, hashToCheck))) {
      return NextResponse.json({ error: "Incorrect passphrase." }, { status: 401 });
    }
  }

  const objects = await listObjects(`folders/${id}/`);
  await Promise.all(
    objects.map((obj) => (obj.Key ? deleteObject(obj.Key) : Promise.resolve()))
  );

  return NextResponse.json({ success: true });
}