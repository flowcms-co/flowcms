import { BadRequestException, HttpException, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Integration } from "@flowcms/db";
import { decryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { safeFetch } from "../common/ssrf";
import { getProvider, type ProviderDef } from "../integrations/providers";
import { KnowledgeService } from "../knowledge/knowledge.service";
import { estimateCostUsd } from "./pricing";
import { GenerateDto } from "./dto";
import { AI_BUDGET_PORT, type AiBudgetPort } from "./ai-budget.port";
import { chooseModel, NoProviderForTaskError, taskForFeature, type ChosenModel, type RouteContext } from "./model-chooser";
import { apiModelFor, MODEL_REGISTRY, SEO_TASKS, tierForPlan, type ModelId, type SeoTask } from "./model-tiers";
import { LicenseService } from "../license/license.service";

type ChatResult = {
    text: string;
    promptTokens: number;
    completionTokens: number;
};

@Injectable()
export class AiService {
    private readonly logger = new Logger("AiService");

    constructor(
        private readonly prisma: PrismaService,
        private readonly knowledge: KnowledgeService,
        private readonly license: LicenseService,
        // Provided by the EE `ai_budgets` module when present; absent in Community.
        @Optional() @Inject(AI_BUDGET_PORT) private readonly budget?: AiBudgetPort,
    ) {}

    /** Build the workspace-knowledge system-prompt block for a given AI call. */
    private async knowledgeBlock(workspaceId: string, dto: GenerateDto): Promise<string> {
        const files = await this.knowledge.getApplicable(workspaceId, dto.feature, dto.contentTypeApiId);
        if (!files.length) return "";
        const body = files.map((f) => `## ${f.name}\n${f.content}`).join("\n\n---\n\n");
        return `# Workspace knowledge & guidelines\nFollow these unless the user's request overrides them.\n\n${body}`.slice(0, 8000);
    }

    /** Connected AI providers for this workspace (for tool model pickers). */
    async listConnected(workspaceId: string) {
        const rows = await this.prisma.integration.findMany({
            where: { workspaceId, type: "AI_PROVIDER" },
            orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        });
        return rows.map((i) => {
            const def = getProvider(i.provider);
            const config = (i.config ?? {}) as { defaultModel?: string };
            return {
                id: i.id,
                provider: i.provider,
                name: def?.name ?? i.provider,
                status: i.status,
                defaultModel: config.defaultModel ?? def?.defaultModel ?? null,
                suggestedModels: def?.suggestedModels ?? [],
            };
        });
    }

    /**
     * Transparency preview for the UI: for each task, the model the unified router
     * would actually pick on this plan + connected providers right now (the chooser's
     * choice, or the connected provider's fallback when no registry provider fits).
     */
    async routePreview(workspaceId: string) {
        const info = await this.license.info();
        const tier = tierForPlan(info.plan);
        const ctx = await this.routeContext(workspaceId);
        const fallbackInt = ctx.connectedProviders.length
            ? await this.prisma.integration.findFirst({
                  where: { workspaceId, type: "AI_PROVIDER", status: "CONNECTED" },
                  orderBy: { updatedAt: "desc" },
              })
            : null;
        const fbDef = fallbackInt ? getProvider(fallbackInt.provider) : undefined;
        const fbConfig = (fallbackInt?.config ?? {}) as { defaultModel?: string };

        const tasks = SEO_TASKS.map((task) => {
            try {
                const r = chooseModel(task, tier, ctx).primary;
                return { task, model: r.label, provider: r.provider, free: r.free, routed: "chooser" as const };
            } catch {
                if (fbDef) {
                    const m = this.fallbackModel(fbDef, fbConfig, task);
                    return { task, model: m || fbDef.name, provider: fallbackInt!.provider, free: false, routed: "fallback" as const };
                }
                return { task, model: null, provider: null, free: false, routed: "none" as const };
            }
        });
        return { tier, plan: info.plan, connectedProviders: ctx.connectedProviders, tasks };
    }

    private utcDay(): string {
        return new Date().toISOString().slice(0, 10);
    }

    /** Per-model free-quota availability today, so the gateway respects the same free
     *  Gemini daily cap as the SEO engine (both write the shared AiQuotaDaily ledger). */
    private async quotaMap(workspaceId: string): Promise<Partial<Record<ModelId, boolean>>> {
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

    /** Increment today's free-quota counter after a $0 call (routing id, e.g. gemini-2.5-flash). */
    private async recordFreeUse(workspaceId: string, model: ModelId) {
        const date = this.utcDay();
        await this.prisma.aiQuotaDaily.upsert({
            where: { workspaceId_model_date: { workspaceId, model, date } },
            create: { workspaceId, model, date, count: 1 },
            update: { count: { increment: 1 } },
        });
    }

    /** Flag a free model as exhausted today (on a real 429) so the chooser skips it. */
    private async markExhausted(workspaceId: string, model: ModelId) {
        const date = this.utcDay();
        await this.prisma.aiQuotaDaily.upsert({
            where: { workspaceId_model_date: { workspaceId, model, date } },
            create: { workspaceId, model, date, count: 0, exhausted: true },
            update: { exhausted: true },
        });
    }

    /** Runtime context for the tier chooser: which providers are connected + free quota. */
    private async routeContext(workspaceId: string): Promise<RouteContext> {
        const connected = await this.prisma.integration.findMany({
            where: { workspaceId, type: "AI_PROVIDER", status: "CONNECTED" },
            select: { provider: true },
        });
        return {
            connectedProviders: connected.map((c) => c.provider),
            quotaAvailable: await this.quotaMap(workspaceId),
        };
    }

    /** Model for a provider OUTSIDE the cost-router registry (OpenAI/Mistral/etc.), or
     *  when a specific provider was requested: the configured default, else a
     *  task-weighted tier, else the provider default. */
    private fallbackModel(def: ProviderDef | undefined, config: { defaultModel?: string }, task: SeoTask): string {
        if (config.defaultModel) return config.defaultModel;
        if (def?.tiers) {
            const heavy = task === "content_generation" || task === "schema_audit";
            return def.tiers[heavy ? "strong" : "fast"] ?? def.defaultModel ?? "";
        }
        return def?.defaultModel ?? "";
    }

    /**
     * Resolve the provider + model for a generation. One routing brain (the tier
     * chooser) drives auto selection; explicit choices and non-registry providers
     * are handled in priority order:
     *   1. explicit model  -> use it on the requested/default provider
     *   2. explicit provider (no model) -> respect it, task-weighted default model
     *   3. auto -> cost-route across connected registry providers via chooseModel()
     *   4. no registry provider connected -> default connected provider's model
     */
    private async routeGenerate(
        workspaceId: string,
        dto: GenerateDto,
    ): Promise<{ integration: Integration; model: string; chosen?: ChosenModel }> {
        if (dto.model) {
            const integration = await this.resolve(workspaceId, dto.provider);
            return { integration, model: dto.model };
        }
        const task = taskForFeature(dto.feature);
        if (dto.provider) {
            const integration = await this.resolve(workspaceId, dto.provider);
            const def = getProvider(integration.provider);
            const config = (integration.config ?? {}) as { defaultModel?: string };
            return { integration, model: this.fallbackModel(def, config, task) };
        }
        const tier = tierForPlan((await this.license.info()).plan);
        const ctx = await this.routeContext(workspaceId);
        try {
            const chosen = chooseModel(task, tier, ctx).primary;
            const integration = await this.resolve(workspaceId, chosen.provider);
            return { integration, model: apiModelFor(chosen.id), chosen };
        } catch (e) {
            if (!(e instanceof NoProviderForTaskError)) throw e;
            const integration = await this.resolve(workspaceId);
            const def = getProvider(integration.provider);
            const config = (integration.config ?? {}) as { defaultModel?: string };
            return { integration, model: this.fallbackModel(def, config, task) };
        }
    }

    /** Pick the integration to use: the requested provider, else the default. */
    private async resolve(workspaceId: string, providerId?: string): Promise<Integration> {
        if (providerId) {
            const i = await this.prisma.integration.findFirst({
                where: { workspaceId, provider: providerId, type: "AI_PROVIDER" },
            });
            if (!i) throw new BadRequestException(`Provider "${providerId}" is not connected.`);
            return i;
        }
        // Smart default: prefer a CONNECTED provider, most recently updated.
        const i = await this.prisma.integration.findFirst({
            where: { workspaceId, type: "AI_PROVIDER", status: "CONNECTED" },
            orderBy: { updatedAt: "desc" },
        });
        if (i) return i;
        const any = await this.prisma.integration.findFirst({
            where: { workspaceId, type: "AI_PROVIDER" },
            orderBy: { updatedAt: "desc" },
        });
        if (!any) {
            throw new BadRequestException(
                "No AI provider connected. Add one in Settings → Integrations.",
            );
        }
        return any;
    }

    /** Public entry: hold an EE budget reservation around the actual generation, so a
     *  burst of concurrent calls near the cap can't all pass a stale pre-spend read and
     *  overspend (SECURITY_AUDIT_REPORT F-17). The reservation is released once the call
     *  settles (success or failure); the real cost is still recorded below. */
    async generate(workspaceId: string, userId: string, dto: GenerateDto) {
        const reservation = this.budget ? await this.budget.reserve(workspaceId) : null;
        try {
            return await this.generateInner(workspaceId, userId, dto);
        } finally {
            await reservation?.release();
        }
    }

    private async generateInner(workspaceId: string, userId: string, dto: GenerateDto) {
        const { integration, model, chosen } = await this.routeGenerate(workspaceId, dto);
        const def = getProvider(integration.provider);
        if (!def) throw new BadRequestException("Unknown provider.");
        if (!model) throw new BadRequestException("No model configured for this provider.");

        const config = (integration.config ?? {}) as { baseUrl?: string; defaultModel?: string };
        const baseUrl = (config.baseUrl || def.baseUrl || "").replace(/\/+$/, "");
        const key = integration.encryptedSecret ? decryptSecret(integration.encryptedSecret) : "";

        // Prepend workspace knowledge / SEO memory to the system prompt (provider-agnostic).
        const block = await this.knowledgeBlock(workspaceId, dto);
        const enriched: GenerateDto = block
            ? { ...dto, system: [block, dto.system].filter(Boolean).join("\n\n---\n\n") }
            : dto;

        let result: ChatResult;
        try {
            result =
                def.kind === "anthropic"
                    ? await this.callAnthropic(baseUrl, key, model, enriched)
                    : await this.callOpenAiCompatible(baseUrl, key, model, enriched);
        } catch (e) {
            // A free-routed model hitting its daily cap: mark it so the chooser skips it.
            const msg = e instanceof Error ? e.message : String(e);
            if (chosen?.free && /429|rate|quota/i.test(msg)) {
                await this.markExhausted(workspaceId, chosen.id).catch(() => undefined);
            }
            throw e;
        }

        // Count a $0 free-quota call against today's shared daily ledger.
        if (chosen?.free) await this.recordFreeUse(workspaceId, chosen.id).catch(() => undefined);

        const totalTokens = result.promptTokens + result.completionTokens;
        const costUsd = estimateCostUsd(model, result.promptTokens, result.completionTokens);

        await this.prisma.usageRecord.create({
            data: {
                workspaceId,
                userId,
                provider: integration.provider,
                model,
                feature: dto.feature,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                totalTokens,
                costUsd: costUsd ?? undefined,
            },
        });

        return {
            text: result.text,
            provider: integration.provider,
            model,
            usage: {
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                totalTokens,
                costUsd,
            },
        };
    }

    private async callOpenAiCompatible(
        baseUrl: string,
        key: string,
        model: string,
        dto: GenerateDto,
    ): Promise<ChatResult> {
        // Multimodal user content when an image is attached (vision — e.g. alt text).
        const userContent = dto.imageBase64
            ? [
                  { type: "text", text: dto.prompt },
                  {
                      type: "image_url",
                      image_url: { url: `data:${dto.imageMimeType ?? "image/jpeg"};base64,${dto.imageBase64}` },
                  },
              ]
            : dto.prompt;
        const messages = [
            ...(dto.system ? [{ role: "system", content: dto.system }] : []),
            { role: "user", content: userContent },
        ];
        const data = await this.post(
            `${baseUrl}/chat/completions`,
            key ? { Authorization: `Bearer ${key}` } : {},
            {
                model,
                messages,
                temperature: dto.temperature ?? 0.7,
                max_tokens: dto.maxTokens ?? 1024,
            },
        );
        const text = data?.choices?.[0]?.message?.content ?? "";
        const usage = data?.usage ?? {};
        return {
            text,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
        };
    }

    private async callAnthropic(
        baseUrl: string,
        key: string,
        model: string,
        dto: GenerateDto,
    ): Promise<ChatResult> {
        const data = await this.post(
            `${baseUrl}/v1/messages`,
            { "x-api-key": key, "anthropic-version": "2023-06-01" },
            {
                model,
                max_tokens: dto.maxTokens ?? 1024,
                temperature: dto.temperature ?? 0.7,
                ...(dto.system ? { system: dto.system } : {}),
                messages: [
                    {
                        role: "user",
                        content: dto.imageBase64
                            ? [
                                  {
                                      type: "image",
                                      source: { type: "base64", media_type: dto.imageMimeType ?? "image/jpeg", data: dto.imageBase64 },
                                  },
                                  { type: "text", text: dto.prompt },
                              ]
                            : dto.prompt,
                    },
                ],
            },
        );
        const text = Array.isArray(data?.content)
            ? data.content.map((b: { text?: string }) => b.text ?? "").join("")
            : "";
        const usage = data?.usage ?? {};
        return {
            text,
            promptTokens: usage.input_tokens ?? 0,
            completionTokens: usage.output_tokens ?? 0,
        };
    }

    /** Shared POST with timeout + normalized provider errors. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
        try {
            // SSRF-guarded (validates a user-supplied custom/LiteLLM base URL) +
            // 60s timeout. A local Ollama/LiteLLM endpoint needs ALLOW_PRIVATE_FETCH=true.
            const res = await safeFetch(
                url,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...headers },
                    body: JSON.stringify(body),
                },
                { timeoutMs: 60_000 },
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = await res.json().catch(() => null);
            if (!res.ok) {
                const message =
                    data?.error?.message ?? data?.message ?? `Provider returned HTTP ${res.status}.`;
                throw new BadRequestException(`AI provider error: ${message}`);
            }
            return data;
        } catch (e) {
            // Re-throw HttpExceptions verbatim (provider error above + SSRF 400/403).
            if (e instanceof HttpException) throw e;
            this.logger.warn(`AI request failed: ${e instanceof Error ? e.message : e}`);
            throw new BadRequestException(
                e instanceof Error ? `Could not reach the AI provider: ${e.message}` : "AI request failed.",
            );
        }
    }
}
