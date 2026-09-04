// app/api/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { listObjects, getDownloadUrl } from "@/lib/r2";

// GET: list all files in the vault, each with a short-lived download URL
export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const objects = await listObjects();

  const files = await Promise.all(
    objects.map(async (obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      downloadUrl: await getDownloadUrl(obj.Key!),
    }))
  );

  return NextResponse.json({ files });
}