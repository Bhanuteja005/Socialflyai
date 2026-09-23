import type { PostsQuery } from "./api-types";

/** Every org-scoped key starts with ["org", orgId] so switching orgs never mixes caches. */
export const qk = {
	session: ["session"] as const,
	authSessions: ["auth-sessions"] as const,
	organizations: ["organizations"] as const,
	org: (orgId: string) => ["org", orgId] as const,
	organization: (orgId: string) => ["org", orgId, "organization"] as const,
	members: (orgId: string) => ["org", orgId, "members"] as const,
	invitations: (orgId: string) => ["org", orgId, "invitations"] as const,
	providers: (orgId: string) => ["org", orgId, "providers"] as const,
	channels: (orgId: string) => ["org", orgId, "channels"] as const,
	selection: (orgId: string, id: string) => ["org", orgId, "selection", id] as const,
	postsAll: (orgId: string) => ["org", orgId, "posts"] as const,
	posts: (orgId: string, query: PostsQuery = {}) => ["org", orgId, "posts", query] as const,
	post: (orgId: string, id: string) => ["org", orgId, "post", id] as const,
	media: (orgId: string, kind?: string) => ["org", orgId, "media", kind ?? "all"] as const,
	mediaAll: (orgId: string) => ["org", orgId, "media"] as const,
};
