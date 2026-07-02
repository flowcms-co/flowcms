"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Select from "@/components/ui/Select";
import ConnectLock from "@/components/ui/ConnectLock";
import { useConnections } from "@/lib/useConnections";
import { api, ApiError } from "@/lib/api";
import { genLengths, genTemplates, genTones } from "@/mocks/ai";
import { cn } from "@/lib/cn";

type Provider = { id: string; provider: string; name: string; status: string; defaultModel: string | null; suggestedModels: string[] };
type Result = {
    text: string;
    provider: string;
    model: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null };
};

const LENGTH_TOKENS: Record<string, number> = { Short: 500, Medium: 1500, Long: 3000 };

/**
 * AI Content Generator — composes a prompt (type, tone, length, keywords) and
 * calls the connected AI provider for real via the backend gateway. Shows the
 * output + token/cost usage, and prompts to connect a provider when none exist.
 */
const ContentGenerator = () => {
    const { connections: conn, loading: connLoading } = useConnections();
    const [tone, setTone] = useState(genTones[0]);
    const [length, setLength] = useState(genLengths[1]);
    const [prompt, setPrompt] = useState("");
    const [keywords, setKeywords] = useState("");
    const [types, setTypes] = useState<{ id: string; name: string; apiId: string }[]>([]);
    const [typeApiId, setTypeApiId] = useState("");

    const [providers, setProviders] = useState<Provider[]>([]);
    const [providerId, setProviderId] = useState<string>("");
    const [model, setModel] = useState<string>("");
    const [loadingProviders, setLoadingProviders] = useState(true);

    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Result | null>(null);
    const [copied, setCopied] = useState(false);

    const loadProviders = useCallback(async () => {
        try {
            const list = await api<Provider[]>("/ai/providers");
            setProviders(list);
            const connected = list.find((p) => p.status === "CONNECTED") ?? list[0];
            if (connected) {
                setProviderId(connected.provider);
                setModel(connected.defaultModel ?? "");
            }
        } catch {
            /* ai.use required; ignore */
        } finally {
            setLoadingProviders(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadProviders();
        api<{ id: string; name: string; apiId: string }[]>("/content-types")
            .then(setTypes)
            .catch(() => {});
    }, [loadProviders]);

    const activeProvider = providers.find((p) => p.provider === providerId);
    const hasProvider = providers.some((p) => p.status === "CONNECTED");

    const onPickProvider = (id: string) => {
        setProviderId(id);
        const p = providers.find((x) => x.provider === id);
        setModel(p?.defaultModel ?? "");
    };

    const generate = async () => {
        if (!prompt.trim() || generating) return;
        setGenerating(true);
        setError(null);
        setResult(null);
        try {
            const system = `You are an expert content writer for a CMS. Write in a ${tone.toLowerCase()} tone. Aim for a ${length.toLowerCase()} length.`;
            const composed = keywords.trim()
                ? `${prompt.trim()}\n\nWork in these target keywords naturally: ${keywords.trim()}`
                : prompt.trim();
            const res = await api<Result>("/ai/generate", {
                method: "POST",
                body: JSON.stringify({
                    feature: "content.generate",
                    prompt: composed,
                    system,
                    provider: providerId || undefined,
                    model: model || undefined,
                    contentTypeApiId: typeApiId || undefined,
                    maxTokens: LENGTH_TOKENS[length] ?? 1500,
                }),
            });
            setResult(res);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Generation failed.");
        } finally {
            setGenerating(false);
        }
    };

    const copy = async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <ConnectLock
            connected={conn.ai}
            loading={connLoading}
            icon="sparkles"
            title="Connect an AI provider"
            description="Connect a BYO AI provider key (OpenAI, Claude, and more) to use this tool."
            href="/settings/integrations?tab=ai"
            ctaLabel="Connect AI provider"
        >
        <div data-tour="ai-generator" className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[7fr_3fr]">
                {/* Generator form */}
                <Card className="flex flex-col">
                    <div className="flex items-center gap-2.5 mb-5">
                        <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-[linear-gradient(135deg,#6C5CE7,#E0529C)]">
                            <Icon className="w-5 h-5 fill-white" name="sparkles" />
                        </span>
                        <div>
                            <h2 className="text-h5 text-black dark:text-white">Generate content</h2>
                            <p className="text-caption-2 text-grey">Describe what you need: FlowCMS AI drafts it.</p>
                        </div>
                    </div>

                    <label className="text-caption-1 text-grey mb-1.5">What do you want to create?</label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={4}
                        placeholder="e.g. A 1,200-word guide on rebranding without losing your audience…"
                        className="flow-input resize-none mb-5"
                    />

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div>
                            <div className="text-caption-1 text-grey mb-2">Tone</div>
                            <div className="flex flex-wrap gap-2">
                                {genTones.map((t) => (
                                    <Chip key={t} active={t === tone} onClick={() => setTone(t)}>
                                        {t}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-caption-1 text-grey mb-2">Length</div>
                            <div className="flex flex-wrap gap-2">
                                {genLengths.map((l) => (
                                    <Chip key={l} active={l === length} onClick={() => setLength(l)}>
                                        {l}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                    </div>

                    <label className="text-caption-1 text-grey mb-1.5 mt-5">Target keywords</label>
                    <input
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        className="flow-input mb-5"
                        placeholder="brand strategy, rebrand, design systems"
                    />

                    {types.length > 0 && (
                        <>
                            <label className="text-caption-1 text-grey mb-1.5">
                                Knowledge for{" "}
                                <Link href="/ai/knowledge" className="text-primary hover:opacity-70">
                                    (manage)
                                </Link>
                            </label>
                            <div className="mb-5">
                                <Select
                                    variant="field"
                                    ariaLabel="Knowledge for content type"
                                    value={typeApiId}
                                    onChange={setTypeApiId}
                                    options={[{ value: "", label: "Universal only" }, ...types.map((t) => ({ value: t.apiId, label: t.name }))]}
                                />
                            </div>
                        </>
                    )}

                    {/* Provider + model (smart default + override) */}
                    {hasProvider && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-5">
                            <div>
                                <div className="text-caption-1 text-grey mb-1.5">Provider</div>
                                <Select
                                    variant="field"
                                    ariaLabel="Provider"
                                    value={providerId}
                                    onChange={onPickProvider}
                                    options={providers.map((p) => ({
                                        value: p.provider,
                                        label: `${p.name}${p.status !== "CONNECTED" ? " (not connected)" : ""}`,
                                        disabled: p.status !== "CONNECTED",
                                    }))}
                                />
                            </div>
                            <div>
                                <div className="text-caption-1 text-grey mb-1.5">Model</div>
                                <input
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    placeholder={activeProvider?.defaultModel ?? "model"}
                                    className="flow-input"
                                    list="cg-models"
                                />
                                {activeProvider && activeProvider.suggestedModels.length > 0 && (
                                    <datalist id="cg-models">
                                        {activeProvider.suggestedModels.map((m) => (
                                            <option key={m} value={m} />
                                        ))}
                                    </datalist>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>
                    )}

                    <button
                        type="button"
                        onClick={generate}
                        disabled={generating || !prompt.trim() || !hasProvider}
                        className="btn-primary w-full mt-auto disabled:opacity-60"
                    >
                        <Icon className="w-5 h-5 fill-white" name="sparkles" />
                        {generating ? "Generating…" : "Generate draft"}
                    </button>
                </Card>

                {/* Quick start templates (prefill the prompt) */}
                <Card>
                    <h2 className="text-h5 text-black dark:text-white mb-4">Quick start</h2>
                    <div className="flex flex-col gap-2.5">
                        {genTemplates.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setPrompt(t.desc)}
                                className="group flex items-center gap-3 rounded-2xl border border-grey-light p-3 text-left transition-colors hover:bg-lavender-mist dark:border-grey-light/10 dark:hover:bg-dark-3"
                            >
                                <span
                                    className="flex items-center justify-center w-9 h-9 rounded-[0.625rem] shrink-0"
                                    style={{ backgroundColor: `${t.color}22` }}
                                >
                                    <Icon className="w-4 h-4" name={t.icon} fill={t.color} />
                                </span>
                                <div className="min-w-0">
                                    <div className="truncate text-title text-black dark:text-white">{t.title}</div>
                                    <div className="truncate text-caption-2 text-grey">{t.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Output */}
            {(generating || result) && (
                <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="text-h5 text-black dark:text-white">Draft</h2>
                        {result && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-lavender-mist px-2 py-1 text-caption-2 font-semibold text-primary dark:bg-dark-3 dark:text-lilac">
                                    {result.provider} · {result.model}
                                </span>
                                <span className="rounded-md bg-grey-light/60 px-2 py-1 text-caption-2 font-semibold text-grey dark:bg-dark-3">
                                    {result.usage.totalTokens.toLocaleString()} tokens
                                </span>
                                {result.usage.costUsd != null && (
                                    <span className="rounded-md bg-grey-light/60 px-2 py-1 text-caption-2 font-semibold text-grey dark:bg-dark-3">
                                        ~${result.usage.costUsd.toFixed(4)}
                                    </span>
                                )}
                                <button type="button" onClick={copy} className="btn-secondary h-9 px-3 text-caption-1">
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                        )}
                    </div>
                    {generating ? (
                        <div className="flex items-center gap-2 text-body-sm text-grey">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender-mist border-t-primary" />
                            Drafting with {activeProvider?.name ?? "AI"}…
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap text-body-sm leading-relaxed text-black dark:text-white">
                            {result?.text}
                        </div>
                    )}
                </Card>
            )}
        </div>
        </ConnectLock>
    );
};

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            "h-9 px-3.5 rounded-md text-caption-1 font-semibold transition-colors",
            active ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3",
        )}
    >
        {children}
    </button>
);

export default ContentGenerator;
