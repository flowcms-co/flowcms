import { Body, Controller, Post } from "@nestjs/common";
import { IsArray, IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { ImportService, type ImportSource } from "./import.service";

class ImportSourceDto {
    @IsIn(["wordpress", "strapi", "markdown", "csv", "json", "contentful", "sanity"]) kind!: ImportSource["kind"];
    @IsOptional() @IsString() url?: string;
    @IsOptional() @IsString() token?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) types?: string[];
    @IsOptional() @IsString() text?: string;
    @IsOptional() @IsArray() files?: { name: string; content: string }[];
    @IsOptional() @IsString() typeApiId?: string;
    @IsOptional() @IsString() typeName?: string;
    @IsOptional() @IsString() locale?: string;
    // Contentful
    @IsOptional() @IsString() space?: string;
    @IsOptional() @IsString() environment?: string;
    // Sanity
    @IsOptional() @IsString() project?: string;
    @IsOptional() @IsString() dataset?: string;
    @IsOptional() @IsString() apiVersion?: string;
    // shared: restrict to one source content type / document _type
    @IsOptional() @IsString() docType?: string;
}

class RunImportDto extends ImportSourceDto {
    @IsOptional() @IsObject() _?: object;
}

@Controller("import")
@RequirePermissions(PERMISSIONS.CONTENT_CREATE)
export class ImportController {
    constructor(private readonly importer: ImportService) {}

    @Post("preview")
    preview(@CurrentUser() user: AuthUser, @Body() dto: ImportSourceDto) {
        return this.importer.preview(user.workspaceId, dto);
    }

    @Post("run")
    run(@CurrentUser() user: AuthUser, @Body() dto: RunImportDto) {
        return this.importer.run(user.workspaceId, user.id, dto);
    }
}
