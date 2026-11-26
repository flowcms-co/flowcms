import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@flowcms/db";
import { elementHtml, expandElements } from "@flowcms/shared";
import { ContentEntriesService } from "./content-entries.service";
import { PublicQueryService } from "./public-query.service";
import { ElementsController } from "./elements.controller";

/**
 * Elements end to end against a live Postgres (gated on RUN_DB_TESTS, like the other
 * integration specs): a bad element blocks publishing, delivered markup cannot be saved
 * back, the public read is expanded, and the stored read is not.
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const uniq = () => Math.random().toString(36).slice(2, 10);

const cost = (over: Record<string, unknown> = {}) =>
    elementHtml("cost", { title: "Cost", location: "Here", low: 100, avg: 200, high: 300, min: 0, max: 500, note: "", ...over });

describe.skipIf(!RUN)("elements (integration)", () => {
    const prisma = new PrismaClient();
    const noop = async () => {};
    const service = new ContentEntriesService(
        prisma as never,
        { delByPrefix: noop } as never,
        {} as never,
        { dispatch: noop } as never,
        { dispatch: noop } as never,
        { runBeforeSave: async (_w: string, ctx: { data: Record<string, unknown> }) => ctx.data } as never,
        { syncEntry: noop } as never,
    );
    const pub = new PublicQueryService(prisma as never, { wrap: async (_k: string, _t: number, fn: () => unknown) => fn() } as never);
    let workspaceId = "";
    let typeId = "";
    let apiId = "";
    const draft = async (body: string) =>
        (await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: typeId, status: "DRAFT", slug: `p-${uniq()}`, data: { title: "T", body } } })).id;

    beforeAll(async () => {
        const id = uniq();
        apiId = `page${id}`;
        workspaceId = (await prisma.workspace.create({ data: { name: `ws ${id}`, slug: `ws-${id}` } })).id;
        typeId = (await prisma.contentType.create({ data: { workspaceId, name: "Page", apiId, pluralApiId: `${apiId}s`, kind: "COLLECTION", schema: { fields: [{ name: "title", type: "Text" }, { name: "body", type: "Rich text" }] } } })).id;
    });
    afterAll(async () => {
        await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
        await prisma.$disconnect();
    });

    it("publishing refuses a bad cost element, naming the rule", async () => {
        const id = await draft(`<p>x</p>${cost({ low: 900 })}`);
        const err = await service.publish(workspaceId, id).catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(JSON.stringify((err as BadRequestException).getResponse())).toContain("Low end cannot be above the average.");
    });

    it("a good element publishes; the public read is expanded and the stored read is not", async () => {
        const body = `<p>x</p>${cost()}`;
        const id = await draft(body);
        await service.publish(workspaceId, id);
        const stored = await service.get(workspaceId, id);
        expect((stored.data as { body: string }).body).toBe(body);
        const ct = await prisma.contentType.findUniqueOrThrow({ where: { id: typeId } });
        const { data } = await pub.oneForType(ct, id, {});
        expect(data.body).toBe(expandElements(body));
        expect(data.body).toContain("flow-el--cost");
        expect(data.body).not.toContain("data-values");
    });

    it("saving delivered markup back is refused, on draft saves too", async () => {
        const id = await draft("<p>x</p>");
        const delivered = expandElements(cost());
        const err = await service.update(workspaceId, id, { data: { body: delivered } } as never, undefined).catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(JSON.stringify((err as BadRequestException).getResponse())).toContain("delivered HTML");
        expect(((await prisma.contentEntry.findUniqueOrThrow({ where: { id } })).data as { body: string }).body).toBe("<p>x</p>");
    });
});

describe("elements.js route", () => {
    it("is open and serves the script", () => {
        const c = new ElementsController();
        expect(c.js()).toContain("w.FlowElements = { init: init }");
        expect(Reflect.getMetadata("__headers__", ElementsController.prototype.js)).toEqual(expect.arrayContaining([{ name: "Content-Type", value: "application/javascript; charset=utf-8" }]));
    });
});
