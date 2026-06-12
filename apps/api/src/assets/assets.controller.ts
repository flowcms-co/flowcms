import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UploadedFile,
    UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AssetsService } from "./assets.service";
import { JobsService } from "../jobs/jobs.service";

class UpdateAssetDto {
    @IsOptional() @IsString() alt?: string;
    @IsOptional() @IsString() folder?: string;
    @IsOptional() @IsString() filename?: string;
}

class BulkProcessDto {
    @IsString({ each: true }) ids!: string[];
}

type MulterFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Controller("assets")
export class AssetsController {
    constructor(
        private readonly assets: AssetsService,
        private readonly jobs: JobsService,
    ) {}

    /** List the workspace's media (any authenticated member can view). */
    @Get()
    list(
        @CurrentUser() user: AuthUser,
        @Query("folder") folder?: string,
        @Query("limit") limit?: string,
        @Query("offset") offset?: string,
    ) {
        const lim = limit != null && limit !== "" && Number.isFinite(Number(limit)) ? Number(limit) : undefined;
        const off = offset != null && offset !== "" && Number.isFinite(Number(offset)) ? Number(offset) : undefined;
        return this.assets.list(user.workspaceId, folder, lim, off);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
    @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 26 * 1024 * 1024 } }))
    upload(
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: MulterFile,
        @Body("folder") folder?: string,
    ) {
        return this.assets.upload(user.workspaceId, user.id, file, folder);
    }

    @Patch(":id")
    @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
    update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateAssetDto) {
        return this.assets.update(user.workspaceId, id, dto);
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.assets.remove(user.workspaceId, id);
    }

    @Post(":id/generate-alt")
    @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
    generateAlt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.assets.generateAlt(user.workspaceId, user.id, id);
    }

    /** Process a batch of uploaded images (AI alt text) as a background job. */
    @Post("bulk-process")
    @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
    bulkProcess(@CurrentUser() user: AuthUser, @Body() dto: BulkProcessDto) {
        const n = dto.ids?.length ?? 0;
        return this.jobs.enqueue(user.workspaceId, user.id, "assets.bulkProcess", `Process ${n} image${n === 1 ? "" : "s"}`, { ids: dto.ids }, n);
    }
}
