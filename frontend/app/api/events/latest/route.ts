import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getLatestEvent } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const latest = await getLatestEvent(token.id);
    return NextResponse.json(latest);
  } catch {
    return NextResponse.json(
      { error: "failed to check events" },
      { status: 502 }
    );
  }
}
