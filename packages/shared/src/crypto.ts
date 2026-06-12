import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    scryptSync,
    timingSafeEqual,
} from "node:crypto";

/* ──────────────────────────── Passwords ──────────────────────────── */

/**
 * Hash a password with scrypt. Format: `scrypt$<saltHex>$<hashHex>`.
 * No external dependency — uses Node's built-in crypto.
 */
export function hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
    const [scheme, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ─────────────────────── Secrets vault (AES-256-GCM) ─────────────────────── */

const KEY_ENV = "SECRETS_ENCRYPTION_KEY";

function vaultKey(): Buffer {
    const secret = process.env[KEY_ENV];
    if (!secret) {
        throw new Error(
            `${KEY_ENV} is not set. Generate one with: openssl rand -base64 32`,
        );
    }
    // Derive a stable 32-byte key from whatever length the env value is.
    return scryptSync(secret, "flowcms.vault.v1", 32);
}

/**
 * Encrypt a secret (API key, SMTP password, OAuth creds JSON) for storage.
 * Output: `v1$<ivHex>$<authTagHex>$<cipherHex>`. Never store plaintext secrets.
 */
export function encryptSecret(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1$${iv.toString("hex")}$${tag.toString("hex")}$${enc.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
    const [version, ivHex, tagHex, dataHex] = payload.split("$");
    if (version !== "v1" || !ivHex || !tagHex || !dataHex) {
        throw new Error("Malformed encrypted secret");
    }
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
        decipher.update(Buffer.from(dataHex, "hex")),
        decipher.final(),
    ]).toString("utf8");
}

/* ─────────────────────────── API / session tokens ─────────────────────────── */

/** Generate a random opaque token. Returns the raw token (show once) + its hash. */
export function generateToken(prefix = "flw"): { token: string; hash: string; prefix: string } {
    const raw = randomBytes(32).toString("base64url");
    const token = `${prefix}_${raw}`;
    return { token, hash: hashToken(token), prefix: token.slice(0, prefix.length + 9) };
}

/** SHA-256 hash for storing tokens/sessions (never store raw tokens). */
export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
