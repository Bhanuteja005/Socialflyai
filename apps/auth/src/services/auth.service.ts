import { authEnv } from "@socialfly/config";
import {
	type AccessClaims,
	type JwtConfig,
	type PublicUser,
	REFRESH_TOKEN_TTL_SECONDS,
	type SessionInfo,
	signAccessJwt,
} from "@socialfly/core/auth";
import { AppError, badRequest, conflict, notFound, unauthorized } from "@socialfly/core/errors";
import { emails, type Mailer } from "@socialfly/core/mail";
import {
	hashPassword,
	hashToken,
	isPasswordStrong,
	normalizeEmail,
	PASSWORD_RULES,
	randomToken,
	verifyPassword,
} from "@socialfly/core/security";
import { and, type Database, desc, eq, gt, isNull, ne, schema, sql } from "@socialfly/db";
import { audit, type RequestMeta } from "./audit";

const { users, authSessions, authEmailTokens } = schema;

type UserRow = typeof users.$inferSelect;
type SessionRow = typeof authSessions.$inferSelect;

/**
 * A second refresh presenting the PREVIOUS token within this window is treated as
 * a benign race (two tabs refreshing at once), not theft: it gets a fresh access
 * token but no new refresh token. Outside the window it is reuse → revoke all.
 */
const REFRESH_REUSE_GRACE_MS = 30_000;

const EMAIL_TOKEN_TTL_MS = { verification: 24 * 3600_000, recovery: 3600_000 } as const;

/** Burned on unknown-email logins so response time does not reveal which emails exist. */
const TIMING_DUMMY_HASH = await hashPassword("timing-equaliser-not-a-real-password!");

export type IssuedSession = {
	accessToken: string;
	/** Absent on a grace-window refresh: keep the refresh cookie the client already has. */
	refreshToken?: string;
	user: PublicUser;
	session: SessionInfo;
};

export const toPublicUser = (u: UserRow): PublicUser => ({
	id: u.id,
	email: u.email,
	emailVerified: Boolean(u.emailVerifiedAt),
	name: u.name,
	avatarUrl: u.avatarUrl,
});

const toSessionInfo = (s: SessionRow): SessionInfo => ({
	id: s.id,
	clientId: s.clientId,
	expiresAt: s.expiresAt.toISOString(),
	authenticatedAt: s.createdAt.toISOString(),
});

/** Postgres unique_violation, whether raw (postgres-js) or wrapped by Drizzle. */
const isUniqueViolation = (error: unknown): boolean => {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code === "23505" || e?.cause?.code === "23505";
};

export class AuthService {
	constructor(
		private readonly db: Database,
		private readonly mailer: Mailer,
		private readonly jwt: JwtConfig,
		private readonly webUrl: string,
	) {}

	// ── registration & login ───────────────────────────────────────────────────

	async register(
		input: { clientId: string; email: string; password: string; name?: string },
		meta: RequestMeta,
	): Promise<IssuedSession> {
		if (!isPasswordStrong(input.password)) throw badRequest(`Password needs ${PASSWORD_RULES}`);

		let user: UserRow;
		try {
			[user] = (await this.db
				.insert(users)
				.values({
					email: input.email.trim(),
					emailNormalized: normalizeEmail(input.email),
					passwordHash: await hashPassword(input.password),
					name: input.name ?? null,
				})
				.returning()) as [UserRow];
		} catch (error) {
			if (isUniqueViolation(error))
				throw conflict("An account with this email already exists", "email_taken");
			throw error;
		}

		await audit(this.db, "register", { ...meta, userId: user.id, clientId: input.clientId });
		void this.sendEmailToken(user, "verification");
		return this.createSession(user, input.clientId, meta);
	}

	async login(
		input: { clientId: string; email: string; password: string },
		meta: RequestMeta,
	): Promise<IssuedSession> {
		const [user] = await this.db
			.select()
			.from(users)
			.where(eq(users.emailNormalized, normalizeEmail(input.email)))
			.limit(1);

		const valid = await verifyPassword(input.password, user?.passwordHash ?? TIMING_DUMMY_HASH);
		if (!user?.passwordHash || !valid || user.status !== "active") {
			await audit(this.db, "login_failed", { ...meta, userId: user?.id, clientId: input.clientId });
			throw unauthorized("Invalid email or password");
		}

		await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
		await audit(this.db, "login", { ...meta, userId: user.id, clientId: input.clientId });
		return this.createSession(user, input.clientId, meta);
	}

	async createSession(user: UserRow, clientId: string, meta: RequestMeta): Promise<IssuedSession> {
		const refreshToken = randomToken(48);
		const [session] = (await this.db
			.insert(authSessions)
			.values({
				userId: user.id,
				clientId,
				refreshTokenHash: hashToken(refreshToken),
				userAgent: meta.userAgent,
				ip: meta.ip,
				expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
				lastUsedAt: new Date(),
			})
			.returning()) as [SessionRow];

		return {
			accessToken: await this.signAccess(user, session),
			refreshToken,
			user: toPublicUser(user),
			session: toSessionInfo(session),
		};
	}

	// ── refresh with rotation + reuse detection ───────────────────────────────

	async refresh(presented: string, meta: RequestMeta): Promise<IssuedSession> {
		const presentedHash = hashToken(presented);
		const nextToken = randomToken(48);
		const now = new Date();

		// Atomic rotation: only one concurrent request can win this UPDATE.
		const [rotated] = await this.db
			.update(authSessions)
			.set({
				previousRefreshTokenHash: presentedHash,
				refreshTokenHash: hashToken(nextToken),
				lastUsedAt: now,
				expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
			})
			.where(
				and(
					eq(authSessions.refreshTokenHash, presentedHash),
					isNull(authSessions.revokedAt),
					gt(authSessions.expiresAt, now),
				),
			)
			.returning();

		if (rotated) {
			const user = await this.activeUser(rotated.userId);
			return {
				accessToken: await this.signAccess(user, rotated),
				refreshToken: nextToken,
				user: toPublicUser(user),
				session: toSessionInfo(rotated),
			};
		}

		// Not current. Was it the previous token of some session?
		const [previous] = await this.db
			.select()
			.from(authSessions)
			.where(eq(authSessions.previousRefreshTokenHash, presentedHash))
			.limit(1);

		if (!previous || previous.revokedAt)
			throw unauthorized("Session expired — please sign in again");

		if (now.getTime() - previous.updatedAt.getTime() <= REFRESH_REUSE_GRACE_MS) {
			const user = await this.activeUser(previous.userId);
			return {
				accessToken: await this.signAccess(user, previous),
				user: toPublicUser(user),
				session: toSessionInfo(previous),
			};
		}

		// A rotated-out token came back: someone else holds a copy. Kill every session.
		await this.revokeAllSessions(previous.userId, "refresh_token_reuse");
		await audit(this.db, "refresh_reuse_detected", {
			...meta,
			userId: previous.userId,
			clientId: previous.clientId,
			metadata: { sessionId: previous.id },
		});
		throw unauthorized("Session expired — please sign in again");
	}

	async logout(sessionId: string | undefined, meta: RequestMeta) {
		if (!sessionId) return;
		const [session] = await this.db
			.update(authSessions)
			.set({ revokedAt: new Date(), revokedReason: "logout" })
			.where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)))
			.returning({ userId: authSessions.userId });
		if (session) await audit(this.db, "logout", { ...meta, userId: session.userId });
	}

	async getSession(
		claims: AccessClaims,
	): Promise<{ user: PublicUser; session: SessionInfo } | null> {
		const [row] = await this.db
			.select({ user: users, session: authSessions })
			.from(authSessions)
			.innerJoin(users, eq(users.id, authSessions.userId))
			.where(
				and(
					eq(authSessions.id, claims.sid),
					eq(users.id, claims.sub),
					isNull(authSessions.revokedAt),
					gt(authSessions.expiresAt, new Date()),
					eq(users.status, "active"),
				),
			)
			.limit(1);
		return row ? { user: toPublicUser(row.user), session: toSessionInfo(row.session) } : null;
	}

	async listSessions(userId: string, currentSessionId: string) {
		const rows = await this.db
			.select()
			.from(authSessions)
			.where(
				and(
					eq(authSessions.userId, userId),
					isNull(authSessions.revokedAt),
					gt(authSessions.expiresAt, new Date()),
				),
			)
			.orderBy(desc(authSessions.lastUsedAt));
		return rows.map((s) => ({
			...toSessionInfo(s),
			userAgent: s.userAgent,
			ip: s.ip,
			lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
			current: s.id === currentSessionId,
		}));
	}

	async revokeSession(userId: string, sessionId: string, meta: RequestMeta) {
		const [session] = await this.db
			.update(authSessions)
			.set({ revokedAt: new Date(), revokedReason: "user_revoked" })
			.where(
				and(
					eq(authSessions.id, sessionId),
					eq(authSessions.userId, userId),
					isNull(authSessions.revokedAt),
				),
			)
			.returning({ id: authSessions.id });
		if (!session) throw notFound("Session");
		await audit(this.db, "session_revoked", { ...meta, userId, metadata: { sessionId } });
	}

	// ── email verification & password recovery ────────────────────────────────

	/** Always "succeeds" so the response never reveals whether an email is registered. */
	async requestEmailToken(
		type: "verification" | "recovery",
		email: string,
	): Promise<{ token?: string }> {
		const [user] = await this.db
			.select()
			.from(users)
			.where(and(eq(users.emailNormalized, normalizeEmail(email)), eq(users.status, "active")))
			.limit(1);
		if (!user) return {};
		if (type === "verification" && user.emailVerifiedAt) return {};
		const token = await this.sendEmailToken(user, type);
		// Exposed to the e2e suite only, so it can finish the flow without an inbox.
		return authEnv.NODE_ENV === "test" ? { token } : {};
	}

	async confirmVerification(token: string, meta: RequestMeta) {
		const record = await this.consumeEmailToken("verification", token);
		await this.db
			.update(users)
			.set({ emailVerifiedAt: new Date() })
			.where(eq(users.id, record.userId));
		await audit(this.db, "email_verified", { ...meta, userId: record.userId });
	}

	async confirmRecovery(token: string, password: string, meta: RequestMeta) {
		if (!isPasswordStrong(password)) throw badRequest(`Password needs ${PASSWORD_RULES}`);
		const record = await this.consumeEmailToken("recovery", token);
		await this.db
			.update(users)
			.set({
				passwordHash: await hashPassword(password),
				tokenVersion: sql`${users.tokenVersion} + 1`,
				// Receiving the reset email proves control of the address.
				emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
			})
			.where(eq(users.id, record.userId));
		await this.revokeAllSessions(record.userId, "password_reset");
		await audit(this.db, "password_reset", { ...meta, userId: record.userId });
	}

	// ── account settings ───────────────────────────────────────────────────────

	async updateProfile(userId: string, input: { name?: string; avatarUrl?: string | null }) {
		const [user] = await this.db.update(users).set(input).where(eq(users.id, userId)).returning();
		if (!user) throw notFound("User");
		return toPublicUser(user);
	}

	/** Changes the password and signs out every OTHER session; the current one stays. */
	async changePassword(
		userId: string,
		currentSessionId: string,
		input: { currentPassword: string; newPassword: string },
		meta: RequestMeta,
	): Promise<IssuedSession> {
		const user = await this.activeUser(userId);
		if (!user.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
			throw new AppError(400, "wrong_password", "Current password is incorrect");
		}
		if (!isPasswordStrong(input.newPassword)) throw badRequest(`Password needs ${PASSWORD_RULES}`);

		const [updated] = (await this.db
			.update(users)
			.set({
				passwordHash: await hashPassword(input.newPassword),
				tokenVersion: sql`${users.tokenVersion} + 1`,
			})
			.where(eq(users.id, userId))
			.returning()) as [UserRow];
		await this.db
			.update(authSessions)
			.set({ revokedAt: new Date(), revokedReason: "password_changed" })
			.where(
				and(
					eq(authSessions.userId, userId),
					ne(authSessions.id, currentSessionId),
					isNull(authSessions.revokedAt),
				),
			);
		await audit(this.db, "password_changed", { ...meta, userId });

		// token_version changed, so the current access token is now stale: re-issue it.
		const [session] = (await this.db
			.select()
			.from(authSessions)
			.where(eq(authSessions.id, currentSessionId))
			.limit(1)) as [SessionRow];
		return {
			accessToken: await this.signAccess(updated, session),
			user: toPublicUser(updated),
			session: toSessionInfo(session),
		};
	}

	// ── internals ──────────────────────────────────────────────────────────────

	async activeUser(userId: string): Promise<UserRow> {
		const [user] = await this.db
			.select()
			.from(users)
			.where(and(eq(users.id, userId), eq(users.status, "active")))
			.limit(1);
		if (!user) throw unauthorized("Account is not active");
		return user;
	}

	private async revokeAllSessions(userId: string, reason: string) {
		await this.db
			.update(authSessions)
			.set({ revokedAt: new Date(), revokedReason: reason })
			.where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
	}

	private signAccess(user: UserRow, session: SessionRow) {
		return signAccessJwt(this.jwt, {
			sub: user.id,
			sid: session.id,
			cid: session.clientId,
			email: user.email,
			email_verified: Boolean(user.emailVerifiedAt),
			token_version: user.tokenVersion,
			principal: "user",
		});
	}

	private async sendEmailToken(user: UserRow, type: "verification" | "recovery"): Promise<string> {
		const token = randomToken(32);
		await this.db.insert(authEmailTokens).values({
			userId: user.id,
			type,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS[type]),
		});
		const base = this.webUrl.replace(/\/+$/, "");
		const message =
			type === "verification"
				? emails.verify(`${base}/verify-email?token=${encodeURIComponent(token)}`)
				: emails.resetPassword(`${base}/reset-password?token=${encodeURIComponent(token)}`);
		await this.mailer.send({ to: user.email, ...message });
		return token;
	}

	/** Single-use: the UPDATE ... WHERE used_at IS NULL makes a double-submit lose cleanly. */
	private async consumeEmailToken(type: "verification" | "recovery", token: string) {
		const [record] = await this.db
			.update(authEmailTokens)
			.set({ usedAt: new Date() })
			.where(
				and(
					eq(authEmailTokens.tokenHash, hashToken(token)),
					eq(authEmailTokens.type, type),
					isNull(authEmailTokens.usedAt),
					gt(authEmailTokens.expiresAt, new Date()),
				),
			)
			.returning();
		if (!record) throw new AppError(400, "invalid_token", "This link is invalid or has expired");
		return record;
	}
}
