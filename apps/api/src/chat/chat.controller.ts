import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { ChatService } from "./chat.service";

class CreateChannelDto {
    @IsString() @MinLength(1) name!: string;
    @IsOptional() @IsBoolean() isPrivate?: boolean;
}

class PostMessageDto {
    @IsString() @MinLength(1) body!: string;
}

@Controller("chat")
@RequirePermissions(PERMISSIONS.CHAT_USE)
export class ChatController {
    constructor(private readonly chat: ChatService) {}

    @Get("channels")
    channels(@CurrentUser() user: AuthUser) {
        return this.chat.listChannels(user.workspaceId, user.id);
    }

    /** Workspace members for the @mention autocomplete. */
    @Get("members")
    members(@CurrentUser() user: AuthUser) {
        return this.chat.members(user.workspaceId);
    }

    @Post("channels")
    createChannel(@CurrentUser() user: AuthUser, @Body() dto: CreateChannelDto) {
        return this.chat.createChannel(user.workspaceId, user.id, dto);
    }

    @Get("channels/:id/messages")
    messages(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("after") after?: string) {
        return this.chat.listMessages(user.workspaceId, user.id, id, after);
    }

    @Post("channels/:id/messages")
    post(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: PostMessageDto) {
        return this.chat.postMessage(user.workspaceId, user.id, id, dto.body);
    }
}
