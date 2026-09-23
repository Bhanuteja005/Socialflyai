import type { AuthVariables } from "@socialfly/core/auth";
import type { schema } from "@socialfly/db";

export type MemberRole = (typeof schema.memberRole.enumValues)[number];

export type OrgContext = { id: string; role: MemberRole };

/** Hono env for authenticated routes. */
export type UserEnv = { Variables: AuthVariables };

/** Hono env for routes scoped to an organization (everything tenant-owned). */
export type OrgEnv = { Variables: AuthVariables & { org: OrgContext } };
