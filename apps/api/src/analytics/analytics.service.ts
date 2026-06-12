import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { JWT } from "google-auth-library";
import { Integration, IntegrationType } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectAnalyticsDto } from "./dto";

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
        const rows = await this.prisma.integration.findMany({
            where: { workspaceId, type: { in: [IntegrationType.SEARCH_CONSOLE, IntegrationType.ANALYTICS] } },
        });
        const map = (provider: string) => {
            const i = rows.find((r) => r.provider === provider);
            return i
                ? { connected: i.status === "CONNECTED", status: i.status, lastSync: i.lastCheckedAt, config: i.config }
                : { connected: false, status: "DISCONNECTED" as const, lastSync: null, config: null };
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
        try {
            await this.accessToken(sa, m.scope); // validates the credentials
        } catch (e) {
            status = "ERROR";
            lastError = e instanceof Error ? e.message : "Could not authenticate.";
        }

        const config = { siteUrl: dto.siteUrl ?? null, propertyId: dto.propertyId ?? null, lastError };
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

        return { ok: status === "CONNECTED", status, error: lastError, id: saved.id };
    }

    async disconnect(workspaceId: string, provider: "gsc" | "ga4") {
        await this.prisma.integration.deleteMany({ where: { workspaceId, provider } });
        return { ok: true };
    }

    /** Pull the last `days` of data from connected sources into MetricSnapshot. */
    async sync(workspaceId: string, days = 90) {
        const rows = await this.prisma.integration.findMany({
            where: { workspaceId, type: { in: [IntegrationType.SEARCH_CONSOLE, IntegrationType.ANALYTICS] } },
        });
        if (rows.length === 0) throw new BadRequestException("Connect Search Console or Analytics first.");

        const results: Record<string, string> = {};
        for (const integ of rows) {
            try {
                if (integ.provider === "gsc") await this.syncGsc(workspaceId, integ, days);
                if (integ.provider === "ga4") await this.syncGa4(workspaceId, integ, days);
                await this.prisma.integration.update({
                    where: { id: integ.id },
                    data: { status: "CONNECTED", lastCheckedAt: new Date() },
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
        const site = await this.resolveGscSite(token, config.siteUrl, integ.id, config);
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
    }

    /**
     * Search Console is picky about the exact property string. Rather than make
     * the user guess between `https://site.com`, `https://site.com/`, and
     * `sc-domain:site.com`, we ask Google which properties this service account
     * can actually see and match by hostname — then persist the corrected form.
     */
    private async resolveGscSite(
        token: string,
        configured: string,
        integId: string,
        config: { siteUrl?: string },
    ): Promise<string> {
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

        // Persist the corrected form so future syncs skip this lookup.
        await this.prisma.integration.update({
            where: { id: integId },
            data: { config: { ...config, siteUrl: match } },
        });
        return match;
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

    /** Aggregated metrics for the dashboard. Empty (connected:false) until synced. */
    async overview(workspaceId: string, days = 30) {
        const since = new Date(Date.now() - days * 86_400_000);
        const snaps = await this.prisma.metricSnapshot.findMany({
            where: { workspaceId, date: { gte: since } },
            orderBy: { date: "asc" },
        });
        const status = await this.status(workspaceId);
        if (snaps.length === 0) {
            return { connected: status.gsc.connected || status.ga4.connected, hasData: false, status };
        }

        const daily = (source: string, metric: string) =>
            snaps
                .filter((s) => s.source === source && s.metric === metric && !s.dimension)
                .map((s) => ({ date: ymd(s.date), value: s.value }));
        const sum = (rows: { value: number }[]) => rows.reduce((a, b) => a + b.value, 0);
        const avg = (rows: { value: number }[]) => (rows.length ? sum(rows) / rows.length : 0);

        const clicks = daily("gsc", "clicks");
        const impressions = daily("gsc", "impressions");
        const sessions = daily("ga4", "sessions");
        const top = (dimension: string) =>
            snaps
                .filter((s) => s.source === "gsc" && s.dimension === dimension && s.metric === "clicks")
                .sort((a, b) => b.value - a.value)
                .slice(0, 10)
                .map((s) => ({ label: s.dimensionValue ?? "", clicks: s.value }));

        return {
            connected: true,
            hasData: true,
            status,
            totals: {
                clicks: sum(clicks),
                impressions: sum(impressions),
                ctr: avg(daily("gsc", "ctr")),
                position: avg(daily("gsc", "position")),
                sessions: sum(sessions),
            },
            series: { clicks, impressions, sessions },
            topQueries: top("query"),
            topPages: top("page"),
        };
    }
}
