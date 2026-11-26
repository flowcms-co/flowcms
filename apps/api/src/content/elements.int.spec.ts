import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@flowcms/db";
import { elementHtml, expandElements } from "@flowcms/shared";
import { ContentEntriesService } from "./content-entries.service";
import { PublicQueryService } from "./public-query.service";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DEFAULT_THEME } from "@flowcms/shared";
import { FeatureGuard } from "../license/feature.guard";
import { ElementsController, ElementsThemeController } from "./elements.controller";

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
        const c = new ElementsController({} as never);
        expect(c.js()).toContain("w.FlowElements = { init: init }");
        expect(Reflect.getMetadata("__headers__", ElementsController.prototype.js)).toEqual(expect.arrayContaining([{ name: "Content-Type", value: "application/javascript; charset=utf-8" }]));
    });
});

describe("elements theme routes", () => {
    it("the stylesheet is cached briefly and varies by token", () => {
        const h = Reflect.getMetadata("__headers__", ElementsController.prototype.css) as { name: string; value: string }[];
        expect(h).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "public, max-age=60" }, { name: "Vary", value: "Authorization" }]));
    });

    it("without the elements licence the guard refuses the theme routes, read and write", async () => {
        const guard = new FeatureGuard(new Reflector(), { has: async (f: string) => f !== "elements" } as never);
        for (const handler of [ElementsThemeController.prototype.get, ElementsThemeController.prototype.set]) {
            const ctx = { getHandler: () => handler, getClass: () => ElementsThemeController } as never;
            await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
        }
        const licensed = new FeatureGuard(new Reflector(), { has: async () => true } as never);
        const ctx = { getHandler: () => ElementsThemeController.prototype.set, getClass: () => ElementsThemeController } as never;
        await expect(licensed.canActivate(ctx)).resolves.toBe(true);
    });
});

describe.skipIf(!RUN)("elements theme (integration)", () => {
    const prisma = new PrismaClient();
    const staff = new ElementsThemeController(prisma as never);
    const site = new ElementsController(prisma as never);
    const req = (auth?: string) => ({ headers: auth ? { authorization: auth } : {} }) as never;
    let workspaceId = "";
    let slug = "";
    let other = "";
    const user = () => ({ workspaceId }) as never;

    beforeAll(async () => {
        const id = uniq();
        slug = `th-${id}`;
        workspaceId = (await prisma.workspace.create({ data: { name: `th ${id}`, slug } })).id;
        other = (await prisma.workspace.create({ data: { name: `th2 ${id}`, slug: `th2-${id}` } })).id;
    });
    afterAll(async () => {
        await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, other] } } });
        await prisma.$disconnect();
    });

    it("starts at the default and round-trips a saved theme", async () => {
        expect(await staff.get(user())).toEqual(DEFAULT_THEME);
        const saved = { ...DEFAULT_THEME, accent: "#F3462A", radius: 20, font: "Poppins" };
        expect(await staff.set(user(), saved)).toEqual(saved);
        expect(await staff.get(user())).toEqual(saved);
    });

    it("refuses a bad theme and keeps the saved one", async () => {
        const before = await staff.get(user());
        for (const bad of [{ ...before, accent: "#fff;}body{display:none" }, { ...before, accent: "red" }, { ...before, radius: 99 }, { ...before, font: "Comic Sans" }, {}, null]) {
            await expect(staff.set(user(), bad)).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(await staff.get(user())).toEqual(before);
    });

    it("elements.css reflects the saved theme for that workspace only", async () => {
        await staff.set(user(), { ...DEFAULT_THEME, accent: "#123ABC", font: "Lato" });
        const css = await site.css(req(), slug);
        expect(css).toContain("--el-accent:#123ABC");
        expect(css).toContain("family=Lato");
        expect(css).toContain(".flow-el{");
        const otherSlug = (await prisma.workspace.findUniqueOrThrow({ where: { id: other } })).slug;
        expect(await site.css(req(), otherSlug)).toContain("--el-accent:#6C5CE7");
    });

    it("a stored value that is no longer valid serves the default, never raw", async () => {
        await prisma.workspace.update({ where: { id: workspaceId }, data: { elementsTheme: { accent: "red;}x{" } } });
        const css = await site.css(req(), slug);
        expect(css).toContain("--el-accent:#6C5CE7");
        expect(css).not.toContain("red;}");
    });

    it("an unknown slug or bad token falls to the default", async () => {
        expect(await site.css(req("Bearer nope"), "no-such-workspace-xyz")).toContain("--el-accent:#6C5CE7");
    });
});
