"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { confirm } from "@/components/providers/ConfirmProvider";
import { slugify } from "@flowcms/shared/strings";

type Template = {
    id: string;
    name: string;
    description: string | null;
    icon: string;
    color: string;
    typeApiId: string;
    typeName: string;
    body: string;
};

/**
 * Page Templates — reusable starter presets. "Use" scaffolds the target content
 * type (if needed) and opens the editor pre-filled with the template body.
 */
const Templates = () => {
    const router = useRouter();
    const { can } = useAuth();
    const canManage = can("content.update");
    const [items, setItems] = useState<Template[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ name: "", description: "", typeName: "", body: "" });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            setItems(await api<Template[]>("/page-templates"));
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't load templates.");
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const use = async (t: Template) => {
        setBusyId(t.id);
        setError(null);
        try {
            const { entryId } = await api<{ entryId: string }>(`/page-templates/${t.id}/use`, { method: "POST" });
            router.push(`/content/editor?id=${entryId}`);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't start from this template.");
            setBusyId(null);
        }
    };

    const remove = async (t: Template) => {
        if (!(await confirm({ title: `Delete the “${t.name}” template?`, confirmLabel: "Delete", tone: "danger" }))) return;
        setBusyId(t.id);
        try {
            await api(`/page-templates/${t.id}`, { method: "DELETE" });
            await load();
        } finally {
            setBusyId(null);
        }
    };

    const create = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const typeName = form.typeName.trim() || form.name.trim();
            await api("/page-templates", {
                method: "POST",
                body: JSON.stringify({
                    name: form.name.trim(),
                    description: form.description.trim() || undefined,
                    typeApiId: slugify(typeName, { fallback: "page" }),
                    typeName,
                    body: form.body,
                }),
            });
            setModalOpen(false);
            setForm({ name: "", description: "", typeName: "", body: "" });
            await load();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't save the template.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-caption-2 text-grey">Start new content from a reusable preset. “Use” opens the editor pre-filled.</p>
                {canManage && (
                    <button type="button" onClick={() => setModalOpen(true)} className="btn-primary h-9 px-4 text-caption-1">
                        <Icon className="w-4 h-4 fill-white" name="plus" />
                        New template
                    </button>
                )}
            </div>

            {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

            {items === null ? (
                <div className="text-body-sm text-grey">Loading…</div>
            ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((t) => (
                        <div key={t.id} className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_0.5rem_2rem_rgba(227,230,236,0.55)] transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.12)] dark:bg-dark-1 dark:shadow-[0_0.5rem_2rem_rgba(0,0,0,0.3)]">
                            <div className="relative flex aspect-[16/10] items-center justify-center" style={{ backgroundImage: `linear-gradient(135deg, ${t.color}, ${t.color}b3)` }}>
                                <div className="flex w-2/3 flex-col gap-2">
                                    <div className="h-3 w-2/3 rounded-md bg-white/80" />
                                    <div className="h-2 w-full rounded-md bg-white/45" />
                                    <div className="h-2 w-5/6 rounded-md bg-white/45" />
                                    <div className="mt-1 h-10 w-full rounded-lg bg-white/30" />
                                </div>
                                <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-md bg-black/25 px-2 py-0.5 text-[0.625rem] font-bold text-white backdrop-blur-sm">
                                    <Icon className="h-3 w-3 fill-white" name={t.icon} />
                                    {t.typeName}
                                </span>
                                {canManage && (
                                    <button type="button" onClick={() => void remove(t)} aria-label="Delete template" className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-error/80 group-hover:opacity-100">
                                        <Icon className="h-3.5 w-3.5 fill-white" name="trash" />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3 p-4">
                                <div className="min-w-0 grow">
                                    <div className="truncate text-title text-black dark:text-white">{t.name}</div>
                                    <div className="truncate text-caption-2 text-grey">{t.description || `New ${t.typeName.toLowerCase()}`}</div>
                                </div>
                                <button type="button" onClick={() => void use(t)} disabled={busyId === t.id} className="btn-secondary h-9 shrink-0 px-3.5 text-caption-1 disabled:opacity-60">
                                    <Icon className="w-4 h-4 fill-primary dark:fill-lilac" name="plus" />
                                    {busyId === t.id ? "Opening…" : "Use"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* New template modal */}
            <Transition appear show={modalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setModalOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <Dialog.Title className="text-h5 text-black dark:text-white mb-5">New page template</Dialog.Title>
                                    <div className="flex flex-col gap-4">
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Template name</span>
                                            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Case study" className="flow-input" autoFocus />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Content type <span className="text-grey">(created if new)</span></span>
                                            <input value={form.typeName} onChange={(e) => setForm({ ...form, typeName: e.target.value })} placeholder="Defaults to the template name" className="flow-input" />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Description</span>
                                            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this template is for" className="flow-input" />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Starter body (HTML)</span>
                                            <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="<h1>Heading</h1><p>Intro…</p>" className="flow-input resize-none font-mono text-caption-2" />
                                        </label>
                                    </div>
                                    <div className="mt-6 flex gap-3">
                                        <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary grow">Cancel</button>
                                        <button type="button" onClick={() => void create()} disabled={saving || !form.name.trim()} className="btn-primary grow disabled:opacity-60">{saving ? "Saving…" : "Create template"}</button>
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

export default Templates;
