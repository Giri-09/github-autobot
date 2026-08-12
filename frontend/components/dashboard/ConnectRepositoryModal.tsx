"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckIcon, RepoIcon, SearchIcon } from "./icons";

export type GitHubRepo = {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  pushed_at: string;
};

export function ConnectRepositoryModal({
  open,
  onClose,
  onConnected,
  onRetry,
  connectedFullNames,
  repos,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
  onRetry: () => void;
  connectedFullNames: Set<string>;
  repos: GitHubRepo[] | null;
  loading: boolean;
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [connecting, setConnecting] = useState<number | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!repos) return [];
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
    );
  }, [repos, query]);

  const connect = async (repo: GitHubRepo) => {
    setConnecting(repo.id);
    setConnectError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubRepoId: repo.id,
          owner: repo.owner,
          repoName: repo.name,
        }),
      });
      if (!res.ok) throw new Error("Failed to connect repository");
      onConnected();
      onClose();
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : "Failed to connect repository"
      );
    } finally {
      setConnecting(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect a repository">
      <div className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your repositories..."
          autoFocus
          className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-500"
        />
      </div>

      {connectError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {connectError}
        </p>
      )}

      {error ? (
        <EmptyState
          title="Could not load repositories"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      ) : loading || repos === null ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
          <Spinner /> Loading repositories...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query ? "No matches" : "No repositories found"}
          description={
            query
              ? "Try a different search term."
              : "Create a repository on GitHub first, then connect it here."
          }
        />
      ) : (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {filtered.map((repo) => {
            const already = connectedFullNames.has(repo.full_name);
            const busy = connecting === repo.id;
            return (
              <li key={repo.id} className="flex items-center gap-3 px-4 py-3">
                <RepoIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {repo.full_name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {repo.private ? "Private" : "Public"} ·{" "}
                    {repo.description || repo.default_branch}
                  </p>
                </div>
                {already ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckIcon className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || connecting !== null}
                    onClick={() => connect(repo)}
                  >
                    {busy ? <Spinner className="h-3.5 w-3.5" /> : "Connect"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
