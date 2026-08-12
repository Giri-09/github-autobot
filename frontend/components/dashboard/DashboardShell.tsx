"use client";

import { useCallback, useState } from "react";
import { Sidebar, type ViewId } from "./Sidebar";
import { RepositoriesView } from "./RepositoriesView";
import { ActivityView } from "./ActivityView";
import { RulesView } from "./RulesView";
import {
  ConnectRepositoryModal,
  type GitHubRepo,
} from "./ConnectRepositoryModal";
import type { ConnectedRepository, RepoEvent } from "@/lib/backend";

export function DashboardShell({
  initialRepos,
  initialEvents,
  user,
}: {
  initialRepos: ConnectedRepository[];
  initialEvents: RepoEvent[];
  user: {
    name?: string | null;
    login?: string;
    image?: string | null;
  };
}) {
  const [activeView, setActiveView] = useState<ViewId>("repositories");
  const [repos, setRepos] = useState<ConnectedRepository[]>(initialRepos);
  const [events, setEvents] = useState<RepoEvent[]>(initialEvents);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[] | null>(null);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [githubReposError, setGithubReposError] = useState<string | null>(null);

  const refreshRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/repos");
      if (res.ok) setRepos(await res.json());
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/events");
      if (res.ok) setEvents(await res.json());
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const loadGithubRepos = useCallback(async () => {
    setGithubReposLoading(true);
    setGithubReposError(null);
    try {
      const res = await fetch("/api/repos/github");
      if (!res.ok) throw new Error("Failed to load your repositories");
      setGithubRepos(await res.json());
    } catch (e) {
      setGithubReposError(
        e instanceof Error ? e.message : "Failed to load repositories"
      );
    } finally {
      setGithubReposLoading(false);
    }
  }, []);

  const openConnect = useCallback(() => {
    setConnectOpen(true);
    loadGithubRepos();
  }, [loadGithubRepos]);

  const handleConnected = useCallback(async () => {
    await Promise.all([refreshRepos(), refreshEvents()]);
  }, [refreshRepos, refreshEvents]);

  const handleDisconnected = useCallback(
    async (repositoryId: number) => {
      const res = await fetch("/api/repos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId }),
      });
      if (!res.ok) throw new Error("failed to disconnect");
      await Promise.all([refreshRepos(), refreshEvents()]);
    },
    [refreshRepos, refreshEvents]
  );

  const connectedFullNames = new Set(
    repos.map((r) => `${r.owner}/${r.name}`)
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeView={activeView} onSelect={setActiveView} user={user} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-8 py-8">
          {activeView === "repositories" && (
            <RepositoriesView
              repos={repos}
              onConnect={openConnect}
              onDisconnect={handleDisconnected}
              loading={loadingRepos}
            />
          )}
          {activeView === "activity" && (
            <ActivityView
              events={events}
              onRefresh={refreshEvents}
              loading={loadingEvents}
            />
          )}
          {activeView === "rules" && <RulesView repos={repos} />}
        </div>
      </main>

      <ConnectRepositoryModal
        key={connectOpen ? "open" : "closed"}
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnected={handleConnected}
        onRetry={loadGithubRepos}
        connectedFullNames={connectedFullNames}
        repos={githubRepos}
        loading={githubReposLoading}
        error={githubReposError}
      />
    </div>
  );
}
