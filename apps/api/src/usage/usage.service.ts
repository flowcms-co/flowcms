import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type Bucket = { key: string; label: string; calls: number; tokens: number; costUsd: number };

@Injectable()
export class UsageService {
    constructor(private readonly prisma: PrismaService) {}

    /** Workspace AI usage over the last N days: totals + breakdowns + daily series. */
    async summary(workspaceId: string, days = 30) {
        const since = new Date(Date.now() - days * 86_400_000);
        const records = await this.prisma.usageRecord.findMany({
            where: { workspaceId, createdAt: { gte: since } },
            select: {
                provider: true,
                feature: true,
                userId: true,
                totalTokens: true,
                costUsd: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20_000,
        });

        const byProvider = new Map<string, Bucket>();
        const byFeature = new Map<string, Bucket>();
        const byUser = new Map<string, Bucket>();
        const byDay = new Map<string, { calls: number; tokens: number }>();
        let calls = 0;
        let tokens = 0;
        let costUsd = 0;

        const bump = (map: Map<string, Bucket>, key: string, label: string, tk: number, cost: number) => {
            const b = map.get(key) ?? { key, label, calls: 0, tokens: 0, costUsd: 0 };
            b.calls += 1;
            b.tokens += tk;
            b.costUsd += cost;
            map.set(key, b);
        };

        for (const r of records) {
            const cost = r.costUsd ? Number(r.costUsd) : 0;
            calls += 1;
            tokens += r.totalTokens;
            costUsd += cost;
            bump(byProvider, r.provider, r.provider, r.totalTokens, cost);
            bump(byFeature, r.feature, r.feature, r.totalTokens, cost);
            bump(byUser, r.userId ?? "system", r.userId ?? "system", r.totalTokens, cost);
            const day = r.createdAt.toISOString().slice(0, 10);
            const d = byDay.get(day) ?? { calls: 0, tokens: 0 };
            d.calls += 1;
            d.tokens += r.totalTokens;
            byDay.set(day, d);
        }

        // Resolve user display names.
        const userIds = [...byUser.keys()].filter((k) => k !== "system");
        const users = userIds.length
            ? await this.prisma.user.findMany({
                  where: { id: { in: userIds } },
                  select: { id: true, name: true, email: true },
              })
            : [];
        const userLabel = (id: string) => {
            if (id === "system") return "System / API";
            const u = users.find((x) => x.id === id);
            return u ? (u.name ?? u.email) : "Unknown";
        };

        return {
            rangeDays: days,
            totals: { calls, tokens, costUsd },
            byProvider: [...byProvider.values()].sort((a, b) => b.tokens - a.tokens),
            byFeature: [...byFeature.values()].sort((a, b) => b.tokens - a.tokens),
            byUser: [...byUser.values()]
                .map((b) => ({ ...b, label: userLabel(b.key) }))
                .sort((a, b) => b.tokens - a.tokens),
            daily: [...byDay.entries()]
                .map(([date, v]) => ({ date, ...v }))
                .sort((a, b) => a.date.localeCompare(b.date)),
        };
    }
}
