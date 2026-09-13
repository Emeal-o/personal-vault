// lib/r2.ts
// Server-side R2 (S3-compatible) client setup and helpers.
// This file runs only on the server — never bundled to the browser.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  throw new Error(
    "Missing required R2 environment variables. Check Replit Secrets."
  );
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generates a short-lived presigned URL the browser can PUT a file to directly,
 * without the file ever passing through our server. Expires in 5 minutes.
 */
export async function getUploadUrl(key: string, expiresInSeconds = 300) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generates a short-lived presigned URL the browser can GET (download) from directly.
 * 1 hour, not 5 minutes: this URL is fetched once when the file list loads and then
 * sits in React state until the user acts on it (opening a row menu, picking a Move/Copy
 * destination, unlocking a folder, etc.), which can easily exceed a 5-minute window.
 */
export async function getDownloadUrl(key: string, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Lists all objects in the vault (for the gallery/dashboard view).
 */
export async function listObjects(prefix = "") {
  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: prefix,
  });
  const response = await r2Client.send(command);
  return response.Contents ?? [];
}

/**
 * Deletes an object from the vault.
 */
export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  await r2Client.send(command);
}

/**
 * Directly uploads/writes an object server-side (e.g. small JSON metadata files).
 * For actual file uploads from the browser, use getUploadUrl instead.
 */
export async function putObject(key: string, body: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await r2Client.send(command);
}

/**
 * Reads an object's raw bytes directly on the server, for streaming through
 * our own same-origin API route rather than having the browser fetch() a
 * third-party R2 URL directly (some mobile browsers/security software can
 * silently block cross-origin fetch() to unfamiliar storage domains even
 * when the URL, CORS policy, and everything else is correctly configured).
 */
export async function getObjectBytes(key: string): Promise<{ bytes: Uint8Array; contentType?: string }> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  const response = await r2Client.send(command);
  if (!response.Body) throw new Error("Object has no body.");
  const bytes = await response.Body.transformToByteArray();
  return { bytes, contentType: response.ContentType };
}

/**
 * Reads an object's body directly on the server (e.g. to parse small JSON metadata files).
 * For serving files to the browser, use getDownloadUrl instead.
 */
export async function getObject(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  const response = await r2Client.send(command);
  const body = await response.Body!.transformToString();
  return body;
}