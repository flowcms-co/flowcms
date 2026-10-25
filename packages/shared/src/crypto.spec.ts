import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "./crypto";

// The pre-2.1.1 format, built exactly as the old sync code did.
function legacyHash(pw: string) {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
}

describe("password hashing", () => {
    it("writes N=2^17 params into the hash and verifies it", async () => {
        const h = await hashPassword("correct horse battery");
        expect(h).toMatch(/^scrypt\$N=131072,r=8,p=1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
        expect(await verifyPassword("correct horse battery", h)).toBe(true);
        expect(await verifyPassword("wrong", h)).toBe(false);
        expect(passwordNeedsRehash(h)).toBe(false);
    });

    it("still accepts old-format hashes and flags them for rehash", async () => {
        const old = legacyHash("old-password-123");
        expect(await verifyPassword("old-password-123", old)).toBe(true);
        expect(await verifyPassword("nope", old)).toBe(false);
        expect(passwordNeedsRehash(old)).toBe(true);
    });

    it("rejects malformed or absurd params", async () => {
        expect(await verifyPassword("x", "bcrypt$abc$def")).toBe(false);
        expect(await verifyPassword("x", "scrypt$N=1073741824,r=8,p=1$00$00")).toBe(false);
    });
});
