import { describe, expect, test } from "bun:test";
import { derivePostStatus } from "./posts";

describe("derivePostStatus", () => {
	test.each([
		[[], "draft", "draft"],
		[["draft", "draft"], "draft", "draft"],
		[["draft"], "pending_approval", "pending_approval"],
		[["scheduled", "scheduled"], "draft", "scheduled"],
		[["scheduled", "queued"], "scheduled", "publishing"],
		[["published", "processing"], "publishing", "publishing"],
		[["published", "scheduled"], "publishing", "publishing"],
		[["published", "published"], "publishing", "published"],
		[["published", "failed"], "publishing", "partially_published"],
		[["published", "unconfirmed"], "publishing", "partially_published"],
		[["failed", "unconfirmed"], "publishing", "failed"],
		[["published", "canceled"], "publishing", "published"],
		[["canceled", "canceled"], "scheduled", "canceled"],
	] as const)("%p (was %s) → %s", (targets, current, expected) => {
		expect(derivePostStatus([...targets], current)).toBe(expected);
	});
});
