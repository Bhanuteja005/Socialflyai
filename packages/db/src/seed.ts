import { hashPassword, normalizeEmail } from "@socialfly/core/security";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { memberships, organizations, users } from "./schema";

/**
 * Local demo data: one verified user who owns one organization and is a platform
 * admin (so the admin console works out of the box locally). Idempotent —
 * running it twice changes nothing. Refuses to run against a non-local database.
 */
const url = process.env.DATABASE_URL ?? "postgres://socialfly:socialfly@localhost:5434/socialfly";
if (!/localhost|127\.0\.0\.1|@postgres:/.test(url)) {
	console.error(`seed: refusing to seed a non-local database (${url})`);
	process.exit(1);
}

const EMAIL = "demo@socialfly.local";
const PASSWORD = "Demo-Password-123!";
const { db, close } = createDb(url, { max: 1, applicationName: "seed" });

try {
	let [user] = await db
		.select()
		.from(users)
		.where(eq(users.emailNormalized, normalizeEmail(EMAIL)));
	if (!user) {
		[user] = await db
			.insert(users)
			.values({
				email: EMAIL,
				emailNormalized: normalizeEmail(EMAIL),
				name: "Demo User",
				passwordHash: await hashPassword(PASSWORD),
				emailVerifiedAt: new Date(),
			})
			.returning();
	}
	if (!user) throw new Error("could not create demo user");
	if (user.platformRole !== "admin") {
		await db.update(users).set({ platformRole: "admin" }).where(eq(users.id, user.id));
	}

	const [existing] = await db.select().from(organizations).where(eq(organizations.slug, "demo"));
	if (!existing) {
		const [org] = await db
			.insert(organizations)
			.values({ name: "Demo Workspace", slug: "demo", timezone: "UTC", createdBy: user.id })
			.returning();
		if (org)
			await db
				.insert(memberships)
				.values({ organizationId: org.id, userId: user.id, role: "owner" });
	}

	console.warn(
		`seed: done — sign in at http://localhost:4700/login with ${EMAIL} / ${PASSWORD} (also a platform admin: http://localhost:4702)`,
	);
} finally {
	await close();
}
