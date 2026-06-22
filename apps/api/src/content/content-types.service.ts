import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentType } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContentTypeDto, UpdateContentTypeDto } from "./dto";
import { isHomeType, routePrefixForType } from "./route-path";
import { pluralize } from "./pluralize";
import { normalizeSchemaFields, toCamelCase, toLowerId } from "./naming";

@Injectable()
export class ContentTypesService {
    constructor(private readonly prisma: PrismaService) {}

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
        if (dto.schema !== undefined) {
            const schema = normalizeSchemaFields(dto.schema) as object;
            data.schema = schema;
            // Keep kind in step with the page type (Home = single, others = collection).
            // Never reclassify a reusable component.
            if (existing.kind !== "COMPONENT") {
                const nextKind = this.kindForSchema(schema, existing.kind);
                if (nextKind !== existing.kind) data.kind = nextKind;
            }
        }
        if (dto.draftAndPublish !== undefined) data.draftAndPublish = dto.draftAndPublish;

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
