import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";

/**
 * Flow CMS license tokens — an Ed25519-signed, offline-verifiable entitlement
 * blob. The PRIVATE key (kept by the vendor, never shipped) signs; this PUBLIC
 * key is embedded in the build and verifies. A customer can read a token but
 * can't forge or edit one — any change to the payload breaks the signature.
 *
 * Token format:  base64url(JSON payload) "." base64url(ed25519 signature)
 */
export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAACw3RZ2gPJwW9J41N1ocKqcPnyOciRANttWIhaiXpi8=
-----END PUBLIC KEY-----`;

export type LicensePlan = "community" | "pro" | "enterprise";

export interface LicensePayload {
    plan: LicensePlan;
    /** Entitlement keys this license unlocks, e.g. ["audit_export","sso"]; ["*"] = all. */
    features: string[];
    /** Seat cap; 0 / undefined = unlimited. */
    seats?: number;
    /** Expiry epoch ms; 0 / undefined = perpetual. */
    exp?: number;
    /** Issued-at epoch ms. */
    iat: number;
    /** Human label for the licensee. */
    customer?: string;
    /** Optional binding to a specific install. */
    instanceId?: string;
}

const b64url = (b: Buffer) => b.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

/** Vendor-side: mint a signed token (tooling/tests only — needs the private key). */
export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
    const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
    const sig = edSign(null, Buffer.from(body, "utf8"), createPrivateKey(privateKeyPem));
    return `${body}.${b64url(sig)}`;
}

/**
 * Verify a token's signature and return its payload, or null if missing/forged/
 * malformed. Does NOT check expiry — the caller decides how to treat an expired
 * but validly-signed license (e.g. show "expired", grace period).
 */
export function verifyLicense(token: string, publicKeyPem: string = LICENSE_PUBLIC_KEY): LicensePayload | null {
    try {
        const [body, sig] = token.trim().split(".");
        if (!body || !sig) return null;
        const ok = edVerify(null, Buffer.from(body, "utf8"), createPublicKey(publicKeyPem), fromB64url(sig));
        if (!ok) return null;
        const payload = JSON.parse(fromB64url(body).toString("utf8")) as LicensePayload;
        if (!payload || typeof payload !== "object" || !payload.plan || !Array.isArray(payload.features)) return null;
        return payload;
    } catch {
        return null;
    }
}
