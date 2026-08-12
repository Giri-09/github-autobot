"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { Rule, RuleInput } from "@/lib/backend";

const EVENT_TYPES = [
  { value: "issues", label: "Issue" },
  { value: "pull_request", label: "Pull request" },
  { value: "push", label: "Push" },
];

const MATCH_FIELDS = [
  { value: "title", label: "Title" },
  { value: "body", label: "Body" },
];

const ACTION_TYPES = [
  { value: "add_label", label: "Add label" },
  { value: "comment", label: "Post a comment" },
];

export function RuleFormModal({
  open,
  onClose,
  onSubmit,
  saving,
  rule,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: RuleInput) => void;
  saving: boolean;
  rule: Rule | null;
  error: string | null;
}) {
  const [eventType, setEventType] = useState(rule?.event_type ?? "issues");
  const [matchField, setMatchField] = useState(rule?.match_field ?? "title");
  const [matchValue, setMatchValue] = useState(rule?.match_value ?? "");
  const [actionType, setActionType] = useState(rule?.action_type ?? "add_label");
  const [actionValue, setActionValue] = useState(rule?.action_value ?? "");
  const [notifySlack, setNotifySlack] = useState(rule?.notify_slack ?? true);
  const [aiEnabled, setAiEnabled] = useState(rule?.ai_enabled ?? false);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    if (matchValue.trim() === "" || actionValue.trim() === "") {
      setLocalError("Match keyword and action value are required.");
      return;
    }
    setLocalError(null);
    onSubmit({
      eventType,
      matchField,
      matchValue: matchValue.trim(),
      actionType,
      actionValue: actionValue.trim(),
      notifySlack,
      aiEnabled,
      enabled,
    });
  };

  const labelClass =
    "mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400";
  const fieldClass =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-500";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? "Edit rule" : "New rule"}
      width="max-w-xl"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>When this happens</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className={fieldClass}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                A new {t.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Match in</label>
            <select
              value={matchField}
              onChange={(e) => setMatchField(e.target.value)}
              className={fieldClass}
            >
              {MATCH_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Contains keyword</label>
            <input
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder="e.g. bug"
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Then</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className={fieldClass}
            >
              {ACTION_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              {actionType === "add_label" ? "Label name" : "Comment text"}
            </label>
            {actionType === "add_label" ? (
              <input
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                placeholder="e.g. bug"
                className={fieldClass}
              />
            ) : (
              <textarea
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                placeholder="e.g. Thanks for reporting — we're on it."
                rows={3}
                className={fieldClass}
              />
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={notifySlack}
              onChange={(e) => setNotifySlack(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
            />
            Send a Slack notification
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
            />
            Include the AI summary in Slack
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
            />
            Rule is active
          </label>
        </div>

        {(localError || error) && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {localError ?? error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Spinner />}
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
