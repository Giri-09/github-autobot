import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getEvents, getRepositories } from "@/lib/backend";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/signin");
  }

  const githubUserId = session.user.id;

  const [repos, events] = await Promise.all([
    getRepositories(githubUserId).catch(() => []),
    getEvents(githubUserId).catch(() => []),
  ]);

  return (
    <DashboardShell
      initialRepos={repos}
      initialEvents={events}
      user={{
        name: session.user.name,
        login: session.user.login,
        image: session.user.image,
      }}
    />
  );
}
