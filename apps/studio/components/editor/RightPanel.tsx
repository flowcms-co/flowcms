"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import ScoreRing from "@/components/ui/ScoreRing";
import Select from "@/components/ui/Select";
import { api } from "@/lib/api";
import { runAi, aiErrorMessage, useAiProviders } from "@/lib/useAi";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlan } from "@/components/providers/LicenseProvider";
import { cn } from "@/lib/cn";
import { confirm } from "@/components/providers/ConfirmProvider";

type PanelTab = "seo" | "ai" | "review" | "schema" | "versions";
type EntryData = Record<string, unknown>;

const TABS: { id: PanelTab; label: string; icon: string }[] = [
    { id: "seo", label: "SEO", icon: "chart" },
    { id: "ai", label: "AI", icon: "sparkles" },
    { id: "review", label: "Review", icon: "check" },
    { id: "schema", label: "Schema", icon: "document" },
    { id: "versions", label: "Versions", icon: "clock" },
];

const str = (v: unknown) => (typeof v === "string" ? v : "");
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) =>
    text
        .split(/\n{2,}/)
        .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
        .join("");

type Props = {
    entryId: string | null;
    editor: Editor | null;
    title: string;
    data: EntryData;
    status: string;
    onReload: () => void;
    onStatus: (status: string) => void;
};

const RightPanel = ({ entryId, editor, title, data, status, onReload, onStatus }: Props) => {
    const [tab, setTab] = useState<PanelTab>("seo");

    /** Merge a partial into the entry's data (backend merges server-side too). */
    const patchData = useCallback(
        async (partial: EntryData) => {
            if (!entryId) return;
            await api(`/entries/${entryId}`, { method: "PATCH", body: JSON.stringify({ data: partial }) }).catch(() => {});
        },
        [entryId],
    );

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-1 p-2 border-b border-grey-light dark:border-grey-light/10">
                {TABS.map((t) => {
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            title={t.label}
                            aria-label={t.label}
                            aria-pressed={active}
                            className={cn(
                                "inline-flex shrink-0 items-center justify-center h-9 rounded-xl text-caption-1 font-semibold transition-all",
                                active ? "gap-1.5 px-3 bg-primary text-white" : "w-9 text-grey hover:text-primary hover:bg-lavender-mist dark:hover:bg-dark-3",
                            )}
                        >
                            <Icon className={cn("w-4 h-4 shrink-0", active ? "fill-white" : "fill-grey")} name={t.icon} />
                            {active && <span>{t.label}</span>}
                        </button>
                    );
                })}
            </div>

            <div className="grow overflow-y-auto scrollbar-thin p-4">
                {!entryId ? (
                    <p className="text-caption-2 text-grey">Save the document once to enable SEO, versions, and review tools.</p>
                ) : (
                    <>
                        {tab === "seo" && <SeoTab editor={editor} title={title} data={data} patchData={patchData} />}
                        {tab === "ai" && <AiTab editor={editor} title={title} />}
                        {tab === "review" && <ReviewTab entryId={entryId} status={status} onStatus={onStatus} />}
                        {tab === "schema" && <SchemaTab title={title} data={data} patchData={patchData} />}
                        {tab === "versions" && <VersionsTab entryId={entryId} onReload={onReload} />}
                    </>
                )}
            </div>
        </div>
    );
};

/* ---------------- SEO ---------------- */
const SeoTab = ({ editor, title, data, patchData }: { editor: Editor | null; title: string; data: EntryData; patchData: (p: EntryData) => Promise<void> }) => {
    const { user } = useAuth();
    const { has } = usePlan();
    // advanced_rbac (Pro): this role can't edit SEO / metadata.
    const locked = !!user?.role.lockSeoMeta && has("advanced_rbac");
    // The meta title stays "linked" to the page title (mirroring it live) until the
    // user types a custom one; then `customMeta` holds the override. The backend
    // applies the same rule on save. Deriving the shown value (rather than syncing it
    // in an effect) keeps title edits reflected without a cascading re-render.
    const [customMeta, setCustomMeta] = useState(str(data.metaTitle));
    const [metaLinked, setMetaLinked] = useState(() => {
        const m = str(data.metaTitle).trim();
        return !m || m === title.trim();
    });
    const metaTitle = metaLinked ? title : customMeta;
    const [metaDescription, setMetaDescription] = useState(str(data.metaDescription));
    const [focusKeyword, setFocusKeyword] = useState(str(data.focusKeyword));
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const bodyText = editor?.getText() ?? "";
    const checks = useMemo(() => {
        const kw = focusKeyword.trim().toLowerCase();
        return [
            { label: "Meta title length", ok: metaTitle.length >= 30 && metaTitle.length <= 60, hint: `${metaTitle.length} chars (aim 30–60)` },
            { label: "Meta description length", ok: metaDescription.length >= 70 && metaDescription.length <= 160, hint: `${metaDescription.length} chars (aim 70–160)` },
            { label: "Focus keyword set", ok: kw.length > 0, hint: kw ? `“${focusKeyword}”` : "Add a focus keyword" },
            { label: "Keyword in title", ok: !!kw && metaTitle.toLowerCase().includes(kw), hint: "Use the keyword in the title" },
            { label: "Keyword in content", ok: !!kw && bodyText.toLowerCase().includes(kw), hint: "Mention the keyword in the body" },
            { label: "Content length", ok: bodyText.trim().split(/\s+/).filter(Boolean).length >= 300, hint: `${bodyText.trim().split(/\s+/).filter(Boolean).length} words (aim 300+)` },
        ];
    }, [metaTitle, metaDescription, focusKeyword, bodyText]);
    const passed = checks.filter((c) => c.ok).length;
    const score = Math.round((passed / checks.length) * 100);

    const save = async () => {
        setSaving(true);
        await patchData({ metaTitle, metaDescription, focusKeyword });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
                <ScoreRing value={score} label="SEO" size={96} />
                <div>
                    <div className="text-title text-black dark:text-white">{passed} / {checks.length} checks pass</div>
                    <p className="mt-1 text-caption-2 text-grey">Live score updates as you edit.</p>
                </div>
            </div>

            {locked && (
                <div className="flex items-center gap-2 rounded-2xl bg-warning/10 px-3 py-2.5 text-caption-1 text-warning">
                    <Icon className="h-4 w-4 shrink-0 fill-warning" name="lock" />
                    <span>SEO &amp; metadata are read-only for your role.</span>
                </div>
            )}

            <div className="flex flex-col gap-1.5">
                <Field label="Meta title">
                    <input
                        value={metaTitle}
                        onChange={(e) => {
                            const v = e.target.value;
                            setCustomMeta(v);
                            setMetaLinked(v.trim() === "" || v.trim() === title.trim());
                        }}
                        disabled={locked}
                        className="flow-input disabled:opacity-60"
                    />
                </Field>
                {!locked && (
                    <p className="text-[0.6875rem] text-grey">
                        {metaLinked ? (
                            "Linked to the page title — title edits update this automatically."
                        ) : (
                            <>
                                Custom meta title.{" "}
                                <button type="button" onClick={() => { setMetaLinked(true); setCustomMeta(""); }} className="text-primary underline">
                                    Reset to page title
                                </button>
                            </>
                        )}
                    </p>
                )}
            </div>
            <Field label="Meta description"><textarea rows={3} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} disabled={locked} className="flow-input resize-none disabled:opacity-60" /></Field>
            <Field label="Focus keyword"><input value={focusKeyword} onChange={(e) => setFocusKeyword(e.target.value)} disabled={locked} className="flow-input disabled:opacity-60" /></Field>

            {!locked && (
                <div className="flex items-center gap-3">
                    <button type="button" onClick={save} disabled={saving} className="btn-primary h-9 px-4 text-caption-1 disabled:opacity-60">{saving ? "Saving…" : "Save SEO"}</button>
                    {saved && <span className="text-caption-2 text-grey">Saved</span>}
                </div>
            )}

            <div className="flex flex-col gap-2">
                {checks.map((s) => (
                    <div key={s.label} className="flex items-start gap-2.5 rounded-xl border border-grey-light p-2.5 dark:border-grey-light/10">
                        <span className={cn("mt-0.5 flex items-center justify-center w-4 h-4 rounded-full shrink-0", s.ok ? "bg-success/15" : "bg-warning/15")}>
                            <Icon className={cn("w-3 h-3", s.ok ? "fill-success" : "fill-warning")} name={s.ok ? "check" : "clock"} />
                        </span>
                        <div>
                            <div className="text-body-sm text-black dark:text-white">{s.label}</div>
                            <div className="text-caption-2 text-grey">{s.hint}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ---------------- AI ---------------- */
const AI_ACTIONS = [
    { id: "improve", label: "Improve writing", icon: "sparkles", prompt: "Improve the clarity, flow, and tone of this content. Return only the rewritten content." },
    { id: "shorten", label: "Make shorter", icon: "arrow-up", prompt: "Make this content more concise without losing meaning. Return only the rewritten content." },
    { id: "expand", label: "Expand", icon: "plus", prompt: "Expand this content with more detail and examples. Return only the rewritten content." },
    { id: "grammar", label: "Fix grammar & spelling", icon: "check", prompt: "Fix all grammar and spelling errors. Return only the corrected content." },
];

const AiTab = ({ editor, title }: { editor: Editor | null; title: string }) => {
    const { hasProvider } = useAiProviders();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async (action: (typeof AI_ACTIONS)[number]) => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        const selected = editor.state.doc.textBetween(from, to, "\n");
        const source = selected || editor.getText();
        if (!source.trim()) {
            setError("Write or select some text first.");
            return;
        }
        setBusy(action.id);
        setError(null);
        try {
            const res = await runAi({ feature: "ai.refresh", prompt: `${action.prompt}\n\n---\n${source}`, maxTokens: 2000 });
            const html = toHtml(res.text.trim());
            if (selected) editor.chain().focus().insertContent(html).run();
            else editor.commands.setContent(html);
        } catch (e) {
            setError(aiErrorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    const generate = async () => {
        if (!editor) return;
        setBusy("generate");
        setError(null);
        try {
            const res = await runAi({ feature: "content.generate", prompt: `Write a well-structured article body for the title: “${title || "Untitled"}”. Use clear paragraphs and subheadings. Return only the article body.`, maxTokens: 3000 });
            editor.commands.setContent(toHtml(res.text.trim()));
        } catch (e) {
            setError(aiErrorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    if (!hasProvider) {
        return (
            <div className="rounded-2xl border border-dashed border-grey-light p-4 text-caption-2 text-grey dark:border-grey-light/15">
                Connect an AI provider in Settings → Integrations to use AI in the editor.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-caption-2 text-error">{error}</p>}
            <div>
                <div className="text-caption-1 text-grey mb-2">Quick actions {editor && editor.state.selection.empty ? "(whole document)" : "(selection)"}</div>
                <div className="flex flex-col gap-1.5">
                    {AI_ACTIONS.map((a) => (
                        <button key={a.id} type="button" onClick={() => void run(a)} disabled={!!busy} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-grey-light text-body-sm text-black transition-colors hover:border-primary hover:bg-lavender-mist disabled:opacity-60 dark:border-grey-light/10 dark:text-white dark:hover:bg-dark-3">
                            <Icon className="w-4 h-4 fill-primary" name={a.icon} />
                            {busy === a.id ? "Working…" : a.label}
                        </button>
                    ))}
                </div>
            </div>
            <button type="button" onClick={() => void generate()} disabled={!!busy} className="btn-primary h-11 w-full gap-2 disabled:opacity-60">
                <Icon className="w-5 h-5 fill-white" name="sparkles" />
                {busy === "generate" ? "Generating…" : "Generate draft from title"}
            </button>
            <p className="text-caption-2 text-grey">AI replaces the selected text, or the whole document when nothing is selected. Undo with Cmd/Ctrl+Z.</p>
        </div>
    );
};

/* ---------------- Schema ---------------- */
const SCHEMA_TYPES = ["BlogPosting", "Article", "NewsArticle", "WebPage", "Product", "FAQPage", "HowTo", "Recipe", "Event", "Organization"];
const SchemaTab = ({ title, data, patchData }: { title: string; data: EntryData; patchData: (p: EntryData) => Promise<void> }) => {
    const [schemaType, setSchemaType] = useState(str(data.jsonLdType) || "BlogPosting");
    const [canonical, setCanonical] = useState(str(data.canonical));
    const [robots, setRobots] = useState(str(data.robots) || "index, follow");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": schemaType, headline: title || "Untitled", ...(canonical ? { url: canonical } : {}) }, null, 2);

    const save = async () => {
        setSaving(true);
        await patchData({ jsonLdType: schemaType, canonical, robots });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="flex flex-col gap-5">
            <Field label="Schema type"><Select variant="field" ariaLabel="Schema type" value={schemaType} onChange={setSchemaType} options={SCHEMA_TYPES.map((t) => ({ value: t, label: t }))} /></Field>
            <Field label="Canonical URL"><input value={canonical} onChange={(e) => setCanonical(e.target.value)} placeholder="https://…" className="flow-input" /></Field>
            <Field label="Robots"><Select variant="field" ariaLabel="Robots" value={robots} onChange={setRobots} options={["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"].map((v) => ({ value: v, label: v }))} /></Field>
            <div>
                <div className="text-caption-1 text-grey mb-2">JSON-LD preview</div>
                <pre className="rounded-xl bg-ink p-3 text-caption-2 text-lilac overflow-x-auto">{jsonLd}</pre>
            </div>
            <div className="flex items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className="btn-primary h-9 px-4 text-caption-1 disabled:opacity-60">{saving ? "Saving…" : "Save schema"}</button>
                {saved && <span className="text-caption-2 text-grey">Saved</span>}
            </div>
        </div>
    );
};

/* ---------------- Versions ---------------- */
type Version = { id: string; versionNumber: number; status: string; title: string; author: string | null; createdAt: string };
const VersionsTab = ({ entryId, onReload }: { entryId: string; onReload: () => void }) => {
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);

    const load = useCallback(() => {
        setVersions(null);
        api<Version[]>(`/entries/${entryId}/versions`).then(setVersions).catch(() => setVersions([]));
    }, [entryId]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const restore = async (versionId: string) => {
        if (restoring) return;
        if (!(await confirm({ title: "Restore this version?", message: "The current content becomes a new version in history.", confirmLabel: "Restore" }))) return;
        setRestoring(versionId);
        try {
            await api(`/entries/${entryId}/versions/${versionId}/restore`, { method: "POST" });
            onReload();
            load();
        } finally {
            setRestoring(null);
        }
    };

    if (versions === null) return <p className="py-6 text-center text-caption-2 text-grey">Loading…</p>;
    if (versions.length === 0) return <p className="py-6 text-center text-caption-2 text-grey">No versions yet. Saves and status changes are snapshotted here.</p>;

    return (
        <ul className="flex flex-col">
            {versions.map((v, i) => (
                <li key={v.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < versions.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-grey-light dark:bg-grey-light/10" />}
                    <span className={cn("relative z-1 mt-1 shrink-0 w-3 h-3 rounded-full border-2", i === 0 ? "bg-primary border-primary" : "bg-white border-grey-light dark:bg-dark-1")} />
                    <div className="grow">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-body-sm text-black dark:text-white">v{v.versionNumber} · {v.status.toLowerCase()}</span>
                            {i !== 0 && (
                                <button type="button" onClick={() => void restore(v.id)} disabled={restoring === v.id} className="text-caption-2 text-primary transition-opacity hover:opacity-70 disabled:opacity-50">
                                    {restoring === v.id ? "Restoring…" : "Restore"}
                                </button>
                            )}
                        </div>
                        <div className="text-caption-2 text-grey">{v.author ?? "—"} · {new Date(v.createdAt).toLocaleString()}</div>
                    </div>
                </li>
            ))}
        </ul>
    );
};

/* ---------------- Review ---------------- */
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", IN_REVIEW: "In review", APPROVED: "Approved", SCHEDULED: "Scheduled", PUBLISHED: "Published", ARCHIVED: "Archived" };
type ReviewRow = { reviewer: string; decision: "APPROVED" | "CHANGES_REQUESTED"; note: string | null; at: string };
type ReviewsResp = { status: string; approvalsRequired: number; approvals: number; isApproved: boolean; reviews: ReviewRow[] };

const ReviewTab = ({ entryId, status, onStatus }: { entryId: string; status: string; onStatus: (s: string) => void }) => {
    const { can } = useAuth();
    const canPublish = can("content.publish");
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");
    const [info, setInfo] = useState<ReviewsResp | null>(null);

    const load = useCallback(async () => {
        try {
            setInfo(await api<ReviewsResp>(`/entries/${entryId}/reviews`));
        } catch {
            /* ignore */
        }
    }, [entryId]);

    // Reload the sign-off state on mount + whenever the status changes. setInfo runs
    // after the awaited fetch (not synchronously) — the project's API-sync pattern.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load, status]);

    const setStatus = async (next: string) => {
        setBusy(true);
        try {
            await api(`/entries/${entryId}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
            onStatus(next);
        } finally {
            setBusy(false);
        }
    };

    const decide = async (decision: "approve" | "request_changes") => {
        setBusy(true);
        try {
            const r = await api<ReviewsResp>(`/entries/${entryId}/review`, {
                method: "POST",
                body: JSON.stringify({ decision, note: note.trim() || undefined }),
            });
            setInfo(r);
            setNote("");
            if (r.status && r.status !== status) onStatus(r.status);
        } finally {
            setBusy(false);
        }
    };

    const publishNow = async () => {
        setBusy(true);
        try {
            await api(`/entries/${entryId}/publish`, { method: "POST" });
            onStatus("PUBLISHED");
        } finally {
            setBusy(false);
        }
    };

    const required = info?.approvalsRequired ?? 1;
    const approvals = info?.approvals ?? 0;
    const reviews = info?.reviews ?? [];
    const showApprovals = status === "IN_REVIEW" || status === "APPROVED" || reviews.length > 0;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-grey-light p-3 dark:border-grey-light/10">
                <span className="text-caption-1 text-grey">Status</span>
                <span className="text-title text-black dark:text-white">{STATUS_LABEL[status] ?? status}</span>
            </div>

            {/* Sign-off progress + decisions */}
            {showApprovals && (
                <div className="rounded-2xl border border-grey-light p-3 dark:border-grey-light/10">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-caption-1 text-grey">Approvals</span>
                        <span className={cn("text-title font-semibold", approvals >= required ? "text-success" : "text-black dark:text-white")}>
                            {Math.min(approvals, required)} of {required}
                        </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-lavender-mist dark:bg-dark-3">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min(100, required ? (approvals / required) * 100 : 0)}%` }} />
                    </div>
                    {reviews.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-2.5">
                            {reviews.map((r, i) => (
                                <li key={i} className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide", r.decision === "APPROVED" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                                            {r.decision === "APPROVED" ? "Approved" : "Changes"}
                                        </span>
                                        <span className="truncate text-caption-2 text-black dark:text-white">{r.reviewer}</span>
                                        <span className="ml-auto shrink-0 text-[0.6875rem] text-grey">{new Date(r.at).toLocaleDateString()}</span>
                                    </div>
                                    {r.note && <p className="text-caption-2 text-grey">{r.note}</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
                {status === "DRAFT" && (
                    <button type="button" onClick={() => void setStatus("IN_REVIEW")} disabled={busy} className="btn-primary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                        Submit for review
                    </button>
                )}
                {status === "IN_REVIEW" && canPublish && (
                    <>
                        <button type="button" onClick={() => void decide("approve")} disabled={busy} className="btn-primary h-9 px-3.5 text-caption-1 disabled:opacity-60">Approve</button>
                        <button type="button" onClick={() => void decide("request_changes")} disabled={busy} className="btn-secondary h-9 px-3.5 text-caption-1 disabled:opacity-60">Request changes</button>
                    </>
                )}
                {status === "IN_REVIEW" && !canPublish && <p className="text-caption-2 text-grey">Submitted. Waiting for a reviewer to sign off.</p>}
                {status === "APPROVED" && canPublish && (
                    <button type="button" onClick={() => void publishNow()} disabled={busy} className="btn-primary h-9 px-3.5 text-caption-1 disabled:opacity-60">Publish now</button>
                )}
                {status === "APPROVED" && (
                    <button type="button" onClick={() => void setStatus("DRAFT")} disabled={busy} className="btn-secondary h-9 px-3.5 text-caption-1 disabled:opacity-60">Back to draft</button>
                )}
            </div>

            {/* Decision note */}
            {status === "IN_REVIEW" && canPublish && (
                <div className="border-t border-grey-light pt-4 dark:border-grey-light/10">
                    <div className="mb-2 text-caption-1 text-grey">Note for the author (optional)</div>
                    <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note with your decision…" className="flow-input resize-none" />
                    <p className="mt-1.5 text-[0.6875rem] text-grey">Attaches to your next Approve / Request changes.</p>
                </div>
            )}
        </div>
    );
};

/* ---------------- shared ---------------- */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-caption-1 text-grey">{label}</span>
        {children}
    </label>
);

export default RightPanel;
