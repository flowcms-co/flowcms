import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LicenseService } from "../../license/license.service";
import type { ApprovalPort } from "../../content/approval.port";

/** Transitions that require sign-off, and statuses that already cleared it. */
const NEEDS_SIGNOFF = new Set(["PUBLISHED", "SCHEDULED"]);
const ALREADY_CLEARED = new Set(["APPROVED", "SCHEDULED", "PUBLISHED"]);

/**
 * EE (Pro) — approval workflow enforcement + policy. Implements the core
 * ApprovalPort: blocks a transition into a publish state until the entry has been
 * signed off (its status reached APPROVED via reviewer decisions). No-ops unless
 * the install is licensed for `approval_workflows`, so Community keeps publishing
 * freely (reviews stay advisory).
 */
@Injectable()
export class ApprovalWorkflowsService implements ApprovalPort {
    constructor(
        private readonly prisma: PrismaService,
        private readonly license: LicenseService,
    ) {}

    async assertCanPublish(workspaceId: string, entry: { id: string; status: string }, nextStatus: string): Promise<void> {
        if (!(await this.license.has("approval_workflows"))) return; // unlicensed → unenforced
        if (!NEEDS_SIGNOFF.has(nextStatus)) return;
        if (ALREADY_CLEARED.has(entry.status)) return; // already signed off (or live/scheduled)
        const required = (await this.getPolicy(workspaceId)).approvalsRequired;
        throw new ForbiddenException(
            `This content needs ${required} approval${required > 1 ? "s" : ""} before it can be published. ` +
                `Submit it for review and have ${required > 1 ? "reviewers" : "a reviewer"} approve it.`,
        );
    }

    /** Approval is only enforced when the workspace is licensed for it. */
    async isEnforced(_workspaceId: string): Promise<boolean> {
        return this.license.has("approval_workflows");
    }

    async getPolicy(workspaceId: string) {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { approvalsRequired: true } });
        return { approvalsRequired: ws?.approvalsRequired ?? 1 };
    }

    async setPolicy(workspaceId: string, approvalsRequired: number) {
        const n = Number.isFinite(approvalsRequired) ? Math.max(1, Math.min(5, Math.floor(approvalsRequired))) : 1;
        const ws = await this.prisma.workspace.update({ where: { id: workspaceId }, data: { approvalsRequired: n } });
        return { approvalsRequired: ws.approvalsRequired };
    }
}
