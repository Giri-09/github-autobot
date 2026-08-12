import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignInButton } from "@/components/SignInButton";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <path d="M12 2 2 7v10l10 5 10-5V7L12 2Zm0 2.2 7.5 3.75L12 11.7 4.5 8 12 4.2Zm-8 5.4 7 3.5v7.7l-7-3.5V9.6Zm9 11.2v-7.7l7-3.5v7.7l-7 3.5Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            GitHub Autobot
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Connect a repository and let the bot react to issues and pull
            requests automatically.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <SignInButton callbackUrl={callbackUrl} />
          <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
            We request repo access to create webhooks and post labels/comments
            on your behalf.
          </p>
        </div>
      </div>
    </div>
  );
}
