import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { JWT } from "google-auth-library";
import { Integration, IntegrationType } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectAnalyticsDto } from "./dto";
import { buildOverview, SYNC_DAYS, type Snap } from "./analytics-math";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));

type ServiceAccount = { client_email?: string; private_key?: string };

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger("AnalyticsService");

    constructor(private readonly prisma: PrismaService) {}

    private meta(type: "gsc" | "ga4") {
        return type === "gsc"
            ? { provider: "gsc", itype: IntegrationType.SEARCH_CONSOLE, scope: GSC_SCOPE, name: "Search Console" }
            : { provider: "ga4", itype: IntegrationType.ANALYTICS, scope: GA4_SCOPE, name: "Google Analytics 4" };
    }

    private parseSA(credentials: string): ServiceAccount {
        try {
            const sa = JSON.parse(credentials) as ServiceAccount;
            if (!sa.client_email || !sa.private_key) throw new Error("missing fields");
            return sa;
        } catch {
            throw new BadRequestException("Invalid service-account JSON (need client_email + private_key).");
        }
    }

    private async accessToken(sa: ServiceAccount, scope: string): Promise<string> {
        const client = new JWT({ email: sa.client_email, key: sa.private_key, scopes: [scope] });
        const { token } = await client.getAccessToken();
        if (!token) throw new Error("Could not obtain an access token.");
        return token;
    }

    /** Connect status for the dashboard (which sources, last sync). */
    async status(workspaceId: string) {
        const [rows, counts] = await Promise.all([
            this.prisma.integration.findMany({
                where: { workspaceId, type: { in: [IntegrationType.SEARCH_CONSOLE, IntegrationType.ANALYTICS] } },
            }),
            this.prisma.metricSnapshot.groupBy({ by: ["source"], where: { workspaceId }, _count: { _all: true } }),
        ]);
        const map = (provider: string) => {
            const i = rows.find((r) => r.provider === provider);
            const stored = counts.find((c) => c.source === provider)?._count._all ?? 0;
            if (!i) return { connected: false, status: "DISCONNECTED" as const, lastSync: null, rows: stored, config: null };
            // lastCheckedAt also moves on connect, so the real sync time lives in config
            // (integrations synced before that was recorded fall back to lastCheckedAt).
            const at = (i.config as { lastSyncAt?: string } | null)?.lastSyncAt;
            const lastSync = at ? new Date(at) : stored > 0 ? i.lastCheckedAt : null;
            return { connected: i.status === "CONNECTED", status: i.status, lastSync, rows: stored, config: i.config };
        };
        return { gsc: map("gsc"), ga4: map("ga4") };
    }

    async connect(workspaceId: string, userId: string, dto: ConnectAnalyticsDto) {
        const m = this.meta(dto.type);
        const sa = this.parseSA(dto.credentials);
        if (dto.type === "gsc" && !dto.siteUrl) throw new BadRequestException("Search Console needs a site URL.");
        if (dto.type === "ga4" && !dto.propertyId) throw new BadRequestException("GA4 needs a property ID.");

        let status: Integration["status"] = "CONNECTED";
        let lastError: string | null = null;
        let found: string | null = null;
        let siteUrl = dto.siteUrl ?? null;
        try {
            // A token only proves the key is valid; read the property itself so a service
            // account that was never granted access doesn't end up "Connected".
            const token = await this.accessToken(sa, m.scope);
            if (dto.type === "gsc") {
                siteUrl = await this.findGscSite(token, dto.siteUrl!);
                found = `Search Console property ${siteUrl}`;
            } else {
                found = await this.verifyGa4(token, dto.propertyId!);
            }
        } catch (e) {
            status = "ERROR";
            lastError = e instanceof Error ? e.message : "Could not authenticate.";
        }

        const config = { siteUrl, propertyId: dto.propertyId ?? null, lastError };
        const existing = await this.prisma.integration.findFirst({ where: { workspaceId, provider: m.provider } });
        const data = {
            type: m.itype,
            provider: m.provider,
            label: dto.label || m.name,
            config,
            encryptedSecret: encryptSecret(dto.credentials),
            status,
            lastCheckedAt: new Date(),
            createdById: userId,
        };
        const saved = existing
            ? await this.prisma.integration.update({ where: { id: existing.id }, data })
            : await this.prisma.integration.create({ data: { workspaceId, ...data } });

        if (status !== "CONNECTED") return { ok: false, status, error: lastError, id: saved.id, found, rows: 0 };
        // Pull data straight away so the dashboard isn't empty until someone clicks "Sync now".
        const { results } = await this.sync(workspaceId, SYNC_DAYS, m.provider);
        const error = results[m.provider] === "ok" ? null : results[m.provider].replace(/^error: /, "");
        const rows = await this.prisma.metricSnapshot.count({ where: { workspaceId, source: m.provider } });
        return { ok: !error, status: error ? ("ERROR" as const) : status, error, id: saved.id, found, rows };
    }

    async disconnect(workspaceId: string, provider: "gsc" | "ga4") {
        await this.prisma.integration.deleteMany({ where: { workspaceId, provider } });
        return { ok: true };
    }

    /** Pull the last `days` of data from connected sources into MetricSnapshot. */
    async sync(workspaceId: string, days = SYNC_DAYS, only?: string) {
        const rows = await this.prisma.integration.findMany({
            where: { workspaceId, type: { in: [IntegrationType.SEARCH_CONSOLE, IntegrationType.ANALYTICS] }, ...(only ? { provider: only } : {}) },
        });
        if (rows.length === 0) throw new BadRequestException("Connect Search Console or Analytics first.");

        const results: Record<string, string> = {};
        for (const integ of rows) {
            try {
                // syncGsc returns the property string Google accepts (corrected if needed).
                const site = integ.provider === "gsc" ? await this.syncGsc(workspaceId, integ, days) : undefined;
                if (integ.provider === "ga4") await this.syncGa4(workspaceId, integ, days);
                const now = new Date();
                await this.prisma.integration.update({
                    where: { id: integ.id },
                    data: {
                        status: "CONNECTED",
                        lastCheckedAt: now,
                        config: { ...(integ.config as object), ...(site ? { siteUrl: site } : {}), lastError: null, lastSyncAt: now.toISOString() },
                    },
                });
                results[integ.provider] = "ok";
            } catch (e) {
                const msg = e instanceof Error ? e.message : "sync failed";
                this.logger.warn(`${integ.provider} sync failed: ${msg}`);
                await this.prisma.integration.update({
                    where: { id: integ.id },
                    data: { status: "ERROR", config: { ...(integ.config as object), lastError: msg } },
                });
                results[integ.provider] = `error: ${msg}`;
            }
        }
        return { results };
    }

    private async syncGsc(workspaceId: string, integ: Integration, days: number) {
        const sa = this.parseSA(decryptSecret(integ.encryptedSecret!));
        const token = await this.accessToken(sa, GSC_SCOPE);
        const config = (integ.config ?? {}) as { siteUrl?: string };
        if (!config.siteUrl) throw new Error("Missing site URL.");
        const site = await this.findGscSite(token, config.siteUrl);
        const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
        const startDate = daysAgo(days);
        const endDate = daysAgo(1);

        const query = async (dimensions: string[], rowLimit: number) => {
            const res = await fetch(base, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
            });
            const data = (await res.json().catch(() => null)) as { rows?: any[]; error?: { message?: string } } | null;
            if (!res.ok) throw new Error(data?.error?.message ?? `GSC HTTP ${res.status}`);
            return data?.rows ?? [];
        };

        const daily = await query(["date"], 1000);
        const queries = await query(["query"], 200);
        const pages = await query(["page"], 200);
        // query×page pairs power cannibalization detection (one query, many ranking URLs).
        const queryPages = await query(["query", "page"], 500);

        const at = new Date(endDate);
        // Each non-daily row expands into the 4 GSC metrics so Keywords / Cannibalization
        // get clicks + impressions + ctr + position, not just clicks.
        const metricsOf = (r: any, dimension: string, dimensionValue: string) =>
            [
                { metric: "clicks", value: r.clicks ?? 0 },
                { metric: "impressions", value: r.impressions ?? 0 },
                { metric: "ctr", value: (r.ctr ?? 0) * 100 },
                { metric: "position", value: r.position ?? 0 },
            ].map((s) => ({ workspaceId, source: "gsc", dimension, dimensionValue, date: at, ...s }));

        const snapshots = [
            ...daily.flatMap((r) => {
                const date = new Date(r.keys[0]);
                return [
                    { metric: "clicks", value: r.clicks ?? 0, date },
                    { metric: "impressions", value: r.impressions ?? 0, date },
                    { metric: "ctr", value: (r.ctr ?? 0) * 100, date },
                    { metric: "position", value: r.position ?? 0, date },
                ].map((s) => ({ workspaceId, source: "gsc", dimension: null, dimensionValue: null, ...s }));
            }),
            ...queries.flatMap((r) => metricsOf(r, "query", r.keys[0])),
            ...pages.flatMap((r) => metricsOf(r, "page", r.keys[0])),
            // query_page dimensionValue packs query + page as "QUERY\\u0001PAGE" (U+0001 never occurs in either).
            ...queryPages.flatMap((r) => metricsOf(r, "query_page", `${r.keys[0]}\u0001${r.keys[1]}`)),
        ];
        // Swap delete+insert atomically so a failure mid-write can't leave the
        // dashboard with zero GSC data until the next successful sync.
        await this.prisma.$transaction([
            this.prisma.metricSnapshot.deleteMany({ where: { workspaceId, source: "gsc" } }),
            ...(snapshots.length ? [this.prisma.metricSnapshot.createMany({ data: snapshots })] : []),
        ]);
        return site;
    }

    /**
     * Search Console is picky about the exact property string. Rather than make
     * the user guess between `https://site.com`, `https://site.com/`, and
     * `sc-domain:site.com`, we ask Google which properties this service account
     * can actually see and match by hostname. The caller persists the corrected form.
     */
    private async findGscSite(token: string, configured: string): Promise<string> {
        const res = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => null)) as {
            siteEntry?: { siteUrl: string; permissionLevel: string }[];
            error?: { message?: string };
        } | null;
        if (!res.ok) throw new Error(data?.error?.message ?? `GSC sites list HTTP ${res.status}`);

        const accessible = (data?.siteEntry ?? [])
            .filter((e) => e.permissionLevel && e.permissionLevel !== "siteUnverifiedUser")
            .map((e) => e.siteUrl);

        // Exact match — use as-is.
        if (accessible.includes(configured)) return configured;

        // Match by hostname across url-prefix / domain-property / scheme variants.
        const host = (s: string): string => {
            try {
                if (s.startsWith("sc-domain:")) return s.slice("sc-domain:".length).toLowerCase();
                return new URL(s.includes("://") ? s : `https://${s}`).hostname.toLowerCase();
            } catch {
                return s.toLowerCase();
            }
        };
        const target = host(configured);
        const match = accessible.find((u) => host(u) === target);
        if (!match) {
            throw new Error(
                accessible.length
                    ? `This service account can't access "${configured}". It has access to: ${accessible.join(", ")}. Set the Site URL to one of those exactly.`
                    : `This service account isn't added to any Search Console property yet. In Search Console → Settings → Users and permissions, add the service-account email as an Owner, then sync again.`,
            );
        }
        return match;
    }

    /** Read the GA4 property's metadata: 403s unless the service account was granted access. */
    private async verifyGa4(token: string, propertyId: string): Promise<string> {
        const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}/metadata`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            throw new Error(
                res.status === 403 || res.status === 404
                    ? `This service account can't read GA4 property ${propertyId}. In GA4 Admin, Property access management, add the service-account email as a Viewer, and check the property ID.`
                    : (data?.error?.message ?? `GA4 HTTP ${res.status}`),
            );
        }
        return `GA4 property ${propertyId}`;
    }

    private async syncGa4(workspaceId: string, integ: Integration, days: number) {
        const sa = this.parseSA(decryptSecret(integ.encryptedSecret!));
        const token = await this.accessToken(sa, GA4_SCOPE);
        const config = (integ.config ?? {}) as { propertyId?: string };
        const propertyId = config.propertyId;
        if (!propertyId) throw new Error("Missing property ID.");

        const runReport = async (body: object) => {
            const res = await fetch(
                `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            const data = (await res.json().catch(() => null)) as { rows?: any[]; error?: { message?: string } } | null;
            if (!res.ok) throw new Error(data?.error?.message ?? `GA4 HTTP ${res.status}`);
            return data?.rows ?? [];
        };

        const range = [{ startDate: daysAgo(days), endDate: "today" }];
        const daily = await runReport({
            dateRanges: range,
            dimensions: [{ name: "date" }],
            metrics: [{ name: "sessions" }, { name: "screenPageViews" }, { name: "bounceRate" }],
        });
        // Sessions by acquisition channel → powers the live Traffic-sources donut.
        const channels = await runReport({
            dateRanges: range,
            dimensions: [{ name: "sessionDefaultChannelGroup" }],
            metrics: [{ name: "sessions" }],
            limit: "10",
        });
        // Sessions by source → we map known AI-assistant referrers → AEO referral traffic.
        const sources = await runReport({
            dateRanges: range,
            dimensions: [{ name: "sessionSource" }],
            metrics: [{ name: "sessions" }],
            limit: "200",
        });

        // host substring → friendly AI platform name
        const AI_SOURCES: [string, string][] = [
            ["chatgpt", "ChatGPT"],
            ["openai", "ChatGPT"],
            ["perplexity", "Perplexity"],
            ["gemini.google", "Gemini"],
            ["bard.google", "Gemini"],
            ["copilot", "Copilot"],
            ["claude", "Claude"],
            ["you.com", "You.com"],
            ["poe.com", "Poe"],
            ["phind", "Phind"],
        ];
        const aiReferralAgg = new Map<string, number>();
        // Non-AI external referrers → referral_domain (powers the Backlinks card's
        // "referring domains by traffic" default, before any BYO backlink provider).
        const referralAgg = new Map<string, number>();
        const NON_REFERRAL = ["google", "bing", "duckduckgo", "yahoo", "yandex", "baidu", "ecosia", "(direct)", "(none)", "(not set)"];
        for (const r of sources) {
            const src = (r.dimensionValues?.[0]?.value ?? "").toLowerCase();
            const sessions = Number(r.metricValues?.[0]?.value ?? 0);
            const match = AI_SOURCES.find(([h]) => src.includes(h));
            if (match) {
                aiReferralAgg.set(match[1], (aiReferralAgg.get(match[1]) ?? 0) + sessions);
                continue;
            }
            // A real referring domain looks like a host (has a dot) and is not a search engine / direct.
            if (!src.includes(".") || NON_REFERRAL.some((s) => src.includes(s))) continue;
            const domain = src.replace(/^www\./, "");
            referralAgg.set(domain, (referralAgg.get(domain) ?? 0) + sessions);
        }

        const at = new Date(daysAgo(1));
        const snapshots = [
            ...daily.flatMap((r) => {
                const raw = r.dimensionValues?.[0]?.value ?? ""; // YYYYMMDD
                const date = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
                const [sessions, views, bounce] = (r.metricValues ?? []).map((m: { value?: string }) => Number(m.value ?? 0));
                return [
                    { metric: "sessions", value: sessions ?? 0, date },
                    { metric: "pageviews", value: views ?? 0, date },
                    { metric: "bounceRate", value: bounce ?? 0, date },
                ].map((s) => ({ workspaceId, source: "ga4", dimension: null, dimensionValue: null, ...s }));
            }),
            ...channels.map((r) => ({
                workspaceId,
                source: "ga4",
                metric: "sessions",
                dimension: "channel",
                dimensionValue: r.dimensionValues?.[0]?.value ?? "Unknown",
                value: Number(r.metricValues?.[0]?.value ?? 0),
                date: at,
            })),
            ...[...aiReferralAgg.entries()].map(([platform, sessions]) => ({
                workspaceId,
                source: "ga4",
                metric: "sessions",
                dimension: "ai_referral",
                dimensionValue: platform,
                value: sessions,
                date: at,
            })),
            ...[...referralAgg.entries()].map(([domain, sessions]) => ({
                workspaceId,
                source: "ga4",
                metric: "sessions",
                dimension: "referral_domain",
                dimensionValue: domain,
                value: sessions,
                date: at,
            })),
        ];
        // Swap delete+insert atomically so a failure mid-write can't leave the
        // dashboard with zero GA4 data until the next successful sync.
        await this.prisma.$transaction([
            this.prisma.metricSnapshot.deleteMany({ where: { workspaceId, source: "ga4" } }),
            ...(snapshots.length ? [this.prisma.metricSnapshot.createMany({ data: snapshots })] : []),
        ]);
    }

    /** Aggregated metrics for the dashboard: the last `days` and the equal period
     *  before it. Empty (hasData:false) until synced. */
    async overview(workspaceId: string, days = 30) {
        // A sync replaces every row for its source, so the table holds one sync's worth.
        const [snaps, status] = await Promise.all([
            this.prisma.metricSnapshot.findMany({ where: { workspaceId } }),
            this.status(workspaceId),
        ]);
        const connected = status.gsc.connected || status.ga4.connected;
        const built = buildOverview(snaps as Snap[], days);
        if (!built) return { connected, hasData: false, status, syncedDays: SYNC_DAYS };
        return { connected: true, hasData: true, status, days, syncedDays: SYNC_DAYS, ...built };
    }

    /** Workspaces with a Search Console or GA4 connection, for the daily sync. */
    async syncTargets() {
        return this.prisma.integration.findMany({
            where: { type: { in: [IntegrationType.SEARCH_CONSOLE, IntegrationType.ANALYTICS] } },
            select: { workspaceId: true, provider: true, config: true },
        });
    }
}
