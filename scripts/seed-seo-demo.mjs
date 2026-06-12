// Idempotent SEO test content with INTENTIONAL issues, so every AI Optimizer
// detector + fix workflow has something real to act on:
//   - duplicate / near-duplicate content (cross-page self-plagiarism)
//   - missing + incorrect canonicals
//   - poor heading structure (extra H1 in body + a level skip)
//   - metadata issues (too-long / too-short title, missing + too-long description,
//     focus keyword absent from the title)
//   - internal-linking opportunities (a page names another page's topic, unlinked)
//   - keyword cannibalization (3 pages share one focus keyword + near-identical titles)
//
// Re-running is safe (guards by the "demo-seo-" slug prefix). The entries are
// PUBLISHED + managed, so the scan picks them up.
//
// Run: npx dotenv -e .env -- node scripts/seed-seo-demo.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EMAIL = "admin@flowcms.local";

// A long shared passage reused near-verbatim across two pages → duplicate content.
const DUP = `
<p>Content marketing strategy is the practice of planning, creating, and distributing
valuable content to attract and keep a clearly defined audience. A strong strategy
starts with audience research, then maps topics to the buyer journey, sets a publishing
cadence, and measures results against business goals. Teams that document their approach
consistently outperform teams that publish on instinct, because documentation turns
scattered effort into a repeatable system that compounds over time.</p>
<p>The core pillars are the same everywhere: understand the reader, choose the right
formats, distribute where the audience already spends time, and review the numbers every
month. Skip any one of those and the whole program drifts. The most common failure is
treating volume as the goal instead of treating outcomes as the goal.</p>`.trim();

const at = (days, hour = 11) => {
    const x = new Date();
    x.setDate(x.getDate() + days);
    x.setHours(hour, 0, 0, 0);
    return x;
};

async function main() {
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (!user) throw new Error(`No user ${EMAIL}; run the main seed first.`);
    const membership = await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { workspaceId: true } });
    if (!membership) throw new Error("Admin has no workspace membership.");
    const workspaceId = membership.workspaceId;

    const type =
        (await prisma.contentType.findFirst({ where: { workspaceId, apiId: "article" }, select: { id: true } })) ||
        (await prisma.contentType.findFirst({ where: { workspaceId }, select: { id: true } }));
    if (!type) throw new Error("No content type found.");

    const existing = await prisma.contentEntry.count({ where: { workspaceId, slug: { startsWith: "demo-seo-" } } });
    if (existing > 0) {
        console.log(`SEO demo content already present (${existing} entries). Nothing to do.`);
        return;
    }

    const mk = (n, { title, data }) => ({
        workspaceId,
        contentTypeId: type.id,
        authorId: user.id,
        locale: "en",
        slug: `demo-seo-${n}`,
        status: "PUBLISHED",
        publishedAt: at(-n),
        data: { title, ...data },
    });

    const rows = [
        // 1 — cannibalization group A (primary). Has schema + canonical (a "good" baseline).
        mk(1, {
            title: "The complete guide to content marketing strategy",
            data: {
                metaTitle: "The complete guide to content marketing strategy",
                metaDescription: "A practical, step-by-step content marketing strategy: research your audience, map topics to the journey, publish on cadence, and measure what matters.",
                focusKeyword: "content marketing strategy",
                canonical: "/demo-seo-1",
                jsonLdType: "Article",
                body: `${DUP}<h2>Where to start</h2><p>Begin with a content audit and a single measurable goal for the quarter.</p>`,
            },
        }),
        // 2 — cannibalization group A + DUPLICATE of #1 + MISSING canonical.
        mk(2, {
            title: "Content marketing strategy: the complete guide",
            data: {
                metaTitle: "Content marketing strategy: the complete guide",
                metaDescription: "Everything you need to build a content marketing strategy that compounds, from audience research to monthly measurement.",
                focusKeyword: "content marketing strategy",
                // canonical intentionally omitted → TECH_CANONICAL_MISSING
                body: `${DUP}<h2>A repeatable system</h2><p>Document the plan so the work compounds instead of drifting.</p>`,
            },
        }),
        // 3 — cannibalization group A (third competitor) + INCORRECT canonical (points elsewhere).
        mk(3, {
            title: "Content marketing strategy explained",
            data: {
                metaTitle: "Content marketing strategy explained",
                metaDescription: "Content marketing strategy in plain language: what it is, why it works, and the pillars every program shares.",
                focusKeyword: "content marketing strategy",
                canonical: "/demo-seo-1", // wrong: canonicalising a distinct page to #1
                body: `<p>Content marketing strategy is how teams turn scattered publishing into a system. ${"It connects audience research, topic planning, distribution, and measurement into one loop. ".repeat(6)}</p><h2>The pillars</h2><p>Reader, format, distribution, review.</p>`,
            },
        }),
        // 4 — METADATA issues (focus keyword absent from title, no description) + POOR HEADINGS
        //     (extra in-body H1 + a level skip) + an INTERNAL-LINK opportunity (names #1's topic).
        mk(4, {
            title: "Brand strategy fundamentals for startups",
            data: {
                metaTitle: "Brand strategy fundamentals for startups",
                // metaDescription + summary omitted → META_DESC_MISSING
                focusKeyword: "growth marketing", // not in the title → META_TITLE_NO_KEYWORD
                canonical: "/demo-seo-4",
                jsonLdType: "Article",
                body: `<h1>Brand strategy fundamentals</h1><p>${"A clear brand makes every other marketing investment work harder. ".repeat(8)}</p><h2>Positioning</h2><p>Decide who you are for and who you are not for.</p><h4>A quick checklist</h4><p>Once positioning is set, a documented content marketing strategy turns it into a steady stream of work. ${"Pair it with growth marketing experiments to find what scales. ".repeat(4)}</p>`,
            },
        }),
        // 5 — META_TITLE_SHORT + THIN_CONTENT + few internal links.
        mk(5, {
            title: "SEO basics",
            data: {
                metaTitle: "SEO basics",
                metaDescription: "A very short intro to SEO basics for new marketers.",
                focusKeyword: "seo basics",
                canonical: "/demo-seo-5",
                body: `<p>SEO basics come down to relevance and trust. Write for people, structure for crawlers, and earn links honestly.</p>`,
            },
        }),
        // 6 — META_DESC_LONG + names #4's topic unlinked (internal-link opportunity).
        mk(6, {
            title: "How to price creative work",
            data: {
                metaTitle: "How to price creative work without underselling",
                metaDescription: "Pricing creative work is hard because value is subjective and every project differs, so this overlong meta description rambles well past the one hundred and sixty character limit that search engines will actually display in the results page, which is exactly the problem.",
                focusKeyword: "pricing creative work",
                canonical: "/demo-seo-6",
                jsonLdType: "Article",
                body: `<p>${"Price on the value you create, not the hours you spend. ".repeat(8)}</p><h2>Anchor on outcomes</h2><p>Solid brand strategy fundamentals make value easier to communicate, which makes pricing easier to defend. ${"Tie every number to a result the client cares about. ".repeat(4)}</p>`,
            },
        }),
    ];

    await prisma.contentEntry.createMany({ data: rows });
    console.log(`Seeded ${rows.length} SEO demo entries (workspace ${workspaceId}).`);
    console.log("Issues planted: cannibalization (1/2/3 share 'content marketing strategy'),");
    console.log("duplicate content (1 vs 2), missing canonical (2), incorrect canonical (3),");
    console.log("poor headings (4: extra H1 + h2->h4 skip), metadata (4 no desc + kw-not-in-title,");
    console.log("5 short title + thin, 6 long desc), internal-link opportunities (4 + 6).");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
