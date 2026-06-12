import { Controller, Get, Query } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { UsageService } from "./usage.service";

@Controller("usage")
@RequirePermissions(PERMISSIONS.AI_USE)
export class UsageController {
    constructor(private readonly usage: UsageService) {}

    @Get("summary")
    summary(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
        const n = Math.min(Math.max(Number(days) || 30, 1), 365);
        return this.usage.summary(user.workspaceId, n);
    }
}
