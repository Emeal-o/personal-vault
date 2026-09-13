import bcrypt from "bcryptjs";
import { getObject } from "@/lib/r2";

export interface FolderMetadata {
  id: string;
  name: string;
  protected: boolean;
  passphraseHash?: string;
  deleteProtected?: boolean;
  deleteUsesUnlockPassphrase?: boolean;
  deletePassphraseHash?: string;
  createdAt: string;
}

export function generateFolderId(): string {
  return crypto.randomUUID();
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  return bcrypt.hash(passphrase, 10);
}

export async function verifyPassphrase(passphrase: string, hash: string): Promise<boolean> {
  return bcrypt.compare(passphrase, hash);
}

export function folderMetadataKey(folderId: string): string {
  return `folders/${folderId}/metadata.json`;
}

export function folderFileKey(folderId: string, filename: string): string {
  return `folders/${folderId}/${filename}`;
}

export async function getFolderMetadata(folderId: string): Promise<FolderMetadata | null> {
  try {
    const raw = await getObject(folderMetadataKey(folderId));
    return JSON.parse(raw) as FolderMetadata;
  } catch {
    return null;
  }
}