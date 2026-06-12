import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { LicenseService } from "../../license/license.service";
import { tierForPlan } from "../../ai/model-tiers";
import { SeoAuditService } from "../../seo/audit/seo-audit.service";
import { SeoAiExecutorService } from "../../seo/audit/seo-ai-executor.service";

const PAGE = "page";
const TICK_MS = Number(process.env.SEO_SCHED_TICK_MS) || 15 * 60_000; // check schedules every 15 min
const FIRST_PASS_MS = 30_000;

/** Per-tier cadence defaults. Pro is fixed (daily incremental + weekly full);
 *  Enterprise uses the same defaults but every field is editable within floors. */
export interface ScanConfig {
    incrementalHours: number;
    fullHours: number;
    perRunCap: number;
}
const DEFAULTS: ScanConfig = { incrementalHours: 24, fullHours: 168, perRunCap: 50 };

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : dflt;
}

/**
 * EE (Pro+) — the SEO auto-scheduler (`seo_automation`). Turns the opt-in
 * "Automatic AI auditing" toggle into real scheduled work: on its cadence it runs
 * the L2 AI pass over each opted-in workspace's escalated + changed pages, bounded
 * by a per-run cap and the AI budget. The model chooser, deterministic L1 drip, and
 * manual AI runs stay Community; only the automatic cadence is gated here.
 *
 * The license is install-wide, so the whole scheduler is inert on Community
 * (tick returns at the gate). Pro = fixed cadence; Enterprise = editable cadence.
 */
@Injectable()
export class SeoAutomationService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger("SeoAutomation");
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly license: LicenseService,
        private readonly audit: SeoAuditService,
        private readonly executor: SeoAiExecutorService,
    ) {}

    onModuleInit() {
        if (process.env.SEO_SCHED_DISABLED === "1" || process.env.NODE_ENV === "test") return;
        setTimeout(() => void this.tick(), FIRST_PASS_MS);
        this.timer = setInterval(() => void this.tick(), TICK_MS);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    private async tier() {
        return tierForPlan((await this.license.info()).plan);
    }

    /** Effective cadence: Pro is fixed at defaults; Enterprise's stored overrides
     *  are clamped to safe floors/ceilings. */
    effectiveConfig(tier: number, stored: unknown): ScanConfig {
        if (tier >= 3 && stored && typeof stored === "object") {
            const s = stored as Record<string, unknown>;
            return {
                incrementalHours: clampInt(s.incrementalHours, 1, 720, DEFAULTS.incrementalHours),
                fullHours: clampInt(s.fullHours, 24, 2160, DEFAULTS.fullHours),
                perRunCap: clampInt(s.perRunCap, 1, 500, DEFAULTS.perRunCap),
            };
        }
        return { ...DEFAULTS };
    }

    /** GET payload for the studio's "Automatic AI auditing" card. */
    async getConfig(workspaceId: string) {
        const ws = await this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiScanEnabled: true, aiScanConfig: true, lastIncrementalScanAt: true, lastFullScanAt: true },
        });
        const tier = await this.tier();
        return {
            enabled: ws?.aiScanEnabled ?? false,
            tier,
            editable: tier >= 3, // only Enterprise can change the cadence
            config: this.effectiveConfig(tier, ws?.aiScanConfig),
            defaults: DEFAULTS,
            lastIncrementalScanAt: ws?.lastIncrementalScanAt ?? null,
            lastFullScanAt: ws?.lastFullScanAt ?? null,
        };
    }

    /** PUT: toggle opt-in + (Enterprise only) edit the cadence. */
    async setConfig(
        workspaceId: string,
        body: { enabled?: boolean; incrementalHours?: number; fullHours?: number; perRunCap?: number },
    ) {
        const tier = await this.tier();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = {};
        if (typeof body.enabled === "boolean") data.aiScanEnabled = body.enabled;
        const wantsConfig = body.incrementalHours != null || body.fullHours != null || body.perRunCap != null;
        if (wantsConfig && tier >= 3) {
            const current = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { aiScanConfig: true } });
            const merged = { ...(this.effectiveConfig(tier, current?.aiScanConfig)), ...stripUndefined(body) };
            data.aiScanConfig = this.effectiveConfig(tier, merged);
        }
        if (Object.keys(data).length) await this.prisma.workspace.update({ where: { id: workspaceId }, data });
        return this.getConfig(workspaceId);
    }

    /** Manual "Run now" (gated): force a full scheduled pass immediately. */
    async runNow(workspaceId: string) {
        const tier = await this.tier();
        const cfg = this.effectiveConfig(tier, (await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { aiScanConfig: true } }))?.aiScanConfig);
        const res = await this.runWorkspace(workspaceId, "full", cfg.perRunCap);
        await this.prisma.workspace.update({ where: { id: workspaceId }, data: { lastFullScanAt: new Date(), lastIncrementalScanAt: new Date() } });
        return { mode: "full" as const, ...res };
    }

    // --- scheduler ---

    async tick() {
        if (this.running) return;
        this.running = true;
        try {
            if (!(await this.license.has("seo_automation"))) return; // install-wide gate (Community no-op)
            // Single-flight across instances so two instances don't both pick the
            // same due workspace and double-spend the AI budget on the same scan.
            if (!(await this.redis.tryAcquire("sched:seo-automation", TICK_MS - 60_000))) return;
            const tier = await this.tier();
            const workspaces = await this.prisma.workspace.findMany({
                where: { aiScanEnabled: true },
                select: { id: true, aiScanConfig: true, lastIncrementalScanAt: true, lastFullScanAt: true },
            });
            for (const ws of workspaces) {
                try {
                    await this.maybeRun(ws, tier);
                } catch (e) {
                    this.logger.warn(`auto-scan ws=${ws.id} failed: ${e instanceof Error ? e.message : e}`);
                }
            }
        } finally {
            this.running = false;
        }
    }

    private async maybeRun(
        ws: { id: string; aiScanConfig: unknown; lastIncrementalScanAt: Date | null; lastFullScanAt: Date | null },
        tier: number,
    ) {
        const cfg = this.effectiveConfig(tier, ws.aiScanConfig);
        const now = Date.now();
        const fullDue = !ws.lastFullScanAt || now - ws.lastFullScanAt.getTime() >= cfg.fullHours * 3_600_000;
        const incrDue = !ws.lastIncrementalScanAt || now - ws.lastIncrementalScanAt.getTime() >= cfg.incrementalHours * 3_600_000;
        if (!fullDue && !incrDue) return;

        const mode: "full" | "incremental" = fullDue ? "full" : "incremental";
        const res = await this.runWorkspace(ws.id, mode, cfg.perRunCap);
        // Stamp regardless of how many pages were due, so it doesn't re-run every tick.
        await this.prisma.workspace.update({
            where: { id: ws.id },
            data: mode === "full" ? { lastFullScanAt: new Date(), lastIncrementalScanAt: new Date() } : { lastIncrementalScanAt: new Date() },
        });
        this.logger.log(
            `auto-scan ${mode} ws=${ws.id}: ${res.passed} page(s), ${res.tokensOut} output tokens` +
                (res.stoppedForBudget ? " (stopped: budget)" : ""),
        );
    }

    /** Run the L2 AI pass over a workspace's escalated + changed pages (bounded). */
    private async runWorkspace(workspaceId: string, mode: "full" | "incremental", cap: number) {
        // Scheduled usage is attributed to a workspace member (UsageRecord needs a user).
        const member = await this.prisma.membership.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { userId: true } });
        if (!member) return { passed: 0, tokensOut: 0, stoppedForBudget: false, scanned: 0 };

        // Full pass refreshes L1 first (so escalation is current); incremental trusts the drip.
        if (mode === "full") {
            try {
                await this.audit.auditWorkspace(workspaceId);
            } catch (e) {
                this.logger.warn(`auto-scan L1 refresh ws=${workspaceId} failed: ${e instanceof Error ? e.message : e}`);
            }
        }

        const rows = await this.prisma.pageAudit.findMany({
            where: { workspaceId, task: PAGE, escalated: true, NOT: { entryId: null } },
            select: { entryId: true, contentHash: true, hashAtAiPass: true, lastAiPassAt: true },
        });
        // Only pages never AI-passed, or whose content changed since the last pass (cost = 0 otherwise).
        const due = rows.filter((r) => r.entryId && (!r.lastAiPassAt || r.hashAtAiPass !== r.contentHash)).slice(0, cap);

        let passed = 0;
        let tokensOut = 0;
        let stoppedForBudget = false;
        for (const r of due) {
            try {
                const out = await this.executor.aiPassEntry(workspaceId, member.userId, r.entryId as string);
                passed++;
                tokensOut += out.tokensOut;
                if (out.suggestions.length === 0 && out.skipped.some((s) => /budget|402|payment|cap/i.test(s.reason))) {
                    stoppedForBudget = true;
                    break;
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (/402|budget|payment/i.test(msg)) {
                    stoppedForBudget = true;
                    break;
                }
                this.logger.warn(`auto-scan entry ${r.entryId} failed: ${msg}`);
            }
        }
        return { passed, tokensOut, stoppedForBudget, scanned: due.length };
    }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    return out;
}
