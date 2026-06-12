// Idempotent demo content for the editor account (editor@flowcms.local) so the
// Editor dashboard is populated: drafts, in-review, scheduled this week, and
// enough published+scheduled this week to MEET the weekly goal (shows the
// celebration). Re-running is safe (guards by the "demo-ed-" slug prefix).
//
// Run: npx dotenv -e .env -- node scripts/seed-editor-demo.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EMAIL = "editor@flowcms.local";

function weekStart(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
    return x;
}
const at = (base, days, hour = 10) => {
    const x = new Date(base);
    x.setDate(x.getDate() + days);
    x.setHours(hour, 0, 0, 0);
    return x;
};

async function main() {
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (!user) throw new Error(`No user ${EMAIL}; run the main seed first.`);
    const membership = await prisma.membership.findFirst({ where: { userId: user.id }, select: { workspaceId: true } });
    if (!membership) throw new Error("Editor has no workspace membership.");
    const workspaceId = membership.workspaceId;

    const type =
        (await prisma.contentType.findFirst({ where: { workspaceId, apiId: "article" }, select: { id: true } })) ||
        (await prisma.contentType.findFirst({ where: { workspaceId }, select: { id: true } }));
    if (!type) throw new Error("No content type found.");

    const existing = await prisma.contentEntry.count({ where: { workspaceId, authorId: user.id, slug: { startsWith: "demo-ed-" } } });
    if (existing > 0) {
        console.log(`Editor demo content already present (${existing} entries). Nothing to do.`);
        return;
    }

    const ws = weekStart();
    const body = (t) => `<h2>${t}</h2><p>${"This is sample content for the editor demo dashboard. ".repeat(12)}</p>`;
    const mk = (n, status, extra = {}) => ({
        workspaceId,
        contentTypeId: type.id,
        authorId: user.id,
        locale: "en",
        slug: `demo-ed-${n}`,
        status,
        data: { title: extra.title, body: body(extra.title), summary: extra.title },
        ...extra.dates,
    });

    const rows = [
        // In progress (drafts)
        mk(1, "DRAFT", { title: "Design systems guide for scaling teams" }),
        mk(2, "DRAFT", { title: "Landing page best practices" }),
        mk(3, "DRAFT", { title: "Writing a brand voice that sticks" }),
        // In review (counts as due-today action)
        mk(4, "IN_REVIEW", { title: "Harbor & Vine — a rebrand with room to grow" }),
        // Scheduled this week (count toward the goal)
        mk(5, "SCHEDULED", { title: "How to build a brand people remember", dates: { scheduledAt: at(ws, 5, 9) } }),
        mk(6, "SCHEDULED", { title: "Scaling content without losing quality", dates: { scheduledAt: at(ws, 6, 9) } }),
        // Published this week (on 3 distinct days → streak + goal progress)
        mk(7, "PUBLISHED", { title: "Pricing creative work: charge for value, not hours", dates: { publishedAt: at(ws, 0, 11) } }),
        mk(8, "PUBLISHED", { title: "Customer story: Harbor & Vine rebrand", dates: { publishedAt: at(ws, 2, 11) } }),
        mk(9, "PUBLISHED", { title: "Webinar: Rebranding without the risk", dates: { publishedAt: at(ws, 4, 11) } }),
        // Published earlier (recently-published depth + last-week baseline)
        mk(10, "PUBLISHED", { title: "The anatomy of a great case study", dates: { publishedAt: at(ws, -3, 11) } }),
        mk(11, "PUBLISHED", { title: "Five rebrand lessons from 2025", dates: { publishedAt: at(ws, -9, 11) } }),
    ];

    await prisma.contentEntry.createMany({ data: rows });
    console.log(`Seeded ${rows.length} editor demo entries for ${EMAIL} (workspace ${workspaceId}).`);
    console.log("Weekly goal: 3 published + 2 scheduled this week = 5 (meets default goal → celebration).");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
