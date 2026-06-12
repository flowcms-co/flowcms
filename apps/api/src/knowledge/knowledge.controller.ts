import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { KnowledgeService } from "./knowledge.service";

class UpsertKnowledgeDto {
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() content?: string;
    @IsOptional() @IsBoolean() enabled?: boolean;
    @IsOptional() @IsBoolean() universal?: boolean;
    @IsOptional() @IsArray() @IsString({ each: true }) contentTypeApiIds?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) tools?: string[];
}

@Controller("knowledge")
@RequirePermissions(PERMISSIONS.KNOWLEDGE_MANAGE)
export class KnowledgeController {
    constructor(private readonly knowledge: KnowledgeService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.knowledge.list(user.workspaceId);
    }

    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: UpsertKnowledgeDto) {
        return this.knowledge.create(user.workspaceId, user.id, dto);
    }

    @Patch(":id")
    update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpsertKnowledgeDto) {
        return this.knowledge.update(user.workspaceId, id, dto);
    }

    @Delete(":id")
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.knowledge.remove(user.workspaceId, id);
    }

    @Get(":id/export")
    exportMd(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.knowledge.exportMd(user.workspaceId, id);
    }
}
