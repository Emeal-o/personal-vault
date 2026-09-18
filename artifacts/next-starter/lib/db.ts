import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const sql = neon(process.env.DATABASE_URL);

export interface FileRecord {
  file_key: string;
  folder_id: string | null;
  display_name: string;
  providers: string[];
  size_bytes: number;
  created_at: string;
  is_favorite: boolean;
  tags: string[];
}

export async function ensureFilesTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS files (
      file_key TEXT PRIMARY KEY,
      folder_id TEXT,
      display_name TEXT NOT NULL,
      providers TEXT[] NOT NULL DEFAULT ARRAY['r2'],
      size_bytes BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`;
  await sql`CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files (folder_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_files_display_name ON files (display_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_files_is_favorite ON files (is_favorite)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_files_tags ON files USING GIN (tags)`;
}

export async function insertFileRecord(record: {
  fileKey: string;
  folderId: string | null;
  displayName: string;
  providers?: string[];
  sizeBytes: number;
}): Promise<void> {
  await sql`
    INSERT INTO files (file_key, folder_id, display_name, providers, size_bytes)
    VALUES (${record.fileKey}, ${record.folderId}, ${record.displayName}, ${record.providers ?? ['r2']}, ${record.sizeBytes})
    ON CONFLICT (file_key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      folder_id = EXCLUDED.folder_id,
      providers = EXCLUDED.providers,
      size_bytes = EXCLUDED.size_bytes
  `;
}

export async function deleteFileRecord(fileKey: string): Promise<void> {
  await sql`DELETE FROM files WHERE file_key = ${fileKey}`;
}

export async function renameFile(fileKey: string, folderId: string | null, newDisplayName: string): Promise<void> {
  await sql`
    INSERT INTO files (file_key, folder_id, display_name, size_bytes)
    VALUES (${fileKey}, ${folderId}, ${newDisplayName}, 0)
    ON CONFLICT (file_key) DO UPDATE SET display_name = EXCLUDED.display_name
  `;
}

export async function setFavorite(
  fileKey: string,
  folderId: string | null,
  displayName: string,
  isFavorite: boolean
): Promise<void> {
  // Upserts like renameFile does, in case this file predates the DB index
  // (e.g. an old pre-DB file that's never had a row written for it).
  await sql`
    INSERT INTO files (file_key, folder_id, display_name, is_favorite, size_bytes)
    VALUES (${fileKey}, ${folderId}, ${displayName}, ${isFavorite}, 0)
    ON CONFLICT (file_key) DO UPDATE SET is_favorite = EXCLUDED.is_favorite
  `;
}

export async function setFileTags(
  fileKey: string,
  folderId: string | null,
  displayName: string,
  tags: string[]
): Promise<void> {
  // Same upsert-in-case-of-a-pre-DB-file pattern as setFavorite.
  await sql`
    INSERT INTO files (file_key, folder_id, display_name, tags, size_bytes)
    VALUES (${fileKey}, ${folderId}, ${displayName}, ${tags}, 0)
    ON CONFLICT (file_key) DO UPDATE SET tags = EXCLUDED.tags
  `;
}

export async function getAllTags(): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT unnest(tags) AS tag FROM files ORDER BY tag
  `) as { tag: string }[];
  return rows.map((r) => r.tag);
}

export async function getDisplayNames(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const rows = (await sql`
    SELECT file_key, display_name FROM files WHERE file_key = ANY(${keys})
  `) as { file_key: string; display_name: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.file_key] = row.display_name;
  return map;
}

export interface FileMeta {
  displayName: string;
  isFavorite: boolean;
  tags: string[];
}

export async function getFileMeta(keys: string[]): Promise<Record<string, FileMeta>> {
  if (keys.length === 0) return {};
  const rows = (await sql`
    SELECT file_key, display_name, is_favorite, tags FROM files WHERE file_key = ANY(${keys})
  `) as { file_key: string; display_name: string; is_favorite: boolean; tags: string[] }[];
  const map: Record<string, FileMeta> = {};
  for (const row of rows) {
    map[row.file_key] = { displayName: row.display_name, isFavorite: row.is_favorite, tags: row.tags || [] };
  }
  return map;
}

export async function searchFiles(query: string): Promise<FileRecord[]> {
  const pattern = `%${query}%`;
  return (await sql`
    SELECT * FROM files
    WHERE display_name ILIKE ${pattern}
    ORDER BY created_at DESC
    LIMIT 50
  `) as FileRecord[];
}

export async function searchFilesByTag(tag: string): Promise<FileRecord[]> {
  return (await sql`
    SELECT * FROM files
    WHERE ${tag} = ANY(tags)
    ORDER BY created_at DESC
    LIMIT 50
  `) as FileRecord[];
}

// --- WebAuthn (biometric unlock) ---
//
// One table serves both the main-PIN biometric toggle and every
// per-folder biometric toggle. `scope` is either the literal string
// "global" (main PIN) or a folder's id. A scope counts as
// "biometric enabled" simply by having 1+ credential rows — there is
// no separate boolean flag to keep in sync with reality.

export interface WebauthnCredential {
  credential_id: string;
  scope: string;
  public_key: string;
  counter: number;
  transports: string[];
  created_at: string;
}

export async function ensureWebauthnTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      credential_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_webauthn_scope ON webauthn_credentials (scope)`;
}

export async function addCredential(record: {
  credentialId: string;
  scope: string;
  publicKey: string;
  counter: number;
  transports?: string[];
}): Promise<void> {
  await sql`
    INSERT INTO webauthn_credentials (credential_id, scope, public_key, counter, transports)
    VALUES (${record.credentialId}, ${record.scope}, ${record.publicKey}, ${record.counter}, ${record.transports ?? []})
  `;
}

export async function getCredentialsByScope(scope: string): Promise<WebauthnCredential[]> {
  return (await sql`
    SELECT * FROM webauthn_credentials WHERE scope = ${scope}
  `) as WebauthnCredential[];
}

export async function isBiometricEnabled(scope: string): Promise<boolean> {
  const rows = await getCredentialsByScope(scope);
  return rows.length > 0;
}

export async function getCredentialById(credentialId: string): Promise<WebauthnCredential | null> {
  const rows = (await sql`
    SELECT * FROM webauthn_credentials WHERE credential_id = ${credentialId}
  `) as WebauthnCredential[];
  return rows[0] ?? null;
}

export async function updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
  await sql`
    UPDATE webauthn_credentials SET counter = ${counter} WHERE credential_id = ${credentialId}
  `;
}

export async function deleteCredentialsByScope(scope: string): Promise<void> {
  await sql`DELETE FROM webauthn_credentials WHERE scope = ${scope}`;
}

// --- Folder biometric secrets (PRF-wrapped folder passphrases) ---
//
// The server only ever sees an opaque ciphertext + iv here. The key
// that decrypts it is derived client-side from the WebAuthn PRF
// extension's output and never touches the network or this table.

export interface FolderBiometricSecret {
  scope: string;
  wrapped_secret: string;
  iv: string;
  created_at: string;
}

export async function ensureFolderBiometricSecretsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS folder_biometric_secrets (
      scope TEXT PRIMARY KEY,
      wrapped_secret TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export async function setFolderBiometricSecret(
  scope: string,
  wrappedSecret: string,
  iv: string
): Promise<void> {
  await sql`
    INSERT INTO folder_biometric_secrets (scope, wrapped_secret, iv)
    VALUES (${scope}, ${wrappedSecret}, ${iv})
    ON CONFLICT (scope) DO UPDATE SET wrapped_secret = EXCLUDED.wrapped_secret, iv = EXCLUDED.iv
  `;
}

export async function getFolderBiometricSecret(scope: string): Promise<FolderBiometricSecret | null> {
  const rows = (await sql`
    SELECT * FROM folder_biometric_secrets WHERE scope = ${scope}
  `) as FolderBiometricSecret[];
  return rows[0] ?? null;
}

export async function deleteFolderBiometricSecret(scope: string): Promise<void> {
  await sql`DELETE FROM folder_biometric_secrets WHERE scope = ${scope}`;
}
