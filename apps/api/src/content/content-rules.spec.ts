import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ContentRulesService } from "../ee/content-rules/content-rules.service";
import { FeatureGuard } from "../license/feature.guard";
import { ContentEntriesController } from "./content-entries.controller";
import { ContentEntriesService } from "./content-entries.service";
import { ContentTypesService } from "./content-types.service";
import { ContentSchedulerService } from "./content-scheduler.service";
import { ContentJobHandlers } from "./content-job.handlers";
import { AgentModelController } from "./agent-model.controller";
import { RESOURCES_SCHEMA } from "./seed-schemas";
import { validateEntryData, rulesOf } from "./entry-validation";
import { BAD_WATER_DAMAGE, CLEAN_ARTICLE as CLEAN_FIXTURE, RESOURCES_FIELDS, RESOURCES_RULES } from "./content-rules.fixtures";

/**
 * The lock on publishing, through every route that can move an entry live. An in-memory
 * stand-in for the database: one entry, its type, no components.
 */
const SCHEMA = { icon: "document", fields: RESOURCES_FIELDS, contentRules: RESOURCES_RULES() };
/** The EE port with a stand-in license: licensed for content_rules or not, the way the ip_policies specs mock it. */
const portFor = (licensed: boolean) => new ContentRulesService({ has: async (f: string) => licensed && f === "content_rules" } as never, {} as never);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

type Row = { id: string; workspaceId: string; contentTypeId: string; slug: string; locale: string; status: string; data: unknown; draftData: unknown; draftApproved: boolean; authorId: null; lastEditorId: null; authorOverrideId: null; publishedAt: null; scheduledAt: null; firstPublishedAt: null; contentType: { id: string; name: string; apiId: string; schema: unknown } };

function setup(over: Partial<Row> & { schema?: unknown; licensed?: boolean } = {}) {
    const { schema = SCHEMA, licensed = true, ...rest } = over;
    const row: Row = {
        id: "e1", workspaceId: "w1", contentTypeId: "t1", slug: "sample-hard-breaks", locale: "en", status: "DRAFT",
        data: { ...clone(BAD_WATER_DAMAGE) }, draftData: null, draftApproved: false,
        authorId: null, lastEditorId: null, authorOverrideId: null, publishedAt: null, scheduledAt: null, firstPublishedAt: null,
        contentType: { id: "t1", name: "Resources", apiId: "resources", schema },
        ...rest,
    };
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(row, data));
    const upsert = vi.fn(async () => ({}));
    const prisma = {
        contentEntry: { findFirst: vi.fn(async () => row), findFirstOrThrow: vi.fn(async () => row), findMany: vi.fn(async () => [row]), update },
        contentType: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => ({ id: "t1", schema, workspaceId: "w1" })) },
        contentVersion: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ versionNumber: 1 })), count: vi.fn(async () => 0), deleteMany: vi.fn(async () => ({})) },
        contentReview: { upsert, count: vi.fn(async () => 1), deleteMany: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
        workspace: { findUnique: vi.fn(async () => ({ approvalsRequired: 1 })) },
        user: { findUnique: vi.fn(async () => null) },
        auditLog: { create: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
        $transaction: vi.fn(async (f: unknown) => (typeof f === "function" ? (f as (t: unknown) => unknown)(prisma) : [])),
    };
    const noop = vi.fn(async () => undefined);
    const service = new ContentEntriesService(
        prisma as never,
        { delByPrefix: noop } as never,
        { create: noop } as never,
        { dispatch: noop } as never,
        { dispatch: noop } as never,
        { runBeforeSave: async (_w: string, ctx: { data: Record<string, unknown> }) => ctx.data } as never,
        { syncEntry: noop } as never,
        undefined,
        undefined,
        undefined,
        portFor(licensed),
    );
    return { service, prisma, row, update, upsert };
}

const refused = async (p: Promise<unknown>) => {
    try {
        await p;
    } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        return (e as BadRequestException).getResponse() as { message: string; errors: Record<string, string>; issues: { path: string; level: string; text: string }[] };
    }
    throw new Error("expected the request to be refused");
};

const PUBLISHER = ["content.publish"];

describe("publish is blocked while a hard rule fails", () => {
    it("publish: field-keyed messages, structured issues, nothing written", async () => {
        const { service, update } = setup();
        const res = await refused(service.publish("w1", "e1", "u1", PUBLISHER));
        expect(res.message).toMatch(/^This article can't be published yet\. \d+ things need fixing\.$/);
        expect(res.errors["servicePageContent.sections[1].content"]).toBe(
            "Article sections #2 › Content: This paragraph comes after the bullet list. Move it above the list, or into the next section. See: Guide.",
        );
        expect(res.errors["servicePageContent.introText"]).toContain("Intro: This box has a bullet list");
        expect(res.issues.every((i) => i.level === "block")).toBe(true);
        for (const v of Object.values(res.errors)) expect(typeof v).toBe("string");
        expect(update).not.toHaveBeenCalled();
    });

    it("publish: a clean article goes live, and a warning alone never blocks", async () => {
        const { service, update } = setup({ data: { ...clone(CLEAN_FIXTURE), servicePageContent: { ...clone(CLEAN_FIXTURE.servicePageContent), heading: "Why early repairs help a lot" } } });
        await service.publish("w1", "e1", "u1", PUBLISHER);
        expect(update).toHaveBeenCalledOnce();
        expect(update.mock.calls[0][0].data.status).toBe("PUBLISHED");
    });

    it("schedule is blocked", async () => {
        const { service, update } = setup();
        const res = await refused(service.update("w1", "e1", { status: "SCHEDULED", scheduledAt: "2030-01-01T00:00:00Z" } as never, "u1", undefined, PUBLISHER));
        expect(Object.keys(res.errors).length).toBeGreaterThan(3);
        expect(update).not.toHaveBeenCalled();
    });

    it("approve (status change) is blocked", async () => {
        const { service, update } = setup();
        await refused(service.update("w1", "e1", { status: "APPROVED" } as never, "u1", undefined, PUBLISHER));
        expect(update).not.toHaveBeenCalled();
    });

    it("a reviewer's approve is blocked, and the decision is not recorded", async () => {
        const { service, upsert, update } = setup({ status: "IN_REVIEW" });
        await refused(service.recordReview("w1", "e1", "r1", "approve"));
        expect(upsert).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("requesting changes is never blocked", async () => {
        const { service, upsert } = setup({ status: "IN_REVIEW" });
        await service.recordReview("w1", "e1", "r1", "request_changes", "please fix");
        expect(upsert).toHaveBeenCalled();
    });

    it("an approved entry can still be edited and saved, but publishing it afterwards is refused", async () => {
        const good = { ...clone(CLEAN_FIXTURE) };
        const { service, update } = setup({ status: "APPROVED", data: good });
        await service.update("w1", "e1", { data: { servicePageContent: { ...good.servicePageContent, introText: "<ul><li>no</li></ul>" } } } as never, "u1");
        expect(update).toHaveBeenCalledOnce();
        await refused(service.publish("w1", "e1", "u1", PUBLISHER));
        expect(update).toHaveBeenCalledOnce(); // still only the save
    });

    it("a live entry's pending draft cannot be approved or promoted while it breaks a rule", async () => {
        const live = { ...clone(CLEAN_FIXTURE) };
        const { service, update } = setup({ status: "PUBLISHED", data: live, draftData: clone(BAD_WATER_DAMAGE), draftApproved: true });
        await refused(service.approveDraft("w1", "e1", "u1"));
        await refused(service.publish("w1", "e1", "u1", PUBLISHER));
        expect(update).not.toHaveBeenCalled();
    });

    it("restore-and-publish is blocked, restore as a draft is not", async () => {
        const { service, prisma } = setup({ status: "DRAFT" });
        (prisma.contentVersion as unknown as Record<string, unknown>).findFirst = vi.fn(async () => ({ id: "v1", entryId: "e1", versionNumber: 1, data: clone(BAD_WATER_DAMAGE), status: "DRAFT", label: "draft", createdAt: new Date() }));
        await refused(service.restore("w1", "e1", "1", "u1", { mode: "publish", actorPermissions: PUBLISHER }));
    });
});

describe("saving is allowed, with warnings", () => {
    it("a draft that breaks rules saves, and the response lists what is left to fix", async () => {
        const { service, update } = setup();
        const saved = (await service.update("w1", "e1", { data: { servicePageContent: { ...clone(BAD_WATER_DAMAGE.servicePageContent), heading: "A New Overview Heading" } } } as never, "u1")) as { warnings?: { level: string; path: string }[] };
        expect(update).toHaveBeenCalled();
        expect(saved.warnings?.some((w) => w.level === "block" && w.path === "servicePageContent.sections[1].content")).toBe(true);
    });

    it("an edit to a live entry stages as a draft, and only warns", async () => {
        const live = { ...clone(CLEAN_FIXTURE) };
        const { service, update } = setup({ status: "PUBLISHED", data: live });
        const saved = (await service.update("w1", "e1", { data: { servicePageContent: { ...live.servicePageContent, introText: "<ul><li>x</li></ul>" } } } as never, "u1")) as { warnings?: unknown[] };
        expect(update.mock.calls[0][0].data.draftData).toBeDefined();
        expect(saved.warnings?.length).toBeGreaterThan(0);
    });

    it("saving tidies accidental formatting on the server, and says so", async () => {
        const { service, row } = setup({ data: { title: "T", servicePageContent: {} } });
        const saved = (await service.update("w1", "e1", { data: { servicePageContent: { heading: "  Overview  Heading:  ", introText: "<p>One&nbsp;two  three</p><p>&nbsp;</p>" } } } as never, "u1")) as { tidied?: string };
        const stored = (row.data as { servicePageContent: { heading: string; introText: string } }).servicePageContent;
        expect(stored.introText).toBe("<p>One two three</p>");
        expect(stored.heading).toBe("Overview Heading"); // trailing colon stripped: this heading has a noTrailingColon rule
        expect(saved.tidied).toMatch(/^Tidied /);
    });

    it("an editor that keeps re-sending untidied content does not rewrite the entry or reset approval on every save", async () => {
        const live = { ...clone(CLEAN_FIXTURE) };
        const { service, update } = setup({ status: "PUBLISHED", data: live });
        const untidy = { servicePageContent: { ...live.servicePageContent, introText: "<p>Water  damage.</p><p>&nbsp;</p>" } };
        const first = (await service.update("w1", "e1", { data: untidy } as never, "u1")) as { tidied?: string };
        expect(first.tidied).toMatch(/^Tidied /);
        expect(update).toHaveBeenCalledOnce();
        const second = (await service.update("w1", "e1", { data: untidy } as never, "u1")) as { tidied?: string };
        expect(update).toHaveBeenCalledOnce(); // the second save changed nothing
        expect(second.tidied).toBeUndefined();
    });

    it("a type without rules is left exactly as it is", async () => {
        const { service, row } = setup({ schema: { fields: RESOURCES_FIELDS }, data: { title: "T" } });
        const saved = (await service.update("w1", "e1", { data: { servicePageContent: { introText: "<p>a  b</p><p>&nbsp;</p>" } } } as never, "u1")) as { warnings?: unknown; tidied?: unknown };
        expect((row.data as { servicePageContent: { introText: string } }).servicePageContent.introText).toBe("<p>a  b</p><p>&nbsp;</p>");
        expect(saved.warnings).toBeUndefined();
        expect(saved.tidied).toBeUndefined();
    });
});

describe("agent API and bulk publish go through the same lock", () => {
    it("bulk publish reports the formatted sentence as the reason and publishes nothing", async () => {
        const { service, update } = setup();
        const jobs = { register: vi.fn() };
        const handlers = new ContentJobHandlers(jobs as never, service, { contentEntry: { findFirst: vi.fn(async () => ({ data: { title: "Water" }, slug: "w" })) } } as never, {} as never);
        handlers.onModuleInit();
        const bulk = jobs.register.mock.calls.find((c) => c[0] === "content.bulkPublish")![1] as (j: unknown, h: unknown) => Promise<{ result: { done: number; failed: number; failures: { reason: string }[] } }>;
        const out = await bulk({ workspaceId: "w1", userId: "u1", payload: { ids: ["e1"] } }, { setTotal: vi.fn(), progress: vi.fn() });
        expect(out.result.done).toBe(0);
        expect(out.result.failed).toBe(1);
        expect(out.result.failures[0].reason).toMatch(/^Intro: This box has a bullet list/);
        expect(out.result.failures[0].reason).toMatch(/\(and \d+ more\)$/);
        expect(update).not.toHaveBeenCalled();
    });

    it("bulk schedule is blocked the same way", async () => {
        const { service, update } = setup();
        const jobs = { register: vi.fn() };
        const handlers = new ContentJobHandlers(jobs as never, service, { contentEntry: { findFirst: vi.fn(async () => null) } } as never, {} as never);
        handlers.onModuleInit();
        const bulk = jobs.register.mock.calls.find((c) => c[0] === "content.bulkSchedule")![1] as (j: unknown, h: unknown) => Promise<{ result: { failed: number } }>;
        const out = await bulk({ workspaceId: "w1", userId: "u1", payload: { ids: ["e1"], scheduledAt: "2030-01-01T00:00:00Z" } }, { setTotal: vi.fn(), progress: vi.fn() });
        expect(out.result.failed).toBe(1);
        expect(update).not.toHaveBeenCalled();
    });

    it("the agent publish (no user, no permissions) is refused with the same text", async () => {
        const { service } = setup({ status: "APPROVED" });
        const res = await refused(service.publish("w1", "e1"));
        expect(res.errors["servicePageContent.sections[1].content"]).toContain("This paragraph comes after the bullet list");
    });
});

const scheduled = (data: unknown, licensed: boolean) => {
    const rows = [{ id: "e1", slug: "s", title: "T", workspaceId: "w1", scheduledAt: new Date("2026-10-05T09:00:00Z"), publishedAt: null, firstPublishedAt: null, data, contentType: { apiId: "resources", schema: SCHEMA } }];
    const update = vi.fn(async (_a: unknown) => ({}));
    const prisma = { contentEntry: { findMany: vi.fn(async () => rows), update }, contentType: { findMany: vi.fn(async () => []) }, auditLog: { create: vi.fn(async (_a: unknown) => ({})) }, contentVersion: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) } };
    return { s: new ContentSchedulerService(prisma as never, { tryAcquire: vi.fn(async () => true) } as never, { dispatch: vi.fn() } as never, { delByPrefix: vi.fn() } as never, portFor(licensed)), update };
};

describe("the scheduler checks again at the moment of going live", () => {
    const due = (data: unknown) => [{ id: "e1", slug: "s", title: "T", workspaceId: "w1", scheduledAt: new Date("2026-10-05T09:00:00Z"), publishedAt: null, firstPublishedAt: null, data, contentType: { apiId: "resources", schema: SCHEMA } }];
    const make = (rows: unknown[], licensed = true) => {
        const update = vi.fn(async (_a: unknown) => ({}));
        const auditCreate = vi.fn(async (_a: { data: Record<string, unknown> }) => ({}));
        const prisma = {
            contentEntry: { findMany: vi.fn(async () => rows), update },
            contentType: { findMany: vi.fn(async () => []) },
            auditLog: { create: auditCreate },
            contentVersion: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
        };
        const s = new ContentSchedulerService(prisma as never, { tryAcquire: vi.fn(async () => true) } as never, { dispatch: vi.fn() } as never, { delByPrefix: vi.fn() } as never, portFor(licensed));
        return { s, update, auditCreate };
    };

    it("sends an entry that now breaks a rule back to draft, with a log entry", async () => {
        const { s, update, auditCreate } = make(due(clone(BAD_WATER_DAMAGE)));
        expect(await s.publishDue()).toBe(0);
        expect(update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { status: "DRAFT", scheduledAt: null } });
        expect(auditCreate.mock.calls[0][0].data).toMatchObject({ action: "content.publish_blocked", actorName: "Scheduled publish" });
    });

    it("publishes a clean one", async () => {
        const { s, update } = make(due({ ...clone(CLEAN_FIXTURE) }));
        expect(await s.publishDue()).toBe(1);
        expect((update.mock.calls[0][0] as { data: { status: string } }).data.status).toBe("PUBLISHED");
    });
});

describe("validateEntryData with rules", () => {
    const rules = rulesOf(SCHEMA)!;
    const fields = RESOURCES_FIELDS as never;
    const run = (opts: Record<string, unknown>, data = clone(BAD_WATER_DAMAGE)) => {
        try {
            validateEntryData(fields, data, { rules, ...(opts as { enforceRequired: boolean }) });
            return null;
        } catch (e) {
            return (e as BadRequestException).getResponse() as { errors: Record<string, string>; issues?: unknown[] };
        }
    };
    it("ignores the rules when not enforcing", () => {
        expect(run({ enforceRequired: false })).toBeNull();
    });
    it("enforces them when enforcing, and enforceRules can force it on", () => {
        expect(run({ enforceRequired: true })?.issues?.length).toBeGreaterThan(0);
        expect(run({ enforceRequired: false, enforceRules: true })?.issues?.length).toBeGreaterThan(0);
    });
    it("a warn-level rule never blocks", () => {
        const warnOnly = { fields: { "servicePageContent.heading": { titleCase: true } } };
        expect(() => validateEntryData(fields, { servicePageContent: { heading: "all lower case words here" } }, { enforceRequired: true, rules: warnOnly })).not.toThrow();
    });
    it("rulesOf ignores junk", () => {
        expect(rulesOf({})).toBeNull();
        expect(rulesOf({ contentRules: "x" })).toBeNull();
    });
});

describe("the Schema Builder no longer wipes the rules", () => {
    const make = (stored: unknown, licensed = true) => {
        const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", workspaceId: "w1", name: "Resources", apiId: "resources", pluralApiId: "resources", kind: "COLLECTION", draftAndPublish: true, schema: data.schema ?? stored }));
        const prisma = {
            contentType: {
                findFirst: vi.fn(async () => ({ id: "t1", workspaceId: "w1", name: "Resources", apiId: "resources", kind: "COLLECTION", schema: stored, _count: { entries: 3 } })),
                findMany: vi.fn(async () => []),
                update,
            },
        };
        return { svc: new ContentTypesService(prisma as never, undefined, portFor(licensed)), update };
    };
    const builderSave = { icon: "document", color: "#6C5CE7", pageType: "service", jsonLd: "Product", fields: RESOURCES_FIELDS }; // what the studio sends: no contentRules

    it("keeps the stored rules when a save leaves them out", async () => {
        const { svc, update } = make({ ...SCHEMA });
        await svc.update("w1", "t1", { schema: clone(builderSave) } as never);
        expect((update.mock.calls[0][0].data.schema as { contentRules: unknown }).contentRules).toEqual(SCHEMA.contentRules);
    });
    it("the type listing carries them for the studio", async () => {
        const { svc } = make({ ...SCHEMA });
        const out = await svc.update("w1", "t1", { schema: clone(builderSave) } as never);
        expect((out as { contentRules: unknown }).contentRules).toEqual(SCHEMA.contentRules);
    });
    it("null clears them, a new set replaces them", async () => {
        const { svc, update } = make({ ...SCHEMA });
        await svc.update("w1", "t1", { schema: { ...builderSave, contentRules: null } } as never);
        expect(update.mock.calls[0][0].data.schema).not.toHaveProperty("contentRules");
        const next = { guide: { url: "https://g" }, fields: { "servicePageContent.introText": { notEmpty: true } } };
        await svc.update("w1", "t1", { schema: { ...builderSave, contentRules: next } } as never);
        expect((update.mock.calls[1][0].data.schema as { contentRules: unknown }).contentRules).toEqual(next);
    });
    it("the agent model PATCH with ?dryRun checks the rules before anything is applied", async () => {
        const stored = { icon: "document", fields: RESOURCES_FIELDS };
        const row = { id: "t1", workspaceId: "w1", name: "Resources", apiId: "resources", kind: "COLLECTION", schema: stored };
        const { svc, update } = make(stored);
        const types = { findByRef: vi.fn(async () => row), settleRules: svc.settleRules.bind(svc), shape: (r: { schema: unknown }) => ({ schema: r.schema, contentRules: (r.schema as { contentRules?: unknown }).contentRules ?? null }), update: svc.update.bind(svc) };
        const ctrl = new AgentModelController(types as never, { record: vi.fn() } as never);
        const req = { apiToken: { workspaceId: "w1", scopes: ["model.update", "model.read"] } } as never;
        const ok = (await ctrl.update(req, "types", "resources", { schema: { contentRules: RESOURCES_RULES() } } as never, "true")) as { dryRun: boolean; type: { contentRules: unknown } };
        expect(ok.dryRun).toBe(true);
        expect(ok.type.contentRules).toEqual(RESOURCES_RULES());
        await expect(ctrl.update(req, "types", "resources", { schema: { contentRules: { fields: { "pageContent.introText": { notEmpty: true } } } } } as never, "true")).rejects.toThrow(/does not match any field/);
        expect(update).not.toHaveBeenCalled();
    });
    it("rejects unknown rules and paths that match no field, in plain words", async () => {
        const { svc, update } = make({ fields: [] });
        await expect(svc.update("w1", "t1", { schema: { ...builderSave, contentRules: { fields: { "pageContent.introText": { notEmpty: true } } } } } as never)).rejects.toThrow(/does not match any field/);
        await expect(svc.update("w1", "t1", { schema: { ...builderSave, contentRules: { fields: { "servicePageContent.introText": { magic: true } } } } } as never)).rejects.toThrow(/not a known rule/);
        expect(update).not.toHaveBeenCalled();
    });
});

describe("a resources rule set, through the real publish path", () => {
    const seed = { ...JSON.parse(readFileSync(join(__dirname, "fixtures/example-resources-rules.json"), "utf8")), guide: { label: "Guide", url: "https://example.com/guide" } };
    const schema = { icon: "document", fields: RESOURCES_SCHEMA, contentRules: seed };
    const backup = (slug: string) => JSON.parse(readFileSync(join(__dirname, `fixtures/${slug}.json`), "utf8"));

    it("refuses sample-hard-breaks at publish, schedule and approve, with field-keyed sentences", async () => {
        const { service, update } = setup({ schema, data: backup("sample-hard-breaks") });
        const res = await refused(service.publish("w1", "e1", "u1", PUBLISHER));
        expect(res.message).toMatch(/^This article can't be published yet\. \d+ things need fixing\.$/);
        expect(res.errors["servicePageContent.introText"]).toContain("Intro:");
        expect(res.errors["servicePageContent.keyBenefits[1].heading"]).toContain("Key benefits #2 › Heading: Step 2 should be the booking step");
        expect(res.issues.length).toBeGreaterThanOrEqual(10);
        await refused(service.update("w1", "e1", { status: "SCHEDULED", scheduledAt: "2030-01-01T00:00:00Z" } as never, "u1", undefined, PUBLISHER));
        await refused(service.update("w1", "e1", { status: "APPROVED" } as never, "u1", undefined, PUBLISHER));
        expect(update).not.toHaveBeenCalled();
    });

    it("lets a gold-style article through (its only findings are warnings)", async () => {
        const { service, update } = setup({ schema, data: backup("sample-gold-1") });
        await service.publish("w1", "e1", "u1", PUBLISHER);
        expect((update.mock.calls[0][0] as { data: { status: string } }).data.status).toBe("PUBLISHED");
    });
});

describe("tidy all", () => {
    const dirty = { ...clone(CLEAN_FIXTURE), servicePageContent: { ...clone(CLEAN_FIXTURE.servicePageContent), heading: " Understanding  Costs:", introText: "<p>Water  damage.</p><p>&nbsp;</p>" } };

    it("tidies a live page into a draft, never publishes, says what changed and logs it", async () => {
        const { service, update, row } = setup({ status: "PUBLISHED", data: dirty });
        const log = vi.spyOn(service as never, "logEvent" as never);
        const r = await service.tidyEntry("w1", "e1", "u1");
        expect(r.changed).toBe(true);
        expect(r.note).toMatch(/^Tidied .*extra space/);
        const patch = update.mock.calls[0][0].data as Record<string, unknown>;
        expect(patch.draftData).toBeDefined();
        expect(patch.status).toBeUndefined(); // no status change: nothing is published or approved
        expect(row.status).toBe("PUBLISHED");
        expect((patch.draftData as { servicePageContent: { heading: string } }).servicePageContent.heading).toBe("Understanding Costs");
        expect(log).toHaveBeenCalledWith("w1", "u1", "content.tidy", "e1", { metadata: expect.objectContaining({ note: r.note }) });
    });

    it("saves a draft in place, and leaves an already tidy or unruled entry alone", async () => {
        const a = setup({ status: "DRAFT", data: dirty });
        expect((await a.service.tidyEntry("w1", "e1", "u1")).changed).toBe(true);
        expect((a.row.data as { servicePageContent: { introText: string } }).servicePageContent.introText).toBe("<p>Water damage.</p>");
        expect((await a.service.tidyEntry("w1", "e1", "u1")).changed).toBe(false);
        const b = setup({ schema: { fields: RESOURCES_FIELDS }, data: dirty });
        expect(await b.service.tidyEntry("w1", "e1", "u1")).toEqual({ id: "e1", changed: false, note: null });
        expect(b.update).not.toHaveBeenCalled();
    });

    it("the bulk job tidies each entry and publishes none", async () => {
        const { service, update } = setup({ status: "PUBLISHED", data: dirty });
        const jobs = { register: vi.fn() };
        new ContentJobHandlers(jobs as never, service, { contentEntry: { findFirst: vi.fn(async () => null) } } as never, {} as never).onModuleInit();
        const bulk = jobs.register.mock.calls.find((c) => c[0] === "content.bulkTidy")![1] as (j: unknown, h: unknown) => Promise<{ result: { done: number; failed: number } }>;
        const out = await bulk({ workspaceId: "w1", userId: "u1", payload: { ids: ["e1"] } }, { setTotal: vi.fn(), progress: vi.fn() });
        expect(out.result).toMatchObject({ done: 1, failed: 0 });
        for (const c of update.mock.calls) expect((c[0] as { data: { status?: string } }).data.status).toBeUndefined();
    });
});

describe("content rules are an Enterprise feature: unlicensed, everything is inert", () => {
    it("publish succeeds with no rule errors when not licensed (sample-hard-breaks)", async () => {
        const seed = { ...JSON.parse(readFileSync(join(__dirname, "fixtures/example-resources-rules.json"), "utf8")), guide: { label: "Guide", url: "https://example.org/guide" } };
        const schema = { icon: "document", fields: RESOURCES_SCHEMA, contentRules: seed };
        const data = JSON.parse(readFileSync(join(__dirname, "fixtures/sample-hard-breaks.json"), "utf8"));
        const off = setup({ schema, data, licensed: false });
        await off.service.publish("w1", "e1", "u1", PUBLISHER);
        expect((off.update.mock.calls[0][0] as { data: { status: string } }).data.status).toBe("PUBLISHED");
        const on = setup({ schema, data, licensed: true });
        await refused(on.service.publish("w1", "e1", "u1", PUBLISHER));
        expect(on.update).not.toHaveBeenCalled();
    });

    it("schedule and approve never block, and saves add no warnings or tidying", async () => {
        const { service, update } = setup({ licensed: false });
        await service.update("w1", "e1", { status: "SCHEDULED", scheduledAt: "2030-01-01T00:00:00Z" } as never, "u1", undefined, PUBLISHER);
        expect(update).toHaveBeenCalledOnce();
        const b = setup({ licensed: false, data: { title: "T", servicePageContent: {} } });
        const saved = (await b.service.update("w1", "e1", { data: { servicePageContent: { introText: "<p>One  two</p><p>&nbsp;</p>" } } } as never, "u1")) as { warnings?: unknown; tidied?: string };
        expect(saved.warnings).toBeUndefined();
        expect(saved.tidied).toBeUndefined();
        expect((b.row.data as { servicePageContent: { introText: string } }).servicePageContent.introText).toBe("<p>One  two</p><p>&nbsp;</p>");
    });

    it("a reviewer can approve, and tidy does nothing", async () => {
        const { service, upsert, update } = setup({ status: "IN_REVIEW", licensed: false });
        await service.recordReview("w1", "e1", "r1", "approve");
        expect(upsert).toHaveBeenCalled();
        expect((await service.tidyEntry("w1", "e1", "u1")).changed).toBe(false);
        expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ draftData: expect.anything() }) }));
    });

    it("a scheduled page that breaks the stored rules still goes live", async () => {
        const { s, update } = scheduled(clone(BAD_WATER_DAMAGE), false);
        expect(await s.publishDue()).toBe(1);
        expect((update.mock.calls[0][0] as { data: { status: string } }).data.status).toBe("PUBLISHED");
    });

    it("both tidy endpoints are 403 without the license, and open with it", async () => {
        const guard = (licensed: boolean) => new FeatureGuard(new Reflector(), { has: async (f: string) => licensed && f === "content_rules" } as never);
        const ctx = (h: unknown) => ({ getHandler: () => h, getClass: () => ContentEntriesController }) as never;
        for (const h of [ContentEntriesController.prototype.tidy, ContentEntriesController.prototype.bulkTidy]) {
            await expect(guard(false).canActivate(ctx(h))).rejects.toThrow(ForbiddenException);
            expect(await guard(true).canActivate(ctx(h))).toBe(true);
        }
    });

    it("saving or changing contentRules on a model is 403 without the license; a round trip of the stored rules is fine", async () => {
        const stored = { ...SCHEMA };
        const builderSave = { icon: "document", fields: RESOURCES_FIELDS };
        const a = (() => {
            const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", workspaceId: "w1", name: "R", apiId: "resources", kind: "COLLECTION", schema: data.schema }));
            const prisma = { contentType: { findFirst: vi.fn(async () => ({ id: "t1", workspaceId: "w1", name: "R", apiId: "resources", kind: "COLLECTION", schema: stored, _count: { entries: 0 } })), findMany: vi.fn(async () => []), update } };
            return { svc: new ContentTypesService(prisma as never, undefined, portFor(false)), update };
        })();
        await expect(a.svc.update("w1", "t1", { schema: { ...builderSave, contentRules: { fields: {} } } } as never)).rejects.toThrow(ForbiddenException);
        await expect(a.svc.update("w1", "t1", { schema: { ...builderSave, contentRules: null } } as never)).rejects.toThrow(ForbiddenException);
        expect(a.update).not.toHaveBeenCalled();
        await a.svc.update("w1", "t1", { schema: { ...builderSave, contentRules: clone(SCHEMA.contentRules) } } as never);
        await a.svc.update("w1", "t1", { schema: builderSave } as never);
        expect(a.update).toHaveBeenCalledTimes(2);
        expect((a.update.mock.calls[1][0].data.schema as { contentRules: unknown }).contentRules).toEqual(SCHEMA.contentRules); // stored rules are kept, just inert
    });
});

describe("the guide link setting (Enterprise)", () => {
    const make = () => {
        const update = vi.fn(async (_a: unknown) => ({}));
        const types = [
            { id: "t1", name: "Resources", apiId: "resources", schema: clone(SCHEMA) },
            { id: "t2", name: "Plain", apiId: "plain", schema: { fields: [] } },
        ];
        const prisma = { contentType: { findMany: vi.fn(async () => types), update } };
        return { svc: new ContentRulesService({ has: async () => true } as never, prisma as never), update };
    };
    it("lists only types with rules, and sets the link on them", async () => {
        const { svc, update } = make();
        expect((await svc.listGuides("w1")).map((t) => t.apiId)).toEqual(["resources"]);
        await svc.setGuide("w1", { url: "https://docs.example.org/g", label: "Formatting guide" });
        expect(update).toHaveBeenCalledOnce();
        const saved = (update.mock.calls[0][0] as { data: { schema: { contentRules: { guide: unknown } } } }).data.schema.contentRules.guide;
        expect(saved).toEqual({ label: "Formatting guide", url: "https://docs.example.org/g" });
    });
    it("refuses anything that is not an https address, and clears with an empty one", async () => {
        const { svc, update } = make();
        await expect(svc.setGuide("w1", { url: "http://docs.example.org" })).rejects.toThrow(BadRequestException);
        await expect(svc.setGuide("w1", { url: "not a url" })).rejects.toThrow(BadRequestException);
        expect(update).not.toHaveBeenCalled();
        await svc.setGuide("w1", { url: "" });
        expect((update.mock.calls[0][0] as { data: { schema: { contentRules: Record<string, unknown> } } }).data.schema.contentRules).not.toHaveProperty("guide");
    });
});
