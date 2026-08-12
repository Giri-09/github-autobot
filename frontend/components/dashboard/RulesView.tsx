"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Spinner } from "@/components/ui/Spinner";
import { RuleFormModal } from "./RuleFormModal";
import { PlusIcon, RuleIcon, SlackIcon } from "./icons";
import type { ConnectedRepository, Rule, RuleInput } from "@/lib/backend";

function toInput(rule: Rule): RuleInput {
  return {
    eventType: rule.event_type,
    matchField: rule.match_field,
    matchValue: rule.match_value,
    actionType: rule.action_type,
    actionValue: rule.action_value,
    notifySlack: rule.notify_slack,
    aiEnabled: rule.ai_enabled,
    enabled: rule.enabled,
  };
}

function eventName(value: string): string {
  return value === "pull_request"
    ? "Pull request"
    : value === "issues"
      ? "Issue"
      : value;
}

function actionText(rule: Rule): string {
  return rule.action_type === "add_label"
    ? `Add label "${rule.action_value}"`
    : "Post a comment";
}

export function RulesView({ repos }: { repos: ConnectedRepository[] }) {
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(
    repos[0]?.id ?? null
  );
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRules = useCallback(async (repositoryId: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/rules?repositoryId=${encodeURIComponent(repositoryId)}`
      );
      if (res.ok) {
        setRules(await res.json());
        setLoadError(null);
      } else {
        setLoadError("Could not load rules. Please try again.");
      }
    } catch {
      setLoadError("Could not reach the backend. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRepoId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/rules?repositoryId=${encodeURIComponent(selectedRepoId)}`
      );
      if (cancelled) return;
      if (res.ok) {
        setRules(await res.json());
        setLoadError(null);
      } else {
        setLoadError("Could not load rules. Please try again.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRepoId]);

  const submit = async (input: RuleInput) => {
    if (!selectedRepoId) return;
    setSaving(true);
    setError(null);
    try {
      const url = editingRule
        ? `/api/rules/${editingRule.id}?repositoryId=${encodeURIComponent(selectedRepoId)}`
        : `/api/rules?repositoryId=${encodeURIComponent(selectedRepoId)}`;
      const res = await fetch(url, {
        method: editingRule ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to save rule");
      await loadRules(selectedRepoId);
      setModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (rule: Rule) => {
    if (!selectedRepoId) return;
    try {
      const res = await fetch(
        `/api/rules/${rule.id}?repositoryId=${encodeURIComponent(selectedRepoId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...toInput(rule), enabled: !rule.enabled }),
        }
      );
      if (res.ok) {
        await loadRules(selectedRepoId);
      } else {
        setLoadError("Could not update the rule. Please try again.");
      }
    } catch {
      setLoadError("Could not update the rule. Please try again.");
    }
  };

  const removeRule = async (rule: Rule) => {
    if (!selectedRepoId) return;
    if (!window.confirm("Delete this rule?")) return;
    try {
      const res = await fetch(
        `/api/rules/${rule.id}?repositoryId=${encodeURIComponent(selectedRepoId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await loadRules(selectedRepoId);
      } else {
        setLoadError("Could not delete the rule. Please try again.");
      }
    } catch {
      setLoadError("Could not delete the rule. Please try again.");
    }
  };

  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<RuleIcon className="h-5 w-5" />}
        title="Connect a repository first"
        description="Rules are configured per repository. Connect one to start defining automation."
      />
    );
  }

  const openNewRule = () => {
    setEditingRule(null);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Rules</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            When an event matches, the bot acts on it and alerts Slack
          </p>
        </div>
        <Button onClick={openNewRule}>
          <PlusIcon className="h-4 w-4" /> New rule
        </Button>
      </div>

      <div className="mb-5">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
          Repository
        </label>
        <select
          value={selectedRepoId ?? ""}
          onChange={(e) => setSelectedRepoId(Number(e.target.value))}
          className="w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-500"
        >
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.owner}/{r.name}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <ErrorBanner
          message={loadError}
          onRetry={selectedRepoId ? () => loadRules(selectedRepoId) : undefined}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
          <Spinner /> Loading rules...
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={<RuleIcon className="h-5 w-5" />}
          title="No rules for this repository"
          description="Add a rule like: when an issue title contains 'bug', add the bug label and alert Slack."
          action={
            <Button onClick={openNewRule}>
              <PlusIcon className="h-4 w-4" /> New rule
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
                rule.enabled ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <Badge tone="blue">{eventName(rule.event_type)}</Badge>
                <span className="text-zinc-500">
                  {rule.match_field} contains
                </span>
                <Badge tone="neutral">{`"${rule.match_value}"`}</Badge>
                <span className="text-zinc-400">→</span>
                <Badge tone="green">{actionText(rule)}</Badge>
                {rule.notify_slack && (
                  <Badge tone="amber">
                    <SlackIcon className="h-3 w-3" /> Slack
                  </Badge>
                )}
                {rule.ai_enabled && (
                  <Badge tone="blue">+ AI summary</Badge>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => toggleEnabled(rule)}
                  className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  role="switch"
                  aria-checked={rule.enabled}
                >
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      rule.enabled
                        ? "bg-emerald-500"
                        : "bg-zinc-200 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        rule.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </span>
                  {rule.enabled ? "Active" : "Disabled"}
                </button>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingRule(rule);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={() => removeRule(rule)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RuleFormModal
        key={modalOpen ? (editingRule ? `edit-${editingRule.id}` : "new") : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={submit}
        saving={saving}
        rule={editingRule}
        error={error}
      />
    </div>
  );
}
