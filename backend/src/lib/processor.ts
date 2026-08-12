import { pool } from "../db/pool";
import { logger } from "./logger";
import { addComment, addLabel } from "./github";
import { isSlackConfigured, sendSlack } from "./slack";
import { isAiConfigured, summarizeIssue } from "./ai";

type EventPayload = {
  action?: string;
  issue?: { number: number; title: string; body: string | null; html_url: string };
  pull_request?: { number: number; title: string; body: string | null; html_url: string };
};

type TextContext = {
  kind: "issue" | "pull request";
  title: string;
  body: string | null;
  number: number;
  url: string;
};

type RuleRow = {
  id: number;
  match_field: string;
  match_value: string;
  action_type: string;
  action_value: string;
  notify_slack: boolean;
  ai_enabled: boolean;
};

function textFromPayload(
  eventType: string,
  payload: EventPayload
): TextContext | null {
  const item =
    eventType === "issues"
      ? payload.issue
      : eventType === "pull_request"
        ? payload.pull_request
        : null;
  if (!item) return null;
  return {
    kind: eventType === "issues" ? "issue" : "pull request",
    title: item.title ?? "(untitled)",
    body: item.body ?? null,
    number: item.number,
    url: item.html_url ?? "",
  };
}

function ruleMatches(rule: RuleRow, text: TextContext): boolean {
  const field = rule.match_field === "title" ? text.title : (text.body ?? "");
  return field.toLowerCase().includes(rule.match_value.toLowerCase());
}

function eventLabel(eventType: string, action: string | null): string {
  const kind =
    eventType === "pull_request"
      ? "Pull request"
      : eventType === "issues"
        ? "Issue"
        : eventType;
  return action ? `${kind} ${action}` : kind;
}

async function logAction(
  eventId: number,
  ruleId: number | null,
  type: string,
  status: string,
  detail: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO action_logs (event_id, rule_id, type, status, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventId, ruleId, type, status, detail]
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Claims the event so inline processing and the sweeper can't both run it.
async function claimEvent(eventId: number): Promise<{ payload: EventPayload } | null> {
  const res = await pool.query(
    `UPDATE events
     SET status = 'processing', try_count = try_count + 1, updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'failed')
     RETURNING payload`,
    [eventId]
  );
  return res.rows[0] ?? null;
}

async function finishEvent(
  eventId: number,
  status: "processed" | "failed"
): Promise<void> {
  await pool.query(
    `UPDATE events SET status = $1, updated_at = now(),
            processed_at = CASE WHEN $1 = 'processed' THEN now() ELSE processed_at END
     WHERE id = $2`,
    [status, eventId]
  );
}

async function generateAiSummary(
  eventId: number,
  eventType: string,
  text: TextContext
): Promise<string | null> {
  if (!isAiConfigured()) return null;
  try {
    const result = await summarizeIssue({ kind: text.kind, title: text.title, body: text.body });
    await pool.query("UPDATE events SET ai_summary = $1 WHERE id = $2", [
      result.summary,
      eventId,
    ]);
    return result.summary;
  } catch (err) {
    logger.error({ eventId, err }, "AI summary generation failed");
    return null;
  }
}

async function notifySlack(
  eventId: number,
  rule: RuleRow,
  repo: { owner: string; name: string },
  eventType: string,
  action: string | null,
  text: TextContext,
  aiSummary: string | null,
  actionDescription: string | null
): Promise<void> {
  if (!rule.notify_slack) return;

  if (!isSlackConfigured()) {
    await logAction(
      eventId,
      rule.id,
      "slack_notify",
      "failed",
      "SLACK_WEBHOOK_URL is not configured"
    );
    return;
  }

  let lastError: unknown = null;
  for (const attempt of [1, 2, 3]) {
    try {
      await sendSlack({
        owner: repo.owner,
        name: repo.name,
        eventLabel: eventLabel(eventType, action),
        action: action,
        title: text.title,
        url: text.url,
        actionDescription:
          rule.ai_enabled && aiSummary
            ? `${actionDescription ?? "Rule matched"}. AI summary included above.`
            : actionDescription,
        aiSummary: rule.ai_enabled ? aiSummary : null,
      });
      await logAction(eventId, rule.id, "slack_notify", "success", null);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(attempt * 1000);
    }
  }
  logger.error({ eventId, ruleId: rule.id, err: lastError }, "slack notify failed");
  await logAction(eventId, rule.id, "slack_notify", "failed", "Slack send failed after 3 attempts");
}

// Processes one event: matches its repository's rules, performs the GitHub
// writes and Slack notifications, and records every action in action_logs.
async function processEvent(eventId: number): Promise<void> {
  const claimed = await claimEvent(eventId);
  if (!claimed) return; // already processed or currently in flight

  try {
    const eventRes = await pool.query(
      "SELECT id, repository_id, event_type, action, payload FROM events WHERE id = $1",
      [eventId]
    );
    const event = eventRes.rows[0] as {
      repository_id: number;
      event_type: string;
      action: string | null;
      payload: EventPayload;
    };

    const repoRes = await pool.query(
      "SELECT owner, name, github_access_token FROM repositories WHERE id = $1",
      [event.repository_id]
    );
    const repo = repoRes.rows[0] as { owner: string; name: string; github_access_token: string };
    if (!repo) {
      await finishEvent(eventId, "failed");
      return;
    }

    const text = textFromPayload(event.event_type, event.payload);

    const aiSummary =
      text && (await generateAiSummary(eventId, event.event_type, text));

    const rulesRes = await pool.query(
      "SELECT id, match_field, match_value, action_type, action_value, notify_slack, ai_enabled FROM rules WHERE repository_id = $1 AND event_type = $2 AND enabled = true",
      [event.repository_id, event.event_type]
    );
    const matchingRules = (rulesRes.rows as RuleRow[]).filter(
      (rule) => text && ruleMatches(rule, text)
    );

    for (const rule of matchingRules) {
      if (!text) continue;

      let actionDetail: string | null = null;
      let actionStatus: "success" | "failed" = "failed";

      try {
        if (rule.action_type === "add_label") {
          await addLabel({
            owner: repo.owner,
            name: repo.name,
            accessToken: repo.github_access_token,
            issueNumber: text.number,
            labels: [rule.action_value],
          });
          actionDetail = `Added label "${rule.action_value}"`;
          actionStatus = "success";
        } else if (rule.action_type === "comment") {
          await addComment({
            owner: repo.owner,
            name: repo.name,
            accessToken: repo.github_access_token,
            issueNumber: text.number,
            body: rule.action_value,
          });
          actionDetail = "Posted a comment";
          actionStatus = "success";
        }
      } catch (err) {
        actionDetail = `GitHub write failed: ${err instanceof Error ? err.message : String(err)}`;
        logger.error({ eventId, ruleId: rule.id, err }, "github write failed");
      }
      await logAction(eventId, rule.id, "github_write", actionStatus, actionDetail);

      await notifySlack(
        eventId,
        rule,
        repo,
        event.event_type,
        event.action,
        text,
        aiSummary,
        actionDetail
      );
    }

    await finishEvent(eventId, "processed");
    if (matchingRules.length > 0) {
      logger.info(
        {
          eventId,
          repo: `${repo.owner}/${repo.name}`,
          rulesMatched: matchingRules.length,
        },
        "event processed"
      );
    }
  } catch (err) {
    logger.error({ eventId, err }, "event processing failed");
    await finishEvent(eventId, "failed");
  }
}

const SWEEP_INTERVAL_MS = 5_000;
let stopped = false;

async function sweepOnce(): Promise<void> {
  const res = await pool.query(
    `SELECT id FROM events
     WHERE status = 'pending'
        OR (status = 'failed' AND try_count < 5
            AND updated_at < now() - interval '1 minute')
        OR (status = 'processing' AND updated_at < now() - interval '2 minutes')
     ORDER BY id ASC
     LIMIT 20`
  );
  for (const row of res.rows as { id: number }[]) {
    await processEvent(row.id);
  }
}

// Background loop: sweeps events that were recorded but never finished (e.g. the
// process died mid-processing) and retries failed ones. Wake it up from the
// webhook handler for near-immediate processing.
export function startEventProcessor(): void {
  const loop = async () => {
    while (!stopped) {
      try {
        await sweepOnce();
      } catch (err) {
        logger.error({ err }, "event sweep failed");
      }
      await sleep(SWEEP_INTERVAL_MS);
    }
  };
  void loop();
}

export function stopEventProcessor(): void {
  stopped = true;
}

// Called fire-and-forget by the webhook handler right after recording an event.
export function enqueueEvent(eventId: number): void {
  void processEvent(eventId).catch((err) =>
    logger.error({ eventId, err }, "enqueued event processing failed")
  );
}
