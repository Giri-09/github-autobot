const API = "https://api.github.com";

export class GithubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function githubFetch(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GithubApiError(
      res.status,
      `GitHub API ${init?.method ?? "GET"} ${path} failed: ${res.status} ${body}`
    );
  }
  return res;
}

// Registers a webhook that delivers issues, pull requests and push events to
// our receiver. Returns the GitHub webhook id so we can manage it later.
export async function createWebhook(opts: {
  owner: string;
  name: string;
  accessToken: string;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<number> {
  const res = await githubFetch(
    `/repos/${opts.owner}/${opts.name}/hooks`,
    opts.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["issues", "pull_request", "push"],
        config: {
          url: opts.webhookUrl,
          content_type: "json",
          secret: opts.webhookSecret,
          insecure_ssl: "0",
        },
      }),
    }
  );
  const hook = (await res.json()) as { id: number };
  return hook.id;
}

// Removes the GitHub webhook when a repository is disconnected.
export function deleteWebhook(opts: {
  owner: string;
  name: string;
  accessToken: string;
  webhookId: number;
}): Promise<void> {
  return githubFetch(
    `/repos/${opts.owner}/${opts.name}/hooks/${opts.webhookId}`,
    opts.accessToken,
    { method: "DELETE" }
  ).then(() => undefined);
}

// Issues and pull requests share the same "issue" endpoints on GitHub.
export function addLabel(opts: {
  owner: string;
  name: string;
  accessToken: string;
  issueNumber: number;
  labels: string[];
}): Promise<void> {
  return githubFetch(
    `/repos/${opts.owner}/${opts.name}/issues/${opts.issueNumber}/labels`,
    opts.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ labels: opts.labels }),
    }
  ).then(() => undefined);
}

export function addComment(opts: {
  owner: string;
  name: string;
  accessToken: string;
  issueNumber: number;
  body: string;
}): Promise<void> {
  return githubFetch(
    `/repos/${opts.owner}/${opts.name}/issues/${opts.issueNumber}/comments`,
    opts.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ body: opts.body }),
    }
  ).then(() => undefined);
}
