export type GithubProfile = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
};

export type ConnectedRepository = {
  id: number;
  github_repo_id: number;
  owner: string;
  name: string;
  webhook_id: number | null;
  active: boolean;
  created_at: string;
  event_count: number;
};

export type ActionLog = {
  id: number;
  type: string;
  status: string;
  detail: string | null;
  created_at: string;
};

export type RepoEvent = {
  id: number;
  repository_id: number;
  github_delivery_id: string;
  event_type: string;
  action: string | null;
  status: string;
  received_at: string;
  processed_at: string | null;
  owner: string;
  repo_name: string;
  ai_summary: string | null;
  action_logs: ActionLog[];
};

export type Rule = {
  id: number;
  repository_id: number;
  event_type: string;
  match_field: string;
  match_value: string;
  action_type: string;
  action_value: string;
  notify_slack: boolean;
  ai_enabled: boolean;
  enabled: boolean;
  created_at: string;
};

export type RuleInput = {
  eventType: string;
  matchField: string;
  matchValue: string;
  actionType: string;
  actionValue: string;
  notifySlack: boolean;
  aiEnabled: boolean;
  enabled: boolean;
};

async function internalFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${process.env.BACKEND_URL}/internal${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET as string,
      ...(init?.headers ?? {}),
    },
  });
}

// Syncs GitHub profile info to the backend's users table - fire-and-forget, never blocks sign-in
export async function upsertUser(profile: GithubProfile) {
  await internalFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      githubUserId: profile.id,
      githubLogin: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
    }),
  });
}

export async function getRepositories(
  githubUserId: string
): Promise<ConnectedRepository[]> {
  const res = await internalFetch(
    `/repositories?githubUserId=${encodeURIComponent(githubUserId)}`
  );
  if (!res.ok) throw new Error("failed to load repositories");
  return res.json();
}

export async function addRepository(body: {
  githubUserId: number;
  githubLogin: string;
  name: string | null;
  avatarUrl: string | null;
  githubRepoId: number;
  owner: string;
  repoName: string;
  accessToken: string;
}): Promise<ConnectedRepository> {
  const res = await internalFetch("/repositories", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("failed to connect repository");
  return res.json();
}

export async function disconnectRepository(
  repositoryId: number,
  githubUserId: number
): Promise<void> {
  const res = await internalFetch(`/repositories/${repositoryId}`, {
    method: "DELETE",
    body: JSON.stringify({ githubUserId }),
  });
  if (!res.ok) throw new Error("failed to disconnect repository");
}

export async function getEvents(githubUserId: string): Promise<RepoEvent[]> {
  const res = await internalFetch(
    `/events?githubUserId=${encodeURIComponent(githubUserId)}`
  );
  if (!res.ok) throw new Error("failed to load events");
  return res.json();
}

export async function getRules(repositoryId: number): Promise<Rule[]> {
  const res = await internalFetch(`/repositories/${repositoryId}/rules`);
  if (!res.ok) throw new Error("failed to load rules");
  return res.json();
}

export async function createRule(
  repositoryId: number,
  input: RuleInput
): Promise<Rule> {
  const res = await internalFetch(`/repositories/${repositoryId}/rules`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("failed to create rule");
  return res.json();
}

export async function updateRule(
  repositoryId: number,
  id: number,
  input: RuleInput
): Promise<Rule> {
  const res = await internalFetch(
    `/repositories/${repositoryId}/rules/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw new Error("failed to update rule");
  return res.json();
}

export async function deleteRule(
  repositoryId: number,
  id: number
): Promise<void> {
  const res = await internalFetch(
    `/repositories/${repositoryId}/rules/${id}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("failed to delete rule");
}
