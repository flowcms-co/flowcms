import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ArrayUnique, IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import { PERMISSIONS, isTimeZone, safeTimeZone } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import { toLowerId, normalizeFieldNames } from "../content/naming";
import { pluralize } from "../content/pluralize";
import { AUTHOR_MODES } from "../content/author";
import { normalizeSiteUrl } from "../seo/site-pages.service";

class UpdateWorkspaceDto {
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() defaultLocale?: string;
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @Matches(/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/, { each: true, message: "Locale codes look like 'en' or 'pt-BR'." })
    locales?: string[];
    /** Site-wide Organization JSON-LD defaults (Schema Builder → Global structured data). */
    @IsOptional() @IsObject() jsonLdOrg?: Record<string, unknown>;
    /** Frontend live-preview URL template (supports {slug} {id} {type} {locale}). */
    @IsOptional() @IsString() previewUrl?: string;
    @IsOptional() @IsString() siteUrl?: string;
    @IsOptional() @IsNumber() @Min(0.1) @Max(10) seoCrawlRps?: number;
    @IsOptional() @IsNumber() @Min(0.1) @Max(10) seoCrawlMaxRps?: number;
    @IsOptional() @IsInt() @Min(1) @Max(365) seoRecheckDays?: number;
    /** IANA time zone the dashboards measure "today" and weeks in, e.g. "Asia/Kolkata". */
    @IsOptional() @IsString() timezone?: string;
    /** Fallback weekly content goal per writer (when no personal goal is set). */
    @IsOptional() @IsInt() @Min(0) @Max(100) defaultWeeklyGoal?: number;
    /** Who an entry's author is: its creator, or whoever last edited the content. */
    @IsOptional() @IsIn(AUTHOR_MODES) authorMode?: (typeof AUTHOR_MODES)[number];
}

/** Starter content models seeded by the guided setup's "start fresh" path. */
type FieldDef = { id: string; name: string; type: string; required?: boolean };
type StarterType = { apiId: string; name: string; icon: string; jsonLd: string; fields: FieldDef[] };
const TEXT = (id: string, name: string, required = false) => ({ id, name, type: "Text", required });
const STARTERS: Record<string, StarterType[]> = {
    blog: [
        { apiId: "article", name: "Blog Post", icon: "document", jsonLd: "BlogPosting", fields: [TEXT("f1", "Title", true), { id: "f2", name: "Slug", type: "Slug" }, { id: "f3", name: "Body", type: "Rich text", required: true }, { id: "f4", name: "Cover image", type: "Media" }] },
        { apiId: "page", name: "Page", icon: "overview", jsonLd: "WebPage", fields: [TEXT("f1", "Title", true), { id: "f2", name: "Slug", type: "Slug" }, { id: "f3", name: "Body", type: "Rich text" }] },
    ],
    docs: [
        { apiId: "doc", name: "Doc", icon: "document", jsonLd: "Article", fields: [TEXT("f1", "Title", true), { id: "f2", name: "Slug", type: "Slug" }, TEXT("f3", "Category"), { id: "f4", name: "Body", type: "Rich text", required: true }] },
    ],
    marketing: [
        { apiId: "landing", name: "Landing Page", icon: "overview", jsonLd: "WebPage", fields: [TEXT("f1", "Title", true), { id: "f2", name: "Slug", type: "Slug" }, TEXT("f3", "Headline"), { id: "f4", name: "Body", type: "Rich text" }] },
        { apiId: "page", name: "Page", icon: "overview", jsonLd: "WebPage", fields: [TEXT("f1", "Title", true), { id: "f2", name: "Slug", type: "Slug" }, { id: "f3", name: "Body", type: "Rich text" }] },
    ],
    blank: [],
};

const shape = (w: { id: string; name: string; slug: string; locales: unknown; defaultLocale: string; onboardedAt: Date | null; jsonLdOrg?: unknown; previewUrl?: string | null; siteUrl?: string | null; seoCrawlRps?: number; seoCrawlMaxRps?: number; seoRecheckDays?: number; timezone?: string; authorMode?: string; defaultWeeklyGoal?: number; brandName?: string | null; brandLogoUrl?: string | null; brandAccent?: string | null }) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    locales: (w.locales as string[]) ?? ["en"],
    defaultLocale: w.defaultLocale,
    onboardedAt: w.onboardedAt,
    jsonLdOrg: (w.jsonLdOrg as Record<string, unknown> | null) ?? null,
    previewUrl: w.previewUrl ?? null,
    // Public site origin: the SEO crawl, PageSpeed and "View live" links use it.
    siteUrl: w.siteUrl ?? null,
    // The zone actually in use. A stored value the runtime does not know falls back
    // to UTC, and `timezoneInvalid` carries the bad value so the studio can say so.
    timezone: safeTimeZone(w.timezone),
    timezoneInvalid: w.timezone && safeTimeZone(w.timezone) !== w.timezone ? w.timezone : null,
    seoCrawlRps: w.seoCrawlRps ?? 1,
    seoCrawlMaxRps: w.seoCrawlMaxRps ?? 10,
    seoRecheckDays: w.seoRecheckDays ?? 14,
    authorMode: w.authorMode ?? "creator",
    defaultWeeklyGoal: w.defaultWeeklyGoal ?? 3,
    // White-label branding (applied client-side only when licensed for white_label).
    brandName: w.brandName ?? null,
    brandLogoUrl: w.brandLogoUrl ?? null,
    brandAccent: w.brandAccent ?? null,
});

@Controller("workspace")
export class WorkspaceController {
    constructor(private readonly prisma: PrismaService) {}

    /** Current workspace settings — readable by any authenticated member (the editor needs locales). */
    @Get()
    async get(@CurrentUser() user: AuthUser) {
        const w = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
        return shape(w);
    }

    @Patch()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateWorkspaceDto) {
        const data: Record<string, unknown> = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.locales !== undefined) data.locales = dto.locales.length ? dto.locales : ["en"];
        if (dto.defaultLocale !== undefined) data.defaultLocale = dto.defaultLocale;
        // Keep defaultLocale within the enabled set.
        if (dto.locales && dto.defaultLocale && !dto.locales.includes(dto.defaultLocale)) {
            data.defaultLocale = dto.locales[0];
        }
        if (dto.jsonLdOrg !== undefined) data.jsonLdOrg = dto.jsonLdOrg;
        if (dto.previewUrl !== undefined) data.previewUrl = dto.previewUrl.trim() || null;
        if (dto.siteUrl !== undefined) {
            const site = normalizeSiteUrl(dto.siteUrl);
            if (dto.siteUrl.trim() && !site) throw new BadRequestException("Enter the site URL as https://example.com.");
            data.siteUrl = site;
        }
        if (dto.seoCrawlRps !== undefined) data.seoCrawlRps = dto.seoCrawlRps;
        if (dto.seoCrawlMaxRps !== undefined) data.seoCrawlMaxRps = dto.seoCrawlMaxRps;
        if (dto.seoRecheckDays !== undefined) data.seoRecheckDays = dto.seoRecheckDays;
        if (dto.timezone !== undefined) {
            if (!isTimeZone(dto.timezone)) throw new BadRequestException(`"${dto.timezone}" is not a time zone. Pick one from the list, for example Europe/London.`);
            data.timezone = dto.timezone;
        }
        if (dto.defaultWeeklyGoal !== undefined) data.defaultWeeklyGoal = dto.defaultWeeklyGoal;
        if (dto.authorMode !== undefined) data.authorMode = dto.authorMode;
        const w = await this.prisma.workspace.update({ where: { id: user.workspaceId }, data });
        return shape(w);
    }

    /** Mark first-run guided setup as complete (stops the auto-redirect). */
    @Post("onboard")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async onboard(@CurrentUser() user: AuthUser) {
        const w = await this.prisma.workspace.update({ where: { id: user.workspaceId }, data: { onboardedAt: new Date() } });
        return shape(w);
    }

    /** Seed the content types for a chosen starter (find-or-create; idempotent). */
    @Post("starter/:starter")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async starter(@CurrentUser() user: AuthUser, @Param("starter") starter: string) {
        const types = STARTERS[starter];
        if (!types) throw new BadRequestException("Unknown starter.");
        let created = 0;
        for (const t of types) {
            // Content-type ids stay lowercase (they double as URL slugs); field keys
            // are coerced to camelCase, so starters can never seed a non-conforming id.
            const apiId = toLowerId(t.apiId) || t.apiId;
            const existing = await this.prisma.contentType.findUnique({ where: { workspaceId_apiId: { workspaceId: user.workspaceId, apiId } } });
            if (existing) continue;
            await this.prisma.contentType.create({
                data: {
                    workspaceId: user.workspaceId,
                    name: t.name,
                    apiId,
                    pluralApiId: pluralize(apiId),
                    kind: "COLLECTION",
                    schema: { icon: t.icon, color: "#6C5CE7", jsonLd: t.jsonLd, fields: normalizeFieldNames(t.fields) as typeof t.fields },
                },
            });
            created++;
        }
        return { ok: true, created, types: types.map((t) => ({ apiId: toLowerId(t.apiId) || t.apiId, name: t.name })) };
    }
}
