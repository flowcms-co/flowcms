import { describe, expect, it, vi } from "vitest";
import { AssetsService, mediaHeaders } from "./assets.service";

// The stored key's extension decides how /media serves the file, so it must come
// from the validated mimetype, never from the name the client sent.
function setup() {
    const keys: string[] = [];
    const prisma = {
        workspace: { findUnique: vi.fn(async () => ({ mediaMaxMb: 25, mediaAllowedTypes: ["txt", "png"] })) },
        media: {
            findFirst: vi.fn(async () => ({ id: "m1", workspaceId: "w1", filename: "old.txt", url: "/media/old.txt", mimeType: "text/plain" })),
            findMany: vi.fn(async () => []),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data })),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data })),
        },
        $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
        $executeRaw: vi.fn(async () => 0),
        $queryRaw: vi.fn(async () => []),
        contentEntry: { findMany: vi.fn(async () => []) },
    };
    const storage = { put: vi.fn(async (k: string) => void keys.push(k)), publicUrl: (k: string) => `/media/${k}`, delete: vi.fn() };
    const svc = new AssetsService(prisma as never, {} as never, storage as never);
    return { svc, keys };
}

const txt = (name: string) => ({ originalname: name, mimetype: "text/plain", size: 5, buffer: Buffer.from("hello") });

describe("stored media extension", () => {
    it.each(["a.js", "b.html", "c"])("text/plain named %s is stored as .txt", async (name) => {
        const { svc, keys } = setup();
        await svc.upload("w1", "u1", txt(name)).catch(() => {});
        expect(keys[0]).toMatch(/^[0-9a-f-]{36}\.txt$/);
    });

    it("replace also keys by mimetype", async () => {
        const { svc, keys } = setup();
        await svc.replace("w1", "m1", txt("evil.html")).catch(() => {});
        expect(keys[0]).toMatch(/\.txt$/);
    });
});

describe("mediaHeaders", () => {
    it("keeps images inline with nosniff", () => {
        expect(mediaHeaders("/m/x.png")).toEqual({ "X-Content-Type-Options": "nosniff" });
        expect(mediaHeaders("/m/x_thumb.webp")).toEqual({ "X-Content-Type-Options": "nosniff" });
        expect(mediaHeaders("/m/x.pdf")["Content-Disposition"]).toBeUndefined();
    });
    it.each(["x.txt", "x.html", "x.js", "x.svg", "x"])("forces %s to download, sandboxed", (p) => {
        const h = mediaHeaders(p);
        expect(h["X-Content-Type-Options"]).toBe("nosniff");
        expect(h["Content-Disposition"]).toBe("attachment");
        expect(h["Content-Security-Policy"]).toBe("sandbox");
    });
});
