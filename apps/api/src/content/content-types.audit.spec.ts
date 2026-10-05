import { describe, expect, it, vi } from "vitest";
import { ContentTypesService } from "./content-types.service";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("ContentTypesService: a type switched to 'not pages'", () => {
    const existing = { id: "t1", workspaceId: "w", name: "City", apiId: "city", pluralApiId: "cities", kind: "COLLECTION", draftAndPublish: true, schema: { pageType: "service", fields: [] }, _count: { entries: 150 } };

    function service() {
        const executeRaw = vi.fn(async () => 150);
        const del = vi.fn(async () => undefined);
        const prisma = {
            contentType: { findFirst: async () => existing, update: async ({ data }: any) => ({ ...existing, ...data }) },
            $executeRaw: executeRaw,
            $transaction: async (ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma)),
        };
        return { svc: new ContentTypesService(prisma as any, { del } as any), executeRaw, del };
    }

    it("removes its audit rows straight away", async () => {
        const { svc, executeRaw, del } = service();
        await svc.update("w", "t1", { schema: { pageType: "service", isPage: false, fields: [] } } as any);
        expect(executeRaw).toHaveBeenCalledTimes(1);
        expect(String((executeRaw.mock.calls[0] as any[])[0].join("?"))).toContain('DELETE FROM "PageAudit"');
        expect(del).toHaveBeenCalledWith("seo:issues:w");
    });

    it("leaves them alone when the type stays a page type", async () => {
        const { svc, executeRaw } = service();
        await svc.update("w", "t1", { schema: { pageType: "service", fields: [] } } as any);
        expect(executeRaw).not.toHaveBeenCalled();
    });
});
