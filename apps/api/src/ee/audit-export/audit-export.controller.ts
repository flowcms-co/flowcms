import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { PrismaService } from "../../prisma/prisma.service";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";

const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * EE (Pro) — full audit-log export to CSV (for retention / SIEM ingestion).
 * Gated by the `audit_export` entitlement; Community gets a 403 from FeatureGuard.
 */
@Controller("ee/audit")
@RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
@UseGuards(FeatureGuard)
@RequireFeature("audit_export")
export class AuditExportController {
    constructor(private readonly prisma: PrismaService) {}

    @Get("export")
    async export(@CurrentUser() user: AuthUser, @Query("limit") limit: string | undefined, @Res() res: Response, @Req() _req: Request) {
        const rows = await this.prisma.auditLog.findMany({
            where: { workspaceId: user.workspaceId },
            orderBy: { createdAt: "desc" },
            take: Math.min(Number(limit) || 5000, 50000),
            include: { user: { select: { email: true, name: true } } },
        });
        const header = "createdAt,action,resource,resourceId,actor,ip,metadata";
        const lines = rows.map((r) =>
            [r.createdAt.toISOString(), r.action, r.resource, r.resourceId ?? "", r.user?.email ?? "", r.ip ?? "", JSON.stringify(r.metadata ?? {})]
                .map(esc)
                .join(","),
        );
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="flowcms-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send([header, ...lines].join("\n"));
    }
}
