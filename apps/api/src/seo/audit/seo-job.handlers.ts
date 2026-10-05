import { Injectable, OnModuleInit } from "@nestjs/common";
import { JobsService, type JobRow, type JobHelpers } from "../../jobs/jobs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ContentEntriesService } from "../../content/content-entries.service";
import { AiService } from "../../ai/ai.service";
import { SeoService } from "../seo.service";
import { SeoAuditService } from "./seo-audit.service";
import { entryToCanonicalContent } from "../../content/canonical-content";
import { SitePagesService, absoluteUrl } from "../site-pages.service";
import type { RunMode } from "./audit-plan";

type BatchPayload = { fix: string; key: string; pages: { id: string; url: string | null }[] };

/** Shown on the job while the audit is holding off at the site's request. */
export const waitingNote = (seconds: number) => `Waiting, the site asked us to slow down (resumes in ${seconds}s)`;

/** The audit job's one-line result: pages checked, skipped (unchanged) and failed. */
export function auditSummary(r: { scanned: number; checked: number; unchanged: number; notChecked: number; failed: number; fetched?: number; inferred?: number; cancelled?: boolean }): string {
    const parts = [`Checked ${r.checked} of ${r.scanned} page${r.scanned === 1 ? "" : "s"}`, `${r.unchanged} unchanged`];
    if (r.fetched !== undefined) parts.push(`${r.fetched} fetched from the site`);
    if (r.inferred) parts.push(`${r.inferred} inferred from a sample`);
    if (r.notChecked) parts.push(`${r.notChecked} not checked (rate limited, will retry)`);
    if (r.failed) parts.push(`${r.failed} failed`);
    if (r.cancelled) parts.push("cancelled before finishing");
    return parts.join(", ");
}

/** Which meta fields a fix may write. A field the entry leaves empty while the
 *  live page (or a parent entry) supplies a value is inherited from a template:
 *  writing it would override the template on the live site, so it is left alone. */
export function writableMeta(own: { metaTitle?: unknown; metaDescription?: unknown }, live: { title?: string; description?: string } | null): { title: boolean; description: boolean } {
    const has = (v: unknown) => typeof v === "string" && v.trim() !== "";
    return {
        title: has(own.metaTitle) || !live?.title?.trim(),
        description: has(own.metaDescription) || !live?.description?.trim(),
    };
}

/**
 * SEO background-job handlers. `seo.autoApplySafe` applies all deterministic, free,
 * lossless fixes across the workspace (self-canonical as an absolute URL,
 * remove-noindex, internal links). `seo.batchFix` runs one issue group's per-page fix (AI for meta/schema/
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
        private readonly sitePages: SitePagesService,
    ) {}

    onModuleInit() {
        this.jobs.register("seo.autoApplySafe", (j, h) => this.autoApplySafe(j, h));
        this.jobs.register("seo.batchFix", (j, h) => this.batchFix(j, h));
        this.jobs.register("seo.auditPages", (j, h) => this.auditPages(j, h));
        this.jobs.register("seo.pagespeed", async (j) => {
            await this.seo.refreshVitals(j.workspaceId);
            return { summary: "PageSpeed results updated" };
        });
    }

    /** Re-audit every page in the background (live pages are fetched, so a large
     *  site takes longer than a request should). */
    private async auditPages(job: JobRow, helpers: JobHelpers) {
        let total = 0;
        const mode = (job.payload as { mode?: RunMode } | null)?.mode ?? "changed";
        const r = await this.audit.auditWorkspace(job.workspaceId, async ({ done, total: n, failed, waitingSeconds }) => {
            // The total grows if a sampled page type has to be checked in full.
            if (total !== n) await helpers.setTotal((total = n));
            // Pages the site's rate limit refused are retried; they are not failures.
            if (waitingSeconds) await helpers.progress(done, failed, waitingNote(waitingSeconds));
            else if (done % 5 === 0 || done === n) await helpers.progress(done, failed);
        }, mode);
        return { summary: auditSummary(r), result: r };
    }

    /** A page's canonical as an absolute URL (site URL + real path), or null when
     *  the workspace has no site URL: a relative "/slug" canonical is wrong. */
    private canonicalFor(site: string | null, path: string | null): string | null {
        return site && path ? absoluteUrl(site, path) : null;
    }

    /** Apply every deterministic, free fix across the workspace. */
    private async autoApplySafe(job: JobRow, helpers: JobHelpers) {
        const issues = await this.audit.issues(job.workspaceId);
        const groups = issues.groups;
        const canon = groups.find((g) => g.key === "TECH_CANONICAL_MISSING");
        const noindex = groups.find((g) => g.key === "TECH_NOINDEX");
        const links = groups.find((g) => g.key === "INTERNAL_LINK_OPP" || g.fix === "links");

        // Canonicals need the site URL to be absolute; without one the fix is skipped.
        const site = await this.sitePages.siteUrl(job.workspaceId);
        const canonPages = site ? (canon?.pages ?? []).filter((p) => p.id && p.url) : [];
        const noindexPages = (noindex?.pages ?? []).filter((p) => p.id);
        const linkOps = links ? (await this.seo.internalLinks(job.workspaceId)).opportunities : [];

        await helpers.setTotal(canonPages.length + noindexPages.length + linkOps.length);
        let done = 0;
        let failed = 0;
        const bump = async () => helpers.progress(done, failed);

        for (const p of canonPages) {
            try { await this.entries.update(job.workspaceId, p.id!, { data: { canonical: this.canonicalFor(site, p.url) } }, job.userId); done++; }
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
            const canonical = this.canonicalFor(await this.sitePages.siteUrl(workspaceId), url);
            if (!canonical) throw new Error("Set the site URL in Settings to write canonicals");
            patch.canonical = canonical;
        } else if (key === "TECH_NOINDEX") {
            patch.robots = String(d.robots ?? "").replace(/noindex/gi, "").replace(/\s+/g, " ").trim();
        } else if (fix === "meta") {
            const r = await this.seo.suggestMeta(workspaceId, userId, { path: url, title: String(d.metaTitle ?? title), description: String(d.metaDescription ?? d.summary ?? "") });
            // Inherited values stay inherited (a city page using its service's template).
            const audited = await this.prisma.pageAudit.findUnique({ where: { workspaceId_target_task: { workspaceId, target: id, task: "page" } }, select: { live: true } });
            const live = audited?.live as { status?: number; title?: string; description?: string } | null;
            const can = writableMeta(d, live?.status === 200 ? live : null);
            if (r.title && can.title) patch.metaTitle = r.title;
            if (r.description && can.description) patch.metaDescription = r.description;
            if (!Object.keys(patch).length) throw new Error("Title and description are inherited from a template");
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
            // Write each alt where the page keeps it (paired alt fields, rich text,
            // body). With no such place the alt lives on the asset, already saved.
            Object.assign(patch, await this.audit.altPatch(workspaceId, id, sugg));
            if (!Object.keys(patch).length) return;
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
