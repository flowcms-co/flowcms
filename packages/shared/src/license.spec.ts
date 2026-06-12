import { generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { signLicense, verifyLicense, type LicensePayload } from "./license";

function makeKeys() {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return {
        publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
        privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
}

describe("license sign/verify", () => {
    let publicPem: string;
    let privatePem: string;
    const payload: LicensePayload = {
        plan: "pro",
        features: ["audit_export", "sso"],
        seats: 10,
        iat: 1_700_000_000_000,
        customer: "Acme Inc",
    };

    beforeAll(() => {
        ({ publicPem, privatePem } = makeKeys());
    });

    it("round-trips a signed license back to its payload", () => {
        const token = signLicense(payload, privatePem);
        const verified = verifyLicense(token, publicPem);
        expect(verified).not.toBeNull();
        expect(verified).toEqual(payload);
    });

    it("rejects a token whose payload was tampered with", () => {
        const token = signLicense(payload, privatePem);
        const [body, sig] = token.split(".");
        const forged: LicensePayload = { ...payload, plan: "enterprise", features: ["*"] };
        const forgedBody = Buffer.from(JSON.stringify(forged), "utf8").toString("base64url");
        expect(forgedBody).not.toEqual(body); // sanity: we actually changed the payload
        expect(verifyLicense(`${forgedBody}.${sig}`, publicPem)).toBeNull();
    });

    it("rejects a token signed by a different keypair", () => {
        const token = signLicense(payload, privatePem);
        const other = makeKeys();
        expect(verifyLicense(token, other.publicPem)).toBeNull();
    });

    it("returns null for a malformed token (no separator)", () => {
        expect(verifyLicense("not-a-real-token", publicPem)).toBeNull();
        expect(verifyLicense("", publicPem)).toBeNull();
    });

    it("returns null for a malformed public key", () => {
        const token = signLicense(payload, privatePem);
        expect(verifyLicense(token, "-----BEGIN PUBLIC KEY-----\ngarbage\n-----END PUBLIC KEY-----")).toBeNull();
    });
});
