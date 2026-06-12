import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AiService } from "./ai.service";
import { GenerateDto } from "./dto";

@Controller("ai")
@RequirePermissions(PERMISSIONS.AI_USE)
export class AiController {
    constructor(private readonly ai: AiService) {}

    @Get("providers")
    providers(@CurrentUser() user: AuthUser) {
        return this.ai.listConnected(user.workspaceId);
    }

    // Transparency: which model the unified tier router would use per task on this plan.
    @Get("route-preview")
    routePreview(@CurrentUser() user: AuthUser) {
        return this.ai.routePreview(user.workspaceId);
    }

    // Runaway-cost guard: AI generations hit the user's paid provider, so cap
    // them well below what a human needs but enough for normal bursts.
    @Throttle({ default: { limit: 40, ttl: 60_000 } })
    @Post("generate")
    generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateDto) {
        return this.ai.generate(user.workspaceId, user.id, dto);
    }
}
