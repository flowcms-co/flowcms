import { Body, Controller, Delete, Get, Param, Put, Query } from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { SelectorMapsService } from "./selector-maps.service";

class UpsertSelectorMapDto {
    @IsString() contentTypeId!: string;
    @IsOptional() @IsString() urlPattern?: string;
    @IsArray() bindings!: unknown[];
}

/**
 * Live-edit selector maps: the CMS-side field→DOM mapping the bridge applies, so
 * the customer's site only needs the universal script (no per-field attributes).
 * Reads need CONTENT_READ; editing the map is a structural action (WORKSPACE_MANAGE).
 */
@Controller("selector-maps")
export class SelectorMapsController {
    constructor(private readonly maps: SelectorMapsService) {}

    @Get()
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    list(@CurrentUser() user: AuthUser, @Query("contentTypeId") contentTypeId: string) {
        return this.maps.list(user.workspaceId, contentTypeId);
    }

    /** Best map for a preview URL (exact path > pattern > type default). */
    @Get("resolve")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    resolve(@CurrentUser() user: AuthUser, @Query("contentTypeId") contentTypeId: string, @Query("url") url: string) {
        return this.maps.resolve(user.workspaceId, contentTypeId, url ?? "");
    }

    @Put()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertSelectorMapDto) {
        return this.maps.upsert(user.workspaceId, dto.contentTypeId, dto.urlPattern ?? "", dto.bindings);
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.maps.remove(user.workspaceId, id);
    }
}
