import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { searchFiles } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchFiles(q.trim());
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}