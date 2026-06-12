import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KnowledgeFile } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";

export class UpsertKnowledgeInput {
    name?: string;
    content?: string;
    enabled?: boolean;
    universal?: boolean;
    contentTypeApiIds?: string[];
    tools?: string[];
}

const SEO_TOOLS = ["seo.meta_fix", "seo.schema_fix"];

@Injectable()
export class KnowledgeService {
    constructor(private readonly prisma: PrismaService) {}

    private shape(f: KnowledgeFile) {
        return {
            id: f.id,
            name: f.name,
            content: f.content,
            kind: f.kind,
            enabled: f.enabled,
            universal: f.universal,
            contentTypeApiIds: (f.contentTypeApiIds ?? []) as string[],
            tools: (f.tools ?? []) as string[],
            managed: f.managed,
            updatedAt: f.updatedAt,
            createdAt: f.createdAt,
        };
    }

    async list(workspaceId: string) {
        const rows = await this.prisma.knowledgeFile.findMany({
            where: { workspaceId },
            orderBy: [{ managed: "desc" }, { createdAt: "asc" }],
        });
        return rows.map((f) => this.shape(f));
    }

    async get(workspaceId: string, id: string) {
        const f = await this.prisma.knowledgeFile.findFirst({ where: { id, workspaceId } });
        if (!f) throw new NotFoundException("Knowledge file not found.");
        return f;
    }

    async create(workspaceId: string, userId: string, input: UpsertKnowledgeInput) {
        if (!input.name?.trim()) throw new BadRequestException("A name is required.");
        const created = await this.prisma.knowledgeFile.create({
            data: {
                workspaceId,
                name: input.name.trim(),
                content: input.content ?? "",
                enabled: input.enabled ?? true,
                universal: input.universal ?? false,
                contentTypeApiIds: input.contentTypeApiIds ?? [],
                tools: input.tools ?? [],
                createdById: userId,
            },
        });
        return this.shape(created);
    }

    async update(workspaceId: string, id: string, input: UpsertKnowledgeInput) {
        await this.get(workspaceId, id); // ownership check
        const updated = await this.prisma.knowledgeFile.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.content !== undefined ? { content: input.content } : {}),
                ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
                ...(input.universal !== undefined ? { universal: input.universal } : {}),
                ...(input.contentTypeApiIds !== undefined ? { contentTypeApiIds: input.contentTypeApiIds } : {}),
                ...(input.tools !== undefined ? { tools: input.tools } : {}),
            },
        });
        return this.shape(updated);
    }

    async remove(workspaceId: string, id: string) {
        const f = await this.get(workspaceId, id);
        if (f.managed) throw new BadRequestException("This file is managed by the system and can't be deleted (you can clear its contents instead).");
        await this.prisma.knowledgeFile.delete({ where: { id } });
        return { ok: true };
    }

    async exportMd(workspaceId: string, id: string) {
        const f = await this.get(workspaceId, id);
        return { filename: `${f.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.md`, content: f.content };
    }

    /**
     * Knowledge files that apply to a given AI call. A file applies when it is
     * enabled AND (universal, OR targets this feature/tool, OR targets this content type).
     */
    async getApplicable(workspaceId: string, feature?: string, contentTypeApiId?: string) {
        const rows = await this.prisma.knowledgeFile.findMany({
            where: { workspaceId, enabled: true },
            orderBy: [{ managed: "asc" }, { createdAt: "asc" }],
        });
        return rows.filter((f) => {
            const tools = (f.tools ?? []) as string[];
            const types = (f.contentTypeApiIds ?? []) as string[];
            if (f.universal) return true;
            if (feature && tools.includes(feature)) return true;
            if (contentTypeApiId && types.includes(contentTypeApiId)) return true;
            return false;
        });
    }

    /** Find (or lazily create) the workspace's auto-maintained SEO learning memory. */
    async getOrCreateSeoMemory(workspaceId: string) {
        const existing = await this.prisma.knowledgeFile.findFirst({
            where: { workspaceId, kind: "seo_memory" },
        });
        if (existing) return existing;
        return this.prisma.knowledgeFile.create({
            data: {
                workspaceId,
                name: "SEO learning memory",
                kind: "seo_memory",
                managed: true,
                enabled: true,
                tools: SEO_TOOLS,
                content: SEO_MEMORY_HEADER,
            },
        });
    }
}

export const SEO_LEARN_START = "<!-- flow:learned:start -->";
export const SEO_LEARN_END = "<!-- flow:learned:end -->";

export const SEO_MEMORY_HEADER = `# SEO learning memory

This file is maintained automatically. Each time you **accept** an SEO fix in
Review mode, the preference is recorded in the block below and fed back into
future fix suggestions as a guide and guardrail. You can edit this file freely —
notes you add **outside** the auto block are always preserved.

${SEO_LEARN_START}
## Learned preferences
_(auto-maintained — content inside this block may be rewritten)_
${SEO_LEARN_END}
`;
