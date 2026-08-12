type Tone = "neutral" | "green" | "amber" | "red" | "blue";

const toneClass: Record<Tone, string> = {
  neutral:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  green:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
