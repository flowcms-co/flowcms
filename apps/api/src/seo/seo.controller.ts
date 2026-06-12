import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { IsArray, IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { SeoService } from "./seo.service";

class SuggestMetaDto {
    @IsString() path!: string;
    @IsString() title!: string;
    @IsOptional() @IsString() description?: string;
}

class SuggestSchemaDto {
    @IsString() path!: string;
    @IsString() title!: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() body?: string;
    @IsOptional() @IsIn(["auto", "faq"]) kind?: "auto" | "faq";
}

class LearningDto {
    @IsIn(["meta", "schema"]) kind!: "meta" | "schema";
    @IsString() path!: string;
    @IsObject() after!: { title?: string; description?: string; type?: string };
}

class ConnectorDto {
    @IsOptional() @IsString() key?: string;
    @IsOptional() @IsString() login?: string;
    @IsOptional() @IsString() password?: string;
    @IsOptional() @IsString() baseUrl?: string;
    @IsOptional() @IsString() preset?: string;
    @IsOptional() @IsObject() fieldMap?: any;
}

class KeywordResearchDto {
    @IsArray() @IsString({ each: true }) terms!: string[];
}

class GenerateFileDto {
    @IsIn(["llms", "robots", "sitemap"]) kind!: "llms" | "robots" | "sitemap";
}

class ApplyLinkDto {
    @IsString() sourceId!: string;
    @IsString() targetId!: string;
    @IsString() anchor!: string;
}

@Controller("seo")
@RequirePermissions(PERMISSIONS.SEO_READ)
export class SeoController {
    constructor(private readonly seo: SeoService) {}

    @Get("summary")
    summary(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
        const n = Math.min(Math.max(Number(days) || 30, 1), 365);
        return this.seo.summary(user.workspaceId, n);
    }

    /** The one canonical Flow SEO Score (Visibility + Technical + Speed) shown everywhere. */
    @Get("score")
    score(@CurrentUser() user: AuthUser) {
        return this.seo.score(user.workspaceId);
    }

    @Get("keywords")
    keywords(@CurrentUser() user: AuthUser) {
        return this.seo.keywords(user.workspaceId);
    }

    @Get("top-pages")
    topPages(@CurrentUser() user: AuthUser) {
        return this.seo.topPages(user.workspaceId);
    }

    @Get("backlinks")
    backlinks(@CurrentUser() user: AuthUser) {
        return this.seo.backlinks(user.workspaceId);
    }

    @Get("cannibalization")
    cannibalization(@CurrentUser() user: AuthUser) {
        return this.seo.cannibalization(user.workspaceId);
    }

    @Get("clusters")
    clusters(@CurrentUser() user: AuthUser) {
        return this.seo.clusters(user.workspaceId);
    }

    @Get("internal-links")
    internalLinks(@CurrentUser() user: AuthUser) {
        return this.seo.internalLinks(user.workspaceId);
    }

    @Post("internal-links/apply")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    applyInternalLink(@CurrentUser() user: AuthUser, @Body() dto: ApplyLinkDto) {
        return this.seo.applyInternalLink(user.workspaceId, user.id, dto);
    }

    @Get("audit")
    audit(@CurrentUser() user: AuthUser, @Query("refresh") refresh?: string) {
        return this.seo.crawl(user.workspaceId, refresh === "1" || refresh === "true");
    }

    @Get("vitals")
    vitals(@CurrentUser() user: AuthUser, @Query("refresh") refresh?: string) {
        return this.seo.vitals(user.workspaceId, refresh === "1" || refresh === "true");
    }

    @Post("suggest-meta")
    @RequirePermissions(PERMISSIONS.AI_USE)
    suggestMeta(@CurrentUser() user: AuthUser, @Body() dto: SuggestMetaDto) {
        return this.seo.suggestMeta(user.workspaceId, user.id, {
            path: dto.path,
            title: dto.title,
            description: dto.description ?? "",
        });
    }

    @Post("suggest-schema")
    @RequirePermissions(PERMISSIONS.AI_USE)
    suggestSchema(@CurrentUser() user: AuthUser, @Body() dto: SuggestSchemaDto) {
        return this.seo.suggestSchema(user.workspaceId, user.id, {
            path: dto.path,
            title: dto.title,
            description: dto.description,
            body: dto.body,
            kind: dto.kind,
        });
    }

    @Post("learning")
    @RequirePermissions(PERMISSIONS.KNOWLEDGE_MANAGE)
    learning(@CurrentUser() user: AuthUser, @Body() dto: LearningDto) {
        return this.seo.recordLearning(user.workspaceId, { kind: dto.kind, path: dto.path, after: dto.after });
    }

    @Post("learning/refine")
    @RequirePermissions(PERMISSIONS.KNOWLEDGE_MANAGE)
    refine(@CurrentUser() user: AuthUser) {
        return this.seo.refineMemory(user.workspaceId, user.id);
    }

    // ─── BYO-key connectors ─────────────────────────────────────────────────

    @Get("connectors")
    connectors(@CurrentUser() user: AuthUser) {
        return this.seo.connectors(user.workspaceId);
    }

    @Post("connect/:provider")
    @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
    connect(@CurrentUser() user: AuthUser, @Param("provider") provider: "pagespeed" | "keyword_data" | "backlinks", @Body() dto: ConnectorDto) {
        return this.seo.connectConnector(user.workspaceId, user.id, provider, dto);
    }

    @Delete("connect/:provider")
    @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
    disconnect(@CurrentUser() user: AuthUser, @Param("provider") provider: "pagespeed" | "keyword_data" | "backlinks") {
        return this.seo.disconnectConnector(user.workspaceId, provider);
    }

    @Post("keyword-research")
    keywordResearch(@CurrentUser() user: AuthUser, @Body() dto: KeywordResearchDto) {
        return this.seo.keywordResearch(user.workspaceId, dto.terms);
    }

    // ─── AEO probe ──────────────────────────────────────────────────────────

    @Get("aeo")
    aeoGet(@CurrentUser() user: AuthUser) {
        return this.seo.aeoGet(user.workspaceId);
    }

    @Post("aeo")
    @RequirePermissions(PERMISSIONS.AI_USE)
    aeoProbe(@CurrentUser() user: AuthUser) {
        return this.seo.aeoProbe(user.workspaceId, user.id);
    }

    @Post("generate-file")
    @RequirePermissions(PERMISSIONS.AI_USE)
    generateFile(@CurrentUser() user: AuthUser, @Body() dto: GenerateFileDto) {
        return this.seo.generateFile(user.workspaceId, user.id, dto.kind);
    }
}
