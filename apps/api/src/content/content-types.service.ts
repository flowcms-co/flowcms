import { Injectable, NotFoundException } from "@nestjs/common";
import { ContentType } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContentTypeDto, UpdateContentTypeDto } from "./dto";

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
        };
    }

    async list(workspaceId: string) {
        const rows = await this.prisma.contentType.findMany({
            where: { workspaceId },
            include: { _count: { select: { entries: true } } },
            orderBy: { createdAt: "asc" },
        });
        return rows.map((r) => this.shape(r));
    }

    async create(workspaceId: string, dto: CreateContentTypeDto) {
        const base = this.slug(dto.name);
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
        const existing = await this.prisma.contentType.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Content type not found.");
        const data: Record<string, unknown> = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.schema !== undefined) data.schema = dto.schema as object;
        if (dto.draftAndPublish !== undefined) data.draftAndPublish = dto.draftAndPublish;
        const t = await this.prisma.contentType.update({ where: { id }, data });
        return this.shape(t);
    }

    async remove(workspaceId: string, id: string) {
        const existing = await this.prisma.contentType.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Content type not found.");
        await this.prisma.contentType.delete({ where: { id } });
        return { ok: true };
    }
}
