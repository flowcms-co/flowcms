import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { WEBHOOK_EVENTS, WebhooksService } from "./webhooks.service";
import { AuditService } from "../audit/audit.service";

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
    constructor(
        private readonly webhooks: WebhooksService,
        private readonly audit: AuditService,
    ) {}

    @Get("events")
    events() {
        return WEBHOOK_EVENTS;
    }

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.webhooks.list(user.workspaceId);
    }

    @Post()
    async create(@CurrentUser() user: AuthUser, @Body() dto: UpsertWebhookDto) {
        const w = (await this.webhooks.create(user.workspaceId, dto)) as { id?: string };
        this.audit.record({ workspaceId: user.workspaceId, action: "webhook.create", resource: "Webhook", resourceId: w?.id, title: dto.name ?? null, metadata: { url: dto.url, events: dto.events } });
        return w;
    }

    @Patch(":id")
    async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpsertWebhookDto) {
        const w = await this.webhooks.update(user.workspaceId, id, dto);
        // Never log the signing secret itself, only that it changed.
        const { secret, ...rest } = dto;
        this.audit.record({ workspaceId: user.workspaceId, action: "webhook.update", resource: "Webhook", resourceId: id, title: dto.name ?? null, metadata: { ...rest, ...(secret !== undefined ? { secretChanged: true } : {}) } });
        return w;
    }

    @Delete(":id")
    async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        const r = await this.webhooks.remove(user.workspaceId, id);
        this.audit.record({ workspaceId: user.workspaceId, action: "webhook.delete", resource: "Webhook", resourceId: id });
        return r;
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
