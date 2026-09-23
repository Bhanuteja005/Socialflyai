import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { adsTools, ai, db, jobs, logger, redis, tokenCipher } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import { AdsAccountsService } from "./ads.accounts.service.ts";
import { AdsCampaignsService } from "./ads.campaigns.service.ts";
import {
	activateBody,
	connectAccountsBody,
	copyBody,
	createCampaignBody,
	idParam,
	listCampaignsQuery,
	overviewQuery,
	pendingParam,
	providerParam,
	rejectBody,
	retryBody,
	targetingQuery,
	updateAccountBody,
	updateCampaignBody,
	updateSettingsBody,
} from "./ads.schemas.ts";

const accounts = new AdsAccountsService(db, redis, () => adsTools.providers, tokenCipher, logger);
const campaigns = new AdsCampaignsService(db, ai, jobs, () => adsTools.providers, accounts, logger);
const tags = ["Ads"];

/**
 * The ad platform redirects the BROWSER here after consent: a top-level GET outside
 * requireUser and CSRF, like the channels callback. The single-use state (bound to the
 * organization and admin at connect time) is what authenticates it.
 */
export const adsCallbackRoutes = new Hono().get(
	"/callback/:provider",
	describeRoute({ tags, summary: "OAuth redirect target (browser)", hide: true }),
	validate("param", providerParam),
	validate(
		"query",
		z.object({
			code: z.string().max(4000).optional(),
			state: z.string().max(200).optional(),
			error: z.string().max(500).optional(),
			// OAuth 1.0a (X Ads) answers with these instead of `code`.
			oauth_token: z.string().max(500).optional(),
			oauth_verifier: z.string().max(500).optional(),
		}),
	),
	async (ctx) =>
		ctx.redirect(
			await accounts.completeConnect(ctx.req.valid("param").provider, ctx.req.valid("query")),
		),
);

/**
 * Ads. Every member reads; editors write drafts, ask the AI for copy, submit, pause and
 * retry; admins (and owners) connect ad accounts, approve, ACTIVATE (the only step that
 * starts spending), archive and set the budget ceiling.
 */
export const adsRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)

	// ── connections ───────────────────────────────────────────────────────────
	.get(
		"/providers",
		describeRoute({ tags, summary: "Ad platforms, whether they are set up, and their limits" }),
		(ctx) => ctx.json(accounts.listProviders()),
	)
	.post(
		"/connect/:provider",
		describeRoute({ tags, summary: "Start OAuth — returns the platform consent URL" }),
		requireRole("admin"),
		validate("param", providerParam),
		async (ctx) =>
			ctx.json(
				await accounts.startConnect(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("param").provider,
				),
			),
	)
	.get(
		"/pending/:key",
		describeRoute({ tags, summary: "Ad accounts found during connect, to choose from" }),
		requireRole("admin"),
		validate("param", pendingParam),
		async (ctx) =>
			ctx.json(await accounts.getPending(ctx.get("org").id, ctx.req.valid("param").key)),
	)
	.post(
		"/accounts",
		describeRoute({ tags, summary: "Connect the chosen ad accounts" }),
		requireRole("admin"),
		validate("json", connectAccountsBody),
		async (ctx) => {
			const { pendingKey, externalIds } = ctx.req.valid("json");
			return ctx.json(
				await accounts.confirmAccounts(ctx.get("org").id, pendingKey, externalIds),
				201,
			);
		},
	)
	.get("/accounts", describeRoute({ tags, summary: "Connected ad accounts" }), async (ctx) =>
		ctx.json(await accounts.list(ctx.get("org").id)),
	)
	.patch(
		"/accounts/:id",
		describeRoute({ tags, summary: "Set the identity the account's ads run as" }),
		requireRole("admin"),
		validate("param", idParam),
		validate("json", updateAccountBody),
		async (ctx) =>
			ctx.json(
				await accounts.updateMetadata(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").metadata,
				),
			),
	)
	.delete(
		"/accounts/:id",
		describeRoute({ tags, summary: "Disconnect an ad account (not while campaigns exist on it)" }),
		requireRole("admin"),
		validate("param", idParam),
		async (ctx) => {
			await accounts.disconnect(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	)
	.get(
		"/accounts/:id/identities",
		describeRoute({ tags, summary: "Choices for the account's identity fields" }),
		requireRole("admin"),
		validate("param", idParam),
		async (ctx) =>
			ctx.json(await accounts.identities(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.get(
		"/accounts/:id/targeting",
		describeRoute({ tags, summary: "Search interests, locations, job titles… (30/min per org)" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("query", targetingQuery),
		async (ctx) =>
			ctx.json(
				await accounts.searchTargeting(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("query"),
				),
			),
	)

	// ── AI copy ───────────────────────────────────────────────────────────────
	.post(
		"/copy",
		describeRoute({ tags, summary: "AI ad copy variants and targeting suggestions (not saved)" }),
		requireRole("editor"),
		validate("json", copyBody),
		async (ctx) =>
			ctx.json(
				await campaigns.copy(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
			),
	)

	// ── campaigns ─────────────────────────────────────────────────────────────
	.get(
		"/campaigns",
		describeRoute({ tags, summary: "Campaigns, newest first (keyset cursor)" }),
		validate("query", listCampaignsQuery),
		async (ctx) => ctx.json(await campaigns.list(ctx.get("org").id, ctx.req.valid("query"))),
	)
	.post(
		"/campaigns",
		describeRoute({ tags, summary: "Save a campaign draft, or submit it" }),
		requireRole("editor"),
		validate("json", createCampaignBody),
		async (ctx) =>
			ctx.json(
				await campaigns.create(ctx.get("org"), ctx.get("auth").userId, ctx.req.valid("json")),
				201,
			),
	)
	.get(
		"/campaigns/:id",
		describeRoute({ tags, summary: "A campaign with its draft and delivery metrics" }),
		validate("param", idParam),
		async (ctx) => ctx.json(await campaigns.get(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.patch(
		"/campaigns/:id",
		describeRoute({ tags, summary: "Edit or (re)submit a draft, pending or rejected campaign" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", updateCampaignBody),
		async (ctx) =>
			ctx.json(
				await campaigns.update(
					ctx.get("org"),
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.delete(
		"/campaigns/:id",
		describeRoute({ tags, summary: "Delete a draft or rejected campaign" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => {
			await campaigns.remove(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	)
	.post(
		"/campaigns/:id/approve",
		describeRoute({ tags, summary: "Approve — creates the campaign on the platform, PAUSED" }),
		requireRole("admin"),
		validate("param", idParam),
		async (ctx) =>
			ctx.json(
				await campaigns.approve(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
				),
			),
	)
	.post(
		"/campaigns/:id/reject",
		describeRoute({ tags, summary: "Reject a campaign waiting for approval" }),
		requireRole("admin"),
		validate("param", idParam),
		validate("json", rejectBody),
		async (ctx) =>
			ctx.json(
				await campaigns.reject(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").reason,
				),
			),
	)
	.post(
		"/campaigns/:id/activate",
		describeRoute({
			tags,
			summary: "Start spending: needs the budget typed back exactly (confirmBudget)",
		}),
		requireRole("admin"),
		validate("param", idParam),
		validate("json", activateBody),
		async (ctx) =>
			ctx.json(
				await campaigns.activate(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
					ctx.req.valid("json").confirmBudget,
				),
			),
	)
	.post(
		"/campaigns/:id/pause",
		describeRoute({ tags, summary: "Stop spending (active campaigns)" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => ctx.json(await campaigns.pause(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.post(
		"/campaigns/:id/archive",
		describeRoute({ tags, summary: "Archive a campaign (on the platform when it exists there)" }),
		requireRole("admin"),
		validate("param", idParam),
		async (ctx) => ctx.json(await campaigns.archive(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.post(
		"/campaigns/:id/retry",
		describeRoute({
			tags,
			summary: "Create a failed campaign again (unconfirmed ones need confirmNotCreated)",
		}),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", retryBody),
		async (ctx) =>
			ctx.json(
				await campaigns.retry(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").confirmNotCreated,
				),
			),
	)

	// ── settings & overview ───────────────────────────────────────────────────
	.get(
		"/settings",
		describeRoute({ tags, summary: "The daily budget ceiling (effective, server, organization)" }),
		async (ctx) => ctx.json(await campaigns.settings(ctx.get("org").id)),
	)
	.patch(
		"/settings",
		describeRoute({ tags, summary: "Set the organization's daily budget ceiling" }),
		requireRole("admin"),
		validate("json", updateSettingsBody),
		async (ctx) =>
			ctx.json(
				await campaigns.updateSettings(ctx.get("org").id, ctx.req.valid("json").adsMaxDailyBudget),
			),
	)
	.get(
		"/overview",
		describeRoute({ tags, summary: "Spend and delivery by currency, campaign and platform" }),
		validate("query", overviewQuery),
		async (ctx) => ctx.json(await campaigns.overview(ctx.get("org").id, ctx.req.valid("query"))),
	);
