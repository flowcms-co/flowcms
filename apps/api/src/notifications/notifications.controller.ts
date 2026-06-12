import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { IsIn } from "class-validator";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { NotificationsService } from "./notifications.service";

class DigestPrefDto {
    @IsIn(["off", "daily", "weekly"]) digestFrequency!: "off" | "daily" | "weekly";
}

/** A user's own notifications — any authenticated user, no special permission. */
@Controller("notifications")
export class NotificationsController {
    constructor(private readonly notifications: NotificationsService) {}

    /** Email-digest preference for the current user. */
    @Get("preferences")
    getPreferences(@CurrentUser() user: AuthUser) {
        return this.notifications.getPreferences(user.id);
    }

    @Patch("preferences")
    setPreferences(@CurrentUser() user: AuthUser, @Body() dto: DigestPrefDto) {
        return this.notifications.setPreferences(user.id, dto.digestFrequency);
    }

    /** Send the current user a digest right now (preview the email). */
    @Post("digest/test")
    sendDigestTest(@CurrentUser() user: AuthUser) {
        return this.notifications.sendDigest(user.workspaceId, user.id, { force: true });
    }

    @Get()
    list(@CurrentUser() user: AuthUser, @Query("unreadOnly") unreadOnly?: string, @Query("limit") limit?: string) {
        return this.notifications.list(user.workspaceId, user.id, {
            unreadOnly: unreadOnly === "true",
            limit: limit ? Number(limit) : undefined,
        });
    }

    @Get("unread-count")
    unreadCount(@CurrentUser() user: AuthUser) {
        return this.notifications.unreadCount(user.workspaceId, user.id);
    }

    @Post(":id/read")
    markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.notifications.markRead(user.workspaceId, user.id, id);
    }

    @Post("read-all")
    markAllRead(@CurrentUser() user: AuthUser) {
        return this.notifications.markAllRead(user.workspaceId, user.id);
    }
}
