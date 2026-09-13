import { NextRequest, NextResponse } from "next/server";
import { putObject, getObject, listObjects } from "@/lib/r2";
import {
  generateFolderId,
  hashPassphrase,
  folderMetadataKey,
  FolderMetadata,
} from "@/lib/folders";
import { isAuthenticated } from "@/lib/session";

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, protect, passphrase, deleteProtect, deleteUsesUnlockPassphrase, deletePassphrase } =
    await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Folder name required" }, { status: 400 });
  }

  if (protect && (!passphrase || passphrase.length < 4)) {
    return NextResponse.json(
      { error: "Passphrase must be at least 4 characters" },
      { status: 400 }
    );
  }

  const reuseUnlockPassphrase = deleteProtect && deleteUsesUnlockPassphrase !== false;

  if (deleteProtect && reuseUnlockPassphrase && !protect) {
    return NextResponse.json(
      { error: "Folder must be passphrase-protected to reuse its unlock passphrase for deletion." },
      { status: 400 }
    );
  }

  if (deleteProtect && !reuseUnlockPassphrase && (!deletePassphrase || deletePassphrase.length < 4)) {
    return NextResponse.json(
      { error: "Delete passphrase must be at least 4 characters" },
      { status: 400 }
    );
  }

  const id = generateFolderId();

  const metadata: FolderMetadata = {
    id,
    name: name.trim(),
    protected: !!protect,
    createdAt: new Date().toISOString(),
  };

  if (protect) {
    metadata.passphraseHash = await hashPassphrase(passphrase);
  }

  if (deleteProtect) {
    metadata.deleteProtected = true;
    metadata.deleteUsesUnlockPassphrase = reuseUnlockPassphrase;
    if (!reuseUnlockPassphrase) {
      metadata.deletePassphraseHash = await hashPassphrase(deletePassphrase);
    }
  }

  await putObject(folderMetadataKey(id), JSON.stringify(metadata), "application/json");

  const { passphraseHash, deletePassphraseHash, ...safeMetadata } = metadata;

  return NextResponse.json({ folder: safeMetadata });
}

export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const objects = await listObjects("folders/");
  const metadataKeys = objects
    .map((obj) => obj.Key)
    .filter((key): key is string => !!key && key.endsWith("metadata.json"));

  const folders = await Promise.all(
    metadataKeys.map(async (key) => {
      const raw = await getObject(key);
      const metadata: FolderMetadata = JSON.parse(raw);
      const { passphraseHash, deletePassphraseHash, ...safeMetadata } = metadata;
      return safeMetadata;
    })
  );

  folders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json({ folders });
}