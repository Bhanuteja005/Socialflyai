import { app } from "#src/app.ts";

export const ORIGIN = "http://localhost:3000";
export const CLIENT_ID = "socialfly-web";

/**
 * A tiny cookie-jar browser over `app.request()`: keeps cookies between calls and
 * sends the CSRF header the way the web app does. No network, no server.
 */
export class TestBrowser {
	readonly cookies = new Map<string, string>();

	async request(
		method: string,
		path: string,
		body?: unknown,
		headers: Record<string, string> = {},
	) {
		const res = await app.request(path, {
			method,
			headers: {
				Origin: ORIGIN,
				Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
				...(this.cookies.has("sf_csrf")
					? { "X-CSRF-Token": this.cookies.get("sf_csrf") as string }
					: {}),
				...(body ? { "Content-Type": "application/json" } : {}),
				...headers,
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		for (const cookie of res.headers.getSetCookie()) {
			const [pair] = cookie.split(";");
			const [name, ...rest] = (pair ?? "").split("=");
			const value = rest.join("=");
			if (!name) continue;
			if (value === "" || /max-age=0/i.test(cookie)) this.cookies.delete(name);
			else this.cookies.set(name, value);
		}
		return res;
	}

	async csrf() {
		return this.request("GET", `/auth/csrf?client_id=${CLIENT_ID}`);
	}
}

export const uniqueEmail = () => `user-${crypto.randomUUID()}@example.test`;
export const STRONG_PASSWORD = "Correct-Horse-9-Battery";
