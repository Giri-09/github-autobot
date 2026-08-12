import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createRule, getRules } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const repositoryId = Number(req.nextUrl.searchParams.get("repositoryId"));
  if (!repositoryId) {
    return NextResponse.json(
      { error: "repositoryId is required" },
      { status: 400 }
    );
  }

  try {
    const rules = await getRules(repositoryId);
    return NextResponse.json(rules);
  } catch {
    return NextResponse.json({ error: "failed to load rules" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const repositoryId = Number(req.nextUrl.searchParams.get("repositoryId"));
  if (!repositoryId) {
    return NextResponse.json(
      { error: "repositoryId is required" },
      { status: 400 }
    );
  }

  try {
    const input = await req.json();
    const rule = await createRule(repositoryId, input);
    return NextResponse.json(rule, { status: 201 });
  } catch {
    return NextResponse.json({ error: "failed to create rule" }, { status: 502 });
  }
}
