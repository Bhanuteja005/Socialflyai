/**
 * Required OAuth scopes the channel was not granted. Channels connected before the
 * inbox existed usually lack the read/reply scopes; they keep publishing, and the
 * inbox skips them until the user reconnects. (The API has the same rule for the
 * settings screen: apps/api/src/modules/inbox/inbox.shared.ts.)
 */
export function missingScopes(held: readonly string[], required: readonly string[]): string[] {
	const granted = new Set(held);
	return required.filter((s) => !granted.has(s));
}
