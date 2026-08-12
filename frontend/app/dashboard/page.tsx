import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getEvents, getRepositories } from "@/lib/backend";

const VALID_VIEWS = new Set(["repositories", "activity", "rules"]);

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/signin");
  }

  const githubUserId = session.user.id;

  const [repos, eventsRes] = await Promise.all([
    getRepositories(githubUserId).catch(() => []),
    getEvents(githubUserId).catch(() => ({ events: [], has_more: false })),
  ]);

  const cookieStore = await cookies();
  const savedView = cookieStore.get("autobot:view")?.value;
  const initialActiveView =
    savedView && VALID_VIEWS.has(savedView) ? savedView : "repositories";

  return (
    <DashboardShell
      initialRepos={repos}
      initialEvents={eventsRes.events}
      initialHasMore={eventsRes.has_more}
      user={{
        name: session.user.name,
        login: session.user.login,
        image: session.user.image,
      }}
      initialActiveView={initialActiveView as "repositories" | "activity" | "rules"}
    />
  );
}
