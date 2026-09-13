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
  await sql`CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files (folder_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_files_display_name ON files (display_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_files_is_favorite ON files (is_favorite)`;
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
}

export async function getFileMeta(keys: string[]): Promise<Record<string, FileMeta>> {
  if (keys.length === 0) return {};
  const rows = (await sql`
    SELECT file_key, display_name, is_favorite FROM files WHERE file_key = ANY(${keys})
  `) as { file_key: string; display_name: string; is_favorite: boolean }[];
  const map: Record<string, FileMeta> = {};
  for (const row of rows) {
    map[row.file_key] = { displayName: row.display_name, isFavorite: row.is_favorite };
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