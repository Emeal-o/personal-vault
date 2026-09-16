import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { ensureFilesTable, ensureWebauthnTable, insertFileRecord } from "@/lib/db";

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { key, filename, folderId, sizeBytes } = await req.json();

  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required." }, { status: 400 });
  }
  if (typeof sizeBytes !== "number" || sizeBytes < 0) {
    return NextResponse.json({ error: "sizeBytes must be a non-negative number." }, { status: 400 });
  }

  await ensureFilesTable();
  await ensureWebauthnTable();
  await insertFileRecord({
    fileKey: key,
    folderId: folderId ?? null,
    displayName: filename,
    sizeBytes,
  });

  return NextResponse.json({ success: true });
}