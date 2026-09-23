/**
 * Required OAuth scopes the channel was not granted. Channels connected before the
 * inbox existed usually lack the read/reply scopes: they keep publishing, and the
 * settings screen lists what a reconnect would unlock. (The worker applies the same
 * rule before syncing or sending: apps/worker/src/engagement/scopes.ts.)
 */
export function missingScopes(held: readonly string[], required: readonly string[]): string[] {
	const granted = new Set(held);
	return required.filter((s) => !granted.has(s));
}
