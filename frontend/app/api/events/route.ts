import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getEvents } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const beforeParam = url.searchParams.get("beforeId");
    const events = await getEvents(token.id, {
      ...(limitParam ? { limit: Number(limitParam) } : {}),
      ...(beforeParam ? { beforeId: Number(beforeParam) } : {}),
    });
    return NextResponse.json(events);
  } catch {
    return NextResponse.json(
      { error: "failed to load events" },
      { status: 502 }
    );
  }
}
