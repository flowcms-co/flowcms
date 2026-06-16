"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Checkbox from "@/components/ui/Checkbox";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlan } from "@/components/providers/LicenseProvider";
import UpgradeLock from "@/components/ui/UpgradeLock";
import { confirm } from "@/components/providers/ConfirmProvider";

type RoleRow = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    permissions: string[];
    dashboard: string | null;
    isSystem: boolean;
    memberCount: number;
    lockSeoMeta?: boolean;
    allowedTypeIds?: string[];
};
type TypeRow = { id: string; name: string };
type CatalogGroup = { group: string; items: { key: string; label: string }[] };
type Catalog = { dashboards: string[]; groups: CatalogGroup[] };

const DASHBOARD_LABELS: Record<string, string> = {
    overview: "Overview",
    seo: "SEO",
    editor: "Editor",
    research: "Research",
};

const ROLE_COLORS: Record<string, string> = {
    super_admin: "var(--color-primary)", // follows the workspace brand accent
    admin: "#3B82F6",
    search_strategist: "#00B894",
    editor: "#F5A623",
};
const roleColor = (key: string) => ROLE_COLORS[key] ?? "var(--color-primary)";

type FormState = { name: string; description: string; dashboard: string; permissions: string[]; lockSeoMeta: boolean; allowedTypeIds: string[] };

/** Roles — view system + custom roles, create/edit roles and their permissions. */
const Roles = () => {
    const { can } = useAuth();
    const { has } = usePlan();
    const canManage = can("roles.manage");
    const advancedRbac = has("advanced_rbac");

    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [types, setTypes] = useState<TypeRow[]>([]);
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<RoleRow | null>(null);
    const [form, setForm] = useState<FormState>({ name: "", description: "", dashboard: "editor", permissions: [], lockSeoMeta: false, allowedTypeIds: [] });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [r, c, t] = await Promise.all([
                api<RoleRow[]>("/roles"),
                api<Catalog>("/roles/catalog"),
                api<TypeRow[]>("/content-types").catch(() => [] as TypeRow[]),
            ]);
            setRoles(r);
            setCatalog(c);
            setTypes(t);
            setError(null);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not load roles.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const isSuper = editing?.key === "super_admin";

    const openCreate = () => {
        setEditing(null);
        setForm({ name: "", description: "", dashboard: "editor", permissions: [], lockSeoMeta: false, allowedTypeIds: [] });
        setFormError(null);
        setOpen(true);
    };

    const openEdit = (r: RoleRow) => {
        setEditing(r);
        setForm({
            name: r.name,
            description: r.description ?? "",
            dashboard: r.dashboard ?? "editor",
            permissions: r.permissions.includes("*")
                ? (catalog?.groups.flatMap((g) => g.items.map((i) => i.key)) ?? [])
                : r.permissions,
            lockSeoMeta: r.lockSeoMeta ?? false,
            allowedTypeIds: r.allowedTypeIds ?? [],
        });
        setFormError(null);
        setOpen(true);
    };

    const togglePerm = (key: string) =>
        setForm((f) => ({
            ...f,
            permissions: f.permissions.includes(key)
                ? f.permissions.filter((p) => p !== key)
                : [...f.permissions, key],
        }));

    const toggleType = (id: string) =>
        setForm((f) => ({
            ...f,
            allowedTypeIds: f.allowedTypeIds.includes(id)
                ? f.allowedTypeIds.filter((t) => t !== id)
                : [...f.allowedTypeIds, id],
        }));

    const save = async () => {
        if (!form.name.trim()) {
            setFormError("Give the role a name.");
            return;
        }
        if (!isSuper && form.permissions.length === 0) {
            setFormError("Pick at least one permission.");
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            const body = JSON.stringify({
                name: form.name,
                description: form.description || undefined,
                dashboard: form.dashboard,
                ...(isSuper
                    ? {}
                    : {
                          permissions: form.permissions,
                          // Field-level rules (inert unless the install is licensed for advanced_rbac).
                          lockSeoMeta: form.lockSeoMeta,
                          allowedTypeIds: form.allowedTypeIds,
                      }),
            });
            if (editing) {
                await api(`/roles/${editing.id}`, { method: "PATCH", body });
            } else {
                await api("/roles", { method: "POST", body });
            }
            setOpen(false);
            await load();
        } catch (e) {
            setFormError(e instanceof ApiError ? e.message : "Could not save the role.");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (r: RoleRow) => {
        if (!(await confirm({ title: `Delete the "${r.name}" role?`, confirmLabel: "Delete", tone: "danger" }))) return;
        try {
            await api(`/roles/${r.id}`, { method: "DELETE" });
            await load();
        } catch (e) {
            window.alert(e instanceof ApiError ? e.message : "Could not delete this role.");
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Roles</h2>
                    <p className="text-caption-2 text-grey">
                        Control what each role can do. Edit a role&rsquo;s permissions or create custom roles.
                    </p>
                </div>
                {canManage && (
                    <button type="button" className="btn-primary" onClick={openCreate}>
                        <Icon className="w-5 h-5 fill-white" name="plus" />
                        Create role
                    </button>
                )}
            </div>

            {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
            {loading && <div className="text-body-sm text-grey">Loading…</div>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {roles.map((r) => {
                    const c = roleColor(r.key);
                    const permLabel = r.permissions.includes("*") ? "All permissions" : `${r.permissions.length} permissions`;
                    return (
                        <Card key={r.id} className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span
                                        className="flex items-center justify-center w-10 h-10 rounded-[0.75rem] shrink-0"
                                        style={{ backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)` }}
                                    >
                                        <Icon className="w-5 h-5" name="lock" fill={c} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-title text-black dark:text-white">{r.name}</span>
                                            {r.isSystem && (
                                                <span className="rounded-md bg-lavender-mist px-1.5 py-0.5 text-caption-2 font-semibold text-grey dark:bg-dark-3">
                                                    System
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-caption-2 text-grey">
                                            {r.memberCount} {r.memberCount === 1 ? "member" : "members"}
                                        </div>
                                    </div>
                                </div>
                                {canManage && (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            aria-label="Edit role"
                                            onClick={() => openEdit(r)}
                                            className="flex items-center justify-center w-8 h-8 rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                                        >
                                            <Icon className="w-4 h-4 fill-current" name="edit" />
                                        </button>
                                        {!r.isSystem && (
                                            <button
                                                type="button"
                                                aria-label="Delete role"
                                                onClick={() => remove(r)}
                                                className="flex items-center justify-center w-8 h-8 rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error"
                                            >
                                                <Icon className="w-4 h-4 fill-current" name="trash" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            {r.description && <p className="text-body-sm text-grey">{r.description}</p>}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-lavender-mist px-2 py-1 text-caption-2 font-semibold text-primary dark:bg-dark-3 dark:text-lilac">
                                    {permLabel}
                                </span>
                                {r.dashboard && (
                                    <span className="rounded-md bg-grey-light/60 px-2 py-1 text-caption-2 font-semibold text-grey dark:bg-dark-3">
                                        {DASHBOARD_LABELS[r.dashboard] ?? r.dashboard} dashboard
                                    </span>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </div>

            <UpgradeLock
                feature="advanced_rbac"
                icon="key"
                title="Field-level permissions & approval workflows"
                description="Go beyond per-section access: control which individual fields each role can edit, and require sign-off before content is published."
                includes={["Per-field edit permissions", "Require approval before publish", "Reviewer assignment & sign-off", "Locked fields per role"]}
            />

            {/* Create / Edit role modal */}
            <Transition appear show={open} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setOpen(false)}>
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
                                <Dialog.Panel className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <Dialog.Title className="text-h5 text-black dark:text-white mb-5">
                                        {editing ? `Edit ${editing.name}` : "Create role"}
                                    </Dialog.Title>

                                    {formError && (
                                        <div className="mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">
                                            {formError}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-4">
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <label className="block">
                                                <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Name</span>
                                                <input
                                                    value={form.name}
                                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                                    placeholder="e.g. Content Lead"
                                                    className="flow-input"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                    Landing dashboard
                                                </span>
                                                <Select
                                                    variant="field"
                                                    ariaLabel="Landing dashboard"
                                                    value={form.dashboard}
                                                    onChange={(v) => setForm({ ...form, dashboard: v })}
                                                    options={(catalog?.dashboards ?? []).map((d) => ({ value: d, label: DASHBOARD_LABELS[d] ?? d }))}
                                                />
                                            </label>
                                        </div>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                Description <span className="text-grey">(optional)</span>
                                            </span>
                                            <input
                                                value={form.description}
                                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                                placeholder="What this role is for"
                                                className="flow-input"
                                            />
                                        </label>

                                        <div>
                                            <span className="mb-2 block text-caption-1 text-black dark:text-white">
                                                Permissions
                                            </span>
                                            {isSuper ? (
                                                <p className="rounded-2xl bg-lavender-mist/60 px-4 py-3 text-body-sm text-grey dark:bg-dark-2">
                                                    Super Admin always has <strong className="text-black dark:text-white">full access</strong>: permissions can&rsquo;t be reduced.
                                                </p>
                                            ) : (
                                                <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-grey-light dark:scrollbar-thumb-dark-3">
                                                    {(catalog?.groups ?? []).map((g) => (
                                                        <div key={g.group}>
                                                            <div className="mb-1.5 text-caption-2 font-semibold uppercase tracking-wide text-grey">
                                                                {g.group}
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                {g.items.map((it) => {
                                                                    const on = form.permissions.includes(it.key);
                                                                    return (
                                                                        <div
                                                                            key={it.key}
                                                                            role="checkbox"
                                                                            aria-checked={on}
                                                                            aria-label={it.label}
                                                                            tabIndex={0}
                                                                            onClick={() => togglePerm(it.key)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter" || e.key === " ") {
                                                                                    e.preventDefault();
                                                                                    togglePerm(it.key);
                                                                                }
                                                                            }}
                                                                            className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 rounded-2xl text-left transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                                                                        >
                                                                            <span className="text-title text-black dark:text-white">
                                                                                {it.label}
                                                                            </span>
                                                                            <span className="pointer-events-none">
                                                                                <Checkbox checked={on} onChange={() => {}} aria-label={it.label} />
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {!isSuper && (
                                            <div className="border-t border-grey-light pt-4 dark:border-grey-light/10">
                                                <div className="mb-2 flex items-center gap-2">
                                                    <span className="text-caption-1 text-black dark:text-white">Field permissions</span>
                                                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-primary dark:text-lilac">Pro</span>
                                                </div>
                                                {advancedRbac ? (
                                                    <div className="flex flex-col gap-3">
                                                        <div
                                                            role="checkbox"
                                                            aria-checked={form.lockSeoMeta}
                                                            aria-label="Restrict SEO and metadata editing"
                                                            tabIndex={0}
                                                            onClick={() => setForm({ ...form, lockSeoMeta: !form.lockSeoMeta })}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" || e.key === " ") {
                                                                    e.preventDefault();
                                                                    setForm({ ...form, lockSeoMeta: !form.lockSeoMeta });
                                                                }
                                                            }}
                                                            className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                                                        >
                                                            <span className="min-w-0">
                                                                <span className="block text-title text-black dark:text-white">Restrict SEO &amp; metadata editing</span>
                                                                <span className="block text-caption-2 text-grey">Can&rsquo;t change meta title/description, focus keyword, canonical, robots or schema.</span>
                                                            </span>
                                                            <span className="pointer-events-none">
                                                                <Checkbox checked={form.lockSeoMeta} onChange={() => {}} aria-label="Restrict SEO" />
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <div className="mb-1.5 px-3 text-caption-2 text-grey">
                                                                Limit to content types <span className="text-grey/70">(none selected = all)</span>
                                                            </div>
                                                            {types.length === 0 ? (
                                                                <p className="px-3 text-caption-2 text-grey">No content types yet.</p>
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    {types.map((t) => {
                                                                        const on = form.allowedTypeIds.includes(t.id);
                                                                        return (
                                                                            <div
                                                                                key={t.id}
                                                                                role="checkbox"
                                                                                aria-checked={on}
                                                                                aria-label={t.name}
                                                                                tabIndex={0}
                                                                                onClick={() => toggleType(t.id)}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === "Enter" || e.key === " ") {
                                                                                        e.preventDefault();
                                                                                        toggleType(t.id);
                                                                                    }
                                                                                }}
                                                                                className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                                                                            >
                                                                                <span className="text-title text-black dark:text-white">{t.name}</span>
                                                                                <span className="pointer-events-none">
                                                                                    <Checkbox checked={on} onChange={() => {}} aria-label={t.name} />
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="rounded-2xl bg-lavender-mist/60 px-4 py-3 text-body-sm text-grey dark:bg-dark-2">
                                                        Limit which fields and content types this role can edit.{" "}
                                                        <a href="/settings/plan" className="font-semibold text-primary dark:text-lilac">Upgrade to Pro &rarr;</a>
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-6 flex gap-3">
                                        <button type="button" onClick={() => setOpen(false)} className="btn-secondary grow">
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={save}
                                            disabled={saving}
                                            className="btn-primary grow disabled:opacity-60"
                                        >
                                            {saving ? "Saving…" : editing ? "Save changes" : "Create role"}
                                        </button>
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

export default Roles;
