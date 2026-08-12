import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { deleteRule, updateRule } from "@/lib/backend";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const repositoryId = Number(req.nextUrl.searchParams.get("repositoryId"));
  const id = Number((await params).id);
  if (!repositoryId || !id) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const input = await req.json();
    const rule = await updateRule(repositoryId, id, input);
    return NextResponse.json(rule);
  } catch {
    return NextResponse.json({ error: "failed to update rule" }, { status: 502 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const repositoryId = Number(req.nextUrl.searchParams.get("repositoryId"));
  const id = Number((await params).id);
  if (!repositoryId || !id) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    await deleteRule(repositoryId, id);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "failed to delete rule" }, { status: 502 });
  }
}
