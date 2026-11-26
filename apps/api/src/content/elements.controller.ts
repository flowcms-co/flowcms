import { BadRequestException, Body, Controller, Get, Header, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ELEMENTS_JS, PERMISSIONS, elementsCss, hashToken, parseTheme, themeCss, themeOrDefault, DEFAULT_THEME, type ElementsTheme } from "@flowcms/shared";
import { CurrentUser, Public, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { FeatureGuard, RequireFeature } from "../license/feature.guard";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The Elements theme, one per workspace, stored in `Workspace.elementsTheme` (validated by
 * `parseTheme` on every write and again on every read). Staff routes: Enterprise `elements`.
 */
@Controller("elements/theme")
@UseGuards(FeatureGuard)
@RequireFeature("elements")
export class ElementsThemeController {
    constructor(private readonly prisma: PrismaService) {}

    /** Any signed-in member: the editor needs the theme to preview elements. */
    @Get()
    async get(@CurrentUser() user: AuthUser): Promise<ElementsTheme> {
        const w = await this.prisma.workspace.findUnique({ where: { id: user.workspaceId }, select: { elementsTheme: true } });
        return themeOrDefault(w?.elementsTheme);
    }

    @Put()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async set(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<ElementsTheme> {
        const { theme, errors } = parseTheme(body);
        if (errors.length) throw new BadRequestException(errors);
        await this.prisma.workspace.update({ where: { id: user.workspaceId }, data: { elementsTheme: theme } });
        return theme;
    }
}

/**
 * Delivered content assets. Open on purpose: a site loads them with a plain <link> / <script>
 * tag, which cannot send a token.
 */
@Controller("public")
@Public()
export class ElementsController {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Which workspace's theme to serve. In order: the Bearer API token's workspace, `?workspace=<slug>`,
     * the only workspace on a single-workspace install. Otherwise the default theme.
     */
    private async themeFor(req: Request, slug?: string): Promise<ElementsTheme> {
        const auth = req.headers.authorization;
        let where: { id: string } | { slug: string } | null = null;
        if (auth?.startsWith("Bearer ")) {
            const tok = await this.prisma.apiToken.findUnique({ where: { tokenHash: hashToken(auth.slice(7)) }, select: { workspaceId: true, revokedAt: true, expiresAt: true } });
            if (tok && !tok.revokedAt && !(tok.expiresAt && tok.expiresAt < new Date())) where = { id: tok.workspaceId };
        }
        if (!where && typeof slug === "string" && slug) where = { slug };
        if (!where) {
            const all = await this.prisma.workspace.findMany({ select: { id: true }, take: 2 });
            if (all.length === 1) where = { id: all[0].id };
        }
        if (!where) return DEFAULT_THEME;
        const w = await this.prisma.workspace.findUnique({ where, select: { elementsTheme: true } });
        return themeOrDefault(w?.elementsTheme);
    }

    @Get("elements.css")
    @Header("Content-Type", "text/css; charset=utf-8")
    // A theme change shows without a republish, so keep this short.
    @Header("Cache-Control", "public, max-age=60")
    @Header("Vary", "Authorization")
    async css(@Req() req: Request, @Query("workspace") slug?: string): Promise<string> {
        return elementsCss(themeCss(await this.themeFor(req, slug)));
    }

    /** The small script that makes calculators live. Open, same as the stylesheet. */
    @Get("elements.js")
    @Header("Content-Type", "application/javascript; charset=utf-8")
    @Header("Cache-Control", "public, max-age=300")
    js(): string {
        return ELEMENTS_JS;
    }
}
