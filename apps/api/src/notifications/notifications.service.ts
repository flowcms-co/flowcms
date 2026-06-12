import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

export type NotificationInput = { type: string; title: string; body?: string; href?: string };

const REVIEWER_ROLES = new Set(["super_admin", "admin", "search_strategist"]);
const STUDIO = process.env.STUDIO_URL ?? "http://localhost:3000";

@Injectable()
export class NotificationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly realtime: RealtimeGateway,
    ) {}

    /** Push the new notification + fresh unread count to the user's live sockets. */
    private async pushRealtime(workspaceId: string, userId: string, created?: unknown) {
        try {
            if (created) this.realtime.emitToUser(userId, "notification:new", created);
            const { count } = await this.unreadCount(workspaceId, userId);
            this.realtime.emitToUser(userId, "notification:count", { count });
        } catch {
            /* realtime is best-effort */
        }
    }

    /** Create one notification + fire a best-effort email alert (no-op without SMTP). */
    async create(workspaceId: string, userId: string, n: NotificationInput) {
        const created = await this.prisma.notification.create({ data: { workspaceId, userId, ...n } });
        void this.pushRealtime(workspaceId, userId, created);
        void this.emailAlert(workspaceId, userId, n).catch(() => {});
        return created;
    }

    /** Create the same notification for several users (deduped). */
    async createMany(workspaceId: string, userIds: (string | null | undefined)[], n: NotificationInput) {
        const ids = [...new Set(userIds.filter(Boolean) as string[])];
        if (ids.length === 0) return { count: 0 };
        await this.prisma.notification.createMany({ data: ids.map((userId) => ({ workspaceId, userId, ...n })) });
        for (const userId of ids) {
            void this.pushRealtime(workspaceId, userId);
            void this.emailAlert(workspaceId, userId, n).catch(() => {});
        }
        return { count: ids.length };
    }

    private async emailAlert(workspaceId: string, userId: string, n: NotificationInput) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
        if (!user?.email) return;
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
        await this.mail.sendTemplate(workspaceId, "alert", user.email, {
            name: user.name ?? "there",
            workspace: ws?.name ?? "Flow CMS",
            title: n.title,
            body: n.body ?? "",
            link: STUDIO + (n.href ?? "/notifications"),
        });
    }

    /** Members who should be notified of review-worthy events (excluding the actor). */
    async reviewers(workspaceId: string, exceptUserId?: string): Promise<string[]> {
        const members = await this.prisma.membership.findMany({
            where: { workspaceId },
            include: { role: { select: { key: true } } },
        });
        return members.filter((m) => REVIEWER_ROLES.has(m.role.key) && m.userId !== exceptUserId).map((m) => m.userId);
    }

    list(workspaceId: string, userId: string, opts: { limit?: number; unreadOnly?: boolean }) {
        return this.prisma.notification.findMany({
            where: { workspaceId, userId, ...(opts.unreadOnly ? { read: false } : {}) },
            orderBy: { createdAt: "desc" },
            take: Math.min(Math.max(opts.limit ?? 30, 1), 100),
        });
    }

    async unreadCount(workspaceId: string, userId: string) {
        return { count: await this.prisma.notification.count({ where: { workspaceId, userId, read: false } }) };
    }

    async markRead(workspaceId: string, userId: string, id: string) {
        await this.prisma.notification.updateMany({ where: { id, workspaceId, userId }, data: { read: true } });
        return { ok: true };
    }

    async markAllRead(workspaceId: string, userId: string) {
        await this.prisma.notification.updateMany({ where: { workspaceId, userId, read: false }, data: { read: true } });
        return { ok: true };
    }

    // ── Email digests ────────────────────────────────────────────────────────
    async getPreferences(userId: string) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { digestFrequency: true, lastDigestAt: true } });
        return { digestFrequency: u?.digestFrequency ?? "off", lastDigestAt: u?.lastDigestAt ?? null };
    }

    async setPreferences(userId: string, digestFrequency: "off" | "daily" | "weekly") {
        // Stamp lastDigestAt when enabling so the first digest arrives after a full window.
        await this.prisma.user.update({
            where: { id: userId },
            data: { digestFrequency, ...(digestFrequency !== "off" ? { lastDigestAt: new Date() } : {}) },
        });
        return this.getPreferences(userId);
    }

    /** Build a digest of notifications since `since` (or last 7 days) for a user. */
    private async buildDigest(workspaceId: string, userId: string, since: Date | null) {
        const from = since ?? new Date(Date.now() - 7 * 86400_000);
        const items = await this.prisma.notification.findMany({
            where: { workspaceId, userId, createdAt: { gt: from } },
            orderBy: { createdAt: "desc" },
            take: 25,
        });
        return items;
    }

    /** Send one user's digest now (used by the scheduler + the "send test" action). */
    async sendDigest(workspaceId: string, userId: string, opts: { force?: boolean } = {}) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true, digestFrequency: true, lastDigestAt: true },
        });
        if (!user?.email) return { sent: false, count: 0, reason: "no-email" };
        const items = await this.buildDigest(workspaceId, userId, opts.force ? null : user.lastDigestAt);
        if (items.length === 0 && !opts.force) return { sent: false, count: 0, reason: "nothing-new" };

        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
        const list =
            "<ul>" +
            items
                .map((n) => `<li><b>${escapeHtml(n.title)}</b>${n.body ? ` — ${escapeHtml(n.body)}` : ""}</li>`)
                .join("") +
            "</ul>";
        const res = await this.mail.sendTemplate(workspaceId, "digest", user.email, {
            name: user.name ?? "there",
            workspace: ws?.name ?? "Flow CMS",
            count: String(items.length),
            plural: items.length === 1 ? "" : "s",
            items: items.length ? list : "<p>No new activity.</p>",
            link: STUDIO + "/notifications",
        });
        await this.prisma.user.update({ where: { id: userId }, data: { lastDigestAt: new Date() } });
        return { sent: true, count: items.length, delivery: res };
    }

    /** Scheduler tick: send digests to users whose window has elapsed. */
    async runDigests() {
        const now = Date.now();
        const users = await this.prisma.user.findMany({
            where: { digestFrequency: { in: ["daily", "weekly"] }, isActive: true },
            select: { id: true, digestFrequency: true, lastDigestAt: true, memberships: { select: { workspaceId: true }, take: 1 } },
        });
        let sent = 0;
        for (const u of users) {
            const windowMs = u.digestFrequency === "weekly" ? 7 * 86400_000 : 86400_000;
            const due = !u.lastDigestAt || now - +u.lastDigestAt >= windowMs;
            const workspaceId = u.memberships[0]?.workspaceId;
            if (!due || !workspaceId) continue;
            try {
                const r = await this.sendDigest(workspaceId, u.id);
                if (r.sent) sent += 1;
            } catch {
                /* best-effort per user */
            }
        }
        return { processed: users.length, sent };
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
