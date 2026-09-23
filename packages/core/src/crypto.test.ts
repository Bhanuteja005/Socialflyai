import { describe, expect, test } from "bun:test";
import { generateKey, TokenCipher } from "./crypto";

describe("TokenCipher", () => {
	const key = generateKey();

	test("round-trips a value", () => {
		const cipher = new TokenCipher(key);
		const sealed = cipher.encrypt("EAAB-access-token");
		expect(sealed).not.toContain("EAAB");
		expect(cipher.decrypt(sealed)).toBe("EAAB-access-token");
	});

	test("uses a fresh IV so equal plaintexts do not produce equal ciphertexts", () => {
		const cipher = new TokenCipher(key);
		expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
	});

	test("decrypts values sealed with a previous key during rotation", () => {
		const oldKey = generateKey();
		const sealedWithOld = new TokenCipher(oldKey).encrypt("secret");
		const rotated = new TokenCipher(generateKey(), [oldKey]);
		expect(rotated.decrypt(sealedWithOld)).toBe("secret");
		expect(rotated.needsRotation(sealedWithOld)).toBe(true);
		expect(rotated.needsRotation(rotated.encrypt("secret"))).toBe(false);
	});

	test("rejects tampered ciphertext", () => {
		const cipher = new TokenCipher(key);
		const parts = cipher.encrypt("secret").split(".");
		parts[4] = Buffer.from("tampered").toString("base64url");
		expect(() => cipher.decrypt(parts.join("."))).toThrow();
	});

	test("fails loudly when the sealing key is unknown", () => {
		const sealed = new TokenCipher(generateKey()).encrypt("secret");
		expect(() => new TokenCipher(key).decrypt(sealed)).toThrow(/No decryption key/);
	});
});
