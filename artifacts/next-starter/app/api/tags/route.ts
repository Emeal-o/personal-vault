import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getAllTags } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const tags = await getAllTags();
    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
