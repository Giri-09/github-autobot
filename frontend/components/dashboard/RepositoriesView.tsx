"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertIcon, ClockIcon, PlusIcon, RepoIcon } from "./icons";
import type { ConnectedRepository } from "@/lib/backend";

export function RepositoriesView({
  repos,
  onConnect,
  onDisconnect,
  loading,
}: {
  repos: ConnectedRepository[];
  onConnect: () => void;
  onDisconnect: (repositoryId: number) => Promise<void>;
  loading: boolean;
}) {
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect(repo: ConnectedRepository) {
    const confirmed = window.confirm(
      `Disconnect ${repo.owner}/${repo.name}?\n\nThe GitHub webhook and all rules for this repo will be removed.`
    );
    if (!confirmed) return;

    setDisconnectingId(repo.id);
    setError(null);
    try {
      await onDisconnect(repo.id);
    } catch {
      setError(`Failed to disconnect ${repo.owner}/${repo.name}. Try again.`);
      setDisconnectingId(null);
    }
  }
  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<RepoIcon className="h-5 w-5" />}
        title="No repositories connected"
        description="Connect a repository you own and the bot will watch it for issues, pull requests, and pushes."
        action={
          <Button onClick={onConnect}>
            <PlusIcon className="h-4 w-4" /> Connect a repository
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Repositories
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {repos.length} connected · webhooks deliver events here
          </p>
        </div>
        <Button onClick={onConnect}>
          <PlusIcon className="h-4 w-4" /> Connect
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading...</p>
      ) : (
        <>
          {error && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {repos.map((repo) => (
            <li
              key={repo.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <RepoIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {repo.owner}/{repo.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {repo.event_count} event
                      {repo.event_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {repo.webhook_id !== null ? (
                  <Badge tone="green">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Webhook active
                  </Badge>
                ) : (
                  <Badge tone="amber">
                    <AlertIcon className="h-3 w-3" /> Webhook pending
                  </Badge>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800">
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="h-3.5 w-3.5" />
                  Connected{" "}
                  {new Date(repo.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleDisconnect(repo)}
                  disabled={disconnectingId === repo.id}
                  className="font-medium text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {disconnectingId === repo.id
                    ? "Disconnecting..."
                    : "Disconnect"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
