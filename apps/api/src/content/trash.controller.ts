import { Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS, can } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import { AssetsService } from "../assets/assets.service";
import { ContentEntriesService } from "./content-entries.service";

/** "Deleted items": entries and media kept 30 days after a delete, with restore. */
@Controller("trash")
@RequirePermissions(PERMISSIONS.CONTENT_READ)
export class TrashController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly entries: ContentEntriesService,
        private readonly assets: AssetsService,
    ) {}

    /** ?kind=entry|media&limit=&offset= → { items, total }, newest first. */
    @Get()
    async list(@CurrentUser() user: AuthUser, @Query("kind") kind?: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
        const where = { workspaceId: user.workspaceId, ...(kind === "entry" || kind === "media" ? { kind } : {}) };
        const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
        const skip = Math.max(Number(offset) || 0, 0);
        const [items, total] = await Promise.all([
            this.prisma.deletedItem.findMany({
                where,
                orderBy: { deletedAt: "desc" },
                take,
                skip,
                select: { id: true, kind: true, itemId: true, title: true, detail: true, deletedBy: true, deletedAt: true, purgeAt: true },
            }),
            this.prisma.deletedItem.count({ where }),
        ]);
        return { items, total };
    }

    /** Restore: an entry needs the Restore permission, a file needs media rights. */
    @Post(":id/restore")
    async restore(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        const item = await this.prisma.deletedItem.findFirst({ where: { id, workspaceId: user.workspaceId }, select: { kind: true } });
        if (!item) throw new NotFoundException("Deleted item not found.");
        const perms = user.role.permissions;
        if (item.kind === "media") {
            if (!can(perms, PERMISSIONS.MEDIA_MANAGE)) throw new ForbiddenException("Restoring files needs media rights.");
            return this.assets.restoreDeleted(user.workspaceId, id);
        }
        if (!can(perms, PERMISSIONS.CONTENT_RESTORE)) throw new ForbiddenException("Your role can't restore content. Ask a Super Admin to give your role the Restore permission.");
        return this.entries.restoreDeleted(user.workspaceId, id, user.id);
    }
}
