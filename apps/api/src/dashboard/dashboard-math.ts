import { zonedDayKey, zonedDayStart, zonedWeekStart, zonedWeekday } from "@flowcms/shared";

/** The slice of an entry the per-user dashboard figures are built from. */
export type LiteEntry = {
    id: string;
    title: string | null;
    status: string;
    contentTypeId: string;
    publishedAt: Date | null;
    firstPublishedAt: Date | null;
    scheduledAt: Date | null;
    updatedAt: Date;
};

/** Audit-log action -> the verb Recent activity shows. */
export const EVENT_VERB: Record<string, string> = {
    "content.create": "created",
    "content.edit": "edited",
    "content.submit": "submitted",
    "content.approve": "approved",
    "content.schedule": "scheduled",
    "content.publish": "published",
    "content.unpublish": "unpublished",
    "content.archive": "archived",
};

/** This week (Mon to Sun) and last week, as instants, in the workspace's zone. */
export function weekBounds(now: Date, tz: string) {
    const dow = zonedWeekday(now, tz);
    return {
        today: zonedDayStart(now, tz),
        weekStart: zonedWeekStart(now, tz),
        weekEnd: zonedDayStart(now, tz, 7 - dow),
        lastWeekStart: zonedDayStart(now, tz, -dow - 7),
    };
}

/** Back-to-back days with a publish, ending today or (if nothing is out yet
 *  today) yesterday. Runs across week boundaries; looks back at most 60 days. */
export function publishingStreak(publishDates: Date[], now: Date, tz: string): number {
    const days = new Set(publishDates.map((d) => zonedDayKey(d, tz)));
    const has = (back: number) => days.has(zonedDayKey(zonedDayStart(now, tz, -back), tz));
    let back = has(0) ? 0 : 1;
    let streak = 0;
    while (back <= 60 && has(back)) {
        streak++;
        back++;
    }
    return streak;
}

/**
 * The signed-in person's own figures. "Published" output (this week, last week,
 * the streak and the weekly goal) counts a piece once, on the day it FIRST went
 * live in the studio: re-publishing edits doesn't count again, and imported
 * entries (no first-publish date) aren't anyone's output.
 */
export function buildMy(mine: LiteEntry[], opts: { now: Date; tz: string; typeName: (id: string) => string; goalTarget: number; goalTopic: string | null; aiGenerations: number; wordsRecent: number }) {
    const { now, tz } = opts;
    const { weekStart, weekEnd, lastWeekStart } = weekBounds(now, tz);
    const between = (d: Date | null, from: Date, to: Date) => !!d && +d >= +from && +d < +to;
    const of = (s: string) => mine.filter((e) => e.status === s);
    const drafts = of("DRAFT");
    const review = of("IN_REVIEW");
    const approved = of("APPROVED");
    const scheduled = of("SCHEDULED");
    const published = of("PUBLISHED");

    const firsts = mine.map((e) => e.firstPublishedAt).filter((d): d is Date => !!d);
    const publishedThisWeek = firsts.filter((d) => between(d, weekStart, weekEnd)).length;
    const publishedLastWeek = firsts.filter((d) => between(d, lastWeekStart, weekStart)).length;
    const scheduledThisWeek = scheduled.filter((e) => between(e.scheduledAt, weekStart, weekEnd)).length;
    const week = Array.from({ length: 7 }, (_, i) => {
        const from = zonedDayStart(weekStart, tz, i);
        const to = zonedDayStart(weekStart, tz, i + 1);
        return firsts.some((d) => between(d, from, to));
    });

    const lite = (e: LiteEntry) => ({ id: e.id, title: e.title || "Untitled", type: opts.typeName(e.contentTypeId), state: e.status, due: e.scheduledAt ?? e.updatedAt });
    return {
        drafts: drafts.length,
        awaitingReview: review.length,
        approved: approved.length,
        scheduled: scheduled.length,
        publishedThisWeek,
        publishedLastWeek,
        aiGenerations: opts.aiGenerations,
        work: {
            awaitingReview: review.slice(0, 6).map(lite),
            approved: approved.slice(0, 6).map(lite),
            inProgress: drafts.slice(0, 6).map(lite),
            scheduled: scheduled.slice(0, 6).map(lite),
        },
        recentlyPublished: published
            .filter((e) => e.publishedAt)
            .sort((a, b) => +b.publishedAt! - +a.publishedAt!)
            .slice(0, 5)
            .map((e) => ({ id: e.id, title: e.title || "Untitled", type: opts.typeName(e.contentTypeId), publishedAt: e.publishedAt, liveUrl: null as string | null })),
        // All-time split of this person's entries (the card says so).
        contentMix: { published: published.length, inReview: review.length, approved: approved.length, drafts: drafts.length, scheduled: scheduled.length },
        insights: { wordsRecent: opts.wordsRecent },
        weekly: {
            done: publishedThisWeek + scheduledThisWeek,
            published: publishedThisWeek,
            scheduled: scheduledThisWeek,
            target: opts.goalTarget,
            topic: opts.goalTopic,
            streakDays: publishingStreak(firsts, now, tz),
            week,
        },
    };
}

type EventRow = { id: string; action: string; userId: string | null; resourceId: string | null; createdAt: Date };
type Actor = { name: string; role: string; roleName: string; avatarUrl: string | null; avatarStyle: string | null };

/** Recent activity rows from recorded content events: the verb is the action that
 *  happened and the person is whoever did it. Events on entries the viewer can't
 *  see (or that were deleted) are dropped. */
export function buildActivity(
    events: EventRow[],
    entryById: Map<string, { title: string | null; contentTypeId: string }>,
    actorById: Map<string, Actor>,
    typeName: (id: string) => string,
    limit = 20,
) {
    return events
        .filter((ev) => ev.resourceId && entryById.has(ev.resourceId) && EVENT_VERB[ev.action])
        .slice(0, limit)
        .map((ev) => {
            const entry = entryById.get(ev.resourceId!)!;
            const who = ev.userId ? actorById.get(ev.userId) : undefined;
            return {
                id: ev.id,
                entryId: ev.resourceId!,
                // No user = the scheduler or an API token; a user with no membership has left.
                person: who?.name ?? (ev.userId ? "Former member" : "System"),
                role: who?.role ?? (ev.userId ? "member" : "system"),
                roleName: who?.roleName ?? (ev.userId ? "Member" : "Automation"),
                authorId: ev.userId,
                avatarUrl: who?.avatarUrl ?? null,
                avatarStyle: who?.avatarStyle ?? null,
                action: EVENT_VERB[ev.action],
                target: entry.title || "Untitled",
                type: typeName(entry.contentTypeId),
                at: ev.createdAt,
            };
        });
}
