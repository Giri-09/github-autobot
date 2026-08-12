const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export function isSlackConfigured(): boolean {
  return Boolean(SLACK_WEBHOOK_URL);
}

export async function sendSlack(opts: {
  owner: string;
  name: string;
  eventLabel: string;
  action: string | null;
  title: string;
  url: string;
  actionDescription: string | null;
  aiSummary: string | null;
}): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

  const repoLink = `https://github.com/${opts.owner}/${opts.name}`;
  const titleLine = opts.url
    ? `<${opts.url}|${opts.title}>`
    : opts.title;

  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${opts.eventLabel}${opts.action ? ` (${opts.action})` : ""}* in <${repoLink}|${opts.owner}/${opts.name}>\n${titleLine}`,
      },
    },
  ];

  if (opts.aiSummary) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*AI summary:*\n${opts.aiSummary}`,
      },
    });
  }

  if (opts.actionDescription) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:robot_face: ${opts.actionDescription}`,
        },
      ],
    });
  }

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook returned ${res.status}: ${await res.text()}`);
  }
}
