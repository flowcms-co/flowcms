"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import GuideSteps from "@/components/ui/GuideSteps";
import { api, ApiError } from "@/lib/api";
import { ANALYTICS_GUIDES } from "@/lib/integrationGuides";
import { helpUrl, GUIDES } from "@/lib/help";
import { confirm } from "@/components/providers/ConfirmProvider";

type Source = { connected: boolean; status: string; lastSync: string | null; config: { siteUrl?: string; propertyId?: string; lastError?: string } | null };
type Status = { gsc: Source; ga4: Source };

const SOURCES = [
    {
        key: "gsc" as const,
        name: "Search Console",
        color: "#4285F4",
        description: "Clicks, impressions, CTR, positions, top queries & pages.",
        field: "siteUrl" as const,
        fieldLabel: "Site URL",
        fieldPlaceholder: "https://example.com/  or  sc-domain:example.com",
    },
    {
        key: "ga4" as const,
        name: "Google Analytics 4",
        color: "#E37400",
        description: "Sessions, pageviews and bounce rate.",
        field: "propertyId" as const,
        fieldLabel: "Property ID",
        fieldPlaceholder: "e.g. 123456789",
    },
];

/** GSC + GA4 connect (service-account JSON), with sync + disconnect. */
const AnalyticsConnect = () => {
    const [status, setStatus] = useState<Status | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [active, setActive] = useState<(typeof SOURCES)[number] | null>(null);
    const [form, setForm] = useState({ credentials: "", field: "", label: "" });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setStatus(await api<Status>("/analytics/status"));
        } catch {
            /* analytics.read required */
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const open = (s: (typeof SOURCES)[number]) => {
        const cfg = status?.[s.key].config;
        setActive(s);
        setForm({ credentials: "", field: (cfg?.[s.field] as string) ?? "", label: "" });
        setModalError(null);
    };

    const submit = async () => {
        if (!active) return;
        setSaving(true);
        setModalError(null);
        try {
            const res = await api<{ ok: boolean; error?: string }>("/analytics/connect", {
                method: "POST",
                body: JSON.stringify({
                    type: active.key,
                    credentials: form.credentials,
                    [active.field]: form.field,
                    label: form.label || undefined,
                }),
            });
            await load();
            if (res.ok) {
                setActive(null);
                setNote(`${active.name} connected. Click "Sync now" to pull data.`);
            } else {
                setModalError(res.error || "Connected, but authentication failed: check the JSON + access.");
            }
        } catch (e) {
            setModalError(e instanceof ApiError ? e.message : "Could not connect.");
        } finally {
            setSaving(false);
        }
    };

    const sync = async () => {
        setSyncing(true);
        setNote(null);
        try {
            await api("/analytics/sync", { method: "POST" });
            await load();
            setNote("Synced. Your dashboard charts now use live data.");
        } catch (e) {
            setNote(e instanceof ApiError ? e.message : "Sync failed.");
        } finally {
            setSyncing(false);
        }
    };

    const disconnect = async (key: "gsc" | "ga4", name: string) => {
        if (!(await confirm({ title: `Disconnect ${name}?`, confirmLabel: "Disconnect", tone: "danger" }))) return;
        await api(`/analytics/${key}`, { method: "DELETE" });
        await load();
    };

    const anyConnected = status && (status.gsc.connected || status.ga4.connected);

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Analytics &amp; Search</h2>
                    <p className="mt-0.5 text-caption-2 text-grey">
                        Connect with a Google service-account key; grant its email access to your property.
                    </p>
                </div>
                {anyConnected && (
                    <button type="button" onClick={sync} disabled={syncing} className="btn-secondary disabled:opacity-60">
                        <Icon className="w-4 h-4 fill-current" name="overview" />
                        {syncing ? "Syncing…" : "Sync now"}
                    </button>
                )}
            </div>

            {note && (
                <div className="mt-3 rounded-2xl bg-success/10 px-4 py-3 text-body-sm text-success">{note}</div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {SOURCES.map((s) => {
                    const src = status?.[s.key];
                    const connected = src?.connected;
                    return (
                        <Card key={s.key} className="flex flex-col gap-4">
                            <div className="flex items-start gap-3">
                                <BrandIcon brand={s.key} size={44} rounded="rounded-[0.75rem]" label={s.name} color={s.color} />
                                <div className="min-w-0 grow">
                                    <div className="flex items-center gap-2">
                                        <span className="text-title text-black dark:text-white">{s.name}</span>
                                        {connected && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-caption-2 font-bold bg-success/10 text-success">
                                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                                Connected
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-caption-2 text-grey leading-snug">{s.description}</p>
                                </div>
                            </div>
                            {src?.status === "ERROR" && src.config?.lastError && (
                                <p className="rounded-xl bg-error/10 px-3 py-2 text-caption-2 text-error">{src.config.lastError}</p>
                            )}
                            <div className="mt-auto flex items-center gap-2">
                                <button type="button" onClick={() => open(s)} className={connected ? "btn-secondary h-9 px-3 text-caption-1" : "btn-primary h-9 px-4 text-caption-1"}>
                                    {!connected && <Icon className="w-4 h-4 fill-white" name="plus" />}
                                    {connected ? "Update key" : "Connect"}
                                </button>
                                {connected && (
                                    <button
                                        type="button"
                                        onClick={() => disconnect(s.key, s.name)}
                                        className="ml-auto flex items-center justify-center w-9 h-9 rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error"
                                        aria-label="Disconnect"
                                    >
                                        <Icon className="w-4 h-4 fill-current" name="trash" />
                                    </button>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* Connect modal */}
            <Transition appear show={!!active} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setActive(null)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    {active && (
                                        <>
                                            <Dialog.Title className="text-h5 text-black dark:text-white mb-1">
                                                Connect {active.name}
                                            </Dialog.Title>
                                            <p className="text-caption-2 text-grey mb-4">
                                                Paste your Google service-account JSON, and make sure that account&rsquo;s email has access to the property.
                                            </p>
                                            <a
                                                href={helpUrl(GUIDES[active.key])}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mb-3 inline-flex w-fit items-center gap-1 text-caption-2 font-semibold text-primary hover:opacity-70"
                                            >
                                                <Icon className="h-3.5 w-3.5 fill-primary" name="external" />
                                                Full {active.name} guide in the Help Center
                                            </a>
                                            <div className="mb-5">
                                                <GuideSteps
                                                    steps={ANALYTICS_GUIDES[active.key].steps}
                                                    reviewedAt={ANALYTICS_GUIDES[active.key].reviewedAt}
                                                    title="Step-by-step setup guide"
                                                    defaultOpen
                                                />
                                            </div>
                                            {modalError && (
                                                <div className="mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{modalError}</div>
                                            )}
                                            <div className="flex flex-col gap-4">
                                                <label className="block">
                                                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">{active.fieldLabel}</span>
                                                    <input
                                                        value={form.field}
                                                        onChange={(e) => setForm({ ...form, field: e.target.value })}
                                                        placeholder={active.fieldPlaceholder}
                                                        className="flow-input"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Service-account JSON</span>
                                                    <textarea
                                                        value={form.credentials}
                                                        onChange={(e) => setForm({ ...form, credentials: e.target.value })}
                                                        rows={6}
                                                        placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }'
                                                        className="flow-input resize-none font-mono text-caption-2"
                                                    />
                                                </label>
                                            </div>
                                            <div className="mt-6 flex gap-3">
                                                <button type="button" onClick={() => setActive(null)} className="btn-secondary grow">Cancel</button>
                                                <button
                                                    type="button"
                                                    onClick={submit}
                                                    disabled={saving || !form.credentials || !form.field}
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

export default AnalyticsConnect;
