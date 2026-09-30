import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { RBAC_PORT, type RbacPort, type RoleRules } from "./rbac.port";

export type EntryPageQuery = {
    q?: string;
    typeIds?: string[];
    /** Database statuses (DRAFT, IN_REVIEW, ...). */
    statuses?: string[];
    /** A user id, or "none" for entries with no author. */
    author?: string;
    locale?: string;
    /** Only these entries (used to label already-picked references). */
    ids?: string[];
    /** Entries whose scheduled (else published) date falls in [from, to). */
    from?: Date;
    to?: Date;
    /** "content" leaves out reference types (tags, cities, ...), which have their own tab. */
    scope?: "content";
    sort?: string;
    dir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    /** Also return the status counts + author list for the unfiltered view. */
    facets?: boolean;
};

const MAX_PAGE_SIZE = 500;
const MAX_IDS = 100_000; // the most entries one "select all" can return
const clamp = (n: number | undefined, min: number, max: number, def: number) =>
    n == null || !Number.isFinite(n) ? def : Math.min(Math.max(min, Math.floor(n)), max);

/** A number stored in the entry body, or NULL when it is missing or not a number. */
const num = (key: string) => Prisma.sql`CASE WHEN jsonb_typeof(e."data" -> ${key}) = 'number' THEN (e."data" ->> ${key})::float8 END`;
const WHEN = Prisma.sql`COALESCE(e."scheduledAt", e."publishedAt")`;
const SORTS: Record<string, Prisma.Sql> = {
    title: Prisma.sql`lower(e."title")`,
    seoScore: num("seoScore"),
    views: num("views"),
    updated: Prisma.sql`e."updatedAt"`,
    date: WHEN,
};

type Row = {
    id: string; title: string; slug: string | null; status: string; locale: string;
    publishedAt: Date | null; scheduledAt: Date | null; updatedAt: Date; hasDraft: boolean;
    typeId: string; typeName: string; typeApiId: string;
    seoScore: number | null; views: number | null; authorId: string | null;
};

/**
 * One page of entries for the studio's list screens. Searching, filtering, sorting
 * and paging all happen in the database and entry bodies are never loaded, so a
 * workspace with tens of thousands of entries lists as fast as one with fifty.
 */
@Injectable()
export class ContentListService {
    constructor(
        private readonly prisma: PrismaService,
        @Optional() @Inject(RBAC_PORT) private readonly rbac?: RbacPort,
    ) {}

    /** The SQL conditions for a query: `view` is what the list shows before the user
     *  narrows it down, `where` adds the user's filters on top. */
    private async conditions(workspaceId: string, query: EntryPageQuery, role?: RoleRules) {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { authorMode: true } });
        // Mirrors effectiveAuthorId (./author.ts): a hand-picked author wins, else the workspace setting decides.
        const author =
            ws?.authorMode === "lastEditor"
                ? Prisma.sql`COALESCE(e."authorOverrideId", e."lastEditorId", e."authorId")`
                : Prisma.sql`COALESCE(e."authorOverrideId", e."authorId")`;

        // The view: what this list shows before the user narrows it down.
        const view: Prisma.Sql[] = [Prisma.sql`e."workspaceId" = ${workspaceId}`];
        const allowed = this.rbac && role ? await this.rbac.allowedTypeIds(role) : null; // advanced_rbac (Pro)
        if (allowed) view.push(Prisma.sql`e."contentTypeId" = ANY(${allowed})`);
        if (query.scope === "content") view.push(Prisma.sql`COALESCE(ct."schema" ->> 'pageType', '') <> 'reference'`);

        // The user's filters, on top of the view.
        const where = [...view];
        if (query.typeIds?.length) where.push(Prisma.sql`e."contentTypeId" = ANY(${query.typeIds})`);
        if (query.statuses?.length) where.push(Prisma.sql`e."status"::text = ANY(${query.statuses})`);
        if (query.locale) where.push(Prisma.sql`e."locale" = ${query.locale}`);
        if (query.ids?.length) where.push(Prisma.sql`e."id" = ANY(${query.ids.slice(0, MAX_PAGE_SIZE)})`);
        if (query.author === "none") where.push(Prisma.sql`${author} IS NULL`);
        else if (query.author) where.push(Prisma.sql`${author} = ${query.author}`);
        if (query.from) where.push(Prisma.sql`${WHEN} >= ${query.from}`);
        if (query.to) where.push(Prisma.sql`${WHEN} < ${query.to}`);
        const q = query.q?.trim();
        if (q) {
            const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
            where.push(Prisma.sql`(e."title" ILIKE ${like} OR e."slug" ILIKE ${like})`);
        }

        const FROM = Prisma.sql`FROM "ContentEntry" e JOIN "ContentType" ct ON ct."id" = e."contentTypeId"`;
        return { view, where, author, FROM };
    }

    /** The id of every entry matching the query, for "select all" across pages. */
    async ids(workspaceId: string, query: EntryPageQuery, role?: RoleRules) {
        const { where, FROM } = await this.conditions(workspaceId, query, role);
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT e."id" ${FROM} WHERE ${Prisma.join(where, " AND ")} ORDER BY e."updatedAt" DESC, e."id" DESC LIMIT ${MAX_IDS}`;
        return { ids: rows.map((r) => r.id) };
    }

    async page(workspaceId: string, query: EntryPageQuery, role?: RoleRules) {
        const { view, where, author, FROM } = await this.conditions(workspaceId, query, role);
        const pageSize = clamp(query.pageSize, 1, MAX_PAGE_SIZE, 25);
        const page = clamp(query.page, 1, Number.MAX_SAFE_INTEGER, 1);
        const dir = query.dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
        const order = SORTS[query.sort ?? "updated"] ?? SORTS.updated;
        const AND = (conds: Prisma.Sql[]) => Prisma.join(conds, " AND ");

        const [rows, [{ total }]] = await Promise.all([
            this.prisma.$queryRaw<Row[]>`
                SELECT e."id", COALESCE(NULLIF(e."title", ''), 'Untitled') AS "title", e."slug", e."status"::text AS "status",
                       e."locale", e."publishedAt", e."scheduledAt", e."updatedAt", e."draftData" IS NOT NULL AS "hasDraft",
                       ct."id" AS "typeId", ct."name" AS "typeName", ct."apiId" AS "typeApiId",
                       ${SORTS.seoScore} AS "seoScore", ${SORTS.views} AS "views", ${author} AS "authorId"
                ${FROM} WHERE ${AND(where)}
                ORDER BY ${order} ${dir} NULLS LAST, e."id" DESC
                LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
            this.prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS "total" ${FROM} WHERE ${AND(where)}`,
        ]);

        const facets = query.facets ? await this.facets(view, author, FROM) : undefined;

        const userIds = [...new Set([...rows.map((r) => r.authorId), ...(facets?.authorIds ?? [])].filter(Boolean) as string[])];
        const users = userIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, title: true, avatarUrl: true, avatarStyle: true } })
            : [];
        const userById = new Map(users.map((u) => [u.id, u]));
        const nameOf = (id: string) => userById.get(id)?.name ?? userById.get(id)?.email ?? "Unknown";

        return {
            total: Number(total),
            page,
            pageSize,
            items: rows.map((r) => {
                const u = r.authorId ? userById.get(r.authorId) : undefined;
                return {
                    id: r.id, title: r.title, slug: r.slug, status: r.status, locale: r.locale,
                    publishedAt: r.publishedAt, scheduledAt: r.scheduledAt, updatedAt: r.updatedAt, hasDraft: r.hasDraft,
                    contentType: { id: r.typeId, name: r.typeName, apiId: r.typeApiId },
                    author: r.authorId ? { id: r.authorId, name: nameOf(r.authorId), title: u?.title ?? null, avatarUrl: u?.avatarUrl ?? null, avatarStyle: u?.avatarStyle ?? null } : null,
                    data: { seoScore: r.seoScore, views: r.views },
                };
            }),
            ...(facets
                ? {
                      stats: facets.stats,
                      authors: facets.authorIds.map((id) => (id ? { id, name: nameOf(id) } : { id: "none", name: "Unassigned" })),
                  }
                : {}),
        };
    }

    /** Counts per status + who has content, across the whole view (ignores the user's filters). */
    private async facets(view: Prisma.Sql[], author: Prisma.Sql, FROM: Prisma.Sql) {
        const cond = Prisma.join(view, " AND ");
        const [byStatus, authors] = await Promise.all([
            this.prisma.$queryRaw<{ status: string; n: bigint }[]>`SELECT e."status"::text AS "status", count(*) AS "n" ${FROM} WHERE ${cond} GROUP BY e."status"`,
            this.prisma.$queryRaw<{ authorId: string | null }[]>`SELECT DISTINCT ${author} AS "authorId" ${FROM} WHERE ${cond}`,
        ]);
        const stats: Record<string, number> = {};
        for (const s of byStatus) stats[s.status] = Number(s.n);
        return { stats: { ...stats, total: byStatus.reduce((t, s) => t + Number(s.n), 0) }, authorIds: authors.map((a) => a.authorId) };
    }
}
