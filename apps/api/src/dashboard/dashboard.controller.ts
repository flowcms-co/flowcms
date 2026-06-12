import { Controller, Get } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@RequirePermissions(PERMISSIONS.CONTENT_READ)
export class DashboardController {
    constructor(private readonly dashboard: DashboardService) {}

    @Get("summary")
    summary(@CurrentUser() user: AuthUser) {
        return this.dashboard.summary(user.workspaceId, user.id);
    }
}
