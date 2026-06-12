export type ContentStatus = "live" | "scheduled" | "review" | "draft";

export type Stat = {
    label: string;
    value: string;
    delta: string;
    /** up = green arrow, down = red — semantics depend on `goodWhenUp`. */
    dir: "up" | "down";
    goodWhenUp: boolean;
    icon: string;
    /** Optional accent color — when set, the icon tile uses this hue (used to
        make the Content Editor dashboard colorful). Defaults to brand purple. */
    color?: string;
};

export const stats: Stat[] = [
    {
        label: "Organic clicks",
        value: "48.2K",
        delta: "12.4%",
        dir: "up",
        goodWhenUp: true,
        icon: "overview",
    },
    {
        label: "Impressions",
        value: "1.24M",
        delta: "8.1%",
        dir: "up",
        goodWhenUp: true,
        icon: "chart",
    },
    {
        label: "Avg. position",
        value: "14.3",
        delta: "2.1",
        dir: "down",
        goodWhenUp: false,
        icon: "compass",
    },
    {
        label: "Published (30d)",
        value: "36",
        delta: "5",
        dir: "up",
        goodWhenUp: true,
        icon: "document",
    },
];

/** Stat strip for the Content Editor — personal, task-focused (no site-wide SEO).
   Each card carries its own accent color so the editor dashboard pops. */
export const editorStats: Stat[] = [
    {
        label: "My drafts",
        value: "7",
        delta: "2",
        dir: "up",
        goodWhenUp: true,
        icon: "edit",
        color: "#6C5CE7",
    },
    {
        label: "In review",
        value: "3",
        delta: "1",
        dir: "up",
        goodWhenUp: true,
        icon: "clock",
        color: "#F5A623",
    },
    {
        label: "Published (30d)",
        value: "12",
        delta: "4",
        dir: "up",
        goodWhenUp: true,
        icon: "document",
        color: "#00B894",
    },
    {
        label: "AI generations",
        value: "28",
        delta: "9",
        dir: "up",
        goodWhenUp: true,
        icon: "sparkles",
        color: "#E91E63",
    },
];

/** Stat strip for the SEO Manager — SEO-weighted metrics. */
export const seoStats: Stat[] = [
    {
        label: "SEO health",
        value: "82",
        delta: "3",
        dir: "up",
        goodWhenUp: true,
        icon: "chart",
    },
    {
        label: "Avg. position",
        value: "14.3",
        delta: "2.1",
        dir: "down",
        goodWhenUp: false,
        icon: "compass",
    },
    {
        label: "Open opportunities",
        value: "50",
        delta: "6",
        dir: "down",
        goodWhenUp: false,
        icon: "star",
    },
    {
        label: "Cannibalization",
        value: "2",
        delta: "1",
        dir: "down",
        goodWhenUp: false,
        icon: "search",
    },
];

/** Search-performance hero card (matches search-performance.html).
   The top-right control switches the time range; the big number, line graph and
   all 4 metric cards swap to that period's data. Backend (GSC/GA4) replaces it. */
export type SearchPerfCard = {
    key: string;
    label: string;
    value: string;
    percent: number;
    color: string;
    iconBg: string;
    delta: string;
    dir: "up" | "down";
};

export type SearchPerfPeriod = {
    id: string;
    label: string;
    big: string;
    bigSub: string;
    bigDelta: string;
    /** chart points: current (solid) vs previous (dashed). */
    points: { x: string; cur: number; prev: number }[];
    cards: SearchPerfCard[];
};

const card = (
    key: string,
    label: string,
    value: string,
    percent: number,
    color: string,
    iconBg: string,
    delta: string,
    dir: "up" | "down",
): SearchPerfCard => ({ key, label, value, percent, color, iconBg, delta, dir });

const MONTHS_12 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const searchPerfPeriods: SearchPerfPeriod[] = [
    {
        id: "month",
        label: "This month",
        big: "24.6k",
        bigSub: "Monthly total",
        bigDelta: "+18% vs last month",
        points: [
            { x: "W1", cur: 4.8, prev: 4.0 },
            { x: "W2", cur: 5.6, prev: 4.6 },
            { x: "W3", cur: 6.4, prev: 5.2 },
            { x: "W4", cur: 7.8, prev: 6.1 },
        ],
        cards: [
            card("impressions", "Impressions", "318k", 78, "#6C5CE7", "#EDE9FB", "+9% this month", "up"),
            card("position", "Avg. position", "11.4", 55, "#E91E63", "#FCE4EC", "Up from 13.1", "up"),
            card("bounce", "Bounce rate", "42%", 42, "#FF9800", "#FFF3E0", "+3% this month", "down"),
            card("indexed", "Pages indexed", "1.2k", 90, "#4CAF50", "#E8F5E9", "+14 this month", "up"),
        ],
    },
    {
        id: "30d",
        label: "Last 30 days",
        big: "22.1k",
        bigSub: "Rolling 30 days",
        bigDelta: "+11% vs prior 30 days",
        points: [
            { x: "D1", cur: 4.2, prev: 3.9 },
            { x: "D8", cur: 5.1, prev: 4.5 },
            { x: "D15", cur: 5.9, prev: 5.0 },
            { x: "D23", cur: 6.9, prev: 5.7 },
        ],
        cards: [
            card("impressions", "Impressions", "291k", 72, "#6C5CE7", "#EDE9FB", "+6% vs prior", "up"),
            card("position", "Avg. position", "11.9", 52, "#E91E63", "#FCE4EC", "Up from 12.8", "up"),
            card("bounce", "Bounce rate", "44%", 44, "#FF9800", "#FFF3E0", "+2% vs prior", "down"),
            card("indexed", "Pages indexed", "1.18k", 88, "#4CAF50", "#E8F5E9", "+9 vs prior", "up"),
        ],
    },
    {
        id: "quarter",
        label: "This quarter",
        big: "68.4k",
        bigSub: "Quarter to date",
        bigDelta: "+24% vs last quarter",
        points: [
            { x: "Mar", cur: 18, prev: 14 },
            { x: "Apr", cur: 22, prev: 17 },
            { x: "May", cur: 28, prev: 21 },
        ],
        cards: [
            card("impressions", "Impressions", "902k", 84, "#6C5CE7", "#EDE9FB", "+15% this qtr", "up"),
            card("position", "Avg. position", "10.8", 60, "#E91E63", "#FCE4EC", "Up from 13.6", "up"),
            card("bounce", "Bounce rate", "40%", 40, "#FF9800", "#FFF3E0", "-2% this qtr", "up"),
            card("indexed", "Pages indexed", "1.24k", 92, "#4CAF50", "#E8F5E9", "+38 this qtr", "up"),
        ],
    },
    {
        id: "year",
        label: "This year",
        big: "214k",
        bigSub: "Year to date",
        bigDelta: "+42% vs last year",
        points: MONTHS_12.slice(0, 5).map((m, i) => ({
            x: m,
            cur: 30 + i * 8,
            prev: 24 + i * 6,
        })),
        cards: [
            card("impressions", "Impressions", "3.1M", 88, "#6C5CE7", "#EDE9FB", "+31% YTD", "up"),
            card("position", "Avg. position", "12.2", 50, "#E91E63", "#FCE4EC", "Up from 16.0", "up"),
            card("bounce", "Bounce rate", "45%", 45, "#FF9800", "#FFF3E0", "-4% YTD", "up"),
            card("indexed", "Pages indexed", "1.24k", 95, "#4CAF50", "#E8F5E9", "+182 YTD", "up"),
        ],
    },
    {
        id: "12m",
        label: "Last 12 months",
        big: "486k",
        bigSub: "Trailing 12 months",
        bigDelta: "+38% YoY",
        points: MONTHS_12.map((m, i) => ({
            x: m,
            cur: 22 + Math.round(Math.abs(Math.sin(i)) * 30),
            prev: 18 + Math.round(Math.abs(Math.sin(i + 1)) * 24),
        })),
        cards: [
            card("impressions", "Impressions", "7.4M", 90, "#6C5CE7", "#EDE9FB", "+28% YoY", "up"),
            card("position", "Avg. position", "12.9", 46, "#E91E63", "#FCE4EC", "Up from 18.3", "up"),
            card("bounce", "Bounce rate", "47%", 47, "#FF9800", "#FFF3E0", "-3% YoY", "up"),
            card("indexed", "Pages indexed", "1.24k", 96, "#4CAF50", "#E8F5E9", "+410 YoY", "up"),
        ],
    },
];

/** Default/back-compat: the "this month" period. */
export const searchPerf = {
    bigLabel: "Organic clicks",
    source: "Via Google Search Console",
};

/** Monthly organic traffic — current period vs. previous, for the area chart. */
export const traffic = [
    { name: "Oct", current: 22, previous: 18 },
    { name: "Nov", current: 28, previous: 21 },
    { name: "Dec", current: 26, previous: 24 },
    { name: "Jan", current: 35, previous: 27 },
    { name: "Feb", current: 41, previous: 33 },
    { name: "Mar", current: 38, previous: 36 },
    { name: "Apr", current: 46, previous: 39 },
    { name: "May", current: 52, previous: 42 },
];

export type ContentRow = {
    id: string;
    title: string;
    type: string;
    status: ContentStatus;
    author: string;
    updated: string;
};

export const recentContent: ContentRow[] = [
    {
        id: "c1",
        title: "Your rebrand should start with positioning, not a logo",
        type: "Blog",
        status: "live",
        author: "Sarah Whitfield",
        updated: "2h ago",
    },
    {
        id: "c2",
        title: "Q3 campaign — Launch ready",
        type: "Landing",
        status: "scheduled",
        author: "Marcus Bennett",
        updated: "5h ago",
    },
    {
        id: "c3",
        title: "Motion that adds meaning (without slowing your site)",
        type: "Blog",
        status: "review",
        author: "Liam Foster",
        updated: "Yesterday",
    },
    {
        id: "c4",
        title: "Website teardown offer",
        type: "Landing",
        status: "draft",
        author: "Daniel Brooks",
        updated: "2d ago",
    },
    {
        id: "c5",
        title: "B2B SEO: content that earns its rankings",
        type: "Blog",
        status: "live",
        author: "Priya Nair",
        updated: "3d ago",
    },
];

export const pipeline: { stage: string; count: number; status: ContentStatus | "approved" }[] = [
    { stage: "Draft", count: 6, status: "draft" },
    { stage: "Review", count: 3, status: "review" },
    { stage: "Approved", count: 2, status: "approved" },
    { stage: "Scheduled", count: 3, status: "scheduled" },
    { stage: "Live", count: 18, status: "live" },
];

export const seo = {
    score: 82,
    /** Donut segments — issue severity breakdown (high/medium/low). */
    severity: [
        { label: "High", value: 13, color: "#6C5CE7" },
        { label: "Medium", value: 14, color: "#FFB7F5" },
        { label: "Low", value: 23, color: "#E4E4E4" },
    ],
    opportunities: [
        { label: "Add meta descriptions", count: 8, impact: "high" },
        { label: "Fix thin content pages", count: 5, impact: "high" },
        { label: "Internal links missing", count: 14, impact: "medium" },
        { label: "Images without alt text", count: 23, impact: "low" },
    ] as { label: string; count: number; impact: "high" | "medium" | "low" }[],
};

/** Full-width "Recent activity" audit log (Unity CommentsPage Activity layout).
   Left filters narrow by the ROLE that performed the action; each row is an
   action (edited / published / submitted for approval / …) on a content item. */
export type ActivityRole = "super" | "admin" | "seo" | "editor" | "agent";

export type ActivityRoleFilter = { id: ActivityRole; label: string; on: boolean };

export const activityRoleFilters: ActivityRoleFilter[] = [
    { id: "super", label: "Super Admin", on: true },
    { id: "admin", label: "Admin", on: true },
    { id: "seo", label: "SEO Manager", on: true },
    { id: "editor", label: "Editor", on: true },
    { id: "agent", label: "AI Agents", on: true },
];

/** Action verb → badge color + icon. */
export type ActivityAction =
    | "published"
    | "edited"
    | "submitted"
    | "approved"
    | "scheduled"
    | "generated";

export const actionMeta: Record<
    ActivityAction,
    { label: string; color: string; icon: string }
> = {
    published: { label: "published", color: "#00B894", icon: "check" },
    edited: { label: "edited", color: "#6C5CE7", icon: "edit" },
    submitted: { label: "submitted for approval", color: "#F5A623", icon: "clock" },
    approved: { label: "approved", color: "#00B894", icon: "check" },
    scheduled: { label: "scheduled", color: "#3B82F6", icon: "calendar" },
    generated: { label: "generated", color: "#A29BFE", icon: "sparkles" },
};

/** Role → small badge tint shown next to the actor. */
export const roleMeta: Record<ActivityRole, { label: string; color: string }> = {
    super: { label: "Super Admin", color: "#6C5CE7" },
    admin: { label: "Admin", color: "#3B82F6" },
    seo: { label: "SEO Manager", color: "#00B894" },
    editor: { label: "Editor", color: "#F5A623" },
    agent: { label: "AI Agent", color: "#A29BFE" },
};

export type ActivityEntry = {
    id: string;
    person: string;
    avatar: string;
    role: ActivityRole;
    action: ActivityAction;
    target: string;
    type: string; // content type (Blog, Page…)
    time: string;
};

export const activityEntries: ActivityEntry[] = [
    {
        id: "0",
        person: "Priya Nair",
        avatar: "/images/avatar-2.png",
        role: "seo",
        action: "published",
        target: "B2B SEO: content that earns its rankings",
        type: "Blog",
        time: "2h ago",
    },
    {
        id: "1",
        person: "Daniel Brooks",
        avatar: "/images/avatar-3.png",
        role: "editor",
        action: "submitted",
        target: "Motion that adds meaning (without slowing your site)",
        type: "Blog",
        time: "4h ago",
    },
    {
        id: "2",
        person: "Flow AI",
        avatar: "/images/avatar.png",
        role: "agent",
        action: "generated",
        target: "Pricing creative work: charge for value, not hours",
        type: "Blog",
        time: "5h ago",
    },
    {
        id: "3",
        person: "Marcus Bennett",
        avatar: "/images/avatar-1.png",
        role: "admin",
        action: "approved",
        target: "Q3 campaign — Launch ready",
        type: "Landing",
        time: "6h ago",
    },
    {
        id: "4",
        person: "Sarah Whitfield",
        avatar: "/images/avatar.png",
        role: "super",
        action: "scheduled",
        target: "Webinar: Rebranding without the risk",
        type: "Landing",
        time: "Yesterday",
    },
    {
        id: "5",
        person: "Liam Foster",
        avatar: "/images/avatar-1.png",
        role: "editor",
        action: "edited",
        target: "Orbit — a design system that scaled with the team",
        type: "Case Study",
        time: "Yesterday",
    },
];

export type Activity = {
    id: string;
    actor: string;
    action: string;
    target: string;
    time: string;
    type: ContentStatus | "system";
};

export const activity: Activity[] = [
    {
        id: "a1",
        actor: "Priya Nair",
        action: "published",
        target: "B2B SEO guide",
        time: "2h ago",
        type: "live",
    },
    {
        id: "a2",
        actor: "Daniel Brooks",
        action: "submitted for review",
        target: "Motion that adds meaning",
        time: "4h ago",
        type: "review",
    },
    {
        id: "a3",
        actor: "System",
        action: "flagged cannibalization on",
        target: "“brand strategy agency”",
        time: "6h ago",
        type: "system",
    },
    {
        id: "a4",
        actor: "Marcus Bennett",
        action: "scheduled",
        target: "Q3 campaign",
        time: "Yesterday",
        type: "scheduled",
    },
];

/** SEO Manager — topical clusters with coverage (for the SEO overview). */
export const clusters: { name: string; pages: number; coverage: number }[] = [
    { name: "Branding", pages: 12, coverage: 84 },
    { name: "Web design", pages: 9, coverage: 66 },
    { name: "Growth & SEO", pages: 7, coverage: 52 },
    { name: "Design systems", pages: 5, coverage: 71 },
];

/** SEO Manager — cannibalization alerts. */
export const cannibalization: { keyword: string; pages: number; severity: "high" | "medium" }[] = [
    { keyword: "brand strategy agency", pages: 2, severity: "high" },
    { keyword: "web design studio", pages: 2, severity: "medium" },
];

/** SEO Manager — content awaiting review/approval (the SEO manager reviews and
   approves editors' work). Each row carries an SEO score the manager cares about. */
export const reviewQueue: {
    id: string;
    title: string;
    author: string;
    avatar: string;
    type: string;
    seo: number;
    submitted: string;
}[] = [
    {
        id: "r1",
        title: "Motion that adds meaning (without slowing your site)",
        author: "Liam Foster",
        avatar: "/images/avatar-1.png",
        type: "Blog",
        seo: 78,
        submitted: "4h ago",
    },
    {
        id: "r2",
        title: "How to write a creative brief your team won't ignore",
        author: "Daniel Brooks",
        avatar: "/images/avatar-3.png",
        type: "Blog",
        seo: 64,
        submitted: "Yesterday",
    },
    {
        id: "r3",
        title: "Orbit — a design system that scaled with the team",
        author: "Liam Foster",
        avatar: "/images/avatar-1.png",
        type: "Case Study",
        seo: 91,
        submitted: "Yesterday",
    },
    {
        id: "r4",
        title: "Website teardown offer",
        author: "Daniel Brooks",
        avatar: "/images/avatar-3.png",
        type: "Landing",
        seo: 52,
        submitted: "2d ago",
    },
];

/** SEO Manager — per-editor work & performance (drafts / in review / published).
   Lets the manager see each contributor's output at a glance. */
export const teamEditors: {
    id: string;
    name: string;
    avatar: string;
    role: ActivityRole;
    drafts: number;
    inReview: number;
    published: number;
}[] = [
    { id: "e1", name: "Daniel Brooks", avatar: "/images/avatar-3.png", role: "editor", drafts: 4, inReview: 2, published: 11 },
    { id: "e2", name: "Olivia Hayes", avatar: "/images/avatar-4.png", role: "editor", drafts: 3, inReview: 1, published: 8 },
    { id: "e3", name: "Liam Foster", avatar: "/images/avatar-1.png", role: "editor", drafts: 2, inReview: 3, published: 14 },
    { id: "e4", name: "Priya Nair", avatar: "/images/avatar-2.png", role: "seo", drafts: 2, inReview: 0, published: 9 },
];

/** Content Editor — weekly publishing goal + writing streak (for the colorful
   editor dashboard). `week` = which of the last 7 days had activity. */
export const editorGoal = {
    published: 5,
    target: 8,
    streakDays: 12,
    week: [true, true, true, false, true, true, false],
};

/** Content Editor — my tasks queue. */
export const editorTasks: {
    id: string;
    title: string;
    state: ContentStatus;
    due: string;
}[] = [
    { id: "t1", title: "Website teardown offer", state: "draft", due: "Today" },
    { id: "t2", title: "The case for fewer, better web pages", state: "draft", due: "Tomorrow" },
    { id: "t3", title: "Motion that adds meaning", state: "review", due: "Jun 6" },
    { id: "t4", title: "Naming a company: a field guide", state: "draft", due: "Jun 7" },
];

/** Small "Next 7 days" strip — still used by the Content Editor overview. */
export const publishCalendar: { day: string; date: string; title?: string; status?: ContentStatus }[] = [
    { day: "Mon", date: "Jun 1", title: "Free brand audit", status: "scheduled" },
    { day: "Tue", date: "Jun 2" },
    { day: "Wed", date: "Jun 3", title: "Webinar: Rebranding", status: "scheduled" },
    { day: "Thu", date: "Jun 4" },
    { day: "Fri", date: "Jun 5", title: "Q3 campaign", status: "scheduled" },
    { day: "Sat", date: "Jun 6" },
    { day: "Sun", date: "Jun 7" },
];

/** Content calendar (Unity Timeline layout): left = content-type filters,
   right = full-week M–Sa header + hourly rows. Each event spans day columns.
   Filtering by category narrows which events show. Backend replaces events. */

/** Weekday columns shown across the timeline header. */
export type WeekDay = {
    key: string;
    label: string; // M, T, W…
    /** small status dot under the label: green/purple/grey, or none. */
    dot?: "done" | "active" | "muted";
    today?: boolean; // orange highlighted circle
};

export const weekDays: WeekDay[] = [
    { key: "mon", label: "M", dot: "done" },
    { key: "tue", label: "T", dot: "active" },
    { key: "wed", label: "W" },
    { key: "thu", label: "Th", today: true },
    { key: "fri", label: "Fr", dot: "muted" },
    { key: "sat", label: "Sa" },
    { key: "sun", label: "Su" },
];

/** Left-column content-type filters (icon + label, one active). */
export type CalendarCategory = { id: string; label: string; icon: string; iconBg: string; iconColor: string };

export const calendarCategories: CalendarCategory[] = [
    { id: "all", label: "All content", icon: "grid", iconBg: "#EDE9FB", iconColor: "#6C5CE7" },
    { id: "blog", label: "Blog posts", icon: "document", iconBg: "#FCE4EC", iconColor: "#E91E63" },
    { id: "landing", label: "Landing pages", icon: "overview", iconBg: "#EDE9FB", iconColor: "#6C5CE7" },
    { id: "social", label: "Social", icon: "chat", iconBg: "#FFF3E0", iconColor: "#FF9800" },
    { id: "email", label: "Newsletters", icon: "mail", iconBg: "#E8F5E9", iconColor: "#4CAF50" },
];

/** A scheduled bar: which hour row, which day columns it spans (0-indexed into
   weekDays), a label, color, and which category it belongs to. */
export type TimelineEvent = {
    hour: string;
    title: string;
    startCol: number; // 0..5 (Mon..Sat)
    span: number; // number of day columns
    color: string;
    category: string;
};

export const timelineHours = ["08:00", "09:00", "10:00", "11:00", "12:00"];

export const timelineEvents: TimelineEvent[] = [
    { hour: "08:00", title: "Brand audit draft", startCol: 0, span: 2, color: "#6C5CE7", category: "blog" },
    { hour: "09:00", title: "Social teasers", startCol: 1, span: 3, color: "#FFA2C0", category: "social" },
    { hour: "10:00", title: "Webinar: Rebranding", startCol: 0, span: 5, color: "#A0D7E7", category: "landing" },
    { hour: "11:00", title: "Q3 campaign edits", startCol: 1, span: 2, color: "#CFC8FF", category: "landing" },
    { hour: "11:00", title: "Weekly Digest", startCol: 4, span: 2, color: "#CFC8FF", category: "email" },
    { hour: "12:00", title: "Send to list", startCol: 1, span: 3, color: "#3B82F6", category: "email" },
];

/** Content pipeline (Goal-style bars, no image). Stage → count + % of pipeline.
   Colors are Unity's Goal palette: purple / green / yellow / pink. */
export const pipelineGoal: { stage: string; count: number; percent: number; color: string }[] = [
    { stage: "Draft", count: 6, percent: 43, color: "#6C5DD3" },
    { stage: "Review", count: 3, percent: 21, color: "#7FBA7A" },
    { stage: "Approved", count: 2, percent: 14, color: "#FFCE73" },
    { stage: "Scheduled", count: 3, percent: 21, color: "#FFA2C0" },
];
