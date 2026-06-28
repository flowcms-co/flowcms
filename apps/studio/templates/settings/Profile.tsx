"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { useRole } from "@/components/providers/RoleProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { AVATAR_POOL, characterSrc, resolveCharacter } from "@/lib/avatar";
import { notificationPrefs } from "@/mocks/settings";

/**
 * Profile settings — identity, notification preferences, password, danger zone.
 * Everything here is live: name/title save to the account, prefs persist, the
 * password modal and self-delete hit the API.
 */
const Profile = () => {
    const { meta } = useRole();
    const { user, refresh, signout } = useAuth();
    const router = useRouter();

    const [name, setName] = useState(user?.name ?? "");
    const [title, setTitle] = useState(user?.title ?? "");
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMsg, setProfileMsg] = useState<string | null>(null);

    // Notification toggles — labels come from the catalog, on/off persists per user.
    const [prefs, setPrefs] = useState(notificationPrefs.map((p) => ({ ...p })));

    const loadPrefs = useCallback(async () => {
        try {
            const { prefs: saved } = await api<{ prefs: Record<string, boolean> }>("/auth/notifications");
            setPrefs((prev) => prev.map((p) => (p.id in saved ? { ...p, on: saved[p.id] } : p)));
        } catch {
            /* keep defaults */
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadPrefs();
    }, [loadPrefs]);

    const togglePref = async (id: string, on: boolean) => {
        const next = prefs.map((p) => (p.id === id ? { ...p, on } : p));
        setPrefs(next);
        try {
            await api("/auth/notifications", {
                method: "PATCH",
                body: JSON.stringify({ prefs: Object.fromEntries(next.map((p) => [p.id, p.on])) }),
            });
        } catch {
            setPrefs((prev) => prev.map((p) => (p.id === id ? { ...p, on: !on } : p))); // revert
        }
    };

    const saveProfile = async () => {
        setSavingProfile(true);
        setProfileMsg(null);
        try {
            await api("/auth/profile", { method: "PATCH", body: JSON.stringify({ name, title }) });
            await refresh();
            setProfileMsg("Saved");
            setTimeout(() => setProfileMsg(null), 2000);
        } catch (e) {
            setProfileMsg(e instanceof ApiError ? e.message : "Couldn't save.");
        } finally {
            setSavingProfile(false);
        }
    };

    // Avatar character picker.
    const [character, setCharacter] = useState(user?.avatarStyle || "");
    const selectedChar = resolveCharacter(character, user?.id || user?.email || "you");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [draft, setDraft] = useState(selectedChar);
    const [savingAvatar, setSavingAvatar] = useState(false);

    const openPicker = () => {
        setDraft(selectedChar);
        setPickerOpen(true);
    };
    const saveAvatar = async () => {
        setSavingAvatar(true);
        try {
            await api("/auth/avatar", { method: "PATCH", body: JSON.stringify({ avatarStyle: draft }) });
            setCharacter(draft);
            await refresh();
            setPickerOpen(false);
        } catch {
            /* ignore */
        } finally {
            setSavingAvatar(false);
        }
    };

    // Change-password modal.
    const [pwOpen, setPwOpen] = useState(false);
    const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
    const [pwBusy, setPwBusy] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);
    const submitPassword = async () => {
        if (pw.next !== pw.confirm) {
            setPwError("New passwords don't match.");
            return;
        }
        setPwBusy(true);
        setPwError(null);
        try {
            await api("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
            setPwOpen(false);
            setPw({ current: "", next: "", confirm: "" });
        } catch (e) {
            setPwError(e instanceof ApiError ? e.message : "Couldn't change password.");
        } finally {
            setPwBusy(false);
        }
    };

    // Delete-account modal.
    const [delOpen, setDelOpen] = useState(false);
    const [delPassword, setDelPassword] = useState("");
    const [delBusy, setDelBusy] = useState(false);
    const [delError, setDelError] = useState<string | null>(null);
    const submitDelete = async () => {
        setDelBusy(true);
        setDelError(null);
        try {
            await api("/auth/account", { method: "DELETE", body: JSON.stringify({ password: delPassword }) });
            await signout().catch(() => {});
            router.replace("/login");
        } catch (e) {
            setDelError(e instanceof ApiError ? e.message : "Couldn't delete the account.");
            setDelBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-5">Profile</h2>
                <div className="mb-6 flex flex-col gap-3 rounded-lg bg-grey-light/30 p-4 sm:flex-row sm:items-center sm:gap-4 dark:bg-white/[0.04]">
                    <div className="flex min-w-0 grow items-center gap-4">
                        <Image src={characterSrc(selectedChar)} alt="Your avatar" width={72} height={72} unoptimized className="h-16 w-16 shrink-0 rounded-full bg-lavender-mist object-cover sm:h-18 sm:w-18" />
                        <div className="min-w-0">
                            <span className="block text-caption-1 font-semibold text-black dark:text-white">Your avatar</span>
                            <p className="text-caption-2 text-grey">A friendly character for your profile.</p>
                        </div>
                    </div>
                    <button type="button" onClick={openPicker} className="btn-secondary h-9 w-full shrink-0 px-3.5 text-caption-1 sm:w-auto">
                        Change avatar
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Full name">
                        <input value={name} onChange={(e) => setName(e.target.value)} className="flow-input" />
                    </Field>
                    <Field label="Title">
                        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Content Lead" className="flow-input" />
                    </Field>
                    <Field label="Email">
                        <input value={user?.email ?? meta.user.email} readOnly className="flow-input opacity-70" />
                    </Field>
                    <Field label="Role">
                        <input value={meta.label} readOnly className="flow-input opacity-70" />
                    </Field>
                </div>
                <div className="mt-5 flex items-center justify-end gap-3">
                    {profileMsg && <span className="text-caption-2 text-grey">{profileMsg}</span>}
                    <button type="button" onClick={saveProfile} disabled={savingProfile} className="btn-primary disabled:opacity-60">
                        {savingProfile ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </Card>

            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-1">Notifications</h2>
                <p className="text-caption-2 text-grey mb-4">Choose what we email you about.</p>
                <div className="flex flex-col">
                    {prefs.map((p) => (
                        <label
                            key={p.id}
                            className="flex items-center justify-between gap-4 py-3 border-b border-grey-light last:border-b-0 cursor-pointer dark:border-grey-light/10"
                        >
                            <span className="text-body-sm text-black dark:text-white">{p.label}</span>
                            <Switch checked={p.on} onChange={(v) => void togglePref(p.id, v)} aria-label={p.label} />
                        </label>
                    ))}
                </div>
            </Card>

            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-4">Password</h2>
                <button type="button" onClick={() => setPwOpen(true)} className="btn-secondary">
                    <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="lock" />
                    Change password
                </button>
            </Card>

            <Card className="!border !border-error/20">
                <h2 className="text-h5 text-error mb-1">Danger zone</h2>
                <p className="text-caption-2 text-grey mb-4">
                    Permanently delete your account and all associated data.
                </p>
                <button
                    type="button"
                    onClick={() => { setDelOpen(true); setDelError(null); setDelPassword(""); }}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-error/10 text-error font-bold transition-colors hover:bg-error/20"
                >
                    <Icon className="w-5 h-5 fill-error" name="trash" />
                    Delete account
                </button>
            </Card>

            {/* Change-password modal */}
            <Transition appear show={pwOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setPwOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" aria-hidden="true" />
                    </Transition.Child>
                    <div className="fixed inset-0 flex items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_1.5rem_3rem_rgba(26,26,46,0.25)] dark:bg-dark-1">
                                <Dialog.Title className="font-poppins text-h5 text-black dark:text-white">Change password</Dialog.Title>
                                {pwError && <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm text-error">{pwError}</div>}
                                <div className="mt-4 flex flex-col gap-3">
                                    <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password" className="flow-input" autoFocus />
                                    <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="New password (min 8 chars)" className="flow-input" />
                                    <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Confirm new password" className="flow-input" />
                                </div>
                                <div className="mt-6 flex justify-end gap-2">
                                    <button type="button" onClick={() => setPwOpen(false)} className="btn-ghost h-10 px-4">Cancel</button>
                                    <button type="button" onClick={submitPassword} disabled={pwBusy || !pw.current || pw.next.length < 8} className="btn-primary h-10 px-5 disabled:opacity-60">
                                        {pwBusy ? "Saving…" : "Update password"}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </Dialog>
            </Transition>

            {/* Delete-account modal */}
            <Transition appear show={delOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setDelOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" aria-hidden="true" />
                    </Transition.Child>
                    <div className="fixed inset-0 flex items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_1.5rem_3rem_rgba(26,26,46,0.25)] dark:bg-dark-1">
                                <Dialog.Title className="font-poppins text-h5 text-error">Delete your account</Dialog.Title>
                                <p className="mt-1 text-caption-2 text-grey">This permanently removes your account. Enter your password to confirm.</p>
                                {delError && <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm text-error">{delError}</div>}
                                <input type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} placeholder="Your password" className="flow-input mt-4" autoFocus />
                                <div className="mt-6 flex justify-end gap-2">
                                    <button type="button" onClick={() => setDelOpen(false)} className="btn-ghost h-10 px-4">Cancel</button>
                                    <button type="button" onClick={submitDelete} disabled={delBusy || !delPassword} className="btn-danger-solid h-10 px-5">
                                        {delBusy ? "Deleting…" : "Delete account"}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </Dialog>
            </Transition>

            {/* Avatar picker */}
            <Transition appear show={pickerOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setPickerOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" aria-hidden="true" />
                    </Transition.Child>
                    <div className="fixed inset-0 flex items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_1.5rem_3rem_rgba(26,26,46,0.25)] dark:bg-dark-1">
                                <Dialog.Title className="font-poppins text-h5 text-black dark:text-white">Choose your avatar</Dialog.Title>
                                <p className="mt-1 text-caption-2 text-grey">Pick a character. You can change it anytime.</p>
                                <div className="mt-5 grid grid-cols-5 gap-3 sm:grid-cols-7">
                                    {AVATAR_POOL.map((key) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setDraft(key)}
                                            aria-label={`Character ${key}`}
                                            aria-pressed={draft === key}
                                            className={`relative aspect-square overflow-hidden rounded-full bg-lavender-mist transition-transform hover:scale-105 dark:bg-dark-3 ${draft === key ? "ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-dark-1" : ""}`}
                                        >
                                            <Image src={characterSrc(key)} alt="" width={64} height={64} unoptimized className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-6 flex justify-end gap-2">
                                    <button type="button" onClick={() => setPickerOpen(false)} className="btn-ghost h-10 px-4">Cancel</button>
                                    <button type="button" onClick={saveAvatar} disabled={savingAvatar} className="btn-primary h-10 px-5 disabled:opacity-60">
                                        {savingAvatar ? "Saving…" : "Save avatar"}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-caption-1 text-grey">{label}</span>
        {children}
    </label>
);

export default Profile;
