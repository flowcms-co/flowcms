import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SystemService } from "./system.service";

// The Updates panel only checks on demand. This drops an in-app notification to
// super-admins when a newer release is published, so an update is surfaced without
// anyone visiting Settings → System. First check shortly after boot, then hourly:
// a daily tick can sit on an already-booted instance for almost a full day before
// it notices a release published minutes after the last check. Hourly keeps the
// GitHub calls negligible while surfacing a new release within the hour. The
// per-version idempotency below means each release still notifies exactly once.
const FIRST_DELAY_MS = 60_000;
const INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class UpdateNotifierService implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(UpdateNotifierService.name);
    private timer: ReturnType<typeof setInterval> | null = null;
    private firstRun: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly system: SystemService,
        private readonly notifications: NotificationsService,
        private readonly prisma: PrismaService,
    ) {}

    onModuleInit() {
        this.firstRun = setTimeout(() => void this.check(), FIRST_DELAY_MS);
        this.firstRun.unref?.();
        this.timer = setInterval(() => void this.check(), INTERVAL_MS);
        this.timer.unref?.();
    }

    onModuleDestroy() {
        if (this.firstRun) clearTimeout(this.firstRun);
        if (this.timer) clearInterval(this.timer);
    }

    /** Check upstream and notify super-admins once per newly-available version. */
    async check() {
        try {
            const info = await this.system.updates(true);
            if (!info.updateAvailable || !info.latest) return;
            const tag = `v${info.latest}`;

            // Notify once per version. The existing-notification lookup makes this
            // idempotent across restarts and across the daily tick.
            const already = await this.prisma.notification.findFirst({
                where: { type: "update_available", body: { contains: tag } },
                select: { id: true },
            });
            if (already) return;

            // Target whoever can actually run the upgrade, not just the literal
            // "super_admin" key: installs rename roles or use custom ones. A role
            // qualifies if it grants workspace/security management or "*".
            const roles = await this.prisma.role.findMany({ select: { id: true, permissions: true } });
            const adminRoleIds = roles
                .filter((r) => {
                    const perms = Array.isArray(r.permissions) ? (r.permissions as string[]) : [];
                    return perms.includes("*") || perms.includes(PERMISSIONS.WORKSPACE_MANAGE) || perms.includes(PERMISSIONS.SECURITY_MANAGE);
                })
                .map((r) => r.id);
            if (!adminRoleIds.length) return;
            const admins = await this.prisma.membership.findMany({
                where: { roleId: { in: adminRoleIds } },
                select: { workspaceId: true, userId: true },
            });
            if (!admins.length) return;

            // Notifications are workspace-scoped, so fan out per workspace.
            const byWorkspace = new Map<string, string[]>();
            for (const a of admins) {
                const arr = byWorkspace.get(a.workspaceId) ?? [];
                arr.push(a.userId);
                byWorkspace.set(a.workspaceId, arr);
            }
            for (const [workspaceId, userIds] of byWorkspace) {
                await this.notifications.createMany(workspaceId, userIds, {
                    type: "update_available",
                    title: "Update available",
                    body: `FlowCMS ${tag} is available. Open Settings → System to review the release notes and upgrade.`,
                    href: "/settings/workspace?tab=system",
                });
            }
            this.log.log(`Notified ${admins.length} admin(s) that ${tag} is available.`);
        } catch (e) {
            this.log.warn(`update notifier check failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
