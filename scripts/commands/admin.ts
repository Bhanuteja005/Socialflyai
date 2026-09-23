import { newId } from "@socialfly/core/ids";
import { normalizeEmail } from "@socialfly/core/security";
import { SQL } from "bun";
import { loadRootEnv } from "../lib/paths";
import { color, fail, mark, section } from "../lib/ui";

const USAGE = "Use: admin grant <email> | admin revoke <email> | admin list";

/**
 * Platform-admin access (the internal admin console) is granted ONLY here, never via the
 * API: an attacker with a stolen admin session must not be able to mint more admins.
 * Runs against DATABASE_URL (the root .env locally; the real one when run in production).
 * Uses Bun's built-in Postgres client so the CLI needs no database dependency.
 */
async function connect() {
	const url =
		process.env.DATABASE_URL ??
		(await loadRootEnv()).DATABASE_URL ??
		"postgres://socialfly:socialfly@localhost:5434/socialfly";
	console.log(color.dim(`database: ${url.replace(/\/\/[^@]*@/, "//***@")}\n`));
	return new SQL(url);
}

async function setRole(sql: SQL, email: string, role: "admin" | "user") {
	const action = role === "admin" ? "platform_role.grant" : "platform_role.revoke";
	// One transaction: the role change and its audit row commit together.
	const updated = await sql.begin(async (tx) => {
		const rows = await tx<{ id: string; email: string; before: string }[]>`
			update users u set platform_role = ${role}, updated_at = now()
			from (select id, platform_role from users where email_normalized = ${normalizeEmail(email)} for update) prev
			where u.id = prev.id
			returning u.id, u.email, prev.platform_role as before`;
		const row = rows[0];
		if (!row) return null;
		if (row.before !== role) {
			// actor_user_id is null: the actor is whoever had shell + database access.
			await tx`
				insert into admin_audit_events (id, actor_user_id, action, target_type, target_id, data)
				values (${newId()}, null, ${action}, 'user', ${row.id}, ${JSON.stringify({ before: row.before, after: role, via: "cli" })}::text::jsonb)`;
		}
		return row;
	});
	if (!updated) fail(`No user with email ${email} — they must sign up first`);
	const verb = role === "admin" ? "is now a platform admin" : "is no longer a platform admin";
	const note = updated.before === role ? color.dim(" (unchanged)") : "";
	console.log(`${mark.ok} ${color.green(updated.email)} ${verb}${note}`);
}

async function list(sql: SQL) {
	const rows = await sql<
		{ email: string; name: string | null; status: string; last_login_at: Date | null }[]
	>`select email, name, status, last_login_at from users where platform_role = 'admin' order by email`;
	if (!rows.length) {
		console.log(
			`${mark.warn} no platform admins — grant one with ${color.cyan("admin grant <email>")}`,
		);
		return;
	}
	for (const r of rows) {
		const seen = r.last_login_at ? new Date(r.last_login_at).toISOString() : "never";
		const status = r.status === "active" ? "" : color.red(` [${r.status}]`);
		console.log(
			`  ${color.cyan(r.email)}${status} ${color.dim(`${r.name ?? ""} · last login ${seen}`)}`,
		);
	}
}

export async function admin(sub: string | undefined, args: string[]) {
	const email = args.find((a) => !a.startsWith("--"));
	if ((sub === "grant" || sub === "revoke") && !email) fail(`Name the user's email. ${USAGE}`);
	if (sub !== "grant" && sub !== "revoke" && sub !== "list")
		fail(`Unknown admin command. ${USAGE}`);

	const sql = await connect();
	try {
		if (sub === "list") {
			section("Platform admins");
			await list(sql);
		} else {
			await setRole(sql, email as string, sub === "grant" ? "admin" : "user");
			if (sub === "revoke")
				console.log(
					color.dim("Takes effect on their next request — the role is checked every time."),
				);
		}
	} finally {
		await sql.close();
	}
}
