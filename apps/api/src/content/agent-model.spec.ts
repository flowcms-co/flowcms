import { describe, expect, it } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AgentModelController } from "./agent-model.controller";
import { ContentTypesService } from "./content-types.service";
import { destructiveChanges, routingChanges } from "./model-diff";

/** The real ContentTypesService over a one-row in-memory "database". */
function setup(scopes: string[]) {
    const row = {
        id: "c1",
        workspaceId: "w1",
        name: "FAQ section",
        apiId: "faqSection",
        pluralApiId: "faqSections",
        kind: "COMPONENT",
        draftAndPublish: true,
        schema: { icon: "help", fields: [{ id: "f1", name: "heading", type: "Text" }] } as Record<string, unknown>,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { entries: 0 },
    };
    const prisma = {
        contentType: {
            findFirst: async () => row,
            findMany: async () => [row],
            createMany: async () => ({ count: 0 }),
            update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(row, data),
            findUniqueOrThrow: async () => row,
        },
    };
    const audits: { action: string; metadata?: Record<string, unknown> }[] = [];
    const ctl = new AgentModelController(new ContentTypesService(prisma as never), { record: (e: (typeof audits)[number]) => audits.push(e) } as never);
    const req = { apiToken: { id: "t1", name: "bot", workspaceId: "w1", scopes } } as never;
    return { ctl, req, row, audits };
}

describe("agent model API", () => {
    it("refuses a write from a token without model.update, even with full content access", async () => {
        const { ctl, req } = setup(["*", "model.read"]);
        await expect(ctl.addField(req, "components", "faqSection", { field: { name: "images", type: "Media" } })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("adds a repeatable image field and reads it back", async () => {
        const { ctl, req, audits } = setup(["model.read", "model.update"]);
        await ctl.addField(req, "components", "faqSection", { field: { name: "Images", type: "Component", repeatable: true, fields: [{ name: "image", type: "Media" }, { name: "alt", type: "Text" }] } });
        const got = await ctl.get(req, "components", "faqSection");
        expect(got.fields).toEqual([
            { id: "f1", name: "heading", type: "Text" },
            expect.objectContaining({ name: "images", type: "Component", repeatable: true, id: expect.stringMatching(/^nf-/), fields: [expect.objectContaining({ name: "image", type: "Media" }), expect.objectContaining({ name: "alt" })] }),
        ]);
        expect(audits[0]).toMatchObject({ action: "model.update", metadata: { via: "agent", op: "field.add", field: "images" } });
        await expect(ctl.addField(req, "components", "faqSection", { field: { name: "images", type: "Text" } })).rejects.toThrow(/already exists/);
    });

    it("needs model.delete and confirm=true to remove a field, and dry-runs without saving", async () => {
        const { ctl, req, row } = setup(["model.update"]);
        await expect(ctl.removeField(req, "components", "faqSection", "heading")).rejects.toBeInstanceOf(ForbiddenException);

        const del = setup(["model.update", "model.delete"]);
        await expect(del.ctl.removeField(del.req, "components", "faqSection", "heading")).rejects.toBeInstanceOf(ConflictException);
        const dry = await del.ctl.removeField(del.req, "components", "faqSection", "heading", "true");
        expect(dry).toMatchObject({ dryRun: true, destructive: [{ field: "heading", change: "removed" }] });
        expect((del.row.schema.fields as unknown[]).length).toBe(1);
        await del.ctl.removeField(del.req, "components", "faqSection", "heading", undefined, "true");
        expect(del.row.schema.fields).toEqual([]);
        expect((row.schema.fields as unknown[]).length).toBe(1);
    });
});

describe("model diff", () => {
    it("treats a rename as safe and removal, retyping and many-to-one as destructive", () => {
        const old = [
            { id: "a", name: "title", type: "Text" },
            { id: "b", name: "gallery", type: "Media", multiple: true },
            { id: "c", name: "count", type: "Number" },
            { id: "d", name: "gone", type: "Text" },
        ];
        const next = [
            { id: "a", name: "heading", type: "Text" },
            { id: "b", name: "gallery", type: "Media", multiple: false },
            { id: "c", name: "count", type: "Text" },
        ];
        expect(destructiveChanges(old, next)).toEqual([
            { field: "gallery", change: "single" },
            { field: "count", change: "type" },
            { field: "gone", change: "removed" },
        ]);
        expect(routingChanges({ pageType: "blog", icon: "x" }, { pageType: "blog", icon: "y" })).toEqual([]);
        expect(routingChanges({ pageType: "blog" }, { pageType: "service", slugPattern: "{city.slug}" })).toEqual(["pageType", "slugPattern"]);
    });
});
