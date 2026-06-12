"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import GuideSteps from "@/components/ui/GuideSteps";
import { api, ApiError } from "@/lib/api";
import { usePlan } from "@/components/providers/LicenseProvider";
import { PLAN_LABEL } from "@/lib/plans";

type Provider = "slack" | "zapier";
type Connector = {
    id: string;
    provider: Provider;
    label: string;
    status: "PENDING" | "CONNECTED" | "ERROR" | "DISCONNECTED";
    connected: boolean;
    events: string[];
    host: string | null;
    hasUrl: boolean;
    lastError: string | null;
    lastCheckedAt: string | null;
};

type Step = { title: string; body: string };
const META: Record<Provider, { name: string; color: string; icon: string; blurb: string; placeholder: string; steps: Step[]; defaultEvents: string[]; pro: boolean }> = {
    slack: {
        name: "Slack",
        color: "#4A154B",
        icon: "chat",
        blurb: "Post a message to a Slack channel when content is published, scheduled, or unpublished.",
        placeholder: "https://hooks.slack.com/services/…",
        steps: [
            { title: "Add Incoming Webhooks", body: "In Slack, open Apps and add the Incoming Webhooks app." },
            { title: "Pick a channel", body: "Choose the channel to post to, then add the integration." },
            { title: "Copy the URL", body: "Copy the Webhook URL Slack generates and paste it below." },
        ],
        defaultEvents: ["content.published", "content.scheduled", "content.unpublished"],
        pro: true,
    },
    zapier: {
        name: "Zapier",
        color: "#FF4F00",
        icon: "send",
        blurb: "Send content events to a Zapier Catch Hook to trigger any Zap (Sheets, email, CRM, and 6000+ apps).",
        placeholder: "https://hooks.zapier.com/hooks/catch/…",
        steps: [
            { title: "Create a Zap", body: "In Zapier, create a Zap with the trigger Webhooks by Zapier." },
            { title: "Catch Hook", body: "Pick the Catch Hook event; Zapier shows a custom webhook URL." },
            { title: "Copy the URL", body: "Paste that URL below, then finish building your Zap." },
        ],
        defaultEvents: ["content.published", "content.scheduled", "content.unpublished", "content.updated", "content.created", "content.deleted"],
        pro: false,
    },
};

const EVENT_LABELS: { id: string; label: string }[] = [
    { id: "content.published", label: "Published" },
    { id: "content.scheduled", label: "Scheduled" },
    { id: "content.unpublished", label: "Unpublished" },
    { id: "content.updated", label: "Updated" },
    { id: "content.created", label: "Created" },
    { id: "content.deleted", label: "Deleted" },
];

const StatusPill = ({ status }: { status: Connector["status"] }) => {
    const map = {
        CONNECTED: { label: "Connected", cls: "bg-success/10 text-success" },
        ERROR: { label: "Error", cls: "bg-error/10 text-error" },
        PENDING: { label: "Pending", cls: "bg-warning/10 text-warning" },
        DISCONNECTED: { label: "Disconnected", cls: "bg-grey-light/60 text-grey" },
    }[status];
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-caption-2 font-bold ${map.cls}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {map.label}
        </span>
    );
};

/**
 * Automation connectors — Slack & Zapier. Stores each connector's (secret)
 * webhook URL encrypted server-side and relays content events. Slack is a Pro
 * entitlement (shown locked with an upgrade CTA on Community); Zapier rides the
 * free webhook plumbing and is always available.
 */
const ConnectorsSection = () => {
    const { locked } = usePlan();
    const [list, setList] = useState<Connector[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [modal, setModal] = useState<{ provider: Provider; url: string; events: string[] } | null>(null);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setList(await api<Connector[]>("/connectors"));
        } catch {
            /* surfaced inline; non-fatal */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const connectorFor = (p: Provider) => list.find((c) => c.provider === p);

    const openConnect = (p: Provider) => {
        const existing = connectorFor(p);
        setModal({ provider: p, url: "", events: existing?.events?.length ? existing.events : META[p].defaultEvents });
        setModalError(null);
    };

    const toggleEvent = (id: string) =>
        setModal((m) => (m ? { ...m, events: m.events.includes(id) ? m.events.filter((e) => e !== id) : [...m.events, id] } : m));

    const submit = async () => {
        if (!modal) return;
        setSaving(true);
        setModalError(null);
        try {
            const { test } = await api<{ test: { ok: boolean; error?: string } }>("/connectors", {
                method: "POST",
                body: JSON.stringify({ provider: modal.provider, url: modal.url.trim(), events: modal.events }),
            });
            await load();
            if (test.ok) setModal(null);
            else setModalError(test.error || "We saved it, but the test ping failed. Check the URL and try Test again.");
        } catch (e) {
            setModalError(e instanceof ApiError ? e.message : "Could not connect.");
        } finally {
            setSaving(false);
        }
    };

    const testExisting = async (c: Connector) => {
        setBusyId(c.id);
        try {
            await api(`/connectors/${c.id}/test`, { method: "POST" });
            await load();
        } finally {
            setBusyId(null);
        }
    };

    const disconnect = async (c: Connector) => {
        if (!window.confirm(`Disconnect ${META[c.provider].name}? The stored URL will be deleted.`)) return;
        setBusyId(c.id);
        try {
            await api(`/connectors/${c.id}`, { method: "DELETE" });
            await load();
        } finally {
            setBusyId(null);
        }
    };

    const providers: Provider[] = ["slack", "zapier"];

    return (
        <div>
            <h2 className="text-h5 text-black dark:text-white">Automation &amp; notifications</h2>
            <p className="mt-0.5 mb-4 text-caption-2 text-grey">
                Push content events to Slack and Zapier. Webhook URLs are encrypted at rest.
            </p>
            {loading && <div className="mb-3 text-body-sm text-grey">Loading…</div>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {providers.map((p) => {
                    const meta = META[p];
                    const conn = connectorFor(p);
                    const isLocked = meta.pro && locked("slack");
                    return (
                        <Card key={p} className="flex flex-col gap-4">
                            <div className="flex items-start gap-3">
                                <BrandIcon brand={p} size={44} rounded="rounded-[0.75rem]" label={meta.name} color={meta.color} />
                                <div className="min-w-0 grow">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-title text-black dark:text-white">{meta.name}</span>
                                        {meta.pro && (
                                            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-primary dark:text-lilac">
                                                {PLAN_LABEL.pro}
                                            </span>
                                        )}
                                        {!isLocked && conn && <StatusPill status={conn.status} />}
                                    </div>
                                    <p className="text-caption-2 leading-snug text-grey">{meta.blurb}</p>
                                </div>
                            </div>

                            {!isLocked && conn?.status === "ERROR" && conn.lastError && (
                                <p className="rounded-xl bg-error/10 px-3 py-2 text-caption-2 text-error">{conn.lastError}</p>
                            )}

                            <div className="mt-auto flex items-center gap-2">
                                {isLocked ? (
                                    <Link href="/settings/plan" className="btn-primary h-9 px-4 text-caption-1">
                                        <Icon className="h-4 w-4 fill-white" name="sparkles" />
                                        Upgrade to {PLAN_LABEL.pro}
                                    </Link>
                                ) : conn ? (
                                    <>
                                        <button type="button" onClick={() => openConnect(p)} className="btn-secondary h-9 px-3 text-caption-1">
                                            Update URL
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
                                            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error"
                                            aria-label="Disconnect"
                                        >
                                            <Icon className="h-4 w-4 fill-current" name="trash" />
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" onClick={() => openConnect(p)} className="btn-primary h-9 px-4 text-caption-1">
                                        <Icon className="h-4 w-4 fill-white" name="plus" />
                                        Connect
                                    </button>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* Connect / update modal */}
            <Transition appear show={!!modal} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setModal(null)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    {modal && (
                                        <>
                                            <div className="mb-5 flex items-center gap-3">
                                                <BrandIcon brand={modal.provider} size={40} rounded="rounded-[0.7rem]" label={META[modal.provider].name} color={META[modal.provider].color} />
                                                <Dialog.Title className="text-h5 text-black dark:text-white">Connect {META[modal.provider].name}</Dialog.Title>
                                            </div>

                                            <div className="mb-5">
                                                <GuideSteps steps={META[modal.provider].steps} title={`How to get your ${META[modal.provider].name} URL`} />
                                            </div>

                                            {modalError && <div className="mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{modalError}</div>}

                                            <div className="flex flex-col gap-4">
                                                <label className="block">
                                                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Webhook URL</span>
                                                    <input
                                                        value={modal.url}
                                                        onChange={(e) => setModal({ ...modal, url: e.target.value })}
                                                        placeholder={META[modal.provider].placeholder}
                                                        className="flow-input"
                                                        autoFocus
                                                    />
                                                </label>
                                                <div>
                                                    <span className="mb-2 block text-caption-1 text-black dark:text-white">Notify on</span>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                                                        {EVENT_LABELS.map((ev) => (
                                                            <label key={ev.id} className="flex cursor-pointer items-center gap-2 text-body-sm text-black dark:text-white">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={modal.events.includes(ev.id)}
                                                                    onChange={() => toggleEvent(ev.id)}
                                                                    className="h-4 w-4 rounded border-grey-light text-primary focus:ring-primary"
                                                                />
                                                                {ev.label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-6 flex gap-3">
                                                <button type="button" onClick={() => setModal(null)} className="btn-secondary grow">Cancel</button>
                                                <button
                                                    type="button"
                                                    onClick={submit}
                                                    disabled={saving || !modal.url.trim() || modal.events.length === 0}
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

export default ConnectorsSection;
