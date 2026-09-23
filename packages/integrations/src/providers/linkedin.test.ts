import { describe, expect, test } from "bun:test";
import { escapeLittleText } from "./linkedin";

describe("escapeLittleText", () => {
	test("escapes every little-text reserved character", () => {
		expect(escapeLittleText("Launch (beta) #1 @team [link] <b> *bold* _it_ ~x~ a|b {c} \\")).toBe(
			"Launch \\(beta\\) \\#1 \\@team \\[link\\] \\<b\\> \\*bold\\* \\_it\\_ \\~x\\~ a\\|b \\{c\\} \\\\",
		);
	});

	test("leaves ordinary text untouched", () => {
		expect(escapeLittleText("Hello, world! 100% ready.")).toBe("Hello, world! 100% ready.");
	});
});
