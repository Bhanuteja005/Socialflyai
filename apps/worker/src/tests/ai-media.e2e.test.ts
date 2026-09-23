import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { AiError, type AiModels } from "@socialfly/ai";
import { FakeImageModel, FakeSpeechModel } from "@socialfly/ai/testing";
import { workerEnv as env } from "@socialfly/config";
import { createLogger } from "@socialfly/core/logger";
import { normalizeEmail } from "@socialfly/core/security";
import { createDb, eq, inArray, schema, sql } from "@socialfly/db";
import { createQueueConnection, JobProducer } from "@socialfly/queue";
import { S3Client } from "bun";
import { AiMediaProcessor } from "#src/ai/ai-media.ts";
import { Maintenance } from "#src/maintenance/maintenance.ts";
import { TargetState } from "#src/publishing/target-state.ts";

// Own connections, not #src/infrastructure: bun runs every test file in one process,
// so closing the shared singletons here would break whichever suite runs next.
const database = createDb(env.DATABASE_URL, { max: 5 });
const db = database.db;
const queueConnection = createQueueConnection(env.REDIS_URL);
const jobs = new JobProducer(queueConnection);
const storage = new S3Client({
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	bucket: env.S3_BUCKET,
	accessKeyId: env.S3_ACCESS_KEY_ID,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

const logger = createLogger({ service: "worker-test", level: "fatal" });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRST_OF_TWO = { attemptsMade: 0, maxAttempts: 2 };
const LAST_OF_TWO = { attemptsMade: 1, maxAttempts: 2 };

let images: FakeImageModel;
let speech: FakeSpeechModel;
let ai: AiModels;
let processor: AiMediaProcessor;
/** Every key written during the suite, removed in afterAll so the bucket stays clean. */
const writtenKeys: string[] = [];

beforeEach(() => {
	images = new FakeImageModel();
	speech = new FakeSpeechModel();
	ai = { text: null, images, speech };
	processor = new AiMediaProcessor({
		db,
		ai,
		storage,
		logger,
		publicMediaUrl: "http://storage.test/media",
	});
});

afterAll(async () => {
	await Promise.allSettled(writtenKeys.map((key) => storage.delete(key)));
	await jobs.close();
	await queueConnection.quit();
	await database.close();
});

async function org() {
	const email = `ai-${crypto.randomUUID()}@example.test`;
	const [user] = await db
		.insert(schema.users)
		.values({ email, emailNormalized: normalizeEmail(email) })
		.returning();
	const [organization] = await db
		.insert(schema.organizations)
		.values({ name: "Org", slug: `org-${crypto.randomUUID()}`, createdBy: user?.id })
		.returning();
	return { orgId: organization?.id as string, userId: user?.id as string };
}

async function pending(
	kind: "image" | "carousel" | "video",
	input: Record<string, unknown>,
	owner?: { orgId: string; userId: string },
) {
	const { orgId, userId } = owner ?? (await org());
	const [generation] = await db
		.insert(schema.aiGenerations)
		.values({ organizationId: orgId, userId, kind, status: "pending", input })
		.returning();
	const id = generation?.id as string;
	return { orgId, userId, id, job: { generationId: id, organizationId: orgId } };
}

async function load(id: string) {
	const [generation] = await db
		.select()
		.from(schema.aiGenerations)
		.where(eq(schema.aiGenerations.id, id));
	if (!generation) throw new Error(`generation ${id} not found`);
	const media = generation.mediaIds.length
		? await db
				.select()
				.from(schema.mediaAssets)
				.where(inArray(schema.mediaAssets.id, generation.mediaIds))
		: [];
	for (const m of media) writtenKeys.push(m.storageKey);
	// Keep the generation's order: that is the order the slides must be posted in.
	return {
		generation,
		media: generation.mediaIds.map((mid) => media.find((m) => m.id === mid)),
	};
}

const mediaCount = async (orgId: string) =>
	(
		await db
			.select({ id: schema.mediaAssets.id })
			.from(schema.mediaAssets)
			.where(eq(schema.mediaAssets.organizationId, orgId))
	).length;

describe("ai image generation", () => {
	test("generates, stores and records an on-brand image", async () => {
		const g = await pending("image", {
			prompt: "A sunrise over a coffee shop",
			aspectRatio: "4:5",
			style: "watercolour",
		});
		await db.insert(schema.brandProfiles).values({
			organizationId: g.orgId,
			brandName: "Bean There",
			description: "A neighbourhood coffee roaster",
		});

		await processor.process(g.job, FIRST_OF_TWO);

		const { generation, media } = await load(g.id);
		expect(generation).toMatchObject({
			status: "succeeded",
			model: "fake:image",
			costMicros: 40_000,
			inputTokens: 50,
			errorCode: null,
		});
		expect(generation.completedAt).toBeInstanceOf(Date);
		expect(generation.durationMs).toBeGreaterThanOrEqual(0);
		expect(images.requests).toHaveLength(1);
		expect(images.requests[0]?.aspectRatio).toBe("4:5");
		expect(images.requests[0]?.prompt).toContain("Style: watercolour.");
		expect(images.requests[0]?.prompt).toContain("Bean There");
		expect(generation.output?.prompt).toBe(images.requests[0]?.prompt);

		expect(media).toHaveLength(1);
		const asset = media[0];
		expect(asset).toMatchObject({
			organizationId: g.orgId,
			uploadedBy: g.userId,
			fileName: "ai-image.png",
			mimeType: "image/png",
			kind: "image",
			status: "ready",
			source: "ai",
			width: 1080,
			height: 1350,
			altText: "A sunrise over a coffee shop",
		});
		expect(asset?.storageKey).toBe(`orgs/${g.orgId}/media/${asset?.id}/ai-image.png`);
		expect(await storage.size(asset?.storageKey as string)).toBe(asset?.sizeBytes as number);
	});

	test("a duplicate or retried job never generates or bills twice", async () => {
		const g = await pending("image", { prompt: "A cat", aspectRatio: "1:1" });
		await processor.process(g.job, FIRST_OF_TWO);
		await processor.process(g.job, LAST_OF_TWO);

		const { generation } = await load(g.id);
		expect(images.requests).toHaveLength(1);
		expect(await mediaCount(g.orgId)).toBe(1);
		expect(generation.costMicros).toBe(40_000);
	});

	test("a refusal fails the generation without retrying", async () => {
		const g = await pending("image", { prompt: "Something unsafe", aspectRatio: "1:1" });
		images.failNext(new AiError("refused", "The image request was declined"));

		await processor.process(g.job, FIRST_OF_TWO); // resolves: nothing for BullMQ to retry

		const { generation } = await load(g.id);
		expect(generation).toMatchObject({
			status: "failed",
			errorCode: "refused",
			errorMessage: "The image request was declined",
		});
		expect(await mediaCount(g.orgId)).toBe(0);
	});

	test("no image provider configured fails as not_configured", async () => {
		const g = await pending("image", { prompt: "A cat", aspectRatio: "1:1" });
		ai.images = null;
		await processor.process(g.job, FIRST_OF_TWO);
		expect((await load(g.id)).generation).toMatchObject({
			status: "failed",
			errorCode: "not_configured",
		});
	});

	test("a transient error before the last attempt is thrown for BullMQ to retry", async () => {
		const g = await pending("image", { prompt: "A cat", aspectRatio: "1:1" });
		images.failNext(new AiError("transient", "Image generation failed"));

		const error = await processor.process(g.job, FIRST_OF_TWO).then(
			() => null,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(AiError);
		expect((await load(g.id)).generation.status).toBe("running");

		// The retry re-claims the running generation and completes it.
		await processor.process(g.job, LAST_OF_TWO);
		expect((await load(g.id)).generation.status).toBe("succeeded");
	});

	test("a transient error on the last attempt fails the generation", async () => {
		const g = await pending("image", { prompt: "A cat", aspectRatio: "1:1" });
		images.failNext(new AiError("rate_limited", "The image provider is busy — try again shortly"));

		await processor.process(g.job, LAST_OF_TWO);

		expect((await load(g.id)).generation).toMatchObject({
			status: "failed",
			errorCode: "transient",
			errorMessage: "The image provider is busy — try again shortly",
		});
	});

	test("an unexpected error on the last attempt fails without leaking internals", async () => {
		const g = await pending("image", { prompt: "A cat", aspectRatio: "1:1" });
		images.failNext(new Error("ECONNRESET 10.0.0.3:5432"));
		await processor.process(g.job, LAST_OF_TWO);
		const { generation } = await load(g.id);
		expect(generation).toMatchObject({ status: "failed", errorCode: "internal" });
		expect(generation.errorMessage).not.toContain("ECONNRESET");
	});

	test("a storage failure after generation still records the cost and cleans up", async () => {
		const g = await pending("image", { prompt: "A cat", aspectRatio: "1:1" });
		const deleted: string[] = [];
		const broken = new AiMediaProcessor({
			db,
			ai,
			storage: {
				write: async () => {
					throw new Error("storage down");
				},
				delete: async (key: string) => {
					deleted.push(key);
				},
				file: storage.file.bind(storage),
			},
			logger,
			publicMediaUrl: "http://storage.test/media",
		});

		await broken.process(g.job, LAST_OF_TWO);

		const { generation } = await load(g.id);
		expect(generation).toMatchObject({
			status: "failed",
			errorCode: "internal",
			costMicros: 40_000,
		});
		expect(await mediaCount(g.orgId)).toBe(0);
	});

	test("a job whose organization does not match the generation is a no-op", async () => {
		const g = await pending("image", { prompt: "A cat", aspectRatio: "1:1" });
		const other = await org();

		await processor.process({ generationId: g.id, organizationId: other.orgId }, FIRST_OF_TWO);

		expect(images.requests).toHaveLength(0);
		expect((await load(g.id)).generation.status).toBe("pending");
	});

	test("invalid stored input fails cleanly instead of crashing the job", async () => {
		const g = await pending("image", { prompt: "", aspectRatio: "3:1" });
		await processor.process(g.job, FIRST_OF_TWO);
		expect((await load(g.id)).generation).toMatchObject({
			status: "failed",
			errorCode: "invalid_request",
		});
		expect(images.requests).toHaveLength(0);
	});
});

describe("ai carousel rendering", () => {
	test("renders every slide as a PNG, stored and recorded in order", async () => {
		const slides = [
			{ heading: "Five habits of great teams", body: "A quick guide" },
			{ heading: "1. Write things down", body: "Decisions outlive meetings." },
			{ heading: "Follow for more", body: "" },
		];
		const g = await pending("carousel", { slides, theme: "paper", footer: "@beanthere" });

		await processor.process(g.job, FIRST_OF_TWO);

		const { generation, media } = await load(g.id);
		expect(generation).toMatchObject({
			status: "succeeded",
			model: "renderer",
			costMicros: 0,
		});
		expect(media.map((m) => m?.fileName)).toEqual(["slide-1.png", "slide-2.png", "slide-3.png"]);
		expect(media.map((m) => m?.altText)).toEqual([
			"Five habits of great teams — A quick guide",
			"1. Write things down — Decisions outlive meetings.",
			"Follow for more",
		]);
		for (const m of media) {
			expect(m).toMatchObject({ source: "ai", status: "ready", width: 1080, height: 1350 });
		}

		const first = new Uint8Array(await storage.file(media[0]?.storageKey as string).arrayBuffer());
		expect([...first.slice(0, 8)]).toEqual(PNG_SIGNATURE);
		expect(first.byteLength).toBe(media[0]?.sizeBytes as number);
	}, 30_000);

	test("an unknown theme falls back to the default instead of failing", async () => {
		const g = await pending("carousel", {
			slides: [{ heading: "Hello", body: "" }],
			theme: "does-not-exist",
		});
		await processor.process(g.job, FIRST_OF_TWO);
		expect((await load(g.id)).generation.status).toBe("succeeded");
	}, 30_000);
});

describe("ai video rendering", () => {
	// Real ffmpeg renders take seconds each: scenes are kept short and few.
	const RENDER_TIMEOUT = 120_000;
	const scenes = [
		{
			caption: "Stop scrolling",
			narration: "Here is a tip.",
			visual: "a desk",
			durationSeconds: 2,
		},
		{ caption: "Follow for more", narration: "", visual: "a phone", durationSeconds: 2 },
	];
	const input = (overrides: Record<string, unknown> = {}) => ({
		scenes,
		background: "theme",
		voiceover: { enabled: true, voice: "coral", style: "upbeat" },
		theme: "midnight",
		...overrides,
	});

	/** The MP4 is stored where the row says, is the size the row says, and is really an MP4. */
	async function expectStoredMp4(asset: { storageKey: string; sizeBytes: number } | undefined) {
		const bytes = new Uint8Array(await storage.file(asset?.storageKey as string).arrayBuffer());
		expect(new TextDecoder().decode(bytes.slice(4, 8))).toBe("ftyp");
		expect(bytes.byteLength).toBe(asset?.sizeBytes as number);
	}

	test(
		"theme backgrounds + voiceover: one ready MP4, narration billed",
		async () => {
			const g = await pending("video", input({ footer: "@beanthere" }));

			await processor.process(g.job, FIRST_OF_TWO);

			const { generation, media } = await load(g.id);
			// Only scenes with narration are voiced: no paid call for an empty line.
			expect(speech.requests).toHaveLength(1);
			expect(speech.requests[0]).toMatchObject({
				text: "Here is a tip.",
				voice: "coral",
				style: "upbeat",
			});
			expect(images.requests).toHaveLength(0);
			expect(generation).toMatchObject({
				status: "succeeded",
				model: "renderer",
				costMicros: "Here is a tip.".length * 20,
				errorCode: null,
			});
			expect(generation.output).toMatchObject({ scenes: 2 });
			expect(generation.output?.durationMs).toBeGreaterThan(0);
			expect(generation.output?.urls).toEqual([
				`http://storage.test/media/${media[0]?.storageKey}`,
			]);

			expect(media).toHaveLength(1);
			const asset = media[0];
			expect(asset).toMatchObject({
				organizationId: g.orgId,
				uploadedBy: g.userId,
				fileName: "ai-video.mp4",
				mimeType: "video/mp4",
				kind: "video",
				status: "ready",
				source: "ai",
				width: 1080,
				height: 1920,
				altText: "Stop scrolling",
			});
			expect(asset?.durationMs).toBe(generation.output?.durationMs as number);
			expect(asset?.storageKey).toBe(`orgs/${g.orgId}/media/${asset?.id}/ai-video.mp4`);
			await expectStoredMp4(asset);
		},
		RENDER_TIMEOUT,
	);

	test(
		"AI backgrounds: one 9:16 on-brand image per scene, image model recorded",
		async () => {
			const g = await pending(
				"video",
				input({ background: "ai", voiceover: { enabled: false, voice: "alloy" } }),
			);
			await db.insert(schema.brandProfiles).values({
				organizationId: g.orgId,
				brandName: "Bean There",
			});

			await processor.process(g.job, FIRST_OF_TWO);

			const { generation, media } = await load(g.id);
			expect(speech.requests).toHaveLength(0);
			expect(images.requests).toHaveLength(2);
			expect(images.requests.map((r) => r.aspectRatio)).toEqual(["9:16", "9:16"]);
			expect(images.requests[0]?.prompt).toContain("a desk");
			expect(images.requests[0]?.prompt).toContain("Bean There");
			expect(generation).toMatchObject({
				status: "succeeded",
				model: "fake:image",
				costMicros: 80_000,
				inputTokens: 100,
			});
			await expectStoredMp4(media[0]);
		},
		RENDER_TIMEOUT,
	);

	test(
		"a scene background from the org's own library is read from storage instead of generated",
		async () => {
			const owner = await org();
			const photo = await new FakeImageModel().generate({ prompt: "x", aspectRatio: "1:1" });
			const [own] = await db
				.insert(schema.mediaAssets)
				.values({
					organizationId: owner.orgId,
					storageKey: `orgs/${owner.orgId}/media/${crypto.randomUUID()}/photo.png`,
					fileName: "photo.png",
					mimeType: "image/png",
					kind: "image",
					sizeBytes: photo.bytes.byteLength,
					status: "ready",
				})
				.returning();
			const ownKey = own?.storageKey as string;
			await storage.write(ownKey, photo.bytes, { type: "image/png" });
			writtenKeys.push(ownKey);

			const g = await pending(
				"video",
				input({
					background: "ai",
					sceneMediaIds: [own?.id, null],
					voiceover: { enabled: false, voice: "alloy" },
				}),
				owner,
			);

			await processor.process(g.job, FIRST_OF_TWO);

			const { generation, media } = await load(g.id);
			// Scene 1 used the library photo; only scene 2 was generated (and paid for).
			expect(images.requests).toHaveLength(1);
			expect(images.requests[0]?.prompt).toContain("a phone");
			expect(generation).toMatchObject({ status: "succeeded", costMicros: 40_000 });
			await expectStoredMp4(media[0]);
		},
		RENDER_TIMEOUT,
	);

	test("a library background deleted before rendering fails cleanly, nothing paid", async () => {
		const g = await pending(
			"video",
			input({ sceneMediaIds: [crypto.randomUUID()], voiceover: { enabled: true, voice: "alloy" } }),
		);
		await processor.process(g.job, FIRST_OF_TWO);
		expect((await load(g.id)).generation).toMatchObject({
			status: "failed",
			errorCode: "invalid_request",
			costMicros: 0,
		});
		expect(speech.requests).toHaveLength(0);
	});

	test(
		"a refused image fails without a retry, and bills what was already generated",
		async () => {
			const g = await pending("video", input({ background: "ai" }));
			images.failNext(new AiError("refused", "The image request was declined"));

			await processor.process(g.job, FIRST_OF_TWO); // resolves: nothing for BullMQ to retry

			const { generation } = await load(g.id);
			expect(generation).toMatchObject({ status: "failed", errorCode: "refused" });
			// Whatever succeeded alongside the refusal (the other image, the narration) was paid for.
			expect(generation.costMicros).toBeGreaterThan(0);
			expect(await mediaCount(g.orgId)).toBe(0);
		},
		RENDER_TIMEOUT,
	);

	test("voiceover without a speech model fails as not_configured", async () => {
		const g = await pending("video", input());
		ai.speech = null;
		await processor.process(g.job, FIRST_OF_TWO);
		expect((await load(g.id)).generation).toMatchObject({
			status: "failed",
			errorCode: "not_configured",
		});
	});
});

describe("maintenance", () => {
	test("times out generations whose job was lost", async () => {
		const owner = await org();
		const old = await pending("image", { prompt: "A cat", aspectRatio: "1:1" }, owner);
		const fresh = await pending("image", { prompt: "A dog", aspectRatio: "1:1" }, owner);
		await db
			.update(schema.aiGenerations)
			.set({ status: "running", createdAt: sql`now() - interval '31 minutes'` })
			.where(eq(schema.aiGenerations.id, old.id));

		const maintenance = new Maintenance(db, jobs, new TargetState(db), logger);
		await maintenance.run({ task: "recover-stuck-targets" });

		expect((await load(old.id)).generation).toMatchObject({
			status: "failed",
			errorCode: "timeout",
		});
		expect((await load(fresh.id)).generation.status).toBe("pending");

		// A job that turns up afterwards must not resurrect it.
		await processor.process(old.job, FIRST_OF_TWO);
		expect(images.requests).toHaveLength(0);
	});
});
