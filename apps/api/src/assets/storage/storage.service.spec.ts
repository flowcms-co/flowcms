import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake S3 store: one in-memory map per access key; the key "bad" is refused.
const buckets = new Map<string, Map<string, Buffer>>();
vi.mock("./s3.driver", () => ({
    S3StorageDriver: class {
        opts: { accessKeyId: string; publicUrl?: string };
        constructor(opts: { accessKeyId: string; publicUrl?: string }) {
            this.opts = opts;
        }
        private b() {
            if (this.opts.accessKeyId === "bad") throw Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
            if (!buckets.has(this.opts.accessKeyId)) buckets.set(this.opts.accessKeyId, new Map());
            return buckets.get(this.opts.accessKeyId)!;
        }
        async put(k: string, body: Buffer) {
            this.b().set(k, body);
        }
        async read(k: string) {
            return this.b().get(k)!;
        }
        async delete(...ks: string[]) {
            ks.forEach((k) => this.b().delete(k));
        }
        publicUrl(k: string) {
            return `${this.opts.publicUrl}/${k}`;
        }
    },
}));

import { StorageService } from "./storage.service";

process.env.SECRETS_ENCRYPTION_KEY = "test-vault-key-0123456789";
const owner = { id: "u1", workspaceId: "w1", role: { key: "super_admin" } } as never;
const admin = { id: "u2", workspaceId: "w1", role: { key: "admin" } } as never;

function setup() {
    let row: Record<string, unknown> | null = null;
    const prisma = {
        integration: {
            findFirst: async () => row,
            create: async ({ data }: { data: Record<string, unknown> }) => (row = { id: "i1", ...data, updatedAt: new Date() }),
            update: async ({ data }: { data: Record<string, unknown> }) => (row = { ...row, ...data, updatedAt: new Date(Date.now() + 1000) }),
            delete: async () => (row = null),
        },
    };
    const svc = new StorageService(prisma as never, { record: () => {} } as never);
    return { svc, row: () => row };
}

describe("StorageService", () => {
    beforeEach(() => {
        buckets.clear();
        delete process.env.STORAGE_DRIVER;
        process.env.MEDIA_DIR = "/tmp/flowcms-storage-spec";
    });

    it("saves checked keys encrypted and switches to them without a restart", async () => {
        const { svc, row } = setup();
        await svc.onModuleInit();
        expect((await svc.status()).source).toBe("local");

        const s = await svc.save(owner, { bucket: "media", publicUrl: "https://media.example.com/", accessKeyId: "AKIA1234abcd", secretAccessKey: "very-secret" });
        expect(s.source).toBe("studio");
        expect(s.saved).toMatchObject({ bucket: "media", publicUrl: "https://media.example.com", accessKeyHint: "…abcd" });
        expect(JSON.stringify(s)).not.toContain("very-secret");
        expect(String(row()!.encryptedSecret)).not.toContain("very-secret");
        expect(buckets.get("AKIA1234abcd")!.size).toBe(0); // the check object was cleaned up

        await svc.put("a.png", Buffer.from("x"), "image/png");
        expect(buckets.get("AKIA1234abcd")!.has("a.png")).toBe(true);
        expect(svc.publicUrl("a.png")).toBe("https://media.example.com/a.png");
        svc.onModuleDestroy();
    });

    it("refuses keys that fail the check, and anyone but a Super Admin", async () => {
        const { svc, row } = setup();
        await expect(svc.save(owner, { bucket: "media", accessKeyId: "bad", secretAccessKey: "x" })).rejects.toThrow(/AccessDenied.*Nothing was saved/);
        await expect(svc.save(admin, { bucket: "media", accessKeyId: "AKIAgood", secretAccessKey: "x" })).rejects.toThrow(/Super Admin/);
        expect(row()).toBeNull();
    });

    it("keeps the stored keys when re-saved blank, and falls back on remove", async () => {
        const { svc } = setup();
        await svc.save(owner, { bucket: "media", publicUrl: "https://m.example.com", accessKeyId: "AKIAkeep", secretAccessKey: "s" });
        await svc.save(owner, { bucket: "media", publicUrl: "https://cdn.example.com" });
        expect((await svc.status()).saved).toMatchObject({ accessKeyHint: "…keep", publicUrl: "https://cdn.example.com" });
        expect((await svc.disconnect(owner)).source).toBe("local");
    });

    it("boots with STORAGE_DRIVER=s3 after the key env vars are deleted, then uses the saved keys", async () => {
        process.env.STORAGE_DRIVER = "s3";
        process.env.S3_BUCKET = "media";
        try {
            const { svc } = setup();
            expect((await svc.status()).source).toBe("local");
            await svc.save(owner, { bucket: "media", accessKeyId: "AKIAboot", secretAccessKey: "s" });
            expect((await svc.status()).source).toBe("studio");
        } finally {
            delete process.env.S3_BUCKET;
        }
    });
});
