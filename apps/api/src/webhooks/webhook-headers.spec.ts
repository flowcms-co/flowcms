import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Intercept the outbound HTTP call and the secret-decrypt so we can inspect the
// exact headers webhooks.service.ts puts on the wire — without any network.
vi.mock("../common/ssrf", () => ({
    safeFetch: vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => "ok" }),
    assertPublicUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@flowcms/shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@flowcms/shared")>();
    return { ...actual, decryptSecret: () => "plain-secret" };
});

import { safeFetch } from "../common/ssrf";
import { WebhooksService } from "./webhooks.service";

/** Pull the headers off the most recent safeFetch(url, init, opts) call. */
function lastCall() {
    const calls = (safeFetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const [url, init] = calls[calls.length - 1] as [string, { headers: Record<string, string>; body: string }];
    return { url, headers: init.headers, body: init.body };
}

describe("webhook outbound headers (FlowCMS branding)", () => {
    let svc: WebhooksService;

    beforeEach(() => {
        vi.clearAllMocks();
        const prisma = { webhookDelivery: { create: vi.fn().mockResolvedValue({}) } } as never;
        const redis = { enabled: false, client: null } as never;
        svc = new WebhooksService(prisma, redis);
    });

    it("sends X-FlowCMS-Event and a correct X-FlowCMS-Signature (not the old X-Flow-* names)", async () => {
        const webhook = { id: "w1", url: "https://example.com/hook", secret: "ENC", events: [] } as never;
        await (svc as unknown as { deliver: (w: unknown, e: string, p: unknown, a: number) => Promise<unknown> }).deliver(
            webhook,
            "content.published",
            { id: "e1", path: "/services/water-damage" },
            1,
        );

        const { url, headers, body } = lastCall();
        expect(url).toBe("https://example.com/hook");

        // New, rebranded header names are present…
        expect(headers["X-FlowCMS-Event"]).toBe("content.published");
        expect(headers["X-FlowCMS-Signature"]).toBe("sha256=" + createHmac("sha256", "plain-secret").update(body).digest("hex"));
        expect(headers["X-FlowCMS-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);

        // …and the old "Flow" header names are gone.
        expect(headers["X-Flow-Event"]).toBeUndefined();
        expect(headers["X-Flow-Signature"]).toBeUndefined();
    });

    it("omits the signature header when the webhook has no secret, but still sends X-FlowCMS-Event", async () => {
        const webhook = { id: "w2", url: "https://example.com/hook", secret: null, events: [] } as never;
        await (svc as unknown as { deliver: (w: unknown, e: string, p: unknown, a: number) => Promise<unknown> }).deliver(
            webhook,
            "content.updated",
            { id: "e2" },
            1,
        );
        const { headers } = lastCall();
        expect(headers["X-FlowCMS-Event"]).toBe("content.updated");
        expect(headers["X-FlowCMS-Signature"]).toBeUndefined();
    });
});
