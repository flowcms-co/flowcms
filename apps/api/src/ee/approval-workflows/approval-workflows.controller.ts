import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { ApprovalWorkflowsService } from "./approval-workflows.service";

/**
 * EE (Pro) — approval policy config. The review mechanism (recording decisions,
 * flipping to APPROVED) is core; this sets how many sign-offs are required before
 * publishing, which the gate enforces. Gated by `approval_workflows`.
 */
@Controller("ee/approval-workflows")
@UseGuards(FeatureGuard)
@RequireFeature("approval_workflows")
export class ApprovalWorkflowsController {
    constructor(private readonly approvals: ApprovalWorkflowsService) {}

    @Get()
    get(@CurrentUser() user: AuthUser) {
        return this.approvals.getPolicy(user.workspaceId);
    }

    @Put()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    set(@CurrentUser() user: AuthUser, @Body("approvalsRequired") approvalsRequired: unknown) {
        return this.approvals.setPolicy(user.workspaceId, Number(approvalsRequired));
    }
}
