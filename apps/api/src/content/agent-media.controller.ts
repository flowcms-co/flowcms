import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Type } from "class-transformer";
import { Allow, ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from "class-validator";
import { Public } from "../auth/decorators";
import { AgentTokenGuard } from "./agent-token.guard";
import { tokenScopeAllows } from "./agent-scope";
import { AssetsService, UPLOAD_CEILING_BYTES, type UploadedFile as FileUpload } from "../assets/assets.service";

type TokenReq = Request & { apiToken: { workspaceId: string; scopes?: unknown } };
type MediaScope = "media.read" | "media.write" | "media.delete";

/** Media scopes are opt-in: a token has one only when it was picked for it. */
function requireScope(req: TokenReq, scope: MediaScope): void {
    if (!tokenScopeAllows(req.apiToken.scopes, scope)) throw new ForbiddenException(`This token is not authorized for '${scope}'. Media scopes are granted per token in Settings › API keys.`);
}

/** Tags arrive as a list (JSON) or a comma-separated string (multipart). */
function tagList(v: unknown): string[] | undefined {
    if (v === undefined || v === null || v === "") return undefined;
    if (Array.isArray(v)) return v.map(String);
    const s = String(v).trim();
    if (s.startsWith("[")) {
        try {
            return (JSON.parse(s) as unknown[]).map(String);
        } catch {
            throw new BadRequestException("tags must be a list or comma-separated text.");
        }
    }
    return s.split(",");
}

class UploadDto {
    @IsOptional() @IsUrl({ protocols: ["http", "https"], require_protocol: true }) url?: string;
    @IsOptional() @IsString() @MaxLength(1000) alt?: string;
    @IsOptional() @IsString() @MaxLength(2000) caption?: string;
    @IsOptional() @IsString() @MaxLength(100) folder?: string;
    @Allow() tags?: unknown;
}

class ReplaceDto {
    @IsOptional() @IsUrl({ protocols: ["http", "https"], require_protocol: true }) url?: string;
}

class EditDto {
    @IsOptional() @IsString() @MaxLength(1000) alt?: string;
    @IsOptional() @IsString() @MaxLength(2000) caption?: string;
    @IsOptional() @IsString() @MaxLength(200) filename?: string;
    @IsOptional() @IsString() @MaxLength(100) folder?: string;
    @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) tags?: string[];
}

class BulkEditItem extends EditDto {
    @IsString() id!: string;
}

class BulkEditDto {
    @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BulkEditItem) items!: BulkEditItem[];
}

class FolderDto {
    @IsString() @MaxLength(100) name!: string;
}

const num = (v?: string) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const yes = (v?: string) => v === "1" || v === "true";

/**
 * Agent API for the media library, with its own token scopes: media.read,
 * media.write, media.delete (none granted by "*" or to existing tokens). Every
 * upload, edit, replace, move and delete is in the activity log under the token's
 * name, and fires media.created / updated / replaced / deleted webhooks.
 *
 * Registered before AgentController so `/agent/assets` isn't read as a content type.
 */
@Controller("agent")
@Public()
@UseGuards(AgentTokenGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class AgentMediaController {
    constructor(private readonly assets: AssetsService) {}

    /** ?q=&folder=&type=image|video|doc&width=&height=&unused=&missingAlt=&tag=&limit=&offset= → { items, total }.
     *  width/height are minimums; folder=none lists files in no folder. */
    @Get("assets")
    list(@Req() req: TokenReq, @Query() q: Record<string, string | undefined>) {
        requireScope(req, "media.read");
        return this.assets.search(req.apiToken.workspaceId, {
            q: q.q,
            folder: q.folder,
            type: q.type,
            width: num(q.width),
            height: num(q.height),
            unused: yes(q.unused),
            missingAlt: yes(q.missingAlt),
            tag: q.tag,
            limit: num(q.limit),
            offset: num(q.offset),
        });
    }

    @Get("assets/:id")
    get(@Req() req: TokenReq, @Param("id") id: string) {
        requireScope(req, "media.read");
        return this.assets.get(req.apiToken.workspaceId, id);
    }

    /** Every entry and field path that uses the asset (live, and `draft:` paths). */
    @Get("assets/:id/usage")
    usage(@Req() req: TokenReq, @Param("id") id: string) {
        requireScope(req, "media.read");
        return this.assets.usageDetail(req.apiToken.workspaceId, id);
    }

    /** Upload a file (multipart `file`) or import one (`{ "url": "https://..." }`), with
     *  alt, caption, folder and tags. Returns the asset; `ref` is the `/media/<key>`
     *  reference content fields store. The same bytes already in the library return
     *  that asset (`existing: true`) instead of a copy. */
    @Post("assets")
    @UseInterceptors(FileInterceptor("file", { limits: { fileSize: UPLOAD_CEILING_BYTES } }))
    async upload(@Req() req: TokenReq, @UploadedFile() file: FileUpload | undefined, @Body() dto: UploadDto) {
        requireScope(req, "media.write");
        const ws = req.apiToken.workspaceId;
        if (!file && !dto.url) throw new BadRequestException("Send a multipart `file`, or `url` to import from.");
        const source = file ?? (await this.assets.fetchUrl(ws, dto.url!));
        return this.assets.upload(ws, null, source, dto.folder, { alt: dto.alt, caption: dto.caption, tags: tagList(dto.tags), dedupe: true });
    }

    /** Edit many at once: { items: [{ id, alt?, caption?, filename?, folder?, tags? }] }. */
    @Patch("assets")
    bulkEdit(@Req() req: TokenReq, @Body() dto: BulkEditDto) {
        requireScope(req, "media.write");
        return this.assets.updateMany(req.apiToken.workspaceId, dto.items);
    }

    @Patch("assets/:id")
    edit(@Req() req: TokenReq, @Param("id") id: string, @Body() dto: EditDto) {
        requireScope(req, "media.write");
        return this.assets.update(req.apiToken.workspaceId, id, dto);
    }

    /** Swap the file (multipart `file` or `{ url }`) and keep the id: every entry using
     *  it updates at once. Returns the asset and `affectedEntries`. */
    @Post("assets/:id/replace")
    @UseInterceptors(FileInterceptor("file", { limits: { fileSize: UPLOAD_CEILING_BYTES } }))
    async replace(@Req() req: TokenReq, @Param("id") id: string, @UploadedFile() file: FileUpload | undefined, @Body() dto: ReplaceDto) {
        requireScope(req, "media.write");
        const ws = req.apiToken.workspaceId;
        if (!file && !dto.url) throw new BadRequestException("Send a multipart `file`, or `url` to import from.");
        return this.assets.replace(ws, id, file ?? (await this.assets.fetchUrl(ws, dto.url!)));
    }

    /** Into "Deleted items" for 30 days. Refused (409, with the usage) while an entry
     *  uses the file, unless ?force=true. */
    @Delete("assets/:id")
    remove(@Req() req: TokenReq, @Param("id") id: string, @Query("force") force?: string) {
        requireScope(req, "media.delete");
        return this.assets.remove(req.apiToken.workspaceId, id, { force: yes(force) });
    }

    @Get("asset-folders")
    folders(@Req() req: TokenReq) {
        requireScope(req, "media.read");
        return this.assets.folders(req.apiToken.workspaceId);
    }

    @Post("asset-folders")
    createFolder(@Req() req: TokenReq, @Body() dto: FolderDto) {
        requireScope(req, "media.write");
        return this.assets.createFolder(req.apiToken.workspaceId, dto.name);
    }

    /** Rename: its files move with it. */
    @Patch("asset-folders/:name")
    renameFolder(@Req() req: TokenReq, @Param("name") name: string, @Body() dto: FolderDto) {
        requireScope(req, "media.write");
        return this.assets.renameFolder(req.apiToken.workspaceId, name, dto.name);
    }

    /** Refused while it holds files, unless ?force=true (files move to no folder). */
    @Delete("asset-folders/:name")
    deleteFolder(@Req() req: TokenReq, @Param("name") name: string, @Query("force") force?: string) {
        requireScope(req, "media.delete");
        return this.assets.deleteFolder(req.apiToken.workspaceId, name, yes(force));
    }
}
