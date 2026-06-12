"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Hook = { id: string; name: string; url: string; events: string[]; enabled: boolean; hasSecret: boolean; createdAt: string; deliveries: number };
type Delivery = { id: string; event: string; statusCode: number | null; success: boolean; responseBody: string | null; attempt: number; createdAt: string };

const FALLBACK_EVENTS = ["content.created", "content.updated", "content.published", "content.unpublished", "content.scheduled", "content.deleted"];
const field = "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

const blank = { name: "", url: "", events: [] as string[], secret: "", enabled: true };

/**
 * Webhooks — outbound event subscriptions. Create endpoints, pick events, sign
 * with a secret, toggle, test-send, and inspect the delivery log (with resend).
 */
const Webhooks = () => {
    const [hooks, setHooks] = useState<Hook[]>([]);
    const [events, setEvents] = useState<string[]>(FALLBACK_EVENTS);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Hook | null>(null);
    const [form, setForm] = useState(blank);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
    const [msg, setMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setHooks(await api<Hook[]>("/webhooks"));
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        api<string[]>("/webhooks/events").then(setEvents).catch(() => {});
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm(blank);
        setOpen(true);
    };
    const openEdit = (h: Hook) => {
        setEditing(h);
        setForm({ name: h.name, url: h.url, events: h.events, secret: "", enabled: h.enabled });
        setOpen(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            const body = JSON.stringify({ name: form.name, url: form.url, events: form.events, enabled: form.enabled, ...(form.secret ? { secret: form.secret } : {}) });
            if (editing) await api(`/webhooks/${editing.id}`, { method: "PATCH", body });
            else await api("/webhooks", { method: "POST", body });
            setOpen(false);
            await load();
        } catch (e) {
            window.alert(e instanceof ApiError ? e.message : "Could not save webhook.");
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (h: Hook, enabled: boolean) => {
        setHooks((prev) => prev.map((x) => (x.id === h.id ? { ...x, enabled } : x)));
        await api(`/webhooks/${h.id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }).catch(() => load());
    };

    const remove = async (h: Hook) => {
        if (!window.confirm(`Delete "${h.name}"?`)) return;
        await api(`/webhooks/${h.id}`, { method: "DELETE" });
        await load();
    };

    const loadDeliveries = async (id: string) => {
        if (expanded === id) {
            setExpanded(null);
            return;
        }
        setExpanded(id);
        try {
            const rows = await api<Delivery[]>(`/webhooks/${id}/deliveries`);
            setDeliveries((d) => ({ ...d, [id]: rows }));
        } catch {
            /* ignore */
        }
    };

    const refreshDeliveries = async (id: string) => {
        const rows = await api<Delivery[]>(`/webhooks/${id}/deliveries`).catch(() => null);
        if (rows) setDeliveries((d) => ({ ...d, [id]: rows }));
    };

    const test = async (h: Hook) => {
        setMsg(null);
        const r = await api<{ success: boolean; statusCode: number | null }>(`/webhooks/${h.id}/test`, { method: "POST" }).catch(() => null);
        setMsg(r?.success ? `Test delivered to ${h.name} (HTTP ${r.statusCode}).` : `Test to ${h.name} failed${r?.statusCode ? ` (HTTP ${r.statusCode})` : ""}.`);
        if (expanded === h.id) await refreshDeliveries(h.id);
        await load();
    };

    const resend = async (hookId: string, deliveryId: string) => {
        await api(`/webhooks/deliveries/${deliveryId}/resend`, { method: "POST" }).catch(() => {});
        await refreshDeliveries(hookId);
    };

    const toggleEvent = (e: string) => setForm((f) => ({ ...f, events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e] }));

    return (
        <div className="flex flex-col gap-6">
            <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="w-5 h-5 fill-primary" name="compass" />
                    </span>
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">Webhooks</h2>
                        <p className="text-caption-2 text-grey">{loading ? "Loading…" : `${hooks.filter((h) => h.enabled).length} active endpoint${hooks.length === 1 ? "" : "s"}`} · Flow CMS POSTs signed events</p>
                    </div>
                </div>
                <button type="button" onClick={openCreate} className="btn-primary">
                    <Icon className="w-5 h-5 fill-white" name="plus" />
                    Add endpoint
                </button>
            </Card>

            {msg && <div className="rounded-2xl bg-lavender-mist/70 px-4 py-3 text-body-sm text-black dark:bg-dark-2 dark:text-white">{msg}</div>}

            {!loading && hooks.length === 0 ? (
                <Card className="py-12 text-center text-body-sm text-grey">No endpoints yet. Add one to receive content events.</Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {hooks.map((h) => (
                        <Card key={h.id} className="flex flex-col gap-3 !p-4">
                            <div className="flex flex-wrap items-center gap-4">
                                <span className={`flex items-center justify-center w-10 h-10 rounded-2xl shrink-0 ${h.enabled ? "bg-success/10" : "bg-grey/10"}`}>
                                    <Icon className={`w-5 h-5 ${h.enabled ? "fill-success" : "fill-grey"}`} name="compass" />
                                </span>
                                <div className="min-w-0 grow">
                                    <div className="flex items-center gap-2">
                                        <span className="text-title text-black dark:text-white">{h.name}</span>
                                        {h.hasSecret && <Icon className="w-3.5 h-3.5 fill-grey" name="lock" />}
                                    </div>
                                    <code className="block truncate font-mono text-caption-2 text-grey">{h.url}</code>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {h.events.map((e) => (
                                            <span key={e} className="px-2 py-0.5 rounded-md bg-lavender-mist text-[0.6875rem] font-medium text-primary dark:bg-dark-3 dark:text-lilac">{e}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button type="button" onClick={() => test(h)} className="btn-secondary h-9 px-3 text-caption-1">Test</button>
                                    <button type="button" onClick={() => loadDeliveries(h.id)} className="btn-secondary h-9 px-3 text-caption-1">Log ({h.deliveries})</button>
                                    <button type="button" onClick={() => openEdit(h)} aria-label="Edit" className="btn-circle w-9 h-9 dark:bg-dark-3"><Icon className="w-4 h-4 fill-black dark:fill-white" name="edit" /></button>
                                    <button type="button" onClick={() => remove(h)} aria-label="Delete" className="btn-circle w-9 h-9 dark:bg-dark-3"><Icon className="w-4 h-4 fill-error" name="trash" /></button>
                                    <Switch checked={h.enabled} onChange={(v) => toggle(h, v)} aria-label={`Toggle ${h.url}`} />
                                </div>
                            </div>

                            {expanded === h.id && (
                                <div className="rounded-2xl border border-grey-light p-3 dark:border-grey-light/10">
                                    {(deliveries[h.id] ?? []).length === 0 ? (
                                        <p className="py-3 text-center text-caption-2 text-grey">No deliveries yet.</p>
                                    ) : (
                                        <div className="flex flex-col divide-y divide-grey-light dark:divide-grey-light/10">
                                            {(deliveries[h.id] ?? []).map((d) => (
                                                <div key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill text-[0.6875rem] font-bold ${d.success ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
                                                        {d.success ? "OK" : "FAIL"} {d.statusCode ?? "—"}
                                                    </span>
                                                    <span className="font-mono text-caption-2 text-black dark:text-white">{d.event}</span>
                                                    <span className="text-caption-2 text-grey" suppressHydrationWarning>{formatDate(d.createdAt)}{d.attempt > 1 ? ` · retry #${d.attempt}` : ""}</span>
                                                    {d.responseBody && <span className="min-w-0 grow truncate text-caption-2 text-grey">{d.responseBody}</span>}
                                                    <button type="button" onClick={() => resend(h.id, d.id)} className="btn-secondary h-8 px-3 text-caption-2 ml-auto">Resend</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* Create / edit modal */}
            <Transition appear show={open} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <Dialog.Title className="text-h5 text-black dark:text-white mb-5">{editing ? "Edit endpoint" : "Add endpoint"}</Dialog.Title>
                                    <div className="flex flex-col gap-4">
                                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Marketing site rebuild" className={field} autoFocus /></label>
                                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Payload URL</span><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/hooks/flow" className={field} /></label>
                                        <div>
                                            <span className="mb-1.5 block text-caption-1 text-grey">Events</span>
                                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                                {events.map((e) => (
                                                    <label key={e} className="inline-flex items-center gap-2 rounded-xl border border-grey-light px-3 py-2 text-caption-1 text-black dark:border-grey-light/10 dark:text-white">
                                                        <input type="checkbox" checked={form.events.includes(e)} onChange={() => toggleEvent(e)} className="accent-primary" />
                                                        <span className="font-mono">{e}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Signing secret {editing && <span className="text-grey">(leave blank to keep)</span>}</span><input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="optional: used for the X-Flow-Signature HMAC" className={field} /></label>
                                    </div>
                                    <div className="mt-6 flex gap-3">
                                        <button type="button" onClick={() => setOpen(false)} className="btn-secondary grow">Cancel</button>
                                        <button type="button" onClick={save} disabled={saving || !form.name.trim() || !form.url.trim() || form.events.length === 0} className="btn-primary grow disabled:opacity-60">{saving ? "Saving…" : editing ? "Save" : "Create"}</button>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
};

export default Webhooks;
