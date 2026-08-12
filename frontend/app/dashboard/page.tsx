import Image from "next/image";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/signin");
  }

  const user = session.user;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-[1200px] 2xl:max-w-[1500px] items-center justify-between px-6 py-4">
          <span className="text-sm font-semibold tracking-tight">
            GitHub Autobot
          </span>
          <div className="flex items-center gap-3">
            {user?.image && (
              <Image
                src={user.image}
                alt={user.name ?? "Signed-in user"}
                width={28}
                height={28}
                className="rounded-full"
              />
            )}
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {user?.name}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] 2xl:max-w-[1500px] px-6 py-10">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            Connected repositories
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Connect a repository to start receiving events and let the bot
            react to them.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No repository connected yet
          </p>
          <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Repository connection, rules, and the event log land in the next
            phase of this build.
          </p>
        </div>
      </main>
    </div>
  );
}
