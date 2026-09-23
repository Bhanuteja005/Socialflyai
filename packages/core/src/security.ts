import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ── Passwords ────────────────────────────────────────────────────────────────
// argon2id with OWASP's minimum profile (19 MiB, t=2). Bun implements it natively.

export const PASSWORD_RULES =
	"at least 10 characters, with an uppercase letter, a lowercase letter, a number and a symbol";

export const isPasswordStrong = (password: string): boolean =>
	password.length >= 10 &&
	password.length <= 256 &&
	/[A-Z]/.test(password) &&
	/[a-z]/.test(password) &&
	/[0-9]/.test(password) &&
	/[^A-Za-z0-9]/.test(password);

export const hashPassword = (password: string): Promise<string> =>
	Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 });

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
	Bun.password.verify(password, hash);

// ── Opaque tokens ────────────────────────────────────────────────────────────
// Refresh tokens, email tokens, API keys: random, shown to the client once, and
// stored only as a SHA-256 hash, so a database leak does not leak live tokens.

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const hashToken = (token: string): string =>
	createHash("sha256").update(token).digest("hex");

/** Constant-time comparison for secrets (avoids leaking a prefix match via timing). */
export const safeEqual = (a: string, b: string): boolean => {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// ── CSRF (double-submit) ─────────────────────────────────────────────────────
// The token is readable by first-party JS (non-httpOnly cookie) and echoed back in
// the X-CSRF-Token header. A cross-site form can send the cookie but cannot read it
// to set the header.

export const createCsrfToken = () => randomToken(24);

export const csrfMatches = (header: string | undefined, cookie: string | undefined): boolean =>
	Boolean(header && cookie && safeEqual(hashToken(header), hashToken(cookie)));
