import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@flowcms/shared";
import { TelemetryService } from "./telemetry.service";

process.env.SECRETS_ENCRYPTION_KEY = "test-vault-key-0123456789";

function setup(installKeyEnc: string | null = null) {
    const row = { id: "singleton", instanceId: "inst_1", installKeyEnc };
    const prisma = {
        serverInstance: {
            findUnique: vi.fn(async () => ({ ...row })),
            upsert: vi.fn(async () => row),
            update: vi.fn(async ({ data }: { data: { installKeyEnc: string } }) => Object.assign(row, data)),
        },
        license: { findFirst: vi.fn(async () => null) },
        user: { count: vi.fn(async () => 1), findFirst: vi.fn(async () => null) },
        session: { findMany: vi.fn(async () => []) },
        workspace: { count: vi.fn(async () => 1), findFirst: vi.fn(async () => null) },
        contentEntry: { count: vi.fn(async () => 0) },
        orgProfile: { findUnique: vi.fn(async () => null) },
    };
    const license = { info: vi.fn(async () => ({ plan: "community" })), setKey: vi.fn(), clear: vi.fn() };
    return { svc: new TelemetryService(prisma as never, license as never), row };
}

function mockVendor(responses: Record<string, unknown>[]) {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true, ...(responses.shift() ?? {}) }), { status: 200 });
    }));
    return bodies;
}

afterEach(() => vi.unstubAllGlobals());

describe("heartbeat install key", () => {
    it("stores the key encrypted and sends it on later beats", async () => {
        const { svc, row } = setup();
        const bodies = mockVendor([{ installKey: "ik_live_abc" }, {}, {}]);
        await svc.beat();
        expect(bodies[0].installKey).toBeUndefined();
        expect(row.installKeyEnc).not.toContain("ik_live_abc");
        expect(decryptSecret(row.installKeyEnc!)).toBe("ik_live_abc");
        await svc.beat();
        await svc.beat();
        expect(bodies[1].installKey).toBe("ik_live_abc");
        expect(bodies[2].installKey).toBe("ik_live_abc");
        expect(decryptSecret(row.installKeyEnc!)).toBe("ik_live_abc"); // no key in reply: kept
    });

    it("omits the key, without failing, when it can't be decrypted", async () => {
        const { svc } = setup("v1$garbage$x$y");
        const bodies = mockVendor([{}]);
        expect((await svc.beat()).ok).toBe(true);
        expect(bodies[0].installKey).toBeUndefined();
    });
});
