import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { AiBudgetsService } from "./ai-budgets.service";

/**
 * EE (Pro) — AI spend caps. Read the workspace's month-to-date AI cost vs its
 * budget; billing managers set the cap. Gated by `ai_budgets` (Community → 403).
 * Enforcement happens in the core AI gateway via the AiBudgetPort this provides.
 */
@Controller("ee/ai-budgets")
@UseGuards(FeatureGuard)
@RequireFeature("ai_budgets")
export class AiBudgetsController {
    constructor(private readonly budgets: AiBudgetsService) {}

    @Get()
    status(@CurrentUser() user: AuthUser) {
        return this.budgets.status(user.workspaceId);
    }

    @Put()
    @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
    set(@CurrentUser() user: AuthUser, @Body("usd") usd: unknown) {
        const n = Number(usd);
        return this.budgets.setBudget(user.workspaceId, Number.isFinite(n) && n > 0 ? n : null);
    }
}
