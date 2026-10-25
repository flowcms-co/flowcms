import { Body, Controller, Delete, Get, Put } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { StorageService } from "./storage.service";

class SaveStorageDto {
    @IsOptional() @IsString() @MaxLength(500) endpoint?: string;
    @IsOptional() @IsString() @MaxLength(64) region?: string;
    @IsString() @MaxLength(255) bucket!: string;
    @IsOptional() @IsString() @MaxLength(500) publicUrl?: string;
    @IsOptional() @IsBoolean() forcePathStyle?: boolean;
    @IsOptional() @IsString() @MaxLength(256) accessKeyId?: string;
    @IsOptional() @IsString() @MaxLength(512) secretAccessKey?: string;
}

/** Media storage (Settings > Integrations > Storage). Changing it needs a Super Admin. */
@Controller("storage")
@RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
export class StorageController {
    constructor(private readonly storage: StorageService) {}

    @Get()
    status() {
        return this.storage.status();
    }

    @Put()
    save(@CurrentUser() user: AuthUser, @Body() dto: SaveStorageDto) {
        return this.storage.save(user, dto);
    }

    @Delete()
    remove(@CurrentUser() user: AuthUser) {
        return this.storage.disconnect(user);
    }
}
