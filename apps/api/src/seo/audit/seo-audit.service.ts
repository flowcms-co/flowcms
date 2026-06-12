import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@flowcms/db";
import { PrismaService } from "../../prisma/prisma.service";
import { MODEL_REGISTRY, type ModelId } from "../../ai/model-tiers";
import {
    auditPage,
    renderFinding,
    escalationTasks,
    contentHash,
    detectDuplicatePages,
    clusterSimilarTitles,
    trimMeta,
    type Finding,
    type RenderedFinding,
} from "./audit-engine";
import { lookupCode } from "./seo-codes";
import { entryToPageInput } from "./parse-content";
import { buildIssues, type IssuePage, type PageRow, type SiteFinding } from "./audit-issues";
import { SeoService } from "../seo.service";
import { AssetsService } from "../../assets/assets.service";

/** Synthetic task scope for a full-page L1 audit row. */
const PAGE = "page";

@Injectable()
export class SeoAuditService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly seo: SeoService,
        private readonly assets: AssetsService,
    ) {}

    /** Build a rendered site-scope finding from a code (deterministic, no AI). */
    private siteFinding(
        code: string,
        opts: { values?: Finding["values"]; count?: number; pages?: IssuePage[]; ref?: string } = {},
    ): SiteFinding | null {
        const c = lookupCode(code);
        if (!c) return null;
        const rendered = renderFinding({ code, task: c.task, severity: c.severity, values: opts.values, ref: opts.ref });
        if (!rendered) return null;
        return { finding: rendered, count: opts.count, pages: opts.pages };
    }

    private utcDay(): string {
        return new Date().toISOString().slice(0, 10);
    }

    /** Run L1 deterministic detectors on one managed entry, upserting the ledger.
     *  Skips re-run (and the write) when the content hash is unchanged. */
    async auditEntry(workspaceId: string, entryId: string) {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId } });
        if (!entry) throw new NotFoundException("Entry not found.");

        const input = entryToPageInput({ id: entry.id, slug: entry.slug, data: entry.data as Record<string, unknown> });
        const hash = contentHash(input);

        const existing = await this.prisma.pageAudit.findUnique({
            where: { workspaceId_target_task: { workspaceId, target: entryId, task: PAGE } },
        });
        if (existing && existing.contentHash === hash) {
            return { skipped: true, findings: existing.l1Findings as unknown as Finding[] };
        }

        const findings = auditPage(input);
        const severity = findings.reduce((m, f) => Math.max(m, f.severity), 0);
        const escalated = escalationTasks(findings).length > 0;
        const data = {
            contentHash: hash,
            l1Findings: findings as unknown as Prisma.InputJsonValue,
            severity,
            escalated,
            lastCheckedAt: new Date(),
        };
        await this.prisma.pageAudit.upsert({
            where: { workspaceId_target_task: { workspaceId, target: entryId, task: PAGE } },
            create: { workspaceId, target: entryId, entryId, task: PAGE, ...data },
            update: data,
        });
        return { skipped: false, findings, severity, escalated };
    }

    /** Audit every published managed entry (the manual "Run audit" + the drip target). */
    async auditWorkspace(workspaceId: string) {
        const entries = await this.prisma.contentEntry.findMany({
            where: { workspaceId, status: "PUBLISHED" },
            select: { id: true },
            take: 500,
        });
        let changed = 0;
        let escalated = 0;
        for (const e of entries) {
            const r = await this.auditEntry(workspaceId, e.id);
            if (!r.skipped) {
                changed++;
                if (r.escalated) escalated++;
            }
        }
        return { scanned: entries.length, changed, escalated };
    }

    /** Rendered findings per page for the UI (codes -> readable). */
    async list(workspaceId: string) {
        const rows = await this.prisma.pageAudit.findMany({
            where: { workspaceId, task: PAGE },
            orderBy: [{ severity: "desc" }, { lastCheckedAt: "desc" }],
            take: 500,
        });
        const titles = new Map<string, string>();
        const urls = new Map<string, string | null>();
        const ids = rows.map((r) => r.entryId).filter((x): x is string => !!x);
        if (ids.length) {
            const entries = await this.prisma.contentEntry.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, data: true } });
            for (const e of entries) {
                const t = (e.data as Record<string, unknown> | null)?.title;
                titles.set(e.id, typeof t === "string" ? t : "Untitled");
                // The page's URL is its slug; needed so fixes (e.g. self-canonical) can prefill it.
                urls.set(e.id, e.slug ? `/${e.slug}` : null);
            }
        }
        return rows.map((r) => {
            const findings = (r.l1Findings as unknown as Finding[]) ?? [];
            const rendered = findings.map(renderFinding).filter((x): x is RenderedFinding => !!x);
            return {
                entryId: r.entryId,
                url: (r.entryId ? urls.get(r.entryId) : null) ?? r.url,
                title: r.entryId ? (titles.get(r.entryId) ?? null) : r.url,
                severity: r.severity,
                escalated: r.escalated,
                lastCheckedAt: r.lastCheckedAt,
                findings: rendered,
            };
        });
    }

    /** The unified, grouped issue set the AI Optimizer (and Dashboard) render.
     *  Page-scope findings come from the L1 ledger; site-scope findings (AI readiness,
     *  FAQ/Org schema, cannibalization, internal links, Core Web Vitals, Search Console)
     *  are composed on read from the existing deterministic services. */
    async issues(workspaceId: string) {
        const [rows, score, crawl, vitals, cannib, links, summary, ws] = await Promise.all([
            this.list(workspaceId),
            this.seo.score(workspaceId).catch(() => ({ score: null as number | null })),
            this.seo.crawl(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["crawl"]>>),
            this.seo.vitals(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["vitals"]>>),
            this.seo.cannibalization(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["cannibalization"]>>),
            this.seo.internalLinks(workspaceId).catch(() => ({ opportunities: [], pages: 0 }) as Awaited<ReturnType<SeoService["internalLinks"]>>),
            this.seo.summary(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["summary"]>>),
            this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { jsonLdOrg: true, ignoredFindings: true } }),
        ]);

        // Findings the user permanently dismissed: "CODE" (whole issue) or "CODE:entryId" (one page).
        const ignored = new Set(ws?.ignoredFindings ?? []);
        const pageRows: PageRow[] = rows.map((r) => ({
            entryId: r.entryId,
            url: r.url,
            title: r.title,
            // Schema is computed per type (Article/FAQ/Organization/Service) below, so drop
            // the page-scope L1 schema finding to avoid double-counting; also drop ignored findings.
            // Schema (per-type) + internal linking (opportunity-driven) are computed below, so drop
            // the page-scope L1 versions to avoid double-counting; also drop ignored findings.
            findings: r.findings.filter((f) =>
                f.code !== "SCHEMA_MISSING" && f.code !== "SCHEMA_INVALID" && f.code !== "INTERNAL_LINKS_FEW" &&
                !ignored.has(f.code) && !ignored.has(`${f.code}:${r.entryId}`)),
        }));

        const site: SiteFinding[] = [];
        const push = (s: SiteFinding | null) => {
            if (!s) return;
            if (ignored.has(s.finding.code)) return; // whole issue dismissed
            if (s.pages?.length) {
                s.pages = s.pages.filter((p) => !ignored.has(`${s.finding.code}:${p.id}`));
                if (s.pages.length === 0) return; // every affected page dismissed
                s.count = s.pages.length;
            }
            site.push(s);
        };

        // --- AI readiness (crawler files) ---
        if (crawl.hasData && crawl.files) {
            const f = crawl.files;
            if (!f.llmsTxt?.present) push(this.siteFinding("AIREADY_LLMS_MISSING"));
            if (!f.robots?.present) push(this.siteFinding("AIREADY_ROBOTS_MISSING"));
            else {
                if (f.robots.blocksAiBots) push(this.siteFinding("AIREADY_ROBOTS_BLOCKS_AI"));
                if (!f.robots.hasSitemapRef) push(this.siteFinding("AIREADY_SITEMAP_NOT_IN_ROBOTS"));
            }
            if (!f.sitemap?.present) push(this.siteFinding("AIREADY_SITEMAP_MISSING"));
        }

        // --- published entries (reused for cannibalization + duplicate detection) ---
        const published = await this.prisma.contentEntry.findMany({
            where: { workspaceId, status: "PUBLISHED" },
            select: { id: true, slug: true, data: true },
            take: 300,
        });
        const entryMeta = published.map((e) => {
            const d = (e.data ?? {}) as Record<string, unknown>;
            const title = typeof d.title === "string" ? d.title : (e.slug ?? "Untitled");
            const fk = typeof d.focusKeyword === "string" ? d.focusKeyword.trim().toLowerCase() : "";
            const input = entryToPageInput({ id: e.id, slug: e.slug, data: d });
            return { id: e.id, title, focusKeyword: fk, url: e.slug ? `/${e.slug}` : null, text: input.bodyText ?? "", metaTitle: input.metaTitle ?? "", metaDescription: input.metaDescription ?? "" };
        });

        // --- schema opportunities by type (Article / FAQ / Organization / Service) ---
        // Per page, recommend the schema types it should have but is missing, so the
        // Optimizer's Schema tab covers more than just Article. Deterministic.
        const orgEntity = ws?.jsonLdOrg;
        const hasGlobalOrg = !!orgEntity && typeof orgEntity === "object" && Object.keys(orgEntity as object).length > 0;
        const schemaTypesOf = (d: Record<string, unknown>): Set<string> => {
            const s = new Set<string>();
            if (typeof d.jsonLdType === "string") s.add(d.jsonLdType.toLowerCase());
            const raw = typeof d.jsonLd === "string" ? d.jsonLd : "";
            if (raw) {
                try {
                    const parsed = JSON.parse(raw) as unknown;
                    for (const b of Array.isArray(parsed) ? parsed : [parsed]) {
                        const bt = (b as { ["@type"]?: unknown })?.["@type"];
                        if (typeof bt === "string") s.add(bt.toLowerCase());
                        else if (Array.isArray(bt)) for (const x of bt) if (typeof x === "string") s.add(x.toLowerCase());
                    }
                } catch { /* ignore malformed JSON-LD */ }
            }
            return s;
        };
        const textById = new Map(entryMeta.map((e) => [e.id, e.text.toLowerCase()]));
        const schemaPages: Record<"article" | "faq" | "org" | "service", IssuePage[]> = { article: [], faq: [], org: [], service: [] };
        for (const e of published) {
            const d = (e.data ?? {}) as Record<string, unknown>;
            const slug = (e.slug ?? "").toLowerCase();
            const url = e.slug ? `/${e.slug}` : "/";
            const title = typeof d.title === "string" ? d.title : (e.slug ?? "Untitled");
            const have = schemaTypesOf(d);
            const text = textById.get(e.id) ?? "";
            const hay = `${slug} ${title.toLowerCase()}`;
            const isHome = slug === "" || slug === "home";
            const isOrgPage = isHome || /^(about|contact|team|company|careers)/.test(slug);
            const isService = /(service|pricing|solution|capabilit|what-we-do|offering|package)/.test(hay);
            const looksFaq = /\bfaq\b|frequently asked/.test(hay) || (text.match(/\?/g) || []).length >= 3;
            if (!(have.has("article") || have.has("blogposting") || have.has("newsarticle")))
                schemaPages.article.push({ id: e.id, url, title, schemaType: "Article", priority: /\/blog\//.test(url) ? "high" : "med" });
            if (looksFaq && !have.has("faqpage"))
                schemaPages.faq.push({ id: e.id, url, title, schemaType: "FAQ", priority: "med" });
            if (isOrgPage && !hasGlobalOrg && !have.has("organization"))
                schemaPages.org.push({ id: e.id, url, title, schemaType: "Organization", priority: isHome ? "high" : "med" });
            if (isService && !have.has("service"))
                schemaPages.service.push({ id: e.id, url, title, schemaType: "Service", priority: "med" });
        }
        if (schemaPages.article.length) push(this.siteFinding("SCHEMA_MISSING", { count: schemaPages.article.length, pages: schemaPages.article }));
        if (schemaPages.faq.length) push(this.siteFinding("SCHEMA_FAQ_MISSING", { count: schemaPages.faq.length, pages: schemaPages.faq }));
        if (schemaPages.org.length) push(this.siteFinding("SCHEMA_ORG_MISSING", { count: schemaPages.org.length, pages: schemaPages.org }));
        if (schemaPages.service.length) push(this.siteFinding("SCHEMA_SERVICE_MISSING", { count: schemaPages.service.length, pages: schemaPages.service }));

        // --- cannibalization: GSC query conflicts AND content (2+ pages, same topic) ---
        // Emit one IssuePage per COMPETING PAGE, tagged with `group` = the keyword,
        // so the fix modal can group conflicts and act on each page.
        const cannPages: IssuePage[] = [];
        const cannConflicts = new Set<string>();
        const addConflict = (keyword: string, pages: { id: string | null; url: string | null; title: string }[]) => {
            cannConflicts.add(keyword);
            const rec = `These ${pages.length} pages compete for "${keyword}", so Google splits ranking signals between them and may show the wrong one. Keep the strongest as the primary, then either merge the others into it, 301-redirect them, point their canonical at the primary, or re-target each to a distinct keyword.`;
            pages.forEach((p, i) => cannPages.push({ id: p.id, url: p.url, title: p.title, group: keyword, detail: i === 0 ? `Suggested primary · ${rec}` : "Competing page" }));
        };
        if (cannib.hasData && cannib.groups?.length) {
            for (const g of cannib.groups) addConflict(g.keyword, g.pages.map((p) => ({ id: null, url: p.path, title: p.path })));
        }
        const seenKw = new Set<string>();
        const byKw = new Map<string, typeof entryMeta>();
        for (const e of entryMeta) { if (!e.focusKeyword) continue; const a = byKw.get(e.focusKeyword) ?? []; a.push(e); byKw.set(e.focusKeyword, a); }
        for (const [kw, grp] of byKw) {
            if (grp.length < 2) continue;
            seenKw.add(kw);
            addConflict(kw, grp.map((g) => ({ id: g.id, url: g.url, title: g.title })));
        }
        // Fall back to title-overlap when no focus keyword is set.
        for (const c of clusterSimilarTitles(entryMeta.map((e) => ({ id: e.id, title: e.title, url: e.url ?? undefined })))) {
            if (seenKw.has(c.keyword)) continue;
            addConflict(c.keyword, c.pages.map((p) => ({ id: p.id, url: p.url ?? null, title: p.title })));
        }
        if (cannPages.length) push(this.siteFinding("CANNIBALIZATION", { values: { kw: `${cannConflicts.size} conflict${cannConflicts.size === 1 ? "" : "s"}` }, count: cannConflicts.size, pages: cannPages }));

        // --- internal link opportunities (grouped by the page that would RECEIVE the links) ---
        // The actionable unit is a real opportunity (anchor on page A → page B). We group them
        // by the receiving page so each row has a non-zero suggested count + the source pages.
        // Only pages with real opportunities surface (no dummy "0 suggested links" rows).
        if (links.opportunities?.length) {
            const slugToId = new Map(published.map((e) => [e.slug ? `/${e.slug}` : "/", e.id]));
            const byTarget = new Map<string, { title: string; count: number; sources: Set<string> }>();
            for (const o of links.opportunities) {
                if (!o.targetUrl) continue;
                const m = byTarget.get(o.targetUrl) ?? { title: o.targetTitle || o.targetUrl, count: 0, sources: new Set<string>() };
                m.count++;
                if (o.sourceTitle) m.sources.add(o.sourceTitle);
                byTarget.set(o.targetUrl, m);
            }
            const linkPages: IssuePage[] = [...byTarget.entries()].map(([url, m]) => ({
                id: slugToId.get(url) ?? null,
                url,
                title: m.title,
                suggested: m.count,
                sources: [...m.sources].slice(0, 5),
                priority: m.count >= 4 ? "high" : m.count >= 2 ? "med" : "low",
                reason: m.count >= 3 ? "Strong opportunity to build topical authority." : "Add a few internal links to strengthen this page.",
            }));
            if (linkPages.length) push(this.siteFinding("INTERNAL_LINKS_FEW", { count: linkPages.length, pages: linkPages }));
        }

        // --- Core Web Vitals (PageSpeed) ---
        if (vitals.hasData && vitals.vitals?.length) {
            for (const v of vitals.vitals) {
                if (v.status === "good") continue;
                const code =
                    v.metric === "LCP" ? (v.status === "poor" ? "CWV_LCP_POOR" : "CWV_LCP_WARN")
                    : v.metric === "CLS" ? "CWV_CLS_POOR"
                    : v.metric === "INP" ? "CWV_INP_POOR"
                    : null;
                if (code && v.status === "poor") push(this.siteFinding(code, { values: { value: v.value } }));
                else if (code && v.metric === "LCP" && v.status === "warning") push(this.siteFinding("CWV_LCP_WARN", { values: { value: v.value } }));
            }
        } else {
            // No PageSpeed key connected: surface ONE clearly-labelled sample perf issue
            // (with a realistic LCP) so the Performance group + the actionable
            // recommendations are demonstrable. Replaced by live data once PSI is connected.
            push(this.siteFinding("CWV_LCP_POOR", {
                values: { lcp: 4200 },
                count: 1,
                pages: [{ id: null, url: "/", title: "Home", detail: "Sample data · connect a PageSpeed Insights key in Settings for live Core Web Vitals" }],
            }));
        }

        // --- PageSpeed opportunities (render-blocking, image opt, unminified, etc.) ---
        const opps = (vitals as { opportunities?: { code: string; title: string; savingsMs: number }[] }).opportunities ?? [];
        for (const o of opps) {
            push(this.siteFinding(o.code, { values: o.savingsMs > 0 ? { ms: o.savingsMs } : undefined }));
        }

        // --- Search Console: striking distance ---
        if (summary.hasData && summary.strikingDistance && summary.strikingDistance > 0) {
            push(this.siteFinding("GSC_STRIKING_DISTANCE", { values: { pos: "11-20" }, count: summary.strikingDistance }));
        }

        // --- GA4 + Search Console health (connected? returning data?) ---
        const [ga4, gsc, ga4Rows, gscRows] = await Promise.all([
            this.prisma.integration.findFirst({ where: { workspaceId, type: "ANALYTICS", provider: "ga4" }, select: { status: true } }),
            this.prisma.integration.findFirst({ where: { workspaceId, type: "SEARCH_CONSOLE", provider: "gsc" }, select: { status: true } }),
            this.prisma.metricSnapshot.count({ where: { workspaceId, source: "ga4" } }),
            this.prisma.metricSnapshot.count({ where: { workspaceId, source: "gsc" } }),
        ]);
        if (!ga4 || ga4.status !== "CONNECTED") push(this.siteFinding("GA4_NOT_CONNECTED"));
        else if (ga4Rows === 0) push(this.siteFinding("GA4_NO_DATA"));
        if (!gsc || gsc.status !== "CONNECTED") push(this.siteFinding("GSC_NOT_CONNECTED"));
        else if (gscRows === 0) push(this.siteFinding("GSC_NO_DATA"));

        // --- duplicate content / self-plagiarism (cross-page shingle over published bodies) ---
        const dups = detectDuplicatePages(entryMeta.map((e) => ({ id: e.id, title: e.title, url: e.url ?? undefined, text: e.text })));
        if (dups.length) {
            const pages: IssuePage[] = dups.map((d) => ({
                id: d.id, url: d.url ?? null, title: d.title,
                detail: `${d.similarity}% overlaps "${d.otherTitle}"`,
                overlap: d.similarity, matchTitle: d.otherTitle, priority: d.similarity >= 80 ? "high" : "med",
            }));
            push(this.siteFinding("DUPLICATE_CONTENT", { count: dups.length, pages }));
        }

        const result = buildIssues(pageRows, site, score.score ?? null);

        // Metadata current/recommended is derived from LIVE entry data at render time
        // (the L1 finding ledger is cached by contentHash, so values added to the meta
        // detector wouldn't appear for already-scanned pages). Deterministic trim only.
        const metaById = new Map(entryMeta.map((e) => [e.id, e]));
        for (const g of result.groups) {
            if (g.category !== "metadata") continue;
            const isDesc = g.key === "META_DESC_MISSING" || g.key === "META_DESC_LONG";
            const max = isDesc ? 160 : 60;
            for (const p of g.pages) {
                const e = p.id ? metaById.get(p.id) : undefined;
                if (!e) continue;
                const cur = isDesc ? e.metaDescription : e.metaTitle;
                if (!cur) continue;
                p.current = cur;
                p.currentLen = cur.length;
                if (g.key === "META_DESC_LONG" || g.key === "META_TITLE_LONG") {
                    p.recommended = trimMeta(cur, max);
                    p.recommendedLen = p.recommended.length;
                }
            }
        }

        return result;
    }

    /** Permanently dismiss (or restore) a finding so `issues()` stops surfacing it.
     *  Key = "CODE" (whole issue) or "CODE:entryId" (a single page). */
    async setIgnored(workspaceId: string, code: string, entryId: string | null, ignore: boolean) {
        const key = entryId ? `${code}:${entryId}` : code;
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ignoredFindings: true } });
        const set = new Set(ws?.ignoredFindings ?? []);
        if (ignore) set.add(key); else set.delete(key);
        await this.prisma.workspace.update({ where: { id: workspaceId }, data: { ignoredFindings: [...set] } });
        return { ignored: [...set] };
    }

    /** Generate AI alt text for an entry's in-body images that are missing it.
     *  Reuses the proven vision alt-gen (AssetsService) per mapped Media row; review-first. */
    async generatePageAlt(workspaceId: string, userId: string, entryId: string) {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId } });
        if (!entry) throw new NotFoundException("Entry not found.");
        const body = String((entry.data as Record<string, unknown> | null)?.body ?? "");

        const srcs: string[] = [];
        const re = /<img\b[^>]*>/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(body))) {
            const tag = m[0];
            const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
            if (alt && alt.trim()) continue; // already has alt
            const src = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
            if (src) srcs.push(src);
        }
        const uniq = [...new Set(srcs)].slice(0, 5);
        if (!uniq.length) return { suggestions: [], skipped: [], provider: undefined, model: undefined };

        const medias = await this.prisma.media.findMany({ where: { workspaceId }, select: { id: true, url: true } });
        const baseName = (u: string) => (u.split("?")[0].split("/").pop() ?? u).toLowerCase();
        const byKey = new Map(medias.map((x) => [baseName(x.url), x.id]));

        const suggestions: { src: string; alt: string }[] = [];
        const skipped: { src: string; reason: string }[] = [];
        let provider: string | undefined;
        let model: string | undefined;
        for (const src of uniq) {
            const mediaId = byKey.get(baseName(src));
            if (!mediaId) { skipped.push({ src, reason: "not a managed image" }); continue; }
            try {
                const r = await this.assets.generateAlt(workspaceId, userId, mediaId);
                suggestions.push({ src, alt: (r as { alt?: string }).alt ?? "" });
                provider = (r as { provider?: string }).provider;
                model = (r as { model?: string }).model;
            } catch (e) {
                skipped.push({ src, reason: e instanceof Error ? e.message.slice(0, 140) : "failed" });
            }
        }
        return { suggestions, skipped, provider, model };
    }

    // --- free-quota helpers (the chooser's quotaAvailable gate; used in Phase 4) ---

    /** Best-effort availability map for free-quota models today. */
    async quotaMap(workspaceId: string): Promise<Partial<Record<ModelId, boolean>>> {
        const date = this.utcDay();
        const rows = await this.prisma.aiQuotaDaily.findMany({ where: { workspaceId, date } });
        const byModel = new Map(rows.map((r) => [r.model, r]));
        const out: Partial<Record<ModelId, boolean>> = {};
        for (const m of Object.values(MODEL_REGISTRY)) {
            if (!m.freeQuota) continue;
            const row = byModel.get(m.id);
            out[m.id] = !row?.exhausted && (row?.count ?? 0) < m.freeQuota.perDay;
        }
        return out;
    }

    /** Increment today's free-quota counter for a model (after a free call). */
    async recordModelUse(workspaceId: string, model: string) {
        const date = this.utcDay();
        await this.prisma.aiQuotaDaily.upsert({
            where: { workspaceId_model_date: { workspaceId, model, date } },
            create: { workspaceId, model, date, count: 1 },
            update: { count: { increment: 1 } },
        });
    }

    /** Mark a model's free tier exhausted for today (on a real provider 429). */
    async markExhausted(workspaceId: string, model: string) {
        const date = this.utcDay();
        await this.prisma.aiQuotaDaily.upsert({
            where: { workspaceId_model_date: { workspaceId, model, date } },
            create: { workspaceId, model, date, exhausted: true },
            update: { exhausted: true },
        });
    }
}
