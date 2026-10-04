import { Inject, Injectable, Optional } from "@nestjs/common";
import { PERMISSIONS, can, safeTimeZone } from "@flowcms/shared";
import { authorWhere } from "../content/author";
import { entryToCanonicalContent } from "../content/canonical-content";
import { RBAC_PORT, type RbacPort } from "../content/rbac.port";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";
import type { AuthUser } from "../auth/types";
import { buildActivity, buildMy, weekBounds } from "./dashboard-math";
import { SitePagesService, absoluteUrl } from "../seo/site-pages.service";

const DAY = 86_400_000;

/** Words across every text field of an entry (rich text, components, sections),
 *  not just a field named "body". */
function wordCountOf(data: unknown): number {
    return entryToCanonicalContent({ data: (data ?? {}) as Record<string, unknown> }).wordCount;
}

const LITE = { id: true, title: true, status: true, contentTypeId: true, publishedAt: true, firstPublishedAt: true, scheduledAt: true, updatedAt: true } as const;

@Injectable()
export class DashboardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: CacheService,
        // advanced_rbac (Pro): per-role content types. Absent or unlicensed = no restriction.
        @Optional() @Inject(RBAC_PORT) private readonly rbac?: RbacPort,
        // The public site (URL + real page paths), for "View live" links.
        @Optional() private readonly sitePages?: SitePagesService,
    ) {}

    /** id -> public URL for the given entries: site URL + the entry's real path.
     *  Empty when the workspace has no site URL or the entry is not a page. */
    private async liveUrls(workspaceId: string, ids: string[]): Promise<Map<string, string>> {
        const site = ids.length ? await this.sitePages?.siteUrl(workspaceId) : null;
        if (!site) return new Map();
        const pages = await this.sitePages!.pages(workspaceId, ids);
        return new Map(pages.map((p) => [p.id, absoluteUrl(site, p.path)]));
    }

    /** Cached wrapper (15s, per user). Invalidated on content writes via `dash:<ws>:`. */
    summary(user: AuthUser) {
        return this.cache.wrap(`dash:${user.workspaceId}:${user.id}`, 15, () => this.computeSummary(user));
    }

    /**
     * Aggregates for the home dashboards, scoped to what the caller may see: only
     * the content types their role allows, and the workspace-wide sections
     * (pipeline, recent activity, calendar) only for roles that can publish. Everyone
     * gets their own figures (`my`). Counts come from the database; no entry bodies
     * are loaded apart from the caller's last 30 days of work (for the word count).
     */
    private async computeSummary(user: AuthUser) {
        const { workspaceId, id: userId } = user;
        const workspace = await this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { defaultWeeklyGoal: true, authorMode: true, timezone: true, locales: true },
        });
        const mode = workspace?.authorMode ?? "creator";
        const tz = safeTimeZone(workspace?.timezone);
        const now = new Date();
        const { weekStart, weekEnd } = weekBounds(now, tz);

        const allowed = this.rbac ? await this.rbac.allowedTypeIds(user.role) : null;
        const scope = { workspaceId, ...(allowed ? { contentTypeId: { in: allowed } } : {}) };
        const wide = can(user.role.permissions, PERMISSIONS.CONTENT_PUBLISH);
        const mineWhere = { AND: [scope, authorWhere(userId, mode)] };

        const [types, membership, aiGenerations, total, mine, recentBodies] = await Promise.all([
            this.prisma.contentType.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
            this.prisma.membership.findFirst({ where: { workspaceId, userId }, select: { weeklyGoal: true, weeklyGoalTopic: true } }),
            this.prisma.usageRecord.count({ where: { workspaceId, userId, createdAt: { gte: new Date(+now - 30 * DAY) } } }),
            this.prisma.contentEntry.count({ where: scope }),
            // `title` is the generated column, so no entry body is opened for a title.
            this.prisma.contentEntry.findMany({ where: mineWhere, select: LITE, orderBy: { updatedAt: "desc" } }),
            this.prisma.contentEntry.findMany({
                where: { AND: [...mineWhere.AND, { updatedAt: { gte: new Date(+now - 30 * DAY) } }] },
                select: { data: true, draftData: true },
            }),
        ]);
        const names = new Map(types.map((t) => [t.id, t.name]));
        const typeName = (id: string) => names.get(id) ?? "Content";

        const my = buildMy(mine, {
            now,
            tz,
            typeName,
            goalTarget: membership?.weeklyGoal ?? workspace?.defaultWeeklyGoal ?? 3,
            goalTopic: membership?.weeklyGoalTopic ?? null,
            aiGenerations,
            // Size of the pieces touched in the last 30 days (pending draft if there is one).
            wordsRecent: recentBodies.reduce((s, e) => s + wordCountOf(e.draftData ?? e.data), 0),
        });

        const live = await this.liveUrls(scope.workspaceId, my.recentlyPublished.map((p) => p.id));
        my.recentlyPublished = my.recentlyPublished.map((p) => ({ ...p, liveUrl: live.get(p.id) ?? null }));

        return {
            hasData: total > 0,
            timezone: tz,
            weekStart,
            // Each locale of a piece is its own entry, so every count here is per locale.
            perLocale: Array.isArray(workspace?.locales) && workspace.locales.length > 1,
            ...(wide ? await this.workspaceWide(scope, weekStart, weekEnd, typeName) : { pipeline: null, activity: null, calendar: null }),
            my,
        };
    }

    /** Pipeline counts, recent activity and this week's calendar for the whole
     *  workspace (within the caller's allowed content types). */
    private async workspaceWide(scope: { workspaceId: string; contentTypeId?: { in: string[] } }, weekStart: Date, weekEnd: Date, typeName: (id: string) => string) {
        const { workspaceId } = scope;
        const inWeek = { gte: weekStart, lt: weekEnd };
        const [byStatus, approvedDrafts, events, calendarRows] = await Promise.all([
            this.prisma.contentEntry.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
            // A live page whose pending draft is approved stays PUBLISHED, but it is
            // ready to publish all the same.
            this.prisma.contentEntry.count({ where: { ...scope, status: "PUBLISHED", draftApproved: true } }),
            this.prisma.auditLog.findMany({
                where: { workspaceId, resource: "ContentEntry", action: { startsWith: "content." } },
                orderBy: { createdAt: "desc" },
                take: 60,
                select: { id: true, action: true, userId: true, resourceId: true, createdAt: true },
            }),
            // Only this week's items: what is still scheduled, and what went live.
            this.prisma.contentEntry.findMany({
                where: { ...scope, OR: [{ status: { not: "PUBLISHED" }, scheduledAt: inWeek }, { status: "PUBLISHED", publishedAt: inWeek }] },
                select: LITE,
                take: 200,
            }),
        ]);
        const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;

        const entryIds = [...new Set(events.map((e) => e.resourceId).filter((x): x is string => !!x))];
        const actorIds = [...new Set(events.map((e) => e.userId).filter((x): x is string => !!x))];
        const [entries, members] = await Promise.all([
            entryIds.length ? this.prisma.contentEntry.findMany({ where: { ...scope, id: { in: entryIds } }, select: { id: true, title: true, contentTypeId: true } }) : [],
            actorIds.length
                ? this.prisma.membership.findMany({
                      where: { workspaceId, userId: { in: actorIds } },
                      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, avatarStyle: true } }, role: { select: { key: true, name: true } } },
                  })
                : [],
        ]);
        const actorById = new Map(members.map((m) => [m.user.id, { name: m.user.name || m.user.email, role: m.role.key, roleName: m.role.name, avatarUrl: m.user.avatarUrl, avatarStyle: m.user.avatarStyle }]));

        return {
            pipeline: { draft: count("DRAFT"), review: count("IN_REVIEW"), approved: count("APPROVED") + approvedDrafts, scheduled: count("SCHEDULED"), published: count("PUBLISHED") },
            activity: buildActivity(events, new Map(entries.map((e) => [e.id, e])), actorById, typeName),
            calendar: calendarRows
                .map((e) => ({ id: e.id, title: e.title || "Untitled", type: typeName(e.contentTypeId), date: e.status === "PUBLISHED" ? e.publishedAt : e.scheduledAt, status: e.status }))
                .sort((a, b) => +a.date! - +b.date!),
        };
    }
}
