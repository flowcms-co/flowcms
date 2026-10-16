import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@flowcms/db";
import { escapeHtml } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { MailService } from "../mail/mail.service";
import { currentActor } from "../common/request-context";

export type AuditEntry = {
    workspaceId: string;
    userId?: string | null;
    action: string; // e.g. "auth.signin", "content.edit", "media.replace"
    resource: string; // e.g. "User", "ContentEntry", "Media"
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    /** The entry (or asset) as it was at that moment. */
    entryType?: string | null;
    title?: string | null;
    slug?: string | null;
    versionBefore?: number | null;
    versionAfter?: number | null;
    /** Set for actions without a request (scheduler): who to name instead. */
    actorName?: string | null;
};

export type ActivityFilter = {
    user?: string; // user id, or a token id
    action?: string; // exact action, or a prefix ending in "." ("content.")
    type?: string; // content type apiId
    entry?: string; // entry or asset id
    q?: string; // title or slug contains
    resources?: string[]; // only these resource kinds ("ContentEntry", "Media")
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
};

/** Actions that send an alert (email + the activity.alert webhook) when alerts are on.
 *  Publish/unpublish alert only for an entry with a public page (`slug` set). */
const ALERT_ACTIONS = new Set([
    "content.publish",
    "content.unpublish",
    "content.slug_change",
    "content.delete",
    "content.restore",
    "media.delete",
    "role.create",
    "role.update",
    "role.delete",
    "user.role_change",
    "apitoken.create",
    "workspace.restore",
]);

const DAY_MS = 86_400_000;
export const MIN_RETENTION_DAYS = 365;

type Row = Prisma.AuditLogGetPayload<{ include: { user: { select: { id: true; name: true; email: true } } } }>;

/**
 * The workspace activity log: content, media, user, role, token, webhook and model
 * changes, with who acted (user or API token), from which IP and browser, the entry
 * as it was then, and for content the field-level diff. Append only: there is no
 * edit or delete route, and the database refuses an UPDATE. Rows older than the
 * workspace's retention (12 months minimum) are pruned.
 *
 * Writes are best effort: a logging failure never breaks the action it records,
 * and a secret value never goes in `metadata`.
 */
@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AuditService.name);
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly webhooks: WebhooksService,
        private readonly mail: MailService,
    ) {}

    onModuleInit() {
        this.timer = setInterval(() => void this.prune(), 6 * 3_600_000);
        this.timer.unref?.();
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /** Fire-and-forget; swallows its own errors. */
    record(entry: AuditEntry): void {
        void this.log(entry);
    }

    /** Write one event (awaitable; still never throws). The actor, IP and user agent
     *  come from the current request unless the entry names them. */
    async log(entry: AuditEntry): Promise<void> {
        const who = currentActor();
        try {
            const userId = entry.userId !== undefined ? entry.userId : who.userId;
            // Acting for someone other than the request's user (a background job, a
            // review attributed to a token's owner): name that person.
            let actorName = entry.actorName ?? who.name;
            let actorRole = who.role;
            if (!entry.actorName && !who.tokenId && userId && userId !== who.userId) {
                const m = await this.prisma.membership.findFirst({
                    where: { workspaceId: entry.workspaceId, userId },
                    select: { user: { select: { name: true, email: true } }, role: { select: { name: true } } },
                });
                actorName = m ? m.user.name || m.user.email : actorName;
                actorRole = m?.role.name ?? actorRole;
            }
            const row = await this.prisma.auditLog.create({
                data: {
                    workspaceId: entry.workspaceId,
                    userId,
                    action: entry.action,
                    resource: entry.resource,
                    resourceId: entry.resourceId ?? null,
                    metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
                    ip: entry.ip ?? who.ip,
                    userAgent: who.userAgent,
                    actorName,
                    actorRole,
                    tokenId: who.tokenId,
                    entryType: entry.entryType ?? null,
                    title: entry.title ?? null,
                    slug: entry.slug ?? null,
                    versionBefore: entry.versionBefore ?? null,
                    versionAfter: entry.versionAfter ?? null,
                },
            });
            if (ALERT_ACTIONS.has(entry.action)) await this.alert(row);
        } catch (e) {
            this.logger.warn(`audit write failed (${entry.action}): ${e instanceof Error ? e.message : e}`);
        }
    }

    private where(workspaceId: string, f: ActivityFilter): Prisma.AuditLogWhereInput {
        const where: Prisma.AuditLogWhereInput = { workspaceId };
        const and: Prisma.AuditLogWhereInput[] = [];
        if (f.user) and.push({ OR: [{ userId: f.user }, { tokenId: f.user }] });
        if (f.action) where.action = f.action.endsWith(".") ? { startsWith: f.action } : f.action;
        if (f.type) where.entryType = f.type;
        if (f.entry) where.resourceId = f.entry;
        if (f.resources) where.resource = { in: f.resources };
        const q = f.q?.trim();
        if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] });
        const from = f.from ? new Date(f.from) : null;
        // A bare date as `to` means through the end of that day.
        const to = f.to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(f.to) ? `${f.to}T23:59:59.999Z` : f.to) : null;
        const range: Prisma.DateTimeFilter = {};
        if (from && !isNaN(+from)) range.gte = from;
        if (to && !isNaN(+to)) range.lte = to;
        if (range.gte || range.lte) where.createdAt = range;
        if (and.length) where.AND = and;
        return where;
    }

    private shape(r: Row) {
        return {
            id: r.id,
            action: r.action,
            resource: r.resource,
            resourceId: r.resourceId,
            entryType: r.entryType,
            title: r.title,
            slug: r.slug,
            versionBefore: r.versionBefore,
            versionAfter: r.versionAfter,
            metadata: r.metadata,
            ip: r.ip,
            userAgent: r.userAgent,
            createdAt: r.createdAt,
            tokenId: r.tokenId,
            actor: r.user
                ? { id: r.user.id, name: r.user.name || r.actorName || r.user.email, email: r.user.email as string | null, role: r.actorRole }
                : r.actorName
                  ? { id: r.tokenId, name: r.actorName, email: null, role: r.actorRole }
                  : null,
        };
    }

    /** One page of the log (newest first) and the total that matches. */
    async list(workspaceId: string, f: ActivityFilter = {}) {
        const where = this.where(workspaceId, f);
        const take = Math.min(Math.max(Math.floor(Number(f.limit) || 50), 1), 200);
        const skip = Math.max(Math.floor(Number(f.offset) || 0), 0);
        const [rows, total] = await Promise.all([
            this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, skip, include: { user: { select: { id: true, name: true, email: true } } } }),
            this.prisma.auditLog.count({ where }),
        ]);
        return { items: rows.map((r) => this.shape(r)), total, limit: take, offset: skip };
    }

    /** Every matching row for an export, a page at a time. */
    async *exportRows(workspaceId: string, f: ActivityFilter = {}, max = 100_000) {
        const where = this.where(workspaceId, f);
        let cursor: string | undefined;
        for (let sent = 0; sent < max; ) {
            const rows = await this.prisma.auditLog.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: Math.min(1000, max - sent),
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                include: { user: { select: { id: true, name: true, email: true } } },
            });
            if (!rows.length) return;
            for (const r of rows) yield this.shape(r);
            sent += rows.length;
            cursor = rows[rows.length - 1].id;
        }
    }

    /** People and tokens that can appear in the log, for the Activity page's filter. */
    async actors(workspaceId: string) {
        const [members, tokens] = await Promise.all([
            this.prisma.membership.findMany({ where: { workspaceId }, select: { user: { select: { id: true, name: true, email: true } } } }),
            this.prisma.apiToken.findMany({ where: { workspaceId }, select: { id: true, name: true, revokedAt: true } }),
        ]);
        return [
            ...members.map((m) => ({ id: m.user.id, name: m.user.name || m.user.email, kind: "user" as const })),
            ...tokens.map((t) => ({ id: t.id, name: `${t.name} (API token)${t.revokedAt ? ", revoked" : ""}`, kind: "token" as const })),
        ].sort((a, b) => a.name.localeCompare(b.name));
    }

    /** Email the workspace's alert list and fire the activity.alert webhook. */
    private async alert(row: { workspaceId: string; action: string; title: string | null; slug: string | null; actorName: string | null; ip: string | null; createdAt: Date; resourceId: string | null; metadata: Prisma.JsonValue }) {
        // A draft entry has no public page: its publish/unpublish isn't worth waking anyone.
        if ((row.action === "content.publish" || row.action === "content.unpublish") && !row.slug) return;
        const ws = await this.prisma.workspace.findUnique({ where: { id: row.workspaceId }, select: { alertsEnabled: true, alertEmails: true, name: true } });
        if (!ws?.alertsEnabled) return;
        const what = `${row.action}${row.title ? `: ${row.title}` : ""}`;
        void this.webhooks.dispatch(row.workspaceId, "activity.alert", {
            action: row.action,
            id: row.resourceId,
            title: row.title,
            slug: row.slug,
            actor: row.actorName,
            ip: row.ip,
            at: row.createdAt,
            metadata: row.metadata,
        });
        const html =
            `<p><strong>${escapeHtml(what)}</strong></p>` +
            `<p>By ${escapeHtml(row.actorName ?? "the system")}${row.ip ? ` from ${escapeHtml(row.ip)}` : ""} at ${row.createdAt.toISOString()}.</p>` +
            (row.slug ? `<p>Slug: ${escapeHtml(row.slug)}</p>` : "") +
            `<p>Settings › Activity has the full record.</p>`;
        for (const to of ws.alertEmails ?? []) {
            void this.mail.send(row.workspaceId, { to, subject: `[${ws.name}] ${what}`, html }).catch(() => undefined);
        }
    }

    /** Drop rows past each workspace's retention (never less than 12 months). */
    async prune(): Promise<number> {
        try {
            if (!(await this.redis.tryAcquire("sched:audit-prune", 3_600_000))) return 0;
            const workspaces = await this.prisma.workspace.findMany({ select: { id: true, auditRetentionDays: true } });
            let n = 0;
            for (const w of workspaces) {
                const days = Math.max(w.auditRetentionDays, MIN_RETENTION_DAYS);
                const r = await this.prisma.auditLog.deleteMany({ where: { workspaceId: w.id, createdAt: { lt: new Date(Date.now() - days * DAY_MS) } } });
                n += r.count;
            }
            if (n) this.logger.log(`Pruned ${n} activity rows past retention.`);
            return n;
        } catch (e) {
            this.logger.warn(`activity prune failed: ${e instanceof Error ? e.message : e}`);
            return 0;
        }
    }
}
