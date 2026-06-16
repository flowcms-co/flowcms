import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ContentStatus } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { safeFetch } from "../common/ssrf";

/** A normalized item ready to become a ContentEntry. */
type ImportItem = {
    title: string;
    slug: string | null;
    body: string;
    status: ContentStatus;
    locale: string;
    publishedAt: Date | null;
    data: Record<string, unknown>;
};
/** A field definition for the Schema Builder, inferred from imported data. */
type InferredField = {
    id: string;
    name: string;
    type: "Text" | "Rich text" | "Number" | "Boolean" | "Date" | "Media" | "URL" | "Slug" | "Component";
    required: boolean;
    repeatable?: boolean;
    fields?: InferredField[];
};

// A string that points at an uploaded asset / image / file, so the field is
// modeled as Media (e.g. "/assets/images/hero.webp", "https://cdn/x.jpg").
const MEDIA_RE = /(\.(png|jpe?g|webp|gif|svg|avif|ico|bmp|mp4|webm|mov|mp3|wav|pdf|docx?|zip)(\?.*)?$)|^\/?(assets|images|img|uploads|media)\//i;
/** Items grouped by the content type they'll import into, with an optional
 *  inferred field schema (set by the JSON/CSV importers). */
type Group = { apiId: string; name: string; items: ImportItem[]; fields?: InferredField[] };

export type ImportSource = {
    kind: "wordpress" | "strapi" | "markdown" | "csv" | "json" | "contentful" | "sanity";
    url?: string;
    token?: string;
    types?: string[]; // strapi: which collection types to pull
    text?: string; // csv / json raw text
    files?: { name: string; content: string }[]; // markdown
    typeApiId?: string; // target type for markdown/csv/json (default "article")
    typeName?: string;
    locale?: string;
    // Contentful
    space?: string;
    environment?: string; // default "master"
    // Sanity
    project?: string;
    dataset?: string; // default "production"
    apiVersion?: string; // default "2023-10-01"
    // shared: restrict to one source content type / document _type
    docType?: string;
};

/** Flatten a Contentful Rich Text document or Sanity Portable Text array to plain text. */
function richTextToPlain(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "string") return v;
    // Contentful rich text: { nodeType, content: [...] }, leaf nodes have `value`.
    if (typeof v === "object" && v !== null && "content" in v) {
        const node = v as { value?: string; content?: unknown[] };
        const here = typeof node.value === "string" ? node.value : "";
        const kids = Array.isArray(node.content) ? node.content.map(richTextToPlain).join("") : "";
        return `${here}${kids}`;
    }
    // Sanity portable text: array of blocks, each { children: [{ text }] }.
    if (Array.isArray(v)) {
        return v
            .map((block) => {
                const b = block as { _type?: string; children?: { text?: string }[]; text?: string };
                if (Array.isArray(b.children)) return b.children.map((c) => c.text ?? "").join("");
                return typeof b.text === "string" ? b.text : "";
            })
            .filter(Boolean)
            .join("\n\n");
    }
    return "";
}

const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || null;
const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const decode = (s: string) =>
    (s ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8217;/g, "’").replace(/&#8211;/g, "–").replace(/&quot;/g, '"').replace(/&#039;/g, "'");

@Injectable()
export class ImportService {
    private readonly logger = new Logger(ImportService.name);
    constructor(private readonly prisma: PrismaService) {}

    private async fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
        // SSRF-guarded; sites legitimately redirect (http→https, canonical host),
        // so follow up to 3 hops — each one re-validated against private ranges.
        const res = await safeFetch(url, { headers }, { timeoutMs: 20_000, maxRedirects: 3 });
        if (!res.ok) throw new BadRequestException(`Source returned HTTP ${res.status} for ${url}`);
        return res.json();
    }

    // ── Adapters: each returns normalized groups ──────────────────────────────

    private async fromWordPress(src: ImportSource): Promise<Group[]> {
        if (!src.url) throw new BadRequestException("WordPress site URL is required.");
        const base = src.url.replace(/\/$/, "").replace(/\/wp-json.*$/, "");
        const locale = src.locale || "en";
        const pull = async (kind: "posts" | "pages"): Promise<ImportItem[]> => {
            const rows = (await this.fetchJson(`${base}/wp-json/wp/v2/${kind}?per_page=100&page=1`).catch(() => [])) as Array<{
                title?: { rendered?: string };
                slug?: string;
                content?: { rendered?: string };
                excerpt?: { rendered?: string };
                status?: string;
                date_gmt?: string;
            }>;
            return (Array.isArray(rows) ? rows : []).map((p) => ({
                title: decode(stripTags(p.title?.rendered ?? "")) || "Untitled",
                slug: p.slug ?? null,
                body: p.content?.rendered ?? "",
                status: p.status === "publish" ? "PUBLISHED" : "DRAFT",
                locale,
                publishedAt: p.status === "publish" && p.date_gmt ? new Date(p.date_gmt + "Z") : null,
                data: { body: p.content?.rendered ?? "", excerpt: decode(stripTags(p.excerpt?.rendered ?? "")) },
            }));
        };
        const [posts, pages] = await Promise.all([pull("posts"), pull("pages")]);
        const groups: Group[] = [];
        if (posts.length) groups.push({ apiId: "article", name: "Blog Post", items: posts });
        if (pages.length) groups.push({ apiId: "page", name: "Page", items: pages });
        if (!groups.length) throw new BadRequestException("No posts or pages found at that WordPress REST API. Is it public?");
        return groups;
    }

    private async fromStrapi(src: ImportSource): Promise<Group[]> {
        if (!src.url) throw new BadRequestException("Strapi URL is required.");
        const types = (src.types ?? []).filter(Boolean);
        if (!types.length) throw new BadRequestException("List at least one Strapi collection type (e.g. articles).");
        const base = src.url.replace(/\/$/, "");
        const headers = src.token ? { Authorization: `Bearer ${src.token}` } : undefined;
        const locale = src.locale || "en";
        const groups: Group[] = [];
        for (const type of types) {
            const res = (await this.fetchJson(`${base}/api/${type}?pagination[pageSize]=100`, headers)) as {
                data?: Array<{ id: number; attributes?: Record<string, unknown> }>;
            };
            const rows = res.data ?? [];
            const items: ImportItem[] = rows.map((r) => {
                const a = (r.attributes ?? {}) as Record<string, unknown>;
                const title = String(a.title ?? a.name ?? a.heading ?? "Untitled");
                const body = String(a.content ?? a.body ?? a.text ?? "");
                return {
                    title,
                    slug: (a.slug as string) ?? slugify(title),
                    body,
                    status: a.publishedAt ? "PUBLISHED" : "DRAFT",
                    locale: (a.locale as string) || locale,
                    publishedAt: a.publishedAt ? new Date(a.publishedAt as string) : null,
                    data: { ...a, body },
                };
            });
            const apiId = type.replace(/s$/, "");
            groups.push({ apiId, name: apiId.charAt(0).toUpperCase() + apiId.slice(1), items });
        }
        return groups;
    }

    private parseFrontMatter(content: string): { fm: Record<string, string>; body: string } {
        const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (!m) return { fm: {}, body: content };
        const fm: Record<string, string> = {};
        for (const line of m[1].split("\n")) {
            const i = line.indexOf(":");
            if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        }
        return { fm, body: m[2] };
    }

    private fromMarkdown(src: ImportSource): Group[] {
        const files = src.files ?? [];
        if (!files.length) throw new BadRequestException("Upload at least one Markdown file.");
        const locale = src.locale || "en";
        const items: ImportItem[] = files.map((f) => {
            const { fm, body } = this.parseFrontMatter(f.content);
            const title = fm.title || f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
            const draft = fm.draft === "true" || fm.published === "false";
            return {
                title,
                slug: fm.slug || slugify(title),
                body,
                status: draft ? "DRAFT" : "PUBLISHED",
                locale,
                publishedAt: !draft && fm.date ? new Date(fm.date) : null,
                data: { body, ...fm },
            };
        });
        return [{ apiId: src.typeApiId || "article", name: src.typeName || "Blog Post", items }];
    }

    private parseCsv(text: string): Record<string, string>[] {
        const rows: string[][] = [];
        let cur: string[] = [], field = "", q = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (q) {
                if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
                else if (c === '"') q = false;
                else field += c;
            } else if (c === '"') q = true;
            else if (c === ",") { cur.push(field); field = ""; }
            else if (c === "\n" || c === "\r") {
                if (field !== "" || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
                if (c === "\r" && text[i + 1] === "\n") i++;
            } else field += c;
        }
        if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
        const header = rows.shift();
        if (!header) return [];
        return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
    }

    private rowsToItems(rows: Record<string, unknown>[], locale: string): ImportItem[] {
        const pick = (o: Record<string, unknown>, keys: string[]) => {
            for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return String(o[k] ?? "");
            return "";
        };
        return rows.map((o) => {
            const title = pick(o, ["title", "name", "heading"]) || "Untitled";
            const body = pick(o, ["body", "content", "text", "description"]);
            const slug = pick(o, ["slug", "permalink"]) || slugify(title);
            const status = /^(publish|published|live|true)$/i.test(pick(o, ["status", "published"])) ? "PUBLISHED" : "DRAFT";
            const dateStr = pick(o, ["date", "publishedat", "published_at", "created"]);
            return {
                title,
                slug,
                body,
                status: status as ContentStatus,
                locale,
                publishedAt: status === "PUBLISHED" && dateStr && !Number.isNaN(Date.parse(dateStr)) ? new Date(dateStr) : null,
                // Keep the source object's exact shape (no injected `body` key) so the
                // public API can round-trip the same JSON the site already consumes.
                data: { ...o },
            };
        });
    }

    // ── Schema inference (JSON/CSV) ───────────────────────────────────────────
    // Walks the imported rows and models a real field schema: nested objects →
    // Components, arrays-of-objects → repeatable Components, primitives → typed
    // fields. Without this the importer would collapse every shape to a fixed
    // Title/Slug/Body type and bury the rest in an invisible data blob.

    /** Cap component nesting so the inferred schema stays renderable in the
     *  Schema Builder; structure deeper than this is kept in the entry data but
     *  modeled as a plain Text field. */
    private static readonly MAX_INFER_DEPTH = 3;

    private inferField(value: unknown, key: string, depth: number, nextId: () => string): InferredField {
        const id = nextId();
        const base = { id, name: key, required: false };
        const k = key.trim();
        if (/^(slug|permalink)$/i.test(k)) return { ...base, type: "Slug" };
        if (typeof value === "number") return { ...base, type: "Number" };
        if (typeof value === "boolean") return { ...base, type: "Boolean" };
        if (Array.isArray(value)) {
            const objs = value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v));
            if (objs.length && depth < ImportService.MAX_INFER_DEPTH) {
                return { ...base, type: "Component", repeatable: true, fields: this.inferObjectFields(objs, depth + 1, nextId) };
            }
            return { ...base, type: "Text" }; // array of primitives / empty / too deep
        }
        if (value && typeof value === "object") {
            if (depth < ImportService.MAX_INFER_DEPTH) {
                return { ...base, type: "Component", repeatable: false, fields: this.inferObjectFields([value as Record<string, unknown>], depth + 1, nextId) };
            }
            return { ...base, type: "Text" };
        }
        // Strings: type by key + value shape so the model is editable (image picker
        // for media, rich editor for prose, date picker for dates) instead of all Text.
        const s = typeof value === "string" ? value.trim() : "";
        if (MEDIA_RE.test(s) || /(image|photo|avatar|logo|icon|cover|thumbnail|banner)$/i.test(k)) return { ...base, type: "Media" };
        if (/(^|_)(url|link|href)$/i.test(k) || /^https?:\/\//i.test(s)) return { ...base, type: "URL" };
        if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s) && !Number.isNaN(Date.parse(s))) return { ...base, type: "Date" };
        if (/<[a-z][\s\S]*>/i.test(s) || s.length > 160) return { ...base, type: "Rich text" };
        return { ...base, type: "Text" }; // short scalar string / null / undefined
    }

    /** Merge keys across sample objects (some array items carry extra keys) and
     *  infer a field per key, using the first non-empty value seen to pick a type. */
    private inferObjectFields(objs: Record<string, unknown>[], depth: number, nextId: () => string): InferredField[] {
        const order: string[] = [];
        const sample = new Map<string, unknown>();
        for (const o of objs.slice(0, 50)) {
            if (!o || typeof o !== "object") continue;
            for (const k of Object.keys(o)) {
                if (!sample.has(k)) { order.push(k); sample.set(k, undefined); }
                const cur = sample.get(k);
                const v = o[k];
                if ((cur === undefined || cur === null || cur === "") && v !== undefined && v !== null && v !== "") sample.set(k, v);
            }
        }
        return order.map((k) => this.inferField(sample.get(k), k, depth, nextId));
    }

    private inferSchema(rows: Record<string, unknown>[]): InferredField[] {
        let n = 0;
        const nextId = () => `f${(n += 1)}`;
        const fields = this.inferObjectFields(rows, 0, nextId);
        return fields.length ? fields : [{ id: "f1", name: "Title", type: "Text", required: true }];
    }

    private fromTabular(src: ImportSource): Group[] {
        const locale = src.locale || "en";
        let rows: Record<string, unknown>[];
        if (src.kind === "csv") rows = this.parseCsv(src.text ?? "");
        else {
            // Surface bad JSON as a clean 400 rather than letting the SyntaxError
            // bubble to a generic 500 (SECURITY_AUDIT_REPORT F-10).
            let parsed: unknown;
            try {
                parsed = JSON.parse(src.text ?? "[]");
            } catch {
                throw new BadRequestException("Invalid JSON: could not parse the provided text.");
            }
            const p = parsed as { data?: unknown };
            rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : Array.isArray(p.data) ? (p.data as Record<string, unknown>[]) : [parsed as Record<string, unknown>];
        }
        if (!rows.length) throw new BadRequestException("No rows found to import.");
        return [{ apiId: src.typeApiId || "article", name: src.typeName || "Imported", items: this.rowsToItems(rows, locale), fields: this.inferSchema(rows) }];
    }

    /** Contentful — Content Delivery API (space + CDA token). Groups by content type. */
    private async fromContentful(src: ImportSource): Promise<Group[]> {
        if (!src.space || !src.token) throw new BadRequestException("Contentful Space ID and Content Delivery token are required.");
        const env = src.environment || "master";
        const locale = src.locale || "en";
        const base = `https://cdn.contentful.com/spaces/${encodeURIComponent(src.space)}/environments/${encodeURIComponent(env)}/entries`;
        const params = new URLSearchParams({ access_token: src.token, limit: "100" });
        if (src.docType) params.set("content_type", src.docType);
        const res = (await this.fetchJson(`${base}?${params}`)) as {
            items?: Array<{ sys?: { id?: string; createdAt?: string; contentType?: { sys?: { id?: string } } }; fields?: Record<string, unknown> }>;
        };
        const items = res.items ?? [];
        if (!items.length) throw new BadRequestException("No Contentful entries found (check the token, space and content type).");
        const byType = new Map<string, Group>();
        for (const it of items) {
            const f = it.fields ?? {};
            const ctId = it.sys?.contentType?.sys?.id || src.docType || "article";
            const title = String(f.title ?? f.name ?? f.heading ?? it.sys?.id ?? "Untitled");
            const slug = typeof f.slug === "string" ? slugify(f.slug) : slugify(title);
            const body = richTextToPlain(f.body ?? f.content ?? f.description ?? "");
            const item: ImportItem = {
                title: stripTags(decode(title)),
                slug,
                body: body ? `<p>${decode(body).replace(/\n+/g, "</p><p>")}</p>` : "",
                status: ContentStatus.PUBLISHED,
                locale,
                publishedAt: it.sys?.createdAt ? new Date(it.sys.createdAt) : new Date(),
                data: { contentfulId: it.sys?.id, contentType: ctId },
            };
            if (!byType.has(ctId)) byType.set(ctId, { apiId: slugify(ctId) || "article", name: ctId, items: [] });
            byType.get(ctId)!.items.push(item);
        }
        return [...byType.values()];
    }

    /** Sanity — GROQ over the query API (project + dataset, token for private). Groups by _type. */
    private async fromSanity(src: ImportSource): Promise<Group[]> {
        if (!src.project) throw new BadRequestException("Sanity Project ID is required.");
        const dataset = src.dataset || "production";
        const version = src.apiVersion || "2023-10-01";
        const locale = src.locale || "en";
        // Validate docType as a plain identifier before interpolating into GROQ —
        // an unsanitized value can break out of the filter (SECURITY_AUDIT_REPORT F-08).
        if (src.docType && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(src.docType)) {
            throw new BadRequestException("docType must be a valid Sanity document type name (letters, digits, underscores).");
        }
        const groq = src.docType
            ? `*[_type == "${src.docType}" && !(_id in path('drafts.**'))]`
            : `*[!(_id in path('drafts.**')) && (defined(title) || defined(name))]`;
        const url = `https://${encodeURIComponent(src.project)}.api.sanity.io/v${version}/data/query/${encodeURIComponent(dataset)}?query=${encodeURIComponent(groq)}`;
        const headers = src.token ? { Authorization: `Bearer ${src.token}` } : undefined;
        const res = (await this.fetchJson(url, headers)) as {
            result?: Array<Record<string, unknown> & { _id?: string; _type?: string; _createdAt?: string; slug?: { current?: string } | string }>;
        };
        const docs = res.result ?? [];
        if (!docs.length) throw new BadRequestException("No Sanity documents found (check project, dataset, token and type).");
        const byType = new Map<string, Group>();
        for (const d of docs) {
            const type = d._type || src.docType || "article";
            const title = String(d.title ?? d.name ?? d._id ?? "Untitled");
            const slugRaw = typeof d.slug === "object" && d.slug ? d.slug.current : (d.slug as string | undefined);
            const body = richTextToPlain(d.body ?? d.content ?? d.description ?? "");
            const item: ImportItem = {
                title: stripTags(decode(title)),
                slug: slugRaw ? slugify(slugRaw) : slugify(title),
                body: body ? `<p>${decode(body).replace(/\n+/g, "</p><p>")}</p>` : "",
                status: ContentStatus.PUBLISHED,
                locale,
                publishedAt: d._createdAt ? new Date(d._createdAt) : new Date(),
                data: { sanityId: d._id, _type: type },
            };
            if (!byType.has(type)) byType.set(type, { apiId: slugify(type) || "article", name: type, items: [] });
            byType.get(type)!.items.push(item);
        }
        return [...byType.values()];
    }

    private async collect(src: ImportSource): Promise<Group[]> {
        switch (src.kind) {
            case "wordpress": return this.fromWordPress(src);
            case "strapi": return this.fromStrapi(src);
            case "markdown": return this.fromMarkdown(src);
            case "csv":
            case "json": return this.fromTabular(src);
            case "contentful": return this.fromContentful(src);
            case "sanity": return this.fromSanity(src);
            default: throw new BadRequestException("Unknown import source.");
        }
    }

    /** Dry run — show what would be imported, no DB writes. */
    async preview(_workspaceId: string, src: ImportSource) {
        const groups = await this.collect(src);
        return {
            groups: groups.map((g) => ({
                targetType: g.apiId,
                targetName: g.name,
                count: g.items.length,
                sample: g.items.slice(0, 3).map((i) => ({ title: i.title, slug: i.slug, status: i.status })),
                // Inferred field model (JSON/CSV): name + type, components flagged.
                fields: g.fields?.map((f) => ({ name: f.name, type: f.type, repeatable: !!f.repeatable, fields: f.fields?.length ?? 0 })),
            })),
            total: groups.reduce((n, g) => n + g.items.length, 0),
        };
    }

    private async ensureType(workspaceId: string, apiId: string, name: string, fields?: InferredField[]) {
        const existing = await this.prisma.contentType.findUnique({ where: { workspaceId_apiId: { workspaceId, apiId } } });
        if (existing) return existing;
        // Use the schema inferred from the imported data when available (JSON/CSV);
        // otherwise fall back to a generic Title/Slug/Body type (WordPress, Strapi…).
        const schemaFields = fields?.length
            ? fields
            : [
                  { id: "f1", name: "Title", type: "Text", required: true },
                  { id: "f2", name: "Slug", type: "Slug", required: false },
                  { id: "f3", name: "Body", type: "Rich text", required: false },
              ];
        return this.prisma.contentType.create({
            data: {
                workspaceId,
                name,
                apiId,
                pluralApiId: `${apiId}s`,
                kind: "COLLECTION",
                schema: {
                    icon: "document",
                    color: "#6C5CE7",
                    jsonLd: "Article",
                    fields: schemaFields,
                },
            },
        });
    }

    /** Import for real. Idempotent: skips entries whose (type, slug, locale) already exists. */
    async run(workspaceId: string, userId: string, src: ImportSource) {
        const groups = await this.collect(src);
        let typesCreated = 0, imported = 0, skipped = 0;
        const errors: string[] = [];

        for (const g of groups) {
            const before = await this.prisma.contentType.findUnique({ where: { workspaceId_apiId: { workspaceId, apiId: g.apiId } } });
            const type = await this.ensureType(workspaceId, g.apiId, g.name, g.fields);
            if (!before) typesCreated++;

            for (const item of g.items) {
                try {
                    if (item.slug) {
                        const dup = await this.prisma.contentEntry.findFirst({
                            where: { workspaceId, contentTypeId: type.id, slug: item.slug, locale: item.locale },
                            select: { id: true },
                        });
                        if (dup) { skipped++; continue; }
                    }
                    await this.prisma.contentEntry.create({
                        data: {
                            workspaceId,
                            contentTypeId: type.id,
                            authorId: userId,
                            slug: item.slug,
                            locale: item.locale,
                            status: item.status,
                            publishedAt: item.status === "PUBLISHED" ? item.publishedAt ?? new Date() : null,
                            data: { ...item.data, title: item.title },
                        },
                    });
                    imported++;
                } catch (e) {
                    errors.push(`${item.title}: ${(e as Error).message}`);
                }
            }
        }
        this.logger.log(`Import: ${imported} imported, ${skipped} skipped, ${typesCreated} types created`);
        return { imported, skipped, typesCreated, errors: errors.slice(0, 20) };
    }
}
