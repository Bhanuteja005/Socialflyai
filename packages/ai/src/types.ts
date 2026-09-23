import type { ProviderId } from "@socialfly/integrations";
import type { z } from "zod";

/**
 * The contract between SocialFly and AI providers.
 *
 * Same rules as platform adapters (packages/integrations): providers are
 * STATELESS — no database, no queues, no storage. They take a request and return
 * content plus what it cost. Persisting results, enforcing budgets and retrying
 * belong to the callers (apps/api for text, apps/worker for media).
 */

export type Usage = { inputTokens: number; outputTokens: number };

/** What every call reports back, so the caller can bill it to the organization. */
export type Metered = {
	/** Provider-qualified model that actually served the call, e.g. "anthropic:claude-opus-5". */
	model: string;
	usage: Usage;
	/** Millionths of a USD. Integer so ledger sums never drift. */
	costMicros: number;
};

export type TextRequest<T> = {
	system: string;
	prompt: string;
	/** Output is constrained to this schema by the provider and re-validated here. */
	schema: z.ZodType<T>;
	maxTokens?: number;
	signal?: AbortSignal;
};

export type TextResult<T> = Metered & { output: T };

export interface TextModel {
	/** Provider-qualified id of the configured model. */
	readonly id: string;
	generate<T>(request: TextRequest<T>): Promise<TextResult<T>>;
}

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type ImageRequest = {
	prompt: string;
	aspectRatio: AspectRatio;
	signal?: AbortSignal;
};

export type GeneratedImage = Metered & {
	bytes: Uint8Array;
	mimeType: "image/png" | "image/jpeg" | "image/webp";
	width: number;
	height: number;
};

export interface ImageModel {
	readonly id: string;
	generate(request: ImageRequest): Promise<GeneratedImage>;
}

/** The organization's voice, as stored in brand_profiles. Every field optional in practice. */
export type BrandContext = {
	brandName: string;
	description: string;
	audience: string;
	voice: string;
	website?: string | null;
	keywords: string[];
	avoid: string[];
	examplePosts: string[];
};

export type Platform = ProviderId;
