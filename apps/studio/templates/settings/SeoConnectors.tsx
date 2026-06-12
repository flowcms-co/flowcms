"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";
import { helpUrl, GUIDES } from "@/lib/help";

type Status = {
    pagespeed: { connected: boolean };
    keyword: { connected: boolean; config: { preset?: string; baseUrl?: string } | null };
    aeo: { connected: boolean; config: { baseUrl?: string } | null };
};

type ConnectorKey = "pagespeed" | "keyword_data" | "aeo_analytics";

/**
 * Optional bring-your-own-key SEO data connectors: PageSpeed (live Core Web
 * Vitals) and a keyword-data provider (volume/difficulty). Keys are encrypted
 * at rest and never returned to the browser.
 */
const SeoConnectors = () => {
    const [status, setStatus] = useState<Status | null>(null);
    const [active, setActive] = useState<ConnectorKey | null>(null);
    const [form, setForm] = useState({ key: "", login: "", password: "", baseUrl: "", preset: "dataforseo" });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setStatus(await api<Status>("/seo/connectors"));
        } catch {
            /* needs seo.read */
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const open = (p: ConnectorKey) => {
        setActive(p);
        setForm({ key: "", login: "", password: "", baseUrl: "", preset: p === "keyword_data" ? "dataforseo" : "custom" });
        setErr(null);
    };

    const submit = async () => {
        if (!active) return;
        setSaving(true);
        setErr(null);
        try {
            await api(`/seo/connect/${active}`, { method: "POST", body: JSON.stringify(form) });
            setActive(null);
            await load();
        } catch (e) {
            setErr(e instanceof ApiError ? e.message : "Could not connect.");
        } finally {
            setSaving(false);
        }
    };

    const disconnect = async (p: ConnectorKey, name: string) => {
        if (!window.confirm(`Disconnect ${name}?`)) return;
        await api(`/seo/connect/${p}`, { method: "DELETE" });
        await load();
    };

    const psConnected = !!status?.pagespeed.connected;
    const kwConnected = !!status?.keyword.connected;
    const aeoConnected = !!status?.aeo.connected;

    return (
        <Card className="mt-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                    <Icon className="h-5 w-5 fill-primary" name="chart" />
                </span>
                <div>
                    <h2 className="text-h5 text-black dark:text-white">SEO data connectors</h2>
                    <p className="text-caption-2 text-grey">Optional keys: Core Web Vitals, keyword volume/difficulty, and a dedicated AEO analytics provider.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ConnectorCard
                    name="PageSpeed Insights"
                    desc="Live Core Web Vitals (LCP / INP / CLS). Free Google API key."
                    connected={psConnected}
                    onConnect={() => open("pagespeed")}
                    onDisconnect={() => disconnect("pagespeed", "PageSpeed")}
                />
                <ConnectorCard
                    name="Keyword data"
                    desc="Search volume + difficulty for the Keywords tab. DataForSEO / Serper / any API."
                    connected={kwConnected}
                    sub={kwConnected ? status?.keyword.config?.preset : undefined}
                    onConnect={() => open("keyword_data")}
                    onDisconnect={() => disconnect("keyword_data", "Keyword data")}
                />
                <ConnectorCard
                    name="AEO analytics (optional)"
                    desc="A dedicated AI-citation provider (Profound, Peec…). When connected, the AEO tab uses it instead of probing your AI providers."
                    connected={aeoConnected}
                    onConnect={() => open("aeo_analytics")}
                    onDisconnect={() => disconnect("aeo_analytics", "AEO analytics")}
                />
            </div>

            <Transition appear show={!!active} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setActive(null)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <Dialog.Title className="text-h5 text-black dark:text-white mb-1">
                                        {active === "pagespeed" ? "Connect PageSpeed Insights" : active === "aeo_analytics" ? "Connect AEO analytics" : "Connect keyword data"}
                                    </Dialog.Title>
                                    <p className="mb-5 text-caption-2 text-grey">
                                        {active === "pagespeed"
                                            ? "Create a free API key in Google Cloud (PageSpeed Insights API) and paste it here."
                                            : active === "aeo_analytics"
                                              ? "Point at your AEO analytics provider's API (Profound, Peec, or any). When connected, the AEO tab sources citations + AI traffic from it instead of probing your AI providers."
                                              : "DataForSEO uses your account login + password. Or pick Custom to point at any keyword API."}
                                    </p>
                                    {err && <div className="mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{err}</div>}

                                    {active === "aeo_analytics" ? (
                                        <div className="flex flex-col gap-4">
                                            <label className="block">
                                                <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Provider API base URL</span>
                                                <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.profound.com/visibility" className="flow-input font-mono text-caption-2" />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1.5 block text-caption-1 text-black dark:text-white">API key</span>
                                                <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className="flow-input font-mono text-caption-2" />
                                            </label>
                                            <p className="text-caption-2 text-grey">
                                                Expected response (or map it in the docs): <code>{`{ engines, matrix, referral }`}</code>. We call <code>{`{baseUrl}?domain=yoursite`}</code> with a Bearer token.
                                            </p>
                                        </div>
                                    ) : active === "pagespeed" ? (
                                        <div className="flex flex-col gap-3">
                                            <a href={helpUrl(GUIDES.pagespeed)} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-caption-2 font-semibold text-primary hover:opacity-70">
                                                <Icon className="h-3.5 w-3.5 fill-primary" name="external" />
                                                Read the PageSpeed setup guide
                                            </a>
                                            <label className="block">
                                                <span className="mb-1.5 block text-caption-1 text-black dark:text-white">API key</span>
                                                <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="AIza…" className="flow-input font-mono text-caption-2" autoFocus />
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-4">
                                            <label className="block">
                                                <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Provider</span>
                                                <Select
                                                    variant="field"
                                                    ariaLabel="Provider"
                                                    value={form.preset}
                                                    onChange={(v) => setForm({ ...form, preset: v })}
                                                    options={[
                                                        { value: "dataforseo", label: "DataForSEO: volume + difficulty (login + password)" },
                                                        { value: "serper", label: "Serper.dev: keyword ideas + SERP (API key)" },
                                                        { value: "custom", label: "Custom API (base URL + key)" },
                                                    ]}
                                                />
                                            </label>
                                            <a href={helpUrl(GUIDES[form.preset === "serper" ? "serper" : form.preset === "dataforseo" ? "dataforseo" : "keyword"])} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-caption-2 font-semibold text-primary hover:opacity-70">
                                                <Icon className="h-3.5 w-3.5 fill-primary" name="external" />
                                                Read the {form.preset} setup guide
                                            </a>
                                            {form.preset === "dataforseo" ? (
                                                <>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Login (email)</span>
                                                        <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} className="flow-input" />
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Password</span>
                                                        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="flow-input" />
                                                    </label>
                                                </>
                                            ) : form.preset === "serper" ? (
                                                <label className="block">
                                                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Serper API key</span>
                                                    <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="from serper.dev dashboard" className="flow-input font-mono text-caption-2" />
                                                </label>
                                            ) : (
                                                <>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Base URL</span>
                                                        <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/keywords" className="flow-input font-mono text-caption-2" />
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">API key (Bearer)</span>
                                                        <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className="flow-input font-mono text-caption-2" />
                                                    </label>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-6 flex gap-3">
                                        <button type="button" onClick={() => setActive(null)} className="btn-secondary grow">Cancel</button>
                                        <button type="button" onClick={submit} disabled={saving} className="btn-primary grow disabled:opacity-60">
                                            {saving ? "Connecting…" : "Connect"}
                                        </button>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </Card>
    );
};

const ConnectorCard = ({
    name,
    desc,
    connected,
    sub,
    onConnect,
    onDisconnect,
}: {
    name: string;
    desc: string;
    connected: boolean;
    sub?: string;
    onConnect: () => void;
    onDisconnect: () => void;
}) => (
    <div className="flex flex-col gap-3 rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
        <div className="flex items-center gap-2">
            <span className="text-title text-black dark:text-white">{name}</span>
            {connected && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-[0.6875rem] font-bold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Connected{sub ? ` · ${sub}` : ""}
                </span>
            )}
        </div>
        <p className="text-caption-2 text-grey">{desc}</p>
        <div className="mt-auto flex items-center gap-2">
            <button type="button" onClick={onConnect} className={connected ? "btn-secondary h-9 px-3 text-caption-1" : "btn-primary h-9 px-4 text-caption-1"}>
                {connected ? "Update key" : "Connect"}
            </button>
            {connected && (
                <button type="button" onClick={onDisconnect} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-grey hover:bg-error/10 hover:text-error" aria-label="Disconnect">
                    <Icon className="h-4 w-4 fill-current" name="trash" />
                </button>
            )}
        </div>
    </div>
);

export default SeoConnectors;
