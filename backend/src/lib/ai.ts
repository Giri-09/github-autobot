const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

export function isAiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

export type AiResult = {
  summary: string;
  suggestedLabel: string | null;
};

const PROMPT = (kind: string, title: string, body: string) =>
  `You are a GitHub triage assistant. Read this ${kind} and produce:
1. SUMMARY: a concise 2-3 sentence summary of what the report is about.
2. LABEL: one suggested label chosen from exactly one of: bug, enhancement, question, documentation, urgent. Choose the single best fit.

Format your reply exactly like this, nothing else:
SUMMARY: <summary>
LABEL: <label>

${kind} title: ${title}

${kind} body:
${body?.slice(0, 8000) ?? "(empty)"}`;

function parse(text: string): AiResult {
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?:\nLABEL:|$)/i);
  const labelMatch = text.match(/LABEL:\s*([^\n]+)/i);
  const summary = summaryMatch?.[1]?.trim();
  const label = labelMatch?.[1]?.trim().toLowerCase() ?? null;
  if (summary) {
    return { summary, suggestedLabel: label };
  }
  return { summary: text.trim().slice(0, 500), suggestedLabel: label };
}

export async function summarizeIssue(opts: {
  kind: "issue" | "pull request";
  title: string;
  body: string | null;
}): Promise<AiResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT(opts.kind, opts.title, opts.body ?? "") },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  return parse(text);
}
