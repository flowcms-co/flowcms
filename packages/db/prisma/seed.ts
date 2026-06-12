import { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLES, hashPassword } from "@flowcms/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

/**
 * Seed a realistic demo workspace: **Northbound**, a brand, design & marketing
 * studio. The 4 system roles, a real-looking team, four content types (Blog Post,
 * Page, Landing Page, Case Study) and ~30 entries spread across every status — so
 * the content table, pipeline, calendar, publish queue, review queue and
 * dashboards all look like a real agency at work.
 *
 * It also seeds a **second** workspace — "Atlas Coffee", a client the agency runs
 * in its own Flow workspace — with its own roles, content and a couple of shared
 * members, so the Enterprise multi-workspace switcher has a real tenant to switch
 * into out of the box.
 *
 * Re-runnable: it resets the demo content (wipes existing entries + the legacy
 * help/doc types) and recreates the agency set, so the result is consistent.
 * The documented dev logins are preserved (admin@flowcms.local / changeme is the
 * owner; editor@flowcms.local / password123 is an editor).
 */

const WORKSPACE = { name: "Northbound", slug: "default" };

const TEAM = [
    { role: "super_admin", email: process.env.SEED_ADMIN_EMAIL ?? "admin@flowcms.local", name: "Sarah Whitfield", title: "Founder & Creative Director", avatar: "/images/avatar.png", pw: process.env.SEED_ADMIN_PASSWORD ?? "changeme" },
    { role: "admin", email: "marcus@wearenorthbound.com", name: "Marcus Bennett", title: "Managing Director", avatar: "/images/avatar-1.png", pw: "changeme" },
    { role: "search_strategist", email: "priya@wearenorthbound.com", name: "Priya Nair", title: "Content & SEO Strategist", avatar: "/images/avatar-2.png", pw: "changeme" },
    { role: "editor", email: "editor@flowcms.local", name: "Daniel Brooks", title: "Senior Copywriter", avatar: "/images/avatar-3.png", pw: "password123" },
    { role: "editor", email: "olivia@wearenorthbound.com", name: "Olivia Hayes", title: "Content Writer", avatar: "/images/avatar-4.png", pw: "changeme" },
    { role: "editor", email: "liam@wearenorthbound.com", name: "Liam Foster", title: "Brand Designer", avatar: "/images/avatar-1.png", pw: "changeme" },
];

const TYPES = [
    {
        apiId: "article", name: "Blog Post",
        schema: {
            icon: "document", color: "#6C5CE7", jsonLd: "BlogPosting",
            fields: [
                { id: "f1", name: "Title", type: "Text", required: true },
                { id: "f2", name: "Slug", type: "Slug", required: true },
                { id: "f3", name: "Body", type: "Rich text", required: true },
                { id: "f4", name: "Cover image", type: "Media", required: false },
            ],
        },
    },
    {
        apiId: "page", name: "Page",
        schema: {
            icon: "overview", color: "#3B82F6", jsonLd: "WebPage",
            fields: [
                { id: "f1", name: "Title", type: "Text", required: true },
                { id: "f2", name: "Slug", type: "Slug", required: true },
                { id: "f3", name: "Sections", type: "Rich text", required: true },
            ],
        },
    },
    {
        apiId: "landing", name: "Landing Page",
        schema: {
            icon: "chart", color: "#E0529C", jsonLd: "WebPage",
            fields: [
                { id: "f1", name: "Headline", type: "Text", required: true },
                { id: "f2", name: "Slug", type: "Slug", required: true },
                { id: "f3", name: "Hero image", type: "Media", required: false },
                { id: "f4", name: "Body", type: "Rich text", required: true },
            ],
        },
    },
    {
        apiId: "case_study", name: "Case Study",
        schema: {
            icon: "star", color: "#00B894", jsonLd: "Article",
            fields: [
                { id: "f1", name: "Title", type: "Text", required: true },
                { id: "f2", name: "Slug", type: "Slug", required: true },
                { id: "f3", name: "Client", type: "Text", required: true },
                { id: "f4", name: "Summary", type: "Text", required: false },
                { id: "f5", name: "Body", type: "Rich text", required: true },
                { id: "f6", name: "Cover image", type: "Media", required: false },
            ],
        },
    },
];

const LEGACY_TYPES = ["doc", "help_category", "help_article"];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const body = (lead: string) =>
    `<p>${lead}</p>` +
    `<h2>How we think about it</h2>` +
    `<p>Strategy first, always. We start by getting clear on the audience, the positioning and the one thing this work needs to achieve — then design and build in tight loops with your team so nothing gets lost in translation.</p>` +
    `<p>The result is work that looks sharp and actually performs: a brand people remember, a site that loads fast and converts, and content that earns its rankings over time.</p>` +
    `<p><strong>Working on something similar?</strong> <a href="/contact">Tell us about your project</a> and we'll share how we'd approach it.</p>`;

// status, type, author (TEAM email), title, lead, updated (days ago), and timing.
type Seed = {
    type: string; author: string; title: string; status: string; lead: string;
    updatedDaysAgo: number; publishedDaysAgo?: number; scheduledInDays?: number; client?: string; summary?: string;
};

const A = "article", P = "page", L = "landing", C = "case_study";
const SARAH = "admin@flowcms.local", MARCUS = "marcus@wearenorthbound.com", PRIYA = "priya@wearenorthbound.com",
    DANIEL = "editor@flowcms.local", OLIVIA = "olivia@wearenorthbound.com", LIAM = "liam@wearenorthbound.com";

const ENTRIES: Seed[] = [
    // ── Blog Posts ─────────────────────────────────────────────────────────
    { type: A, author: PRIYA, status: "PUBLISHED", updatedDaysAgo: 2, publishedDaysAgo: 2, title: "How we approach brand identity for early-stage startups", lead: "A logo is the easy part. A brand identity that earns trust and scales with you is the work that actually moves the needle." },
    { type: A, author: DANIEL, status: "PUBLISHED", updatedDaysAgo: 5, publishedDaysAgo: 5, title: "The anatomy of a landing page that converts", lead: "We've shipped enough landing pages to know the patterns that work — and the ones that quietly leak conversions." },
    { type: A, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 9, publishedDaysAgo: 9, title: "Your rebrand should start with positioning, not a logo", lead: "Most rebrands fail because they begin with visuals. Start with what you stand for, and the design follows." },
    { type: A, author: LIAM, status: "PUBLISHED", updatedDaysAgo: 14, publishedDaysAgo: 14, title: "Design systems: when you actually need one", lead: "A design system is leverage, not decoration. Here's how to tell whether you're ready for one." },
    { type: A, author: PRIYA, status: "PUBLISHED", updatedDaysAgo: 18, publishedDaysAgo: 18, title: "B2B SEO: content that earns its rankings", lead: "Ranking in B2B isn't about volume. It's about answering the questions your buyers actually ask, better than anyone else." },
    { type: A, author: DANIEL, status: "PUBLISHED", updatedDaysAgo: 23, publishedDaysAgo: 23, title: "A practical guide to finding your brand voice", lead: "Brand voice isn't a vibe — it's a set of decisions you can write down, share, and hold the line on." },
    { type: A, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 31, publishedDaysAgo: 31, title: "What we learned shipping 14 websites in 2025", lead: "A year of launches, retros and the occasional 2am deploy. Here's what we'd do differently." },
    { type: A, author: OLIVIA, status: "SCHEDULED", updatedDaysAgo: 0, scheduledInDays: 1, title: "Pricing creative work: charge for value, not hours", lead: "Hourly billing punishes you for being good and fast. Here's the model we moved to instead." },
    { type: A, author: PRIYA, status: "SCHEDULED", updatedDaysAgo: 1, scheduledInDays: 4, title: "Running a brand workshop that moves the needle", lead: "A good workshop turns a room of opinions into a single, shared direction. Here's our facilitation playbook." },
    { type: A, author: LIAM, status: "IN_REVIEW", updatedDaysAgo: 0, title: "Motion that adds meaning (without slowing your site)", lead: "Animation should guide attention, not steal it — and never at the cost of performance." },
    { type: A, author: DANIEL, status: "IN_REVIEW", updatedDaysAgo: 1, title: "How to write a creative brief your team won't ignore", lead: "The brief is where most projects are won or lost. Make it short, sharp and impossible to misread." },
    { type: A, author: OLIVIA, status: "DRAFT", updatedDaysAgo: 1, title: "The case for fewer, better web pages", lead: "More pages isn't more growth. Often it's the opposite. A case for ruthless editing." },
    { type: A, author: DANIEL, status: "DRAFT", updatedDaysAgo: 3, title: "Naming a company: a field guide", lead: "Naming is part strategy, part linguistics, part nerve. Our process for getting to a name you can defend." },
    { type: A, author: PRIYA, status: "DRAFT", updatedDaysAgo: 6, title: "Content refreshes: the highest-ROI SEO work", lead: "The fastest wins in SEO usually aren't new posts — they're the ones you already have." },

    // ── Pages ──────────────────────────────────────────────────────────────
    { type: P, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 4, publishedDaysAgo: 40, title: "Home", lead: "Northbound is a brand, design and growth studio for ambitious companies. We make work that looks sharp and performs." },
    { type: P, author: MARCUS, status: "PUBLISHED", updatedDaysAgo: 7, publishedDaysAgo: 38, title: "About Northbound", lead: "We're a small, senior team of strategists, designers and writers. No layers, no hand-offs — just the people doing the work." },
    { type: P, author: MARCUS, status: "PUBLISHED", updatedDaysAgo: 6, publishedDaysAgo: 38, title: "Services", lead: "Brand identity, web design & development, and growth marketing — the three things that decide how your company is seen and how it grows." },
    { type: P, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 8, publishedDaysAgo: 36, title: "Our work", lead: "A selection of recent projects across fintech, consumer, health and B2B." },
    { type: P, author: MARCUS, status: "PUBLISHED", updatedDaysAgo: 12, publishedDaysAgo: 36, title: "Contact", lead: "Tell us about your project. We reply to every enquiry within a day." },
    { type: P, author: OLIVIA, status: "PUBLISHED", updatedDaysAgo: 20, publishedDaysAgo: 30, title: "Careers", lead: "We hire senior, we pay fairly, and we protect focus time. Open roles and how we work." },
    { type: P, author: LIAM, status: "DRAFT", updatedDaysAgo: 2, title: "Studio culture", lead: "How we work, what we value, and the small rituals that keep a senior team sharp." },

    // ── Landing Pages ──────────────────────────────────────────────────────
    { type: L, author: PRIYA, status: "PUBLISHED", updatedDaysAgo: 3, publishedDaysAgo: 21, title: "Free brand audit", lead: "A 20-minute, no-strings teardown of your brand and site, with three things you can fix this week." },
    { type: L, author: OLIVIA, status: "SCHEDULED", updatedDaysAgo: 0, scheduledInDays: 6, title: "Webinar: Rebranding without the risk", lead: "Join our creative director for a live session on de-risking a rebrand — from buy-in to launch." },
    { type: L, author: MARCUS, status: "APPROVED", updatedDaysAgo: 0, scheduledInDays: 2, title: "Q3 campaign — Launch ready", lead: "Everything you need to take a product from positioning to a launch the market actually notices." },
    { type: L, author: DANIEL, status: "DRAFT", updatedDaysAgo: 4, title: "Website teardown offer", lead: "Send us your URL and we'll record a 10-minute teardown with the highest-impact fixes." },

    // ── Case Studies ───────────────────────────────────────────────────────
    { type: C, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 10, publishedDaysAgo: 26, client: "Lumen", summary: "Brand identity + marketing site for a consumer fintech.", title: "Lumen — a fintech brand for the next generation", lead: "Lumen came to us with a great product and a brand that felt like everyone else's. We rebuilt it from positioning up." },
    { type: C, author: LIAM, status: "PUBLISHED", updatedDaysAgo: 16, publishedDaysAgo: 33, client: "Atlas Coffee", summary: "DTC redesign that lifted conversion 2.1×.", title: "Atlas Coffee — a DTC site that doubled conversion", lead: "A beautiful brand was being let down by a clunky store. We rebuilt the buying experience end to end." },
    { type: C, author: PRIYA, status: "PUBLISHED", updatedDaysAgo: 25, publishedDaysAgo: 47, client: "Vantage", summary: "B2B website + demand-gen engine.", title: "Vantage — a B2B site that became a pipeline engine", lead: "Vantage needed more than a pretty site — they needed one that books demos. So we designed for the funnel." },
    { type: C, author: DANIEL, status: "PUBLISHED", updatedDaysAgo: 34, publishedDaysAgo: 55, client: "Meridian Health", summary: "Brand refresh for a digital health provider.", title: "Meridian Health — a brand patients trust", lead: "In healthcare, trust is the whole game. We built a brand that feels calm, clear and unmistakably human." },
    { type: C, author: LIAM, status: "IN_REVIEW", updatedDaysAgo: 0, client: "Orbit", summary: "Design system + marketing site for a dev-tools startup.", title: "Orbit — a design system that scaled with the team", lead: "Orbit was shipping fast and looking inconsistent. We gave them a system that made speed and polish compatible." },
    { type: C, author: SARAH, status: "APPROVED", updatedDaysAgo: 1, scheduledInDays: 3, client: "Harbor & Vine", summary: "Rebrand for a growing restaurant group.", title: "Harbor & Vine — a rebrand with room to grow", lead: "Five venues, five identities, one confused customer. We unified Harbor & Vine under one flexible brand." },
    { type: C, author: OLIVIA, status: "DRAFT", updatedDaysAgo: 5, client: "Sundial", summary: "Launch campaign for a wellness app.", title: "Sundial — a launch campaign that filled the waitlist", lead: "Sundial had three weeks to launch and no audience. Here's how we turned a cold start into a full waitlist." },
];

const at = (offsetDays: number, hour = 10) => {
    const x = new Date();
    x.setDate(x.getDate() + offsetDays);
    x.setHours(hour, 0, 0, 0);
    return x;
};

// ── Media library ──────────────────────────────────────────────────────────
// Generate a believable assets library so the studio isn't empty. We render
// tasteful branded WebP placeholders (+ thumbnails) and write them to the same
// dir the API serves /media from, then insert Media rows. A couple carry alt
// text; the rest are intentionally missing it (shows the alt-text feature).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MEDIA_DIR = process.env.MEDIA_DIR || join(REPO_ROOT, "apps/api/storage/media");

type MediaSeed = {
    slug: string; folder: string; w: number; h: number; c1: string; c2: string;
    label: string; kicker: string; by: string; alt?: string | null; altSource?: string;
};

const MEDIA: MediaSeed[] = [
    // Case-study visuals (work)
    { slug: "lumen-brand-hero", folder: "work", w: 1600, h: 900, c1: "#6C5CE7", c2: "#A29BFE", label: "Lumen", kicker: "Brand identity", by: LIAM, alt: "Lumen brand identity hero — wordmark and gradient lockup on a deep navy background.", altSource: "ai" },
    { slug: "atlas-coffee-store", folder: "work", w: 1280, h: 720, c1: "#E0529C", c2: "#FFA2C0", label: "Atlas Coffee", kicker: "DTC website", by: LIAM, alt: "Atlas Coffee online store homepage shown on desktop and mobile.", altSource: "manual" },
    { slug: "vantage-case-cover", folder: "work", w: 1600, h: 900, c1: "#F5A623", c2: "#FFD479", label: "Vantage", kicker: "B2B website", by: MARCUS },
    { slug: "harbor-vine-rebrand", folder: "work", w: 1600, h: 900, c1: "#E24B4A", c2: "#FF8B8A", label: "Harbor & Vine", kicker: "Rebrand", by: SARAH },
    // Brand
    { slug: "northbound-logo", folder: "brand", w: 1200, h: 1200, c1: "#1A1A2E", c2: "#3B3B6E", label: "Northbound", kicker: "Logo", by: SARAH },
    { slug: "meridian-brand-board", folder: "brand", w: 1600, h: 1000, c1: "#00B894", c2: "#55EFC4", label: "Meridian Health", kicker: "Brand board", by: LIAM },
    // Web design
    { slug: "orbit-design-system", folder: "web", w: 1400, h: 800, c1: "#6C5DD3", c2: "#CFC8FF", label: "Orbit", kicker: "Design system", by: LIAM },
    { slug: "services-grid", folder: "web", w: 1600, h: 1000, c1: "#3B82F6", c2: "#74B9FF", label: "Services", kicker: "Web design", by: LIAM },
    // Social
    { slug: "social-launch-card", folder: "social", w: 1200, h: 675, c1: "#A0D7E7", c2: "#74B9FF", label: "Launch card", kicker: "Social", by: OLIVIA },
    { slug: "webinar-cover", folder: "social", w: 1920, h: 1080, c1: "#FFA2C0", c2: "#E91E63", label: "Webinar", kicker: "Cover", by: OLIVIA },
];

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A clean gradient "asset card": faint monogram, thin frame, kicker + label. */
function brandSvg(m: MediaSeed): string {
    const mono = m.label.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
    const pad = Math.round(m.w * 0.055);
    const labelSize = Math.round(m.h * 0.072);
    const kickerSize = Math.round(m.h * 0.036);
    const monoSize = Math.round(m.h * 0.42);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${m.w}" height="${m.h}" viewBox="0 0 ${m.w} ${m.h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.c1}"/><stop offset="1" stop-color="${m.c2}"/></linearGradient>
    <radialGradient id="hl" cx="0.8" cy="0.2" r="0.7"><stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${m.w}" height="${m.h}" fill="url(#g)"/>
  <rect width="${m.w}" height="${m.h}" fill="url(#hl)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Poppins, Inter, Arial, sans-serif" font-weight="800" font-size="${monoSize}" fill="#ffffff" fill-opacity="0.13">${xmlEsc(mono)}</text>
  <rect x="${pad - 6}" y="${pad - 6}" width="${m.w - (pad - 6) * 2}" height="${m.h - (pad - 6) * 2}" rx="${Math.round(m.w * 0.018)}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/>
  <text x="${pad}" y="${m.h - pad - labelSize * 0.95}" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="${kickerSize}" fill="#ffffff" fill-opacity="0.78">${xmlEsc(m.kicker)}</text>
  <text x="${pad}" y="${m.h - pad}" font-family="Poppins, Inter, Arial, sans-serif" font-weight="700" font-size="${labelSize}" fill="#ffffff">${xmlEsc(m.label)}</text>
</svg>`;
}

/** A minimal but valid single-page PDF (correct xref offsets) for a doc asset. */
function minimalPdf(title: string): Buffer {
    const t = title.replace(/[\\()]/g, "");
    const stream = `BT /F1 28 Tf 64 712 Td (${t}) Tj ET`;
    const objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((body, i) => {
        offsets.push(Buffer.byteLength(pdf, "latin1"));
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, "latin1");
}

/** Generate the media files + Media rows. Resilient: a sharp failure is logged,
 *  not fatal, so the rest of the seed still completes. */
async function seedMedia(workspaceId: string, userByEmail: Record<string, string>): Promise<number> {
    const { default: sharp } = await import("sharp");
    mkdirSync(MEDIA_DIR, { recursive: true });
    await prisma.media.deleteMany({ where: { workspaceId } });

    let n = 0;
    for (const m of MEDIA) {
        const svg = Buffer.from(brandSvg(m));
        const main = await sharp(svg).webp({ quality: 82 }).toBuffer();
        const thumb = await sharp(svg).resize(640, 640, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        writeFileSync(join(MEDIA_DIR, `${m.slug}.webp`), main);
        writeFileSync(join(MEDIA_DIR, `${m.slug}_thumb.webp`), thumb);
        await prisma.media.create({
            data: {
                workspaceId, filename: `${m.slug}.webp`, mimeType: "image/webp", size: main.length,
                url: `/media/${m.slug}.webp`, width: m.w, height: m.h,
                alt: m.alt ?? null, altSource: m.altSource ?? "none",
                folder: m.folder, createdById: userByEmail[m.by] ?? null,
            },
        });
        n++;
    }

    // One real PDF in Documents.
    const pdf = minimalPdf("Northbound — Brand Guidelines");
    writeFileSync(join(MEDIA_DIR, "northbound-brand-guidelines.pdf"), pdf);
    await prisma.media.create({
        data: {
            workspaceId, filename: "northbound-brand-guidelines.pdf", mimeType: "application/pdf", size: pdf.length,
            url: "/media/northbound-brand-guidelines.pdf", width: null, height: null,
            alt: null, altSource: "none", folder: "docs", createdById: userByEmail[SARAH] ?? null,
        },
    });
    n++;
    return n;
}

async function main() {
    const workspace = await prisma.workspace.upsert({
        where: { slug: WORKSPACE.slug },
        // Pre-onboarded so the seeded demo lands on the dashboard, not /setup.
        update: { name: WORKSPACE.name, onboardedAt: new Date() },
        create: { name: WORKSPACE.name, slug: WORKSPACE.slug, onboardedAt: new Date() },
    });

    for (const role of SYSTEM_ROLES) {
        await prisma.role.upsert({
            where: { workspaceId_key: { workspaceId: workspace.id, key: role.key } },
            update: { name: role.name, description: role.description, permissions: role.permissions, dashboard: role.dashboard, isSystem: true },
            create: { workspaceId: workspace.id, key: role.key, name: role.name, description: role.description, permissions: role.permissions, dashboard: role.dashboard, isSystem: true },
        });
    }
    const roleByKey = Object.fromEntries(
        (await prisma.role.findMany({ where: { workspaceId: workspace.id } })).map((r) => [r.key, r.id]),
    );

    // Team — upsert each member + their membership/role.
    const userByEmail: Record<string, string> = {};
    for (const m of TEAM) {
        const user = await prisma.user.upsert({
            where: { email: m.email },
            update: { name: m.name, title: m.title, avatarUrl: m.avatar },
            create: { email: m.email, name: m.name, title: m.title, avatarUrl: m.avatar, passwordHash: hashPassword(m.pw), emailVerifiedAt: new Date() },
        });
        userByEmail[m.email] = user.id;
        await prisma.membership.upsert({
            where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
            update: { roleId: roleByKey[m.role] },
            create: { userId: user.id, workspaceId: workspace.id, roleId: roleByKey[m.role] },
        });
    }

    // Reset demo content: wipe entries (versions cascade) and drop the legacy
    // help/doc types, so the workspace is a clean agency demo.
    await prisma.contentEntry.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.contentType.deleteMany({ where: { workspaceId: workspace.id, apiId: { in: LEGACY_TYPES } } });

    for (const t of TYPES) {
        await prisma.contentType.upsert({
            where: { workspaceId_apiId: { workspaceId: workspace.id, apiId: t.apiId } },
            update: { name: t.name, schema: t.schema },
            create: { workspaceId: workspace.id, name: t.name, apiId: t.apiId, pluralApiId: `${t.apiId}s`, kind: "COLLECTION", schema: t.schema },
        });
    }
    const typeByApiId = Object.fromEntries(
        (await prisma.contentType.findMany({ where: { workspaceId: workspace.id } })).map((t) => [t.apiId, t.id]),
    );

    for (const e of ENTRIES) {
        const data: Record<string, unknown> = { title: e.title, body: body(e.lead) };
        if (e.client) data.client = e.client;
        if (e.summary) data.summary = e.summary;
        const row = await prisma.contentEntry.create({
            data: {
                workspaceId: workspace.id,
                contentTypeId: typeByApiId[e.type],
                authorId: userByEmail[e.author],
                status: e.status as never,
                slug: slugify(e.title),
                data,
                publishedAt: e.publishedDaysAgo != null ? at(-e.publishedDaysAgo) : null,
                scheduledAt: e.scheduledInDays != null ? at(e.scheduledInDays, e.scheduledInDays % 2 ? 11 : 14) : null,
            },
        });
        // Back-date updatedAt for a realistic, varied "Updated" column.
        await prisma.$executeRaw`UPDATE "ContentEntry" SET "updatedAt" = ${at(-e.updatedDaysAgo, 9 + (e.updatedDaysAgo % 8))} WHERE id = ${row.id}`;
    }

    // Knowledge / AI memory: managed SEO learning memory + an agency brand-voice doc.
    const seoMemory = await prisma.knowledgeFile.findFirst({ where: { workspaceId: workspace.id, kind: "seo_memory" } });
    if (!seoMemory) {
        await prisma.knowledgeFile.create({
            data: {
                workspaceId: workspace.id, name: "SEO learning memory", kind: "seo_memory", managed: true, enabled: true,
                tools: ["seo.meta_fix", "seo.schema_fix"],
                content:
                    "# SEO learning memory\n\nThis file is maintained automatically. Accept SEO fixes in **Review** mode and your\npreferences are recorded here, then fed back into future suggestions.\n\n<!-- flow:learned:start -->\n## Learned preferences\n_(auto-maintained)_\n<!-- flow:learned:end -->\n",
            },
        });
    }
    const siteVoice = await prisma.knowledgeFile.findFirst({ where: { workspaceId: workspace.id, name: "Brand voice — Northbound" } });
    if (!siteVoice) {
        await prisma.knowledgeFile.create({
            data: {
                workspaceId: workspace.id, name: "Brand voice — Northbound", kind: "doc", enabled: true, universal: true,
                content:
                    "# Northbound — brand voice & writing rules\n\n" +
                    "- **Audience:** founders and marketing leads at ambitious, design-aware companies.\n" +
                    "- **Tone:** confident, warm, plain-spoken. We sound like a senior partner, not a vendor.\n" +
                    "- **Do:** lead with the client's outcome; show the thinking; use short paragraphs and concrete examples.\n" +
                    "- **Don't:** no hype words (\"world-class\", \"cutting-edge\"), no jargon, no em-dashes, no emoji.\n" +
                    "- **CTA:** end with a clear, low-pressure next step (\"Tell us about your project\").\n",
            },
        });
    }

    // Media library — branded placeholder assets + thumbnails (non-fatal).
    let mediaCount = 0;
    try {
        mediaCount = await seedMedia(workspace.id, userByEmail);
    } catch (e) {
        console.warn(`! Media seeding skipped: ${e instanceof Error ? e.message : e}`);
    }

    // ── Second workspace: "Atlas Coffee" ─────────────────────────────────────
    // A client the agency runs inside its own Flow workspace, so the Enterprise
    // multi-workspace switcher has a real second tenant to switch into. Sarah
    // (owner), Priya and Daniel are members of both; each workspace keeps its own
    // roles + content and (eventually) serves its own published domain.
    const atlas = await prisma.workspace.upsert({
        where: { slug: "atlas-coffee" },
        // Pre-onboarded: it's an established client workspace, so switching into it
        // lands on the dashboard rather than the first-run setup wizard. Carries a
        // white-label brand (name + warm coffee accent) so that, with an Enterprise
        // license active, switching into it shows its own branding. Ignored on
        // Community/Pro (white-label is gated), so the demo stays default-purple.
        update: { name: "Atlas Coffee", onboardedAt: new Date(), brandName: "Atlas Coffee", brandAccent: "#9A5B2D" },
        create: { name: "Atlas Coffee", slug: "atlas-coffee", onboardedAt: new Date(), brandName: "Atlas Coffee", brandAccent: "#9A5B2D" },
    });
    for (const role of SYSTEM_ROLES) {
        await prisma.role.upsert({
            where: { workspaceId_key: { workspaceId: atlas.id, key: role.key } },
            update: { name: role.name, description: role.description, permissions: role.permissions, dashboard: role.dashboard, isSystem: true },
            create: { workspaceId: atlas.id, key: role.key, name: role.name, description: role.description, permissions: role.permissions, dashboard: role.dashboard, isSystem: true },
        });
    }
    const atlasRoleByKey = Object.fromEntries(
        (await prisma.role.findMany({ where: { workspaceId: atlas.id } })).map((r) => [r.key, r.id]),
    );
    const atlasMembers: [string, string][] = [[SARAH, "super_admin"], [PRIYA, "search_strategist"], [DANIEL, "editor"]];
    for (const [email, roleKey] of atlasMembers) {
        if (!userByEmail[email]) continue;
        await prisma.membership.upsert({
            where: { userId_workspaceId: { userId: userByEmail[email], workspaceId: atlas.id } },
            update: { roleId: atlasRoleByKey[roleKey] },
            create: { userId: userByEmail[email], workspaceId: atlas.id, roleId: atlasRoleByKey[roleKey] },
        });
    }
    for (const t of TYPES.filter((x) => x.apiId === "article" || x.apiId === "page")) {
        await prisma.contentType.upsert({
            where: { workspaceId_apiId: { workspaceId: atlas.id, apiId: t.apiId } },
            update: { name: t.name, schema: t.schema },
            create: { workspaceId: atlas.id, name: t.name, apiId: t.apiId, pluralApiId: `${t.apiId}s`, kind: "COLLECTION", schema: t.schema },
        });
    }
    const atlasTypeByApiId = Object.fromEntries(
        (await prisma.contentType.findMany({ where: { workspaceId: atlas.id } })).map((t) => [t.apiId, t.id]),
    );
    await prisma.contentEntry.deleteMany({ where: { workspaceId: atlas.id } });
    const ATLAS_ENTRIES: Seed[] = [
        { type: A, author: PRIYA, status: "PUBLISHED", updatedDaysAgo: 1, publishedDaysAgo: 1, title: "Our Ethiopia Yirgacheffe is back in stock", lead: "Bright, floral and unmistakably Yirgacheffe. This year's harvest is the best we've tasted, and there's a reason it sells out." },
        { type: A, author: PRIYA, status: "PUBLISHED", updatedDaysAgo: 4, publishedDaysAgo: 4, title: "How to dial in espresso at home", lead: "Great espresso comes down to three dials: dose, grind and time. Here's how to find your shot without wasting a bag of beans." },
        { type: A, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 8, publishedDaysAgo: 8, title: "Meet the farmers behind our Colombian lots", lead: "We buy direct, and we visit. A look at the families in Huila whose work fills your morning cup." },
        { type: A, author: PRIYA, status: "PUBLISHED", updatedDaysAgo: 13, publishedDaysAgo: 13, title: "A beginner's guide to pour-over", lead: "One brewer, a filter and a kettle is all you need. A simple, repeatable recipe for a clean, sweet cup." },
        { type: A, author: SARAH, status: "SCHEDULED", updatedDaysAgo: 0, scheduledInDays: 3, title: "Build your own holiday coffee box", lead: "Mix and match our seasonal roasts into a gift that actually gets used, ready in time for the holidays." },
        { type: A, author: PRIYA, status: "DRAFT", updatedDaysAgo: 2, title: "Cold brew vs iced coffee: what's the difference?", lead: "They're not the same drink. A quick explainer on method, flavour and when to reach for each." },
        { type: P, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 6, publishedDaysAgo: 30, title: "Home", lead: "Atlas Coffee is a small-batch roaster sourcing single-origin beans direct from growers, roasted fresh and shipped within the week." },
        { type: P, author: SARAH, status: "PUBLISHED", updatedDaysAgo: 20, publishedDaysAgo: 28, title: "Our story", lead: "From a single market stall to a roastery that ships nationwide, without ever cutting a corner on the bean." },
    ];
    for (const e of ATLAS_ENTRIES) {
        const row = await prisma.contentEntry.create({
            data: {
                workspaceId: atlas.id,
                contentTypeId: atlasTypeByApiId[e.type],
                authorId: userByEmail[e.author],
                status: e.status as never,
                slug: slugify(e.title),
                data: { title: e.title, body: body(e.lead) },
                publishedAt: e.publishedDaysAgo != null ? at(-e.publishedDaysAgo) : null,
                scheduledAt: e.scheduledInDays != null ? at(e.scheduledInDays, 11) : null,
            },
        });
        await prisma.$executeRaw`UPDATE "ContentEntry" SET "updatedAt" = ${at(-e.updatedDaysAgo, 9 + (e.updatedDaysAgo % 8))} WHERE id = ${row.id}`;
    }

    const counts = await prisma.contentEntry.groupBy({ by: ["status"], where: { workspaceId: workspace.id }, _count: true });
    console.log(`✓ Workspace "${workspace.name}" + ${SYSTEM_ROLES.length} roles`);
    console.log(`✓ Team: ${TEAM.length} members (${TEAM.map((m) => m.name).join(", ")})`);
    console.log(`✓ Content types: ${TYPES.map((t) => t.name).join(", ")}`);
    console.log(`✓ ${ENTRIES.length} entries by status: ${counts.map((c) => `${c.status} ${c._count}`).join(", ")}`);
    console.log(`✓ Media: ${mediaCount} assets → ${MEDIA_DIR}`);
    console.log(`✓ Second workspace "Atlas Coffee": ${atlasMembers.length} members + ${ATLAS_ENTRIES.length} entries`);
    console.log(`✓ Owner login: ${TEAM[0].email} / ${TEAM[0].pw}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
