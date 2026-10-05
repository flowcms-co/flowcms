import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Public } from "../../auth/decorators";
import { ApiTokenGuard } from "../../content/api-token.guard";
import { IsArray, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { SeoAuditService } from "./seo-audit.service";
import { SeoAiExecutorService } from "./seo-ai-executor.service";
import { JobsService } from "../../jobs/jobs.service";

class BatchFixDto {
    @IsString() fix!: string;
    @IsString() key!: string;
    @IsArray() pages!: { id: string; url: string | null }[];
    @IsOptional() @IsString() title?: string;
}

class IgnoreDto {
    @IsString() code!: string;
    @IsOptional() @IsString() entryId?: string;
    @IsOptional() ignore?: boolean;
}

/**
 * Deterministic L1 SEO audit (the scan ledger). Community: manual run + read.
 * Namespaced under /seo/scan to avoid the crawler's /seo/audit.
 */
@Controller("seo/scan")
@RequirePermissions(PERMISSIONS.SEO_READ)
export class SeoAuditController {
    constructor(
        private readonly audit: SeoAuditService,
        private readonly executor: SeoAiExecutorService,
        private readonly jobs: JobsService,
    ) {}

    /** Rendered findings per page (codes already expanded to readable UI). */
    @Get()
    list(@CurrentUser() user: AuthUser, @Query("limit") limit?: string, @Query("offset") offset?: string) {
        return this.audit.list(user.workspaceId, { limit: Math.min(Math.max(Number(limit) || 100, 1), 500), offset: Math.max(Number(offset) || 0, 0) });
    }

    /** The unified, grouped issue set for the AI Optimizer + Dashboard: page-scope
     *  findings plus site-scope (AI readiness, schema, cannibalization, internal
     *  links, Core Web Vitals, Search Console), grouped by type with quick wins. */
    @Get("issues")
    issues(@CurrentUser() user: AuthUser) {
        return this.audit.issues(user.workspaceId);
    }

    /** Run the deterministic audit across all published pages (change-detected). */
    @Post("run")
    run(@CurrentUser() user: AuthUser) {
        return this.audit.auditWorkspace(user.workspaceId);
    }

    /** The same audit as a background job with progress: with a site URL every
     *  page's live HTML is fetched, which outlasts a request on a large site. */
    @Post("jobs/run")
    runJob(@CurrentUser() user: AuthUser, @Body() dto: { mode?: string }) {
        const mode = dto?.mode === "full" ? "full" : "changed";
        return this.jobs.enqueue(user.workspaceId, user.id, "seo.auditPages", mode === "full" ? "Re-check every page" : "Audit pages", { mode });
    }

    /** Before starting: how many pages a run will fetch and the estimated time. */
    @Get("plan")
    plan(@CurrentUser() user: AuthUser, @Query("mode") mode?: string) {
        return this.audit.plan(user.workspaceId, mode === "full" ? "full" : "changed");
    }

    /** Pause, resume or cancel the audit run in progress. */
    @Post("run/:action")
    @RequirePermissions(PERMISSIONS.SEO_MANAGE)
    control(@CurrentUser() user: AuthUser, @Param("action") action: string) {
        if (action !== "pause" && action !== "resume" && action !== "cancel") throw new BadRequestException("Use pause, resume or cancel.");
        return this.audit.control(user.workspaceId, action);
    }

    /** The page images missing alt text: the set the audit flags and the fixer fills. */
    @Get("alt/:id")
    async missingAlt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return { images: await this.audit.missingAlt(user.workspaceId, id) };
    }

    /** Write generated alt text where the page keeps it (paired alt fields, rich text). */
    @Post("alt/:id/apply")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    async applyAlt(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { alts?: { src: string; alt: string }[] }) {
        return { patch: await this.audit.altPatch(user.workspaceId, id, Array.isArray(dto?.alts) ? dto.alts : []) };
    }

    /** Re-audit a single entry. */
    @Post("entry/:id")
    entry(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.audit.auditEntry(user.workspaceId, id);
    }

    /** Run a compact, cost-routed AI pass over one page's escalated findings.
     *  Manual (Community); review-first (stores suggestions, never auto-applies). */
    @Post("ai/:id")
    @RequirePermissions(PERMISSIONS.AI_USE)
    aiPass(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.executor.aiPassEntry(user.workspaceId, user.id, id);
    }

    /** Generate AI alt text for an entry's images that are missing it (review-first). */
    @Post("alt/:id")
    @RequirePermissions(PERMISSIONS.AI_USE)
    alt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.audit.generatePageAlt(user.workspaceId, user.id, id);
    }

    /** Permanently dismiss (or restore) a finding so the audit stops surfacing it. */
    @Post("ignore")
    @RequirePermissions(PERMISSIONS.SEO_MANAGE)
    ignore(@CurrentUser() user: AuthUser, @Body() dto: IgnoreDto) {
        return this.audit.setIgnored(user.workspaceId, dto.code, dto.entryId ?? null, dto.ignore !== false);
    }

    /** Apply all deterministic, free safe fixes across the workspace as a background job. */
    @Post("jobs/auto-apply-safe")
    @RequirePermissions(PERMISSIONS.SEO_MANAGE)
    autoApplySafe(@CurrentUser() user: AuthUser) {
        return this.jobs.enqueue(user.workspaceId, user.id, "seo.autoApplySafe", "Apply safe SEO fixes", {});
    }

    /** Fix every page in one issue group as a background job (AI or deterministic). */
    @Post("jobs/batch-fix")
    @RequirePermissions(PERMISSIONS.AI_USE)
    batchFix(@CurrentUser() user: AuthUser, @Body() dto: BatchFixDto) {
        const n = (dto.pages ?? []).filter((p) => p.id).length;
        const label = `Fix ${n} page${n === 1 ? "" : "s"}${dto.title ? ` · ${dto.title}` : ""}`;
        return this.jobs.enqueue(user.workspaceId, user.id, "seo.batchFix", label, { fix: dto.fix, key: dto.key, pages: dto.pages }, n);
    }
}

/**
 * Change signals from the site, authenticated with a workspace API token (the same
 * Bearer token the delivery API uses), so a deploy hook or the frontend can call it:
 *   POST /public/seo/signal  { "urls": ["https://site.com/a", "/b"] }   these pages changed
 *   POST /public/seo/signal  { "deployed": true }                        the site was deployed
 * Changed URLs are fetched on the next run. A deploy starts a sample re-check of
 * each page type (a template may have changed), not a full crawl.
 */
@Controller("public/seo/signal")
@Public()
@UseGuards(ApiTokenGuard)
export class SeoSignalController {
    constructor(
        private readonly audit: SeoAuditService,
        private readonly jobs: JobsService,
    ) {}

    @Post()
    async signal(@Req() req: { apiToken?: { workspaceId: string; createdById?: string | null } }, @Body() dto: { urls?: unknown; deployed?: unknown }) {
        const ws = req.apiToken!.workspaceId;
        const urls = Array.isArray(dto?.urls) ? dto.urls.filter((u): u is string => typeof u === "string").slice(0, 5000) : [];
        const marked = urls.length ? await this.audit.markChanged(ws, urls) : 0;
        const deployed = dto?.deployed === true;
        // One run at a time: a signal during a run is picked up by the next one.
        const busy = !!(await this.audit.runState(ws));
        const userId = req.apiToken!.createdById;
        const start = (deployed || marked > 0) && !busy && !!userId;
        if (start) await this.jobs.enqueue(ws, userId!, "seo.auditPages", deployed ? "Re-check after site deploy" : "Audit changed pages", { mode: deployed ? "sample" : "changed" });
        return { ok: true, marked, started: start };
    }
}
