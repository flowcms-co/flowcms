import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@flowcms/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AiService } from "../../ai/ai.service";
import { LicenseService } from "../../license/license.service";
import { chooseModel, NoProviderForTaskError, type RouteContext } from "../../ai/model-chooser";
import { tierForPlan, apiModelFor, type SeoTask } from "../../ai/model-tiers";
import { escalationTasks, type Finding } from "./audit-engine";
import { entryToPageInput } from "./parse-content";
import { SeoAuditService } from "./seo-audit.service";

const PAGE = "page";

/** Tasks the managed-content AI pass can act on (others need crawl/PSI/vision data). */
const HANDLED: SeoTask[] = ["meta_title_description", "schema_audit", "onpage_seo_audit"];

interface CompactSpec {
    feature: string;
    maxTokens: number;
    system: string;
    prompt: (i: ReturnType<typeof entryToPageInput>) => string;
}

/** Per-task COMPACT-output contracts: JSON-only, capped, minimal — the cheap output. */
const SPECS: Record<string, CompactSpec> = {
    meta_title_description: {
        feature: "seo.meta_fix",
        maxTokens: 120,
        system: 'Output ONLY minified JSON, no markdown, no prose: {"t":"<=60 char SEO title","d":"<=160 char meta description"}.',
        prompt: (i) => `Title: ${i.metaTitle ?? ""}\nKeyword: ${i.focusKeyword ?? "-"}\nExcerpt: ${(i.bodyText ?? "").slice(0, 400)}`,
    },
    schema_audit: {
        feature: "seo.schema_fix",
        maxTokens: 300,
        system: "Output ONLY a minified JSON-LD object (schema.org), no markdown, no prose.",
        prompt: (i) => `Type: ${(i.jsonLd?.[0] as { "@type"?: string })?.["@type"] ?? "Article"}\nTitle: ${i.metaTitle ?? ""}\nExcerpt: ${(i.bodyText ?? "").slice(0, 300)}`,
    },
    onpage_seo_audit: {
        feature: "ai.refresh",
        maxTokens: 160,
        system: 'Output ONLY minified JSON: {"s":["fix",...]} with up to 3 imperative fixes, each <=12 words. No prose.',
        prompt: (i) => `Title: ${i.metaTitle ?? ""}\nExcerpt: ${(i.bodyText ?? "").slice(0, 400)}\nThe content is thin or hard to read.`,
    },
};

export interface AiSuggestion {
    task: SeoTask;
    model: string; // routing id
    apiModel: string; // wire model
    provider: string;
    free: boolean;
    tokensIn: number;
    tokensOut: number;
    costUsd: number | null;
    output: unknown; // parsed compact JSON (or raw string if unparseable)
}

function parseCompact(text: string): unknown {
    const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
        return JSON.parse(t);
    } catch {
        return t; // keep raw if the model didn't return clean JSON
    }
}

@Injectable()
export class SeoAiExecutorService {
    private readonly logger = new Logger("SeoAiExecutor");

    constructor(
        private readonly prisma: PrismaService,
        private readonly ai: AiService,
        private readonly license: LicenseService,
        private readonly audit: SeoAuditService,
    ) {}

    private async routeContext(workspaceId: string): Promise<RouteContext> {
        const connected = await this.prisma.integration.findMany({
            where: { workspaceId, type: "AI_PROVIDER", status: "CONNECTED" },
            select: { provider: true },
        });
        return {
            connectedProviders: connected.map((c) => c.provider),
            quotaAvailable: await this.audit.quotaMap(workspaceId),
        };
    }

    /** Run a compact, cost-routed AI pass over one page's escalated findings.
     *  Review-first: stores suggestions in l2Findings; does NOT auto-apply. */
    async aiPassEntry(workspaceId: string, userId: string, entryId: string) {
        const [entry, row] = await Promise.all([
            this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId } }),
            this.prisma.pageAudit.findUnique({ where: { workspaceId_target_task: { workspaceId, target: entryId, task: PAGE } } }),
        ]);
        if (!entry) throw new NotFoundException("Entry not found.");
        if (!row) throw new NotFoundException("Run the deterministic audit first.");

        const input = entryToPageInput({ id: entry.id, slug: entry.slug, data: entry.data as Record<string, unknown> });
        const findings = (row.l1Findings as unknown as Finding[]) ?? [];
        const tasks = escalationTasks(findings).filter((t) => HANDLED.includes(t));

        const tier = tierForPlan((await this.license.info()).plan);
        const ctx = await this.routeContext(workspaceId);

        const suggestions: AiSuggestion[] = [];
        const skipped: { task: SeoTask; reason: string }[] = [];

        for (const task of tasks) {
            let chosen;
            try {
                chosen = chooseModel(task, tier, ctx).primary;
            } catch (e) {
                if (e instanceof NoProviderForTaskError) { skipped.push({ task, reason: "no connected provider" }); continue; }
                throw e;
            }
            const spec = SPECS[task];
            const apiModel = apiModelFor(chosen.id);
            try {
                const res = await this.ai.generate(workspaceId, userId, {
                    feature: spec.feature,
                    provider: chosen.provider,
                    model: apiModel,
                    system: spec.system,
                    prompt: spec.prompt(input),
                    maxTokens: spec.maxTokens,
                    temperature: 0.3,
                });
                const usage = (res as { usage?: { promptTokens?: number; completionTokens?: number; costUsd?: number | null } }).usage ?? {};
                if (chosen.free) await this.audit.recordModelUse(workspaceId, chosen.id);
                suggestions.push({
                    task,
                    model: chosen.id,
                    apiModel,
                    provider: chosen.provider,
                    free: chosen.free,
                    tokensIn: usage.promptTokens ?? 0,
                    tokensOut: usage.completionTokens ?? 0,
                    costUsd: usage.costUsd ?? null,
                    output: parseCompact((res as { text?: string }).text ?? ""),
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (/429|rate|quota/i.test(msg) && chosen.free) await this.audit.markExhausted(workspaceId, chosen.id);
                this.logger.warn(`AI pass ${task} failed: ${msg}`);
                skipped.push({ task, reason: msg.slice(0, 120) });
            }
        }

        await this.prisma.pageAudit.update({
            where: { workspaceId_target_task: { workspaceId, target: entryId, task: PAGE } },
            data: {
                l2Findings: suggestions as unknown as Prisma.InputJsonValue,
                lastAiPassAt: new Date(),
                hashAtAiPass: row.contentHash,
            },
        });

        const tokensOut = suggestions.reduce((s, x) => s + x.tokensOut, 0);
        const tokensIn = suggestions.reduce((s, x) => s + x.tokensIn, 0);
        return { entryId, suggestions, skipped, tokensIn, tokensOut };
    }
}
