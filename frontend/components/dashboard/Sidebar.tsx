"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";
import { ActivityIcon, BotLogo, RepoIcon, RuleIcon } from "./icons";

export type ViewId = "repositories" | "activity" | "rules";

const navItems: { id: ViewId; label: string; icon: typeof RepoIcon }[] = [
  { id: "repositories", label: "Repositories", icon: RepoIcon },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "rules", label: "Rules", icon: RuleIcon },
];

export function Sidebar({
  activeView,
  onSelect,
  user,
}: {
  activeView: ViewId;
  onSelect: (view: ViewId) => void;
  user: { name?: string | null; login?: string; image?: string | null };
}) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BotLogo className="h-8 w-8" />
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">Autobot</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            GitHub automation
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 px-3 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3 px-2">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? "Signed-in user"}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {(user.name ?? user.login ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user.name ?? user.login}</p>
            <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
              @{user.login}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
