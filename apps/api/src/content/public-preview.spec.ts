import { describe, expect, it } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { elementHtml, encryptSecret } from "@flowcms/shared";
import { PublicController } from "./public.controller";
import { PublicQueryService } from "./public-query.service";
import { mintPreviewToken } from "./preview-token";

/* eslint-disable @typescript-eslint/no-explicit-any */
process.env.SECRETS_ENCRYPTION_KEY ||= "test-vault-key";

const SECRET = "pvs_test_secret";
const NOW = Date.now();
const ct = { id: "t", apiId: "city", pluralApiId: "cities", workspaceId: "w1", kind: "COLLECTION", schema: { fields: [] } };
const body = (title: string) => elementHtml("steps", { title, layout: "vertical", steps: [{ label: "L1", time: "", text: "T1" }] }, "tpl1");
const published = { id: "e1", slug: "live", status: "PUBLISHED", locale: "en", data: { intro: body("Snapshot") }, draftData: null };
const draft = { id: "e2", slug: "wip", status: "DRAFT", locale: "en", data: { intro: body("Snapshot") }, draftData: null };
const pending = { id: "e3", slug: "pend", status: "PUBLISHED", locale: "en", data: { intro: "<p>live copy</p>" }, draftData: { intro: "<p>pending copy</p>" } };
const rows = [published, draft, pending].map((e) => ({ ...e, publishedAt: null, createdAt: new Date(0), updatedAt: new Date(0) }));

function setup() {
    const prisma = {
        media: { findMany: async () => [] },
        contentType: { findFirst: async ({ where }: any) => (where.workspaceId === "w1" && ["city", "cities"].includes(where.OR[0].apiId) ? ct : null), findMany: async () => [] },
        workspace: {
            findUnique: async ({ where }: any) => ({ slug: where.id === "w1" ? "acme" : "other", previewSecretEnc: encryptSecret(SECRET) }),
        },
        elementTemplate: { findMany: async () => [{ id: "tpl1", values: { title: "Live template title", layout: "vertical", steps: [{ label: "L1", time: "", text: "T1" }] } }] },
        contentEntry: {
            findFirst: async ({ where }: any) => {
                const slug = where.OR[0].id;
                return rows.find((e) => (e.id === slug || e.slug === slug) && (where.status ? e.status === where.status : true)) ?? null;
            },
            findMany: async () => [],
        },
    };
    const svc = new PublicQueryService(prisma as any, { wrap: async (_k: string, _t: number, fn: () => any) => fn() } as any);
    const ctrl = new PublicController(svc);
    return { svc, ctrl };
}

const tok = (ws: string, type: string, slug: string, at = NOW) => mintPreviewToken(SECRET, ws, type, slug, at).token;
const call = async (ctrl: PublicController, slug: string, headers: Record<string, string> = {}, query: any = {}, type = "city", kind = "CONTENT") => {
    const res = { headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; } };
    const req = { headers, apiToken: { workspaceId: "w1", type: kind } } as any;
    try {
        const out = await ctrl.one(req, res as any, type, slug, query);
        return { out: out as any, res };
    } catch (e) {
        return { err: e, res };
    }
};

describe("preview token on GET /public/{type}/{slug}", () => {
    it("returns the draft, with its linked element expanded, for a valid token (header or query)", async () => {
        const { ctrl } = setup();
        const h = await call(ctrl, "wip", { "x-flowcms-preview-token": tok("acme", "city", "wip") });
        expect(h.out.data.slug).toBe("wip");
        expect(h.out.data.intro).toContain("Live template title");
        expect(h.out.data.intro).not.toContain("Snapshot");
        const q = await call(ctrl, "wip", {}, { preview_token: tok("acme", "city", "wip") });
        expect(q.out.data.intro).toContain("Live template title");
    });

    it("works through the plural type name and shows the pending draft copy of a published entry", async () => {
        const { ctrl } = setup();
        const r = await call(ctrl, "pend", { "x-flowcms-preview-token": tok("acme", "city", "pend") }, {}, "cities");
        expect(r.out.data.intro).toBe("<p>pending copy</p>");
        const none = await call(ctrl, "pend");
        expect(none.out.data.intro).toBe("<p>live copy</p>");
    });

    it("404s with no token, an expired token, a wrong slug, type or workspace", async () => {
        const { ctrl } = setup();
        const bad = [
            undefined,
            tok("acme", "city", "wip", NOW - 2 * 3600 * 1000),
            tok("acme", "city", "other-slug"),
            tok("acme", "service", "wip"),
            tok("other", "city", "wip"),
            "garbage",
        ];
        for (const t of bad) {
            const r = await call(ctrl, "wip", t ? { "x-flowcms-preview-token": t } : {});
            expect(r.err).toBeInstanceOf(NotFoundException);
        }
    });

    it("leaves a published entry unchanged with or without a token", async () => {
        const { ctrl } = setup();
        const a = await call(ctrl, "live");
        const b = await call(ctrl, "live", { "x-flowcms-preview-token": tok("acme", "city", "live") });
        const c = await call(ctrl, "live", { "x-flowcms-preview-token": "garbage" });
        expect(b.out).toEqual(a.out);
        expect(c.out).toEqual(a.out);
    });

    it("sets no-store whenever a token is supplied, even an invalid one", async () => {
        const { ctrl } = setup();
        expect((await call(ctrl, "live", { "x-flowcms-preview-token": tok("acme", "city", "live") })).res.headers["Cache-Control"]).toBe("private, no-store");
        expect((await call(ctrl, "live", {}, { preview_token: "garbage" })).res.headers["Cache-Control"]).toBe("private, no-store");
        expect((await call(ctrl, "live")).res.headers["Cache-Control"]).toBeUndefined();
    });
});

describe("GET /public/preview/verify", () => {
    const verify = async (ctrl: PublicController, q: any) => {
        const res = { headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; } };
        const out = await ctrl.verifyPreview({ headers: {}, apiToken: { workspaceId: "w1", type: "CONTENT" } } as any, res as any, q);
        return { out, res };
    };

    it("says true with the expiry for a good token, false for everything else, and is no-store", async () => {
        const { ctrl } = setup();
        const t = mintPreviewToken(SECRET, "acme", "city", "wip", NOW);
        const ok = await verify(ctrl, { type: "city", slug: "wip", token: t.token });
        expect(ok.out).toEqual({ valid: true, expiresAt: t.exp });
        expect(ok.res.headers["Cache-Control"]).toBe("private, no-store");
        expect(await verify(ctrl, { type: "cities", slug: "wip", token: t.token })).toMatchObject({ out: { valid: true } });
        for (const q of [{ type: "city", slug: "nope", token: t.token }, { type: "service", slug: "wip", token: t.token }, { type: "nope", slug: "wip", token: t.token }, { type: "city", slug: "wip", token: "x" }, { type: "city", slug: "wip" }]) {
            expect((await verify(ctrl, q)).out).toEqual({ valid: false });
        }
    });
});

describe("list endpoints ignore preview tokens", () => {
    it("lists published only and passes no token on", async () => {
        const { svc, ctrl } = setup();
        let seen: any;
        (svc as any).list = async (_w: string, _t: string, opts: any) => ((seen = opts), { data: [] });
        const res = { headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; } };
        await ctrl.list({ headers: { "x-flowcms-preview-token": tok("acme", "city", "wip") }, apiToken: { workspaceId: "w1", type: "CONTENT" } } as any, res as any, "city", {});
        expect(seen.preview).toBe(false);
        expect(res.headers["Cache-Control"]).toBe("private, no-store");
    });
});
