import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LicenseService } from "../license/license.service";

/**
 * Heartbeat / telemetry sender. Every install POSTs to the vendor's ingest endpoint shortly
 * after boot, then twice daily: it refreshes fleet visibility (edition, version, usage) and,
 * for paid installs, re-mints the short-lived license token while the subscription is active.
 * That renewal loop is how pause / cancel / revoke actually take effect on the install.
 * Best-effort: a failed beat never affects the running app. Opt out with FLOWCMS_TELEMETRY=off.
 */
const FIRST_DELAY_MS = 30_000;
const INTERVAL_MS = 12 * 60 * 60 * 1000; // twice daily
const ADMIN_URL = (process.env.FLOWCMS_ADMIN_URL || "https://admin.flowcms.co").replace(/\/+$/, "");
const VERSION = (process.env.FLOWCMS_VERSION || "0.1.0").replace(/^v/, "");
const SITE_URL = (process.env.STUDIO_URL || "").replace(/\/+$/, ""); // this install's public origin

type HeartbeatResponse = { ok: true; latestVersion?: string; license?: { status: string; token?: string } };

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(TelemetryService.name);
    private timer: ReturnType<typeof setInterval> | null = null;
    private firstRun: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly license: LicenseService,
    ) {}

    onModuleInit() {
        if (process.env.FLOWCMS_TELEMETRY === "off") {
            this.log.log("Telemetry is off (FLOWCMS_TELEMETRY=off). License renewal also relies on this; paid installs should leave it on.");
            return;
        }
        this.firstRun = setTimeout(() => void this.beat(), FIRST_DELAY_MS);
        this.firstRun.unref?.();
        this.timer = setInterval(() => void this.beat(), INTERVAL_MS);
        this.timer.unref?.();
    }

    onModuleDestroy() {
        if (this.firstRun) clearTimeout(this.firstRun);
        if (this.timer) clearInterval(this.timer);
    }

    /** Stable per-install id — generated once and persisted; bound to the subscription at checkout. */
    async instanceId(): Promise<string> {
        const existing = await this.prisma.serverInstance.findUnique({ where: { id: "singleton" } }).catch(() => null);
        if (existing) return existing.instanceId;
        const row = await this.prisma.serverInstance.upsert({
            where: { id: "singleton" },
            create: { id: "singleton", instanceId: `inst_${randomUUID().replace(/-/g, "")}` },
            update: {},
        });
        return row.instanceId;
    }

    private async rawToken(): Promise<string | null> {
        const env = process.env.FLOWCMS_LICENSE_KEY?.trim();
        if (env) return env;
        const row = await this.prisma.license.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null);
        return row?.key?.trim() || null;
    }

    private async metrics() {
        try {
            const now = Date.now();
            const gte7 = new Date(now - 7 * 86_400_000);
            const gte30 = new Date(now - 30 * 86_400_000);
            // Active users = distinct users with a recently-seen session (lastSeenAt lives on Session).
            const distinctUsers = (since: Date) =>
                this.prisma.session.findMany({ where: { lastSeenAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }).then((r) => r.length);
            const [users, activeUsers7d, activeUsers30d, workspaces, entries] = await Promise.all([
                this.prisma.user.count(),
                distinctUsers(gte7),
                distinctUsers(gte30),
                this.prisma.workspace.count(),
                this.prisma.contentEntry.count(),
            ]);
            return { users, activeUsers7d, activeUsers30d, workspaces, entries };
        } catch {
            return {};
        }
    }

    /** Owner + organization details, so the vendor can reach the right person and brand emails. */
    private async profile() {
        try {
            const [owner, ws, org] = await Promise.all([
                this.prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, email: true } }),
                this.prisma.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, brandName: true } }),
                this.prisma.orgProfile.findUnique({ where: { id: "singleton" } }),
            ]);
            return {
                siteUrl: SITE_URL || undefined,
                owner: owner ? { name: owner.name ?? undefined, email: owner.email } : undefined,
                // The friendly workspace name from setup, reported distinctly so the vendor can
                // personalize the install-welcome email (company below is a broader legal/brand name).
                workspace: ws?.name || undefined,
                company: org?.legalName || ws?.brandName || ws?.name || undefined,
                org: org ? { legalName: org.legalName ?? undefined, addressLines: org.addressLines, taxId: org.taxId ?? undefined, billingEmail: org.billingEmail ?? undefined } : undefined,
            };
        } catch {
            return { siteUrl: SITE_URL || undefined };
        }
    }

    /** Send one heartbeat. Public so it can be triggered on demand (ops/debug). Never throws. */
    async beat(): Promise<{ ok: boolean; status?: string }> {
        try {
            const info = await this.license.info();
            const edition = info.plan === "pro" ? "pro" : info.plan === "enterprise" ? "enterprise" : "community";
            const body = {
                instanceId: await this.instanceId(),
                edition,
                version: VERSION,
                licenseToken: (await this.rawToken()) ?? undefined,
                metrics: await this.metrics(),
                ...(await this.profile()),
            };
            const res = await fetch(`${ADMIN_URL}/api/ingest/heartbeat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
                this.log.warn(`Heartbeat got HTTP ${res.status}.`);
                return { ok: false };
            }
            const data = (await res.json().catch(() => null)) as HeartbeatResponse | null;

            // Apply the license verdict (DB-stored installs only; an env-pinned token is managed by hand).
            if (!process.env.FLOWCMS_LICENSE_KEY && data?.license) {
                if (data.license.token) {
                    await this.license.setKey(data.license.token).catch(() => undefined); // renewal
                } else if (["revoked", "canceled", "expired"].includes(data.license.status)) {
                    await this.license.clear().catch(() => undefined); // entitlement ended
                }
            }
            this.log.log(`Heartbeat ok — edition ${edition}${data?.license ? `, license ${data.license.status}` : ""}.`);
            return { ok: true, status: data?.license?.status };
        } catch (e) {
            this.log.warn(`Heartbeat failed: ${(e as Error).message}`);
            return { ok: false };
        }
    }
}
