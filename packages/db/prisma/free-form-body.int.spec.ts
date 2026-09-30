import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * The free_form_body migration (gated on RUN_DB_TESTS like the other integration
 * specs). It already ran via `migrate deploy`; re-running its SQL over fresh rows
 * checks that it switches on only field-less types with real body content.
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const prisma = new PrismaClient();
const uniq = () => Math.random().toString(36).slice(2, 10);
const SQL = readFileSync(join(__dirname, "migrations/20261001090000_free_form_body/migration.sql"), "utf8");

describe.skipIf(!RUN)("free_form_body migration (integration)", () => {
    // Its own workspace: sharing bootstrap() with the other spec files races on a fresh DB.
    let workspaceId = "";
    afterAll(async () => {
        if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
        await prisma.$disconnect();
    });

    it("switches on only field-less types whose entries hold real body content", async () => {
        const ws = uniq();
        workspaceId = (await prisma.workspace.create({ data: { name: `ws ${ws}`, slug: `ws-${ws}` } })).id;
        const type = async (name: string, schema: object, bodies: { data?: unknown; draftData?: unknown }[]) => {
            const id = uniq();
            const ct = await prisma.contentType.create({
                data: { workspaceId, name, apiId: `t_${id}`, pluralApiId: `t_${id}s`, kind: "COLLECTION", schema },
            });
            for (const b of bodies) {
                await prisma.contentEntry.create({
                    data: { workspaceId, contentTypeId: ct.id, data: (b.data ?? {}) as object, draftData: b.draftData as object | undefined, status: "DRAFT" },
                });
            }
            return ct.id;
        };

        const page = await type("Page", { fields: [] }, [{ data: { title: "A", body: "<p>Hello</p>" } }, { data: { title: "B" } }]);
        const draftOnly = await type("Draft page", {}, [{ data: { title: "A", body: "" }, draftData: { title: "A", body: "<h2>Hi</h2>" } }]);
        const tags = await type("Tags", { fields: [] }, [
            { data: { title: "a", body: "" } },
            { data: { title: "b", body: "<p></p>" } },
            { data: { title: "c", body: "  <p> </p> " } },
            { data: { title: "d", body: null } },
            { data: { title: "e" } },
        ]);
        const typed = await type("Typed", { fields: [{ id: "f1", name: "intro", type: "Text", required: false }] }, [{ data: { title: "A", body: "<p>Stray</p>" } }]);
        const optedOut = await type("Opted out", { fields: [], freeFormBody: false }, [{ data: { title: "A", body: "<p>Hi</p>" } }]);

        await prisma.$executeRawUnsafe(SQL);

        const flag = async (id: string) => ((await prisma.contentType.findUniqueOrThrow({ where: { id } })).schema as { freeFormBody?: boolean }).freeFormBody;
        expect(await flag(page)).toBe(true);
        expect(await flag(draftOnly)).toBe(true);
        expect(await flag(tags)).toBeUndefined();
        expect(await flag(typed)).toBeUndefined();
        expect(await flag(optedOut)).toBe(false);
    });
});
