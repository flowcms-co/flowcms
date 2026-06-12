import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LicenseService } from "../../license/license.service";
import type { AiBudgetPort, AiBudgetReservation } from "../../ai/ai-budget.port";

const FEATURE = "ai_budgets";
const WARN_AT = 0.8; // flag a warning once 80% of the cap is spent
// Conservative per-call hold placed BEFORE an AI call and released after it settles.
// It exists only to bound concurrent-burst overspend (F-17); the real cost is still
// recorded from the actual token usage. Override with AI_BUDGET_RESERVE_USD.
const RESERVE_USD = Number(process.env.AI_BUDGET_RESERVE_USD ?? 0.1);

/**
 * EE (Pro) — AI monthly spend caps. Month-to-date spend is the sum of
 * `UsageRecord.costUsd` since the 1st (UTC); the cap is `Workspace.aiMonthlyBudgetUsd`.
 * Implements `AiBudgetPort`, which the core AI gateway calls before every AI call.
 */
@Injectable()
export class AiBudgetsService implements AiBudgetPort {
    constructor(
        private readonly prisma: PrismaService,
        private readonly license: LicenseService,
    ) {}

    // In-flight reservations per workspace (USD), summed into the budget check so a
    // burst of concurrent calls can't all pass the same pre-spend read (F-17).
    // NOTE: process-local. A single-instance self-host (the common case) is fully
    // protected; a multi-instance cluster bounds overspend per instance — wire this
    // through Redis for cluster-wide accounting when running >1 instance.
    private readonly reserved = new Map<string, number>();

    private monthStart(): Date {
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }

    private nextMonthStart(): Date {
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    }

    private async spentThisMonth(workspaceId: string): Promise<number> {
        const agg = await this.prisma.usageRecord.aggregate({
            _sum: { costUsd: true },
            where: { workspaceId, createdAt: { gte: this.monthStart() } },
        });
        return Number(agg._sum.costUsd ?? 0);
    }

    private async getBudget(workspaceId: string): Promise<number | null> {
        const ws = await this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiMonthlyBudgetUsd: true },
        });
        return ws?.aiMonthlyBudgetUsd ?? null;
    }

    async setBudget(workspaceId: string, usd: number | null) {
        const value = usd != null && Number.isFinite(usd) && usd > 0 ? usd : null;
        await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { aiMonthlyBudgetUsd: value },
        });
        return this.status(workspaceId);
    }

    async status(workspaceId: string) {
        const [budgetUsd, spentRaw] = await Promise.all([
            this.getBudget(workspaceId),
            this.spentThisMonth(workspaceId),
        ]);
        const spentUsd = Math.round(spentRaw * 1e6) / 1e6;
        const remainingUsd = budgetUsd == null ? null : Math.round(Math.max(0, budgetUsd - spentUsd) * 1e6) / 1e6;
        const percent = budgetUsd && budgetUsd > 0 ? Math.min(999, Math.round((spentUsd / budgetUsd) * 100)) : 0;
        return {
            budgetUsd,
            spentUsd,
            remainingUsd,
            percent,
            overBudget: budgetUsd != null && spentUsd >= budgetUsd,
            warn: budgetUsd != null && spentUsd >= budgetUsd * WARN_AT,
            resetsAt: this.nextMonthStart().toISOString(),
        };
    }

    /** AiBudgetPort — reserve headroom before a core AI call (closes the F-17 race). */
    async reserve(workspaceId: string): Promise<AiBudgetReservation | null> {
        if (!(await this.license.has(FEATURE))) return null; // unlicensed → never enforce
        const budgetUsd = await this.getBudget(workspaceId);
        if (budgetUsd == null) return null; // no cap configured

        const spent = await this.spentThisMonth(workspaceId);
        // From here to the reserved.set() below there is NO await, so the check +
        // increment run atomically within this (single-threaded) process: a second
        // concurrent reserve() observes this one's hold and is rejected at the cap.
        const outstanding = this.reserved.get(workspaceId) ?? 0;
        if (spent + outstanding >= budgetUsd) {
            throw new HttpException(
                `Monthly AI budget reached ($${budgetUsd.toFixed(2)}). Raise it in AI → Usage, or wait for the reset on the 1st.`,
                HttpStatus.PAYMENT_REQUIRED,
            );
        }
        this.reserved.set(workspaceId, outstanding + RESERVE_USD);

        let released = false;
        return {
            release: async () => {
                if (released) return; // idempotent
                released = true;
                const next = (this.reserved.get(workspaceId) ?? 0) - RESERVE_USD;
                if (next > 1e-9) this.reserved.set(workspaceId, next);
                else this.reserved.delete(workspaceId);
            },
        };
    }
}
