import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentType } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContentTypeDto, UpdateContentTypeDto } from "./dto";
import { isHomeType, routePrefixForType } from "./route-path";

@Injectable()
export class ContentTypesService {
    constructor(private readonly prisma: PrismaService) {}

    private slug(name: string) {
        return (
            name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 40) || "type"
        );
    }

    private async uniqueApiId(workspaceId: string, base: string) {
        let apiId = base;
        let n = 1;
        while (
            await this.prisma.contentType.findUnique({
                where: { workspaceId_apiId: { workspaceId, apiId } },
            })
        ) {
            apiId = `${base}_${n++}`;
        }
        return apiId;
    }

    /** Flatten the stored schema JSON into the shape the Schema Builder UI uses. */
    private shape(t: ContentType & { _count?: { entries: number } }) {
        const s = (t.schema ?? {}) as {
            icon?: string;
            color?: string;
            jsonLd?: string;
            fields?: unknown[];
        };
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
                pluralApiId: `${c.apiId}s`,
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

    async create(workspaceId: string, dto: CreateContentTypeDto) {
        // Respect a caller-supplied apiId (slugified + de-duplicated); otherwise
        // derive one from the display name.
        const base = this.slug(dto.apiId?.trim() || dto.name);
        const apiId = await this.uniqueApiId(workspaceId, base);
        const t = await this.prisma.contentType.create({
            data: {
                workspaceId,
                name: dto.name,
                apiId,
                pluralApiId: `${apiId}s`,
                kind: dto.kind ?? "COLLECTION",
                schema: dto.schema as object,
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
        if (dto.schema !== undefined) data.schema = dto.schema as object;
        if (dto.draftAndPublish !== undefined) data.draftAndPublish = dto.draftAndPublish;

        // Allow renaming the machine identifier only before any content exists —
        // changing it afterwards would break the delivery-API URLs of live entries.
        const wantsApiId = dto.apiId?.trim();
        if (wantsApiId) {
            const next = this.slug(wantsApiId);
            if (next !== existing.apiId) {
                if (existing._count.entries > 0) {
                    throw new BadRequestException("The API ID can't be changed once the type has content. Create a new type instead.");
                }
                if (existing.kind === "COMPONENT") {
                    const refs = await this.componentReferences(workspaceId, existing.apiId);
                    if (refs.length) throw new BadRequestException(`This component's API ID can't be changed while it's used by: ${refs.join(", ")}.`);
                }
                data.apiId = await this.uniqueApiId(workspaceId, next);
                data.pluralApiId = `${data.apiId as string}s`;
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
