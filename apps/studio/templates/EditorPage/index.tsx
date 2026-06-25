"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Editor } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import SaveStatus from "@/components/ui/SaveStatus";
import Select from "@/components/ui/Select";
import EditorCanvas from "@/components/editor/EditorCanvas";
import RightPanel from "@/components/editor/RightPanel";
import FieldsForm from "@/components/editor/FieldsForm";
import ScheduleModal from "@/components/editor/ScheduleModal";
import SectionEditor, { EditorStatsBar, type ComponentDef, type Section } from "@/components/editor/SectionEditor";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRevealBatch } from "@/lib/useReveal";
import { cn } from "@/lib/cn";
import type { SchemaField } from "@/mocks/schema";
import { confirm } from "@/components/providers/ConfirmProvider";
import { openPreviewSync, type PreviewDraft, type PreviewSyncHandle, type PreviewSyncMessage } from "@/lib/previewSync";

/** Approval summary for an entry (GET /entries/:id/reviews). `enforced` is true only
 *  when the workspace is licensed for approval workflows. */
type ReviewInfo = { status: string; approvalsRequired: number; approvals: number; isApproved: boolean; enforced: boolean };

type ApiEntry = {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    locale?: string;
    contentType: { id: string; name: string };
    data: Record<string, unknown> | null;
    // Draft-over-published overlay: a live entry with pending, not-yet-published edits.
    hasDraft?: boolean;
    draftApproved?: boolean;
};

/** Content type as returned by /content-types (includes the field schema). */
type ApiType = { id: string; name: string; fields: SchemaField[] };
/** Reusable component as returned by /content-types/components. */
type ApiComponent = { id: string; name: string; apiId: string; icon: string; fields: SchemaField[] };

/** Turn a page title into a URL slug: "Storm Damage Restoration" → "storm-damage-restoration". */
const slugify = (s: string) =>
    s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

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
    const [slug, setSlug] = useState("");
    const [locale, setLocale] = useState("en");
    // Slug auto-tracks the title (like the meta title) until the user edits it; once
    // they type their own slug it stops following the title. Clearing the slug
    // re-enables auto-tracking.
    const [slugEdited, setSlugEdited] = useState(false);
    // Inline slug uniqueness: a slug is valid for only one page per type + locale.
    const [slugCheck, setSlugCheck] = useState<{ status: "idle" | "checking" | "ok" | "taken"; suggestion?: string }>({ status: "idle" });
    const [status, setStatus] = useState("DRAFT");
    const [initialBody, setInitialBody] = useState<string>("");
    const [entryData, setEntryData] = useState<Record<string, unknown>>({});
    const [types, setTypes] = useState<ApiType[]>([]);
    const [components, setComponents] = useState<ApiComponent[]>([]);
    const [typeId, setTypeId] = useState<string | undefined>(typeParam ?? undefined);
    const [ready, setReady] = useState(false);
    const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
    const [error, setError] = useState<string | null>(null);
    const [rev, setRev] = useState(0);
    // Draft-over-published: a live entry whose edits are staged (not yet published).
    const [hasDraft, setHasDraft] = useState(false);
    const [draftApproved, setDraftApproved] = useState(false);
    // Approval state for the primary action button (Submit for approval → Approve → Publish).
    const [review, setReview] = useState<ReviewInfo | null>(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const { can } = useAuth();

    // Two-way live link to the preview tab. `localEdits` ticks only on edits made
    // *here*, so we broadcast those to the preview; edits arriving FROM the preview
    // feed autosave (via bumpRemote) without echoing straight back.
    const [localEdits, setLocalEdits] = useState(0);
    const syncRef = useRef<PreviewSyncHandle | null>(null);
    const draftRef = useRef<PreviewDraft>({});
    // The entry id we've already loaded into state, so the load effect can skip the
    // reload that the create flow's navigation (?id=<new id>) would otherwise trigger.
    const loadedIdRef = useRef<string | null>(null);

    /** Mark the doc dirty + tick the autosave debounce (called on every local edit). */
    const bump = useCallback(() => {
        setRev((r) => r + 1);
        setLocalEdits((n) => n + 1);
        setSaveState((s) => (s === "saving" ? s : "dirty"));
    }, []);

    /** Like bump, but for edits applied FROM the preview: keeps autosave + word
     *  count live without re-broadcasting the change back to the preview. */
    const bumpRemote = useCallback(() => {
        setRev((r) => r + 1);
        setSaveState((s) => (s === "saving" ? s : "dirty"));
    }, []);

    useEffect(() => {
        // The create flow navigates to ?id=<new id> right after POSTing, and we
        // already hold that entry in state, so skip the reload (reloading here would
        // flash the canvas and fight autosave mid-typing). Any genuine id change, or
        // going to "New Content" (no id), falls through and resets the editor.
        if (idParam && idParam === loadedIdRef.current) return;
        let cancelled = false;
        setReady(false); // unmount the canvas so it remounts with the right content
        (async () => {
            const [cts, comps] = await Promise.all([
                api<ApiType[]>("/content-types").catch(() => []),
                api<ApiComponent[]>("/content-types/components").catch(() => [] as ApiComponent[]),
            ]);
            if (cancelled) return;
            setTypes(cts);
            setComponents(comps);
            if (idParam) {
                try {
                    const e = await api<ApiEntry>(`/entries/${idParam}`);
                    if (cancelled) return;
                    setEntryId(e.id);
                    setTitle(e.title || "Untitled");
                    setSlug(e.slug ?? "");
                    setSlugEdited(!!(e.slug && e.slug.trim()));
                    setLocale(e.locale || "en");
                    setStatus(e.status);
                    setTypeId(e.contentType.id);
                    setInitialBody(typeof e.data?.body === "string" ? (e.data.body as string) : "");
                    setEntryData((e.data ?? {}) as Record<string, unknown>);
                    setHasDraft(!!e.hasDraft);
                    setDraftApproved(!!e.draftApproved);
                    loadedIdRef.current = e.id;
                } catch (err) {
                    if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this entry.");
                }
            } else {
                // New Content: clear everything so a fresh, blank entry is started,
                // even when navigating here from an entry already open in the editor.
                setEntryId(null);
                setTitle("Untitled");
                setSlug("");
                setSlugEdited(false);
                setSlugCheck({ status: "idle" });
                setLocale("en");
                setStatus("DRAFT");
                setInitialBody("");
                setEntryData({});
                setHasDraft(false);
                setDraftApproved(false);
                setReview(null);
                setError(null);
                setTypeId(typeParam ?? cts[0]?.id);
                loadedIdRef.current = null;
            }
            if (!cancelled) setReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [idParam, typeParam]);

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

    // Fields of the active type, and whether it has a rich-text body (so we know
    // to mount the TipTap canvas vs. a fields-only form).
    const fields: SchemaField[] = types.find((t) => t.id === typeId)?.fields ?? [];
    // Dynamic-zone (section builder) field, if the type has one. Its sections are an
    // ordered array of { __component, __uid, ...fields } stored in the entry data.
    const zoneField = fields.find((f) => f.type === "DynamicZone");
    const formFields = zoneField ? fields.filter((f) => f.id !== zoneField.id) : fields;
    const sections: Section[] = zoneField && Array.isArray(entryData[zoneField.name]) ? (entryData[zoneField.name] as Section[]) : [];
    const hasBody = !zoneField && (fields.length === 0 || fields.some((f) => f.type === "Rich text"));
    // Resolved component defs (apiId → {name, icon, fields}) for the section builder.
    const componentDefs = useMemo(() => {
        const map: Record<string, ComponentDef> = {};
        for (const c of components) map[c.apiId] = { apiId: c.apiId, name: c.name, icon: c.icon, fields: c.fields };
        return map;
    }, [components]);
    // apiId → sub-fields, so Component fields that reference a library component (by
    // componentApiId) render that component's fields in the form below.
    const componentFields = useMemo(() => {
        const map: Record<string, ComponentDef["fields"]> = {};
        for (const c of components) map[c.apiId] = c.fields;
        return map;
    }, [components]);
    // Live word count across the body + all section text (drives the footer stats).
    const wordCount = useMemo(() => {
        const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const parts: string[] = [];
        if (hasBody) parts.push(strip(editor?.getHTML() ?? initialBody ?? ""));
        for (const s of sections) for (const [k, v] of Object.entries(s)) if (!k.startsWith("__") && typeof v === "string") parts.push(strip(v));
        return parts.join(" ").split(/\s+/).filter(Boolean).length;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- rev ticks on every edit so this recomputes live
    }, [sections, editor, initialBody, hasBody, rev]);

    const persist = useCallback(async (): Promise<string | null> => {
        // Block saving a slug that already belongs to another page (the server also
        // rejects it; this surfaces the conflict before the round-trip).
        if (slugCheck.status === "taken") {
            setError(`That slug is already in use${slugCheck.suggestion ? `. Try “${slugCheck.suggestion}”.` : "."}`);
            return null;
        }
        // Send the full field data (the backend merges it) plus the rich-text body
        // when the type has one, and the slug from its dedicated input.
        const data: Record<string, unknown> = { ...entryData };
        if (hasBody) data.body = editor?.getHTML() ?? "";
        const payload = { title, slug: slug.trim() || null, data };
        if (entryId) {
            // The PATCH response tells us whether this edit was staged as a draft
            // (live entries) so the toolbar can switch to Approve → Publish.
            const saved = await api<ApiEntry>(`/entries/${entryId}`, { method: "PATCH", body: JSON.stringify(payload) });
            setHasDraft(!!saved.hasDraft);
            setDraftApproved(!!saved.draftApproved);
            return entryId;
        }
        if (!typeId) {
            setError("Pick a content type first.");
            return null;
        }
        const created = await api<ApiEntry>("/entries", {
            method: "POST",
            body: JSON.stringify({ contentTypeId: typeId, ...payload }),
        });
        setEntryId(created.id);
        loadedIdRef.current = created.id; // we hold this entry; skip the reload on the ?id= navigation
        router.replace(`/content/editor?id=${created.id}`);
        return created.id;
    }, [editor, entryId, title, slug, typeId, entryData, hasBody, router, slugCheck]);

    /** Pull the approval summary so the primary button can show the right step. */
    const loadReview = useCallback(async () => {
        if (!entryId) {
            setReview(null);
            return;
        }
        try {
            setReview(await api<ReviewInfo>(`/entries/${entryId}/reviews`));
        } catch {
            /* leave as-is; the button falls back to enforced-by-default */
        }
    }, [entryId]);

    useEffect(() => {
        void loadReview();
    }, [loadReview, status]);

    // Inline slug uniqueness (debounced). A slug is valid for only one page within a
    // content type + locale, so we ask the API as the user types and surface a
    // conflict + a free suggestion before they try to save.
    useEffect(() => {
        const s = slug.trim();
        if (!s || !typeId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the slug is cleared
            setSlugCheck({ status: "idle" });
            return;
        }
        setSlugCheck((c) => (c.status === "checking" ? c : { status: "checking" }));
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const qs = new URLSearchParams({ typeId, slug: s, locale });
                if (entryId) qs.set("excludeId", entryId);
                const r = await api<{ available: boolean; suggestion?: string }>(`/entries/slug-available?${qs.toString()}`);
                if (cancelled) return;
                // Auto mode (slug tracking the title): silently adopt the next free slug
                // (e.g. storm-damage-restoration-01) instead of asking the user. Manual
                // mode keeps the inline "already used" prompt so they choose their own.
                if (!r.available && !slugEdited && r.suggestion) {
                    setSlug(r.suggestion);
                    setSlugCheck({ status: "ok" });
                    bump();
                } else {
                    setSlugCheck(r.available ? { status: "ok" } : { status: "taken", suggestion: r.suggestion });
                }
            } catch {
                if (!cancelled) setSlugCheck({ status: "idle" }); // a transient failure shouldn't block saving
            }
        }, 400);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [slug, typeId, locale, entryId, slugEdited, bump]);

    /** Step 1 of a fresh page: save it and send it to a reviewer. */
    const submitForApproval = async () => {
        setSaveState("saving");
        setError(null);
        try {
            const id = await persist();
            if (!id) {
                setSaveState("dirty");
                return;
            }
            const e = await api<ApiEntry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify({ status: "IN_REVIEW" }) });
            setStatus(e.status);
            setSaveState("saved");
            await loadReview();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't submit for approval.");
            setSaveState("dirty");
        }
    };

    /** Reviewer records a decision; enough approvals flips the entry to APPROVED. */
    const decide = async (decision: "approve" | "request_changes") => {
        if (!entryId) return;
        setSaveState("saving");
        setError(null);
        try {
            const r = await api<ReviewInfo>(`/entries/${entryId}/review`, { method: "POST", body: JSON.stringify({ decision }) });
            setReview(r);
            if (r.status) setStatus(r.status);
            setSaveState("saved");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't record your decision.");
            setSaveState("dirty");
        }
    };

    /** Schedule the entry to go live at `iso`: save the latest content, then move it
     *  to SCHEDULED with the chosen timestamp (the content scheduler publishes it
     *  when the time arrives). Requires publish rights + a complete, approved entry. */
    const doSchedule = async (iso: string) => {
        setScheduleOpen(false);
        setSaveState("saving");
        setError(null);
        try {
            const id = await persist();
            if (!id) {
                setSaveState("dirty");
                return;
            }
            const e = await api<ApiEntry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify({ status: "SCHEDULED", scheduledAt: iso }) });
            setStatus(e.status);
            setSaveState("saved");
            await loadReview();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't schedule this content.");
            setSaveState("dirty");
        }
    };

    /** Publish an already-approved entry (no re-save, which would clear approval). */
    const publishNow = async () => {
        if (!entryId) return;
        setSaveState("saving");
        setError(null);
        try {
            const e = await api<ApiEntry>(`/entries/${entryId}/publish`, { method: "POST" });
            setStatus(e.status);
            setSaveState("saved");
            await loadReview();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Publish failed.");
            setSaveState("dirty");
        }
    };

    /** Re-pull the entry (after a version restore) and reset the canvas to it. */
    const reload = useCallback(async () => {
        if (!entryId) return;
        try {
            const e = await api<ApiEntry>(`/entries/${entryId}`);
            setTitle(e.title || "Untitled");
            setSlug(e.slug ?? "");
            setSlugEdited(!!(e.slug && e.slug.trim()));
            setLocale(e.locale || "en");
            setStatus(e.status);
            setEntryData((e.data ?? {}) as Record<string, unknown>);
            setHasDraft(!!e.hasDraft);
            setDraftApproved(!!e.draftApproved);
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
            setHasDraft(false);
            setDraftApproved(false);
        } catch {
            /* ignore */
        }
    };

    /** Step 1 of promoting edits made to a live entry: flush the latest edits into the
     *  draft, then mark it approved so the Publish button appears. */
    const approveDraft = async () => {
        setSaveState("saving");
        setError(null);
        try {
            await persist(); // ensure the newest edits are in the draft before approving
            if (!entryId) return;
            const e = await api<ApiEntry>(`/entries/${entryId}/approve-draft`, { method: "POST" });
            setHasDraft(!!e.hasDraft);
            setDraftApproved(!!e.draftApproved);
            setSaveState("saved");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't approve the changes.");
            setSaveState("dirty");
        }
    };

    /** Step 2: promote the approved draft to the live version (goes public now). */
    const publishChanges = async () => {
        if (!entryId) return;
        setSaveState("saving");
        setError(null);
        try {
            // Don't re-save here. The draft was already flushed and approved in the
            // Approve step; a no-op PATCH would re-stage the draft and clear its
            // approval on the server, tripping the "approve before publishing" gate.
            // Any edit made after approving already ticks autosave, which flips this
            // button back to "Approve" — so when this runs the draft is approved.
            const e = await api<ApiEntry>(`/entries/${entryId}/publish`, { method: "POST" });
            setStatus(e.status);
            setHasDraft(false);
            setDraftApproved(false);
            setSaveState("saved");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Publish failed.");
            setSaveState("dirty");
        }
    };

    /** Throw away staged edits and revert the editor to the live version. */
    const discardDraft = async () => {
        if (!entryId) return;
        if (!(await confirm({ title: "Discard your unpublished changes?", message: "This reverts to the live version.", confirmLabel: "Discard", tone: "danger" }))) return;
        try {
            await api(`/entries/${entryId}/discard-draft`, { method: "POST" });
            setHasDraft(false);
            setDraftApproved(false);
            await reload();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't discard the draft.");
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
            const pristine =
                (!title || title === "Untitled") &&
                (!body || body === "<p></p>" || body === "") &&
                !slug.trim() &&
                Object.keys(entryData).length === 0;
            if (!typeId || pristine) return;
        }
        setSaveState("saving");
        try {
            const id = await persist();
            setSaveState(id ? "saved" : "dirty");
        } catch {
            setSaveState("dirty");
        }
    }, [saveState, editor, entryId, title, slug, typeId, entryData, persist]);

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

    /** Apply a live draft pushed from the preview tab (the user is editing the page
     *  in place). Updates fields without re-broadcasting; bumpRemote feeds autosave. */
    const applyRemoteDraft = useCallback((draft: PreviewDraft) => {
        if (draft.title !== undefined) setTitle(draft.title || "Untitled");
        if (draft.slug !== undefined) {
            setSlug(draft.slug ?? "");
            setSlugEdited(!!(draft.slug && draft.slug.trim()));
        }
        if (draft.data) {
            const { body, ...rest } = draft.data as Record<string, unknown>;
            setEntryData(rest);
            // Push a new body into TipTap silently (emitUpdate:false → no echo loop).
            if (typeof body === "string" && editor && editor.getHTML() !== body) {
                editor.commands.setContent(body, { emitUpdate: false });
            }
        }
        bumpRemote();
    }, [editor, bumpRemote]);

    // Keep the message handler current without re-opening the channel on every edit.
    const onSync = useRef<(m: PreviewSyncMessage) => void>(() => {});
    useEffect(() => {
        onSync.current = (msg) => {
            if (msg.kind === "hello") syncRef.current?.post({ kind: "draft", from: "editor", draft: draftRef.current });
            else if (msg.kind === "draft") applyRemoteDraft(msg.draft);
            else if (msg.kind === "saved") void reload();
        };
    }, [applyRemoteDraft, reload]);

    // Open the live channel once we have an entry id; greet the preview so a freshly
    // opened preview tab immediately receives the current unsaved draft.
    useEffect(() => {
        if (!entryId) return;
        const handle = openPreviewSync(entryId, "editor", (m) => onSync.current(m));
        syncRef.current = handle;
        handle?.post({ kind: "hello", from: "editor" });
        return () => {
            handle?.close();
            syncRef.current = null;
        };
    }, [entryId]);

    // Keep the outgoing snapshot fresh for the preview channel (runs after each
    // render, so the next broadcast / hello reply carries the latest title + data).
    useEffect(() => {
        draftRef.current = {
            title,
            slug,
            status,
            data: hasBody ? { ...entryData, body: editor?.getHTML() ?? initialBody ?? "" } : entryData,
        };
    });

    // Stream local edits to the preview (localEdits ticks only on edits made here).
    useEffect(() => {
        if (localEdits === 0) return;
        syncRef.current?.post({ kind: "draft", from: "editor", draft: draftRef.current });
    }, [localEdits]);

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
                            const t = e.target.value;
                            setTitle(t);
                            // Auto-fill the slug from the title until the user customizes it.
                            if (!slugEdited) setSlug(slugify(t));
                            bump();
                        }}
                        placeholder="Untitled"
                        aria-label="Title"
                        className="w-full max-w-xl truncate bg-transparent text-title font-semibold text-black outline-none dark:text-white"
                    />
                    <div className="flex items-center gap-2 text-caption-2 text-grey">
                        <StatusPill status={STATUS_PILL[status] ?? "draft"} />
                        {entryId && <SaveStatus state={saveState} />}
                        {status === "PUBLISHED" && hasDraft && (
                            <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide", draftApproved ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                                {draftApproved ? "Approved · ready to publish" : "Unpublished changes"}
                            </span>
                        )}
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
                    {(() => {
                        // Primary action reflects the approval state machine + the user's role:
                        //   fresh draft → Submit for approval (everyone)
                        //   in review   → Approve / Request changes (reviewers) · greyed Publish (others)
                        //   approved    → Publish (reviewers AND editors)
                        //   published   → Unpublish (reviewers) · draft overlay keeps Approve → Publish
                        const canPublish = can("content.publish"); // reviewer = publisher
                        const canUpdate = can("content.update");
                        const enforced = review?.enforced ?? true; // assume enforced until we know
                        const greyed = "btn-secondary btn-md opacity-50 cursor-not-allowed";

                        if (status === "PUBLISHED" && hasDraft) {
                            return (
                                <>
                                    {canUpdate && (
                                        <button type="button" onClick={discardDraft} className="btn-ghost btn-md" title="Discard unpublished changes">
                                            Discard
                                        </button>
                                    )}
                                    {draftApproved ? (
                                        <button type="button" onClick={publishChanges} disabled={saveState === "saving"} className="btn-primary btn-md disabled:opacity-60">
                                            Publish changes
                                        </button>
                                    ) : canPublish ? (
                                        <button type="button" onClick={approveDraft} disabled={saveState === "saving"} className="btn-secondary btn-md disabled:opacity-60">
                                            Approve
                                        </button>
                                    ) : (
                                        <button type="button" disabled className={greyed} title="A reviewer must approve these changes first">
                                            Publish changes
                                        </button>
                                    )}
                                </>
                            );
                        }
                        if (status === "PUBLISHED") {
                            return canPublish ? (
                                <button type="button" onClick={unpublish} className="btn-secondary btn-md">
                                    Unpublish
                                </button>
                            ) : null;
                        }
                        if (status === "IN_REVIEW") {
                            return canPublish ? (
                                <>
                                    <button type="button" onClick={() => decide("request_changes")} className="btn-ghost btn-md">
                                        Request changes
                                    </button>
                                    <button type="button" onClick={() => decide("approve")} disabled={saveState === "saving"} className="btn-primary btn-md disabled:opacity-60">
                                        Approve
                                    </button>
                                </>
                            ) : (
                                <button type="button" disabled className={greyed} title="Submitted — awaiting a reviewer's approval">
                                    Publish
                                </button>
                            );
                        }
                        if (status === "APPROVED" || status === "SCHEDULED") {
                            return canPublish || canUpdate ? (
                                <button type="button" onClick={publishNow} disabled={saveState === "saving"} className="btn-primary btn-md disabled:opacity-60">
                                    Publish
                                </button>
                            ) : (
                                <button type="button" disabled className={greyed}>
                                    Publish
                                </button>
                            );
                        }
                        // DRAFT
                        if (!enforced) {
                            return canPublish ? (
                                <button type="button" onClick={publish} className="btn-secondary btn-md">
                                    Publish
                                </button>
                            ) : (
                                <button type="button" disabled className={greyed} title="Only a publisher can publish">
                                    Publish
                                </button>
                            );
                        }
                        return (
                            <button type="button" onClick={submitForApproval} disabled={saveState === "saving"} className="btn-primary btn-md disabled:opacity-60">
                                Submit for approval
                            </button>
                        );
                    })()}
                    {/* Schedule publish — available to publishers once the entry can go
                        live (approved, already scheduled, or — when approvals aren't
                        enforced — a draft). Sets the entry to SCHEDULED at the chosen time. */}
                    {entryId && can("content.publish") && status !== "PUBLISHED" && (status === "APPROVED" || status === "SCHEDULED" || (status === "DRAFT" && review?.enforced === false)) && (
                        <button type="button" onClick={() => setScheduleOpen(true)} className="btn-ghost btn-md" title="Schedule publish">
                            <Icon className="h-4 w-4 fill-current" name="calendar" />
                            <span className="hidden sm:inline">{status === "SCHEDULED" ? "Reschedule" : "Schedule"}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={save}
                        disabled={saveState !== "dirty" || slugCheck.status === "taken"}
                        className="btn-primary btn-md min-w-[4.75rem] disabled:opacity-45"
                        title={slugCheck.status === "taken" ? "Fix the duplicate slug to save" : saveState === "saved" ? "All changes saved" : "Save changes"}
                    >
                        Save
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

            {/* Body: canvas + panel. overflow-x-clip + the docked panel's shrink-0
                keep the tools panel on-screen no matter how wide a field's content
                is (the canvas column shrinks via min-w-0 instead of overflowing). */}
            <div ref={bodyScope} className="relative flex grow min-h-0 overflow-x-clip">
                <div className="reveal-up flex grow min-w-0 flex-col bg-gradient-to-br from-lavender-mist/70 via-white to-purple-100/40 dark:from-dark-2 dark:via-dark-1 dark:to-dark-2/80">
                    <div className="grow overflow-y-auto scrollbar-thin px-3 sm:px-5">
                    {ready ? (
                        <div className="flex w-full min-w-0 flex-col gap-4 py-6">
                            {/* Slug — the page's URL path. Validated inline to be unique
                                per content type + locale (one slug, one page). */}
                            <label className="flex flex-col gap-1.5">
                                <span className="text-caption-1 text-grey">Slug</span>
                                <input
                                    value={slug}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setSlug(v);
                                        // Editing the slug stops it tracking the title; clearing it resumes.
                                        setSlugEdited(v.trim() !== "");
                                        bump();
                                    }}
                                    placeholder="page-url-slug"
                                    aria-label="Slug"
                                    aria-invalid={slugCheck.status === "taken"}
                                    className={cn("flow-input font-mono", slugCheck.status === "taken" && "!border-error focus:!border-error")}
                                />
                                {slugCheck.status === "checking" && <span className="text-caption-2 text-grey">Checking availability…</span>}
                                {slugCheck.status === "ok" && <span className="text-caption-2 text-success">This slug is available.</span>}
                                {slugCheck.status === "taken" && (
                                    <span className="flex flex-wrap items-center gap-1.5 text-caption-2 text-error">
                                        This slug is already used by another page. Choose a different one.
                                        {slugCheck.suggestion && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSlug(slugCheck.suggestion!);
                                                    bump();
                                                }}
                                                className="font-semibold text-primary underline-offset-2 hover:underline dark:text-lilac"
                                            >
                                                Use “{slugCheck.suggestion}”
                                            </button>
                                        )}
                                    </span>
                                )}
                            </label>

                            {/* Schema-driven fields (Text, Number, components…) — the
                                dynamic-zone field is rendered as sections below. */}
                            <FieldsForm
                                fields={formFields}
                                data={entryData}
                                components={componentFields}
                                onChange={(d) => {
                                    setEntryData(d);
                                    bump();
                                }}
                            />

                            {/* Section builder (DynamicZone) — Hero / Main Content / … */}
                            {zoneField && (
                                <SectionEditor
                                    sections={sections}
                                    components={componentDefs}
                                    allowed={zoneField.allowedComponents}
                                    onChange={(next) => {
                                        setEntryData({ ...entryData, [zoneField.name]: next });
                                        bump();
                                    }}
                                />
                            )}

                            {/* Rich-text body — only for types that define one. */}
                            {hasBody && (
                                <div className="flex flex-col gap-1.5">
                                    {fields.length > 0 && <span className="text-caption-1 text-grey">Body</span>}
                                    <EditorCanvas onReady={onEditorReady} initialContent={initialBody} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid h-full place-items-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                        </div>
                    )}
                    </div>
                    {ready && <EditorStatsBar words={wordCount} />}
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
                        "bg-surface overflow-hidden dark:bg-dark-1 md:shrink-0",
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

            <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} onSchedule={(_label, iso) => void doSchedule(iso)} />
        </div>
    );
};

export default EditorPage;
