import type { ContentType } from "@/mocks/content";
import type { PillStatus } from "@/components/ui/StatusPill";

/**
 * Content calendar events for the /content/calendar page (May 2026) — sample
 * fallback for "Northbound", a brand, design & marketing studio. Each event is a
 * piece of content scheduled/published on a given day, colored by content type.
 * Backend supplies real scheduled timestamps later.
 */
export type CalEvent = {
    id: string;
    title: string;
    type: ContentType;
    /** day of the month (May 2026). */
    day: number;
    time?: string;
    status: Exclude<PillStatus, "approved">;
    author: { name: string; avatar: string };
};

/** Content-type accent colors used across the calendar (match the seed types). */
export const typeColor: Record<ContentType, string> = {
    Blog: "#6C5CE7",
    Page: "#3B82F6",
    Landing: "#E0529C",
    "Case Study": "#00B894",
};

export const CAL_YEAR = 2026;
export const CAL_MONTH = 4; // May (0-indexed)
export const CAL_TODAY = 31;

export const calEvents: CalEvent[] = [
    { id: "e1", title: "B2B SEO: content that earns its rankings", type: "Blog", day: 5, time: "9:00 AM", status: "live", author: { name: "Priya Nair", avatar: "/images/avatar-2.png" } },
    { id: "e2", title: "The anatomy of a landing page that converts", type: "Blog", day: 8, time: "11:00 AM", status: "live", author: { name: "Daniel Brooks", avatar: "/images/avatar-3.png" } },
    { id: "e3", title: "About Northbound", type: "Page", day: 12, time: "2:00 PM", status: "live", author: { name: "Marcus Bennett", avatar: "/images/avatar-1.png" } },
    { id: "e4", title: "Services", type: "Page", day: 16, time: "10:00 AM", status: "live", author: { name: "Marcus Bennett", avatar: "/images/avatar-1.png" } },
    { id: "e5", title: "Webinar: Rebranding without the risk", type: "Landing", day: 20, time: "3:00 PM", status: "scheduled", author: { name: "Olivia Hayes", avatar: "/images/avatar-4.png" } },
    { id: "e6", title: "Orbit — a design system that scaled with the team", type: "Case Study", day: 22, status: "review", author: { name: "Liam Foster", avatar: "/images/avatar-1.png" } },
    { id: "e7", title: "Your rebrand should start with positioning, not a logo", type: "Blog", day: 27, time: "9:00 AM", status: "live", author: { name: "Sarah Whitfield", avatar: "/images/avatar.png" } },
    { id: "e8", title: "Studio culture", type: "Page", day: 28, status: "draft", author: { name: "Liam Foster", avatar: "/images/avatar-1.png" } },
    { id: "e9", title: "Motion that adds meaning (without slowing your site)", type: "Blog", day: 29, status: "review", author: { name: "Liam Foster", avatar: "/images/avatar-1.png" } },
    { id: "e10", title: "Q3 campaign — Launch ready", type: "Landing", day: 30, time: "9:00 AM", status: "scheduled", author: { name: "Marcus Bennett", avatar: "/images/avatar-1.png" } },
    { id: "e11", title: "Pricing creative work: charge for value, not hours", type: "Blog", day: 31, time: "9:00 AM", status: "scheduled", author: { name: "Olivia Hayes", avatar: "/images/avatar-4.png" } },
    { id: "e12", title: "Free brand audit", type: "Landing", day: 31, time: "3:00 PM", status: "live", author: { name: "Priya Nair", avatar: "/images/avatar-2.png" } },
];
