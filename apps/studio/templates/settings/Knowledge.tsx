"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { confirm } from "@/components/providers/ConfirmProvider";

type KFile = {
    id: string;
    name: string;
    content: string;
    kind: "doc" | "seo_memory";
    enabled: boolean;
    universal: boolean;
    contentTypeApiIds: string[];
    tools: string[];
    managed: boolean;
    updatedAt: string;
};
type ContentType = { id: string; name: string; apiId: string };

const TOOL_OPTIONS = [
    { key: "content.generate", label: "Content generation" },
    { key: "seo.meta_fix", label: "SEO meta fixes" },
    { key: "seo.schema_fix", label: "SEO schema" },
];

const blank = { name: "", content: "", universal: false, enabled: true, contentTypeApiIds: [] as string[], tools: [] as string[] };

/* ---------- Brand voice: a universal Brain file holding the word lists ---------- */
const VOICE_NAME = "Brand voice";
const isVoiceFile = (f: KFile) => f.kind === "doc" && f.universal && f.name.trim().toLowerCase() === VOICE_NAME.toLowerCase();

/** Pull "Words to use:" / "Words to avoid:" lines out of the file (tolerant of markdown + the old format). */
const parseVoice = (content: string): { use: string[]; avoid: string[] } => {
    const use: string[] = [];
    const avoid: string[] = [];
    for (const raw of content.split("\n")) {
        const line = raw.replace(/[*#`>]/g, "").trim();
        const lc = line.toLowerCase();
        const after = () =>
            line
                .slice(line.indexOf(":") + 1)
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s && s !== "—");
        if (lc.startsWith("words to use")) use.push(...after());
        else if (lc.startsWith("words to avoid")) avoid.push(...after());
    }
    return { use, avoid };
};

/** Render the word lists back into a clean, prompt-friendly markdown file. */
const buildVoice = (use: string[], avoid: string[]) =>
    [
        "# Brand voice",
        "",
        "Apply these word choices to all AI-generated content.",
        "",
        `Words to use: ${use.join(", ")}`,
        `Words to avoid: ${avoid.join(", ")}`,
        "",
    ].join("\n");

const Knowledge = () => {
    const [files, setFiles] = useState<KFile[]>([]);
    const [types, setTypes] = useState<ContentType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [refining, setRefining] = useState(false);

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<KFile | null>(null);
    const [form, setForm] = useState(blank);
    const [saving, setSaving] = useState(false);
    const importRef = useRef<HTMLInputElement>(null);

    // Brand voice word lists (backed by a universal Brain file).
    const [voiceId, setVoiceId] = useState<string | null>(null);
    const [useWords, setUseWords] = useState<string[]>([]);
    const [avoidWords, setAvoidWords] = useState<string[]>([]);
    const [useDraft, setUseDraft] = useState("");
    const [avoidDraft, setAvoidDraft] = useState("");
    const [voiceState, setVoiceState] = useState<"idle" | "saving" | "saved" | "error">("idle");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [f, t] = await Promise.all([
                api<KFile[]>("/knowledge"),
                api<ContentType[]>("/content-types").catch(() => [] as ContentType[]),
            ]);
            setFiles(f);
            setTypes(t);
            const voice = f.find(isVoiceFile);
            setVoiceId(voice?.id ?? null);
            const parsed = voice ? parseVoice(voice.content) : { use: [], avoid: [] };
            setUseWords(parsed.use);
            setAvoidWords(parsed.avoid);
            setError(null);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not load The Brain.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm(blank);
        setOpen(true);
    };
    const openEdit = (f: KFile) => {
        setEditing(f);
        setForm({ name: f.name, content: f.content, universal: f.universal, enabled: f.enabled, contentTypeApiIds: f.contentTypeApiIds, tools: f.tools });
        setOpen(true);
    };

    const save = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const body = JSON.stringify(form);
            if (editing) await api(`/knowledge/${editing.id}`, { method: "PATCH", body });
            else await api("/knowledge", { method: "POST", body });
            setOpen(false);
            await load();
        } catch (e) {
            window.alert(e instanceof ApiError ? e.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    };

    const saveVoice = async (use: string[], avoid: string[]) => {
        setVoiceState("saving");
        try {
            const content = buildVoice(use, avoid);
            if (voiceId) {
                await api(`/knowledge/${voiceId}`, { method: "PATCH", body: JSON.stringify({ name: VOICE_NAME, content, universal: true, enabled: true }) });
            } else {
                await api("/knowledge", { method: "POST", body: JSON.stringify({ name: VOICE_NAME, content, universal: true, enabled: true, contentTypeApiIds: [], tools: [] }) });
            }
            setVoiceState("saved");
            setTimeout(() => setVoiceState("idle"), 2000);
            await load();
        } catch (e) {
            setVoiceState("error");
            setError(e instanceof ApiError ? e.message : "Could not save brand voice.");
            setTimeout(() => setVoiceState("idle"), 3000);
        }
    };

    const addWord = (list: string[], set: (v: string[]) => void, draft: string, setDraft: (v: string) => void) => {
        const w = draft.trim().replace(/,$/, "");
        setDraft("");
        if (w && !list.some((x) => x.toLowerCase() === w.toLowerCase())) set([...list, w]);
    };

    const remove = async (f: KFile) => {
        if (!(await confirm({ title: `Delete "${f.name}"?`, confirmLabel: "Delete", tone: "danger" }))) return;
        try {
            await api(`/knowledge/${f.id}`, { method: "DELETE" });
            await load();
        } catch (e) {
            window.alert(e instanceof ApiError ? e.message : "Could not delete.");
        }
    };

    const exportMd = async (f: KFile) => {
        const res = await api<{ filename: string; content: string }>(`/knowledge/${f.id}/export`);
        const blob = new Blob([res.content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setForm((s) => ({ ...s, content: String(reader.result ?? ""), name: s.name || file.name.replace(/\.md$/i, "") }));
        reader.readAsText(file);
        e.target.value = "";
    };

    const refineMemory = async () => {
        setRefining(true);
        setNote(null);
        try {
            const r = await api<{ ok: boolean; reason?: string }>("/seo/learning/refine", { method: "POST" });
            setNote(r.ok ? "SEO memory refined into clean guidelines." : "Nothing to refine yet: accept a few SEO fixes first.");
            await load();
        } catch (e) {
            setNote(e instanceof ApiError ? e.message : "Could not refine.");
        } finally {
            setRefining(false);
        }
    };

    const toggleArr = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    const scopeLabel = (f: KFile) => {
        if (f.kind === "seo_memory") return "Auto-updated · SEO fixes";
        const parts: string[] = [];
        if (f.universal) parts.push("Universal");
        if (f.contentTypeApiIds.length) parts.push(`${f.contentTypeApiIds.length} content type${f.contentTypeApiIds.length > 1 ? "s" : ""}`);
        if (f.tools.length) parts.push(`${f.tools.length} tool${f.tools.length > 1 ? "s" : ""}`);
        return parts.length ? parts.join(" · ") : "Not assigned (won't be used)";
    };

    // The brand-voice file is edited via the dedicated card above, so keep it out of the file list.
    const listFiles = files.filter((f) => !isVoiceFile(f));

    return (
        <div className="flex flex-col gap-6">
            <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="h-5 w-5 fill-primary" name="document" />
                    </span>
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">The Brain</h2>
                        <p className="text-caption-2 text-grey">
                            {loading ? "Loading…" : `${listFiles.length} file${listFiles.length === 1 ? "" : "s"}`} · what your AI knows and how it writes, injected into every AI tool&rsquo;s prompt (any provider)
                        </p>
                    </div>
                </div>
                <button type="button" className="btn-primary" onClick={openCreate}>
                    <Icon className="h-5 w-5 fill-white" name="plus" />
                    New file
                </button>
            </Card>

            {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
            {note && <div className="rounded-2xl bg-success/10 px-4 py-3 text-body-sm text-success">{note}</div>}

            {/* Brand voice: words to use / avoid (a universal Brain file under the hood) */}
            <Card>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-h5 text-black dark:text-white">Brand voice</h3>
                    <button
                        type="button"
                        onClick={() => saveVoice(useWords, avoidWords)}
                        disabled={voiceState === "saving"}
                        className="btn-secondary h-9 px-3.5 text-caption-1 disabled:opacity-60"
                    >
                        <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="check" />
                        {voiceState === "saving" ? "Saving…" : voiceState === "saved" ? "Saved" : voiceState === "error" ? "No permission" : "Save voice"}
                    </button>
                </div>
                <p className="mb-5 text-caption-2 text-grey">Words your AI should always use, and ones it should never use. Applied to every AI generation.</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <WordList
                        title="Words to use"
                        icon="check"
                        iconClass="fill-success"
                        chipClass="bg-success/10 text-success"
                        words={useWords}
                        draft={useDraft}
                        setDraft={setUseDraft}
                        onAdd={() => addWord(useWords, setUseWords, useDraft, setUseDraft)}
                        onRemove={(w) => setUseWords(useWords.filter((x) => x !== w))}
                    />
                    <WordList
                        title="Words to avoid"
                        icon="close"
                        iconClass="fill-error"
                        chipClass="bg-error/10 text-error line-through"
                        words={avoidWords}
                        draft={avoidDraft}
                        setDraft={setAvoidDraft}
                        onAdd={() => addWord(avoidWords, setAvoidWords, avoidDraft, setAvoidDraft)}
                        onRemove={(w) => setAvoidWords(avoidWords.filter((x) => x !== w))}
                    />
                </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
                {!loading && listFiles.length === 0 ? (
                    <div className="px-5 py-12 text-center text-body-sm text-grey">No knowledge files yet.</div>
                ) : (
                    listFiles.map((f) => (
                        <div key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-grey-light px-5 py-4 last:border-b-0 dark:border-grey-light/10">
                            <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl shrink-0", f.kind === "seo_memory" ? "bg-success/10" : "bg-lavender-mist dark:bg-dark-3")}>
                                <Icon className={cn("h-5 w-5", f.kind === "seo_memory" ? "fill-success" : "fill-primary")} name={f.kind === "seo_memory" ? "sparkles" : "document"} />
                            </span>
                            <div className="min-w-0 grow">
                                <div className="flex items-center gap-2">
                                    <span className="text-title text-black dark:text-white">{f.name}</span>
                                    {f.managed && (
                                        <span className="rounded-md bg-success/10 px-2 py-0.5 text-[0.6875rem] font-bold text-success">Auto-updated</span>
                                    )}
                                    {!f.enabled && (
                                        <span className="rounded-md bg-grey-light/60 px-2 py-0.5 text-[0.6875rem] font-bold text-grey dark:bg-dark-3">Disabled</span>
                                    )}
                                </div>
                                <div className="text-caption-2 text-grey">{scopeLabel(f)}</div>
                            </div>
                            <div className="text-right text-caption-2 text-grey" suppressHydrationWarning>
                                Updated {formatDate(f.updatedAt)}
                            </div>
                            {f.kind === "seo_memory" && (
                                <button type="button" onClick={refineMemory} disabled={refining} className="btn-secondary h-9 px-3 text-caption-1 disabled:opacity-60">
                                    <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="sparkles" />
                                    {refining ? "Refining…" : "Refine with AI"}
                                </button>
                            )}
                            <button type="button" onClick={() => exportMd(f)} className="flex h-9 w-9 items-center justify-center rounded-lg text-grey hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3" aria-label="Export .md">
                                <Icon className="h-4 w-4 fill-current" name="external" />
                            </button>
                            <button type="button" onClick={() => openEdit(f)} className="btn-secondary h-9 px-3 text-caption-1">
                                Edit
                            </button>
                            {!f.managed && (
                                <button type="button" onClick={() => remove(f)} className="flex h-9 w-9 items-center justify-center rounded-lg text-grey hover:bg-error/10 hover:text-error" aria-label="Delete">
                                    <Icon className="h-4 w-4 fill-current" name="trash" />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </Card>

            <p className="text-caption-2 text-grey">
                Files are stored in your own database. Use <strong>Export</strong> to download a <code>.md</code> (e.g. to keep in git);
                import one when creating a file.
            </p>

            {/* Editor modal */}
            <Transition appear show={open} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <div className="mb-5 flex items-center justify-between">
                                        <Dialog.Title className="text-h5 text-black dark:text-white">
                                            {editing ? (editing.managed ? "Edit SEO memory" : "Edit knowledge file") : "New knowledge file"}
                                        </Dialog.Title>
                                        {!editing && (
                                            <>
                                                <button type="button" onClick={() => importRef.current?.click()} className="btn-secondary h-9 px-3 text-caption-1">
                                                    Import .md
                                                </button>
                                                <input ref={importRef} type="file" accept=".md,text/markdown,text/plain" onChange={onImport} className="hidden" />
                                            </>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Name</span>
                                            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Blog writing rules" className="flow-input" disabled={editing?.managed} autoFocus />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Markdown content</span>
                                            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={12} placeholder="# Guidelines&#10;&#10;- Write in a friendly, expert tone…" className="flow-input resize-none font-mono text-caption-2" />
                                        </label>

                                        {!editing?.managed && (
                                            <div className="flex flex-col gap-3 rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                                                <span className="text-caption-1 text-black dark:text-white">Where does this apply?</span>
                                                <label className="flex items-center gap-2.5 text-body-sm text-black dark:text-white">
                                                    <input type="checkbox" checked={form.universal} onChange={(e) => setForm({ ...form, universal: e.target.checked })} className="h-4 w-4 accent-primary" />
                                                    Universal: all AI content generation
                                                </label>
                                                <div>
                                                    <span className="mb-1.5 block text-caption-2 text-grey">Content types</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {types.length === 0 && <span className="text-caption-2 text-grey">No content types yet.</span>}
                                                        {types.map((t) => {
                                                            const on = form.contentTypeApiIds.includes(t.apiId);
                                                            return (
                                                                <button key={t.id} type="button" onClick={() => setForm({ ...form, contentTypeApiIds: toggleArr(form.contentTypeApiIds, t.apiId) })} className={cn("rounded-md px-3 py-1.5 text-caption-1 font-semibold transition-colors", on ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3")}>
                                                                    {t.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="mb-1.5 block text-caption-2 text-grey">Tools</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {TOOL_OPTIONS.map((t) => {
                                                            const on = form.tools.includes(t.key);
                                                            return (
                                                                <button key={t.key} type="button" onClick={() => setForm({ ...form, tools: toggleArr(form.tools, t.key) })} className={cn("rounded-md px-3 py-1.5 text-caption-1 font-semibold transition-colors", on ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3")}>
                                                                    {t.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <label className="flex items-center gap-2.5 text-body-sm text-black dark:text-white">
                                                    <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 accent-primary" />
                                                    Enabled
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-6 flex gap-3">
                                        <button type="button" onClick={() => setOpen(false)} className="btn-secondary grow">Cancel</button>
                                        <button type="button" onClick={save} disabled={saving || !form.name.trim()} className="btn-primary grow disabled:opacity-60">
                                            {saving ? "Saving…" : "Save"}
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

const WordList = ({
    title,
    icon,
    iconClass,
    chipClass,
    words,
    draft,
    setDraft,
    onAdd,
    onRemove,
}: {
    title: string;
    icon: string;
    iconClass: string;
    chipClass: string;
    words: string[];
    draft: string;
    setDraft: (v: string) => void;
    onAdd: () => void;
    onRemove: (w: string) => void;
}) => (
    <div className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
        <h4 className="mb-3 flex items-center gap-2 text-title text-black dark:text-white">
            <Icon className={`h-4 w-4 ${iconClass}`} name={icon} />
            {title}
        </h4>
        <div className="mb-3 flex flex-wrap gap-2">
            {words.length === 0 && <span className="text-caption-2 text-grey">None yet.</span>}
            {words.map((w) => (
                <button key={w} type="button" onClick={() => onRemove(w)} className={`group inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-caption-2 font-medium ${chipClass}`} title="Remove">
                    {w}
                    <Icon className="h-3 w-3 fill-current opacity-50 group-hover:opacity-100" name="close" />
                </button>
            ))}
        </div>
        <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), onAdd())}
            onBlur={onAdd}
            placeholder="Add a word + Enter"
            className="flow-input h-9 text-caption-1"
        />
    </div>
);

export default Knowledge;
