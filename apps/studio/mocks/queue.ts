import type { ContentType } from "@/mocks/content";

/**
 * Publish Queue mock — content that's scheduled, approved (ready to schedule),
 * or still in review, grouped into time buckets. Sample fallback for the
 * "Northbound" studio; backend supplies real timestamps later.
 */
export type QueueStatus = "scheduled" | "approved" | "review";

export type QueueBucket = "Today" | "Tomorrow" | "This week" | "Later";

export type QueueItem = {
    id: string;
    title: string;
    type: ContentType;
    author: { name: string; avatar: string };
    status: QueueStatus;
    bucket: QueueBucket;
    date: string;
    time?: string;
};

export const QUEUE_BUCKETS: QueueBucket[] = [
    "Today",
    "Tomorrow",
    "This week",
    "Later",
];

export const queueItems: QueueItem[] = [
    {
        id: "q1",
        title: "Pricing creative work: charge for value, not hours",
        type: "Blog",
        author: { name: "Olivia Hayes", avatar: "/images/avatar-4.png" },
        status: "scheduled",
        bucket: "Today",
        date: "Jun 4",
        time: "11:00 AM",
    },
    {
        id: "q2",
        title: "Q3 campaign — Launch ready",
        type: "Landing",
        author: { name: "Marcus Bennett", avatar: "/images/avatar-1.png" },
        status: "approved",
        bucket: "Today",
        date: "Jun 4",
    },
    {
        id: "q3",
        title: "Harbor & Vine — a rebrand with room to grow",
        type: "Case Study",
        author: { name: "Sarah Whitfield", avatar: "/images/avatar.png" },
        status: "approved",
        bucket: "Tomorrow",
        date: "Jun 5",
    },
    {
        id: "q4",
        title: "Running a brand workshop that moves the needle",
        type: "Blog",
        author: { name: "Priya Nair", avatar: "/images/avatar-2.png" },
        status: "scheduled",
        bucket: "Tomorrow",
        date: "Jun 5",
        time: "10:00 AM",
    },
    {
        id: "q5",
        title: "Motion that adds meaning (without slowing your site)",
        type: "Blog",
        author: { name: "Liam Foster", avatar: "/images/avatar-1.png" },
        status: "review",
        bucket: "This week",
        date: "Jun 6",
    },
    {
        id: "q6",
        title: "Webinar: Rebranding without the risk",
        type: "Landing",
        author: { name: "Olivia Hayes", avatar: "/images/avatar-4.png" },
        status: "scheduled",
        bucket: "This week",
        date: "Jun 8",
        time: "9:00 AM",
    },
    {
        id: "q7",
        title: "Orbit — a design system that scaled with the team",
        type: "Case Study",
        author: { name: "Liam Foster", avatar: "/images/avatar-1.png" },
        status: "review",
        bucket: "Later",
        date: "Jun 11",
    },
    {
        id: "q8",
        title: "How to write a creative brief your team won't ignore",
        type: "Blog",
        author: { name: "Daniel Brooks", avatar: "/images/avatar-3.png" },
        status: "review",
        bucket: "Later",
        date: "Jun 12",
    },
];

/** Accent color per status (for the card's left rail + time block). */
export const queueStatusColor: Record<QueueStatus, string> = {
    scheduled: "#3B82F6",
    approved: "#00B894",
    review: "#6C5CE7",
};
