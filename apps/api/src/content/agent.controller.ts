import { Body, Controller, Delete, ForbiddenException, Get, Param, Query, Req, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { Public } from "../auth/decorators";
import { AgentTokenGuard } from "./agent-token.guard";
import { tokenScopeAllows } from "./agent-scope";
import { ContentEntriesService } from "./content-entries.service";
import { ContentTypesService } from "./content-types.service";
import { PublicQueryService } from "./public-query.service";

type TokenReq = Request & { apiToken: { workspaceId: string; scopes?: unknown } };
const EDITABLE = ["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "ARCHIVED"] as const;

/** Throwing wrapper used by the controller routes (see ./agent-scope). */
function requireScope(req: TokenReq, permission: string): void {
    if (!tokenScopeAllows(req.apiToken.scopes, permission)) {
        throw new ForbiddenException(`This token is not authorized for '${permission}'.`);
    }
}

class AgentCreateDto {
    @IsOptional() @IsString() title?: string;
    @IsOptional() @IsString() slug?: string;
    @IsOptional() @IsObject() data?: Record<string, unknown>;
}

class AgentUpdateDto {
    @IsOptional() @IsString() title?: string;
    @IsOptional() @IsString() slug?: string;
    @IsOptional() @IsObject() data?: Record<string, unknown>;
    @IsOptional() @IsIn(EDITABLE) status?: (typeof EDITABLE)[number];
    @IsOptional() @IsString() scheduledAt?: string;
}

/**
 * Agent write API — lets an external AI agent / script operate the CMS
 * programmatically with an AGENT or ADMIN token. Mirrors the studio's content
 * actions (create / update / publish / delete) and reuses the same validation,
 * notifications and webhook dispatch.
 */
@Controller("agent")
@Public() // skip the session guard; the token guard authenticates instead
@UseGuards(AgentTokenGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } }) // per-token (programmatic) headroom
export class AgentController {
    constructor(
        private readonly entries: ContentEntriesService,
        private readonly types: ContentTypesService,
        private readonly query: PublicQueryService,
    ) {}

    @Get("types")
    listTypes(@Req() req: TokenReq) {
        return this.types.list(req.apiToken.workspaceId);
    }

    @Get(":type")
    async list(
        @Req() req: TokenReq,
        @Param("type") type: string,
        @Query("limit") limit?: string,
        @Query("offset") offset?: string,
    ) {
        requireScope(req, PERMISSIONS.CONTENT_READ);
        const ct = await this.query.resolveType(req.apiToken.workspaceId, type);
        // Default page size 100 (max 500); page with ?limit= & ?offset=.
        const parsedLimit = limit != null && limit !== "" ? Number(limit) : 100;
        const parsedOffset = offset != null && offset !== "" ? Number(offset) : 0;
        return this.entries.list(req.apiToken.workspaceId, {
            typeId: ct.id,
            limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
            offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
        });
    }

    @Get(":type/:id")
    get(@Req() req: TokenReq, @Param("id") id: string) {
        requireScope(req, PERMISSIONS.CONTENT_READ);
        return this.entries.get(req.apiToken.workspaceId, id);
    }

    @Post(":type")
    async create(@Req() req: TokenReq, @Param("type") type: string, @Body() dto: AgentCreateDto) {
        requireScope(req, PERMISSIONS.CONTENT_CREATE);
        const ct = await this.query.resolveType(req.apiToken.workspaceId, type);
        return this.entries.create(req.apiToken.workspaceId, null, { contentTypeId: ct.id, ...dto });
    }

    @Patch(":type/:id")
    update(@Req() req: TokenReq, @Param("id") id: string, @Body() dto: AgentUpdateDto) {
        requireScope(req, PERMISSIONS.CONTENT_UPDATE);
        // Pass the token's publish capability so a content.update-only token can't
        // PATCH status straight to APPROVED/SCHEDULED (approval-workflow bypass).
        const canPublish = tokenScopeAllows(req.apiToken.scopes, PERMISSIONS.CONTENT_PUBLISH);
        return this.entries.update(req.apiToken.workspaceId, id, dto, undefined, undefined, canPublish ? [PERMISSIONS.CONTENT_PUBLISH] : []);
    }

    @Post(":type/:id/publish")
    publish(@Req() req: TokenReq, @Param("id") id: string) {
        requireScope(req, PERMISSIONS.CONTENT_PUBLISH);
        return this.entries.publish(req.apiToken.workspaceId, id);
    }

    @Post(":type/:id/unpublish")
    unpublish(@Req() req: TokenReq, @Param("id") id: string) {
        requireScope(req, PERMISSIONS.CONTENT_PUBLISH);
        return this.entries.unpublish(req.apiToken.workspaceId, id);
    }

    @Delete(":type/:id")
    remove(@Req() req: TokenReq, @Param("id") id: string) {
        requireScope(req, PERMISSIONS.CONTENT_DELETE);
        return this.entries.remove(req.apiToken.workspaceId, id);
    }
}
