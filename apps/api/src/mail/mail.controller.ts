import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { BadRequestException } from "@nestjs/common";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { type ConnectInput, MailService } from "./mail.service";

/**
 * One DTO for every provider; fields are validated per-provider in the handler
 * (SMTP needs host/user/password, Resend/SendGrid need an apiKey). `from` is always required.
 */
class ConnectEmailDto {
    @IsOptional() @IsIn(["smtp", "resend", "sendgrid"]) provider?: "smtp" | "resend" | "sendgrid";
    @IsString() from!: string;
    // SMTP
    @IsOptional() @IsString() host?: string;
    @IsOptional() @IsInt() port?: number;
    @IsOptional() @IsBoolean() secure?: boolean;
    @IsOptional() @IsString() user?: string;
    @IsOptional() @IsString() password?: string;
    // Resend / SendGrid
    @IsOptional() @IsString() apiKey?: string;
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
    connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectEmailDto) {
        return this.mail.connect(user.workspaceId, this.normalizeConnect(dto));
    }

    /** Validate the provider-specific fields and shape the service input (the secret may be
     *  blank on an update, in which case the service keeps the stored one). */
    private normalizeConnect(dto: ConnectEmailDto): ConnectInput {
        if (dto.provider === "resend" || dto.provider === "sendgrid") {
            return { provider: dto.provider, apiKey: dto.apiKey ?? "", from: dto.from };
        }
        if (!dto.host || !dto.user) throw new BadRequestException("host and user are required for SMTP.");
        return { provider: "smtp", host: dto.host, port: dto.port, secure: dto.secure, user: dto.user, password: dto.password ?? "", from: dto.from };
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

    @Delete("templates/:key")
    resetTemplate(@CurrentUser() user: AuthUser, @Param("key") key: string) {
        return this.mail.resetTemplate(user.workspaceId, key);
    }
}
