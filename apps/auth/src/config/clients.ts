import { authEnv as env } from "@socialfly/config";
import { badRequest, forbidden } from "@socialfly/core/errors";
import { z } from "zod";

/**
 * First-party clients allowed to authenticate users. Every login/register call
 * names its client_id, and the request Origin must be one the client owns — so a
 * token can only be obtained from our own apps.
 *
 * Defaults come from WEB_URL; override the whole list with AUTH_CLIENTS_JSON
 * (e.g. when adding a mobile app or an admin console).
 */
const clientSchema = z.object({
	clientId: z.string().min(1),
	name: z.string(),
	origins: z.array(z.string().url()),
	/** Where the Google callback may send the browser afterwards. */
	redirectUris: z.array(z.string().url()),
	registrationEnabled: z.boolean(),
	loginEnabled: z.boolean(),
	oauthProviders: z.array(z.enum(["google"])),
});
export type AuthClient = z.infer<typeof clientSchema>;

const defaults: AuthClient[] = [
	{
		clientId: "socialfly-web",
		name: "SocialFly web app",
		origins: [new URL(env.WEB_URL).origin],
		redirectUris: [`${new URL(env.WEB_URL).origin}/auth/callback`],
		registrationEnabled: true,
		loginEnabled: true,
		oauthProviders: ["google"],
	},
];

const clients = new Map(
	(env.AUTH_CLIENTS_JSON
		? z.array(clientSchema).parse(JSON.parse(env.AUTH_CLIENTS_JSON))
		: defaults
	).map((c) => [c.clientId, c]),
);

export function getClient(clientId: string): AuthClient {
	const client = clients.get(clientId);
	if (!client) throw badRequest("Unknown client_id");
	return client;
}

/**
 * Browsers always send Origin on cross-origin POSTs; its absence means a
 * non-browser caller, which is allowed (CSRF is a browser-only attack).
 */
export function assertClientOrigin(clientId: string, origin: string | undefined): AuthClient {
	const client = getClient(clientId);
	if (origin && !client.origins.includes(origin)) {
		throw forbidden("This origin may not authenticate as this client");
	}
	return client;
}
