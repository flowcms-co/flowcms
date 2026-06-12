import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../auth/decorators";
import { ApiTokenGuard } from "./api-token.guard";
import { PublicQueryService, type QueryOpts } from "./public-query.service";

type TokenReq = Request & { apiToken: { workspaceId: string; type: string } };
const META = new Set(["id", "slug", "locale", "publishedAt", "createdAt", "updatedAt"]);

/** Reshape a flattened delivery object into Strapi v4 { id, attributes }. */
function toStrapi(o: Record<string, unknown>) {
    const { id, ...rest } = o;
    return { id, attributes: rest };
}

/** Map Strapi-style query params onto our QueryOpts. */
function parseStrapi(req: TokenReq, query: Record<string, unknown>): { opts: QueryOpts; page: number; pageSize: number } {
    const preview = req.apiToken.type === "PREVIEW" || req.apiToken.type === "ADMIN";
    const pag = (query.pagination ?? {}) as { page?: string; pageSize?: string };
    const page = Math.max(Number(pag.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(pag.pageSize) || 25, 1), 100);

    // filters[field][$eq]=value  (we support equality)
    const filters: Record<string, string> = {};
    const raw = (query.filters ?? {}) as Record<string, unknown>;
    for (const [field, cond] of Object.entries(raw)) {
        if (cond && typeof cond === "object") {
            const eq = (cond as Record<string, unknown>)["$eq"] ?? Object.values(cond as Record<string, unknown>)[0];
            if (typeof eq === "string") filters[field] = eq;
        } else if (typeof cond === "string") {
            filters[field] = cond;
        }
    }

    let sort: string | undefined;
    const s = query.sort;
    if (typeof s === "string") sort = s.replace(/:(asc|desc)$/i, (m) => m.toLowerCase());
    else if (Array.isArray(s) && typeof s[0] === "string") sort = s[0];

    const fieldsRaw = query.fields;
    const fields = typeof fieldsRaw === "string" ? fieldsRaw.split(",") : Array.isArray(fieldsRaw) ? (fieldsRaw as string[]) : undefined;

    return {
        page,
        pageSize,
        opts: {
            limit: pageSize,
            offset: (page - 1) * pageSize,
            sort,
            locale: typeof query.locale === "string" ? query.locale : undefined,
            fields: fields?.filter((f) => !META.has(f)),
            filters,
            preview,
        },
    };
}

/**
 * Strapi-shaped delivery API. Returns content in Strapi v4's
 * `{ data: [{ id, attributes }], meta: { pagination } }` shape with Strapi-style
 * query params (pagination[page], filters[field][$eq], sort, locale, fields), so
 * a site built for Strapi can point its base path at `/api/strapi` and keep
 * working with the same response handling. Auth is the same Bearer API token.
 */
@Controller("strapi")
@Public()
@UseGuards(ApiTokenGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } }) // per-token delivery headroom
export class StrapiController {
    constructor(private readonly query: PublicQueryService) {}

    @Get(":type")
    async list(@Req() req: TokenReq, @Param("type") type: string, @Query() query: Record<string, unknown>) {
        const { opts, page, pageSize } = parseStrapi(req, query);
        const res = await this.query.list(req.apiToken.workspaceId, type, opts);
        // Single-types come back as { data: object|null }; collections as { data, meta }.
        if (!Array.isArray((res as { data: unknown }).data)) {
            const single = (res as { data: Record<string, unknown> | null }).data;
            return { data: single ? toStrapi(single) : null, meta: {} };
        }
        const { data, meta } = res as { data: Record<string, unknown>[]; meta: { total: number } };
        return {
            data: data.map(toStrapi),
            meta: { pagination: { page, pageSize, pageCount: Math.ceil(meta.total / pageSize), total: meta.total } },
        };
    }

    @Get(":type/:idOrSlug")
    async one(@Req() req: TokenReq, @Param("type") type: string, @Param("idOrSlug") idOrSlug: string, @Query() query: Record<string, unknown>) {
        const { opts } = parseStrapi(req, query);
        const res = await this.query.one(req.apiToken.workspaceId, type, idOrSlug, opts);
        const obj = (res as { data: Record<string, unknown> | null }).data;
        return { data: obj ? toStrapi(obj) : null, meta: {} };
    }
}
