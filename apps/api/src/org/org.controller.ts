import { Body, Controller, Get, Put } from "@nestjs/common";
import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { RequirePermissions } from "../auth/decorators";
import { OrgService } from "./org.service";

class UpdateOrgDto {
    @IsOptional() @IsString() @MaxLength(200) legalName?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) addressLines?: string[];
    @IsOptional() @IsString() @MaxLength(80) taxId?: string;
    @IsOptional() @IsString() @MaxLength(200) billingEmail?: string;
}

/** Organization / billing details for invoices + vendor emails. Any member can read it
 *  (the invoice shows it); admins edit. */
@Controller("org")
export class OrgController {
    constructor(private readonly org: OrgService) {}

    @Get()
    get() {
        return this.org.get();
    }

    @Put()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    update(@Body() dto: UpdateOrgDto) {
        return this.org.update(dto);
    }
}
