import { describe, expect, test } from "bun:test";
import { AiError } from "@socialfly/ai";
import { FakeVisibilityEngine } from "./testing";

describe("FakeVisibilityEngine", () => {
	test("returns queued answers with defaults, records prompts, throws queued errors", async () => {
		const engine = new FakeVisibilityEngine("gemini")
			.reply({ answer: "Acme is great", citations: [{ url: "https://acme.io/" }] })
			.reply(new AiError("rate_limited", "slow down"));
		const answer = await engine.ask("best tool?");
		expect(answer).toEqual({
			answer: "Acme is great",
			citations: [{ url: "https://acme.io/" }],
			model: "fake:gemini",
			costMicros: 12_000,
		});
		expect(await engine.ask("again").catch((e) => (e as AiError).kind)).toBe("rate_limited");
		expect(engine.prompts).toEqual(["best tool?", "again"]);
		expect(engine.id).toBe("gemini");
	});
});
