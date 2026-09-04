// app/api/upload-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getUploadUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { filename } = await req.json();

  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required." }, { status: 400 });
  }

  // Sanitize the filename to prevent path traversal (e.g. "../../etc/passwd")
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Prefix with a timestamp so uploads never overwrite each other
  const key = `${Date.now()}-${safeName}`;

  const uploadUrl = await getUploadUrl(key);

  return NextResponse.json({ uploadUrl, key });
}