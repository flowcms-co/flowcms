import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaClient } from "@flowcms/db";
import { elementHtml, elementTemplate } from "@flowcms/shared";
import { ContentEntriesService } from "../content/content-entries.service";
import { PublicQueryService } from "../content/public-query.service";
import { FeatureGuard } from "../license/feature.guard";
import { ElementTemplatesController } from "./element-templates.controller";
import { ElementTemplatesService } from "./element-templates.service";

/** Element templates end to end against a live Postgres (RUN_DB_TESTS=1, like the other integration specs). */
const RUN = process.env.RUN_DB_TESTS === "1";
const uniq = () => Math.random().toString(36).slice(2, 10);
const costValues = (title: string) => ({ ...elementTemplate("cost")!.defaults(), title });

describe("element templates licence gate", () => {
    it("every route is behind the elements entitlement", async () => {
        const off = new FeatureGuard(new Reflector(), { has: async (f: string) => f !== "elements" } as never);
        const on = new FeatureGuard(new Reflector(), { has: async () => true } as never);
        const proto = ElementTemplatesController.prototype;
        for (const name of ["list", "get", "create", "update", "duplicate", "remove", "import", "export"] as const) {
            const ctx = { getHandler: () => proto[name], getClass: () => ElementTemplatesController } as never;
            await expect(off.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
            await expect(on.canActivate(ctx)).resolves.toBe(true);
        }
    });
});

describe.skipIf(!RUN)("element templates (integration)", () => {
    const prisma = new PrismaClient();
    const noop = async () => {};
    const events: { event: string; id: string }[] = [];
    const audits: string[] = [];
    const entries = new ContentEntriesService(
        prisma as never,
        { delByPrefix: noop } as never,
        {} as never,
        { dispatch: async (_w: string, event: string, p: { id: string }) => void events.push({ event, id: p.id }) } as never,
        { dispatch: noop } as never,
        {} as never,
        {} as never,
    );
    const svc = new ElementTemplatesService(prisma as never, entries, { log: async (e: { action: string }) => void audits.push(e.action) } as never);
    const pub = new PublicQueryService(prisma as never, { wrap: async (_k: string, _t: number, fn: () => unknown) => fn() } as never);
    let ws = "";
    let other = "";
    let typeId = "";
    let otherTypeId = "";
    const mkType = async (workspaceId: string) =>
        (await prisma.contentType.create({ data: { workspaceId, name: "Page", apiId: `page${uniq()}`, pluralApiId: `pages${uniq()}`, kind: "COLLECTION", schema: { fields: [{ name: "title", type: "Text" }, { name: "body", type: "Rich text" }] } } })).id;
    const page = async (body: string, status: "DRAFT" | "PUBLISHED" = "PUBLISHED", workspaceId = ws, contentTypeId = typeId) =>
        (await prisma.contentEntry.create({ data: { workspaceId, contentTypeId, status, slug: `p-${uniq()}`, data: { title: "T", body } } })).id;
    const delivered = async (id: string) => {
        const ct = await prisma.contentType.findUniqueOrThrow({ where: { id: (await prisma.contentEntry.findUniqueOrThrow({ where: { id } })).contentTypeId } });
        return String((await pub.oneForType(ct, id, {})).data.body);
    };

    beforeAll(async () => {
        const id = uniq();
        ws = (await prisma.workspace.create({ data: { name: `et ${id}`, slug: `et-${id}` } })).id;
        other = (await prisma.workspace.create({ data: { name: `et2 ${id}`, slug: `et2-${id}` } })).id;
        typeId = await mkType(ws);
        otherTypeId = await mkType(other);
    });
    afterAll(async () => {
        await prisma.workspace.deleteMany({ where: { id: { in: [ws, other] } } });
        await prisma.$disconnect();
    });

    it("creates, validates, duplicates, and refuses a name clash with 409", async () => {
        const a = await svc.create(ws, { name: "Pest control", element: "cost", values: costValues("A") }, "u1");
        await expect(svc.create(ws, { name: "Pest control", element: "cost", values: costValues("A") }, "u1")).rejects.toBeInstanceOf(ConflictException);
        await expect(svc.create(ws, { name: "Bad", element: "cost", values: { ...costValues("A"), low: 900 } }, "u1")).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create(ws, { name: "Nope", element: "unknown", values: {} }, "u1")).rejects.toBeInstanceOf(BadRequestException);
        const copy = await svc.duplicate(ws, a.id, "Pest control 2", "u1");
        expect(copy.values).toEqual(a.values);
        await expect(svc.duplicate(ws, a.id, "Pest control 2", "u1")).rejects.toBeInstanceOf(ConflictException);
        await expect(svc.duplicate(ws, a.id, "  ", "u1")).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.update(ws, copy.id, { name: "Pest control" })).rejects.toBeInstanceOf(ConflictException);
        expect((await svc.list(ws)).map((t) => t.name)).toEqual(["Pest control", "Pest control 2"]);
        expect(audits).toEqual(expect.arrayContaining(["element_template.create", "element_template.duplicate"]));
    });

    it("delete is refused while pages use it, naming them; forced delete leaves pages on their snapshot", async () => {
        const t = await svc.create(ws, { name: "Del", element: "cost", values: costValues("Live") }, "u1");
        const p1 = await page(`<p>x</p>${elementHtml("cost", costValues("Snap"), t.id)}`);
        const err = (await svc.remove(ws, t.id, false).catch((e) => e)) as ConflictException;
        expect(err).toBeInstanceOf(ConflictException);
        expect(JSON.stringify(err.getResponse())).toContain(p1);
        expect((await svc.get(ws, t.id)).pages).toBe(1);
        expect(await delivered(p1)).toContain("Live");
        await svc.remove(ws, t.id, true);
        await expect(svc.get(ws, t.id)).rejects.toBeInstanceOf(NotFoundException);
        const html = await delivered(p1);
        expect(html).toContain("Snap");
        expect(html).not.toContain("Live");
        const free = await svc.create(ws, { name: "Free", element: "cost", values: costValues("F") }, "u1");
        await expect(svc.remove(ws, free.id, false)).resolves.toMatchObject({ ok: true });
    });

    it("import is all or nothing and upserts by name", async () => {
        const good = { name: "Imp", element: "cost", values: costValues("I1") };
        const bad = { name: "Imp bad", element: "cost", values: { ...costValues("I"), low: 900 } };
        await expect(svc.import(ws, [good, bad], "u1")).rejects.toBeInstanceOf(BadRequestException);
        expect(await prisma.elementTemplate.count({ where: { workspaceId: ws, name: { startsWith: "Imp" } } })).toBe(0);
        await expect(svc.import(ws, [good, good], "u1")).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.import(ws, [], "u1")).rejects.toBeInstanceOf(BadRequestException);
        expect(await svc.import(ws, [good], "u1")).toEqual({ created: 1, updated: 0 });
        expect(await svc.import(ws, [{ ...good, values: costValues("I2") }, { name: "Imp 2", element: "steps", values: elementTemplate("steps")!.defaults() }], "u1")).toEqual({ created: 1, updated: 1 });
        await expect(svc.import(ws, [{ name: "Imp", element: "steps", values: elementTemplate("steps")!.defaults() }], "u1")).rejects.toBeInstanceOf(BadRequestException);
        const out = await svc.export(ws);
        expect(out.find((t) => t.name === "Imp")?.values).toMatchObject({ title: "I2" });
        expect(Object.keys(out[0]).sort()).toEqual(["element", "name", "values"]);
    });

    it("another workspace cannot read the template, and a page there never resolves it", async () => {
        const t = await svc.create(ws, { name: "Private", element: "cost", values: costValues("Secret") }, "u1");
        await expect(svc.get(other, t.id)).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.update(other, t.id, { values: costValues("X") })).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.duplicate(other, t.id, "Steal", "u2")).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.remove(other, t.id, true)).rejects.toBeInstanceOf(NotFoundException);
        expect((await svc.list(other)).length).toBe(0);
        const foreign = await page(elementHtml("cost", costValues("Own snapshot"), t.id), "PUBLISHED", other, otherTypeId);
        const html = await delivered(foreign);
        expect(html).toContain("Own snapshot");
        expect(html).not.toContain("Secret");
        expect((await svc.get(ws, t.id)).pages).toBe(0);
    });

    it("delivery shows the current values after an update, with no republish, for every kind of element", async () => {
        const t = await svc.create(ws, { name: "Fresh", element: "cost", values: costValues("Before") }, "u1");
        const s = await svc.create(ws, { name: "Fresh steps", element: "steps", values: { ...elementTemplate("steps")!.defaults(), title: "Steps before" } }, "u1");
        const id = await page(elementHtml("cost", costValues("Snap"), t.id) + elementHtml("steps", elementTemplate("steps")!.defaults(), s.id));
        expect(await delivered(id)).toContain("Before");
        await svc.update(ws, t.id, { values: costValues("After") });
        await svc.update(ws, s.id, { values: { ...elementTemplate("steps")!.defaults(), title: "Steps after" } });
        const html = await delivered(id);
        expect(html).toContain("After");
        expect(html).toContain("Steps after");
        expect(html).not.toContain("Before");
        const stored = (await prisma.contentEntry.findUniqueOrThrow({ where: { id } })).data as { body: string };
        expect(stored.body).toContain("Snap");
        expect(stored.body).toContain(`data-template="${t.id}"`);
    });

    it("a changed template fires one content.updated per referencing published entry; a rename or a draft does not", async () => {
        const t = await svc.create(ws, { name: "Hook", element: "cost", values: costValues("H1") }, "u1");
        const mine = elementHtml("cost", costValues("S"), t.id);
        const p1 = await page(mine);
        const p2 = await page(`<p>two</p>${mine}`);
        const draft = await page(mine, "DRAFT");
        const unrelated = await page("<p>none</p>");
        events.length = 0;
        await svc.update(ws, t.id, { name: "Hook renamed" });
        expect(events).toEqual([]);
        await svc.update(ws, t.id, { values: costValues("H2") });
        expect(events.map((e) => e.event)).toEqual(["content.updated", "content.updated"]);
        expect(events.map((e) => e.id).sort()).toEqual([p1, p2].sort());
        expect(events.map((e) => e.id)).not.toContain(draft);
        expect(events.map((e) => e.id)).not.toContain(unrelated);
        events.length = 0;
        await svc.update(ws, t.id, { values: costValues("H2") });
        expect(events).toEqual([]);
        await svc.remove(ws, t.id, true);
        expect(events.map((e) => e.id).sort()).toEqual([p1, p2].sort());
    });
});
