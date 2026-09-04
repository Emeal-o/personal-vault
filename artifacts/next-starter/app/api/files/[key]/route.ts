// app/api/files/[key]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { deleteObject } from "@/lib/r2";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { key } = await params;
  await deleteObject(decodeURIComponent(key));

  return NextResponse.json({ success: true });
}