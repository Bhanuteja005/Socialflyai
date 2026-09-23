import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption at rest for third-party credentials (platform OAuth tokens).
 *
 * AES-256-GCM, a fresh 96-bit IV per value, and the key id baked into the output so
 * keys can rotate without a flag day:
 *
 *     v1.<kid>.<iv>.<tag>.<ciphertext>        (each part base64url)
 *
 * `kid` is the first 8 hex chars of SHA-256(key) — it identifies which key sealed
 * a value without revealing anything about the key itself.
 */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

type Key = { id: string; bytes: Buffer };

const toKey = (base64: string): Key => {
	const bytes = Buffer.from(base64, "base64");
	if (bytes.length !== 32) throw new Error("Encryption key must be 32 bytes (base64-encoded)");
	return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 8), bytes };
};

export class TokenCipher {
	private readonly current: Key;
	private readonly byId: Map<string, Key>;

	/**
	 * @param currentKey  base64 key used for all new encryptions
	 * @param previousKeys base64 keys still accepted for decryption during a rotation
	 */
	constructor(currentKey: string, previousKeys: string[] = []) {
		this.current = toKey(currentKey);
		this.byId = new Map([this.current, ...previousKeys.map(toKey)].map((k) => [k.id, k]));
	}

	encrypt(plaintext: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv(ALGORITHM, this.current.bytes, iv);
		const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
		const tag = cipher.getAuthTag();
		return [VERSION, this.current.id, iv, tag, ciphertext]
			.map((p) => (typeof p === "string" ? p : p.toString("base64url")))
			.join(".");
	}

	decrypt(sealed: string): string {
		const [version, kid, iv, tag, ciphertext] = sealed.split(".");
		if (version !== VERSION || !kid || !iv || !tag || ciphertext === undefined) {
			throw new Error("Malformed encrypted value");
		}
		const key = this.byId.get(kid);
		if (!key) throw new Error(`No decryption key for kid=${kid} (was a key removed mid-rotation?)`);
		const decipher = createDecipheriv(ALGORITHM, key.bytes, Buffer.from(iv, "base64url"));
		decipher.setAuthTag(Buffer.from(tag, "base64url"));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertext, "base64url")),
			decipher.final(),
		]).toString("utf8");
	}

	/** True when a value was sealed with an older key and should be re-encrypted. */
	needsRotation(sealed: string): boolean {
		return sealed.split(".")[1] !== this.current.id;
	}
}

/** `bun run cli secrets` uses this to mint TOKEN_ENCRYPTION_KEY values. */
export const generateKey = (): string => randomBytes(32).toString("base64");
