/** Seed document for the block editor (TipTap HTML content). Stub only. */
export const seedDoc = `
<h1>The anatomy of a landing page that converts</h1>
<p>We've shipped enough landing pages to know the patterns that work, and the ones that quietly leak conversions. The difference is rarely the design. It's whether every section earns the scroll.</p>
<h2>Lead with the outcome</h2>
<p>Your hero has one job: tell visitors what they get and why it matters, in the time it takes to read a headline. Save the clever wordplay for the brand campaign — here, <strong>clarity converts</strong>.</p>
<ul>
  <li>A headline about the reader's outcome, not your product</li>
  <li>One primary action, repeated as the page earns it</li>
  <li>Proof close to every claim: numbers, logos, quotes</li>
</ul>
<blockquote>If a section doesn't move someone closer to acting, it's decoration. Cut it.</blockquote>
<p>Type <code>/</code> to insert a new block, or select text to format it.</p>
`;

export type SeoSignal = { label: string; ok: boolean; hint: string };

export const seoSignals: SeoSignal[] = [
    { label: "Focus keyword in title", ok: true, hint: "“landing page” present" },
    { label: "Meta description set", ok: true, hint: "150 / 160 chars" },
    { label: "Title length", ok: true, hint: "46 / 60 chars" },
    { label: "Keyword in first paragraph", ok: true, hint: "Found" },
    { label: "Internal links", ok: false, hint: "0 found — add 2–3" },
    { label: "Image alt text", ok: false, hint: "1 image missing alt" },
    { label: "Readability", ok: true, hint: "Grade 8 — good" },
];

export const aiActions = [
    { id: "improve", label: "Improve writing", icon: "sparkles" },
    { id: "shorten", label: "Make shorter", icon: "arrow-down" },
    { id: "expand", label: "Expand", icon: "plus" },
    { id: "rephrase", label: "Rephrase", icon: "edit" },
    { id: "translate", label: "Translate", icon: "compass" },
];

export const aiChecks = [
    { id: "plagiarism", label: "Plagiarism check", status: "Passed — 0% match", ok: true },
    { id: "grammar", label: "Grammar & spelling", status: "2 suggestions", ok: false },
    { id: "links", label: "Internal link suggestions", status: "4 found", ok: true },
];

export type Version = {
    id: string;
    label: string;
    author: string;
    time: string;
    current?: boolean;
};

export const versions: Version[] = [
    { id: "v5", label: "Current draft", author: "Daniel Brooks", time: "Just now", current: true },
    { id: "v4", label: "Tightened the hero", author: "Daniel Brooks", time: "2h ago" },
    { id: "v3", label: "SEO pass", author: "Priya Nair", time: "Yesterday" },
    { id: "v2", label: "First full draft", author: "Daniel Brooks", time: "2d ago" },
    { id: "v1", label: "Created", author: "Daniel Brooks", time: "3d ago" },
];

export const schemaTypes = ["Article", "BlogPosting", "FAQPage", "HowTo", "Product"];

/** Review / approval trail shown in the editor's "Review" panel — the audit of
   the editorial workflow (who submitted, requested changes, approved, …). */
export type ReviewEvent = {
    id: string;
    type: "created" | "submitted" | "changes" | "approved" | "scheduled";
    who: string;
    role: "super" | "admin" | "seo" | "editor";
    time: string;
    note?: string;
};

export const reviewTrail: ReviewEvent[] = [
    { id: "re1", type: "created", who: "Daniel Brooks", role: "editor", time: "3d ago" },
    {
        id: "re2",
        type: "submitted",
        who: "Daniel Brooks",
        role: "editor",
        time: "2d ago",
        note: "Ready for a first pass — extra eyes on the intro please.",
    },
    {
        id: "re3",
        type: "changes",
        who: "Priya Nair",
        role: "seo",
        time: "Yesterday",
        note: "Add 2–3 internal links and tighten the meta description.",
    },
    { id: "re4", type: "submitted", who: "Daniel Brooks", role: "editor", time: "5h ago" },
    {
        id: "re5",
        type: "approved",
        who: "Priya Nair",
        role: "seo",
        time: "2h ago",
        note: "Looks great — approved for scheduling.",
    },
];
