import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    Post,
    Req,
    UnauthorizedException,
} from "@nestjs/common";
import { IsString } from "class-validator";
import type { Request } from "express";
import { hashToken } from "@flowcms/shared";
import { CurrentUser } from "../auth/decorators";
import { SESSION_COOKIE } from "../auth/constants";
import type { AuthUser } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";

class SwitchWorkspaceDto {
    @IsString() workspaceId!: string;
}

/**
 * The multi-workspace console's *navigation* half — listing the workspaces a user
 * belongs to and switching the active one for the current session. These are
 * CORE (un-gated): a single-workspace install just lists one and never switches.
 * The paid lever (creating additional workspaces) lives in ee/multi-workspace and
 * is gated by the `multi_workspace` entitlement.
 */
@Controller("workspaces")
export class WorkspacesController {
    constructor(private readonly prisma: PrismaService) {}

    /** Every workspace the signed-in user is a member of, with their role in each. */
    @Get()
    async list(@CurrentUser() user: AuthUser) {
        const memberships = await this.prisma.membership.findMany({
            where: { userId: user.id },
            include: {
                workspace: { select: { id: true, name: true, slug: true } },
                role: { select: { key: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
        });
        return memberships.map((m) => ({
            id: m.workspace.id,
            name: m.workspace.name,
            slug: m.workspace.slug,
            role: { key: m.role.key, name: m.role.name },
            active: m.workspace.id === user.workspaceId,
        }));
    }

    /** Point THIS session at a different workspace (must be a member of it). */
    @HttpCode(200)
    @Post("switch")
    async switch(@CurrentUser() user: AuthUser, @Body() dto: SwitchWorkspaceDto, @Req() req: Request) {
        const membership = await this.prisma.membership.findUnique({
            where: { userId_workspaceId: { userId: user.id, workspaceId: dto.workspaceId } },
            select: { workspaceId: true },
        });
        if (!membership) throw new ForbiddenException("You're not a member of that workspace.");
        const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
        if (!token) throw new UnauthorizedException();
        // Pin the active workspace on this session only (per-device), so a second
        // browser/device can stay in a different workspace.
        await this.prisma.session.updateMany({
            where: { tokenHash: hashToken(token) },
            data: { activeWorkspaceId: dto.workspaceId },
        });
        return { ok: true, workspaceId: dto.workspaceId };
    }
}
