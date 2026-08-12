import { AlertIcon } from "../dashboard/icons";

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-950/40">
      <div className="flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/50"
        >
          Retry
        </button>
      )}
    </div>
  );
}
