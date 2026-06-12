import type { PillStatus } from "@/components/ui/StatusPill";

export type ContentType = "Blog" | "Page" | "Landing" | "Case Study";

export type ContentItem = {
    id: string;
    title: string;
    slug: string;
    type: ContentType;
    status: Exclude<PillStatus, "approved">;
    author: { name: string; avatar: string };
    seoScore: number;
    /** ISO date — formatted at render time with suppressHydrationWarning. */
    updated: string;
    views: number;
};

/**
 * All Content rows — sample fallback shown when the studio isn't connected to the
 * API (the live table reads from /entries). Themed to "Northbound", a brand,
 * design & marketing studio, matching the database seed.
 */
export const content: ContentItem[] = [
    {
        id: "c1",
        title: "Your rebrand should start with positioning, not a logo",
        slug: "/blog/rebrand-starts-with-positioning",
        type: "Blog",
        status: "live",
        author: { name: "Sarah Whitfield", avatar: "/images/avatar.png" },
        seoScore: 92,
        updated: "2026-06-01",
        views: 8420,
    },
    {
        id: "c2",
        title: "B2B SEO: content that earns its rankings",
        slug: "/blog/b2b-seo-content-that-earns-rankings",
        type: "Blog",
        status: "live",
        author: { name: "Priya Nair", avatar: "/images/avatar-2.png" },
        seoScore: 88,
        updated: "2026-05-30",
        views: 6210,
    },
    {
        id: "c3",
        title: "The anatomy of a landing page that converts",
        slug: "/blog/landing-page-that-converts",
        type: "Blog",
        status: "live",
        author: { name: "Daniel Brooks", avatar: "/images/avatar-3.png" },
        seoScore: 85,
        updated: "2026-05-28",
        views: 5740,
    },
    {
        id: "c4",
        title: "Lumen — a fintech brand for the next generation",
        slug: "/work/lumen",
        type: "Case Study",
        status: "live",
        author: { name: "Sarah Whitfield", avatar: "/images/avatar.png" },
        seoScore: 90,
        updated: "2026-05-24",
        views: 4120,
    },
    {
        id: "c5",
        title: "Atlas Coffee — a DTC site that doubled conversion",
        slug: "/work/atlas-coffee",
        type: "Case Study",
        status: "live",
        author: { name: "Liam Foster", avatar: "/images/avatar-1.png" },
        seoScore: 83,
        updated: "2026-05-18",
        views: 3360,
    },
    {
        id: "c6",
        title: "Free brand audit",
        slug: "/free-brand-audit",
        type: "Landing",
        status: "live",
        author: { name: "Priya Nair", avatar: "/images/avatar-2.png" },
        seoScore: 79,
        updated: "2026-05-14",
        views: 2980,
    },
    {
        id: "c7",
        title: "Pricing creative work: charge for value, not hours",
        slug: "/blog/pricing-creative-work",
        type: "Blog",
        status: "scheduled",
        author: { name: "Olivia Hayes", avatar: "/images/avatar-4.png" },
        seoScore: 74,
        updated: "2026-06-04",
        views: 0,
    },
    {
        id: "c8",
        title: "Webinar: Rebranding without the risk",
        slug: "/webinar-rebranding-without-the-risk",
        type: "Landing",
        status: "scheduled",
        author: { name: "Olivia Hayes", avatar: "/images/avatar-4.png" },
        seoScore: 71,
        updated: "2026-06-04",
        views: 0,
    },
    {
        id: "c9",
        title: "Motion that adds meaning (without slowing your site)",
        slug: "/blog/motion-that-adds-meaning",
        type: "Blog",
        status: "review",
        author: { name: "Liam Foster", avatar: "/images/avatar-1.png" },
        seoScore: 64,
        updated: "2026-06-03",
        views: 0,
    },
    {
        id: "c10",
        title: "Orbit — a design system that scaled with the team",
        slug: "/work/orbit",
        type: "Case Study",
        status: "review",
        author: { name: "Liam Foster", avatar: "/images/avatar-1.png" },
        seoScore: 69,
        updated: "2026-06-03",
        views: 0,
    },
    {
        id: "c11",
        title: "The case for fewer, better web pages",
        slug: "/blog/fewer-better-web-pages",
        type: "Blog",
        status: "draft",
        author: { name: "Olivia Hayes", avatar: "/images/avatar-4.png" },
        seoScore: 48,
        updated: "2026-06-02",
        views: 0,
    },
    {
        id: "c12",
        title: "Studio culture",
        slug: "/studio-culture",
        type: "Page",
        status: "draft",
        author: { name: "Liam Foster", avatar: "/images/avatar-1.png" },
        seoScore: 41,
        updated: "2026-06-01",
        views: 0,
    },
];

export const CONTENT_TYPES: ContentType[] = ["Blog", "Page", "Landing", "Case Study"];

export const CONTENT_STATUSES: ContentItem["status"][] = [
    "live",
    "scheduled",
    "review",
    "draft",
];
