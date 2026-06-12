"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Editor } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import Select from "@/components/ui/Select";
import EditorCanvas from "@/components/editor/EditorCanvas";
import RightPanel from "@/components/editor/RightPanel";
import { api, ApiError } from "@/lib/api";
import { useRevealBatch } from "@/lib/useReveal";
import { cn } from "@/lib/cn";

type ApiEntry = {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    contentType: { id: string; name: string };
    data: Record<string, unknown> | null;
};

const STATUS_PILL: Record<string, PillStatus> = {
    DRAFT: "draft",
    IN_REVIEW: "review",
    APPROVED: "approved",
    SCHEDULED: "scheduled",
    PUBLISHED: "live",
    ARCHIVED: "draft",
};

/**
 * Find `query` in the editor body, select it, scroll it into view and flash it.
 * Used to deep-link a specific passage (e.g. from the Content Quality audit's
 * "open this issue"). Case-insensitive; matches within a single text node (the
 * common case for a phrase). Selection-only + a CSS class, so the doc isn't
 * mutated and autosave is never triggered.
 */
const normalizeWords = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).map((w) => w.replace(/[^a-z0-9']/g, "")).filter(Boolean);

function flashFind(editor: Editor, query: string): boolean {
    const target = normalizeWords(query);
    if (!target.length) return false;
    // Flatten the doc into words with their ProseMirror positions, so a phrase
    // matches case- and punctuation-insensitively and even across block
    // boundaries (a duplicate shingle often spans a paragraph -> heading).
    const words: { norm: string; from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text) {
            const re = /\S+/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(node.text))) {
                const norm = m[0].toLowerCase().replace(/[^a-z0-9']/g, "");
                if (norm) words.push({ norm, from: pos + m.index, to: pos + m.index + m[0].length });
            }
        }
        return true;
    });
    let range: { from: number; to: number } | null = null;
    for (let i = 0; i + target.length <= words.length && !range; i++) {
        let ok = true;
        for (let j = 0; j < target.length; j++) {
            if (words[i + j].norm !== target[j]) {
                ok = false;
                break;
            }
        }
        if (ok) range = { from: words[i].from, to: words[i + target.length - 1].to };
    }
    if (!range) return false;
    editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    const dom = editor.view.dom as HTMLElement;
    dom.classList.add("flash-find");
    window.setTimeout(() => dom.classList.remove("flash-find"), 2400);
    return true;
}

/**
 * Block Editor — loads a real content entry by ?id (or starts a new one for
 * ?type=), binds the TipTap canvas to its body, and saves / publishes through
 * the API. Autosaves ~1.5s after edits stop and warns before leaving with
 * unsaved work.
 */
const EditorPage = () => {
    const params = useSearchParams();
    const idParam = params.get("id");
    const typeParam = params.get("type");
    const highlightParam = params.get("highlight");
    const router = useRouter();

    // Closed by default so mobile opens to a full-width canvas; opened on mount
    // for desktop (where the panel docks beside the canvas).
    const [panelOpen, setPanelOpen] = useState(false);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [entryId, setEntryId] = useState<string | null>(idParam);
    const [title, setTitle] = useState("Untitled");
    const [status, setStatus] = useState("DRAFT");
    const [initialBody, setInitialBody] = useState<string>("");
    const [entryData, setEntryData] = useState<Record<string, unknown>>({});
    const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
    const [typeId, setTypeId] = useState<string | undefined>(typeParam ?? undefined);
    const [ready, setReady] = useState(false);
    const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
    const [error, setError] = useState<string | null>(null);
    const [rev, setRev] = useState(0);

    /** Mark the doc dirty + tick the autosave debounce (called on every edit). */
    const bump = useCallback(() => {
        setRev((r) => r + 1);
        setSaveState((s) => (s === "saving" ? s : "dirty"));
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const cts = await api<{ id: string; name: string }[]>("/content-types").catch(() => []);
            if (cancelled) return;
            setTypes(cts);
            if (idParam) {
                try {
                    const e = await api<ApiEntry>(`/entries/${idParam}`);
                    if (cancelled) return;
                    setTitle(e.title || "Untitled");
                    setStatus(e.status);
                    setTypeId(e.contentType.id);
                    setInitialBody(typeof e.data?.body === "string" ? (e.data.body as string) : "");
                    setEntryData((e.data ?? {}) as Record<string, unknown>);
                } catch (err) {
                    if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this entry.");
                }
            } else if (cts[0]) {
                setTypeId((cur) => cur ?? cts[0].id);
            }
            if (!cancelled) setReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [idParam]);

    const onEditorReady = useCallback((e: Editor) => {
        setEditor(e);
        e.on("update", bump);
    }, [bump]);

    // Deep-link: once the editor + its content are ready, scroll to and flash the
    // passage named by ?highlight= (from the Content Quality audit's fix links).
    // The entry body loads asynchronously, so retry until the text is present
    // (a fixed delay races the fetch and silently misses on a slow load).
    useEffect(() => {
        if (!editor || !highlightParam || !ready) return;
        let tries = 0;
        const tick = () => {
            if (flashFind(editor, highlightParam)) return;
            if (++tries >= 25) return; // ~5s ceiling
            timer = window.setTimeout(tick, 200);
        };
        let timer = window.setTimeout(tick, 120);
        return () => window.clearTimeout(timer);
    }, [editor, highlightParam, ready, initialBody]);

    // Dock the side panel open on desktop; keep it closed (drawer) on mobile.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time viewport read on mount
        if (window.matchMedia("(min-width: 768px)").matches) setPanelOpen(true);
    }, []);

    const persist = useCallback(async (): Promise<string | null> => {
        const body = editor?.getHTML() ?? "";
        if (entryId) {
            await api(`/entries/${entryId}`, {
                method: "PATCH",
                body: JSON.stringify({ title, data: { body } }),
            });
            return entryId;
        }
        if (!typeId) {
            setError("Pick a content type first.");
            return null;
        }
        const created = await api<ApiEntry>("/entries", {
            method: "POST",
            body: JSON.stringify({ contentTypeId: typeId, title, data: { body } }),
        });
        setEntryId(created.id);
        router.replace(`/content/editor?id=${created.id}`);
        return created.id;
    }, [editor, entryId, title, typeId, router]);

    /** Re-pull the entry (after a version restore) and reset the canvas to it. */
    const reload = useCallback(async () => {
        if (!entryId) return;
        try {
            const e = await api<ApiEntry>(`/entries/${entryId}`);
            setTitle(e.title || "Untitled");
            setStatus(e.status);
            setEntryData((e.data ?? {}) as Record<string, unknown>);
            editor?.commands.setContent(typeof e.data?.body === "string" ? (e.data.body as string) : "");
            setSaveState("saved");
        } catch {
            /* ignore */
        }
    }, [entryId, editor]);

    const save = async () => {
        setSaveState("saving");
        setError(null);
        try {
            const id = await persist();
            setSaveState(id ? "saved" : "dirty");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Save failed.");
            setSaveState("dirty");
        }
    };

    const publish = async () => {
        setSaveState("saving");
        setError(null);
        try {
            const id = await persist();
            if (id) {
                const e = await api<ApiEntry>(`/entries/${id}/publish`, { method: "POST" });
                setStatus(e.status);
            }
            setSaveState("saved");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Publish failed.");
            setSaveState("dirty");
        }
    };

    const unpublish = async () => {
        if (!entryId) return;
        try {
            const e = await api<ApiEntry>(`/entries/${entryId}/unpublish`, { method: "POST" });
            setStatus(e.status);
        } catch {
            /* ignore */
        }
    };

    /** Open a live page preview in a new tab. Opens the tab synchronously (so the
     *  browser doesn't block it), saves the latest content, then points the tab at
     *  the preview route. If the save fails we still preview the last-saved version
     *  of an existing entry rather than closing the tab into nothing. */
    const openPreview = async () => {
        const w = window.open("", "_blank");
        let previewId = entryId;
        try {
            previewId = (await persist()) ?? entryId;
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't save before preview.");
        }
        if (!w) return;
        if (previewId) w.location.href = `${window.location.origin}/preview?id=${previewId}`;
        else w.close();
    };

    /** Silent debounced autosave — keeps work safe without nagging on transient
     *  failures (manual Save/Publish still surface errors). Won't create an empty
     *  throwaway draft for a brand-new, untouched entry. */
    const autosave = useCallback(async () => {
        if (saveState === "saving") return;
        const body = editor?.getHTML() ?? "";
        if (!entryId) {
            const pristine = (!title || title === "Untitled") && (!body || body === "<p></p>" || body === "");
            if (!typeId || pristine) return;
        }
        setSaveState("saving");
        try {
            const id = await persist();
            setSaveState(id ? "saved" : "dirty");
        } catch {
            setSaveState("dirty");
        }
    }, [saveState, editor, entryId, title, typeId, persist]);

    const autosaveRef = useRef(autosave);
    useEffect(() => {
        autosaveRef.current = autosave;
    }, [autosave]);

    // Re-armed on every edit (rev ticks): saves ~1.5s after typing stops.
    useEffect(() => {
        if (rev === 0) return;
        const t = setTimeout(() => void autosaveRef.current(), 1500);
        return () => clearTimeout(t);
    }, [rev]);

    // Guard against losing unsaved work on tab close / refresh / hard navigation.
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (saveState !== "saved") {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [saveState]);

    const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Save" : "Saved";

    // Reveal the editor surface (canvas + side panel) once it's ready.
    const bodyScope = useRef<HTMLDivElement>(null);
    useRevealBatch(bodyScope, ".reveal-up", [ready]);

    return (
        <div className="-mx-4 -my-8 md:-mx-6 xl:-mx-8 flex flex-col h-[calc(100vh-5rem)]">
            {/* Editor top bar */}
            <div className="flex items-center gap-3 h-16 shrink-0 px-4 border-b border-grey-light bg-surface dark:bg-dark-1 dark:border-grey-light/10">
                <Link
                    href="/content"
                    aria-label="Back to content"
                    className="p-2 rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                >
                    <Icon className="fill-current" name="arrow-left" />
                </Link>

                <div className="min-w-0 grow">
                    <input
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            bump();
                        }}
                        placeholder="Untitled"
                        aria-label="Title"
                        className="w-full max-w-xl truncate bg-transparent text-title font-semibold text-black outline-none dark:text-white"
                    />
                    <div className="flex items-center gap-2 text-caption-2 text-grey">
                        <StatusPill status={STATUS_PILL[status] ?? "draft"} />
                        {!entryId && typeId && (
                            <Select
                                ariaLabel="Content type"
                                value={typeId}
                                onChange={setTypeId}
                                options={types.map((t) => ({ value: t.id, label: t.name }))}
                            />
                        )}
                        {error && <span className="text-error">· {error}</span>}
                    </div>
                </div>

                <div className="flex items-center gap-1.5 ml-auto md:gap-2">
                    <button type="button" onClick={openPreview} className="btn-ghost btn-md" title="Open live preview">
                        <Icon className="h-4 w-4 fill-current" name="eye" />
                        <span className="hidden sm:inline">Preview</span>
                    </button>
                    {status === "PUBLISHED" ? (
                        <button type="button" onClick={unpublish} className="btn-secondary btn-md">
                            Unpublish
                        </button>
                    ) : (
                        <button type="button" onClick={publish} className="btn-secondary btn-md">
                            Publish
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={save}
                        disabled={saveState === "saving"}
                        className="btn-primary btn-md disabled:opacity-60"
                    >
                        {saveLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => setPanelOpen((v) => !v)}
                        aria-label="Toggle panel"
                        aria-pressed={panelOpen}
                        className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors shrink-0",
                            panelOpen
                                ? "border-primary text-primary"
                                : "border-grey-light text-grey hover:text-primary dark:border-grey-light/10",
                        )}
                    >
                        <Icon className="fill-current" name="grid" />
                    </button>
                </div>
            </div>

            {/* Body: canvas + panel */}
            <div ref={bodyScope} className="relative flex grow min-h-0">
                <div className="reveal-up grow overflow-y-auto scrollbar-thin px-4">
                    {ready ? (
                        <EditorCanvas onReady={onEditorReady} initialContent={initialBody} />
                    ) : (
                        <div className="grid h-full place-items-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                        </div>
                    )}
                </div>

                {/* Mobile backdrop for the slide-over panel. */}
                {panelOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm md:hidden"
                        onClick={() => setPanelOpen(false)}
                        aria-hidden
                    />
                )}

                {/* Tools panel: a slide-over drawer below md, a docked column on md+. */}
                <aside
                    className={cn(
                        "bg-surface overflow-hidden dark:bg-dark-1",
                        "fixed inset-y-0 right-0 z-50 w-[min(22rem,calc(100vw-2.5rem))] border-l border-grey-light shadow-[0_0_2.5rem_rgba(26,26,46,0.20)] transition-transform duration-300 dark:border-grey-light/10",
                        panelOpen ? "translate-x-0" : "translate-x-full",
                        "md:static md:z-auto md:translate-x-0 md:shadow-none md:transition-[width] md:duration-300",
                        panelOpen ? "md:w-[22rem]" : "md:w-0",
                    )}
                >
                    <div className="flex h-full w-[min(22rem,calc(100vw-2.5rem))] flex-col md:w-[22rem]">
                        {/* Mobile-only header with a close control. */}
                        <div className="flex h-12 shrink-0 items-center justify-between border-b border-grey-light px-3 md:hidden dark:border-grey-light/10">
                            <span className="text-title font-semibold text-black dark:text-white">Tools</span>
                            <button
                                type="button"
                                onClick={() => setPanelOpen(false)}
                                aria-label="Close panel"
                                className="rounded-lg p-2 text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                            >
                                <Icon className="fill-current" name="close" />
                            </button>
                        </div>
                        <div className="min-h-0 grow">
                            <RightPanel
                                entryId={entryId}
                                editor={editor}
                                title={title}
                                data={entryData}
                                status={status}
                                onReload={reload}
                                onStatus={setStatus}
                            />
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default EditorPage;
