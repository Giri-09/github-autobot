"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Sidebar, navItems, type ViewId } from "./Sidebar";
import { BotLogo } from "./icons";
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
  initialActiveView = "repositories",
  initialHasMore = false,
}: {
  initialRepos: ConnectedRepository[];
  initialEvents: RepoEvent[];
  user: {
    name?: string | null;
    login?: string;
    image?: string | null;
  };
  initialActiveView?: ViewId;
  initialHasMore?: boolean;
}) {
  const [activeView, setActiveView] = useState<ViewId>(initialActiveView);

  const selectView = useCallback((view: ViewId) => {
    setActiveView(view);
    document.cookie = `autobot:view=${view}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  const [repos, setRepos] = useState<ConnectedRepository[]>(initialRepos);
  const [events, setEvents] = useState<RepoEvent[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [livePulse, setLivePulse] = useState(false);
  const lastSeenRef = useRef(initialEvents[0]?.id ?? 0);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[] | null>(null);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [githubReposError, setGithubReposError] = useState<string | null>(null);

  const flashLive = useCallback(() => {
    setLivePulse(true);
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = setTimeout(() => setLivePulse(false), 3000);
  }, []);

  useEffect(
    () => () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    },
    []
  );

  const refreshRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/repos");
      if (res.ok) {
        setRepos(await res.json());
        setReposError(null);
      } else {
        setReposError("Could not load repositories. Please try again.");
      }
    } catch {
      setReposError("Could not reach the backend. Please try again.");
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        const next = data.events[0]?.id ?? 0;
        if (next !== lastSeenRef.current) {
          lastSeenRef.current = next;
        }
        setEvents(data.events);
        setHasMore(data.has_more);
        setEventsError(null);
      } else {
        setEventsError("Could not load activity. Please try again.");
      }
    } catch {
      setEventsError("Could not reach the backend. Please try again.");
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const refreshEventsSilently = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        const next = data.events[0]?.id ?? 0;
        if (next !== lastSeenRef.current) {
          lastSeenRef.current = next;
          flashLive();
        }
        setEvents(data.events);
        setHasMore(data.has_more);
        setEventsError(null);
      } else {
        setEventsError("Could not load activity. Please try again.");
      }
    } catch {
      setEventsError("Could not reach the backend. Please try again.");
    }
  }, [flashLive]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const lastId = events[events.length - 1]?.id;
    if (!lastId) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/events?beforeId=${lastId}`);
      if (res.ok) {
        const data = await res.json();
        setEvents((prev) => [...prev, ...data.events]);
        setHasMore(data.has_more);
      }
    } catch {
      // keep existing list; user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, events]);

  useEffect(() => {
    if (activeView !== "activity") return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/events/latest");
        if (!res.ok || cancelled) return;
        const latest = await res.json();
        if (latest.latest_id !== lastSeenRef.current) {
          await refreshEventsSilently();
        }
      } catch {
        // ignore transient failures; next tick retries
      }
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeView, refreshEventsSilently]);

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
      <Sidebar activeView={activeView} onSelect={selectView} user={user} />

      <main className="flex flex-1 flex-col overflow-y-auto">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2.5">
            <BotLogo className="h-7 w-7 text-zinc-900 dark:text-zinc-100" />
            <span className="text-sm font-semibold tracking-tight">Autobot</span>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            Sign out
          </button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectView(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
          {activeView === "repositories" && (
            <RepositoriesView
              repos={repos}
              onConnect={openConnect}
              onDisconnect={handleDisconnected}
              onRetry={refreshRepos}
              error={reposError}
              loading={loadingRepos}
            />
          )}
          {activeView === "activity" && (
            <ActivityView
              events={events}
              onRefresh={refreshEvents}
              onRetry={refreshEvents}
              onLoadMore={loadMore}
              loading={loadingEvents}
              loadingMore={loadingMore}
              hasMore={hasMore}
              error={eventsError}
              live
              justUpdated={livePulse}
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
