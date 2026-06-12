"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import GuideSteps from "@/components/ui/GuideSteps";
import { api, ApiError } from "@/lib/api";
import { aiProviderGuide } from "@/lib/integrationGuides";

type Provider = {
    id: string;
    name: string;
    type: string;
    kind: string;
    description: string;
    baseUrl: string | null;
    requiresBaseUrl: boolean;
    keyOptional: boolean;
    defaultModel: string | null;
    suggestedModels: string[];
    docs: string | null;
};
type Integration = {
    id: string;
    provider: string;
    providerName: string;
    label: string;
    status: "PENDING" | "CONNECTED" | "ERROR" | "DISCONNECTED";
    config: { baseUrl?: string | null; defaultModel?: string | null; lastError?: string | null } | null;
    hasSecret: boolean;
    lastCheckedAt: string | null;
};

const PROVIDER_COLORS: Record<string, string> = {
    openai: "#10A37F",
    anthropic: "#C26B3F",
    openrouter: "#6C5CE7",
    nvidia: "#76B900",
    deepseek: "#4D6BFE",
    kimi: "#1F1F1F",
    litellm: "#00B894",
};
const color = (id: string) => PROVIDER_COLORS[id] ?? "#6C5CE7";

const SECTIONS: { type: string; title: string; blurb: string }[] = [
    { type: "AI_PROVIDER", title: "AI providers", blurb: "Connect a provider key to power the AI tools. Bring your own: keys are encrypted at rest." },
];

const StatusPill = ({ status }: { status: Integration["status"] }) => {
    const map = {
        CONNECTED: { label: "Connected", cls: "bg-success/10 text-success" },
        ERROR: { label: "Error", cls: "bg-error/10 text-error" },
        PENDING: { label: "Pending", cls: "bg-warning/10 text-warning" },
        DISCONNECTED: { label: "Disconnected", cls: "bg-grey-light/60 text-grey" },
    }[status];
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-caption-2 font-bold ${map.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {map.label}
        </span>
    );
};

/** Settings → Integrations → AI: connect AI providers with your own keys. */
const Integrations = () => {
    const [catalog, setCatalog] = useState<Provider[]>([]);
    const [connected, setConnected] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [active, setActive] = useState<Provider | null>(null);
    const [form, setForm] = useState({ apiKey: "", baseUrl: "", defaultModel: "", label: "" });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [c, i] = await Promise.all([
                api<Provider[]>("/integrations/providers"),
                api<Integration[]>("/integrations"),
            ]);
            setCatalog(c);
            setConnected(i);
            setError(null);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not load integrations.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const integrationFor = (providerId: string) => connected.find((i) => i.provider === providerId);

    const openConnect = (p: Provider) => {
        const existing = integrationFor(p.id);
        setActive(p);
        setForm({
            apiKey: "",
            baseUrl: existing?.config?.baseUrl ?? p.baseUrl ?? "",
            defaultModel: existing?.config?.defaultModel ?? p.defaultModel ?? "",
            label: existing?.label ?? p.name,
        });
        setModalError(null);
    };

    const submit = async () => {
        if (!active) return;
        setSaving(true);
        setModalError(null);
        try {
            const { test } = await api<{ test: { ok: boolean; error?: string } }>("/integrations", {
                method: "POST",
                body: JSON.stringify({
                    provider: active.id,
                    apiKey: form.apiKey,
                    baseUrl: form.baseUrl || undefined,
                    defaultModel: form.defaultModel || undefined,
                    label: form.label || undefined,
                }),
            });
            await load();
            if (test.ok) {
                setActive(null);
            } else {
                setModalError(test.error || "Connection test failed. The key was saved: check it and retry.");
            }
        } catch (e) {
            setModalError(e instanceof ApiError ? e.message : "Could not connect.");
        } finally {
            setSaving(false);
        }
    };

    const testExisting = async (i: Integration) => {
        setBusyId(i.id);
        try {
            await api(`/integrations/${i.id}/test`, { method: "POST" });
            await load();
        } catch {
            /* surfaced via reloaded status */
        } finally {
            setBusyId(null);
        }
    };

    const disconnect = async (i: Integration) => {
        if (!window.confirm(`Disconnect ${i.providerName}? The stored key will be deleted.`)) return;
        setBusyId(i.id);
        try {
            await api(`/integrations/${i.id}`, { method: "DELETE" });
            await load();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
            {loading && <div className="text-body-sm text-grey">Loading…</div>}

            {SECTIONS.map((section) => {
                const items = catalog.filter((p) => p.type === section.type);
                if (items.length === 0) return null;
                return (
                    <div key={section.type}>
                        <h2 className="text-h5 text-black dark:text-white">{section.title}</h2>
                        <p className="mt-0.5 mb-4 text-caption-2 text-grey">{section.blurb}</p>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {items.map((p) => {
                                const conn = integrationFor(p.id);
                                const c = color(p.id);
                                return (
                                    <Card key={p.id} className="flex flex-col gap-4">
                                        <div className="flex items-start gap-3">
                                            <BrandIcon brand={p.id} size={44} rounded="rounded-[0.75rem]" label={p.name} color={c} />
                                            <div className="min-w-0 grow">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-title text-black dark:text-white">{p.name}</span>
                                                    {conn && <StatusPill status={conn.status} />}
                                                </div>
                                                <p className="text-caption-2 text-grey leading-snug">{p.description}</p>
                                            </div>
                                        </div>

                                        {conn?.status === "ERROR" && conn.config?.lastError && (
                                            <p className="rounded-xl bg-error/10 px-3 py-2 text-caption-2 text-error">
                                                {conn.config.lastError}
                                            </p>
                                        )}

                                        <div className="mt-auto flex items-center gap-2">
                                            {conn ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => openConnect(p)}
                                                        className="btn-secondary h-9 px-3 text-caption-1"
                                                    >
                                                        Update key
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => testExisting(conn)}
                                                        disabled={busyId === conn.id}
                                                        className="btn-secondary h-9 px-3 text-caption-1 disabled:opacity-60"
                                                    >
                                                        {busyId === conn.id ? "Testing…" : "Test"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => disconnect(conn)}
                                                        disabled={busyId === conn.id}
                                                        className="ml-auto flex items-center justify-center w-9 h-9 rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error"
                                                        aria-label="Disconnect"
                                                    >
                                                        <Icon className="w-4 h-4 fill-current" name="trash" />
                                                    </button>
                                                </>
                                            ) : (
                                                <button type="button" onClick={() => openConnect(p)} className="btn-primary h-9 px-4 text-caption-1">
                                                    <Icon className="w-4 h-4 fill-white" name="plus" />
                                                    Connect
                                                </button>
                                            )}
                                            {p.docs && (
                                                <a
                                                    href={p.docs}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-1 inline-flex items-center gap-1 text-caption-2 text-grey hover:text-primary"
                                                >
                                                    Get key
                                                    <Icon className="w-3.5 h-3.5 fill-current" name="external" />
                                                </a>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Connect / update modal */}
            <Transition appear show={!!active} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setActive(null)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-200"
                                enterFrom="opacity-0 scale-95 translate-y-2"
                                enterTo="opacity-100 scale-100 translate-y-0"
                                leave="ease-in duration-150"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    {active && (
                                        <>
                                            <div className="flex items-center gap-3 mb-5">
                                                <BrandIcon brand={active.id} size={40} rounded="rounded-[0.7rem]" label={active.name} color={color(active.id)} />
                                                <Dialog.Title className="text-h5 text-black dark:text-white">
                                                    Connect {active.name}
                                                </Dialog.Title>
                                            </div>

                                            <div className="mb-5">
                                                <GuideSteps
                                                    steps={aiProviderGuide(active.name, active.docs, active.keyOptional).steps}
                                                    title="How to get your key"
                                                />
                                            </div>

                                            {modalError && (
                                                <div className="mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">
                                                    {modalError}
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-4">
                                                <label className="block">
                                                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                        API key {active.keyOptional && <span className="text-grey">(optional)</span>}
                                                    </span>
                                                    <input
                                                        type="password"
                                                        value={form.apiKey}
                                                        onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                                                        placeholder={active.keyOptional ? "Leave blank if not needed" : "Paste your key"}
                                                        className="flow-input"
                                                        autoFocus
                                                    />
                                                </label>
                                                {(active.requiresBaseUrl || form.baseUrl) && (
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                            Base URL {active.requiresBaseUrl && <span className="text-error">*</span>}
                                                        </span>
                                                        <input
                                                            value={form.baseUrl}
                                                            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                                                            placeholder="https://…"
                                                            className="flow-input"
                                                        />
                                                    </label>
                                                )}
                                                {active.kind !== "observability" && (
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                            Default model
                                                        </span>
                                                        <input
                                                            value={form.defaultModel}
                                                            onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
                                                            placeholder={active.defaultModel ?? "model name"}
                                                            className="flow-input"
                                                            list={`models-${active.id}`}
                                                        />
                                                        {active.suggestedModels.length > 0 && (
                                                            <datalist id={`models-${active.id}`}>
                                                                {active.suggestedModels.map((m) => (
                                                                    <option key={m} value={m} />
                                                                ))}
                                                            </datalist>
                                                        )}
                                                    </label>
                                                )}
                                            </div>

                                            <div className="mt-6 flex gap-3">
                                                <button type="button" onClick={() => setActive(null)} className="btn-secondary grow">
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={submit}
                                                    disabled={
                                                        saving ||
                                                        (!form.apiKey && !active.keyOptional) ||
                                                        (active.requiresBaseUrl && !form.baseUrl)
                                                    }
                                                    className="btn-primary grow disabled:opacity-60"
                                                >
                                                    {saving ? "Connecting…" : "Connect"}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
};

export default Integrations;
