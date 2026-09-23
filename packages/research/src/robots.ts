/**
 * robots.txt as specified by RFC 9309 (the rules Google and Bing follow):
 *
 *  - The group whose User-agent matches our product token wins; otherwise `*`.
 *    Several groups naming the same agent are merged.
 *  - Within the group, the longest matching path wins; on a tie Allow beats Disallow.
 *  - `*` matches any run of characters, `$` anchors the end.
 *
 * Crawl-delay is not in the RFC but is common; the crawler honours it (capped).
 */

type Rule = { allow: boolean; pattern: string; regex: RegExp };

export type Robots = {
	isAllowed(pathAndQuery: string): boolean;
	/** Seconds, or null when the site did not ask. */
	crawlDelay: number | null;
	sitemaps: string[];
};

export const ALLOW_ALL: Robots = { isAllowed: () => true, crawlDelay: null, sitemaps: [] };
export const DISALLOW_ALL: Robots = { isAllowed: () => false, crawlDelay: null, sitemaps: [] };

/** "SocialFlyBot/1.0 (+https://…)" → "socialflybot": what robots.txt groups name. */
export function productToken(userAgent: string): string {
	return (userAgent.trim().split(/[\s/]/)[0] ?? "").toLowerCase();
}

function toRegex(pattern: string): RegExp {
	const anchored = pattern.endsWith("$");
	const body = (anchored ? pattern.slice(0, -1) : pattern)
		.split("*")
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Robots paths are matched percent-encoded; normalise both sides the same way. */
function encodePath(path: string): string {
	try {
		return encodeURI(decodeURI(path));
	} catch {
		return path;
	}
}

export function parseRobots(text: string, userAgent: string): Robots {
	const token = productToken(userAgent);
	type Group = { agents: string[]; rules: Rule[]; crawlDelay: number | null };
	const groups: Group[] = [];
	const sitemaps: string[] = [];
	let current: Group | null = null;
	// A run of User-agent lines opens one group; the first rule line closes the run.
	let collectingAgents = false;

	for (const rawLine of text.split(/\r?\n|\r/)) {
		const line = rawLine.replace(/#.*$/, "").trim();
		if (!line) continue;
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const key = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();

		if (key === "sitemap") {
			if (value) sitemaps.push(value);
			continue;
		}
		if (key === "user-agent") {
			if (!collectingAgents || !current) {
				current = { agents: [], rules: [], crawlDelay: null };
				groups.push(current);
				collectingAgents = true;
			}
			current.agents.push(value.toLowerCase());
			continue;
		}
		if (!current) continue; // rules before any User-agent are ignored (RFC 9309 §2.1)
		collectingAgents = false;
		if (key === "allow" || key === "disallow") {
			// An empty Disallow means "nothing is disallowed" — it is simply no rule.
			if (!value) continue;
			const pattern = encodePath(value);
			current.rules.push({ allow: key === "allow", pattern, regex: toRegex(pattern) });
		} else if (key === "crawl-delay") {
			const seconds = Number(value);
			if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
		}
	}

	// Agent lines may carry a version ("SocialFlyBot/1.0"); compare product tokens.
	const named = groups.filter((g) =>
		g.agents.some((a) => a !== "*" && token !== "" && productToken(a) === token),
	);
	const chosen = named.length ? named : groups.filter((g) => g.agents.includes("*"));
	const rules = chosen.flatMap((g) => g.rules);
	const delays = chosen.map((g) => g.crawlDelay).filter((d): d is number => d !== null);

	return {
		sitemaps,
		crawlDelay: delays.length ? Math.max(...delays) : null,
		isAllowed(pathAndQuery: string) {
			// /robots.txt itself is always allowed (RFC 9309 §2.2.2).
			if (pathAndQuery === "/robots.txt") return true;
			const target = encodePath(pathAndQuery || "/");
			let best: Rule | null = null;
			for (const rule of rules) {
				if (!rule.regex.test(target)) continue;
				if (
					!best ||
					rule.pattern.length > best.pattern.length ||
					(rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
				) {
					best = rule;
				}
			}
			return best ? best.allow : true;
		},
	};
}
