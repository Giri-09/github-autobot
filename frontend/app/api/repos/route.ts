import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { addRepository } from "@/lib/backend";

const GH_API = "https://api.github.com";

type GithubRepo = {
  id: number;
  owner: { login: string };
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  pushed_at: string;
};

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = await fetch(
    `${GH_API}/user/repos?affiliation=owner,collaborator&per_page=100&sort=updated`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "failed to fetch repositories from GitHub" },
      { status: res.status }
    );
  }

  const repos = (await res.json()) as GithubRepo[];
  return NextResponse.json(
    repos.map((r) => ({
      id: r.id,
      owner: r.owner.login,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      default_branch: r.default_branch,
      pushed_at: r.pushed_at,
    }))
  );
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
