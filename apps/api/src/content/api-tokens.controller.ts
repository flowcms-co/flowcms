import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ArrayUnique, IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { ApiTokenType } from "@flowcms/db";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { ApiTokensService } from "./api-tokens.service";

/** Scopes a write (AGENT/ADMIN) token can be granted, enforced by the agent API.
 *  "*" means all; an empty list means unrestricted (back-compat). */
const TOKEN_SCOPES = [
    "*",
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_CREATE,
    PERMISSIONS.CONTENT_UPDATE,
    PERMISSIONS.CONTENT_PUBLISH,
    PERMISSIONS.CONTENT_DELETE,
] as const;

class CreateApiTokenDto {
    @IsString()
    name!: string;

    @IsOptional()
    @IsIn(["CONTENT", "PREVIEW", "AGENT", "ADMIN"])
    type?: ApiTokenType;

    @IsOptional()
    @IsString()
    expiresAt?: string;

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsIn(TOKEN_SCOPES, { each: true })
    scopes?: string[];
}

@Controller("api-tokens")
@RequirePermissions(PERMISSIONS.APITOKENS_MANAGE)
export class ApiTokensController {
    constructor(
        private readonly tokens: ApiTokensService,
        private readonly audit: AuditService,
    ) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.tokens.list(user.workspaceId);
    }

    @Post()
    async create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiTokenDto, @Req() req: Request) {
        const created = await this.tokens.create(user.workspaceId, user.id, dto);
        // never log the token value itself — only its name + scope.
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "apitoken.create", resource: "ApiToken", resourceId: (created as { id?: string })?.id, metadata: { name: dto.name, type: dto.type ?? "CONTENT" }, ip: req.ip });
        return created;
    }

    @Delete(":id")
    async revoke(@CurrentUser() user: AuthUser, @Param("id") id: string, @Req() req: Request) {
        const res = await this.tokens.revoke(user.workspaceId, id);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "apitoken.revoke", resource: "ApiToken", resourceId: id, ip: req.ip });
        return res;
    }
}
