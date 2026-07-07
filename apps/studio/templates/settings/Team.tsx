"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlan } from "@/components/providers/LicenseProvider";
import { confirm, notice } from "@/components/providers/ConfirmProvider";

// Community has no seat cap; once a team grows past this many members we show a
// dismissible, non-blocking suggestion to consider Pro (for governance, not seats).
const NUDGE_AT = 5;
const NUDGE_STEP = 5; // after dismissal, only resurface once the team grows another step
const NUDGE_KEY = "flowcms:community-team-nudge-dismissed-at";

type RoleOption = { id: string; key: string; name: string };
type Member = {
    id: string;
    email: string;
    name: string | null;
    title: string | null;
    avatarUrl: string | null;
    avatarStyle: string | null;
    isActive: boolean;
    createdAt: string;
    role: RoleOption;
    weeklyGoal: number | null;
    weeklyGoalTopic: string | null;
};

const ROLE_COLORS: Record<string, string> = {
    super_admin: "#6C5CE7",
    admin: "#3B82F6",
    search_strategist: "#00B894",
    editor: "#F5A623",
};
const roleColor = (key: string) => ROLE_COLORS[key] ?? "#6C5CE7";

type FormState = {
    name: string;
    email: string;
    title: string;
    password: string;
    roleKey: string;
    isActive: boolean;
    weeklyGoal: string;
    weeklyGoalTopic: string;
};

const emptyForm = (roleKey: string): FormState => ({
    name: "",
    email: "",
    title: "",
    password: "",
    roleKey,
    isActive: true,
    weeklyGoal: "",
    weeklyGoalTopic: "",
});

/** Team / Users — list members, invite people, edit roles/titles, deactivate. */
const Team = () => {
    const { user, can } = useAuth();
    const { plan } = usePlan();
    const canManage = can("users.manage");

    // Track the team size at which the nudge was last dismissed (read after mount; SSR-safe).
    const [nudgeDismissedAt, setNudgeDismissedAt] = useState<number | null>(null);
    useEffect(() => {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(NUDGE_KEY) : null;
        const n = raw == null ? null : Number(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNudgeDismissedAt(Number.isFinite(n) ? n : null);
    }, []);

    const [members, setMembers] = useState<Member[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [defaultGoal, setDefaultGoal] = useState<number>(3);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Member | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm("editor"));
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [seatLimit, setSeatLimit] = useState<{ seats: number; used: number } | null>(null);
    const [seatBusy, setSeatBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [m, r, ws] = await Promise.all([
                api<Member[]>("/users"),
                api<{ key: string; name: string; id: string }[]>("/roles"),
                api<{ defaultWeeklyGoal?: number }>("/workspace").catch(() => ({ defaultWeeklyGoal: 3 })),
            ]);
            setMembers(m);
            setRoles(r.map((x) => ({ id: x.id, key: x.key, name: x.name })));
            setDefaultGoal(ws.defaultWeeklyGoal ?? 3);
            setError(null);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not load the team.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const openInvite = () => {
        setEditing(null);
        setForm(emptyForm(roles.find((r) => r.key === "editor")?.key ?? roles[0]?.key ?? "editor"));
        setFormError(null);
        setSeatLimit(null);
        setOpen(true);
    };

    const openEdit = (m: Member) => {
        setEditing(m);
        setForm({
            name: m.name ?? "",
            email: m.email,
            title: m.title ?? "",
            password: "",
            roleKey: m.role.key,
            isActive: m.isActive,
            weeklyGoal: m.weeklyGoal != null ? String(m.weeklyGoal) : "",
            weeklyGoalTopic: m.weeklyGoalTopic ?? "",
        });
        setFormError(null);
        setOpen(true);
    };

    const save = async () => {
        setSaving(true);
        setFormError(null);
        try {
            if (editing) {
                await api(`/users/${editing.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        name: form.name,
                        title: form.title,
                        roleKey: form.roleKey,
                        isActive: form.isActive,
                        weeklyGoal: form.weeklyGoal === "" ? null : Math.max(0, Math.min(100, Math.floor(Number(form.weeklyGoal) || 0))),
                        weeklyGoalTopic: form.weeklyGoalTopic.trim() || null,
                    }),
                });
            } else {
                await api("/users", {
                    method: "POST",
                    body: JSON.stringify({
                        email: form.email,
                        name: form.name || undefined,
                        title: form.title || undefined,
                        password: form.password,
                        roleKey: form.roleKey,
                    }),
                });
            }
            setOpen(false);
            await load();
        } catch (e) {
            const data = e instanceof ApiError ? (e.data as { code?: string; seats?: number; used?: number } | null) : null;
            if (data?.code === "seat_limit") setSeatLimit({ seats: data.seats ?? 0, used: data.used ?? 0 });
            else setFormError(e instanceof ApiError ? e.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    };

    // Out of seats: a security-manager can buy one and the invite retries; others are told to ask an owner.
    const buySeatAndRetry = async () => {
        if (!seatLimit) return;
        setSeatBusy(true);
        setFormError(null);
        try {
            await api("/billing/portal", { method: "POST", body: JSON.stringify({ action: "set-seats", total: seatLimit.seats + 1, currentUsers: seatLimit.used }) });
            // Refresh the license so the new seat is recognized before retrying the invite.
            await api("/telemetry/beat", { method: "POST" }).catch(() => undefined);
            setSeatLimit(null);
            setSeatBusy(false);
            await save();
        } catch (e) {
            setSeatBusy(false);
            setFormError(e instanceof ApiError ? e.message : "Couldn't add a seat. Ask an owner to add seats.");
        }
    };

    const remove = async (m: Member) => {
        if (!(await confirm({ title: `Remove ${m.name || m.email} from the workspace?`, confirmLabel: "Remove", tone: "danger" }))) return;
        try {
            await api(`/users/${m.id}`, { method: "DELETE" });
            await load();
        } catch (e) {
            void notice({ title: "Could not remove this member", message: e instanceof ApiError ? e.message : "Please try again.", tone: "danger" });
        }
    };

    const saveDefaultGoal = async (n: number) => {
        const v = Math.max(0, Math.min(100, Math.floor(n || 0)));
        setDefaultGoal(v);
        try {
            await api("/workspace", { method: "PATCH", body: JSON.stringify({ defaultWeeklyGoal: v }) });
        } catch {
            /* non-fatal */
        }
    };

    const activeCount = members.filter((m) => m.isActive).length;

    // Soft, non-blocking suggestion to consider Pro once a Community team grows. Only shown to
    // people who can act on it (manage users), and suppressed after dismissal until the team
    // grows another step. Community is never capped; everything keeps working at any size.
    const showNudge =
        !loading &&
        canManage &&
        plan === "community" &&
        activeCount >= NUDGE_AT &&
        (nudgeDismissedAt == null || activeCount >= nudgeDismissedAt + NUDGE_STEP);

    const dismissNudge = () => {
        setNudgeDismissedAt(activeCount);
        try {
            window.localStorage.setItem(NUDGE_KEY, String(activeCount));
        } catch {
            /* ignore storage failures */
        }
    };

    return (
        <Card className="!p-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Team</h2>
                    <p className="text-caption-2 text-grey">
                        {loading ? "Loading…" : `${activeCount} active ${activeCount === 1 ? "member" : "members"}`}
                    </p>
                </div>
                {canManage && (
                    <div className="flex flex-wrap items-center gap-3">
                        <label data-tour="team-goal" className="flex items-center gap-2 rounded-2xl border border-grey-light px-3 py-1.5 dark:border-grey-light/10">
                            <span className="text-caption-2 text-grey">Default weekly goal</span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                defaultValue={defaultGoal}
                                onBlur={(e) => void saveDefaultGoal(Number(e.target.value))}
                                aria-label="Default weekly content goal per writer"
                                className="h-7 w-14 rounded-lg border border-grey-light bg-transparent px-2 text-caption-1 font-semibold text-black dark:border-grey-light/15 dark:text-white"
                            />
                            <span className="text-caption-2 text-grey">/ writer</span>
                        </label>
                        <button type="button" data-tour="team-invite" className="btn-primary" onClick={openInvite}>
                            <Icon className="w-5 h-5 fill-white" name="plus" />
                            Invite member
                        </button>
                    </div>
                )}
            </div>

            {error && <div className="mx-5 mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

            {showNudge && (
                <div className="mx-5 mb-4 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-lavender-mist px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-lilac/20 dark:bg-white/[0.04]">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-lilac/15">
                            <Icon name="sparkles" className="h-4 w-4 fill-primary dark:fill-lilac" />
                        </span>
                        <div>
                            <p className="text-body-sm font-semibold text-black dark:text-white">Your team is growing</p>
                            <p className="mt-0.5 text-caption-1 text-grey">
                                Pro adds custom roles, field-level permissions, approval workflows and audit logging to keep editing under control as you add people.
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                        <button type="button" onClick={dismissNudge} className="btn-ghost btn-sm">Not now</button>
                        <Link href="/settings/plan" className="btn-primary btn-sm whitespace-nowrap">See Pro</Link>
                    </div>
                </div>
            )}

            <div className="hidden md:grid grid-cols-[2.4fr_1.4fr_1fr_1fr_5rem] gap-4 px-5 py-3 border-y border-grey-light text-caption-2 text-grey dark:border-grey-light/10">
                <span>Member</span>
                <span>Role</span>
                <span>Status</span>
                <span>Joined</span>
                <span />
            </div>

            {!loading && members.length === 0 && (
                <div className="p-8 text-center text-body-sm text-grey">No members yet.</div>
            )}

            {members.map((m) => (
                <div
                    key={m.id}
                    className="grid grid-cols-[1fr_auto] md:grid-cols-[2.4fr_1.4fr_1fr_1fr_5rem] items-center gap-4 px-5 py-3.5 border-b border-grey-light last:border-b-0 dark:border-grey-light/10"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <Avatar userId={m.id} character={m.avatarStyle} src={m.avatarUrl} name={m.name || m.email} size={40} />
                        <div className="min-w-0">
                            <div className="truncate text-title text-black dark:text-white">
                                {m.name || m.email}
                                {m.id === user?.id && <span className="ml-1.5 text-caption-2 text-grey">(you)</span>}
                            </div>
                            <div className="truncate text-caption-2 text-grey">
                                {m.title || m.email} <span className="text-grey/70">&middot; Goal {m.weeklyGoal ?? defaultGoal}/wk{m.weeklyGoal == null ? " (default)" : ""}</span>
                            </div>
                        </div>
                    </div>
                    <span
                        className="hidden md:inline-flex w-fit items-center px-2.5 py-1 rounded-md text-caption-2 font-semibold"
                        style={{ backgroundColor: `${roleColor(m.role.key)}1a`, color: roleColor(m.role.key) }}
                    >
                        {m.role.name}
                    </span>
                    <span className="hidden md:block">
                        <span
                            className={`inline-flex items-center gap-1.5 text-caption-1 font-semibold ${m.isActive ? "text-success" : "text-grey"}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${m.isActive ? "bg-success" : "bg-grey"}`} />
                            {m.isActive ? "Active" : "Disabled"}
                        </span>
                    </span>
                    <span className="hidden md:block text-caption-2 text-grey">
                        {new Date(m.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1 justify-self-end">
                        {canManage && (
                            <>
                                <button
                                    type="button"
                                    aria-label="Edit member"
                                    onClick={() => openEdit(m)}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                                >
                                    <Icon className="w-4 h-4 fill-current" name="edit" />
                                </button>
                                {m.id !== user?.id && (
                                    <button
                                        type="button"
                                        aria-label="Remove member"
                                        onClick={() => remove(m)}
                                        className="flex items-center justify-center w-8 h-8 rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error"
                                    >
                                        <Icon className="w-4 h-4 fill-current" name="trash" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            ))}

            {/* Invite / Edit modal */}
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
                                <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <Dialog.Title className="text-h5 text-black dark:text-white mb-5">
                                        {editing ? "Edit member" : "Invite member"}
                                    </Dialog.Title>

                                    {formError && (
                                        <div className="mb-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">
                                            {formError}
                                        </div>
                                    )}

                                    {seatLimit && (
                                        <div className="mb-4 rounded-2xl border border-primary/25 bg-lavender-mist px-4 py-3 dark:bg-white/[0.04]">
                                            <p className="text-body-sm font-semibold text-black dark:text-white">You&rsquo;ve used all {seatLimit.seats} seats.</p>
                                            {can("security.manage") ? (
                                                <>
                                                    <p className="mt-0.5 text-caption-1 text-grey">Add a seat to send this invite. It&rsquo;s prorated and added to your subscription.</p>
                                                    <button type="button" className="btn-primary btn-sm mt-3" onClick={buySeatAndRetry} disabled={seatBusy}>{seatBusy ? "Adding seat…" : "Add a seat & send invite"}</button>
                                                </>
                                            ) : (
                                                <p className="mt-0.5 text-caption-1 text-grey">Ask an owner to add more seats, then invite again.</p>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-4">
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Name</span>
                                            <input
                                                value={form.name}
                                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                                placeholder="Full name"
                                                className="flow-input"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Email</span>
                                            <input
                                                type="email"
                                                value={form.email}
                                                disabled={!!editing}
                                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                                placeholder="name@company.com"
                                                className="flow-input disabled:opacity-60"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                Job title <span className="text-grey">(optional)</span>
                                            </span>
                                            <input
                                                value={form.title}
                                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                                placeholder="e.g. Chief Search Strategist"
                                                className="flow-input"
                                            />
                                        </label>
                                        {!editing && (
                                            <label className="block">
                                                <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                    Temporary password
                                                </span>
                                                <input
                                                    type="text"
                                                    value={form.password}
                                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                                    placeholder="At least 8 characters"
                                                    className="flow-input"
                                                />
                                            </label>
                                        )}
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Role</span>
                                            <Select
                                                variant="field"
                                                ariaLabel="Role"
                                                value={form.roleKey}
                                                onChange={(v) => setForm({ ...form, roleKey: v })}
                                                options={roles.map((r) => ({ value: r.key, label: r.name }))}
                                            />
                                        </label>
                                        {editing && (
                                            <>
                                                <div className="grid grid-cols-[7rem_1fr] gap-3">
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Weekly goal</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={100}
                                                            value={form.weeklyGoal}
                                                            onChange={(e) => setForm({ ...form, weeklyGoal: e.target.value })}
                                                            placeholder={String(defaultGoal)}
                                                            className="flow-input"
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                                            Focus topic <span className="text-grey">(optional)</span>
                                                        </span>
                                                        <input
                                                            value={form.weeklyGoalTopic}
                                                            onChange={(e) => setForm({ ...form, weeklyGoalTopic: e.target.value })}
                                                            placeholder="e.g. Rebrand case studies"
                                                            className="flow-input"
                                                        />
                                                    </label>
                                                </div>
                                                <p className="-mt-2 text-caption-2 text-grey">Pieces published or scheduled per week. Blank = workspace default ({defaultGoal}).</p>
                                            </>
                                        )}
                                        {editing && (
                                            <div className="flex items-center justify-between rounded-2xl bg-lavender-mist/60 px-4 py-3 dark:bg-dark-2">
                                                <span className="text-title text-black dark:text-white">Active</span>
                                                <Switch
                                                    checked={form.isActive}
                                                    onChange={(v) => setForm({ ...form, isActive: v })}
                                                    aria-label="Active"
                                                />
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
                                            disabled={saving || (!editing && (!form.email || form.password.length < 8))}
                                            className="btn-primary grow disabled:opacity-60"
                                        >
                                            {saving ? "Saving…" : editing ? "Save changes" : "Send invite"}
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

export default Team;
