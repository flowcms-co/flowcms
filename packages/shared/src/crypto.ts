import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    scrypt,
    scryptSync,
    timingSafeEqual,
} from "node:crypto";

/* ──────────────────────────── Passwords ──────────────────────────── */

/** Current scrypt cost (OWASP: N=2^17, r=8, p=1, about 128 MiB per hash). */
const SCRYPT = { N: 2 ** 17, r: 8, p: 1 };
/** Params of the original format `scrypt$<salt>$<hash>` (Node's scrypt defaults). */
const LEGACY = { N: 2 ** 14, r: 8, p: 1 };

function scryptAsync(password: string, salt: Buffer, len: number, o: { N: number; r: number; p: number }): Promise<Buffer> {
    // maxmem must exceed 128 * N * r; leave headroom.
    return new Promise((res, rej) => scrypt(password, salt, len, { ...o, maxmem: 256 * o.N * o.r }, (e, k) => (e ? rej(e) : res(k))));
}

function parseHash(stored: string): { o: { N: number; r: number; p: number }; salt: Buffer; hash: Buffer } | null {
    const parts = stored.split("$");
    if (parts[0] !== "scrypt") return null;
    if (parts.length === 3 && parts[1] && parts[2]) return { o: LEGACY, salt: Buffer.from(parts[1], "hex"), hash: Buffer.from(parts[2], "hex") };
    if (parts.length !== 4 || !parts[2] || !parts[3]) return null;
    const m = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[1]);
    if (!m) return null;
    const o = { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]) };
    // Refuse absurd params from a tampered row rather than burn the box on them.
    if (o.N < 2 || o.N > 2 ** 20 || (o.N & (o.N - 1)) !== 0 || o.r < 1 || o.r > 32 || o.p < 1 || o.p > 16) return null;
    return { o, salt: Buffer.from(parts[2], "hex"), hash: Buffer.from(parts[3], "hex") };
}

/**
 * Hash a password with scrypt (async, off the event loop).
 * Format: `scrypt$N=<N>,r=<r>,p=<p>$<saltHex>$<hashHex>`. The older
 * `scrypt$<saltHex>$<hashHex>` (default params) still verifies.
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await scryptAsync(password, salt, 64, SCRYPT);
    return `scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const h = parseHash(stored);
    if (!h || !h.hash.length) return false;
    const actual = await scryptAsync(password, h.salt, h.hash.length, h.o);
    return actual.length === h.hash.length && timingSafeEqual(actual, h.hash);
}

/** True when a stored hash uses weaker params than today's; rehash it on the next good login. */
export function passwordNeedsRehash(stored: string): boolean {
    const h = parseHash(stored);
    return !h || h.o.N !== SCRYPT.N || h.o.r !== SCRYPT.r || h.o.p !== SCRYPT.p;
}

/** A well-formed hash of a random password, for spending the same time on an unknown email. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
    return (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));
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
