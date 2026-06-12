import { IntegrationType } from "@flowcms/db";
import { safeFetch } from "../common/ssrf";

/**
 * Catalog of supported integrations + how to test each one. Most AI providers
 * speak the OpenAI-compatible API, so one adapter covers them; Anthropic has
 * its own shape; Helicone is an observability proxy. The "custom" provider is
 * the universal escape hatch — connect ANY OpenAI-compatible endpoint by URL.
 */
export type ProviderKind = "openai-compatible" | "anthropic" | "observability";

export interface ProviderDef {
    id: string;
    name: string;
    type: IntegrationType;
    kind: ProviderKind;
    description: string;
    /** Default API base URL (omitted for self-hosted/custom providers). */
    baseUrl?: string;
    /** True when the user must supply their own base URL. */
    requiresBaseUrl?: boolean;
    /** True when a key is optional (e.g. local models like Ollama). */
    keyOptional?: boolean;
    defaultModel?: string;
    suggestedModels?: string[];
    /** Cost-aware routing: a cheap/fast model for light tasks, a strong model for
     *  heavy ones. When set (and auto-routing is on), the AI gateway picks per task. */
    tiers?: { fast?: string; strong?: string };
    docs?: string;
}

const AI = IntegrationType.AI_PROVIDER;

export const PROVIDERS: ProviderDef[] = [
    // ---- Major hosted providers ----
    {
        id: "openai",
        name: "OpenAI",
        type: AI,
        kind: "openai-compatible",
        description: "GPT-4o and friends, direct from OpenAI.",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        suggestedModels: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
        tiers: { fast: "gpt-4o-mini", strong: "gpt-4o" },
        docs: "https://platform.openai.com/api-keys",
    },
    {
        id: "anthropic",
        name: "Anthropic (Claude)",
        type: AI,
        kind: "anthropic",
        description: "Claude models, direct from Anthropic.",
        baseUrl: "https://api.anthropic.com",
        defaultModel: "claude-3-5-sonnet-latest",
        suggestedModels: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
        tiers: { fast: "claude-3-5-haiku-latest", strong: "claude-3-5-sonnet-latest" },
        docs: "https://console.anthropic.com/settings/keys",
    },
    {
        id: "gemini",
        name: "Google Gemini",
        type: AI,
        kind: "openai-compatible",
        description: "Gemini models via Google's OpenAI-compatible endpoint.",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        defaultModel: "gemini-2.0-flash",
        suggestedModels: ["gemini-2.0-flash", "gemini-1.5-pro"],
        tiers: { fast: "gemini-2.0-flash", strong: "gemini-1.5-pro" },
        docs: "https://aistudio.google.com/apikey",
    },
    {
        id: "openrouter",
        name: "OpenRouter",
        type: AI,
        kind: "openai-compatible",
        description: "One key, hundreds of models across providers.",
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "openai/gpt-4o-mini",
        suggestedModels: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5"],
        tiers: { fast: "openai/gpt-4o-mini", strong: "openai/gpt-4o" },
        docs: "https://openrouter.ai/keys",
    },
    {
        id: "groq",
        name: "Groq",
        type: AI,
        kind: "openai-compatible",
        description: "Ultra-fast inference for open models.",
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: "llama-3.3-70b-versatile",
        docs: "https://console.groq.com/keys",
    },
    {
        id: "mistral",
        name: "Mistral AI",
        type: AI,
        kind: "openai-compatible",
        description: "Mistral and Mixtral models.",
        baseUrl: "https://api.mistral.ai/v1",
        defaultModel: "mistral-large-latest",
        docs: "https://console.mistral.ai/api-keys",
    },
    {
        id: "xai",
        name: "xAI (Grok)",
        type: AI,
        kind: "openai-compatible",
        description: "Grok models from xAI.",
        baseUrl: "https://api.x.ai/v1",
        defaultModel: "grok-2-latest",
        docs: "https://console.x.ai/",
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        type: AI,
        kind: "openai-compatible",
        description: "DeepSeek chat + reasoning models.",
        baseUrl: "https://api.deepseek.com",
        defaultModel: "deepseek-chat",
        suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
        tiers: { fast: "deepseek-chat", strong: "deepseek-reasoner" },
        docs: "https://platform.deepseek.com/api_keys",
    },
    {
        id: "perplexity",
        name: "Perplexity",
        type: AI,
        kind: "openai-compatible",
        description: "Web-grounded Sonar models.",
        baseUrl: "https://api.perplexity.ai",
        defaultModel: "sonar",
        docs: "https://www.perplexity.ai/settings/api",
    },
    {
        id: "nvidia",
        name: "NVIDIA",
        type: AI,
        kind: "openai-compatible",
        description: "Models hosted on build.nvidia.com.",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        defaultModel: "meta/llama-3.1-70b-instruct",
        docs: "https://build.nvidia.com/",
    },
    {
        id: "together",
        name: "Together AI",
        type: AI,
        kind: "openai-compatible",
        description: "Hundreds of open models, hosted.",
        baseUrl: "https://api.together.xyz/v1",
        defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        docs: "https://api.together.ai/settings/api-keys",
    },
    {
        id: "fireworks",
        name: "Fireworks AI",
        type: AI,
        kind: "openai-compatible",
        description: "Fast open-model inference.",
        baseUrl: "https://api.fireworks.ai/inference/v1",
        defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        docs: "https://fireworks.ai/account/api-keys",
    },
    {
        id: "cohere",
        name: "Cohere",
        type: AI,
        kind: "openai-compatible",
        description: "Command models via Cohere's compatibility API.",
        baseUrl: "https://api.cohere.ai/compatibility/v1",
        defaultModel: "command-r-plus",
        docs: "https://dashboard.cohere.com/api-keys",
    },
    {
        id: "kimi",
        name: "Kimi (Moonshot)",
        type: AI,
        kind: "openai-compatible",
        description: "Moonshot AI's Kimi models.",
        baseUrl: "https://api.moonshot.cn/v1",
        defaultModel: "moonshot-v1-8k",
        docs: "https://platform.moonshot.cn/console/api-keys",
    },
    {
        id: "vercel",
        name: "Vercel AI Gateway",
        type: AI,
        kind: "openai-compatible",
        description: "Unified gateway with routing + fallbacks.",
        baseUrl: "https://ai-gateway.vercel.sh/v1",
        defaultModel: "openai/gpt-4o-mini",
        docs: "https://vercel.com/docs/ai-gateway",
    },
    // ---- Self-hosted / local ----
    {
        id: "ollama",
        name: "Ollama (local)",
        type: AI,
        kind: "openai-compatible",
        description: "Models running locally via Ollama. No key needed.",
        baseUrl: "http://localhost:11434/v1",
        keyOptional: true,
        defaultModel: "llama3.1",
        docs: "https://ollama.com/",
    },
    {
        id: "litellm",
        name: "LiteLLM",
        type: AI,
        kind: "openai-compatible",
        description: "Your self-hosted LiteLLM proxy (point it at your URL).",
        requiresBaseUrl: true,
        keyOptional: true,
        defaultModel: "gpt-4o-mini",
        docs: "https://docs.litellm.ai/",
    },
    // ---- Universal escape hatch ----
    {
        id: "custom",
        name: "Custom (OpenAI-compatible)",
        type: AI,
        kind: "openai-compatible",
        description: "Connect any OpenAI-compatible API by URL — vLLM, LM Studio, or any provider.",
        requiresBaseUrl: true,
        keyOptional: true,
        defaultModel: "",
        docs: undefined,
    },
];

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id);

/** Verify a key/endpoint works by hitting the provider's models endpoint. */
export async function testProvider(
    provider: ProviderDef,
    key: string,
    baseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
    const base = (baseUrl || provider.baseUrl || "").replace(/\/+$/, "");
    if (!base && provider.kind !== "observability") {
        return { ok: false, error: "Missing base URL." };
    }
    if (provider.kind === "observability") {
        return { ok: key.length > 0, error: key ? undefined : "Missing key." };
    }

    try {
        const url = provider.kind === "anthropic" ? `${base}/v1/models` : `${base}/models`;
        const headers: Record<string, string> = {};
        if (provider.kind === "anthropic") {
            headers["anthropic-version"] = "2023-06-01";
            if (key) headers["x-api-key"] = key;
        } else if (key) {
            headers["Authorization"] = `Bearer ${key}`;
        }
        // SSRF-guarded (a user-supplied custom/LiteLLM base URL); 8s timeout.
        const res = await safeFetch(url, { headers }, { timeoutMs: 8000 });
        if (res.ok) return { ok: true };
        if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid API key." };
        return { ok: false, error: `Provider returned HTTP ${res.status}.` };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Could not reach the provider." };
    }
}
