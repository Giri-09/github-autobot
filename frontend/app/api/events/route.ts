import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getEvents } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const events = await getEvents(token.id);
    return NextResponse.json(events);
  } catch {
    return NextResponse.json(
      { error: "failed to load events" },
      { status: 502 }
    );
  }
}
