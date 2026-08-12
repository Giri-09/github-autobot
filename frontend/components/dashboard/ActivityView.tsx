"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Spinner } from "@/components/ui/Spinner";
import {
  ActivityIcon,
  GithubIcon,
  RefreshIcon,
  SlackIcon,
} from "./icons";
import type { ActionLog, RepoEvent } from "@/lib/backend";

function eventLabel(event: RepoEvent): string {
  const kind = event.event_type === "pull_request" ? "Pull request" : event.event_type === "issues" ? "Issue" : event.event_type;
  const action = event.action ? ` ${event.action}` : "";
  return `${kind}${action}`;
}

function statusTone(status: string) {
  if (status === "processed") return "green" as const;
  if (status === "failed") return "red" as const;
  return "amber" as const;
}

function actionTone(log: ActionLog) {
  if (log.status === "failed") return "red" as const;
  return "neutral" as const;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityView({
  events,
  onRefresh,
  onRetry,
  onLoadMore,
  loading,
  loadingMore,
  hasMore,
  error,
  live = false,
  justUpdated = false,
}: {
  events: RepoEvent[];
  onRefresh: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  live?: boolean;
  justUpdated?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Events received from your repositories and the actions the bot took
          </p>
        </div>
        <div className="flex items-center gap-3">
          {live && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {justUpdated ? "New events" : "Live"}
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh activity"
            title="Refresh activity"
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <RefreshIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRetry} />}

      {events.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon className="h-5 w-5" />}
          title="No events yet"
          description="Open an issue or pull request on a connected repository and it will show up here within seconds."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Repository</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Actions taken</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {events.map((event) => (
                <tr key={event.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs text-zinc-500">
                    {formatTime(event.received_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium">
                    {event.owner}/{event.repo_name}
                  </td>
                  <td className="px-4 py-3.5 capitalize">
                    {eventLabel(event)}
                    {event.ai_summary && (
                      <p className="mt-1 max-w-xs text-xs font-normal normal-case text-zinc-500 dark:text-zinc-400">
                        {event.ai_summary}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {event.action_logs.length === 0 ? (
                      <span className="text-xs text-zinc-400">
                        None — awaiting processing
                      </span>
                    ) : (
                      <ul className="space-y-1">
                        {event.action_logs.map((log) => (
                          <li key={log.id} className="flex items-center gap-1.5">
                            {log.type === "slack_notify" ? (
                              <SlackIcon className="h-3.5 w-3.5 text-zinc-400" />
                            ) : (
                              <GithubIcon className="h-3.5 w-3.5 text-zinc-400" />
                            )}
                            <span className="text-xs text-zinc-600 dark:text-zinc-300">
                              {log.type === "slack_notify"
                                ? "Slack notification"
                                : log.detail ?? "GitHub write"}
                            </span>
                            <Badge tone={actionTone(log)}>
                              {log.status}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={statusTone(event.status)}>{event.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center border-t border-zinc-100 py-3 dark:border-zinc-800"
            >
              {loadingMore && (
                <span className="inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <Spinner className="h-3.5 w-3.5" /> Loading more...
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
