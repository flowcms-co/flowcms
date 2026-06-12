"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";

type Status = { connected: boolean; host?: string; port?: number; user?: string; from?: string };
type Template = { key: string; name: string; subject: string; html: string; enabled: boolean; customized: boolean };

const field = "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

/**
 * Email settings — connect an SMTP server (password encrypted at rest), send a
 * test, and customize the transactional email templates. Sending stays a no-op
 * until SMTP is connected; invites / password-resets / alerts then go out.
 */
const EmailSettings = () => {
    const [status, setStatus] = useState<Status | null>(null);
    const [form, setForm] = useState({ host: "", port: "587", user: "", password: "", from: "" });
    const [saving, setSaving] = useState(false);
    const [testTo, setTestTo] = useState("");
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [openKey, setOpenKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [s, t] = await Promise.all([api<Status>("/mail/status"), api<Template[]>("/mail/templates")]);
            setStatus(s);
            setTemplates(t);
            if (s.connected) setForm((f) => ({ ...f, host: s.host ?? "", port: String(s.port ?? 587), user: s.user ?? "", from: s.from ?? "" }));
        } catch {
            setStatus({ connected: false });
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const connect = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api("/mail/connect", {
                method: "POST",
                body: JSON.stringify({ host: form.host.trim(), port: Number(form.port) || 587, user: form.user.trim(), password: form.password, from: form.from.trim() }),
            });
            setForm((f) => ({ ...f, password: "" }));
            await load();
            setMsg({ ok: true, text: "SMTP saved." });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save SMTP." });
        } finally {
            setSaving(false);
        }
    };

    const disconnect = async () => {
        if (!window.confirm("Disconnect SMTP? Outgoing email will stop.")) return;
        await api("/mail", { method: "DELETE" });
        await load();
    };

    const sendTest = async () => {
        setMsg(null);
        try {
            const r = await api<{ sent: boolean; reason?: string; error?: string }>("/mail/test", { method: "POST", body: JSON.stringify({ to: testTo.trim() }) });
            setMsg(r.sent ? { ok: true, text: `Test email sent to ${testTo}.` } : { ok: false, text: r.error || r.reason || "Not sent." });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Test failed." });
        }
    };

    const saveTemplate = async (t: Template) => {
        await api(`/mail/templates/${t.key}`, { method: "PATCH", body: JSON.stringify({ subject: t.subject, html: t.html, enabled: t.enabled }) });
        await load();
        setOpenKey(null);
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Connection */}
            <Card className="flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                    <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="w-5 h-5 fill-primary" name="mail" />
                    </span>
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">SMTP server</h2>
                        <p className="text-caption-2 text-grey">
                            {status?.connected ? `Connected · ${status.host}` : "Not connected: email is logged but not sent."}
                        </p>
                    </div>
                    {status?.connected && (
                        <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-success/10 text-success text-caption-2 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" /> Connected
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Host</span><input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.postmarkapp.com" className={field} /></label>
                    <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Port</span><input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="587" className={field} /></label>
                    <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Username</span><input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="apikey / SMTP user" className={field} /></label>
                    <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Password</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={status?.connected ? "•••••••• (unchanged)" : "SMTP password / API key"} className={field} /></label>
                    <label className="block sm:col-span-2"><span className="mb-1.5 block text-caption-1 text-grey">From address</span><input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Flow CMS <noreply@yourdomain.com>" className={field} /></label>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={connect} disabled={saving || !form.host.trim() || !form.user.trim() || (!status?.connected && !form.password) || !form.from.trim()} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : status?.connected ? "Update" : "Connect SMTP"}
                    </button>
                    {status?.connected && (
                        <button type="button" onClick={disconnect} className="btn-secondary">Disconnect</button>
                    )}
                </div>

                {status?.connected && (
                    <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-grey-light pt-5 dark:border-grey-light/10">
                        <label className="block grow min-w-[14rem]"><span className="mb-1.5 block text-caption-1 text-grey">Send a test email</span><input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" className={field} /></label>
                        <button type="button" onClick={sendTest} disabled={!testTo.trim()} className="btn-secondary disabled:opacity-60">Send test</button>
                    </div>
                )}

                {msg && <div className={`mt-4 rounded-2xl px-4 py-3 text-body-sm ${msg.ok ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>{msg.text}</div>}
            </Card>

            {/* Templates */}
            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-1">Email templates</h2>
                <p className="text-caption-2 text-grey mb-4">Customize the transactional emails. Tokens like <code className="font-mono">{"{{name}}"}</code> and <code className="font-mono">{"{{link}}"}</code> are filled in automatically.</p>
                <div className="flex flex-col gap-2">
                    {templates.map((t) => (
                        <div key={t.key} className="rounded-2xl border border-grey-light dark:border-grey-light/10">
                            <button type="button" onClick={() => setOpenKey(openKey === t.key ? null : t.key)} className="flex w-full items-center gap-3 p-4 text-left">
                                <div className="min-w-0 grow">
                                    <div className="flex items-center gap-2">
                                        <span className="text-title text-black dark:text-white">{t.name}</span>
                                        {t.customized && <span className="px-2 py-0.5 rounded-md bg-lavender-mist text-[0.6875rem] font-semibold text-primary dark:bg-dark-3 dark:text-lilac">Custom</span>}
                                    </div>
                                    <div className="mt-0.5 truncate text-caption-2 text-grey">{t.subject}</div>
                                </div>
                                <Icon className={`w-4 h-4 fill-grey transition-transform ${openKey === t.key ? "rotate-180" : ""}`} name="arrow-down" />
                            </button>
                            {openKey === t.key && <TemplateEditor template={t} onSave={saveTemplate} />}
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

const TemplateEditor = ({ template, onSave }: { template: Template; onSave: (t: Template) => void }) => {
    const [t, setT] = useState(template);
    return (
        <div className="flex flex-col gap-3 border-t border-grey-light p-4 dark:border-grey-light/10">
            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Subject</span><input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} className={field} /></label>
            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">HTML body</span><textarea value={t.html} onChange={(e) => setT({ ...t, html: e.target.value })} rows={6} className={`${field} h-auto py-3 font-mono text-caption-1`} /></label>
            <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-caption-1 text-black dark:text-white">
                    <input type="checkbox" checked={t.enabled} onChange={(e) => setT({ ...t, enabled: e.target.checked })} className="accent-primary" /> Enabled
                </label>
                <button type="button" onClick={() => onSave(t)} className="btn-primary h-9 px-4 text-caption-1">Save template</button>
            </div>
        </div>
    );
};

export default EmailSettings;
