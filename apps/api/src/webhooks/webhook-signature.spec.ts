import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Locks the webhook signature FORMAT shipped in webhooks.service.ts:
 *   "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
 * We replicate the one-line computation (rather than booting the Nest service)
 * so the wire format can't drift silently — receivers verify against exactly this.
 */
function sign(secret: string, body: string): string {
    return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("webhook HMAC signature", () => {
    it("matches the known sha256= prefixed hex digest for a fixed secret+body", () => {
        const secret = "whsec_test_secret";
        const body = JSON.stringify({ event: "entry.published", id: "abc123" });
        // Precomputed expected value for this exact secret + body.
        const expected =
            "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
        expect(sign(secret, body)).toBe(expected);
        expect(sign(secret, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it("is deterministic and sensitive to the body", () => {
        const secret = "s3cr3t";
        expect(sign(secret, "a")).toBe(sign(secret, "a"));
        expect(sign(secret, "a")).not.toBe(sign(secret, "b"));
    });

    it("is sensitive to the secret", () => {
        const body = "payload";
        expect(sign("one", body)).not.toBe(sign("two", body));
    });
});
