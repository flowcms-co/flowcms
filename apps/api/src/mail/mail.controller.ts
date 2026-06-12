import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { MailService } from "./mail.service";

class ConnectSmtpDto {
    @IsString() host!: string;
    @IsOptional() @IsInt() port?: number;
    @IsOptional() @IsBoolean() secure?: boolean;
    @IsString() user!: string;
    @IsString() password!: string;
    @IsString() from!: string;
}

class TestDto {
    @IsEmail() to!: string;
}

class UpdateTemplateDto {
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() subject?: string;
    @IsOptional() @IsString() html?: string;
    @IsOptional() @IsBoolean() enabled?: boolean;
}

@Controller("mail")
@RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
export class MailController {
    constructor(private readonly mail: MailService) {}

    @Get("status")
    status(@CurrentUser() user: AuthUser) {
        return this.mail.status(user.workspaceId);
    }

    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @Post("connect")
    connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectSmtpDto) {
        return this.mail.connect(user.workspaceId, dto);
    }

    @Delete()
    disconnect(@CurrentUser() user: AuthUser) {
        return this.mail.disconnect(user.workspaceId);
    }

    @Throttle({ default: { limit: 10, ttl: 60_000 } }) // sends a real email — anti-spam cap
    @Post("test")
    test(@CurrentUser() user: AuthUser, @Body() dto: TestDto) {
        return this.mail.sendTest(user.workspaceId, dto.to);
    }

    @Get("templates")
    templates(@CurrentUser() user: AuthUser) {
        return this.mail.listTemplates(user.workspaceId);
    }

    @Patch("templates/:key")
    updateTemplate(@CurrentUser() user: AuthUser, @Param("key") key: string, @Body() dto: UpdateTemplateDto) {
        return this.mail.updateTemplate(user.workspaceId, key, dto);
    }
}
