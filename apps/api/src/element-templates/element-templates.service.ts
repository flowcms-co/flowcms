import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, type ElementTemplate } from "@flowcms/db";
import { elementTemplate } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ContentEntriesService } from "../content/content-entries.service";

export type TemplateInput = { name: string; element: string; values: unknown };
type Usage = { id: string; title: string | null; slug: string; status: string };

const MAX_NAME = 80;
const MAX_IMPORT = 200;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The stored body holds `data-template=\"<id>\"` (a quote is escaped inside jsonb text). */
const LINK = 'data-template=\\"';
const LINK_ID = /data-template=\\"([\w-]+)\\"/g;

function cleanName(v: unknown): string {
    const n = typeof v === "string" ? v.trim() : "";
    if (!n) throw new BadRequestException("A template needs a name.");
    if (n.length > MAX_NAME) throw new BadRequestException(`A template name is at most ${MAX_NAME} characters.`);
    return n;
}

/** The element's own validation; throws a 400 naming every problem. */
function checkValues(element: unknown, values: unknown, label = ""): void {
    const t = typeof element === "string" ? elementTemplate(element) : undefined;
    if (!t) throw new BadRequestException(`${label}Unknown element “${String(element)}”.`);
    if (values === null || typeof values !== "object" || Array.isArray(values)) throw new BadRequestException(`${label}The values must be an object.`);
    const problems = t.validate(values);
    if (problems.length) throw new BadRequestException(problems.map((p) => `${label}${p}`));
}

const dto = (t: ElementTemplate) => ({ id: t.id, name: t.name, element: t.element, values: t.values, createdAt: t.createdAt, updatedAt: t.updatedAt });

@Injectable()
export class ElementTemplatesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly entries: ContentEntriesService,
        @Optional() private readonly audit?: AuditService,
    ) {}

    /**
     * Entries whose stored body links a template: all of them for `id` omitted (id to pages), else only that id.
     * ponytail: a text search over the body JSON; add an index table if a workspace ever has tens of thousands of linked pages.
     */
    private async usage(workspaceId: string, id?: string, liveOnly = false): Promise<Map<string, Usage[]>> {
        const pat = id ? `${LINK}${id}\\"` : LINK;
        const rows = await this.prisma.$queryRaw<(Usage & { body: string })[]>(Prisma.sql`
            SELECT id, title, slug, status::text AS status, data::text || ' ' || CASE WHEN ${liveOnly} THEN '' ELSE COALESCE("draftData"::text, '') END AS body
            FROM "ContentEntry"
            WHERE "workspaceId" = ${workspaceId}
              AND (strpos(data::text, ${pat}) > 0 OR (NOT ${liveOnly} AND strpos(COALESCE("draftData"::text, ''), ${pat}) > 0))
              ${liveOnly ? Prisma.sql`AND status = 'PUBLISHED'` : Prisma.empty}`);
        const out = new Map<string, Usage[]>();
        for (const r of rows) {
            const ids = new Set([...r.body.matchAll(LINK_ID)].map((m) => m[1]));
            for (const tid of ids) if (!id || tid === id) out.set(tid, [...(out.get(tid) ?? []), { id: r.id, title: r.title, slug: r.slug, status: r.status }]);
        }
        return out;
    }

    private async find(workspaceId: string, id: string) {
        const t = await this.prisma.elementTemplate.findFirst({ where: { id, workspaceId } });
        if (!t) throw new NotFoundException("Template not found.");
        return t;
    }

    private async log(workspaceId: string, action: string, t: { id: string; name: string }, metadata?: Record<string, unknown>) {
        await this.audit?.log({ workspaceId, action: `element_template.${action}`, resource: "ElementTemplate", resourceId: t.id, title: t.name, metadata: metadata ?? null });
    }

    /** Tell subscriber sites the pages using this template now deliver differently. */
    private async announce(workspaceId: string, id: string) {
        const pages = (await this.usage(workspaceId, id, true)).get(id) ?? [];
        await this.entries.announceChanged(workspaceId, pages.map((p) => p.id));
        return pages.length;
    }

    /** Insert and catch a name clash as a plain 409. */
    private async insert(data: Prisma.ElementTemplateUncheckedCreateInput) {
        try {
            return await this.prisma.elementTemplate.create({ data });
        } catch (e) {
            if ((e as { code?: string }).code === "P2002") throw new ConflictException(`A template named “${data.name}” already exists.`);
            throw e;
        }
    }

    async list(workspaceId: string) {
        const [rows, used] = await Promise.all([this.prisma.elementTemplate.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }), this.usage(workspaceId)]);
        return rows.map((t) => ({ ...dto(t), pages: used.get(t.id)?.length ?? 0 }));
    }

    async get(workspaceId: string, id: string) {
        const t = await this.find(workspaceId, id);
        const pages = (await this.usage(workspaceId, id)).get(id) ?? [];
        return { ...dto(t), pages: pages.length, usedOn: pages };
    }

    async create(workspaceId: string, body: { name?: unknown; element?: unknown; values?: unknown }, userId: string) {
        const name = cleanName(body.name);
        checkValues(body.element, body.values);
        const t = await this.insert({ workspaceId, name, element: body.element as string, values: body.values as Prisma.InputJsonValue, createdById: userId });
        await this.log(workspaceId, "create", t, { element: t.element });
        return { ...dto(t), pages: 0 };
    }

    async update(workspaceId: string, id: string, body: { name?: unknown; values?: unknown }) {
        const t = await this.find(workspaceId, id);
        const data: Prisma.ElementTemplateUpdateInput = {};
        if (body.name !== undefined) data.name = cleanName(body.name);
        const valuesChanged = body.values !== undefined && !same(body.values, t.values);
        if (body.values !== undefined) {
            checkValues(t.element, body.values);
            data.values = body.values as Prisma.InputJsonValue;
        }
        let row: ElementTemplate;
        try {
            row = await this.prisma.elementTemplate.update({ where: { id }, data });
        } catch (e) {
            if ((e as { code?: string }).code === "P2002") throw new ConflictException(`A template named “${String(body.name)}” already exists.`);
            throw e;
        }
        await this.log(workspaceId, "update", row, { renamedFrom: row.name !== t.name ? t.name : undefined, valuesChanged });
        const pages = valuesChanged ? await this.announce(workspaceId, id) : (await this.usage(workspaceId, id)).get(id)?.length ?? 0;
        return { ...dto(row), pages };
    }

    async duplicate(workspaceId: string, id: string, name: unknown, userId: string) {
        const src = await this.find(workspaceId, id);
        const t = await this.insert({ workspaceId, name: cleanName(name), element: src.element, values: src.values as Prisma.InputJsonValue, createdById: userId });
        await this.log(workspaceId, "duplicate", t, { from: src.id, fromName: src.name });
        return { ...dto(t), pages: 0 };
    }

    /** Refuses while pages link to it (409 naming them) unless forced. A forced delete leaves those pages on their stored snapshot. */
    async remove(workspaceId: string, id: string, force: boolean) {
        const t = await this.find(workspaceId, id);
        const pages = (await this.usage(workspaceId, id)).get(id) ?? [];
        if (pages.length && !force)
            throw new ConflictException({ statusCode: 409, message: `“${t.name}” is used on ${pages.length} ${pages.length === 1 ? "page" : "pages"}. Delete it anyway and they keep their last saved values.`, entries: pages });
        await this.prisma.elementTemplate.delete({ where: { id } });
        await this.log(workspaceId, "delete", t, { forced: force && pages.length > 0, pages: pages.length });
        if (pages.length) await this.entries.announceChanged(workspaceId, pages.map((p) => p.id));
        return { ok: true, pages: pages.length };
    }

    async export(workspaceId: string): Promise<TemplateInput[]> {
        const rows = await this.prisma.elementTemplate.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
        return rows.map((t) => ({ name: t.name, element: t.element, values: t.values }));
    }

    /** All or nothing: every item is checked first, then the batch is upserted by name in one transaction. */
    async import(workspaceId: string, body: unknown, userId: string) {
        if (!Array.isArray(body) || !body.length) throw new BadRequestException("Send a JSON array of { name, element, values }.");
        if (body.length > MAX_IMPORT) throw new BadRequestException(`Import at most ${MAX_IMPORT} templates at a time.`);
        const items: TemplateInput[] = [];
        const seen = new Set<string>();
        const existing = new Map((await this.prisma.elementTemplate.findMany({ where: { workspaceId } })).map((t) => [t.name, t]));
        const errors: string[] = [];
        body.forEach((raw, i) => {
            const label = `Item ${i + 1}: `;
            try {
                const it = (raw ?? {}) as { name?: unknown; element?: unknown; values?: unknown };
                const name = cleanName(it.name);
                checkValues(it.element, it.values);
                if (seen.has(name)) throw new BadRequestException(`“${name}” appears twice.`);
                const prev = existing.get(name);
                if (prev && prev.element !== it.element) throw new BadRequestException(`“${name}” already exists as a ${prev.element}; an element kind cannot change.`);
                seen.add(name);
                items.push({ name, element: it.element as string, values: it.values });
            } catch (e) {
                const r = (e as BadRequestException).getResponse?.() as { message?: string | string[] } | string | undefined;
                const msg = typeof r === "string" ? r : r?.message ?? String(e);
                for (const m of Array.isArray(msg) ? msg : [msg]) errors.push(`${label}${m}`);
            }
        });
        if (errors.length) throw new BadRequestException(errors);

        const touched: { row: ElementTemplate; created: boolean; changed: boolean }[] = [];
        await this.prisma.$transaction(async (tx) => {
            for (const it of items) {
                const prev = existing.get(it.name);
                const values = it.values as Prisma.InputJsonValue;
                if (prev) touched.push({ row: await tx.elementTemplate.update({ where: { id: prev.id }, data: { values } }), created: false, changed: !same(prev.values, it.values) });
                else touched.push({ row: await tx.elementTemplate.create({ data: { workspaceId, name: it.name, element: it.element, values, createdById: userId } }), created: true, changed: false });
            }
        });
        const created = touched.filter((t) => t.created).length;
        await this.audit?.log({ workspaceId, action: "element_template.import", resource: "ElementTemplate", title: `${items.length} templates`, metadata: { created, updated: items.length - created } });
        for (const t of touched) if (t.changed) await this.announce(workspaceId, t.row.id);
        return { created, updated: items.length - created };
    }
}
