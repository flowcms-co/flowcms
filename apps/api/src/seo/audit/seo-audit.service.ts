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
    type LiveFacts,
    type RenderedFinding,
} from "./audit-engine";
import { lookupCode } from "./seo-codes";
import { entryToPageInput, type ParseContext } from "./parse-content";
import { SitePagesService, absoluteUrl, rankPages, type SitePage } from "../site-pages.service";
import { Stopped, isTransient, type Rate } from "../polite";
import { SAMPLE_SIZE, estimateSeconds, fetchOrder, inferLive, planRun, templateOf, type Action, type PlanRow, type RunMode, type Sampled } from "./audit-plan";
import { resolveTokens, str } from "./parse-content";
import { RULES_VERSION, expectsArticle, hasArticle, noindexFindings, rankSignal, toPaths, withRules } from "./indexing";
import { CacheService } from "../../cache/cache.service";
import { ContentEntriesService } from "../../content/content-entries.service";
import { altBackfillPatch, altLookupFrom, type AltLookup } from "../../content/alt-backfill";
import { entryToCanonicalContent } from "../../content/canonical-content";
import { fieldsOf } from "../../content/entry-validation";
import { mapLimit, psiReason } from "../seo-math";
import { buildIssues, type Coverage, type IssuePage, type PageRow, type SiteFinding } from "./audit-issues";
import { SeoService } from "../seo.service";
import { AssetsService } from "../../assets/assets.service";

/** Synthetic task scope for a full-page L1 audit row. */
const PAGE = "page";
/** Pages the pairwise duplicate-content check compares. */
const DUPLICATES_CAP = 400;
/** Extra passes over pages the site refused (429/5xx) before leaving them for later. */
const RETRY_ROUNDS = 3;

/** Why a row holds no verdict: the live page answered 429/5xx or not at all. */
export type NotChecked = { notChecked: "rate limited" | "server error" | "no response"; status: number };
type RunState = { done: number; total: number; startedAt: string; mode?: RunMode; paused?: boolean; /** Held until then: the site asked us to slow down. */ waitingUntil?: string | null };

/** The site stopped serving pages through the audit fetch prefix (a rotated key, a
 *  removed rule). The run stops rather than record every page as broken. */
export class PrefixRejected extends Error {
    constructor() {
        super("Audit fetch prefix is no longer accepted by the site");
    }
}
const notCheckedOf = (status: number): NotChecked => ({ status, notChecked: status === 429 ? "rate limited" : status === 0 ? "no response" : "server error" });

@Injectable()
export class SeoAuditService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly seo: SeoService,
        private readonly assets: AssetsService,
        private readonly sitePages: SitePagesService,
        private readonly cache: CacheService,
        private readonly entries: ContentEntriesService,
    ) {}

    private issuesKey(workspaceId: string) { return `seo:issues:${workspaceId}`; }
    private runKey(workspaceId: string) { return `seo:audit-run:${workspaceId}`; }

    /** The audit run in progress for this workspace, if any. */
    runState(workspaceId: string) {
        return this.cache.get<RunState>(this.runKey(workspaceId));
    }

    private ctlKey(workspaceId: string) { return `seo:audit-ctl:${workspaceId}`; }
    /** Ask the run in progress to pause, resume or stop. It obeys between pages. */
    async control(workspaceId: string, action: "pause" | "resume" | "cancel") {
        if (action === "resume") await this.cache.del(this.ctlKey(workspaceId));
        else await this.cache.set(this.ctlKey(workspaceId), action, 2 * 3600);
        const run = await this.runState(workspaceId);
        if (run) await this.cache.set(this.runKey(workspaceId), { ...run, paused: action === "pause" }, 2 * 3600);
        return { ok: true, run: await this.runState(workspaceId) };
    }
    /** Between pages: wait while paused; true when the run was cancelled. */
    private async stopRequested(workspaceId: string): Promise<boolean> {
        for (;;) {
            const ctl = await this.cache.get<string>(this.ctlKey(workspaceId));
            if (ctl !== "pause") return ctl === "cancel";
            await new Promise((r) => setTimeout(r, 2000));
        }
    }

    /** Rows written by the current rule set (or holding no verdict yet). Rows from
     *  an older version are never shown: they describe checks that no longer exist. */
    private readonly currentRows = { OR: [{ contentHash: { startsWith: `${RULES_VERSION}:` } }, { contentHash: "" }] };

    /** Asset-library alt text by image URL, for the workspace. */
    async altLookup(workspaceId: string): Promise<AltLookup> {
        const media = await this.prisma.media.findMany({ where: { workspaceId, alt: { not: null } }, select: { url: true, alt: true } });
        return altLookupFrom(media);
    }

    /** What the entry inherits from the entries it references (a city page takes
     *  its service's description and fills {City} in its title template): their
     *  titles by field name, and whether any of them carries a description. */
    private async parentContext(workspaceId: string, data: Record<string, unknown>): Promise<Pick<ParseContext, "refTitles" | "parentHasDescription">> {
        const byField = new Map<string, string>();
        for (const [k, v] of Object.entries(data)) {
            const id = Array.isArray(v) ? v[0] : v;
            if (typeof id === "string" && /^c[a-z0-9]{20,}$/.test(id)) byField.set(k.toLowerCase(), id);
        }
        if (!byField.size) return {};
        const refs = await this.prisma.contentEntry.findMany({ where: { workspaceId, id: { in: [...new Set(byField.values())] } }, select: { id: true, title: true, data: true } });
        const byId = new Map(refs.map((r) => [r.id, r]));
        const refTitles: Record<string, string> = {};
        let parentHasDescription = false;
        for (const [field, id] of byField) {
            const r = byId.get(id);
            if (!r) continue;
            if (r.title) refTitles[field] = r.title;
            const d = (r.data ?? {}) as Record<string, unknown>;
            if (String(d.metaDescription ?? d.summary ?? "").trim()) parentHasDescription = true;
        }
        return { refTitles, parentHasDescription };
    }

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

    /** Run L1 deterministic detectors on one page, upserting the ledger. The page's
     *  URL is its real site path; when the workspace has a site URL, the title,
     *  description, canonical and JSON-LD are read from the live page (a conditional
     *  request: a 304 keeps the stored facts). `pre.live` supplies the page facts
     *  instead of fetching: the stored ones when nothing the page is built from
     *  changed, or ones inferred from a sample of its type. An entry that is not a
     *  published page of a page type is not audited (and leaves the ledger). */
    async auditEntry(workspaceId: string, entryId: string, pre?: { page?: SitePage; site?: string | null; altFor?: AltLookup; rate?: Rate; live?: LiveFacts | null }) {
        const page = pre?.page ?? (await this.sitePages.pages(workspaceId, [entryId]))[0];
        if (!page) {
            const exists = await this.prisma.contentEntry.count({ where: { id: entryId, workspaceId } });
            if (!exists) throw new NotFoundException("Entry not found.");
            await this.prisma.pageAudit.deleteMany({ where: { workspaceId, target: entryId, task: PAGE } });
            return { skipped: true, notPage: true, findings: [] as Finding[] };
        }
        const site = pre ? (pre.site ?? null) : await this.sitePages.siteUrl(workspaceId);
        const altFor = pre?.altFor ?? (await this.altLookup(workspaceId));
        const where = { workspaceId_target_task: { workspaceId, target: entryId, task: PAGE } };
        const existing = await this.prisma.pageAudit.findUnique({ where });
        const stored = (existing?.live ?? null) as (LiveFacts & Partial<NotChecked>) | null;

        let live: LiveFacts | null = pre?.live ?? null;
        let fetchedAt: Date | undefined;
        if (site && pre?.live === undefined) {
            const rate = pre?.rate ?? (await this.sitePages.crawlRate(workspaceId));
            const got = await this.seo.livePage(absoluteUrl(site, page.path), rate, stored?.status === 200 && !stored.inferred ? { etag: stored.etag, lastModified: stored.lastModified } : undefined);
            if (isTransient(got.status)) {
                // The site said "not now" (429, 5xx, no response). That is not a fact about
                // the page: record no finding. A page with an earlier verdict keeps it
                // (it still shows when it was last fetched); a page with none is marked
                // "not checked", so it is never counted as checked or clean.
                if (!existing || !stored || stored.notChecked) {
                    const mark = notCheckedOf(got.status) as unknown as Prisma.InputJsonValue;
                    await this.prisma.pageAudit.upsert({ where, create: { workspaceId, target: entryId, entryId, task: PAGE, url: page.path, contentHash: "", live: mark }, update: { contentHash: "", live: mark } });
                    await this.cache.del(this.issuesKey(workspaceId));
                }
                return { skipped: false, notChecked: true as const, status: got.status, findings: [] as Finding[] };
            }
            // A page that used to load now 404s through the fetch prefix: before
            // believing it, make sure the prefix itself still works.
            if (rate.prefix && got.status === 404 && stored?.status === 200 && !(await this.seo.prefixAccepted(site, rate))) throw new PrefixRejected();
            // 304: unchanged since the stored copy, so its facts stand.
            live = got.status === 304 && stored?.status === 200 ? stored : got;
            fetchedAt = new Date();
        }
        // Entry fields only matter as a fallback, so only look up parents then.
        const parents = live?.status === 200 ? {} : await this.parentContext(workspaceId, page.data);

        const input = entryToPageInput({ id: page.id, slug: page.slug, title: page.title, data: page.data }, { path: page.path, altFor, hasSite: !!site, live, ...parents });
        const hash = withRules(contentHash(input));
        const liveJson = live ? (live as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
        // An inferred row has not been fetched, whatever was fetched before the template changed.
        const stamp = fetchedAt ? { fetchedAt } : live?.inferred ? { fetchedAt: null } : {};

        if (existing && existing.contentHash === hash) {
            // Nothing changed: keep the findings, record that it was checked (and
            // fetched) now. A run in progress shows only rows it has reached.
            await this.prisma.pageAudit.update({ where: { id: existing.id }, data: { lastCheckedAt: new Date(), live: liveJson, ...stamp } });
            return { skipped: true, fetched: !!fetchedAt, findings: existing.l1Findings as unknown as Finding[] };
        }

        const findings = auditPage(input);
        const severity = findings.reduce((m, f) => Math.max(m, f.severity), 0);
        const escalated = escalationTasks(findings).length > 0;
        const data = {
            contentHash: hash,
            url: page.path,
            live: liveJson,
            l1Findings: findings as unknown as Prisma.InputJsonValue,
            severity,
            escalated,
            lastCheckedAt: new Date(),
            ...stamp,
        };
        await this.prisma.pageAudit.upsert({ where, create: { workspaceId, target: entryId, entryId, task: PAGE, ...data }, update: data });
        await this.cache.del(this.issuesKey(workspaceId));
        return { skipped: false, fetched: !!fetchedAt, findings, severity, escalated };
    }

    /** What a run would do, without doing it: which pages it fetches, which it
     *  re-checks from stored facts, and which it fills in from a sample. */
    private async planFor(workspaceId: string, mode: RunMode) {
        const [pages, site, rows] = await Promise.all([
            this.sitePages.pages(workspaceId),
            this.sitePages.siteUrl(workspaceId),
            this.prisma.pageAudit.findMany({ where: { workspaceId, task: PAGE }, select: { target: true, fetchedAt: true, live: true } }),
        ]);
        const rowById = new Map<string, PlanRow & { live: (LiveFacts & Partial<NotChecked>) | null }>(
            rows.map((r) => {
                const live = (r.live ?? null) as (LiveFacts & Partial<NotChecked>) | null;
                return [r.target, { fetchedAt: r.fetchedAt, noindex: !!live?.noindex, notChecked: !!live?.notChecked, inferred: !!live?.inferred, live }];
            }),
        );
        // The site's own change signal. One or a few requests, only when there is something to compare with.
        const lastmod = site && mode === "changed" && rows.some((r) => r.fetchedAt) ? await this.seo.sitemapLastmod(site).catch(() => new Map<string, Date>()) : undefined;
        const actions = planRun(pages, rowById, { mode, lastmod, hasSite: !!site });
        return { pages, site, rowById, actions };
    }

    /** Before a run: how many pages it will fetch and roughly how long that takes
     *  at the current rate (it speeds up if the site allows, slows if it objects). */
    async plan(workspaceId: string, mode: RunMode = "changed") {
        const { pages, site, actions } = await this.planFor(workspaceId, mode);
        const count = (a: Action) => [...actions.values()].filter((x) => x === a).length;
        const rate = await this.sitePages.crawlRate(workspaceId);
        const rps = site ? this.seo.currentRate(site, rate) : rate.start;
        const toFetch = count("fetch");
        return { mode, total: pages.length, toFetch, reuse: count("reuse"), sampled: count("infer"), rps, maxRps: rate.max, estimatedSeconds: estimateSeconds(toFetch, rps), live: !!site };
    }

    /**
     * Audit the workspace's pages (the "Run audit" job).
     *
     * `changed` (the default) fetches only pages whose inputs changed since their
     * last fetch: the entry, an entry it references, its content type or a
     * component it uses, or a newer sitemap lastmod. Every other page is re-checked
     * from its stored page facts with no request. `full` fetches every page.
     * `sample` (a site deploy) treats every page as changed.
     *
     * A page type with more than 200 pages to fetch is checked by a rotating sample
     * of 50. If the sample agrees on the template (JSON-LD types, canonical, robots),
     * the other pages are filled in from it and labelled as inferred; if it does
     * not, every page of that type is fetched.
     *
     * Pages are fetched in order of what can rank: indexable pages by search
     * impressions, then other indexable pages, then noindexed pages. Requests go
     * through the adaptive rate gate; pages the site refuses with 429/5xx get no
     * findings, are retried once the site allows, and any still refused are left
     * for the next run. The run can be paused or cancelled between pages.
     */
    async auditWorkspace(workspaceId: string, onProgress?: (p: { done: number; total: number; notChecked: number; failed: number; waitingSeconds?: number }) => Promise<void> | void, mode: RunMode = "changed") {
        const { pages, site, rowById, actions } = await this.planFor(workspaceId, mode);
        const [altFor, baseRate, impressions] = await Promise.all([this.altLookup(workspaceId), this.sitePages.crawlRate(workspaceId), this.seo.impressionsByPath(workspaceId).catch(() => new Map<string, number>())]);
        // A wait at the rate gate (the site asked us to slow down) gives up within a
        // second when the run is cancelled.
        const rate: Rate = { ...baseRate, stop: async () => (await this.cache.get<string>(this.ctlKey(workspaceId))) === "cancel" };
        await this.prisma.pageAudit.deleteMany({ where: { workspaceId, task: PAGE, target: { notIn: pages.map((p) => p.id) } } });
        const of = (a: Action) => pages.filter((p) => actions.get(p.id) === a);
        let toFetch = fetchOrder(of("fetch"), rowById, impressions);
        const toInfer = of("infer");

        const startedAt = new Date().toISOString();
        let total = toFetch.length;
        let done = 0;
        let lastSaved = -1;
        const saveRun = async (force = false) => {
            // Visible to every request (and instance): "Audit in progress, N of M".
            if (!force && done - lastSaved < 5 && done !== total) return;
            lastSaved = done;
            const paused = (await this.cache.get<string>(this.ctlKey(workspaceId))) === "pause";
            const waitingUntil = site ? this.seo.pausedUntil(site, rate)?.toISOString() ?? null : null;
            await this.cache.set(this.runKey(workspaceId), { done, total, startedAt, mode, paused, waitingUntil } satisfies RunState, 2 * 3600);
        };
        await this.cache.del(this.ctlKey(workspaceId));
        // With a fetch prefix, make sure the site still accepts it before asking
        // for a thousand pages through it.
        if (site && rate.prefix && toFetch.length && !(await this.seo.prefixAccepted(site, rate))) throw new PrefixRejected();
        await saveRun(true);

        const c = { changed: 0, unchanged: 0, escalated: 0, failed: 0, fetched: 0, reused: 0, inferred: 0 };
        const tally = (r: Awaited<ReturnType<SeoAuditService["auditEntry"]>> | null) => {
            if (!r) c.failed++;
            else if (r.skipped) c.unchanged++;
            else {
                c.changed++;
                if ("escalated" in r && r.escalated) c.escalated++;
            }
        };

        // 1. Pages with nothing new to fetch: re-run the checks on stored facts. No
        //    requests, so these are current within seconds.
        // ponytail: one read and one write per page; batch them if runs over ~100k pages drag.
        for (const page of of("reuse")) {
            const live = site ? rowById.get(page.id)?.live ?? null : null;
            tally(await this.auditEntry(workspaceId, page.id, { page, site, altFor, rate, live }).catch(() => null));
            c.reused++;
        }

        // 2. Fetch, most important pages first, retrying what the site refused.
        let cancelled = false;
        let rejected = false;
        const fetchAll = async (list: SitePage[]) => {
            let queue = list;
            for (let round = 0; queue.length && round <= RETRY_ROUNDS && !cancelled; round++) {
                const refused: SitePage[] = [];
                // The gate sets the pace; a few in flight lets a fast site be used.
                await mapLimit(queue, 6, async (page) => {
                    if (cancelled || (cancelled = await this.stopRequested(workspaceId))) return;
                    const r = await this.auditEntry(workspaceId, page.id, { page, site, altFor, rate }).catch((e) => {
                        // Cancelled while waiting for the site, or the fetch prefix stopped
                        // working: stop the run. Neither says anything about this page.
                        if (e instanceof Stopped || e instanceof PrefixRejected) cancelled = true;
                        if (e instanceof PrefixRejected) rejected = true;
                        return e instanceof Stopped || e instanceof PrefixRejected ? undefined : null;
                    });
                    if (r === undefined) return;
                    if (r && "notChecked" in r && r.notChecked) {
                        // Refused by the site's rate limit: retried, never a failed page.
                        refused.push(page);
                        const until = site ? this.seo.pausedUntil(site, rate) : null;
                        await saveRun(true);
                        await onProgress?.({ done, total, notChecked: refused.length, failed: c.failed, waitingSeconds: until ? Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)) : undefined });
                        return;
                    }
                    tally(r);
                    if (r) c.fetched++;
                    done++;
                    await saveRun();
                    await onProgress?.({ done, total, notChecked: refused.length, failed: c.failed });
                });
                queue = refused;
            }
            return cancelled ? 0 : queue.length;
        };
        let notChecked = await fetchAll(toFetch);

        // 3. Sampled types: fill the rest in from the sample when it agrees; fetch
        //    them all when it does not.
        const escalatedTypes: string[] = [];
        const byType = new Map<string, SitePage[]>();
        for (const p of toInfer) byType.set(p.typeId, [...(byType.get(p.typeId) ?? []), p]);
        const entryMeta = (p: SitePage) => ({ entryTitle: resolveTokens(str(p.data.metaTitle) || p.title, p.data), entryDescription: str(p.data.metaDescription) || str(p.data.summary) });
        for (const [typeId, rest] of byType) {
            if (cancelled) break;
            const sampleIds = toFetch.filter((p) => p.typeId === typeId).map((p) => p.id);
            const sampleRows = await this.prisma.pageAudit.findMany({ where: { workspaceId, task: PAGE, target: { in: sampleIds } }, select: { target: true, live: true, fetchedAt: true } });
            const pageById = new Map(toFetch.map((p) => [p.id, p]));
            const sample: Sampled[] = sampleRows
                .filter((r) => r.fetchedAt && r.fetchedAt.toISOString() >= startedAt)
                .map((r) => ({ live: r.live as unknown as LiveFacts, ...entryMeta(pageById.get(r.target)!) }));
            const template = sample.length >= Math.min(SAMPLE_SIZE, sampleIds.length) / 2 ? templateOf(sample) : null;
            if (!template) {
                // The sample disagrees (or mostly failed): it proves nothing about the
                // pages not fetched, so check every page of this type.
                escalatedTypes.push(typeId);
                total += rest.length;
                notChecked += await fetchAll(fetchOrder(rest, rowById, impressions));
                continue;
            }
            for (const page of rest) {
                const live = inferLive(template, { ...entryMeta(page), url: absoluteUrl(site!, page.path) }, { size: sample.length, total: sample.length + rest.length });
                tally(await this.auditEntry(workspaceId, page.id, { page, site, altFor, rate, live }).catch(() => null));
                c.inferred++;
            }
        }

        await onProgress?.({ done, total, notChecked, failed: c.failed });
        await this.cache.del(this.runKey(workspaceId));
        await this.cache.del(this.ctlKey(workspaceId));
        await this.cache.del(this.issuesKey(workspaceId));
        toFetch = [];
        if (rejected) throw new PrefixRejected();
        return { scanned: pages.length, checked: c.changed + c.unchanged, ...c, notChecked, cancelled, escalatedTypes, mode, live: !!site, rps: site ? this.seo.currentRate(site, rate) : null };
    }

    /** The site says these URLs changed (or that it was deployed): mark the pages
     *  so the next run fetches them. Returns how many pages matched. */
    async markChanged(workspaceId: string, urls: string[]): Promise<number> {
        const paths = toPaths(urls);
        if (!paths.length) return 0;
        const r = await this.prisma.pageAudit.updateMany({ where: { workspaceId, task: PAGE, url: { in: [...paths, ...paths.map((p) => `${p}/`)] } }, data: { fetchedAt: null } });
        await this.cache.del(this.issuesKey(workspaceId));
        return r.count;
    }

    /** Rolling background check: re-fetch the stalest pages, a few per tick, so every
     *  page is re-verified within the workspace's window with no one pressing a
     *  button. Pages never fetched (inferred from a sample) go first. */
    async recheckStalest(workspaceId: string, budget: number): Promise<number> {
        const site = await this.sitePages.siteUrl(workspaceId);
        if (!site || (await this.runState(workspaceId))) return 0;
        const cutoff = new Date(Date.now() - (await this.sitePages.recheckDays(workspaceId)) * 86_400_000);
        const rows = await this.prisma.pageAudit.findMany({
            where: { workspaceId, task: PAGE, OR: [{ fetchedAt: null }, { fetchedAt: { lt: cutoff } }] },
            orderBy: { fetchedAt: { sort: "asc", nulls: "first" } },
            select: { target: true },
            take: budget,
        });
        if (!rows.length) return 0;
        const [pages, altFor, rate] = await Promise.all([this.sitePages.pages(workspaceId, rows.map((r) => r.target)), this.altLookup(workspaceId), this.sitePages.crawlRate(workspaceId)]);
        let n = 0;
        for (const page of pages) {
            const r = await this.auditEntry(workspaceId, page.id, { page, site, altFor, rate }).catch(() => null);
            if (r && !("notChecked" in r && r.notChecked)) n++;
        }
        return n;
    }

    /** Rows written by an older rule set that already hold fetched page facts: run
     *  the current checks on those facts, no request. Keeps the Optimizer populated
     *  after an upgrade instead of empty until someone runs an audit. */
    async refreshOldRules(batch = 200): Promise<number> {
        const rows = await this.prisma.pageAudit.findMany({ where: { task: PAGE, fetchedAt: { not: null }, NOT: this.currentRows }, select: { workspaceId: true, target: true, live: true }, take: batch });
        const byWs = new Map<string, typeof rows>();
        for (const r of rows) byWs.set(r.workspaceId, [...(byWs.get(r.workspaceId) ?? []), r]);
        for (const [ws, list] of byWs) {
            const [pages, site, altFor] = await Promise.all([this.sitePages.pages(ws, list.map((r) => r.target)), this.sitePages.siteUrl(ws), this.altLookup(ws)]);
            const liveById = new Map(list.map((r) => [r.target, r.live as unknown as LiveFacts]));
            const found = new Set(pages.map((p) => p.id));
            for (const page of pages) await this.auditEntry(ws, page.id, { page, site, altFor, live: site ? liveById.get(page.id) ?? null : null }).catch(() => null);
            // Entries that are no longer pages have nothing to refresh.
            await this.prisma.pageAudit.deleteMany({ where: { workspaceId: ws, task: PAGE, target: { in: list.map((r) => r.target).filter((id) => !found.has(id)) } } });
        }
        return rows.length;
    }

    /** Rendered findings per page for the UI (codes -> readable): every audited
     *  page, in a stable order (worst first, then by id). Callers that show a list
     *  page through it; counts are always taken over the whole set. */
    async list(workspaceId: string, page?: { limit: number; offset: number }) {
        const rows = await this.prisma.pageAudit.findMany({
            where: { workspaceId, task: PAGE, ...this.currentRows },
            orderBy: [{ severity: "desc" }, { target: "asc" }],
            ...(page ? { take: page.limit, skip: page.offset } : {}),
        });
        const titles = new Map<string, string>();
        const ids = rows.map((r) => r.entryId).filter((x): x is string => !!x);
        if (ids.length) {
            const entries = await this.prisma.contentEntry.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
            for (const e of entries) titles.set(e.id, e.title ?? "Untitled");
        }
        return rows.map((r) => {
            const findings = (r.l1Findings as unknown as Finding[]) ?? [];
            const rendered = findings.map(renderFinding).filter((x): x is RenderedFinding => !!x);
            return {
                entryId: r.entryId,
                // The page's real site path, stored by the audit (entryPath).
                url: r.url,
                title: r.entryId ? (titles.get(r.entryId) ?? null) : r.url,
                severity: r.severity,
                escalated: r.escalated,
                lastCheckedAt: r.lastCheckedAt,
                live: (r.live ?? null) as LiveFacts | null,
                notChecked: !!(r.live as NotChecked | null)?.notChecked,
                // When the live page was last requested, and whether its facts were
                // filled in from a sample of its type instead.
                fetchedAt: r.fetchedAt,
                inferred: ((r.live ?? null) as LiveFacts | null)?.inferred ?? null,
                findings: rendered,
            };
        });
    }

    /** The unified, grouped issue set the AI Optimizer (and Dashboard) render.
     *  Page-scope findings come from the L1 ledger; site-scope findings (AI readiness,
     *  FAQ/Org schema, cannibalization, internal links, Core Web Vitals, Search Console)
     *  are composed on read from the existing deterministic services. */
    async issues(workspaceId: string) {
        // Composed from every audited page, so cache it briefly; a re-audit or a
        // dismissed finding clears it.
        return this.cache.wrap(this.issuesKey(workspaceId), 120, () => this.buildIssueSet(workspaceId));
    }

    private async buildIssueSet(workspaceId: string) {
        const [rows, score, crawl, vitals, cannib, links, summary, ws] = await Promise.all([
            this.list(workspaceId),
            this.seo.score(workspaceId).catch(() => ({ score: null as number | null })),
            this.seo.crawl(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["crawl"]>>),
            this.seo.vitals(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["vitals"]>>),
            this.seo.cannibalization(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["cannibalization"]>>),
            this.seo.internalLinks(workspaceId).catch(() => ({ opportunities: [], pages: 0, total: 0 }) as Awaited<ReturnType<SeoService["internalLinks"]>>),
            this.seo.summary(workspaceId).catch(() => ({ hasData: false }) as Awaited<ReturnType<SeoService["summary"]>>),
            this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { jsonLdOrg: true, ignoredFindings: true } }),
        ]);

        // --- published pages, at their real paths, and what marks a page as one that
        // should be found in search (sitemap, navigation, search impressions) ---
        const published = await this.sitePages.pages(workspaceId);
        const pageById = new Map(published.map((p) => [p.id, p]));
        const siteUrl = await this.sitePages.siteUrl(workspaceId);
        const impressions = await this.seo.impressionsByPath(workspaceId).catch(() => new Map<string, number>());
        const signals = { sitemap: new Set<string>(crawl.sitemapPaths ?? []), nav: new Set<string>(crawl.navPaths ?? []), impressions };

        // While an audit runs, only rows it has already re-checked are shown; the
        // rest are from the previous audit and would read as current.
        const run = await this.runState(workspaceId);
        const fresh = run ? rows.filter((r) => r.lastCheckedAt.toISOString() >= run.startedAt) : rows;

        // Findings the user permanently dismissed: "CODE" (whole issue) or "CODE:entryId" (one page).
        const ignored = new Set(ws?.ignoredFindings ?? []);
        // Pages the site tells search engines to skip. A noindexed page cannot rank,
        // so it is left out of the ranking checks (title, description, readability,
        // schema, cannibalization, duplicates) and counted separately. Its noindex is
        // only raised when the site contradicts it and the type does not intend it.
        const noindexed = new Set<string>();
        const pageRows: PageRow[] = fresh.map((r) => {
            let findings = r.notChecked ? [] : r.findings;
            if (r.entryId && findings.some((f) => f.code === "TECH_NOINDEX")) {
                noindexed.add(r.entryId);
                const intended = pageById.get(r.entryId)?.noindexIntended;
                findings = noindexFindings(findings, intended ? null : rankSignal(r.url, signals));
            }
            return {
                entryId: r.entryId,
                url: r.url,
                title: r.title,
                notChecked: r.notChecked,
                inferred: !!r.inferred,
                fetchedAt: r.fetchedAt,
                // Internal linking is opportunity-driven and computed below, so drop the
                // page-scope version to avoid double-counting; also drop ignored findings.
                // "No structured data" stays: it means the page has no JSON-LD at all.
                findings: findings.filter((f) => f.code !== "INTERNAL_LINKS_FEW" && !ignored.has(f.code) && !ignored.has(`${f.code}:${r.entryId}`)),
            };
        });
        const indexable = published.filter((p) => !noindexed.has(p.id));
        const noindexedPaths = new Set(published.filter((p) => noindexed.has(p.id)).map((p) => p.path));

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

        // --- indexable pages (schema, cannibalization, duplicate detection): all of
        // them; not a 300-entry sample of every type ---
        const liveById = new Map(rows.map((r) => [r.entryId, r.live]));
        const entryMeta = indexable.map((e) => {
            const d = e.data;
            const title = e.title;
            const fk = typeof d.focusKeyword === "string" ? d.focusKeyword.trim().toLowerCase() : "";
            const input = entryToPageInput({ id: e.id, slug: e.slug, data: d });
            const live = liveById.get(e.id);
            const ok = live?.status === 200;
            return { id: e.id, title, focusKeyword: fk, url: e.path, text: input.bodyText ?? "", metaTitle: ok ? live.title : input.metaTitle ?? "", metaDescription: ok ? live.description : input.metaDescription ?? "" };
        });

        // --- schema opportunities by type (Article / FAQ / Organization / Service) ---
        // Per page, recommend the schema types it should have but is missing. Article
        // is expected only on article pages (the content type says so), and a page
        // with no JSON-LD at all is already reported as "No structured data".
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
        for (const e of indexable) {
            const d = e.data;
            const slug = (e.slug ?? "").toLowerCase();
            const url = e.path;
            const title = e.title;
            // The frontend renders the JSON-LD on a headless site, so the live page
            // says which types exist. With a site URL but no readable page, don't guess.
            const live = liveById.get(e.id);
            if (siteUrl && live?.status !== 200) continue;
            const have = live?.status === 200 ? new Set(live.ldTypes.map((t) => t.toLowerCase())) : schemaTypesOf(d);
            const text = textById.get(e.id) ?? "";
            const hay = `${slug} ${title.toLowerCase()}`;
            const isHome = url === "/" || slug === "home";
            const isOrgPage = isHome || /^(about|contact|team|company|careers)/.test(slug);
            const isService = /(service|pricing|solution|capabilit|what-we-do|offering|package)/.test(hay);
            const looksFaq = /\bfaq\b|frequently asked/.test(hay) || (text.match(/\?/g) || []).length >= 3;
            if (expectsArticle({ pageType: e.pageType, jsonLd: e.typeJsonLd }) && have.size > 0 && !hasArticle(have))
                schemaPages.article.push({ id: e.id, url, title, schemaType: "Article", priority: /\/blog\//.test(url) ? "high" : "med" });
            if (looksFaq && !have.has("faqpage"))
                schemaPages.faq.push({ id: e.id, url, title, schemaType: "FAQ", priority: "med" });
            if (isOrgPage && !hasGlobalOrg && !have.has("organization"))
                schemaPages.org.push({ id: e.id, url, title, schemaType: "Organization", priority: isHome ? "high" : "med" });
            if (isService && !have.has("service"))
                schemaPages.service.push({ id: e.id, url, title, schemaType: "Service", priority: "med" });
        }
        if (schemaPages.article.length) push(this.siteFinding("SCHEMA_ARTICLE_MISSING", { count: schemaPages.article.length, pages: schemaPages.article }));
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
            for (const g of cannib.groups) {
                // Pages that cannot rank cannot compete for a query.
                const ranking = g.pages.filter((p) => !noindexedPaths.has(p.path.replace(/(.)\/+$/, "$1")));
                if (ranking.length >= 2) addConflict(g.keyword, ranking.map((p) => ({ id: null, url: p.path, title: p.path })));
            }
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
            const slugToId = new Map(published.map((e) => [e.path, e.id]));
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
            for (const v of vitals.vitals as { metric: string; status: string; value: string }[]) {
                const code =
                    v.metric === "LCP" ? (v.status === "poor" ? "CWV_LCP_POOR" : v.status === "warning" ? "CWV_LCP_WARN" : null)
                    : v.metric === "CLS" && v.status === "poor" ? "CWV_CLS_POOR"
                    : v.metric === "INP" && v.status === "poor" ? "CWV_INP_POOR"
                    : null;
                if (code) push(this.siteFinding(code, { values: { value: v.value } }));
            }
        } else if (vitals.reason !== "no-site" && vitals.reason !== "pending") {
            // No made-up numbers: say PageSpeed is unavailable, and why.
            push(this.siteFinding("PSI_UNAVAILABLE", { values: { reason: psiReason(vitals.reason, vitals.needsKey) } }));
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
        // ponytail: pairwise comparison, so capped; a shingle index would lift that if
        // large sites need it. The pages compared are the most-seen ones (Search
        // Console impressions), else the newest, and the result carries how many of
        // the total were covered so a partial check never reads as "no duplicates".
        const by: Coverage["by"] = impressions.size ? "impressions" : "recency";
        const metaById0 = new Map(entryMeta.map((e) => [e.id, e]));
        const dupSet = rankPages(indexable, impressions).slice(0, DUPLICATES_CAP).map((p) => metaById0.get(p.id)!);
        const coverage = {
            duplicates: { checked: dupSet.length, total: indexable.length, capped: dupSet.length < indexable.length, by },
            links: { checked: links.pages ?? 0, total: (links as { total?: number }).total ?? links.pages ?? 0, capped: (links.pages ?? 0) < ((links as { total?: number }).total ?? 0), by },
        };
        const dups = detectDuplicatePages(dupSet.map((e) => ({ id: e.id, title: e.title, url: e.url ?? undefined, text: e.text })));
        if (dups.length) {
            const pages: IssuePage[] = dups.map((d) => ({
                id: d.id, url: d.url ?? null, title: d.title,
                detail: `${d.similarity}% overlaps "${d.otherTitle}"`,
                overlap: d.similarity, matchTitle: d.otherTitle, priority: d.similarity >= 80 ? "high" : "med",
            }));
            push(this.siteFinding("DUPLICATE_CONTENT", { count: dups.length, pages }));
        }

        const result = buildIssues(pageRows, site, score.score ?? null);
        result.coverage = coverage;
        for (const g of result.groups) {
            const c = g.key === "DUPLICATE_CONTENT" ? coverage.duplicates : g.key === "INTERNAL_LINKS_FEW" ? coverage.links : null;
            if (c) { g.checked = c.checked; g.total = c.total; }
        }
        result.nonPageTypes = await this.sitePages.nonPageTypes(workspaceId);
        // Informational, outside the issue total and the score.
        result.counts.noindexed = noindexed.size;
        result.run = run;
        // How fresh the picture is: the oldest live check, pages never fetched, and
        // how each sampled type was verified.
        const typeName = new Map((await this.sitePages.pageTypes(workspaceId)).map((t) => [t.id, t.name]));
        const perType = new Map<string, { verified: number; total: number }>();
        for (const r of fresh) {
            const typeId = r.entryId ? pageById.get(r.entryId)?.typeId : undefined;
            if (!typeId) continue;
            const t = perType.get(typeId) ?? { verified: 0, total: 0 };
            t.total++;
            if (r.fetchedAt) t.verified++;
            perType.set(typeId, t);
        }
        const fetchedTimes = fresh.map((r) => r.fetchedAt?.getTime()).filter((t): t is number => !!t);
        result.freshness = {
            live: !!siteUrl,
            oldestFetchedAt: fetchedTimes.length ? new Date(Math.min(...fetchedTimes)).toISOString() : null,
            neverFetched: siteUrl ? fresh.filter((r) => !r.fetchedAt && !r.notChecked).length : 0,
            recheckDays: await this.sitePages.recheckDays(workspaceId),
            sampledTypes: [...perType.entries()].filter(([, t]) => siteUrl && t.verified < t.total).map(([id, t]) => ({ name: typeName.get(id) ?? "Pages", ...t })),
        };
        // "No structured data": suggest the type the page's content type calls for.
        for (const g of result.groups) if (g.key === "SCHEMA_MISSING") for (const pg of g.pages) pg.schemaType = (pg.id ? pageById.get(pg.id)?.typeJsonLd : null) ?? "WebPage";

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
        await this.cache.del(this.issuesKey(workspaceId));
        return { ignored: [...set] };
    }

    /** Generate AI alt text for the page images that are missing it: the same image
     *  set the audit flags (rich text, sections and components, top-level image
     *  fields), not only <img> tags in `data.body`. Reuses the vision alt-gen per
     *  asset, which also saves the alt on the asset; review-first for the page. */
    async generatePageAlt(workspaceId: string, userId: string, entryId: string) {
        const uniq = (await this.missingAlt(workspaceId, entryId)).slice(0, 8);
        if (!uniq.length) return { suggestions: [], skipped: [], provider: undefined, model: undefined };

        const medias = await this.prisma.media.findMany({ where: { workspaceId }, select: { id: true, url: true } });
        const baseName = (u: string) => (u.split(/[?#]/)[0].split("/").pop() ?? u).toLowerCase();
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

    /** The page images with no alt text anywhere (own field, paired field, asset). */
    async missingAlt(workspaceId: string, entryId: string): Promise<string[]> {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId } });
        if (!entry) throw new NotFoundException("Entry not found.");
        const data = ((entry.status === "PUBLISHED" ? entry.draftData ?? entry.data : entry.data) ?? {}) as Record<string, unknown>;
        const images = entryToCanonicalContent({ data }, { altFor: await this.altLookup(workspaceId) }).images;
        return [...new Set(images.filter((i) => i.src && !i.alt?.trim()).map((i) => i.src))];
    }

    /** The entry values to change so the given alts land where the page keeps them:
     *  the paired alt field next to an image field, and <img> tags in rich text and
     *  the body. Empty when the page has no place to store them (the alt then lives
     *  on the asset, which the audit and the delivery API both read). */
    async altPatch(workspaceId: string, entryId: string, alts: { src: string; alt: string }[]) {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId }, include: { contentType: { select: { schema: true } } } });
        if (!entry) throw new NotFoundException("Entry not found.");
        const data = ((entry.status === "PUBLISHED" ? entry.draftData ?? entry.data : entry.data) ?? {}) as Record<string, unknown>;
        const altFor = altLookupFrom(alts.filter((a) => a.alt?.trim()).map((a) => ({ url: a.src, alt: a.alt })));
        return altBackfillPatch(fieldsOf(entry.contentType.schema), data, await this.entries.componentMap(workspaceId), altFor);
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
