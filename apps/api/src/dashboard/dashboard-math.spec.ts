import { describe, expect, it } from "vitest";
import { buildActivity, buildMy, publishingStreak, weekBounds, type LiteEntry } from "./dashboard-math";

// Wednesday 2026-10-07, midday UTC.
const now = new Date("2026-10-07T12:00:00Z");
const tz = "UTC";
const d = (iso: string) => new Date(iso);
const entry = (over: Partial<LiteEntry>): LiteEntry => ({ id: "e", title: "T", status: "DRAFT", contentTypeId: "t1", publishedAt: null, firstPublishedAt: null, scheduledAt: null, updatedAt: now, ...over });
const opts = { now, tz, typeName: () => "Blog", goalTarget: 3, goalTopic: null, aiGenerations: 0, wordsRecent: 0 };

describe("weekBounds", () => {
    it("uses the workspace zone, not the server's", () => {
        // 20:00 UTC on Sunday is already Monday in India: a new week has started there.
        const sundayEvening = d("2026-10-04T20:00:00Z");
        expect(weekBounds(sundayEvening, "UTC").weekStart.toISOString()).toBe("2026-09-28T00:00:00.000Z");
        expect(weekBounds(sundayEvening, "Asia/Kolkata").weekStart.toISOString()).toBe("2026-10-04T18:30:00.000Z");
    });
});

describe("publishingStreak", () => {
    it("runs across the week boundary and survives a day with nothing out yet", () => {
        // Published Sat, Sun, Mon, Tue; nothing yet today (Wed).
        const dates = ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"].map((x) => d(`${x}T09:00:00Z`));
        expect(publishingStreak(dates, now, tz)).toBe(4);
        expect(publishingStreak([...dates, d("2026-10-07T08:00:00Z")], now, tz)).toBe(5);
    });

    it("is zero once a full day was missed", () => {
        expect(publishingStreak([d("2026-10-05T09:00:00Z")], now, tz)).toBe(0);
    });
});

describe("buildMy", () => {
    it("counts a piece once, when it first went live, and never counts imports", () => {
        const my = buildMy(
            [
                // First published last week, edits re-published today: last week's piece.
                entry({ id: "a", status: "PUBLISHED", publishedAt: d("2026-10-07T10:00:00Z"), firstPublishedAt: d("2026-09-30T10:00:00Z") }),
                // New this week.
                entry({ id: "b", status: "PUBLISHED", publishedAt: d("2026-10-06T10:00:00Z"), firstPublishedAt: d("2026-10-06T10:00:00Z") }),
                // Imported this week: live, but nobody's output.
                entry({ id: "c", status: "PUBLISHED", publishedAt: d("2026-10-06T11:00:00Z"), firstPublishedAt: null }),
                entry({ id: "d", status: "SCHEDULED", scheduledAt: d("2026-10-09T09:00:00Z") }),
            ],
            opts,
        );
        expect(my.publishedThisWeek).toBe(1);
        expect(my.publishedLastWeek).toBe(1);
        expect(my.weekly).toMatchObject({ done: 2, published: 1, scheduled: 1, target: 3 });
        expect(my.weekly.week).toEqual([false, true, false, false, false, false, false]);
        expect(my.contentMix.published).toBe(3);
    });

    it("lists review items as awaiting review and gives approved entries a group", () => {
        const my = buildMy([entry({ id: "r", status: "IN_REVIEW" }), entry({ id: "ok", status: "APPROVED" }), entry({ id: "s", status: "SCHEDULED", scheduledAt: now })], opts);
        expect(my.awaitingReview).toBe(1);
        expect(my.work.awaitingReview.map((w) => w.id)).toEqual(["r"]);
        expect(my.work.approved.map((w) => w.id)).toEqual(["ok"]);
        expect(my.approved).toBe(1);
    });
});

describe("buildActivity", () => {
    const entries = new Map([["e1", { title: "Pricing", contentTypeId: "t1" }]]);
    const actors = new Map([["u2", { name: "Reviewer", role: "admin", roleName: "Admin", avatarUrl: null, avatarStyle: null }]]);
    const ev = (over: object) => ({ id: "a1", action: "content.publish", userId: "u2", resourceId: "e1", createdAt: now, ...over });

    it("shows the action that happened and the person who did it", () => {
        const [row] = buildActivity([ev({})], entries, actors, () => "Page");
        expect(row).toMatchObject({ person: "Reviewer", roleName: "Admin", action: "published", target: "Pricing", type: "Page", entryId: "e1" });
    });

    it("attributes scheduler publishes to the system and keeps edits as edits", () => {
        const rows = buildActivity([ev({ id: "a2", userId: null }), ev({ id: "a3", action: "content.edit" }), ev({ id: "a4", action: "content.archive" })], entries, actors, () => "Page");
        expect(rows.map((r) => [r.person, r.action])).toEqual([["System", "published"], ["Reviewer", "edited"], ["Reviewer", "archived"]]);
    });

    it("drops events on entries the viewer cannot see", () => {
        expect(buildActivity([ev({ resourceId: "hidden" })], entries, actors, () => "Page")).toEqual([]);
    });
});
