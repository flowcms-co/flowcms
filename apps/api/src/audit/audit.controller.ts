import { Controller, Get, Query } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AuditService } from "./audit.service";

/** Read the workspace security audit trail (Super Admin / Admin only). */
@Controller("audit")
@RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
export class AuditController {
    constructor(private readonly audit: AuditService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
        // `Number(limit) || 100` guards against a non-numeric ?limit (NaN → 100).
        return this.audit.list(user.workspaceId, Number(limit) || 100);
    }
}
