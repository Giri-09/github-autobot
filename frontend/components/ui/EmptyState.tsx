export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </p>
      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
