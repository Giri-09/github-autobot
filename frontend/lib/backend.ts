type GithubProfile = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
};

// Syncs GitHub profile info to the backend's users table - fire-and-forget, never blocks sign-in
export async function upsertUser(profile: GithubProfile) {
  await fetch(`${process.env.BACKEND_URL}/internal/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET as string,
    },
    body: JSON.stringify({
      githubUserId: profile.id,
      githubLogin: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
    }),
  });
}
