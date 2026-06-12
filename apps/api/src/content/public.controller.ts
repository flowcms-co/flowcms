import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../auth/decorators";
import { ApiTokenGuard } from "./api-token.guard";
import { PublicQueryService, type QueryOpts } from "./public-query.service";

type TokenReq = Request & { apiToken: { workspaceId: string; type: string } };

/** Parse Strapi-style ?filters[key]=value plus ?fields=a,b into QueryOpts. */
function parseOpts(req: TokenReq, query: Record<string, unknown>): QueryOpts {
    const preview = req.apiToken.type === "PREVIEW" || req.apiToken.type === "ADMIN";
    const filters: Record<string, string> = {};
    // Express (qs) parses `?filters[title]=x` into a nested object…
    const nested = query.filters;
    if (nested && typeof nested === "object") {
        for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
            if (typeof v === "string") filters[k] = v;
        }
    }
    // …but also accept a flat `filters[title]` key as a fallback.
    for (const [key, value] of Object.entries(query)) {
        const m = key.match(/^filters\[(.+)\]$/);
        if (m && typeof value === "string") filters[m[1]] = value;
    }
    return {
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
        sort: typeof query.sort === "string" ? query.sort : undefined,
        locale: typeof query.locale === "string" ? query.locale : undefined,
        fields: typeof query.fields === "string" ? query.fields.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        filters,
        preview,
    };
}

/**
 * Public read API for external sites — authenticated by a content API token.
 * Supports pagination, ?sort, ?fields, ?locale and ?filters[key]=value, plus
 * single-type content. PREVIEW/ADMIN tokens also see unpublished (draft) content.
 */
@Controller("public")
@Public() // skip the session guard
@UseGuards(ApiTokenGuard) // require a Bearer API token instead
// Delivery traffic is per-token (see throttler guard); give sites generous headroom.
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class PublicController {
    constructor(private readonly query: PublicQueryService) {}

    @Get(":type")
    async list(@Req() req: TokenReq, @Param("type") type: string, @Query() query: Record<string, unknown>) {
        return this.query.list(req.apiToken.workspaceId, type, parseOpts(req, query));
    }

    @Get(":type/:idOrSlug")
    async one(
        @Req() req: TokenReq,
        @Param("type") type: string,
        @Param("idOrSlug") idOrSlug: string,
        @Query() query: Record<string, unknown>,
    ) {
        return this.query.one(req.apiToken.workspaceId, type, idOrSlug, parseOpts(req, query));
    }
}
