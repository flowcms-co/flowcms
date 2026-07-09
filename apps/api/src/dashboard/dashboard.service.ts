import { Injectable } from "@nestjs/common";
import { stripTags } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";

const DAY = 86_400_000;
const since = (days: number) => Date.now() - days * DAY;

/** Map a content status to an activity verb + an editor task-state. */
const ACTION: Record<string, string> = { PUBLISHED: "published", IN_REVIEW: "submitted", DRAFT: "edited", SCHEDULED: "scheduled", APPROVED: "approved", ARCHIVED: "archived" };
const TASK_STATE: Record<string, string> = { DRAFT: "draft", IN_REVIEW: "review", SCHEDULED: "scheduled", PUBLISHED: "live", APPROVED: "review" };

/** Rough word count of an entry's body (strips HTML); used for writing insights. */
function wordCountOf(data: unknown): number {
    const body = (data as { body?: unknown } | null)?.body;
    if (typeof body !== "string") return 0;
    const text = stripTags(body);
    return text ? text.split(" ").length : 0;
}

@Injectable()
export class DashboardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: CacheService,
    ) {}

    /** Cached wrapper (15s, per user). Invalidated on content writes via `dash:<ws>:`. */
    summary(workspaceId: string, userId: string) {
        return this.cache.wrap(`dash:${workspaceId}:${userId}`, 15, () => this.computeSummary(workspaceId, userId));
    }

    /** Role-aware aggregates for the home Overview dashboards (all from real content). */
    private async computeSummary(workspaceId: string, userId: string) {
        // Lightweight bulk load WITHOUT the entry `data` body (the dominant memory
        // cost). Titles are resolved for only the bounded set actually rendered (see
        // titleById below), and word counts come from a bounded per-user query.
        const [entries, types, memberships, aiGenerations, workspace] = await Promise.all([
            this.prisma.contentEntry.findMany({
                where: { workspaceId },
                select: { id: true, status: true, authorId: true, publishedAt: true, scheduledAt: true, updatedAt: true, contentTypeId: true },
                orderBy: { updatedAt: "desc" },
            }),
            this.prisma.contentType.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
            this.prisma.membership.findMany({
                where: { workspaceId },
                include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, avatarStyle: true } }, role: { select: { key: true, name: true } } },
            }),
            this.prisma.usageRecord.count({ where: { workspaceId, userId, createdAt: { gte: new Date(since(30)) } } }),
            this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { defaultWeeklyGoal: true } }),
        ]);

        const typeName = new Map(types.map((t) => [t.id, t.name]));
        const member = new Map(memberships.map((m) => [m.user.id, { name: m.user.name || m.user.email, role: m.role.key, avatarUrl: m.user.avatarUrl, avatarStyle: m.user.avatarStyle }]));
        const since30 = since(30);

        type LiteEntry = (typeof entries)[number];
        // Resolve titles only for the entries that get rendered (bounded slices),
        // instead of loading every entry's full body. Collect the candidate ids
        // from the same slices the output uses, then fetch just their titles.
        const inReviewEntries = entries.filter((e) => e.status === "IN_REVIEW");
        const scheduledEntries = entries.filter((e) => e.scheduledAt).sort((a, b) => +new Date(a.scheduledAt!) - +new Date(b.scheduledAt!));
        const mineEntries = entries.filter((e) => e.authorId === userId);
        const minePublishedEntries = mineEntries
            .filter((e) => e.status === "PUBLISHED" && e.publishedAt)
            .sort((a, b) => +new Date(b.publishedAt!) - +new Date(a.publishedAt!));
        const titleCandidateIds = new Set<string>([
            ...entries.slice(0, 8).map((e) => e.id), // activity
            ...inReviewEntries.slice(0, 6).map((e) => e.id), // reviewQueue
            ...scheduledEntries.slice(0, 20).map((e) => e.id), // calendar
            ...mineEntries.map((e) => e.id), // my tasks/work (already a small per-user set)
            ...minePublishedEntries.slice(0, 5).map((e) => e.id), // recentlyPublished
        ]);
        const titleRows = titleCandidateIds.size
            ? await this.prisma.contentEntry.findMany({ where: { id: { in: [...titleCandidateIds] } }, select: { id: true, data: true } })
            : [];
        const titleById = new Map(titleRows.map((r) => [r.id, ((r.data as { title?: string })?.title) || "Untitled"]));
        const title = (e: LiteEntry) => titleById.get(e.id) ?? "Untitled";

        // Words written this month: bounded to the current user's entries updated in
        // the last 30 days (loads only this small slice of bodies, not every entry).
        const myRecentBodies = await this.prisma.contentEntry.findMany({
            where: { workspaceId, authorId: userId, updatedAt: { gte: new Date(since30) } },
            select: { data: true },
        });
        const wordsThisMonth = myRecentBodies.reduce((s, e) => s + wordCountOf(e.data), 0);

        const by = (s: string) => entries.filter((e) => e.status === s).length;
        const pipeline = { draft: by("DRAFT"), review: by("IN_REVIEW"), approved: by("APPROVED"), scheduled: by("SCHEDULED"), published: by("PUBLISHED") };
        const published30d = entries.filter((e) => e.status === "PUBLISHED" && e.publishedAt && +new Date(e.publishedAt) >= since30).length;

        const activity = entries.slice(0, 8).map((e) => {
            const m = e.authorId ? member.get(e.authorId) : undefined;
            return {
                id: e.id,
                person: m?.name ?? (e.authorId ? "Someone" : "System"),
                role: m?.role ?? (e.authorId ? "editor" : "system"),
                // Carry the actor's identity so the activity feed renders their real
                // avatar (uploaded image or chosen character), not just initials.
                authorId: e.authorId,
                avatarUrl: m?.avatarUrl ?? null,
                avatarStyle: m?.avatarStyle ?? null,
                action: ACTION[e.status] ?? "edited",
                target: title(e),
                type: typeName.get(e.contentTypeId) ?? "Content",
                at: e.updatedAt,
            };
        });

        const reviewQueue = entries
            .filter((e) => e.status === "IN_REVIEW")
            .slice(0, 6)
            .map((e) => ({ id: e.id, title: title(e), author: e.authorId ? member.get(e.authorId)?.name ?? "—" : "—", type: typeName.get(e.contentTypeId) ?? "Content", submittedAt: e.updatedAt }));

        const team = memberships
            .map((m) => {
                const mine = entries.filter((e) => e.authorId === m.user.id);
                return {
                    userId: m.user.id,
                    name: m.user.name || m.user.email,
                    role: m.role.key,
                    drafts: mine.filter((e) => e.status === "DRAFT").length,
                    inReview: mine.filter((e) => e.status === "IN_REVIEW").length,
                    published: mine.filter((e) => e.status === "PUBLISHED").length,
                };
            })
            .sort((a, b) => b.published - a.published);

        // Current user's view
        const mineAll = entries.filter((e) => e.authorId === userId);
        const myTasks = mineAll
            .filter((e) => ["DRAFT", "IN_REVIEW", "SCHEDULED", "APPROVED"].includes(e.status))
            .slice(0, 6)
            .map((e) => ({ id: e.id, title: title(e), state: TASK_STATE[e.status] ?? "draft", due: e.scheduledAt ?? e.updatedAt }));
        const myPublished = mineAll.filter((e) => e.status === "PUBLISHED" && e.publishedAt);
        // This week's publish activity (Mon→Sun)
        const now = new Date();
        const dow = (now.getDay() + 6) % 7; // 0 = Monday
        const weekStart = new Date(now);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - dow);
        const week = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const next = new Date(d);
            next.setDate(d.getDate() + 1);
            return myPublished.some((e) => +new Date(e.publishedAt!) >= +d && +new Date(e.publishedAt!) < +next);
        });
        const publishedThisWeek = week.filter(Boolean).length;
        // Consecutive publishing streak: the run of back-to-back days (ending at
        // today) on which something was published. `week` is Mon→Sun, so walk
        // backwards from today's index while days stay published.
        const todayIdx = (now.getDay() + 6) % 7;
        let streakDays = 0;
        for (let i = todayIdx; i >= 0 && week[i]; i--) streakDays++;
        const lastWeekStart = new Date(weekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const publishedLastWeek = myPublished.filter((e) => {
            const t = +new Date(e.publishedAt!);
            return t >= +lastWeekStart && t < +weekStart;
        }).length;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        const isToday = (d?: Date | string | null) => !!d && +new Date(d) >= +todayStart && +new Date(d) < +todayEnd;

        const myDrafts = mineAll.filter((e) => e.status === "DRAFT");
        const myReview = mineAll.filter((e) => e.status === "IN_REVIEW");
        const myScheduled = mineAll.filter((e) => e.status === "SCHEDULED");
        const dueTodayItems = [...myReview, ...myScheduled.filter((e) => isToday(e.scheduledAt))];
        const lite = (e: (typeof mineAll)[number]) => ({
            id: e.id,
            title: title(e),
            type: typeName.get(e.contentTypeId) ?? "Content",
            state: TASK_STATE[e.status] ?? "draft",
            due: e.scheduledAt ?? e.updatedAt,
        });

        // Weekly content goal: target from this member (else the workspace default);
        // progress = pieces published OR scheduled within the current week.
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const inThisWeek = (d?: Date | string | null) => !!d && +new Date(d) >= +weekStart && +new Date(d) < +weekEnd;
        const myMembership = memberships.find((m) => m.user.id === userId);
        const goalTarget = myMembership?.weeklyGoal ?? workspace?.defaultWeeklyGoal ?? 3;
        const publishedThisWeekPieces = myPublished.filter((e) => inThisWeek(e.publishedAt)).length;
        const scheduledThisWeekPieces = myScheduled.filter((e) => inThisWeek(e.scheduledAt)).length;
        const goalDone = publishedThisWeekPieces + scheduledThisWeekPieces;

        const my = {
            drafts: myDrafts.length,
            inReview: myReview.length,
            scheduled: myScheduled.length,
            dueToday: dueTodayItems.length,
            published30d: mineAll.filter((e) => e.status === "PUBLISHED" && e.publishedAt && +new Date(e.publishedAt) >= since30).length,
            publishedThisWeek: publishedThisWeekPieces,
            publishedLastWeek,
            aiGenerations,
            tasks: myTasks,
            work: {
                dueToday: dueTodayItems.slice(0, 6).map(lite),
                inProgress: myDrafts.slice(0, 6).map(lite),
                scheduled: myScheduled.slice(0, 6).map(lite),
            },
            recentlyPublished: myPublished
                .slice()
                .sort((a, b) => +new Date(b.publishedAt!) - +new Date(a.publishedAt!))
                .slice(0, 5)
                .map((e) => ({ id: e.id, title: title(e), type: typeName.get(e.contentTypeId) ?? "Content", publishedAt: e.publishedAt })),
            contentMix: { published: myPublished.length, inReview: myReview.length, drafts: myDrafts.length, scheduled: myScheduled.length },
            insights: { wordsThisMonth },
            weekly: {
                done: goalDone,
                published: publishedThisWeekPieces,
                scheduled: scheduledThisWeekPieces,
                target: goalTarget,
                topic: myMembership?.weeklyGoalTopic ?? null,
                streakDays,
                week,
            },
        };

        const calendar = entries
            .filter((e) => e.scheduledAt)
            .sort((a, b) => +new Date(a.scheduledAt!) - +new Date(b.scheduledAt!))
            .slice(0, 20)
            .map((e) => ({ id: e.id, title: title(e), type: typeName.get(e.contentTypeId) ?? "Content", date: e.scheduledAt, status: e.status }));

        return {
            hasData: entries.length > 0,
            pipeline,
            totals: { published30d, entries: entries.length },
            activity,
            reviewQueue,
            team,
            my,
            calendar,
        };
    }
}
