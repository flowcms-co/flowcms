import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { WEBHOOK_EVENTS, WebhooksService } from "./webhooks.service";

class UpsertWebhookDto {
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() url?: string;
    @IsOptional() @IsArray() @ArrayUnique() @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true }) events?: string[];
    @IsOptional() @IsString() secret?: string;
    @IsOptional() @IsBoolean() enabled?: boolean;
}

@Controller("webhooks")
@RequirePermissions(PERMISSIONS.WEBHOOKS_MANAGE)
export class WebhooksController {
    constructor(private readonly webhooks: WebhooksService) {}

    @Get("events")
    events() {
        return WEBHOOK_EVENTS;
    }

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.webhooks.list(user.workspaceId);
    }

    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: UpsertWebhookDto) {
        return this.webhooks.create(user.workspaceId, dto);
    }

    @Patch(":id")
    update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpsertWebhookDto) {
        return this.webhooks.update(user.workspaceId, id, dto);
    }

    @Delete(":id")
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.webhooks.remove(user.workspaceId, id);
    }

    @Get(":id/deliveries")
    deliveries(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.webhooks.deliveries(user.workspaceId, id);
    }

    @Throttle({ default: { limit: 20, ttl: 60_000 } }) // fires an outbound request
    @Post(":id/test")
    test(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.webhooks.test(user.workspaceId, id);
    }

    @Throttle({ default: { limit: 20, ttl: 60_000 } }) // fires an outbound request
    @Post("deliveries/:deliveryId/resend")
    resend(@CurrentUser() user: AuthUser, @Param("deliveryId") deliveryId: string) {
        return this.webhooks.resend(user.workspaceId, deliveryId);
    }
}
