import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { Public } from "../auth/decorators";
import { ApiTokenGuard } from "./api-token.guard";
import { PublicQueryService, type QueryOpts } from "./public-query.service";

type TokenReq = Request & { apiToken: { workspaceId: string; type: string } };

/** The signed preview token a site forwards: header first, `preview_token` query param as a fallback. */
function previewTokenOf(req: Request, query: Record<string, unknown>): string | undefined {
    const h = req.headers["x-flowcms-preview-token"];
    const t = (typeof h === "string" ? h : undefined) ?? (typeof query.preview_token === "string" ? query.preview_token : undefined);
    return t && t.length <= 300 ? t : undefined;
}

/** Draft content must never sit in a browser, CDN or proxy cache. */
const noStore = (res: Response) => void res.setHeader("Cache-Control", "private, no-store");

/** Parse Strapi-style ?filters[key]=value plus ?fields=a,b,ref.c and ?populate= into QueryOpts. */
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
        populate: typeof query.populate === "string" ? query.populate : undefined,
        filters,
        preview,
    };
}

/**
 * Public read API for external sites — authenticated by a content API token.
 * Supports pagination, ?sort, ?fields (including `ref.field` to project referenced
 * entries), ?populate (none | field,field), ?locale and ?filters[key]=value, plus
 * single-type content. PREVIEW/ADMIN tokens also see unpublished (draft) content.
 */
@Controller("public")
@Public() // skip the session guard
@UseGuards(ApiTokenGuard) // require a Bearer API token instead
// Delivery traffic is per-token (see throttler guard); give sites generous headroom.
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class PublicController {
    constructor(private readonly query: PublicQueryService) {}

    /** Does this preview token open this entry? A site calls it to decide whether to switch on edit mode. */
    @Get("preview/verify")
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    async verifyPreview(@Req() req: TokenReq, @Res({ passthrough: true }) res: Response, @Query() query: Record<string, unknown>) {
        noStore(res);
        const s = (v: unknown) => (typeof v === "string" ? v : "");
        return this.query.verifyPreview(req.apiToken.workspaceId, s(query.type), s(query.slug), previewTokenOf(req, { preview_token: query.token }) ?? "");
    }

    @Get(":type")
    async list(@Req() req: TokenReq, @Res({ passthrough: true }) res: Response, @Param("type") type: string, @Query() query: Record<string, unknown>) {
        // Lists never honour a preview token (one token unlocks one entry), but their response is still never cached.
        if (previewTokenOf(req, query)) noStore(res);
        return this.query.list(req.apiToken.workspaceId, type, parseOpts(req, query));
    }

    @Get(":type/:idOrSlug")
    async one(
        @Req() req: TokenReq,
        @Res({ passthrough: true }) res: Response,
        @Param("type") type: string,
        @Param("idOrSlug") idOrSlug: string,
        @Query() query: Record<string, unknown>,
    ) {
        const token = previewTokenOf(req, query);
        if (token) noStore(res);
        return this.query.one(req.apiToken.workspaceId, type, idOrSlug, parseOpts(req, query), token);
    }
}
