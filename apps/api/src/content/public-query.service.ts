import { Injectable, NotFoundException } from "@nestjs/common";
import { ContentEntry, ContentType, Prisma } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { entryToCanonicalContent, buildJsonLd } from "./canonical-content";
import { fieldsOf, type SchemaField } from "./entry-validation";

/** Coerce a stored reference value into an id list (single refs store a string,
 *  multiple store an array of ids). */
const refIds = (v: unknown): string[] =>
    Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
        : typeof v === "string" && v
          ? [v]
          : [];

export type QueryOpts = {
    limit?: number;
    offset?: number;
    sort?: string; // "field:asc" | "field:desc"
    locale?: string;
    fields?: string[]; // project these data keys (+ always id/slug/meta)
    filters?: Record<string, string>; // equality on data keys (or top-level slug)
    preview?: boolean; // include non-published (preview tokens only)
};

/** Columns that can be sorted on (JSON data fields can't be ordered in SQL portably). */
const SORTABLE = new Set(["publishedAt", "createdAt", "updatedAt", "slug", "id"]);

const coerce = (v: string): string | number | boolean => {
    if (v === "true") return true;
    if (v === "false") return false;
    if (v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return v;
};

/**
 * Public origin that serves uploaded media. `Media.url` is stored relative
 * ("/media/<key>"), which only resolves when the page is on the CMS origin — a
 * customer's frontend (a different domain) would resolve "/media/..." against
 * ITSELF and 404. So the delivery API rewrites relative "/media/..." values to
 * absolute URLs on the CMS host. MEDIA_PUBLIC_URL overrides (e.g. a CDN); else the
 * canonical CMS URL (STUDIO_URL), under which Caddy proxies /media to the API.
 */
const MEDIA_BASE = (process.env.MEDIA_PUBLIC_URL || process.env.STUDIO_URL || "").replace(/\/$/, "");

/** Deep-rewrite relative "/media/..." strings to absolute CMS URLs. */
const absolutizeMedia = (v: unknown): unknown => {
    if (typeof v === "string") return v.startsWith("/media/") ? `${MEDIA_BASE}${v}` : v;
    if (Array.isArray(v)) return v.map(absolutizeMedia);
    if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = absolutizeMedia(val);
        return out;
    }
    return v;
};

/**
 * Shared read-side query engine for the public delivery API — used by both the
 * REST controller and the GraphQL resolver so filtering/sorting/projection logic
 * lives in one place. Returns delivery-shaped objects (data fields flattened).
 */
@Injectable()
export class PublicQueryService {
    constructor(private readonly prisma: PrismaService) {}

    async resolveType(workspaceId: string, type: string): Promise<ContentType> {
        // Reusable components (kind=COMPONENT) are not deliverable collections.
        const ct = await this.prisma.contentType.findFirst({
            where: { workspaceId, kind: { not: "COMPONENT" }, OR: [{ apiId: type }, { pluralApiId: type }] },
        });
        if (!ct) throw new NotFoundException(`Unknown content type "${type}".`);
        return ct;
    }

    /** All deliverable content types in a workspace (for building the typed GraphQL
     *  schema). Excludes reusable components. */
    async allTypes(workspaceId: string): Promise<ContentType[]> {
        return this.prisma.contentType.findMany({ where: { workspaceId, kind: { not: "COMPONENT" } }, orderBy: { apiId: "asc" } });
    }

    private shape(e: ContentEntry, fields?: string[]) {
        const data = (e.data ?? {}) as Record<string, unknown>;
        const projected =
            fields && fields.length ? Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])) : data;
        const base: Record<string, unknown> = {
            id: e.id,
            slug: e.slug,
            locale: e.locale,
            publishedAt: e.publishedAt,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            ...projected,
        };
        // AEO: attach schema.org JSON-LD derived from component/section structured
        // data (merged with any manually-set data.jsonLd). Skipped when projecting a
        // field subset, and short-circuited unless the entry actually has sections.
        if (!fields || !fields.length) {
            const hasSections = Object.values(data).some((v) => Array.isArray(v) && v.some((x) => x && typeof x === "object" && "__component" in (x as object)));
            const manual = Array.isArray(data.jsonLd) ? (data.jsonLd as Record<string, unknown>[]) : data.jsonLd && typeof data.jsonLd === "object" ? [data.jsonLd as Record<string, unknown>] : [];
            const derived = hasSections ? buildJsonLd(entryToCanonicalContent({ id: e.id, slug: e.slug, data }).structuredDataSpecs) : [];
            const jsonLd = [...manual, ...derived];
            if (jsonLd.length) base.jsonLd = jsonLd;
        }
        // Make relative "/media/..." refs absolute so they load from the CMS on any
        // frontend domain (not the consuming site's own origin).
        return MEDIA_BASE ? (absolutizeMedia(base) as Record<string, unknown>) : base;
    }

    /** Fetch + shape entries by id, keyed by id, each tagged with its content type
     *  (`__type`) so polymorphic relation targets can be told apart. Shaped shallowly:
     *  their own relations are NOT expanded, so a relation cycle can't recurse. */
    private async shapedByIds(workspaceId: string, ids: string[], preview?: boolean): Promise<Map<string, Record<string, unknown>>> {
        if (!ids.length) return new Map();
        const rows = await this.prisma.contentEntry.findMany({
            where: { workspaceId, id: { in: ids }, ...(preview ? {} : { status: "PUBLISHED" }) },
            include: { contentType: { select: { apiId: true } } },
        });
        return new Map(
            rows.map((e) => {
                const shaped = this.shape(e);
                shaped.__type = e.contentType.apiId;
                return [e.id, shaped] as const;
            }),
        );
    }

    /** Map of reusable-component apiId → its field defs, for resolving relation fields
     *  nested inside components / dynamic zones. */
    private async componentFieldMap(workspaceId: string): Promise<Map<string, SchemaField[]>> {
        const comps = await this.prisma.contentType.findMany({ where: { workspaceId, kind: "COMPONENT" }, select: { apiId: true, schema: true } });
        return new Map(comps.map((c) => [c.apiId, fieldsOf(c.schema)] as const));
    }

    /** Walk a field set against a data object, recursing into components / dynamic
     *  zones, and for every forward Reference field either collect its ids (mode
     *  "collect") or replace them with the shaped entries (mode "replace"). Covers
     *  relations at any depth, so component relations populate like top-level ones. */
    private walkForwardRefs(
        fields: SchemaField[],
        data: Record<string, unknown>,
        components: Map<string, SchemaField[]>,
        mode: "collect" | "replace",
        ids: Set<string>,
        byId: Map<string, Record<string, unknown>>,
    ): void {
        for (const f of fields) {
            if (f.type === "Reference" && !f.mappedByField && (f.referencedTypeId || f.referencedTypeIds?.length)) {
                if (!(f.name in data)) continue;
                if (mode === "collect") {
                    for (const id of refIds(data[f.name])) ids.add(id);
                } else if (f.multiple) {
                    data[f.name] = refIds(data[f.name])
                        .map((id) => byId.get(id))
                        .filter((e): e is Record<string, unknown> => !!e);
                } else {
                    const id = typeof data[f.name] === "string" ? (data[f.name] as string) : null;
                    data[f.name] = id ? (byId.get(id) ?? null) : null;
                }
            } else if (f.type === "Component") {
                const sub = f.componentApiId ? (components.get(f.componentApiId) ?? []) : (f.fields ?? []);
                const v = data[f.name];
                if (f.repeatable && Array.isArray(v)) {
                    for (const it of v) if (it && typeof it === "object" && !Array.isArray(it)) this.walkForwardRefs(sub, it as Record<string, unknown>, components, mode, ids, byId);
                } else if (v && typeof v === "object" && !Array.isArray(v)) {
                    this.walkForwardRefs(sub, v as Record<string, unknown>, components, mode, ids, byId);
                }
            } else if (f.type === "DynamicZone" && Array.isArray(data[f.name])) {
                for (const it of data[f.name] as unknown[]) {
                    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
                    const comp = (it as Record<string, unknown>).__component;
                    const sub = typeof comp === "string" ? components.get(comp) : undefined;
                    if (sub) this.walkForwardRefs(sub, it as Record<string, unknown>, components, mode, ids, byId);
                }
            }
        }
    }

    /**
     * Expand Reference (relation) fields in place, both directions:
     *  - Forward: the stored entry id(s) become the full referenced entries
     *    (single → object|null, multiple → array), at any depth — including relations
     *    nested inside components and dynamic zones.
     *  - Reverse (mappedByField): the field is filled from the join table with the
     *    entries whose forward field points at this entry ("posts by this author").
     *    Reverse fields are top-level only (components hold one-way relations).
     * Everything resolves to published entries only (or any status under a preview
     * token), and missing/unpublished refs are dropped.
     */
    private async populateRefs(ct: ContentType, items: Record<string, unknown>[], opts: QueryOpts): Promise<void> {
        if (!items.length) return;
        const schemaFields = fieldsOf(ct.schema);
        const refFields = schemaFields.filter((f) => f.type === "Reference");
        const hasNesting = schemaFields.some((f) => f.type === "Component" || f.type === "DynamicZone");
        const reverse = (opts.fields?.length ? refFields.filter((f) => opts.fields!.includes(f.name)) : refFields).filter((f) => f.mappedByField && f.referencedTypeId);
        const hasForward = refFields.some((f) => !f.mappedByField && (f.referencedTypeId || f.referencedTypeIds?.length)) || hasNesting;
        if (!hasForward && !reverse.length) return;

        // ── Forward: ids stored in the entry data, at any depth ─────────────────────
        if (hasForward) {
            const components = hasNesting ? await this.componentFieldMap(ct.workspaceId) : new Map<string, SchemaField[]>();
            const ids = new Set<string>();
            const empty = new Map<string, Record<string, unknown>>();
            for (const item of items) this.walkForwardRefs(schemaFields, item, components, "collect", ids, empty);
            const byId = await this.shapedByIds(ct.workspaceId, [...ids], opts.preview);
            for (const item of items) this.walkForwardRefs(schemaFields, item, components, "replace", new Set(), byId);
        }

        // ── Reverse: derived from the join table (entries that link here) ───────────
        if (reverse.length) {
            const entryIds = items.map((it) => it.id).filter((x): x is string => typeof x === "string");
            for (const f of reverse) {
                const rels = await this.prisma.entryRelation.findMany({
                    where: { workspaceId: ct.workspaceId, toId: { in: entryIds }, fromTypeId: f.referencedTypeId, fromField: f.mappedByField },
                    orderBy: { order: "asc" },
                });
                const byTo = new Map<string, string[]>();
                for (const r of rels) {
                    const arr = byTo.get(r.toId) ?? [];
                    arr.push(r.fromId);
                    byTo.set(r.toId, arr);
                }
                const byId = await this.shapedByIds(ct.workspaceId, [...new Set(rels.map((r) => r.fromId))], opts.preview);
                for (const item of items) {
                    const linked = (byTo.get(item.id as string) ?? [])
                        .map((id) => byId.get(id))
                        .filter((e): e is Record<string, unknown> => !!e);
                    item[f.name] = f.multiple ? linked : (linked[0] ?? null);
                }
            }
        }
    }

    private where(ct: ContentType, opts: QueryOpts): Prisma.ContentEntryWhereInput {
        const AND: Prisma.ContentEntryWhereInput[] = [];
        if (opts.locale) AND.push({ locale: opts.locale });
        for (const [k, v] of Object.entries(opts.filters ?? {})) {
            if (k === "slug") AND.push({ slug: String(v) });
            else AND.push({ data: { path: [k], equals: coerce(String(v)) } });
        }
        return {
            workspaceId: ct.workspaceId,
            contentTypeId: ct.id,
            ...(opts.preview ? {} : { status: "PUBLISHED" }),
            ...(AND.length ? { AND } : {}),
        };
    }

    private orderBy(sort?: string): Prisma.ContentEntryOrderByWithRelationInput {
        if (sort) {
            const [field, dir] = sort.split(":");
            if (SORTABLE.has(field)) return { [field]: dir === "asc" ? "asc" : "desc" };
        }
        return { publishedAt: "desc" };
    }

    async listForType(ct: ContentType, opts: QueryOpts) {
        const take = Math.min(Math.max(opts.limit ?? 25, 1), 100);
        const skip = Math.max(opts.offset ?? 0, 0);
        const where = this.where(ct, opts);
        const [rows, total] = await Promise.all([
            this.prisma.contentEntry.findMany({ where, orderBy: this.orderBy(opts.sort), take, skip }),
            this.prisma.contentEntry.count({ where }),
        ]);
        const data = rows.map((e) => this.shape(e, opts.fields));
        await this.populateRefs(ct, data, opts);
        return { data, meta: { total, limit: take, offset: skip } };
    }

    async oneForType(ct: ContentType, idOrSlug: string, opts: QueryOpts) {
        const entry = await this.prisma.contentEntry.findFirst({
            where: { ...this.where(ct, { ...opts, filters: {} }), OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
        });
        if (!entry) throw new NotFoundException("Not found.");
        const data = this.shape(entry, opts.fields);
        await this.populateRefs(ct, [data], opts);
        return { data };
    }

    async singleForType(ct: ContentType, opts: QueryOpts) {
        const entry = await this.prisma.contentEntry.findFirst({
            where: this.where(ct, { ...opts, filters: {} }),
            orderBy: this.orderBy(opts.sort),
        });
        const data = entry ? this.shape(entry, opts.fields) : null;
        if (data) await this.populateRefs(ct, [data], opts);
        return { data };
    }

    /** REST entry point: resolves the type and dispatches collection vs single. */
    async list(workspaceId: string, type: string, opts: QueryOpts) {
        const ct = await this.resolveType(workspaceId, type);
        if (ct.kind === "SINGLE") return this.singleForType(ct, opts);
        return this.listForType(ct, opts);
    }

    async one(workspaceId: string, type: string, idOrSlug: string, opts: QueryOpts) {
        const ct = await this.resolveType(workspaceId, type);
        if (ct.kind === "SINGLE") return this.singleForType(ct, opts);
        return this.oneForType(ct, idOrSlug, opts);
    }
}
