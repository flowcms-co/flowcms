import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EditorOverview, { relTime } from "./EditorOverview";

vi.mock("next/link", () => ({ default: ({ children, ...p }: { children: React.ReactNode; href: string }) => <a {...p}>{children}</a> }));
vi.mock("@/components/ui/Card", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/motion/CountUp", () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock("@/components/ui/MetricBar", () => ({ default: () => null }));
vi.mock("@/lib/useReveal", () => ({ useRevealBatch: () => undefined }));
vi.mock("recharts", () => ({ Cell: () => null, Pie: () => null, PieChart: () => null, ResponsiveContainer: () => null }));
vi.mock("react-circular-progressbar", () => ({ CircularProgressbarWithChildren: () => null, buildStyles: () => ({}) }));
vi.mock("react-circular-progressbar/dist/styles.css", () => ({}));
const dash = vi.hoisted(() => ({ state: { data: null as unknown, loading: true, error: false } }));
vi.mock("@/lib/useDashboard", () => ({ useDashboard: () => dash.state }));

afterEach(cleanup);

const item = (id: string, state: string) => ({ id, title: `Title ${id}`, type: "Blog", state, due: new Date().toISOString() });
const my = {
    drafts: 1, awaitingReview: 1, approved: 1, scheduled: 0, publishedThisWeek: 0, publishedLastWeek: 0, aiGenerations: 0,
    work: { awaitingReview: [item("r1", "IN_REVIEW")], approved: [item("ok1", "APPROVED")], inProgress: [item("d1", "DRAFT")], scheduled: [] },
    recentlyPublished: [{ id: "p1", title: "Live one", type: "Blog", publishedAt: new Date().toISOString() }],
    contentMix: { published: 1, inReview: 1, approved: 1, drafts: 1, scheduled: 0 },
    insights: { wordsRecent: 0 },
    weekly: { done: 0, published: 0, scheduled: 0, target: 3, topic: null, streakDays: 0, week: [false, false, false, false, false, false, false] },
};
const hrefs = () => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));

describe("EditorOverview", () => {
    it("opens the entry each row is about, and filters with a status the content list knows", () => {
        dash.state = { data: { my, perLocale: false }, loading: false, error: false };
        render(<EditorOverview />);
        const links = hrefs();
        for (const id of ["r1", "ok1", "d1", "p1"]) expect(links).toContain(`/content/editor?id=${id}`);
        expect(links).toContain("/content?status=live&author=me");
        expect(links.some((h) => h?.includes("status=published"))).toBe(false);
        expect(links).toContain("/content?status=review&author=me");
    });

    it("says Awaiting review, lists approved work, and labels all-time and 30-day figures as such", () => {
        dash.state = { data: { my, perLocale: false }, loading: false, error: false };
        render(<EditorOverview />);
        const text = document.body.textContent ?? "";
        expect(text).toContain("Awaiting review");
        expect(text).not.toContain("Due today");
        expect(text).toContain("Ready to Publish");
        expect(text).toContain("All time");
        expect(text).not.toContain("This month");
    });

    it("shows a skeleton while loading and an error on failure, never zeroes", () => {
        dash.state = { data: null, loading: true, error: false };
        const { unmount } = render(<EditorOverview />);
        expect(screen.getByLabelText("Loading your dashboard")).toBeTruthy();
        expect(document.body.textContent).not.toContain("0");
        unmount();
        dash.state = { data: null, loading: false, error: true };
        render(<EditorOverview />);
        expect(screen.getByRole("alert").textContent).toContain("Couldn’t load your dashboard");
    });
});

describe("relTime", () => {
    it("gives hours for anything under a day old instead of 'today'", () => {
        const now = Date.parse("2026-10-05T12:00:00Z");
        expect(relTime("2026-10-05T11:30:00Z", now)).toBe("just now");
        expect(relTime("2026-10-04T15:00:00Z", now)).toBe("21h ago");
        expect(relTime("2026-10-04T11:00:00Z", now)).toBe("yesterday");
    });
});
