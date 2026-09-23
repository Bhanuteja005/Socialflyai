import { apiEnv as env } from "@socialfly/config";
import { AppError, conflict, forbidden, notFound } from "@socialfly/core/errors";
import { emails, type Mailer } from "@socialfly/core/mail";
import { hashToken, normalizeEmail, randomToken } from "@socialfly/core/security";
import { and, asc, count, type Database, eq, gt, isNull, schema } from "@socialfly/db";
import { roleAtLeast } from "#src/middlewares/auth.ts";
import type { MemberRole, OrgContext } from "#src/shared/context.ts";

const { organizations, memberships, invitations, users } = schema;
const INVITATION_TTL_MS = 7 * 24 * 3600_000;

const slugify = (name: string) =>
	`${
		name
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 40) || "workspace"
	}-${randomToken(4)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")}`;

export class OrganizationsService {
	constructor(
		private readonly db: Database,
		private readonly mailer: Mailer,
	) {}

	async listForUser(userId: string) {
		const rows = await this.db
			.select({ org: organizations, role: memberships.role })
			.from(memberships)
			.innerJoin(organizations, eq(organizations.id, memberships.organizationId))
			.where(and(eq(memberships.userId, userId), isNull(organizations.deletedAt)))
			.orderBy(asc(organizations.name));
		return rows.map(({ org, role }) => this.toDto(org, role));
	}

	/** The creator becomes the owner, atomically — an org can never exist without one. */
	async create(userId: string, input: { name: string; timezone: string }) {
		return this.db.transaction(async (tx) => {
			const [org] = await tx
				.insert(organizations)
				.values({
					name: input.name,
					timezone: input.timezone,
					slug: slugify(input.name),
					createdBy: userId,
				})
				.returning();
			if (!org) throw new Error("organization insert returned no row");
			await tx.insert(memberships).values({ organizationId: org.id, userId, role: "owner" });
			return this.toDto(org, "owner");
		});
	}

	async get(org: OrgContext) {
		const [row] = await this.db
			.select()
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);
		if (!row) throw notFound("Organization");
		return this.toDto(row, org.role);
	}

	async update(org: OrgContext, input: { name?: string; timezone?: string }) {
		const [row] = await this.db
			.update(organizations)
			.set(input)
			.where(eq(organizations.id, org.id))
			.returning();
		if (!row) throw notFound("Organization");
		return this.toDto(row, org.role);
	}

	/** Soft delete: posts and channels stay for audit, but nobody can open the org any more. */
	async remove(org: OrgContext) {
		await this.db
			.update(organizations)
			.set({ deletedAt: new Date() })
			.where(eq(organizations.id, org.id));
	}

	// ── members ──────────────────────────────────────────────────────────────────

	async listMembers(orgId: string) {
		const rows = await this.db
			.select({ membership: memberships, user: users })
			.from(memberships)
			.innerJoin(users, eq(users.id, memberships.userId))
			.where(eq(memberships.organizationId, orgId))
			.orderBy(asc(memberships.createdAt));
		return rows.map(({ membership, user }) => ({
			userId: user.id,
			email: user.email,
			name: user.name,
			avatarUrl: user.avatarUrl,
			role: membership.role,
			joinedAt: membership.createdAt.toISOString(),
		}));
	}

	async changeRole(org: OrgContext, userId: string, role: MemberRole) {
		// Only an owner can create or demote an owner.
		const target = await this.membership(org.id, userId);
		if ((role === "owner" || target.role === "owner") && org.role !== "owner") {
			throw forbidden("Only an owner can change owner roles");
		}
		if (target.role === "owner" && role !== "owner") await this.assertNotLastOwner(org.id);
		await this.db
			.update(memberships)
			.set({ role })
			.where(and(eq(memberships.organizationId, org.id), eq(memberships.userId, userId)));
	}

	/** Admins remove others; anyone may remove themselves (leave). */
	async removeMember(org: OrgContext, actorId: string, userId: string) {
		if (userId !== actorId && !roleAtLeast(org.role, "admin"))
			throw forbidden("Only admins can remove members");
		const target = await this.membership(org.id, userId);
		if (target.role === "owner") {
			if (org.role !== "owner" && userId !== actorId)
				throw forbidden("Only an owner can remove an owner");
			await this.assertNotLastOwner(org.id);
		}
		await this.db
			.delete(memberships)
			.where(and(eq(memberships.organizationId, org.id), eq(memberships.userId, userId)));
	}

	// ── invitations ─────────────────────────────────────────────────────────────

	async listInvitations(orgId: string) {
		const rows = await this.db
			.select()
			.from(invitations)
			.where(
				and(
					eq(invitations.organizationId, orgId),
					isNull(invitations.acceptedAt),
					isNull(invitations.revokedAt),
					gt(invitations.expiresAt, new Date()),
				),
			);
		return rows.map((i) => ({
			id: i.id,
			email: i.emailNormalized,
			role: i.role,
			expiresAt: i.expiresAt.toISOString(),
		}));
	}

	async invite(
		org: OrgContext,
		inviterId: string,
		input: { email: string; role: Exclude<MemberRole, "owner"> },
	) {
		const email = normalizeEmail(input.email);
		const [existing] = await this.db
			.select({ id: memberships.id })
			.from(memberships)
			.innerJoin(users, eq(users.id, memberships.userId))
			.where(and(eq(memberships.organizationId, org.id), eq(users.emailNormalized, email)))
			.limit(1);
		if (existing) throw conflict("That person is already a member", "already_member");

		// Re-inviting replaces the open invitation (fresh token, fresh expiry).
		await this.db
			.update(invitations)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(invitations.organizationId, org.id),
					eq(invitations.emailNormalized, email),
					isNull(invitations.acceptedAt),
					isNull(invitations.revokedAt),
				),
			);

		const token = randomToken(32);
		const [invitation] = await this.db
			.insert(invitations)
			.values({
				organizationId: org.id,
				emailNormalized: email,
				role: input.role,
				tokenHash: hashToken(token),
				invitedBy: inviterId,
				expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
			})
			.returning();
		if (!invitation) throw new Error("invitation insert returned no row");

		const [[organization], [inviter]] = await Promise.all([
			this.db
				.select({ name: organizations.name })
				.from(organizations)
				.where(eq(organizations.id, org.id)),
			this.db
				.select({ name: users.name, email: users.email })
				.from(users)
				.where(eq(users.id, inviterId)),
		]);
		const url = `${env.WEB_URL.replace(/\/+$/, "")}/invite?token=${encodeURIComponent(token)}`;
		void this.mailer.send({
			to: email,
			...emails.invitation(
				url,
				organization?.name ?? "a workspace",
				inviter?.name ?? inviter?.email ?? "A teammate",
			),
		});

		return {
			id: invitation.id,
			email,
			role: invitation.role,
			expiresAt: invitation.expiresAt.toISOString(),
			// Only exposed to the test suite, which has no inbox to read the link from.
			...(env.NODE_ENV === "test" ? { token } : {}),
		};
	}

	async revokeInvitation(orgId: string, id: string) {
		const [row] = await this.db
			.update(invitations)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(invitations.id, id),
					eq(invitations.organizationId, orgId),
					isNull(invitations.acceptedAt),
				),
			)
			.returning({ id: invitations.id });
		if (!row) throw notFound("Invitation");
	}

	/**
	 * The invitation is bound to an email: only a user signed in with THAT address
	 * can accept it, so a forwarded link cannot be used by someone else.
	 */
	async acceptInvitation(userId: string, token: string) {
		return this.db.transaction(async (tx) => {
			const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
			const [invitation] = await tx
				.select()
				.from(invitations)
				.where(
					and(
						eq(invitations.tokenHash, hashToken(token)),
						isNull(invitations.acceptedAt),
						isNull(invitations.revokedAt),
						gt(invitations.expiresAt, new Date()),
					),
				)
				.limit(1);
			if (!invitation || !user)
				throw new AppError(400, "invalid_invitation", "This invitation is invalid or has expired");
			if (invitation.emailNormalized !== user.emailNormalized) {
				throw new AppError(
					403,
					"invitation_email_mismatch",
					`This invitation was sent to ${invitation.emailNormalized}. Sign in with that address to accept it.`,
				);
			}

			await tx
				.insert(memberships)
				.values({ organizationId: invitation.organizationId, userId, role: invitation.role })
				.onConflictDoNothing();
			await tx
				.update(invitations)
				.set({ acceptedAt: new Date() })
				.where(eq(invitations.id, invitation.id));
			const [org] = await tx
				.select()
				.from(organizations)
				.where(eq(organizations.id, invitation.organizationId));
			if (!org) throw notFound("Organization");
			return this.toDto(org, invitation.role);
		});
	}

	// ── helpers ─────────────────────────────────────────────────────────────────

	private async membership(orgId: string, userId: string) {
		const [row] = await this.db
			.select()
			.from(memberships)
			.where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, userId)))
			.limit(1);
		if (!row) throw notFound("Member");
		return row;
	}

	private async assertNotLastOwner(orgId: string) {
		const [row] = await this.db
			.select({ owners: count() })
			.from(memberships)
			.where(and(eq(memberships.organizationId, orgId), eq(memberships.role, "owner")));
		if ((row?.owners ?? 0) <= 1) {
			throw new AppError(
				409,
				"last_owner",
				"An organization needs at least one owner — promote someone else first",
			);
		}
	}

	private toDto(org: typeof organizations.$inferSelect, role: MemberRole) {
		return {
			id: org.id,
			name: org.name,
			slug: org.slug,
			timezone: org.timezone,
			role,
			createdAt: org.createdAt.toISOString(),
		};
	}
}
