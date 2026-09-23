import { describe, expect, test } from "bun:test";
import type { MediaItem, PublishOutcome } from "../types";
import {
	advanceContainers,
	type ContainerApi,
	type ContainerState,
	classifyMetaError,
	instagramAspectRatioErrors,
	parseContainerPending,
	toContainerState,
	validateInstagram,
} from "./meta";

const graphError = (code: number, extra: Record<string, unknown> = {}) =>
	JSON.stringify({ error: { message: `boom ${code}`, type: "OAuthException", code, ...extra } });

describe("classifyMetaError", () => {
	test("190 (expired/invalid token) is auth", () => {
		const err = classifyMetaError("facebook", 400, graphError(190, { error_subcode: 463 }));
		expect(err?.kind).toBe("auth");
		expect(err?.details.platformCode).toBe("190/463");
	});

	test("missing permissions (10, 200-299) are auth", () => {
		expect(classifyMetaError("facebook", 403, graphError(10))?.kind).toBe("auth");
		expect(classifyMetaError("facebook", 403, graphError(200))?.kind).toBe("auth");
	});

	test.each([4, 17, 32, 613, 80_002])("code %d is rate_limited with a retry delay", (code) => {
		const err = classifyMetaError("instagram", 400, graphError(code));
		expect(err?.kind).toBe("rate_limited");
		expect(err?.details.retryAfterMs).toBeGreaterThan(0);
	});

	test("368 policy block is invalid_request, not retryable", () => {
		const err = classifyMetaError("facebook", 400, graphError(368));
		expect(err?.kind).toBe("invalid_request");
		expect(err?.retryable).toBe(false);
	});

	test("9007 media-not-ready is transient even on the mutating publish call", () => {
		expect(classifyMetaError("instagram", 400, graphError(9007), true)?.kind).toBe("transient");
	});

	test("transient Meta errors are unknown_outcome only on mutating calls", () => {
		expect(classifyMetaError("facebook", 500, graphError(2), false)?.kind).toBe("transient");
		expect(classifyMetaError("facebook", 500, graphError(2), true)?.kind).toBe("unknown_outcome");
		expect(
			classifyMetaError("facebook", 400, graphError(100, { is_transient: true }), true)?.kind,
		).toBe("unknown_outcome");
	});

	test("other 4xx Graph errors are invalid_request and prefer the user-facing message", () => {
		const err = classifyMetaError(
			"facebook",
			400,
			graphError(100, { error_user_msg: "Bad image" }),
		);
		expect(err?.kind).toBe("invalid_request");
		expect(err?.message).toBe("Bad image");
	});

	test("non-Graph bodies fall back to the default mapping", () => {
		expect(classifyMetaError("facebook", 502, "<html>Bad gateway</html>")).toBeUndefined();
		expect(classifyMetaError("facebook", 400, JSON.stringify({ foo: 1 }))).toBeUndefined();
	});
});

const image = (width?: number, height?: number): MediaItem => ({
	url: "https://cdn.example.com/a.jpg",
	kind: "image",
	mimeType: "image/jpeg",
	sizeBytes: 1000,
	width,
	height,
});
const video: MediaItem = {
	url: "https://cdn.example.com/a.mp4",
	kind: "video",
	mimeType: "video/mp4",
	sizeBytes: 1000,
};

describe("instagramAspectRatioErrors", () => {
	test("accepts the 4:5 and 1.91:1 boundaries and square", () => {
		expect(
			instagramAspectRatioErrors([image(1080, 1350), image(1910, 1000), image(1080, 1080)]),
		).toEqual([]);
	});

	test("rejects images taller than 4:5 or wider than 1.91:1", () => {
		const errors = instagramAspectRatioErrors([image(1080, 1920), image(3000, 1000)]);
		expect(errors).toHaveLength(2);
		expect(errors[0]).toContain("image 1");
		expect(errors[1]).toContain("image 2");
	});

	test("skips images with unknown dimensions and videos", () => {
		expect(instagramAspectRatioErrors([image(), video])).toEqual([]);
	});
});

describe("validateInstagram", () => {
	test("reels need exactly one video", () => {
		expect(
			validateInstagram({ text: "", media: [image(1, 1)], settings: { postType: "reel" } }),
		).toEqual(["Instagram reels need exactly one video"]);
		expect(validateInstagram({ text: "", media: [video], settings: { postType: "reel" } })).toEqual(
			[],
		);
	});

	test("stories take one item and skip the feed aspect-ratio rule", () => {
		expect(
			validateInstagram({ text: "", media: [image(1080, 1920)], settings: { postType: "story" } }),
		).toEqual([]);
		expect(
			validateInstagram({ text: "", media: [image(), image()], settings: { postType: "story" } }),
		).toHaveLength(1);
	});

	test("feed posts get the aspect-ratio rule", () => {
		expect(
			validateInstagram({ text: "", media: [image(1080, 1920)], settings: { postType: "feed" } }),
		).toHaveLength(1);
	});

	test("more than 30 hashtags is rejected", () => {
		const text = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
		expect(
			validateInstagram({ text, media: [image()], settings: { postType: "feed" } })[0],
		).toContain("30 hashtags");
	});
});

describe("toContainerState", () => {
	test("maps IG/Threads statuses", () => {
		expect(toContainerState("FINISHED").state).toBe("ready");
		expect(toContainerState("IN_PROGRESS").state).toBe("pending");
		expect(toContainerState(undefined).state).toBe("pending");
		expect(toContainerState("ERROR", "bad codec")).toEqual({
			state: "failed",
			message: "bad codec",
		});
		expect(toContainerState("EXPIRED").state).toBe("failed");
	});
});

describe("parseContainerPending", () => {
	test("rejects data with neither a container nor children", () => {
		expect(() => parseContainerPending("instagram", {})).toThrow();
		expect(parseContainerPending("instagram", { containerId: "c1" })).toEqual({
			containerId: "c1",
		});
	});
});

/** In-memory ContainerApi: pure state, no network. */
function fakeApi(states: Record<string, ContainerState["state"]>) {
	const calls = {
		created: [] as { childIds: string[]; extra: Record<string, string> }[],
		published: [] as string[],
	};
	const api: ContainerApi = {
		provider: "instagram",
		pollAfterMs: 10_000,
		status: async (id) => ({ state: states[id] ?? "pending" }),
		createCarousel: async (childIds, _text, extra) => {
			calls.created.push({ childIds, extra });
			states.parent = states.parent ?? "ready";
			return "parent";
		},
		publish: async (containerId): Promise<PublishOutcome> => {
			calls.published.push(containerId);
			return { status: "published", externalId: `media-${containerId}`, url: null };
		},
	};
	return { api, calls };
}

describe("advanceContainers", () => {
	test("publishes a finished single container", async () => {
		const { api, calls } = fakeApi({ c1: "ready" });
		expect(await advanceContainers(api, { containerId: "c1" })).toMatchObject({
			status: "published",
		});
		expect(calls.published).toEqual(["c1"]);
	});

	test("keeps polling while a container is in progress", async () => {
		const { api, calls } = fakeApi({ c1: "pending" });
		expect(await advanceContainers(api, { containerId: "c1" })).toEqual({
			status: "processing",
			pendingData: { containerId: "c1" },
			pollAfterMs: 10_000,
		});
		expect(calls.published).toEqual([]);
	});

	test("waits for every carousel child before creating the parent", async () => {
		const { api, calls } = fakeApi({ a: "ready", b: "pending" });
		const pending = { childIds: ["a", "b"], text: "hi" };
		expect(await advanceContainers(api, pending)).toMatchObject({
			status: "processing",
			pendingData: pending,
		});
		expect(calls.created).toEqual([]);
	});

	test("creates and publishes the carousel once children are finished", async () => {
		const { api, calls } = fakeApi({ a: "ready", b: "ready" });
		const outcome = await advanceContainers(api, {
			childIds: ["a", "b"],
			text: "hi",
			parentParams: { reply_control: "everyone" },
		});
		expect(outcome).toMatchObject({ status: "published", externalId: "media-parent" });
		expect(calls.created).toEqual([{ childIds: ["a", "b"], extra: { reply_control: "everyone" } }]);
	});

	test("a failed container is invalid_request and nothing is published", async () => {
		const { api, calls } = fakeApi({ a: "failed", b: "ready" });
		await expect(advanceContainers(api, { childIds: ["a", "b"] })).rejects.toMatchObject({
			kind: "invalid_request",
		});
		expect(calls.published).toEqual([]);
	});
});
