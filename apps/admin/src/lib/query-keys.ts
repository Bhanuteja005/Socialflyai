/** Every admin key starts with ["admin"], so signing out clears them all at once. */
export const qk = {
	session: ["session"] as const,
	me: ["admin", "me"] as const,
	overview: ["admin", "overview"] as const,
	organizations: (q: string) => ["admin", "organizations", { q }] as const,
	organizationsAll: ["admin", "organizations"] as const,
	organization: (id: string) => ["admin", "organization", id] as const,
	users: (q: string) => ["admin", "users", { q }] as const,
	usersAll: ["admin", "users"] as const,
	targets: (status: string) => ["admin", "targets", { status }] as const,
	generations: (status: string, kind: string) =>
		["admin", "generations", { status, kind }] as const,
	queues: ["admin", "queues"] as const,
	audit: ["admin", "audit"] as const,
};
