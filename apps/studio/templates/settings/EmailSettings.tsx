"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { api, ApiError } from "@/lib/api";
import { confirm } from "@/components/providers/ConfirmProvider";
import { cn } from "@/lib/cn";

type EmailProvider = "smtp" | "resend" | "sendgrid";
type Status = { connected: boolean; provider?: EmailProvider; host?: string; port?: number; user?: string; from?: string };
type Template = { key: string; name: string; subject: string; html: string; enabled: boolean; customized: boolean };

const PROVIDERS: { id: EmailProvider; label: string }[] = [
    { id: "smtp", label: "SMTP" },
    { id: "resend", label: "Resend" },
    { id: "sendgrid", label: "SendGrid" },
];

const field = "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

/**
 * Email settings — connect an SMTP server (password encrypted at rest), send a
 * test, and customize the transactional email templates. Sending stays a no-op
 * until SMTP is connected; invites / password-resets / alerts then go out.
 */
const EmailSettings = () => {
    const [status, setStatus] = useState<Status | null>(null);
    const [provider, setProvider] = useState<EmailProvider>("smtp");
    const [form, setForm] = useState({ host: "", port: "587", user: "", password: "", apiKey: "", from: "" });
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
            if (s.connected) {
                setProvider(s.provider ?? "smtp");
                setForm((f) => ({ ...f, host: s.host ?? "", port: String(s.port ?? 587), user: s.user ?? "", from: s.from ?? "" }));
            }
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
            const body =
                provider === "smtp"
                    ? { provider, host: form.host.trim(), port: Number(form.port) || 587, user: form.user.trim(), password: form.password, from: form.from.trim() }
                    : { provider, apiKey: form.apiKey, from: form.from.trim() };
            await api("/mail/connect", { method: "POST", body: JSON.stringify(body) });
            setForm((f) => ({ ...f, password: "", apiKey: "" }));
            await load();
            setMsg({ ok: true, text: `${PROVIDERS.find((p) => p.id === provider)?.label} saved.` });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    const disconnect = async () => {
        if (!(await confirm({ title: "Disconnect email?", message: "Outgoing email will stop.", confirmLabel: "Disconnect", tone: "danger" }))) return;
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

    const resetTemplate = async (t: Template) => {
        if (!(await confirm({ title: `Reset “${t.name}”?`, message: "Your customized subject and HTML will be replaced by the built-in default design.", confirmLabel: "Reset to default", tone: "danger" }))) return;
        await api(`/mail/templates/${t.key}`, { method: "DELETE" });
        await load();
        setOpenKey(null);
    };

    // The secret can be left blank when re-saving the already-connected provider (it's preserved).
    const secretKnown = !!status?.connected && status.provider === provider;
    const canSubmit =
        !!form.from.trim() &&
        (provider === "smtp"
            ? !!form.host.trim() && !!form.user.trim() && (secretKnown || !!form.password)
            : secretKnown || !!form.apiKey);

    return (
        <div className="flex flex-col gap-6">
            {/* Connection */}
            <Card className="flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                    <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="w-5 h-5 fill-primary" name="mail" />
                    </span>
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">Email delivery</h2>
                        <p className="text-caption-2 text-grey">
                            {status?.connected
                                ? `Connected · ${status.provider === "resend" ? "Resend" : status.host}`
                                : "Not connected: email is logged but not sent."}
                        </p>
                    </div>
                    {status?.connected && (
                        <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-success/10 text-success text-caption-2 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" /> Connected
                        </span>
                    )}
                </div>

                {/* Provider selector */}
                <div className="mb-5 inline-flex items-center gap-1 rounded-2xl bg-lavender-mist p-1 dark:bg-dark-3">
                    {PROVIDERS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setProvider(p.id)}
                            className={cn(
                                "h-8 rounded-xl px-4 text-caption-1 font-semibold transition-colors",
                                provider === p.id ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey hover:text-primary",
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {provider !== "smtp" ? (
                    <div className="grid grid-cols-1 gap-4">
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">API key</span><input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={secretKnown ? "•••••••• (unchanged)" : provider === "resend" ? "re_..." : "SG...."} className={field} /></label>
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">From address</span><input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Flow CMS <noreply@yourdomain.com>" className={field} /></label>
                        {provider === "resend" ? (
                            <p className="text-caption-2 text-grey">Create an API key at <span className="font-mono">resend.com/api-keys</span>. The from domain must be verified in your Resend account.</p>
                        ) : (
                            <p className="text-caption-2 text-grey">Create an API key with Mail Send access at <span className="font-mono">app.sendgrid.com</span>. The from address must use a verified sender or domain.</p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Host</span><input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.postmarkapp.com" className={field} /></label>
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Port</span><input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="587" className={field} /></label>
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Username</span><input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="apikey / SMTP user" className={field} /></label>
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Password</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={status?.connected && status.provider === "smtp" ? "•••••••• (unchanged)" : "SMTP password / API key"} className={field} /></label>
                        <label className="block sm:col-span-2"><span className="mb-1.5 block text-caption-1 text-grey">From address</span><input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Flow CMS <noreply@yourdomain.com>" className={field} /></label>
                    </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={connect} disabled={saving || !canSubmit} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : status?.connected && status.provider === provider ? "Update" : `Connect ${PROVIDERS.find((p) => p.id === provider)?.label}`}
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
                            {openKey === t.key && <TemplateEditor template={t} onSave={saveTemplate} onReset={resetTemplate} />}
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

/* ── Template editor: code editor + live preview ─────────────────────────── */

/** Same token substitution the API applies at send time. */
const renderTokens = (tpl: string, vars: Record<string, string>) =>
    tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");

/** Sample values so the preview renders like a real send. */
const SAMPLE_VARS: Record<string, Record<string, string>> = {
    welcome: { name: "Sarah" },
    invite: { name: "Daniel", inviter: "Sarah Whitfield", role: "Editor", link: "#" },
    reset_password: { name: "Sarah", link: "#" },
    content_published: { name: "Sarah", title: "Rebranding without the risk", link: "#" },
    alert: { name: "Sarah", title: "Weekly SEO scan finished", body: "Your scheduled scan found 3 quick wins and fixed 12 safe issues automatically.", link: "#" },
    digest: { name: "Sarah", count: "4", plural: "s", items: "“Rebranding without the risk” was published<br>Daniel submitted “Voice search in 2026” for review<br>2 assets were added to the library", link: "#" },
};

/** Tokens each template understands (chips insert them at the cursor). */
const TEMPLATE_VARS: Record<string, string[]> = {
    welcome: ["name", "workspace", "studioUrl"],
    invite: ["name", "inviter", "role", "link", "workspace", "studioUrl"],
    reset_password: ["name", "link", "workspace", "studioUrl"],
    content_published: ["name", "title", "link", "workspace", "studioUrl"],
    alert: ["name", "title", "body", "link", "workspace", "studioUrl"],
    digest: ["name", "count", "plural", "items", "link", "workspace", "studioUrl"],
};

/**
 * Minimal code editor: dark chrome, line-number gutter (scroll-synced, exact
 * because wrapping is off), Tab inserts two spaces. No highlighting library —
 * the templates are hand-sized HTML and reliability beats color here.
 */
const CodeEditor = ({
    value,
    onChange,
    filename,
    taRef,
}: {
    value: string;
    onChange: (v: string) => void;
    filename: string;
    taRef: React.RefObject<HTMLTextAreaElement | null>;
}) => {
    const gutterRef = useRef<HTMLDivElement>(null);
    const lineCount = useMemo(() => value.split("\n").length, [value]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== "Tab") return;
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart: s, selectionEnd: en } = el;
        onChange(value.slice(0, s) + "  " + value.slice(en));
        requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = s + 2;
        });
    };

    return (
        <div className="flex h-[30rem] flex-col overflow-hidden rounded-2xl bg-[#14141f] ring-1 ring-white/10">
            {/* Editor chrome */}
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 font-mono text-caption-2 text-white/60">{filename}</span>
                <span className="ml-auto font-mono text-[0.6875rem] text-white/30">{lineCount} lines · HTML</span>
            </div>
            <div className="flex min-h-0 grow">
                <div ref={gutterRef} className="w-11 shrink-0 select-none overflow-hidden border-r border-white/[0.07] py-3 text-right font-mono text-caption-2 leading-5 text-white/25">
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i} className="pr-2.5">{i + 1}</div>
                    ))}
                </div>
                <textarea
                    ref={taRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onScroll={(e) => {
                        if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                    }}
                    onKeyDown={onKeyDown}
                    spellCheck={false}
                    wrap="off"
                    className="min-h-0 grow resize-none overflow-auto bg-transparent px-3 py-3 font-mono text-caption-2 leading-5 text-[#e6e4f5] caret-lilac outline-none selection:bg-primary/40 scrollbar-thin scrollbar-thumb-white/15"
                />
            </div>
        </div>
    );
};

const TemplateEditor = ({ template, onSave, onReset }: { template: Template; onSave: (t: Template) => void; onReset: (t: Template) => void }) => {
    const [t, setT] = useState(template);
    const [view, setView] = useState<"split" | "code" | "preview">("split");
    const taRef = useRef<HTMLTextAreaElement>(null);

    const insertVar = (name: string) => {
        const token = `{{${name}}}`;
        const el = taRef.current;
        if (!el) return setT((cur) => ({ ...cur, html: cur.html + token }));
        const s = el.selectionStart ?? t.html.length;
        const en = el.selectionEnd ?? s;
        setT((cur) => ({ ...cur, html: cur.html.slice(0, s) + token + cur.html.slice(en) }));
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = s + token.length;
        });
    };

    // Live preview: the same substitution the server applies, with sample data.
    // {{studioUrl}} resolves to this studio, so /email/* illustrations load.
    const previewHtml = useMemo(() => {
        const vars = {
            studioUrl: typeof window === "undefined" ? "" : window.location.origin,
            workspace: "Your workspace",
            ...(SAMPLE_VARS[template.key] ?? {}),
        };
        return renderTokens(t.html, vars);
    }, [t.html, template.key]);

    const views: { id: typeof view; label: string }[] = [
        { id: "split", label: "Split" },
        { id: "code", label: "Code" },
        { id: "preview", label: "Preview" },
    ];

    return (
        <div className="flex flex-col gap-4 border-t border-grey-light p-4 dark:border-grey-light/10">
            <label className="block">
                <span className="mb-1.5 block text-caption-1 text-grey">Subject</span>
                <input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} className={field} />
            </label>

            {/* Variables + view switch */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption-2 text-grey">Variables:</span>
                {(TEMPLATE_VARS[template.key] ?? []).map((v) => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => insertVar(v)}
                        title={`Insert {{${v}}} at the cursor`}
                        className="rounded-lg bg-lavender-mist px-2 py-1 font-mono text-caption-2 font-semibold text-primary transition-colors hover:bg-purple-100 dark:bg-dark-3 dark:text-lilac dark:hover:bg-dark-3/60"
                    >
                        {`{{${v}}}`}
                    </button>
                ))}
                <div className="ml-auto inline-flex items-center gap-1 rounded-xl bg-lavender-mist p-1 dark:bg-dark-3">
                    {views.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => setView(m.id)}
                            className={cn(
                                "h-7 rounded-lg px-3 text-caption-2 font-semibold transition-colors",
                                view === m.id ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey hover:text-primary",
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Editor + live preview */}
            <div className={cn("grid gap-4", view === "split" && "xl:grid-cols-2")}>
                {view !== "preview" && (
                    <CodeEditor value={t.html} onChange={(html) => setT({ ...t, html })} filename={`${template.key}.html`} taRef={taRef} />
                )}
                {view !== "code" && (
                    <div className="flex h-[30rem] flex-col overflow-hidden rounded-2xl border border-grey-light dark:border-grey-light/10">
                        <div className="flex shrink-0 items-center gap-2 border-b border-grey-light bg-lavender-mist/50 px-4 py-2.5 dark:border-grey-light/10 dark:bg-dark-3/40">
                            <Icon name="eye" className="h-3.5 w-3.5 fill-grey" />
                            <span className="text-caption-2 font-semibold text-grey">Live preview · sample data</span>
                        </div>
                        <iframe title="Email preview" sandbox="" srcDoc={previewHtml} className="min-h-0 w-full grow bg-[#f4f2fb]" />
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-caption-1 text-black dark:text-white">
                    <Switch checked={t.enabled} onChange={(enabled) => setT({ ...t, enabled })} aria-label="Template enabled" />
                    Enabled
                </label>
                <div className="ml-auto flex items-center gap-2">
                    {template.customized && (
                        <button type="button" onClick={() => onReset(t)} className="btn-ghost h-9 px-4 text-caption-1 text-grey hover:text-error">
                            Reset to default
                        </button>
                    )}
                    <button type="button" onClick={() => onSave(t)} className="btn-primary h-9 px-4 text-caption-1">
                        Save template
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmailSettings;
