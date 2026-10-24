import { createHmac, timingSafeEqual } from "node:crypto";
import { hashToken } from "@flowcms/shared";

/** Password-reset tokens, shared by AuthService (the forgot-password email) and
 *  the server recovery command (src/recover.ts), so both mint the same format. */

export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export type ResetPayload = { uid: string; exp: number; fp: string };

/** Prefers JWT_SECRET (so a vault-key leak can't forge reset links, F-05);
 *  falls back to the vault key only if JWT_SECRET is unset (dev). */
const resetSecret = () => process.env.JWT_SECRET || process.env.SECRETS_ENCRYPTION_KEY || "flowcms.dev.reset";

/** Binds a token to the current password: once it changes, the link stops working. */
export const resetFingerprint = (passwordHash: string | null | undefined) => (passwordHash ? hashToken(passwordHash).slice(0, 16) : "none");

/** base64url(json).base64url(HMAC-SHA256): tamper-evident, not forgeable without the secret. */
export function signResetToken(payload: ResetPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", resetSecret()).update(body).digest("base64url");
    return `${body}.${sig}`;
}

export function verifyResetToken(token: string): Partial<ResetPayload> | null {
    const dot = token.indexOf(".");
    if (dot < 0) return null;
    const body = token.slice(0, dot);
    const a = Buffer.from(token.slice(dot + 1));
    const b = Buffer.from(createHmac("sha256", resetSecret()).update(body).digest("base64url"));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
        return null;
    }
}

/** A one-hour reset link for this user. */
export function resetLink(user: { id: string; passwordHash: string | null }, studioUrl = process.env.STUDIO_URL ?? "http://localhost:3000"): string {
    const token = signResetToken({ uid: user.id, exp: Date.now() + RESET_TTL_MS, fp: resetFingerprint(user.passwordHash) });
    return `${studioUrl.replace(/\/+$/, "")}/reset-password?token=${token}`;
}
