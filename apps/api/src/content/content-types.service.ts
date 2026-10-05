import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ContentType } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";
import { CreateContentTypeDto, UpdateContentTypeDto } from "./dto";
import { isHomeType, isPageType, routePrefixForType } from "./route-path";
import { pluralize } from "./pluralize";
import { normalizeSchemaFields, toCamelCase, toLowerId, buildEntryKeyRemap } from "./naming";
import { migrateRepeatable, repeatableFlipped } from "./component-shape";
import type { SchemaField } from "./entry-validation";

@Injectable()
export class ContentTypesService {
    constructor(
        private readonly prisma: PrismaService,
        @Optional() private readonly cache?: CacheService,
    ) {}

    /** A type switched to "not pages": its entries leave the SEO audit now, not at
     *  the end of the next run. */
    private async dropAuditRows(workspaceId: string, typeId: string) {
        await this.prisma.$executeRaw`DELETE FROM "PageAudit" WHERE "workspaceId" = ${workspaceId} AND "task" = 'page' AND "entryId" IN (SELECT "id" FROM "ContentEntry" WHERE "contentTypeId" = ${typeId})`;
        await this.cache?.del(`seo:issues:${workspaceId}`);
    }

    private readonly logger = new Logger(ContentTypesService.name);

    /** Machine API IDs, bounded to 40 chars. Components and field keys are camelCase
     *  (e.g. "heroSection"); content types stay lowercase because they double as
     *  public URL slugs (site.com/<pluralApiId>/…). */
    private slug(name: string, kind?: string) {
        const coerce = kind === "COMPONENT" ? toCamelCase : toLowerId;
        return coerce(name).slice(0, 40) || "type";
    }

    private async uniqueApiId(workspaceId: string, base: string) {
        let apiId = base;
        let n = 2;
        while (
            await this.prisma.contentType.findUnique({
                where: { workspaceId_apiId: { workspaceId, apiId } },
            })
        ) {
            apiId = `${base}${n++}`;
        }
        return apiId;
    }

    /** Flatten the stored schema JSON into the shape the Schema Builder UI uses. */
    private shape(t: ContentType & { _count?: { entries: number } }) {
        const s = (t.schema ?? {}) as {
            icon?: string;
            color?: string;
            jsonLd?: string;
            pageType?: string;
            previewUrl?: string;
            routePattern?: string;
            slugPattern?: string;
            freeFormBody?: boolean;
            fields?: unknown[];
        };
        // Page type drives routing/kind/JSON-LD. Legacy types (no stored pageType)
        // surface a sensible default so the builder dropdown always has a value:
        // home-named types read as "home", everything else as a prefixed "blog".
        const pageType = s.pageType ?? (isHomeType(t) ? "home" : "blog");
        return {
            id: t.id,
            name: t.name,
            apiId: t.apiId,
            pluralApiId: t.pluralApiId,
            kind: t.kind,
            draftAndPublish: t.draftAndPublish,
            icon: s.icon ?? "document",
            color: s.color ?? "#6C5CE7",
            jsonLd: s.jsonLd ?? "Article",
            pageType,
            // Per-type fallback live-preview URL (empty/unset → null).
            previewUrl: s.previewUrl ?? null,
            // Custom URL template for a "reference" page type (e.g. "/blogs/tags/{slug}").
            routePattern: s.routePattern ?? null,
            // How entry slugs are built, e.g. "{service.slug}-{city.slug}". When set, the
            // slug is derived on every save instead of typed.
            slugPattern: s.slugPattern ?? null,
            // Free-form page: the editor shows the Body editor even with no body field.
            freeFormBody: s.freeFormBody === true,
            // Whether entries of this type are pages on the public site (SEO audit, crawl,
            // "View live"). Defaults on, except reference types with no URL pattern.
            isPage: isPageType(t),
            // True once someone set the flag by hand. Until then it follows the default,
            // so adding a URL pattern to a reference type turns it on.
            isPageSet: typeof (s as { isPage?: unknown }).isPage === "boolean",
            // Pages of this type are kept out of search on purpose; the SEO audit then
            // does not warn about their noindex.
            noindexIntended: (s as { noindexIntended?: unknown }).noindexIntended === true,
            fields: s.fields ?? [],
            entryCount: t._count?.entries ?? 0,
            // Public-site routing derived from the API id: entries live at
            // /<urlPrefix>/<slug> (e.g. /services/<slug>), or the site root when the
            // type is a homepage (urlPrefix empty + isHome). Drives live preview.
            urlPrefix: routePrefixForType(t),
            isHome: isHomeType(t),
        };
    }

    /** Entry-facing content types (collections + singles). Reusable components
     *  (kind=COMPONENT) are excluded here so they never appear as a content type you
     *  can author entries of, or as a queryable delivery collection. */
    async list(workspaceId: string) {
        const rows = await this.prisma.contentType.findMany({
            where: { workspaceId, kind: { not: "COMPONENT" } },
            include: { _count: { select: { entries: true } } },
            orderBy: { createdAt: "asc" },
        });
        return rows.map((r) => this.shape(r));
    }

    /** Reusable components (kind=COMPONENT) for the component library + pickers.
     *  Ensures the built-in starter blocks exist first so the editor always has
     *  something to add. */
    async listComponents(workspaceId: string) {
        await this.ensureBuiltinComponents(workspaceId);
        const rows = await this.prisma.contentType.findMany({
            where: { workspaceId, kind: "COMPONENT" },
            include: { _count: { select: { entries: true } } },
            orderBy: { createdAt: "asc" },
        });
        return rows.map((r) => this.shape(r));
    }

    /** Starter component blocks every workspace gets. `rich_text` is the "Main
     *  Content" block the legacy body maps to. Idempotent (created only if missing,
     *  keyed by apiId), so user edits/additions are never clobbered. */
    private static readonly BUILTIN_COMPONENTS: { apiId: string; name: string; icon: string; fields: { name: string; type: string; required?: boolean }[] }[] = [
        { apiId: "rich_text", name: "Main Content", icon: "document", fields: [{ name: "Body", type: "Rich text", required: true }] },
        { apiId: "hero", name: "Hero", icon: "star", fields: [
            { name: "Title", type: "Text", required: true }, { name: "Subtitle", type: "Text" }, { name: "Cover image", type: "Media" },
            { name: "Primary CTA label", type: "Text" }, { name: "Primary CTA URL", type: "URL" }, { name: "Open in new tab", type: "Boolean" },
        ] },
        { apiId: "image", name: "Image", icon: "image", fields: [{ name: "Image", type: "Media", required: true }, { name: "Alt text", type: "Text" }, { name: "Caption", type: "Text" }] },
        { apiId: "quote", name: "Quote", icon: "quote", fields: [{ name: "Quote", type: "Rich text", required: true }, { name: "Attribution", type: "Text" }] },
        { apiId: "testimonial", name: "Testimonial", icon: "chat", fields: [
            { name: "Quote", type: "Rich text", required: true }, { name: "Author", type: "Text" }, { name: "Role", type: "Text" }, { name: "Avatar", type: "Media" }, { name: "Rating", type: "Number" },
        ] },
        { apiId: "cta", name: "Call to action", icon: "chart", fields: [{ name: "Heading", type: "Text" }, { name: "Button label", type: "Text" }, { name: "Button URL", type: "URL" }] },
        { apiId: "faq", name: "FAQ item", icon: "help", fields: [{ name: "Question", type: "Text", required: true }, { name: "Answer", type: "Rich text" }] },
    ];

    async ensureBuiltinComponents(workspaceId: string) {
        const existing = await this.prisma.contentType.findMany({ where: { workspaceId, kind: "COMPONENT" }, select: { apiId: true } });
        const have = new Set(existing.map((e) => e.apiId));
        const missing = ContentTypesService.BUILTIN_COMPONENTS.filter((c) => !have.has(c.apiId));
        if (!missing.length) return;
        await this.prisma.contentType.createMany({
            data: missing.map((c) => ({
                workspaceId,
                name: c.name,
                apiId: c.apiId,
                pluralApiId: pluralize(c.apiId),
                kind: "COMPONENT" as const,
                schema: { icon: c.icon, color: "#6C5CE7", jsonLd: "WebPage", fields: c.fields.map((f, i) => ({ id: `${c.apiId}_${i}`, name: f.name, type: f.type, required: !!f.required })) },
            })),
            skipDuplicates: true,
        });
    }

    /** Names of content types that reference a component apiId (via a Component
     *  field's componentApiId or a DynamicZone's allowedComponents). Used to lock a
     *  component's apiId / block deletion while it's in use. */
    private async componentReferences(workspaceId: string, apiId: string): Promise<string[]> {
        const types = await this.prisma.contentType.findMany({
            where: { workspaceId },
            select: { name: true, apiId: true, schema: true },
        });
        type F = { componentApiId?: string; allowedComponents?: string[]; fields?: F[] };
        const walk = (fields: F[] | undefined): boolean =>
            (fields ?? []).some(
                (f) => f?.componentApiId === apiId || (Array.isArray(f?.allowedComponents) && f.allowedComponents.includes(apiId)) || walk(f?.fields),
            );
        const refs: string[] = [];
        for (const t of types) {
            if (t.apiId === apiId) continue; // a component can't reference itself meaningfully
            if (walk(((t.schema as { fields?: F[] }) ?? {}).fields)) refs.push(t.name);
        }
        return refs;
    }

    /** Single vs collection follows the page type: a Home page is the site's single
     *  root entry; blog / service / static are collections. Reusable components are
     *  never routed, so they always stay COMPONENT. Returns the fallback when the
     *  schema carries no explicit page type (legacy types). */
    private kindForSchema(schema: unknown, fallback: "COLLECTION" | "SINGLE" | "COMPONENT"): "COLLECTION" | "SINGLE" | "COMPONENT" {
        if (fallback === "COMPONENT") return "COMPONENT";
        const pageType = schema && typeof schema === "object" ? (schema as { pageType?: unknown }).pageType : undefined;
        if (pageType === "home") return "SINGLE";
        if (typeof pageType === "string" && pageType) return "COLLECTION";
        return fallback;
    }

    async create(workspaceId: string, dto: CreateContentTypeDto) {
        // Respect a caller-supplied apiId (slugified + de-duplicated); otherwise
        // derive one from the display name.
        const base = this.slug(dto.apiId?.trim() || dto.name, dto.kind ?? "COLLECTION");
        const apiId = await this.uniqueApiId(workspaceId, base);
        // Field keys are coerced to unique camelCase machine names before storage.
        const schema = normalizeSchemaFields(dto.schema) as object;
        const t = await this.prisma.contentType.create({
            data: {
                workspaceId,
                name: dto.name,
                apiId,
                pluralApiId: pluralize(apiId),
                kind: this.kindForSchema(schema, dto.kind ?? "COLLECTION"),
                schema,
            },
        });
        return this.shape(t);
    }

    async update(workspaceId: string, id: string, dto: UpdateContentTypeDto) {
        const existing = await this.prisma.contentType.findFirst({
            where: { id, workspaceId },
            include: { _count: { select: { entries: true } } },
        });
        if (!existing) throw new NotFoundException("Content type not found.");
        const data: Record<string, unknown> = {};
        if (dto.name !== undefined) data.name = dto.name;
        // When field keys are renamed/camelCased, existing entries (keyed by the OLD
        // field names) must be remapped so their content stays aligned with the schema.
        let keyRemap: { remap: (d: unknown) => unknown; changed: boolean } = { remap: (d) => d, changed: false };
        if (dto.schema !== undefined) {
            const schema = normalizeSchemaFields(dto.schema) as object;
            data.schema = schema;
            const oldFields = ((existing.schema as { fields?: Parameters<typeof buildEntryKeyRemap>[0] }) ?? {}).fields;
            const newFields = (schema as { fields?: Parameters<typeof buildEntryKeyRemap>[1] }).fields;
            keyRemap = buildEntryKeyRemap(oldFields, newFields);
            // Keep kind in step with the page type (Home = single, others = collection).
            // Never reclassify a reusable component.
            if (existing.kind !== "COMPONENT") {
                const nextKind = this.kindForSchema(schema, existing.kind);
                if (nextKind !== existing.kind) data.kind = nextKind;
            }
        }
        if (dto.draftAndPublish !== undefined) data.draftAndPublish = dto.draftAndPublish;
        const stopsBeingPages = dto.schema !== undefined && isPageType(existing) && !isPageType({ ...existing, schema: data.schema });
        if (stopsBeingPages) await this.dropAuditRows(workspaceId, id);

        // Allow renaming the machine identifier only before any content exists —
        // changing it afterwards would break the delivery-API URLs of live entries.
        const wantsApiId = dto.apiId?.trim();
        if (wantsApiId) {
            const next = this.slug(wantsApiId, existing.kind);
            if (next !== existing.apiId) {
                if (existing._count.entries > 0) {
                    throw new BadRequestException("The API ID can't be changed once the type has content. Create a new type instead.");
                }
                if (existing.kind === "COMPONENT") {
                    const refs = await this.componentReferences(workspaceId, existing.apiId);
                    if (refs.length) throw new BadRequestException(`This component's API ID can't be changed while it's used by: ${refs.join(", ")}.`);
                }
                data.apiId = await this.uniqueApiId(workspaceId, next);
                data.pluralApiId = pluralize(data.apiId as string);
            }
        }

        // Field keys changed, or a component field switched between single and
        // repeatable: migrate this type's entries (data + draftData) in the same
        // transaction as the schema save, so neither can land without the other.
        // Reusable components have no entries of their own, so they skip this.
        const oldF = ((existing.schema as { fields?: SchemaField[] }) ?? {}).fields;
        const newF = dto.schema !== undefined ? (data.schema as { fields?: SchemaField[] }).fields : undefined;
        const shapeChanged = !!newF && repeatableFlipped(oldF, newF);
        if ((keyRemap.changed || shapeChanged) && existing.kind !== "COMPONENT") {
            const entries = await this.prisma.contentEntry.findMany({
                where: { workspaceId, contentTypeId: id },
                select: { id: true, title: true, data: true, draftData: true },
            });
            // Blocks would be dropped: refuse until the caller has seen which entries
            // lose what and said so (the studio asks; the dropped blocks stay in each
            // entry's version history).
            if (shapeChanged && !dto.acknowledgeDataLoss) {
                const affected = entries.flatMap((e) =>
                    [e.data, e.draftData]
                        .filter((d) => d != null)
                        .flatMap((d) => migrateRepeatable(oldF, newF, d).losses)
                        .filter((l, i, all) => all.findIndex((x) => x.field === l.field) === i)
                        .map((l) => ({ id: e.id, title: e.title || "Untitled", field: l.field, blocks: l.blocks })),
                );
                if (affected.length) {
                    throw new ConflictException({
                        code: "DATA_LOSS",
                        message: `${affected.length} entr${affected.length === 1 ? "y has" : "ies have"} more than one block in a field that is becoming single. Only the first block would be kept.`,
                        affected,
                    });
                }
            }
            const warnings: string[] = [];
            const migrate = (d: unknown) => {
                const r = migrateRepeatable(oldF, newF, keyRemap.remap(d));
                warnings.push(...r.warnings);
                return r.data as object;
            };
            await this.prisma.$transaction([
                this.prisma.contentType.update({ where: { id }, data }),
                ...entries.map((e) =>
                    this.prisma.contentEntry.update({
                        where: { id: e.id },
                        data: {
                            data: migrate(e.data),
                            ...(e.draftData != null ? { draftData: migrate(e.draftData) } : {}),
                        },
                    }),
                ),
            ]);
            if (warnings.length) this.logger.warn(`Schema change on ${existing.apiId} trimmed repeatable blocks: ${warnings.slice(0, 5).join(" | ")}${warnings.length > 5 ? ` (+${warnings.length - 5} more)` : ""}`);
            return { ...this.shape(await this.prisma.contentType.findUniqueOrThrow({ where: { id } })), ...(warnings.length ? { warnings } : {}) };
        }

        const t = await this.prisma.contentType.update({ where: { id }, data });
        return this.shape(t);
    }

    async remove(workspaceId: string, id: string) {
        const existing = await this.prisma.contentType.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Content type not found.");
        if (existing.kind === "COMPONENT") {
            const refs = await this.componentReferences(workspaceId, existing.apiId);
            if (refs.length) throw new BadRequestException(`This component is used by: ${refs.join(", ")}. Remove it from those types first.`);
        }
        await this.prisma.contentType.delete({ where: { id } });
        return { ok: true };
    }
}
