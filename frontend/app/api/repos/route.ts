import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  addRepository,
  disconnectRepository,
  getRepositories,
} from "@/lib/backend";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const repos = await getRepositories(token.id);
    return NextResponse.json(repos);
  } catch {
    return NextResponse.json(
      { error: "failed to load repositories" },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.accessToken || !token.id || !token.login) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    githubRepoId?: number;
    owner?: string;
    repoName?: string;
  };

  if (!body.githubRepoId || !body.owner || !body.repoName) {
    return NextResponse.json(
      { error: "missing required fields" },
      { status: 400 }
    );
  }

  try {
    const repo = await addRepository({
      githubUserId: Number(token.id),
      githubLogin: token.login,
      name: null,
      avatarUrl: null,
      githubRepoId: body.githubRepoId,
      owner: body.owner,
      repoName: body.repoName,
      accessToken: token.accessToken,
    });
    return NextResponse.json(repo);
  } catch {
    return NextResponse.json(
      { error: "failed to connect repository" },
      { status: 502 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { repositoryId?: number };

  if (!body.repositoryId) {
    return NextResponse.json(
      { error: "repositoryId is required" },
      { status: 400 }
    );
  }

  try {
    await disconnectRepository(body.repositoryId, Number(token.id));
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "failed to disconnect repository" },
      { status: 502 }
    );
  }
}
