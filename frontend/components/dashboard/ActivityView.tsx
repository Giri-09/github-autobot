"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
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
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityView({
  events,
  onRefresh,
  loading,
}: {
  events: RepoEvent[];
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Events received from your repositories and the actions the bot took
          </p>
        </div>
        <Button variant="secondary" onClick={onRefresh} disabled={loading}>
          <RefreshIcon className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon className="h-5 w-5" />}
          title="No events yet"
          description="Open an issue or pull request on a connected repository and it will show up here within seconds."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
        </div>
      )}
    </div>
  );
}
