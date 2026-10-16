import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { AuditService } from "../../audit/audit.service";
import { activityFilter } from "../../audit/audit.controller";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";

const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLUMNS = ["createdAt", "action", "actor", "actorRole", "ip", "userAgent", "entryType", "resource", "resourceId", "title", "slug", "versionBefore", "versionAfter", "metadata"] as const;

/**
 * EE (Pro): export the activity log as CSV or JSON (for retention / SIEM
 * ingestion), with the same filters as the Activity page. Streamed a page at a time.
 * Gated by the `audit_export` entitlement; Community gets a 403 from FeatureGuard.
 */
@Controller("ee/audit")
@RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
@UseGuards(FeatureGuard)
@RequireFeature("audit_export")
export class AuditExportController {
    constructor(private readonly audit: AuditService) {}

    @Get("export")
    async export(@CurrentUser() user: AuthUser, @Query() q: Record<string, string | undefined>, @Res() res: Response) {
        const json = q.format === "json";
        const max = Math.min(Number(q.max) || 100_000, 100_000);
        const filter = { ...activityFilter(q), limit: undefined, offset: undefined };
        const day = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", json ? "application/json; charset=utf-8" : "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="flowcms-activity-${day}.${json ? "json" : "csv"}"`);
        let first = true;
        res.write(json ? "[" : `${COLUMNS.join(",")}\n`);
        for await (const r of this.audit.exportRows(user.workspaceId, filter, max)) {
            if (json) {
                res.write(`${first ? "" : ","}\n${JSON.stringify(r)}`);
            } else {
                const row = { ...r, createdAt: r.createdAt.toISOString(), actor: r.actor?.email ?? r.actor?.name ?? "", actorRole: r.actor?.role ?? "", metadata: JSON.stringify(r.metadata ?? {}) };
                res.write(`${COLUMNS.map((c) => esc((row as Record<string, unknown>)[c])).join(",")}\n`);
            }
            first = false;
        }
        res.end(json ? "\n]\n" : "");
    }
}
