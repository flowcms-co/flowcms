import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PageTemplate } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { ContentEntriesService } from "../content/content-entries.service";

type FieldDef = { id: string; name: string; type: string; required?: boolean };
export type UpsertTemplate = {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    typeApiId: string;
    typeName?: string;
    jsonLd?: string;
    fields?: FieldDef[];
    body?: string;
};

const T = (id: string, name: string, type: string, required = false): FieldDef => ({ id, name, type, required });

/** Starter presets seeded once per workspace so the gallery isn't empty. */
const DEFAULTS: UpsertTemplate[] = [
    {
        name: "Blog post",
        description: "A standard article: headline, intro, sections, and a wrap-up.",
        icon: "document",
        color: "#6C5CE7",
        typeApiId: "article",
        typeName: "Blog Post",
        jsonLd: "BlogPosting",
        fields: [T("f1", "Title", "Text", true), T("f2", "Slug", "Slug"), T("f3", "Body", "Rich text", true), T("f4", "Cover image", "Media")],
        body: "<h1>Your headline goes here</h1><p>Open with a hook: what will the reader learn, and why does it matter?</p><h2>First section</h2><p>Make your first point with a concrete example.</p><h2>Second section</h2><p>Build on it. Use short paragraphs and subheadings.</p><h2>Wrap up</h2><p>Summarize and end with a clear next step.</p>",
    },
    {
        name: "Landing page",
        description: "Hero, value props, and a call to action for a marketing page.",
        icon: "overview",
        color: "#3B82F6",
        typeApiId: "landing",
        typeName: "Landing Page",
        jsonLd: "WebPage",
        fields: [T("f1", "Title", "Text", true), T("f2", "Slug", "Slug"), T("f3", "Headline", "Text"), T("f4", "Sections", "Rich text")],
        body: "<h1>One-line promise of the value</h1><p>A short supporting sentence that expands on the promise.</p><h2>Why teams choose us</h2><ul><li>Benefit one, stated plainly</li><li>Benefit two</li><li>Benefit three</li></ul><h2>Get started</h2><p>Tell the visitor exactly what to do next.</p>",
    },
    {
        name: "Documentation",
        description: "A how-to / reference doc with steps and a category.",
        icon: "document",
        color: "#00B894",
        typeApiId: "doc",
        typeName: "Doc",
        jsonLd: "Article",
        fields: [T("f1", "Title", "Text", true), T("f2", "Slug", "Slug"), T("f3", "Category", "Text"), T("f4", "Body", "Rich text", true)],
        body: "<h1>What this page covers</h1><p>One or two sentences on the goal of this doc.</p><h2>Before you start</h2><p>Prerequisites the reader needs.</p><h2>Steps</h2><ol><li>First step</li><li>Second step</li><li>Third step</li></ol><h2>Troubleshooting</h2><p>Common issues and fixes.</p>",
    },
];

function sanitize(t: PageTemplate) {
    return {
        id: t.id,
        name: t.name,
        description: t.description,
        icon: t.icon,
        color: t.color,
        typeApiId: t.typeApiId,
        typeName: t.typeName,
        jsonLd: t.jsonLd,
        fields: (t.fields as FieldDef[]) ?? [],
        body: t.body,
        updatedAt: t.updatedAt,
    };
}

@Injectable()
export class PageTemplatesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly entries: ContentEntriesService,
    ) {}

    /** List templates; seed the defaults the first time a workspace has none. */
    async list(workspaceId: string) {
        const count = await this.prisma.pageTemplate.count({ where: { workspaceId } });
        if (count === 0) {
            await this.prisma.pageTemplate.createMany({
                data: DEFAULTS.map((d) => ({
                    workspaceId,
                    name: d.name,
                    description: d.description,
                    icon: d.icon ?? "document",
                    color: d.color ?? "#6C5CE7",
                    typeApiId: d.typeApiId,
                    typeName: d.typeName ?? d.name,
                    jsonLd: d.jsonLd ?? "WebPage",
                    fields: (d.fields ?? []) as object,
                    body: d.body ?? "",
                })),
            });
        }
        const rows = await this.prisma.pageTemplate.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
        return rows.map(sanitize);
    }

    async create(workspaceId: string, dto: UpsertTemplate, userId: string) {
        if (!dto.name?.trim() || !dto.typeApiId?.trim()) throw new BadRequestException("A template needs a name and a content type.");
        const row = await this.prisma.pageTemplate.create({
            data: {
                workspaceId,
                name: dto.name.trim(),
                description: dto.description,
                icon: dto.icon ?? "document",
                color: dto.color ?? "#6C5CE7",
                typeApiId: dto.typeApiId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
                typeName: dto.typeName?.trim() || dto.name.trim(),
                jsonLd: dto.jsonLd ?? "WebPage",
                fields: (dto.fields ?? [T("f1", "Title", "Text", true), T("f2", "Slug", "Slug"), T("f3", "Body", "Rich text", true)]) as object,
                body: dto.body ?? "",
                createdById: userId,
            },
        });
        return sanitize(row);
    }

    async update(workspaceId: string, id: string, dto: Partial<UpsertTemplate>) {
        const existing = await this.prisma.pageTemplate.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Template not found.");
        const row = await this.prisma.pageTemplate.update({
            where: { id },
            data: {
                ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
                ...(dto.description !== undefined ? { description: dto.description } : {}),
                ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
                ...(dto.color !== undefined ? { color: dto.color } : {}),
                ...(dto.typeName !== undefined ? { typeName: dto.typeName } : {}),
                ...(dto.jsonLd !== undefined ? { jsonLd: dto.jsonLd } : {}),
                ...(dto.fields !== undefined ? { fields: dto.fields as object } : {}),
                ...(dto.body !== undefined ? { body: dto.body } : {}),
            },
        });
        return sanitize(row);
    }

    async remove(workspaceId: string, id: string) {
        const existing = await this.prisma.pageTemplate.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Template not found.");
        await this.prisma.pageTemplate.delete({ where: { id } });
        return { ok: true };
    }

    /** Use a template: ensure its content type exists, then open a pre-filled draft. */
    async use(workspaceId: string, id: string, userId: string) {
        const t = await this.prisma.pageTemplate.findFirst({ where: { id, workspaceId } });
        if (!t) throw new NotFoundException("Template not found.");

        let type = await this.prisma.contentType.findUnique({ where: { workspaceId_apiId: { workspaceId, apiId: t.typeApiId } } });
        if (!type) {
            type = await this.prisma.contentType.create({
                data: {
                    workspaceId,
                    name: t.typeName,
                    apiId: t.typeApiId,
                    pluralApiId: `${t.typeApiId}s`,
                    kind: "COLLECTION",
                    schema: { icon: t.icon, color: t.color, jsonLd: t.jsonLd, fields: (t.fields as FieldDef[]) ?? [] },
                },
            });
        }

        const entry = await this.entries.create(
            workspaceId,
            userId,
            { contentTypeId: type.id, title: t.name, data: { body: t.body } } as never,
        );
        return { entryId: (entry as { id: string }).id, contentTypeId: type.id };
    }
}
