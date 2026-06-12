import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { IntegrationType } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { KnowledgeService, SEO_LEARN_START, SEO_LEARN_END } from "../knowledge/knowledge.service";
import { safeFetch } from "../common/ssrf";
import { CacheService } from "../cache/cache.service";
import { ContentEntriesService } from "../content/content-entries.service";

/** Splits the packed "querypage" dimensionValue. */
const PAIR_SEP = String.fromCharCode(1);

/** Escape a string for safe literal use inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type LinkOpportunity = {
    sourceId: string;
    sourceTitle: string;
    targetId: string;
    targetTitle: string;
    targetUrl: string;
    anchor: string;
    snippet: string;
};

type ConnectorProvider = "pagespeed" | "keyword_data" | "aeo_analytics" | "backlinks";

type Metrics = { clicks: number; impressions: number; ctr: number; position: number };
const emptyMetrics = (): Metrics => ({ clicks: 0, impressions: 0, ctr: 0, position: 0 });

const round = (n: number, d = 1) => {
    const f = 10 ** d;
    return Math.round(n * f) / f;
};

/** The heterogeneous, JSON-serializable result of a crawl()/vitals() read. An
 *  object type (not bare `any`) so callers' Promise.all tuples stay intact, while
 *  member access stays permissive (matching the pre-cache-refactor behaviour). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SeoCacheResult = Record<string, any>;

@Injectable()
export class SeoService {
    private readonly logger = new Logger("SeoService");
    // Expensive crawler-backed reads are cached through CacheService (Redis when
    // available, else in-process) so the crawler tabs share one crawl AND the cache
    // is shared across instances in a multi-instance deploy. TTLs in seconds.
    private readonly CRAWL_TTL_S = 10 * 60;
    private readonly VITALS_TTL_S = 30 * 60;
    private crawlKey(workspaceId: string) { return `seo:crawl:${workspaceId}`; }
    private vitalsKey(workspaceId: string) { return `seo:vitals:${workspaceId}`; }

    constructor(
        private readonly prisma: PrismaService,
        private readonly ai: AiService,
        private readonly knowledge: KnowledgeService,
        private readonly entries: ContentEntriesService,
        private readonly cache: CacheService,
    ) {}

    // ─── Internal linking ───────────────────────────────────────────────────
    // Scan published managed entries and surface where one page mentions another
    // page's topic (its title/keyword) without already linking to it. Matching is
    // deterministic phrase-matching; the apply edits the source entry's body and
    // goes through the normal update path (validation + versioning + webhooks).

    private bodyOf(e: { data: unknown }) {
        const d = (e.data ?? {}) as Record<string, unknown>;
        return {
            title: typeof d.title === "string" ? d.title : "",
            body: typeof d.body === "string" ? d.body : "",
            // The SEO panel stores the focus keyword as `focusKeyword`; `keywords` is the
            // legacy comma-list. Use either so the link finder sees the real keyword.
            keywords: [typeof d.keywords === "string" ? d.keywords : "", typeof d.focusKeyword === "string" ? d.focusKeyword : ""].filter(Boolean).join(", "),
        };
    }

    private stripHtml(html: string) {
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    async internalLinks(workspaceId: string): Promise<{ opportunities: LinkOpportunity[]; pages: number }> {
        const entries = await this.prisma.contentEntry.findMany({
            where: { workspaceId, status: "PUBLISHED" },
            select: { id: true, slug: true, data: true },
            orderBy: { updatedAt: "desc" },
            take: 500,
        });

        // Each page is a link target; its title + keywords become candidate anchor phrases.
        const targets = entries
            .filter((e) => e.slug)
            .map((e) => {
                const { title, keywords } = this.bodyOf(e);
                const phrases = [title, ...keywords.split(",").map((s) => s.trim())].filter(
                    (p) => p.length >= 6 && p.split(/\s+/).length <= 6,
                );
                return { id: e.id, title, url: `/${e.slug}`, phrases: [...new Set(phrases)] };
            })
            .filter((t) => t.title && t.phrases.length);

        const opps: LinkOpportunity[] = [];
        for (const e of entries) {
            const { title: sTitle, body } = this.bodyOf(e);
            if (!body) continue;
            // Match only in UNLINKED text: drop existing <a>…</a> first, so we never
            // offer to link a phrase that's already a link (apply would then fail to
            // find a free occurrence). Mirrors insertLink, which skips existing anchors.
            const text = this.stripHtml(body.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " "));
            const lowerBody = body.toLowerCase();
            for (const t of targets) {
                if (t.id === e.id) continue;
                // Already linked to this target → not an opportunity.
                if (lowerBody.includes(`href="${t.url}"`) || lowerBody.includes(`href='${t.url}'`)) continue;
                // First phrase (title preferred) that appears as whole words in the source text.
                let anchor = "";
                let idx = -1;
                for (const p of t.phrases) {
                    const m = new RegExp(`\\b${escapeRe(p)}\\b`, "i").exec(text);
                    if (m) {
                        anchor = m[0];
                        idx = m.index;
                        break;
                    }
                }
                if (!anchor) continue;
                const from = Math.max(0, idx - 40);
                const snippet =
                    (from > 0 ? "…" : "") + text.slice(from, idx + anchor.length + 40).trim() + "…";
                opps.push({
                    sourceId: e.id,
                    sourceTitle: sTitle,
                    targetId: t.id,
                    targetTitle: t.title,
                    targetUrl: t.url,
                    anchor,
                    snippet,
                });
            }
        }

        // Prefer longer (more specific) anchors; cap per source and overall.
        opps.sort((a, b) => b.anchor.length - a.anchor.length);
        const perSource = new Map<string, number>();
        const limited: LinkOpportunity[] = [];
        for (const o of opps) {
            const n = perSource.get(o.sourceId) ?? 0;
            if (n >= 5) continue;
            perSource.set(o.sourceId, n + 1);
            limited.push(o);
            if (limited.length >= 60) break;
        }
        return { opportunities: limited, pages: entries.length };
    }

    /** Wrap the first unlinked, in-text occurrence of `anchor` in an <a> to `url`. */
    private insertLink(html: string, anchor: string, url: string): { html: string; ok: boolean } {
        // Split out existing <a>…</a> so we never nest or re-link already-linked text.
        const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/i);
        // The finder matches the anchor in whitespace-collapsed text, so allow the raw
        // HTML to have newlines / multiple spaces / &nbsp; between the words (otherwise
        // a phrase that spans a line break wouldn't be found here even though it exists).
        const flexible = escapeRe(anchor).replace(/\s+/g, "(?:\\s|&nbsp;)+");
        // `(?![^<]*>)` ⇒ the phrase is in text content, not inside a tag's attributes.
        const re = new RegExp(`(\\b${flexible}\\b)(?![^<]*>)`, "i");
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) continue; // odd indexes are existing anchors — leave them
            if (re.test(parts[i])) {
                parts[i] = parts[i].replace(re, `<a href="${url}">$1</a>`);
                return { html: parts.join(""), ok: true };
            }
        }
        return { html, ok: false };
    }

    async applyInternalLink(
        workspaceId: string,
        userId: string,
        dto: { sourceId: string; targetId: string; anchor: string },
    ) {
        const [src, tgt] = await Promise.all([
            this.prisma.contentEntry.findFirst({ where: { id: dto.sourceId, workspaceId }, select: { data: true } }),
            this.prisma.contentEntry.findFirst({ where: { id: dto.targetId, workspaceId }, select: { slug: true } }),
        ]);
        if (!src) throw new BadRequestException("Source page not found.");
        if (!tgt?.slug) throw new BadRequestException("Target page not found.");
        const data = (src.data ?? {}) as Record<string, unknown>;
        const body = typeof data.body === "string" ? data.body : "";
        const { html, ok } = this.insertLink(body, dto.anchor, `/${tgt.slug}`);
        if (!ok) throw new BadRequestException("Couldn't find that phrase to link (the content may have changed).");
        await this.entries.update(workspaceId, dto.sourceId, { data: { body: html } }, userId);
        return { ok: true, url: `/${tgt.slug}` };
    }

    // ─── SEO learning memory ────────────────────────────────────────────────

    /** Replace the auto-managed block inside the memory file, preserving user notes. */
    private writeManagedBlock(content: string, inner: string): string {
        const block = `${SEO_LEARN_START}\n${inner}\n${SEO_LEARN_END}`;
        const re = new RegExp(`${SEO_LEARN_START}[\\s\\S]*?${SEO_LEARN_END}`);
        if (re.test(content)) return content.replace(re, block);
        return `${content.trim()}\n\n${block}\n`;
    }

    private readManagedBlock(content: string): string {
        const m = content.match(new RegExp(`${SEO_LEARN_START}([\\s\\S]*?)${SEO_LEARN_END}`));
        return m ? m[1].trim() : "";
    }

    /** Record an accepted fix as a deterministic learned preference (no AI call). */
    async recordLearning(
        workspaceId: string,
        input: { kind: "meta" | "schema"; path: string; after: { title?: string; description?: string; type?: string } },
    ) {
        const mem = await this.knowledge.getOrCreateSeoMemory(workspaceId);
        const inner = this.readManagedBlock(mem.content);

        // Parse existing bullets into a map keyed by "[kind] path" (newest wins, capped).
        const lines = inner.split("\n").filter((l) => l.trim().startsWith("- ["));
        const byKey = new Map<string, string>();
        for (const l of lines) {
            const k = l.match(/^- (\[\w+\]\s+`[^`]+`)/)?.[1];
            if (k) byKey.set(k, l.trim());
        }

        let bullet: string;
        if (input.kind === "meta") {
            const t = (input.after.title ?? "").trim();
            const d = (input.after.description ?? "").trim();
            bullet = `- [meta] \`${input.path}\` → title "${t}" (${t.length} chars); description (${d.length} chars)`;
        } else {
            bullet = `- [schema] \`${input.path}\` → ${input.after.type || "structured data"}`;
        }
        const key = bullet.match(/^- (\[\w+\]\s+`[^`]+`)/)?.[1] ?? bullet;
        byKey.set(key, bullet);

        const bullets = [...byKey.values()].slice(-50);

        // Deterministic aggregate patterns from the meta bullets.
        const titleLens = bullets
            .map((b) => b.match(/title ".*?" \((\d+) chars\)/)?.[1])
            .filter(Boolean)
            .map(Number);
        const descLens = bullets
            .map((b) => b.match(/description \((\d+) chars\)/)?.[1])
            .filter(Boolean)
            .map(Number);
        const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
        const patterns: string[] = [];
        if (titleLens.length) patterns.push(`- Preferred title length ≈ ${avg(titleLens)} chars (lead with the primary keyword).`);
        if (descLens.length) patterns.push(`- Preferred meta-description length ≈ ${avg(descLens)} chars.`);
        const schemaTypes = [...new Set(bullets.filter((b) => b.startsWith("- [schema]")).map((b) => b.split("→ ")[1]).filter(Boolean))];
        if (schemaTypes.length) patterns.push(`- Schema types in use: ${schemaTypes.join(", ")}.`);

        const newInner = [
            "## Learned preferences",
            "_(auto-maintained — content inside this block may be rewritten)_",
            "",
            ...(patterns.length ? ["### Patterns", ...patterns, ""] : []),
            "### Accepted fixes",
            ...bullets,
        ].join("\n");

        const content = this.writeManagedBlock(mem.content, newInner);
        await this.prisma.knowledgeFile.update({ where: { id: mem.id }, data: { content } });
        return { ok: true, count: bullets.length };
    }

    /** One AI pass that rewrites the learned block into clean guidelines. */
    async refineMemory(workspaceId: string, userId: string) {
        const mem = await this.knowledge.getOrCreateSeoMemory(workspaceId);
        const inner = this.readManagedBlock(mem.content);
        if (!inner || !inner.includes("- [")) return { ok: false, reason: "nothing-to-refine" };
        const res = await this.ai.generate(workspaceId, userId, {
            feature: "seo.memory_refine",
            system: "You distill SEO editing decisions into a concise, reusable house-style guide. Output Markdown: a short intro line, then 4–8 bullet guidelines. No preamble.",
            prompt: `Here are accepted SEO fixes for this site. Distill them into clear, reusable SEO title/description/schema guidelines:\n\n${inner}`,
            temperature: 0.3,
            maxTokens: 600,
        });
        const refined = `## Learned guidelines (AI-refined)\n${res.text.trim()}`;
        const content = this.writeManagedBlock(mem.content, refined);
        await this.prisma.knowledgeFile.update({ where: { id: mem.id }, data: { content } });
        return { ok: true, provider: res.provider, model: res.model };
    }

    /** Pull the first JSON object out of an LLM reply (handles ```json fences / prose). */
    private extractJson(text: string): any {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced ? fenced[1] : text;
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("No JSON in AI response.");
        return JSON.parse(candidate.slice(start, end + 1));
    }

    /** AI-rewrite a page's title + meta description within SEO length limits. */
    async suggestMeta(
        workspaceId: string,
        userId: string,
        input: { path: string; title: string; description: string },
    ) {
        const prompt = [
            `Page path: ${input.path}`,
            `Current title (${input.title.length} chars): ${input.title || "(none)"}`,
            `Current meta description (${input.description.length} chars): ${input.description || "(none)"}`,
            "",
            "Rewrite the SEO title (aim 50–60 chars, lead with the primary keyword, compelling, no clickbait) and the meta description (aim 140–160 chars, specific, action-oriented, includes the keyword).",
            'Return ONLY JSON: {"title":"...","description":"..."}',
        ].join("\n");
        const res = await this.ai.generate(workspaceId, userId, {
            feature: "seo.meta_fix",
            system: "You are an expert SEO copywriter. Reply with valid JSON only — no prose, no code fences.",
            prompt,
            temperature: 0.4,
            maxTokens: 400,
        });
        const json = this.extractJson(res.text);
        return {
            title: String(json.title ?? "").trim(),
            description: String(json.description ?? "").trim(),
            provider: res.provider,
            model: res.model,
        };
    }

    /** AI-generate a JSON-LD structured-data block appropriate for a page.
     *  `kind: "faq"` forces a FAQPage built from the page's likely questions. */
    async suggestSchema(
        workspaceId: string,
        userId: string,
        input: { path: string; title: string; description?: string; body?: string; kind?: "auto" | "faq" },
    ) {
        const faq = input.kind === "faq";
        const instruction = faq
            ? "Generate a schema.org FAQPage JSON-LD block for this page. Produce 3–6 realistic question/answer pairs derived from the page's topic and content (mainEntity = array of Question with acceptedAnswer). Use the page's real wording where possible; keep answers concise. Output a single valid JSON-LD object with @context https://schema.org and @type FAQPage."
            : "Generate one appropriate schema.org JSON-LD block for this page. Pick the best @type from the page's purpose (e.g. LocalBusiness, Service, FAQPage, BlogPosting, Organization, BreadcrumbList). Use realistic placeholder values the user can edit. Output a single valid JSON-LD object with @context set to https://schema.org.";
        const prompt = [
            `Page path: ${input.path}`,
            `Title: ${input.title || "(none)"}`,
            input.description ? `Description: ${input.description}` : "",
            input.body ? `Content excerpt: ${input.body.slice(0, 800)}` : "",
            "",
            instruction,
            "Return ONLY the JSON object.",
        ].filter(Boolean).join("\n");
        const res = await this.ai.generate(workspaceId, userId, {
            feature: "seo.schema_fix",
            system: "You are an SEO structured-data expert. Reply with a single valid JSON-LD object only — no prose, no code fences.",
            prompt,
            temperature: 0.3,
            maxTokens: 700,
        });
        const json = this.extractJson(res.text);
        return { jsonld: JSON.stringify(json, null, 2), type: json["@type"] ?? null, provider: res.provider, model: res.model };
    }

    // ─── GSC-derived (read MetricSnapshot) ──────────────────────────────────

    /** Group a GSC dimension's rows back into {clicks, impressions, ctr, position} per value. */
    private async gscDimension(workspaceId: string, dimension: string) {
        const rows = await this.prisma.metricSnapshot.findMany({
            where: { workspaceId, source: "gsc", dimension },
        });
        const map = new Map<string, Metrics>();
        for (const r of rows) {
            const key = r.dimensionValue ?? "";
            const cur = map.get(key) ?? emptyMetrics();
            if (r.metric === "clicks" || r.metric === "impressions" || r.metric === "ctr" || r.metric === "position") {
                cur[r.metric] = r.value;
            }
            map.set(key, cur);
        }
        return map;
    }

    private async dailyTotals(workspaceId: string, source: string, metric: string) {
        const rows = await this.prisma.metricSnapshot.findMany({
            where: { workspaceId, source, metric, dimension: null },
            orderBy: { date: "asc" },
        });
        return rows.map((r) => ({ date: r.date, value: r.value }));
    }

    /** Keyword table + ranking-position distribution (live GSC query data). */
    async keywords(workspaceId: string) {
        const map = await this.gscDimension(workspaceId, "query");
        if (map.size === 0) return { hasData: false, keywords: [], buckets: [], total: 0 };

        const keywords = [...map.entries()]
            .map(([term, m], i) => ({
                id: `kw_${i}`,
                term,
                clicks: Math.round(m.clicks),
                impressions: Math.round(m.impressions),
                ctr: round(m.ctr, 1),
                position: round(m.position, 1),
            }))
            .sort((a, b) => b.impressions - a.impressions);

        const buckets = [
            { label: "1–3", range: [1, 3] },
            { label: "4–10", range: [4, 10] },
            { label: "11–20", range: [11, 20] },
            { label: "21–50", range: [21, 50] },
            { label: "51+", range: [51, Infinity] },
        ].map((b) => ({
            label: b.label,
            count: keywords.filter((k) => k.position >= b.range[0] && k.position <= b.range[1]).length,
        }));

        return { hasData: true, total: keywords.length, keywords: keywords.slice(0, 100), buckets };
    }

    /** Top pages by clicks, with full GSC metrics (clicks/impressions/ctr/position). */
    async topPages(workspaceId: string, limit = 50) {
        const map = await this.gscDimension(workspaceId, "page");
        if (map.size === 0) return { hasData: false, total: 0, pages: [] };
        const path = (u: string) => {
            try {
                return new URL(u).pathname || "/";
            } catch {
                return u;
            }
        };
        const pages = [...map.entries()]
            .map(([url, m]) => ({
                url,
                path: path(url),
                clicks: Math.round(m.clicks),
                impressions: Math.round(m.impressions),
                ctr: round(m.ctr, 1),
                position: round(m.position, 1),
            }))
            .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
        return { hasData: true, total: pages.length, pages: pages.slice(0, limit) };
    }

    /** External referring domains by GA4 referral traffic (the Backlinks default). */
    private async referralDomains(workspaceId: string) {
        const rows = await this.prisma.metricSnapshot.findMany({
            where: { workspaceId, source: "ga4", dimension: "referral_domain" },
        });
        return rows
            .map((r) => ({ domain: r.dimensionValue ?? "Unknown", sessions: Math.round(r.value) }))
            .filter((r) => r.sessions > 0)
            .sort((a, b) => b.sessions - a.sessions);
    }

    /**
     * Backlinks view. Default source is GA4 referral traffic (referring domains by
     * sessions). When a BYO backlinks provider (DataForSEO etc.) is connected, real
     * backlink counts come from it, merged with the GA4 referral list. Never throws.
     */
    async backlinks(workspaceId: string) {
        const referral = await this.referralDomains(workspaceId);
        const fromProvider = await this.fetchBacklinksProvider(workspaceId, referral);
        if (fromProvider?.hasData) return fromProvider;
        if (referral.length === 0) return { hasData: false, source: "ga4", reason: "no-referral-data", referringDomains: 0, referralSessions: 0, topReferring: [] };
        return {
            hasData: true,
            source: "ga4",
            metric: "sessions", // GA4 gives referral traffic, not backlink counts
            referringDomains: referral.length,
            referralSessions: referral.reduce((s, r) => s + r.sessions, 0),
            newDomains: null,
            totalBacklinks: null,
            topReferring: referral.slice(0, 8),
        };
    }

    /** Pull aggregate backlink counts from a connected provider; returns null if none. */
    private async fetchBacklinksProvider(workspaceId: string, referral: { domain: string; sessions: number }[]) {
        const integ = await this.connectorIntegration(workspaceId, "backlinks");
        if (!integ) return null;
        const key = integ.encryptedSecret ? decryptSecret(integ.encryptedSecret) : "";
        const cfg = (integ.config ?? {}) as { preset?: string; baseUrl?: string };
        const site = await this.siteUrlFor(workspaceId);
        let host = "";
        try {
            host = site ? new URL(site).hostname.replace(/^www\./, "") : "";
        } catch {
            host = "";
        }
        if (!host) return { hasData: false, source: "provider", provider: integ.label, reason: "no-site" };
        try {
            if (cfg.preset === "dataforseo") {
                const res = await safeFetch(
                    "https://api.dataforseo.com/v3/backlinks/summary/live",
                    {
                        method: "POST",
                        headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
                        body: JSON.stringify([{ target: host, internal_list_limit: 10, backlinks_status_type: "live" }]),
                    },
                    { timeoutMs: 15_000 },
                );
                const data = (await res.json().catch(() => null)) as any;
                const result = data?.tasks?.[0]?.result?.[0];
                if (!res.ok || !result) return { hasData: false, source: "provider", provider: integ.label, reason: `dataforseo-${res.status}` };
                return {
                    hasData: true,
                    source: "provider",
                    provider: integ.label,
                    metric: "backlinks",
                    referringDomains: result.referring_domains ?? 0,
                    newDomains: result.referring_domains_new ?? null,
                    totalBacklinks: result.backlinks ?? 0,
                    referralSessions: referral.reduce((s, r) => s + r.sessions, 0),
                    topReferring: referral.slice(0, 8), // GA4 referral list, merged alongside the BYO totals
                };
            }
            if (cfg.baseUrl) {
                const url = `${cfg.baseUrl.replace(/\/+$/, "")}?domain=${encodeURIComponent(host)}`;
                const res = await safeFetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} }, { timeoutMs: 12_000 });
                const data = (await res.json().catch(() => null)) as any;
                if (!res.ok || !data) return { hasData: false, source: "provider", provider: integ.label, reason: `provider-${res.status}` };
                return {
                    hasData: true,
                    source: "provider",
                    provider: integ.label,
                    metric: "backlinks",
                    referringDomains: data.referringDomains ?? 0,
                    newDomains: data.newDomains ?? null,
                    totalBacklinks: data.totalBacklinks ?? 0,
                    referralSessions: referral.reduce((s, r) => s + r.sessions, 0),
                    topReferring: data.topReferring ?? referral.slice(0, 8),
                };
            }
            return { hasData: false, source: "provider", provider: integ.label, reason: "no-config" };
        } catch {
            return { hasData: false, source: "provider", provider: integ.label, reason: "provider-error" };
        }
    }

    /** Queries where 2+ of the site's own URLs compete (keyword cannibalization). */
    async cannibalization(workspaceId: string) {
        const rows = await this.prisma.metricSnapshot.findMany({
            where: { workspaceId, source: "gsc", dimension: "query_page" },
        });
        if (rows.length === 0) return { hasData: false, groups: [] };

        const pairs = new Map<string, Metrics & { query: string; page: string }>();
        for (const r of rows) {
            const dv = r.dimensionValue ?? "";
            const i = dv.indexOf(PAIR_SEP);
            if (i < 0) continue;
            const cur = pairs.get(dv) ?? { ...emptyMetrics(), query: dv.slice(0, i), page: dv.slice(i + 1) };
            if (r.metric === "clicks" || r.metric === "impressions" || r.metric === "ctr" || r.metric === "position") {
                (cur as any)[r.metric] = r.value;
            }
            pairs.set(dv, cur);
        }

        const byQuery = new Map<string, (Metrics & { page: string })[]>();
        for (const p of pairs.values()) {
            const arr = byQuery.get(p.query) ?? [];
            arr.push({ page: p.page, clicks: p.clicks, impressions: p.impressions, ctr: p.ctr, position: p.position });
            byQuery.set(p.query, arr);
        }

        const path = (u: string) => {
            try {
                return new URL(u).pathname || "/";
            } catch {
                return u;
            }
        };

        const groups = [...byQuery.entries()]
            .filter(([, pgs]) => pgs.filter((p) => p.impressions > 0).length >= 2)
            .map(([keyword, pgs], idx) => {
                const ranked = pgs.filter((p) => p.impressions > 0).sort((a, b) => a.position - b.position).slice(0, 5);
                const spread = ranked[ranked.length - 1].position - ranked[0].position;
                const severity: "high" | "medium" = ranked.length >= 3 || spread > 8 ? "high" : "medium";
                return {
                    id: `cb_${idx}`,
                    keyword,
                    severity,
                    impressions: Math.round(ranked.reduce((a, b) => a + b.impressions, 0)),
                    pages: ranked.map((p) => ({ path: path(p.page), position: round(p.position, 1), clicks: Math.round(p.clicks) })),
                    recommendation: `${ranked.length} of your URLs compete for "${keyword}". Keep the strongest page, fold the others' content into it, and 301-redirect the weaker URLs.`,
                };
            })
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, 25);

        return { hasData: true, groups };
    }

    /** Topical clusters derived from shared head-terms across GSC queries. */
    async clusters(workspaceId: string) {
        const map = await this.gscDimension(workspaceId, "query");
        if (map.size === 0) return { hasData: false, clusters: [] };

        const STOP = new Set([
            "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "is", "are", "with", "how",
            "what", "best", "near", "me", "my", "your", "vs", "from", "by", "at", "do", "does", "can",
        ]);
        const tokenize = (q: string) =>
            q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));

        // Global token frequency → each query's "head" is its most common token across the set.
        const freq = new Map<string, number>();
        for (const q of map.keys()) for (const t of new Set(tokenize(q))) freq.set(t, (freq.get(t) ?? 0) + 1);

        const groups = new Map<string, { query: string; m: Metrics }[]>();
        for (const [query, m] of map.entries()) {
            const toks = tokenize(query);
            if (!toks.length) continue;
            const head = toks.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))[0];
            const arr = groups.get(head) ?? [];
            arr.push({ query, m });
            groups.set(head, arr);
        }

        const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        const clusters = [...groups.entries()]
            .filter(([, items]) => items.length >= 2)
            .map(([head, items], idx) => {
                const clicks = Math.round(items.reduce((a, b) => a + b.m.clicks, 0));
                const ranked = items.filter((it) => it.m.position > 0 && it.m.position <= 10).length;
                const coverage = Math.round((ranked / items.length) * 100);
                const supporting = items
                    .sort((a, b) => b.m.impressions - a.m.impressions)
                    .slice(0, 6)
                    .map((it) => ({
                        title: it.query,
                        status: it.m.clicks > 0 ? "live" : it.m.impressions > 0 ? "gap" : "draft",
                    }));
                return { id: `cl_${idx}`, pillar: title(head), pages: items.length, coverage, clicks, supporting };
            })
            .sort((a, b) => b.clicks - a.clicks || b.pages - a.pages)
            .slice(0, 8);

        return { hasData: clusters.length > 0, clusters };
    }

    /** KPI strip + health score + dashboard counters (GSC/GA4, no crawl). */
    async summary(workspaceId: string, days = 30) {
        const [clicks, impressions, ctr, position, sessions, bounce] = await Promise.all([
            this.dailyTotals(workspaceId, "gsc", "clicks"),
            this.dailyTotals(workspaceId, "gsc", "impressions"),
            this.dailyTotals(workspaceId, "gsc", "ctr"),
            this.dailyTotals(workspaceId, "gsc", "position"),
            this.dailyTotals(workspaceId, "ga4", "sessions"),
            this.dailyTotals(workspaceId, "ga4", "bounceRate"),
        ]);
        const hasData = clicks.length > 0 || sessions.length > 0;
        if (!hasData) return { hasData: false };

        const sum = (a: { value: number }[]) => a.reduce((x, y) => x + y.value, 0);
        const avg = (a: { value: number }[]) => (a.length ? sum(a) / a.length : 0);
        // delta = recent half vs earlier half of the window (only when enough days exist).
        const delta = (a: { value: number }[], mode: "sum" | "avg") => {
            if (a.length < 4) return null;
            const mid = Math.floor(a.length / 2);
            const first = a.slice(0, mid);
            const second = a.slice(mid);
            const fn = mode === "sum" ? sum : avg;
            const f = fn(first);
            const s = fn(second);
            if (f === 0) return null;
            return round(((s - f) / f) * 100, 1);
        };

        const avgPos = avg(position);
        const avgCtr = avg(ctr);
        // Composite health: position-weighted, blended with CTR. Honest heuristic, GSC-only.
        // Gentle curve + floor so an indexed-but-low-ranking site lands in the teens, not 0.
        const positionScore = avgPos > 0 ? Math.max(8, Math.min(100, 100 - (avgPos - 1) * 1.6)) : 0;
        const ctrScore = Math.max(0, Math.min(100, avgCtr * 8));
        const health = clicks.length || avgPos > 0 ? Math.round(positionScore * 0.65 + ctrScore * 0.35) : null;

        const queryMap = await this.gscDimension(workspaceId, "query");
        const queryArr = [...queryMap.values()];
        const strikingDistance = queryArr.filter((m) => m.position >= 11 && m.position <= 20).length;
        const cannibal = await this.cannibalization(workspaceId);

        // Live traffic-source breakdown from GA4 acquisition channels.
        const CHANNEL_COLORS: Record<string, string> = {
            "Organic Search": "#6C5CE7",
            Direct: "#3B82F6",
            "Organic Social": "#00B894",
            Referral: "#F5A623",
            "Paid Search": "#E91E63",
            Email: "#14B8A6",
            "Organic Video": "#8B5CF6",
            Display: "#EF4444",
            "Cross-network": "#0EA5E9",
            "Paid Social": "#EC4899",
            Unassigned: "#94A3B8",
        };
        const fallback = ["#6C5CE7", "#3B82F6", "#00B894", "#F5A623", "#E91E63", "#14B8A6", "#8B5CF6", "#EF4444", "#0EA5E9"];
        const channelRows = await this.prisma.metricSnapshot.findMany({
            where: { workspaceId, source: "ga4", dimension: "channel" },
        });
        const usedColors = new Set<string>();
        const traffic = channelRows
            .filter((r) => r.value > 0)
            .sort((a, b) => b.value - a.value)
            .map((r) => {
                const label = r.dimensionValue ?? "Unknown";
                let color = CHANNEL_COLORS[label];
                if (!color || usedColors.has(color)) color = fallback.find((c) => !usedColors.has(c)) ?? "#9999B0";
                usedColors.add(color);
                return { label, value: Math.round(r.value), color };
            });

        return {
            hasData: true,
            health,
            strikingDistance,
            conflicts: cannibal.groups.length,
            traffic,
            kpis: {
                clicks: { value: Math.round(sum(clicks)), delta: delta(clicks, "sum"), goodWhenUp: true },
                impressions: { value: Math.round(sum(impressions)), delta: delta(impressions, "sum"), goodWhenUp: true },
                ctr: { value: round(avgCtr, 1), delta: delta(ctr, "avg"), goodWhenUp: true },
                position: { value: round(avgPos, 1), delta: delta(position, "avg"), goodWhenUp: false },
                sessions: { value: Math.round(sum(sessions)), delta: delta(sessions, "sum"), goodWhenUp: true },
                bounce: { value: round(avg(bounce) * 100, 1), delta: delta(bounce, "avg"), goodWhenUp: false },
            },
        };
    }

    /**
     * THE canonical Flow SEO Score (0-100): one number for the whole product.
     * Weighted blend of the pillars we can measure — Visibility (Search Console),
     * Technical (built-in crawler), Speed (Core Web Vitals). When a source isn't
     * connected, its weight redistributes across the live pillars, so the score is
     * always meaningful (the offline crawler guarantees at least the Technical pillar).
     */
    async score(workspaceId: string) {
        const [summary, audit, vitals] = (await Promise.all([
            this.summary(workspaceId).catch(() => ({ hasData: false })),
            this.crawl(workspaceId).catch(() => ({ hasData: false })),
            this.vitals(workspaceId).catch(() => ({ hasData: false })),
        ])) as [any, any, any];

        const CWV_PTS: Record<string, number> = { good: 100, warning: 60, poor: 25 };
        const speedScore = (v?: { status: string }[]) =>
            v && v.length ? Math.round(v.reduce((s, m) => s + (CWV_PTS[m.status] ?? 60), 0) / v.length) : null;

        const pillars = [
            { key: "visibility", label: "Visibility", source: "Search Console", weight: 40, score: summary?.hasData ? summary.health ?? null : null },
            { key: "technical", label: "Technical", source: "Site crawl", weight: 35, score: audit?.hasData ? audit.overall ?? null : null },
            { key: "speed", label: "Speed", source: "Core Web Vitals", weight: 25, score: vitals?.hasData ? speedScore(vitals.vitals) : null },
        ].map((p) => ({ ...p, live: p.score != null }));

        const live = pillars.filter((p) => p.score != null);
        const totalWeight = live.reduce((s, p) => s + p.weight, 0);
        const score = totalWeight > 0 ? Math.round(live.reduce((s, p) => s + (p.score as number) * p.weight, 0) / totalWeight) : null;

        return { hasData: score != null, score, pillars };
    }

    // ─── Server-side crawler (audit / meta / JSON-LD) ───────────────────────

    private async siteUrlFor(workspaceId: string): Promise<string | null> {
        const integ = await this.prisma.integration.findFirst({
            where: { workspaceId, type: IntegrationType.SEARCH_CONSOLE },
        });
        const siteUrl = (integ?.config as { siteUrl?: string } | null)?.siteUrl;
        if (!siteUrl) return null;
        if (siteUrl.startsWith("sc-domain:")) return `https://${siteUrl.slice("sc-domain:".length)}/`;
        return siteUrl;
    }

    private async fetchHtml(url: string): Promise<{ url: string; ok: boolean; status: number; html: string }> {
        try {
            // SSRF-guarded crawl of the user's own site; follow canonical/https
            // redirects (each hop re-validated against private ranges). 8s timeout.
            const res = await safeFetch(
                url,
                { headers: { "User-Agent": "FlowCMS-SEO-Auditor/1.0 (+https://flowcms.co)" } },
                { timeoutMs: 8000, maxRedirects: 3 },
            );
            const ct = res.headers.get("content-type") ?? "";
            const html = ct.includes("html") ? (await res.text()).slice(0, 600_000) : "";
            return { url, ok: res.ok, status: res.status, html };
        } catch {
            return { url, ok: false, status: 0, html: "" };
        }
    }

    /** Fetch a small text file (robots/sitemap/llms) from a URL. */
    private async fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
        try {
            const res = await safeFetch(
                url,
                { headers: { "User-Agent": "FlowCMS-SEO-Auditor/1.0 (+https://flowcms.co)" } },
                { timeoutMs: 8000, maxRedirects: 3 },
            );
            const text = res.ok ? (await res.text()).slice(0, 200_000) : "";
            return { ok: res.ok, status: res.status, text };
        } catch {
            return { ok: false, status: 0, text: "" };
        }
    }

    /** Check the site-root SEO/AEO files: robots.txt, sitemap.xml, llms.txt. */
    private async rootFiles(site: string) {
        const root = site.endsWith("/") ? site : `${site}/`;
        const [robots, sitemap, llms] = await Promise.all([
            this.fetchText(`${root}robots.txt`),
            this.fetchText(`${root}sitemap.xml`),
            this.fetchText(`${root}llms.txt`),
        ]);
        const robotsText = robots.text.toLowerCase();
        const aiBots = ["gptbot", "perplexitybot", "claudebot", "google-extended", "ccbot", "oai-searchbot"];
        // "blocked" = an AI bot is explicitly disallowed everywhere.
        const blocksAiBots = aiBots.some((b) => new RegExp(`user-agent:\\s*${b}[\\s\\S]*?disallow:\\s*/\\s`, "i").test(robots.text + "\n"));
        const sitemapUrls = (sitemap.text.match(/<loc>/gi) ?? []).length;
        return {
            robots: { present: robots.ok, hasSitemapRef: /sitemap:\s*http/i.test(robots.text), blocksAiBots },
            sitemap: { present: sitemap.ok, urls: sitemapUrls },
            llmsTxt: { present: llms.ok },
        };
    }

    private parsePage(url: string, html: string) {
        const meta = (name: string) => {
            const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
            const tag = html.match(re)?.[0] ?? "";
            return tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "";
        };
        const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
        const description = meta("description").trim();
        const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']*)["']/i)?.[1] ?? "").trim();
        const robots = meta("robots").toLowerCase();
        const viewport = !!meta("viewport");
        const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
        const ogTitle = !!meta("og:title");
        const ogImage = !!meta("og:image");
        const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
        const imgsNoAlt = imgs.filter((t) => !/\balt=["'][^"']+["']/i.test(t)).length;
        const internalLinks = (html.match(/<a\b[^>]*href=["'](\/[^"']*|[^"':]+:\/\/[^"']*)["']/gi) ?? []).length;
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
        const words = (text.match(/\b\w+\b/g) ?? []).length;

        // JSON-LD blocks
        const ldTypes: string[] = [];
        let ldValid = true;
        let ldCount = 0;
        const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let m: RegExpExecArray | null;
        while ((m = ldRe.exec(html))) {
            ldCount++;
            try {
                const json = JSON.parse(m[1].trim());
                const collect = (node: any) => {
                    if (!node) return;
                    if (Array.isArray(node)) return node.forEach(collect);
                    if (node["@graph"]) collect(node["@graph"]);
                    if (node["@type"]) [].concat(node["@type"]).forEach((t) => ldTypes.push(String(t)));
                };
                collect(json);
            } catch {
                ldValid = false;
            }
        }

        const indexable = !robots.includes("noindex");
        return {
            url,
            path: (() => { try { return new URL(url).pathname || "/"; } catch { return url; } })(),
            title, titleLen: title.length,
            description, descLen: description.length,
            canonical: !!canonical,
            indexable, viewport, h1, ogTitle, ogImage,
            imgs: imgs.length, imgsNoAlt, internalLinks, words,
            ldTypes: [...new Set(ldTypes)], ldValid: ldCount === 0 ? true : ldValid, ldCount,
        };
    }

    /** Crawl homepage + top GSC pages, parse on-page SEO. Cached per workspace.
     *  Returns a heterogeneous object shape (SeoCacheResult), as before the cache
     *  refactor, so downstream consumers keep their prior structural typing. */
    async crawl(workspaceId: string, force = false): Promise<SeoCacheResult> {
        if (!force) {
            const cached = await this.cache.get<SeoCacheResult>(this.crawlKey(workspaceId));
            if (cached) return cached;
        }

        const site = await this.siteUrlFor(workspaceId);
        if (!site) return { hasData: false, reason: "no-site" };
        let host: string;
        try {
            host = new URL(site).hostname;
        } catch {
            return { hasData: false, reason: "bad-site" };
        }

        const pageMap = await this.gscDimension(workspaceId, "page");
        const topPages = [...pageMap.entries()]
            .sort((a, b) => b[1].impressions - a[1].impressions)
            .map(([u]) => u)
            .filter((u) => {
                try {
                    return new URL(u).hostname === host; // SSRF guard: same-host only
                } catch {
                    return false;
                }
            });
        const urls = [...new Set([site, ...topPages])].slice(0, 8);

        const [fetched, files] = await Promise.all([
            Promise.all(urls.map((u) => this.fetchHtml(u))),
            this.rootFiles(site),
        ]);
        const pages = fetched.filter((f) => f.html).map((f) => this.parsePage(f.url, f.html));
        const reachable = fetched.filter((f) => f.ok).length;

        if (pages.length === 0) {
            const data = { hasData: false, reason: "unreachable", crawled: urls.length, reachable };
            await this.cache.set(this.crawlKey(workspaceId), data, this.CRAWL_TTL_S);
            return data;
        }

        // Per-check failure aggregation → AuditIssue list.
        type Check = { id: string; title: string; severity: "critical" | "warning" | "notice"; fixable: boolean; fails: (p: any) => boolean; cat: string };
        const checks: Check[] = [
            { id: "noindex", title: "Pages blocked from indexing (noindex)", severity: "critical", fixable: false, cat: "crawl", fails: (p) => !p.indexable },
            { id: "canonical", title: "Missing canonical tag", severity: "warning", fixable: true, cat: "crawl", fails: (p) => !p.canonical },
            { id: "title-missing", title: "Missing page title", severity: "critical", fixable: true, cat: "onpage", fails: (p) => p.titleLen === 0 },
            { id: "title-len", title: "Title length outside 30–60 chars", severity: "warning", fixable: true, cat: "onpage", fails: (p) => p.titleLen > 0 && (p.titleLen < 30 || p.titleLen > 60) },
            { id: "desc-missing", title: "Missing meta description", severity: "warning", fixable: true, cat: "onpage", fails: (p) => p.descLen === 0 },
            { id: "desc-len", title: "Meta description outside 70–160 chars", severity: "notice", fixable: true, cat: "onpage", fails: (p) => p.descLen > 0 && (p.descLen < 70 || p.descLen > 160) },
            { id: "h1", title: "Page should have exactly one H1", severity: "warning", fixable: true, cat: "onpage", fails: (p) => p.h1 !== 1 },
            { id: "thin", title: "Thin content (under 300 words)", severity: "notice", fixable: false, cat: "onpage", fails: (p) => p.words < 300 },
            { id: "alt", title: "Images missing alt text", severity: "warning", fixable: true, cat: "links", fails: (p) => p.imgsNoAlt > 0 },
            { id: "schema", title: "No structured data (JSON-LD)", severity: "notice", fixable: true, cat: "links", fails: (p) => p.ldTypes.length === 0 },
            { id: "og", title: "Missing Open Graph tags", severity: "notice", fixable: true, cat: "links", fails: (p) => !p.ogTitle || !p.ogImage },
            { id: "viewport", title: "Missing mobile viewport", severity: "critical", fixable: true, cat: "crawl", fails: (p) => !p.viewport },
        ];

        const issuesFor = (cat: string) =>
            checks
                .filter((c) => c.cat === cat)
                .map((c) => ({ id: c.id, title: c.title, severity: c.severity, pages: pages.filter(c.fails).length, fixable: c.fixable }))
                .filter((i) => i.pages > 0);

        const catScore = (cat: string) => {
            const cs = checks.filter((c) => c.cat === cat);
            if (!cs.length) return 100;
            const passRate = cs.reduce((acc, c) => acc + pages.filter((p) => !c.fails(p)).length / pages.length, 0) / cs.length;
            return Math.round(passRate * 100);
        };

        const categories = [
            { id: "crawl", name: "Crawlability & Indexing", icon: "search", score: catScore("crawl"), issues: issuesFor("crawl") },
            { id: "onpage", name: "On-page & Content", icon: "document", score: catScore("onpage"), issues: issuesFor("onpage") },
            { id: "links", name: "Structure & Markup", icon: "link", score: catScore("links"), issues: issuesFor("links") },
        ];
        const overall = Math.round(categories.reduce((a, c) => a + c.score, 0) / categories.length);
        const quickFixes = checks.filter((c) => c.fixable).reduce((acc, c) => acc + pages.filter(c.fails).length, 0);

        const metaRows = pages.map((p, i) => ({
            id: `mt_${i}`,
            path: p.path,
            title: p.title || "(none)",
            titleLen: p.titleLen,
            descLen: p.descLen,
            schema: p.ldTypes.length ? p.ldTypes.join(" + ") : "—",
            issues: [
                p.titleLen === 0 ? "No title" : p.titleLen < 30 ? "Title too short" : p.titleLen > 60 ? "Title too long" : null,
                p.descLen === 0 ? "No description" : p.descLen < 70 ? "Description too short" : p.descLen > 160 ? "Description too long" : null,
                p.h1 !== 1 ? `${p.h1} H1 tags` : null,
            ].filter(Boolean),
        }));

        const RICH = ["BlogPosting", "Article", "FAQPage", "Product", "Recipe", "HowTo", "Event", "Review", "BreadcrumbList"];
        const jsonLdRows = pages.map((p, i) => ({
            id: `ld_${i}`,
            path: p.path,
            type: p.ldTypes.length ? p.ldTypes.join(" + ") : "—",
            valid: p.ldValid,
            richResult: p.ldTypes.some((t) => RICH.includes(t)),
        }));

        const indexablePages = pages.filter((p) => p.indexable).length;
        const withSchema = pages.filter((p) => p.ldTypes.length > 0).length;
        const mobileOk = pages.filter((p) => p.viewport).length;
        const schemaTypes = [...new Set(pages.flatMap((p) => p.ldTypes))];
        const siteChecks = [
            { id: "indexing", label: "Indexing", icon: "search", value: `${indexablePages} of ${pages.length} pages`, score: Math.round((indexablePages / pages.length) * 100) },
            { id: "mobile", label: "Mobile usability", icon: "chart", value: mobileOk === pages.length ? "No issues found" : `${pages.length - mobileOk} pages affected`, score: Math.round((mobileOk / pages.length) * 100) },
            { id: "schema", label: "Structured data", icon: "document", value: `${schemaTypes.length} types deployed`, score: Math.round((withSchema / pages.length) * 100) },
        ];

        // Real coverage tiles (replaces the old sample "Search Console coverage" card).
        const withCanonical = pages.filter((p) => p.canonical).length;
        const withSocial = pages.filter((p) => p.ogTitle && p.ogImage).length;
        const thin = pages.filter((p) => p.words < 300).length;
        const tone = (ok: boolean) => (ok ? "good" : "warning");
        const coverage = [
            { id: "indexable", count: indexablePages, type: "Indexable pages", status: indexablePages === pages.length ? "good" : "error" },
            { id: "canonical", count: withCanonical, type: "With canonical tag", status: tone(withCanonical === pages.length) },
            { id: "schema", count: withSchema, type: "With structured data", status: tone(withSchema > 0) },
            { id: "noschema", count: pages.length - withSchema, type: "Missing schema", status: tone(pages.length - withSchema === 0) },
            { id: "social", count: withSocial, type: "With social tags", status: tone(withSocial === pages.length) },
            { id: "thin", count: thin, type: "Thin content pages", status: tone(thin === 0) },
        ];

        const data = {
            hasData: true,
            site,
            crawledAt: new Date().toISOString(),
            crawled: pages.length,
            overall,
            quickFixes,
            categories,
            metaRows,
            jsonLdRows,
            siteChecks,
            coverage,
            files, // robots.txt / sitemap.xml / llms.txt presence + signals
        };
        await this.cache.set(this.crawlKey(workspaceId), data, this.CRAWL_TTL_S);
        return data;
    }

    /** Core Web Vitals via PageSpeed Insights. Uses the connected API key when present (higher quota).
     *  Returns a heterogeneous object shape (SeoCacheResult), as before the cache refactor. */
    async vitals(workspaceId: string, force = false): Promise<SeoCacheResult> {
        const site = await this.siteUrlFor(workspaceId);
        if (!site) return { hasData: false, reason: "no-site" };

        if (!force) {
            const cached = await this.cache.get<SeoCacheResult>(this.vitalsKey(workspaceId));
            if (cached) return cached;
        }

        const key = await this.connectorKey(workspaceId, "pagespeed");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        try {
            const res = await fetch(
                `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&url=${encodeURIComponent(site)}${key ? `&key=${key}` : ""}`,
                { signal: controller.signal },
            );
            if (!res.ok) return { hasData: false, reason: `psi-${res.status}`, needsKey: res.status === 429 && !key };
            const data = (await res.json()) as any;
            const cruxMetrics = data?.loadingExperience?.metrics ?? {};
            const lh = data?.lighthouseResult?.audits ?? {};

            const fromCrux = (key: string) => cruxMetrics?.[key]?.percentile;
            const lcpMs = fromCrux("LARGEST_CONTENTFUL_PAINT_MS") ?? Math.round((lh["largest-contentful-paint"]?.numericValue ?? 0));
            const inpMs = fromCrux("INTERACTION_TO_NEXT_PAINT") ?? Math.round((lh["interactive"]?.numericValue ?? 0));
            const clsRaw = fromCrux("CUMULATIVE_LAYOUT_SHIFT_SCORE");
            const cls = clsRaw != null ? clsRaw / 100 : lh["cumulative-layout-shift"]?.numericValue ?? 0;
            const source = Object.keys(cruxMetrics).length ? "field" : "lab";

            const vitals = [
                { metric: "LCP", value: `${round(lcpMs / 1000, 1)}s`, target: "< 2.5s", status: lcpMs <= 2500 ? "good" : lcpMs <= 4000 ? "warning" : "poor" },
                { metric: "INP", value: `${Math.round(inpMs)}ms`, target: "< 200ms", status: inpMs <= 200 ? "good" : inpMs <= 500 ? "warning" : "poor" },
                { metric: "CLS", value: `${round(cls, 2)}`, target: "< 0.1", status: cls <= 0.1 ? "good" : cls <= 0.25 ? "warning" : "poor" },
            ];

            // Lighthouse improvement opportunities (same response, no extra call).
            // Map each Lighthouse audit id to our codebook code; flag when its score is low.
            const OPP_MAP: { audits: string[]; code: string }[] = [
                { audits: ["render-blocking-resources"], code: "PERF_RENDER_BLOCKING" },
                { audits: ["uses-optimized-images", "modern-image-formats", "offscreen-images", "uses-responsive-images"], code: "PERF_IMAGE_OPT" },
                { audits: ["unminified-css", "unminified-javascript", "unused-css-rules", "unused-javascript"], code: "PERF_UNMINIFIED" },
                { audits: ["uses-text-compression"], code: "PERF_TEXT_COMPRESSION" },
                { audits: ["total-byte-weight"], code: "PERF_TOTAL_WEIGHT" },
            ];
            const seen = new Set<string>();
            const opportunities: { code: string; title: string; savingsMs: number }[] = [];
            for (const { audits, code } of OPP_MAP) {
                if (seen.has(code)) continue;
                let savings = 0;
                let title = "";
                for (const a of audits) {
                    const audit = lh[a];
                    if (!audit) continue;
                    const score = typeof audit.score === "number" ? audit.score : 1;
                    const ms = audit.details?.overallSavingsMs ?? audit.numericValue ?? 0;
                    if (score < 0.9 && (ms > 0 || code === "PERF_UNMINIFIED" || code === "PERF_TEXT_COMPRESSION")) {
                        savings = Math.max(savings, Math.round(ms));
                        title = title || (audit.title ?? "");
                    }
                }
                if (title) { opportunities.push({ code, title, savingsMs: savings }); seen.add(code); }
            }

            const out = { hasData: true, source, vitals, opportunities };
            await this.cache.set(this.vitalsKey(workspaceId), out, this.VITALS_TTL_S);
            return out;
        } catch (e) {
            this.logger.warn(`PSI vitals failed: ${e instanceof Error ? e.message : e}`);
            return { hasData: false, reason: "psi-error" };
        } finally {
            clearTimeout(timer);
        }
    }

    // ─── BYO-key SEO connectors (PageSpeed, keyword data) ───────────────────

    private async connectorIntegration(workspaceId: string, provider: ConnectorProvider) {
        return this.prisma.integration.findFirst({ where: { workspaceId, type: IntegrationType.SEO_TOOL, provider } });
    }
    private async connectorKey(workspaceId: string, provider: ConnectorProvider) {
        const i = await this.connectorIntegration(workspaceId, provider);
        return i?.encryptedSecret ? decryptSecret(i.encryptedSecret) : "";
    }

    /** Status of the optional SEO data connectors (for the settings UI). */
    async connectors(workspaceId: string) {
        const rows = await this.prisma.integration.findMany({ where: { workspaceId, type: IntegrationType.SEO_TOOL } });
        const find = (p: string) => rows.find((r) => r.provider === p);
        const ps = find("pagespeed");
        const kw = find("keyword_data");
        const aeo = find("aeo_analytics");
        const bl = find("backlinks");
        return {
            pagespeed: { connected: !!ps },
            keyword: { connected: !!kw, config: (kw?.config ?? null) as any },
            aeo: { connected: !!aeo, config: (aeo?.config ?? null) as any },
            backlinks: { connected: !!bl, config: (bl?.config ?? null) as any },
        };
    }

    /** Connect / re-connect a BYO-key SEO data provider. */
    async connectConnector(
        workspaceId: string,
        userId: string,
        provider: ConnectorProvider,
        input: { key?: string; login?: string; password?: string; baseUrl?: string; preset?: string; fieldMap?: any },
    ) {
        let secret = input.key ?? "";
        if ((provider === "keyword_data" || provider === "backlinks") && (input.preset === "dataforseo" || (input.login && input.password))) {
            // DataForSEO uses HTTP Basic login:password.
            secret = Buffer.from(`${input.login ?? ""}:${input.password ?? ""}`).toString("base64");
        }
        if (!secret) throw new BadRequestException("A key (or login + password) is required.");
        const usesBaseUrl = provider === "keyword_data" || provider === "aeo_analytics" || provider === "backlinks";
        const config = usesBaseUrl
            ? { preset: input.preset ?? "custom", baseUrl: input.baseUrl ?? "", fieldMap: input.fieldMap ?? null }
            : {};
        const label =
            provider === "pagespeed"
                ? "PageSpeed Insights"
                : provider === "keyword_data"
                  ? "Keyword data"
                  : provider === "backlinks"
                    ? "Backlinks data"
                    : "AEO analytics";
        const existing = await this.connectorIntegration(workspaceId, provider);
        const data = {
            type: IntegrationType.SEO_TOOL,
            provider,
            label,
            config,
            encryptedSecret: encryptSecret(secret),
            status: "CONNECTED" as const,
            lastCheckedAt: new Date(),
            createdById: userId,
        };
        const saved = existing
            ? await this.prisma.integration.update({ where: { id: existing.id }, data })
            : await this.prisma.integration.create({ data: { workspaceId, ...data } });
        return { ok: true, id: saved.id };
    }

    async disconnectConnector(workspaceId: string, provider: ConnectorProvider) {
        const i = await this.connectorIntegration(workspaceId, provider);
        if (i) await this.prisma.integration.delete({ where: { id: i.id } });
        return { ok: true };
    }

    /**
     * Keyword volume/difficulty via the connected provider. Generic by design:
     * a DataForSEO preset, plus a "custom" mode (base URL + JSON field map).
     */
    async keywordResearch(workspaceId: string, terms: string[]) {
        const integ = await this.connectorIntegration(workspaceId, "keyword_data");
        if (!integ) return { hasData: false, reason: "not-connected", keywords: [] };
        const secret = integ.encryptedSecret ? decryptSecret(integ.encryptedSecret) : "";
        const cfg = (integ.config ?? {}) as { preset?: string; baseUrl?: string; fieldMap?: any };
        const clean = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 50);
        if (!clean.length) return { hasData: true, keywords: [] };

        try {
            if (cfg.preset === "dataforseo") {
                const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
                    method: "POST",
                    headers: { Authorization: `Basic ${secret}`, "Content-Type": "application/json" },
                    body: JSON.stringify([{ keywords: clean, location_code: 2840, language_code: "en" }]),
                });
                const data = (await res.json().catch(() => null)) as any;
                if (!res.ok) throw new Error(data?.status_message ?? `DataForSEO HTTP ${res.status}`);
                const items = data?.tasks?.[0]?.result ?? [];
                const keywords = items.map((r: any) => ({
                    keyword: r.keyword,
                    volume: r.search_volume ?? 0,
                    difficulty: r.competition_index ?? null,
                    cpc: r.cpc ?? null,
                }));
                return { hasData: true, keywords };
            }
            if (cfg.preset === "serper") {
                // Serper is a SERP API → keyword IDEAS (related + people-also-ask), not volume.
                const ideas = new Set<string>();
                const perTerm = await Promise.all(
                    clean.slice(0, 10).map(async (q) => {
                        const res = await fetch("https://google.serper.dev/search", {
                            method: "POST",
                            headers: { "X-API-KEY": secret, "Content-Type": "application/json" },
                            body: JSON.stringify({ q }),
                        });
                        if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
                        return (await res.json().catch(() => null)) as any;
                    }),
                );
                for (const d of perTerm) {
                    (d?.relatedSearches ?? []).forEach((r: any) => r?.query && ideas.add(String(r.query)));
                    (d?.peopleAlsoAsk ?? []).forEach((r: any) => r?.question && ideas.add(String(r.question)));
                }
                // Serper gives no volume/difficulty; return keyword ideas (volume null).
                const keywords = [...ideas].slice(0, 50).map((k) => ({ keyword: k, volume: null, difficulty: null, cpc: null }));
                return { hasData: true, kind: "ideas", keywords };
            }
            // Custom provider: GET baseUrl?keywords=... ; map fields via cfg.fieldMap.
            const url = `${(cfg.baseUrl ?? "").replace(/\/+$/, "")}?keywords=${encodeURIComponent(clean.join(","))}`;
            const res = await safeFetch(url, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} }, { timeoutMs: 10_000 });
            const data = (await res.json().catch(() => null)) as any;
            if (!res.ok) throw new Error(`Keyword API HTTP ${res.status}`);
            const map = cfg.fieldMap ?? { list: "results", keyword: "keyword", volume: "volume", difficulty: "difficulty" };
            const list: any[] = (map.list ? data?.[map.list] : data) ?? [];
            const keywords = list.map((r) => ({
                keyword: r[map.keyword],
                volume: Number(r[map.volume] ?? 0),
                difficulty: r[map.difficulty] ?? null,
                cpc: r[map.cpc] ?? null,
            }));
            return { hasData: true, keywords };
        } catch (e) {
            return { hasData: false, reason: e instanceof Error ? e.message : "lookup-failed", keywords: [] };
        }
    }

    // ─── AEO: AI-answer visibility probe (uses connected AI providers) ───────

    private readonly AEO_SEP = String.fromCharCode(1);

    /** Brand label from the homepage <title> (brand is usually the last segment) / domain. */
    private async aeoBrand(workspaceId: string) {
        const site = await this.siteUrlFor(workspaceId);
        let host = "";
        try {
            host = site ? new URL(site).hostname.replace(/^www\./, "") : "";
        } catch {
            host = "";
        }
        const crawl = await this.crawl(workspaceId).catch(() => null);
        const home = (crawl?.metaRows ?? []).find((m: any) => m.path === "/");
        const segs = (home?.title ?? "").split(/[|–•·»\-]/).map((s: string) => s.trim()).filter(Boolean);
        const brand = (segs.length ? segs[segs.length - 1] : "") || host.split(".")[0];
        return { host, brand };
    }

    /** Live AI-referral traffic per platform, from the GA4 source sync. */
    private async aeoReferral(workspaceId: string) {
        const rows = await this.prisma.metricSnapshot.findMany({ where: { workspaceId, source: "ga4", dimension: "ai_referral" } });
        return rows
            .map((r) => ({ platform: r.dimensionValue ?? "Unknown", sessions: Math.round(r.value) }))
            .filter((r) => r.sessions > 0)
            .sort((a, b) => b.sessions - a.sessions);
    }

    /**
     * Fetch AEO data from a connected dedicated provider (Profound/Peec/custom).
     * Expects a canonical JSON shape: { engines:[{name,share,citedQueries,totalQueries}],
     * matrix:[{query,cells:[{engine,timesCited,runs}]}], referral:[{platform,sessions}] }.
     * Returns null on any failure so we fall back to the probe.
     */
    private async fetchAeoProvider(workspaceId: string) {
        const integ = await this.connectorIntegration(workspaceId, "aeo_analytics");
        if (!integ) return null;
        const key = integ.encryptedSecret ? decryptSecret(integ.encryptedSecret) : "";
        const cfg = (integ.config ?? {}) as { baseUrl?: string };
        const site = await this.siteUrlFor(workspaceId);
        let host = "";
        try {
            host = site ? new URL(site).hostname.replace(/^www\./, "") : "";
        } catch {
            host = "";
        }
        if (!cfg.baseUrl) return { hasData: false, source: "provider", provider: integ.label, reason: "no-base-url" };
        try {
            const url = `${cfg.baseUrl.replace(/\/+$/, "")}?domain=${encodeURIComponent(host)}`;
            const res = await safeFetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} }, { timeoutMs: 10_000 });
            const data = (await res.json().catch(() => null)) as any;
            if (!res.ok || !data) return { hasData: false, source: "provider", provider: integ.label, reason: `provider-${res.status}` };
            return {
                hasData: true,
                source: "provider",
                provider: integ.label,
                brand: data.brand ?? host,
                engines: data.engines ?? [],
                matrix: data.matrix ?? [],
                referral: data.referral ?? (await this.aeoReferral(workspaceId)),
                score: data.score ?? 0,
            };
        } catch {
            return { hasData: false, source: "provider", provider: integ.label, reason: "provider-error" };
        }
    }

    /** Assemble the AEO view. Prefers a connected AEO analytics provider; else uses
     *  the persisted multi-engine probe history + GA4 referral. */
    async aeoGet(workspaceId: string) {
        // A dedicated AEO analytics provider, if connected, replaces the probe.
        const fromProvider = await this.fetchAeoProvider(workspaceId);
        if (fromProvider?.hasData) return fromProvider;

        const rows = await this.prisma.metricSnapshot.findMany({ where: { workspaceId, source: "aeo", dimension: "query_engine" } });
        const referral = await this.aeoReferral(workspaceId);
        if (rows.length === 0) {
            return { hasData: false, reason: fromProvider ? "provider-error" : "not-run", providerConnected: !!fromProvider, referral };
        }

        const pair = new Map<string, { query: string; engine: string; runs: number; timesCited: number }>();
        for (const r of rows) {
            const dv = r.dimensionValue ?? "";
            const i = dv.indexOf(this.AEO_SEP);
            if (i < 0) continue;
            const cur = pair.get(dv) ?? { query: dv.slice(0, i), engine: dv.slice(i + 1), runs: 0, timesCited: 0 };
            cur.runs += 1;
            cur.timesCited += r.value >= 1 ? 1 : 0;
            pair.set(dv, cur);
        }
        const queries = [...new Set([...pair.values()].map((p) => p.query))];
        const engines = [...new Set([...pair.values()].map((p) => p.engine))];
        const matrix = queries.map((query) => ({
            query,
            cells: engines.map((engine) => {
                const p = pair.get(`${query}${this.AEO_SEP}${engine}`);
                return { engine, runs: p?.runs ?? 0, timesCited: p?.timesCited ?? 0 };
            }),
        }));
        // Friendly platform names for the engines a connected provider represents.
        const PLATFORM: Record<string, string> = {
            openai: "ChatGPT",
            anthropic: "Claude",
            google: "Gemini",
            gemini: "Gemini",
            perplexity: "Perplexity",
            groq: "Groq",
            mistral: "Mistral",
            xai: "Grok",
            deepseek: "DeepSeek",
            cohere: "Cohere",
            openrouter: "OpenRouter",
        };
        const engineStats = engines.map((engine) => {
            const cells = [...pair.values()].filter((p) => p.engine === engine);
            const citedQueries = cells.filter((c) => c.timesCited > 0).length;
            const runs = Math.max(0, ...cells.map((c) => c.runs));
            return { id: engine, name: PLATFORM[engine] ?? engine, citedQueries, totalQueries: queries.length, runs, share: queries.length ? Math.round((citedQueries / queries.length) * 100) : 0 };
        });
        const score = engineStats.length ? Math.max(...engineStats.map((e) => e.share)) : 0;
        const { brand } = await this.aeoBrand(workspaceId);
        return { hasData: true, brand, engines: engineStats, matrix, referral, score };
    }

    /** Probe EVERY connected AI provider with the site's top queries; persist per
     *  (query, engine) so we accumulate "cited N of M runs" over time. */
    async aeoProbe(workspaceId: string, userId: string) {
        const { host, brand } = await this.aeoBrand(workspaceId);
        const queryMap = await this.gscDimension(workspaceId, "query");
        const prompts = [...queryMap.entries()].sort((a, b) => b[1].impressions - a[1].impressions).slice(0, 6).map(([q]) => q);
        if (!prompts.length || (!host && !brand)) return { hasData: false, reason: "no-data" };

        const providers = await this.prisma.integration.findMany({ where: { workspaceId, type: IntegrationType.AI_PROVIDER, status: "CONNECTED" } });
        if (!providers.length) return { hasData: false, reason: "no-provider" };

        const detect = (text: string) => {
            const t = text.toLowerCase();
            return (host && t.includes(host)) || (brand.length > 2 && t.includes(brand.toLowerCase()));
        };

        const now = new Date();
        const snapshots: any[] = [];
        for (const provider of providers) {
            for (const prompt of prompts) {
                let cited = false;
                try {
                    const res = await this.ai.generate(workspaceId, userId, {
                        feature: "seo.aeo_probe",
                        provider: provider.provider,
                        system: "You are a helpful assistant. Recommend specific businesses/brands and their websites for the user's query. Be concise.",
                        prompt: `Someone searches: "${prompt}". Which businesses or websites would you recommend, and why?`,
                        temperature: 0.5,
                        maxTokens: 400,
                    });
                    cited = detect(res.text);
                } catch {
                    cited = false;
                }
                snapshots.push({
                    workspaceId,
                    source: "aeo",
                    metric: "cited",
                    dimension: "query_engine",
                    dimensionValue: `${prompt}${this.AEO_SEP}${provider.provider}`,
                    value: cited ? 1 : 0,
                    date: now,
                });
            }
        }
        if (snapshots.length) await this.prisma.metricSnapshot.createMany({ data: snapshots });
        return this.aeoGet(workspaceId);
    }

    // ─── Generate site-root files (llms.txt / robots.txt / sitemap.xml) ─────

    /** Generate a recommended root file for review/copy/upload. sitemap+robots are
     *  deterministic; llms.txt is AI-written from the crawled pages. */
    async generateFile(workspaceId: string, userId: string, kind: "llms" | "robots" | "sitemap") {
        const site = await this.siteUrlFor(workspaceId);
        if (!site) return { ok: false, reason: "no-site" };
        const root = site.endsWith("/") ? site : `${site}/`;
        const crawl = await this.crawl(workspaceId).catch(() => null);
        const pages: { path: string; title: string }[] = (crawl?.metaRows ?? []).map((m: any) => ({ path: m.path, title: m.title }));
        const urls = [...new Set([root, ...pages.map((p) => `${root.replace(/\/$/, "")}${p.path}`)])];

        if (kind === "sitemap") {
            const body = urls.map((u) => `  <url>\n    <loc>${u}</loc>\n  </url>`).join("\n");
            const content = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
            return { ok: true, kind, filename: "sitemap.xml", content };
        }
        if (kind === "robots") {
            const content = `# robots.txt for ${root}\nUser-agent: *\nAllow: /\n\n# AI crawlers (allow citation in AI answers)\nUser-agent: GPTBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${root}sitemap.xml\n`;
            return { ok: true, kind, filename: "robots.txt", content };
        }
        // llms.txt — AI-written per the emerging spec (title, summary, key links).
        const list = pages.slice(0, 25).map((p) => `- ${p.path} — ${p.title}`).join("\n");
        const res = await this.ai.generate(workspaceId, userId, {
            feature: "seo.llms_txt",
            system: "You write llms.txt files (the emerging standard that tells AI assistants what a site is about). Output Markdown only: an H1 site name, a one-line '>' summary, then a '## Key pages' list of the most useful links as Markdown links with a short description each. No preamble, no code fences.",
            prompt: `Site root: ${root}\nPages (path — title):\n${list || "(homepage only)"}\n\nWrite the llms.txt for this site.`,
            temperature: 0.4,
            maxTokens: 700,
        });
        return { ok: true, kind, filename: "llms.txt", content: res.text.trim(), provider: res.provider, model: res.model };
    }
}
