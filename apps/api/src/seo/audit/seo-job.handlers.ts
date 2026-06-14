import { Injectable, OnModuleInit } from "@nestjs/common";
import { JobsService, type JobRow, type JobHelpers } from "../../jobs/jobs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ContentEntriesService } from "../../content/content-entries.service";
import { AiService } from "../../ai/ai.service";
import { SeoService } from "../seo.service";
import { SeoAuditService } from "./seo-audit.service";
import { entryToCanonicalContent } from "../../content/canonical-content";

type BatchPayload = { fix: string; key: string; pages: { id: string; url: string | null }[] };

function applyAlts(body: string, alts: { src: string; alt: string }[]): string {
    let b = body;
    for (const a of alts) {
        if (!a.alt?.trim()) continue;
        const safe = a.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tagRe = new RegExp(`(<img\\b[^>]*src\\s*=\\s*["']${safe}["'][^>]*>)`, "i");
        b = b.replace(tagRe, (tag) => /alt\s*=/.test(tag)
            ? tag.replace(/alt\s*=\s*["'][^"']*["']/i, `alt="${a.alt.replace(/"/g, "&quot;")}"`)
            : tag.replace(/<img\b/i, `<img alt="${a.alt.replace(/"/g, "&quot;")}"`));
    }
    return b;
}

/**
 * SEO background-job handlers. `seo.autoApplySafe` applies all deterministic, free,
 * lossless fixes across the workspace (self-canonical, remove-noindex, internal
 * links). `seo.batchFix` runs one issue group's per-page fix (AI for meta/schema/
 * alt/content, deterministic for canonical/noindex), reusing the same services the
 * single-fix modals call, and records accepted meta/schema fixes into The Brain.
 */
@Injectable()
export class SeoJobHandlers implements OnModuleInit {
    constructor(
        private readonly jobs: JobsService,
        private readonly prisma: PrismaService,
        private readonly entries: ContentEntriesService,
        private readonly ai: AiService,
        private readonly seo: SeoService,
        private readonly audit: SeoAuditService,
    ) {}

    onModuleInit() {
        this.jobs.register("seo.autoApplySafe", (j, h) => this.autoApplySafe(j, h));
        this.jobs.register("seo.batchFix", (j, h) => this.batchFix(j, h));
    }

    /** Apply every deterministic, free fix across the workspace. */
    private async autoApplySafe(job: JobRow, helpers: JobHelpers) {
        const issues = await this.audit.issues(job.workspaceId);
        const groups = issues.groups;
        const canon = groups.find((g) => g.key === "TECH_CANONICAL_MISSING");
        const noindex = groups.find((g) => g.key === "TECH_NOINDEX");
        const links = groups.find((g) => g.key === "INTERNAL_LINK_OPP" || g.fix === "links");

        const canonPages = (canon?.pages ?? []).filter((p) => p.id && p.url);
        const noindexPages = (noindex?.pages ?? []).filter((p) => p.id);
        const linkOps = links ? (await this.seo.internalLinks(job.workspaceId)).opportunities : [];

        await helpers.setTotal(canonPages.length + noindexPages.length + linkOps.length);
        let done = 0;
        let failed = 0;
        const bump = async () => helpers.progress(done, failed);

        for (const p of canonPages) {
            try { await this.entries.update(job.workspaceId, p.id!, { data: { canonical: p.url } }, job.userId); done++; }
            catch { failed++; }
            await bump();
        }
        for (const p of noindexPages) {
            try {
                const e = await this.prisma.contentEntry.findFirst({ where: { id: p.id!, workspaceId: job.workspaceId }, select: { data: true } });
                const robots = String((e?.data as Record<string, unknown> | null)?.robots ?? "").replace(/noindex/gi, "").replace(/\s+/g, " ").trim();
                await this.entries.update(job.workspaceId, p.id!, { data: { robots } }, job.userId);
                done++;
            } catch { failed++; }
            await bump();
        }
        for (const o of linkOps) {
            try { await this.seo.applyInternalLink(job.workspaceId, job.userId, { sourceId: o.sourceId, targetId: o.targetId, anchor: o.anchor }); done++; }
            catch { failed++; }
            await bump();
        }
        return { summary: `Applied ${done} safe fix${done === 1 ? "" : "es"}${failed ? ` (${failed} failed)` : ""}` };
    }

    /** Run one issue group's per-page fix across all its managed pages. */
    private async batchFix(job: JobRow, helpers: JobHelpers) {
        const { fix, key, pages } = (job.payload as BatchPayload) ?? { fix: "", key: "", pages: [] };
        const managed = (pages ?? []).filter((p) => p.id);
        await helpers.setTotal(managed.length);
        let done = 0;
        let failed = 0;
        for (const p of managed) {
            try {
                await this.fixOne(job.workspaceId, job.userId, fix, key, p.id, p.url ?? "");
                done++;
            } catch {
                failed++;
            }
            await helpers.progress(done, failed);
        }
        return { summary: `Fixed ${done} page${done === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}` };
    }

    private async fixOne(workspaceId: string, userId: string, fix: string, key: string, id: string, url: string) {
        const e = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId }, select: { data: true } });
        const d = (e?.data ?? {}) as Record<string, unknown>;
        const title = String(d.title ?? "");
        const patch: Record<string, unknown> = {};

        if (key === "TECH_CANONICAL_MISSING") {
            patch.canonical = url || "/";
        } else if (key === "TECH_NOINDEX") {
            patch.robots = String(d.robots ?? "").replace(/noindex/gi, "").replace(/\s+/g, " ").trim();
        } else if (fix === "meta") {
            const r = await this.seo.suggestMeta(workspaceId, userId, { path: url, title: String(d.metaTitle ?? title), description: String(d.metaDescription ?? d.summary ?? "") });
            if (r.title) patch.metaTitle = r.title;
            if (r.description) patch.metaDescription = r.description;
            await this.seo.recordLearning(workspaceId, { kind: "meta", path: url, after: { title: r.title, description: r.description } }).catch(() => undefined);
        } else if (fix === "schema" || fix === "faq") {
            const r = await this.seo.suggestSchema(workspaceId, userId, { path: url, title, description: String(d.summary ?? d.metaDescription ?? ""), body: entryToCanonicalContent({ data: d }).plainText.slice(0, 800), kind: fix === "faq" ? "faq" : "auto" });
            patch.jsonLdType = r.type ?? (fix === "faq" ? "FAQPage" : "Article");
            patch.jsonLd = r.jsonld;
            await this.seo.recordLearning(workspaceId, { kind: "schema", path: url, after: { type: String(patch.jsonLdType) } }).catch(() => undefined);
        } else if (fix === "alt") {
            const r = await this.audit.generatePageAlt(workspaceId, userId, id);
            const sugg = (r.suggestions ?? []).filter((s) => s.alt?.trim());
            if (!sugg.length) throw new Error("No alt generated");
            patch.body = applyAlts(String(d.body ?? ""), sugg);
        } else {
            // content rewrite (thin / readability / duplicate / headings)
            const instruction =
                key === "THIN_CONTENT" ? "Expand this page with useful, original, well-structured detail (keep the same topic and voice)."
                : key === "READABILITY_HARD" ? "Rewrite this page to be clearer and easier to read: shorter sentences, simpler words, keep all meaning."
                : key === "DUPLICATE_CONTENT" ? "Rewrite this page so it no longer overlaps other pages: make the wording original while keeping the meaning."
                : "Fix the heading structure: a single clear H1 (the title), sequential H2/H3, no skipped levels. Keep the content and voice.";
            const body = entryToCanonicalContent({ data: d }).html || String(d.body ?? "");
            const r = await this.ai.generate(workspaceId, userId, { feature: "ai.refresh", system: "You are an expert web editor. Return clean HTML body content only (use <h2>, <h3>, <p>, <ul>). No markdown fences, no commentary.", prompt: `${instruction}\n\nTitle: ${title}\n\nCurrent content (HTML):\n${body.slice(0, 6000)}`, maxTokens: 1600, temperature: 0.5 });
            if (!r.text?.trim()) throw new Error("AI returned nothing");
            patch.body = r.text.trim().replace(/^```html?/i, "").replace(/```$/, "").trim();
        }
        await this.entries.update(workspaceId, id, { data: patch }, userId);
    }
}
