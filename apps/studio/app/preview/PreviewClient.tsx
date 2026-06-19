"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/useWorkspace";
import { usePlan } from "@/components/providers/LicenseProvider";
import { cn } from "@/lib/cn";
import { fieldLabel, type SchemaField } from "@/mocks/schema";
import Sections, { findSections, type Section as ViewSection } from "./Sections";
import SectionEditor, { type ComponentDef, type Section as ZoneSection } from "@/components/editor/SectionEditor";
import Mapper from "./Mapper";
import { confirm } from "@/components/providers/ConfirmProvider";
import { openPreviewSync, type PreviewDraft, type PreviewSyncHandle, type PreviewSyncMessage } from "@/lib/previewSync";
import { isHiddenFieldPath } from "@/lib/mappableField";

const STATUS_PILL: Record<string, PillStatus> = {
    DRAFT: "draft",
    IN_REVIEW: "review",
    APPROVED: "approved",
    SCHEDULED: "scheduled",
    PUBLISHED: "live",
    ARCHIVED: "draft",
};

/** Viewport widths: `frame` sizes the iframe (site mode), `card` the content render. */
const DEVICES = [
    { id: "desktop", label: "Desktop", frame: "100%", card: "64rem" },
    { id: "tablet", label: "Tablet", frame: "820px", card: "48rem" },
    { id: "mobile", label: "Mobile", frame: "390px", card: "24rem" },
] as const;
type Device = (typeof DEVICES)[number]["id"];

type Entry = {
    id: string;
    title: string;
    slug?: string | null;
    status: string;
    locale?: string | null;
    data: Record<string, unknown> | null;
    contentType: { id?: string; name: string; apiId?: string } | null;
    // True when the preview is showing a published entry's not-yet-published draft.
    hasDraft?: boolean;
};

type ApiType = {
    id: string;
    name: string;
    apiId?: string;
    fields: SchemaField[];
    // Public-site routing for this type (from the API): entries live at
    // /<urlPrefix>/<slug>, or the site root when isHome is true.
    urlPrefix?: string;
    isHome?: boolean;
};

/** Reusable component (block) definition, for the in-preview section builder. */
type ApiComponent = { id: string; name: string; apiId: string; icon: string; fields: SchemaField[] };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** One field→DOM binding from a CMS selector map. */
type Binding = { fieldPath: string; selector: string; mode: string; nth?: number };

/** One repeating-list item as reported by the live-edit bridge. `index` is its slot
 *  in the saved array (null when added live); `clonedFrom` is the slot it was copied
 *  from; `fields` are the edited sub-fields (or `value` for a scalar list item). */
type ArrayItemMsg = { index: number | null; clonedFrom: number | null; fields?: Record<string, string>; value?: string };

/** Placeholder page shown when an entry has no content yet (a brand-new or not-yet
 *  filled service / landing page). Keeps the preview seamless — a sensible default
 *  layout instead of a blank card or a 404 — while the content is being set up. */
const defaultScaffold = (title: string): ViewSection[] => [
    {
        __component: "hero",
        __uid: "default-hero",
        title: title && title !== "Untitled" ? title : "Your page title goes here",
        subtitle: "This is placeholder content. Add sections in the editor and they replace this preview instantly.",
    },
    {
        __component: "rich-text",
        __uid: "default-body",
        body: "<p>Start writing or drop in a block to build this page. Until then, visitors see a tidy default instead of an error.</p>",
    },
    {
        __component: "cta",
        __uid: "default-cta",
        heading: "Ready when you are",
        "button label": "Get in touch",
    },
];

/** Set a dot/array path on an object, creating intermediate objects/arrays.
 *  e.g. setPath(o, "mainContent.contentList.0.title", "x"). Numeric segments
 *  become array indices so the saved shape matches the source JSON. */
const setPath = (obj: Record<string, unknown>, path: string, value: unknown) => {
    const parts = path.split(".");
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const nextIsIndex = /^\d+$/.test(parts[i + 1]);
        const here = cur[key];
        if (here == null || typeof here !== "object") cur[key] = nextIsIndex ? [] : {};
        cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
};

/** Read a dot/array path from an object (undefined if any segment is missing). */
const getPath = (obj: Record<string, unknown>, path: string): unknown => {
    let cur: unknown = obj;
    for (const p of path.split(".")) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
};

let liveIdSeq = 0;
const ID_KEY_RE = /(^|_)(id|key|uid|slug)$/i;
/** Give a cloned item fresh id-like keys so a live-added item doesn't duplicate the
 *  id of the item it was copied from (which would collide on the rendered list). */
const freshenIds = (item: Record<string, unknown>): Record<string, unknown> => {
    for (const k of Object.keys(item)) {
        if (ID_KEY_RE.test(k) && typeof item[k] === "string") item[k] = `${k.toLowerCase()}-${Date.now().toString(36)}${liveIdSeq++}`;
    }
    return item;
};

/** Rebuild one array (in the order the bridge reported) from its live items, merging
 *  edited fields onto the original item so non-rendered fields (id, etc.) survive. */
const rebuildArray = (original: unknown, items: ArrayItemMsg[]): unknown[] => {
    const orig = Array.isArray(original) ? original : [];
    return items.map((rec) => {
        // Scalar list item (no sub-fields): the value is the whole item.
        if (rec.value !== undefined && (!rec.fields || !Object.keys(rec.fields).length)) return rec.value;
        const srcIdx = rec.index != null ? rec.index : rec.clonedFrom;
        const source = srcIdx != null ? orig[srcIdx] : undefined;
        let base: Record<string, unknown> = source && typeof source === "object" && !Array.isArray(source) ? (JSON.parse(JSON.stringify(source)) as Record<string, unknown>) : {};
        // A newly added item was cloned from an existing one — regenerate its ids.
        if (rec.index == null) base = freshenIds(base);
        if (rec.fields) for (const [sub, val] of Object.entries(rec.fields)) setPath(base, sub, val);
        return base;
    });
};

/** The site path segments for an entry, honouring the content type's route prefix
 *  (e.g. ["services", "water-damage"]); empty for a homepage type. */
const pathSegments = (e: Entry, type?: ApiType | null): string[] => {
    if (type?.isHome) return [];
    const prefix = (type?.urlPrefix ?? "").trim();
    return [prefix, e.slug ?? ""].filter(Boolean) as string[];
};

/** Fill a preview-URL template ({slug}/{id}/{type}/{locale}/{status}/{path}); when
 *  the template has no placeholder, treat it as the site base and append the
 *  type-prefixed path (/services/<slug>, /blogs/<slug>, or the root for a homepage). */
const buildTarget = (tpl: string, e: Entry, type?: ApiType | null): string => {
    const segs = pathSegments(e, type);
    const map: Record<string, string> = {
        slug: e.slug ?? "",
        id: e.id,
        type: e.contentType?.apiId ?? (e.contentType?.name ?? "").toLowerCase().replace(/\s+/g, "-"),
        locale: e.locale ?? "",
        status: (e.status ?? "").toLowerCase(),
        path: segs.join("/"),
    };
    if (/\{(slug|id|type|locale|status|path)\}/.test(tpl)) {
        return tpl.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(map[k] ?? ""));
    }
    const root = tpl.replace(/\/+$/, "");
    const path = segs.map(encodeURIComponent).join("/");
    return path ? `${root}/${path}` : root;
};

/**
 * Live page preview. When a workspace **Preview URL** is configured (Settings →
 * System), this iframes your real frontend at that URL with the entry injected
 * (the headless "see it on the site" preview, like Strapi). Otherwise it falls
 * back to rendering the entry's content in the studio's article styles. A
 * device-width toggle checks responsiveness either way. Read-only.
 */
const PreviewClient = () => {
    const id = useSearchParams().get("id");
    const ws = useWorkspace();
    const { has } = usePlan();
    const canLiveEdit = has("live_editor");
    const [entry, setEntry] = useState<Entry | null>(null);
    const [fields, setFields] = useState<SchemaField[]>([]);
    const [type, setType] = useState<ApiType | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [device, setDevice] = useState<Device>("desktop");
    const [userMode, setUserMode] = useState<"site" | "content" | null>(null);
    // Visual / live editor (Pro): edit the rendered content in place.
    const [editing, setEditing] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [editNote, setEditNote] = useState<string | null>(null);
    const [savedTick, setSavedTick] = useState(false);
    const articleRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const summaryRef = useRef<HTMLParagraphElement>(null);
    // Site-mode editing (the iframe is an edit-aware frontend running the
    // flowcms-live-edit bridge, e.g. the bundled Northbound demo or a customer site
    // that embeds public/flowcms-live-edit.js): a postMessage bridge unlocks in-place
    // editing + streams the edited fields back, keyed by their content-model field
    // name (`title` maps to the entry title; everything else into entry data), so
    // Save can persist them. Legacy demos still send {title, summary, body}.
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const siteFieldsRef = useRef<Record<string, string>>({});
    // Repeating-list state streamed from the bridge: each array path maps to its
    // items in document order. Each item carries its original index (null when added
    // live) and the index it was cloned from, so Save can rebuild the array while
    // preserving non-rendered fields (id, etc.). See flowcms-live-edit.js.
    const siteArraysRef = useRef<Record<string, ArrayItemMsg[]>>({});
    const [siteEditable, setSiteEditable] = useState(false);
    // Template fallback: when an entry's own live URL can't render (a new / not-yet-
    // published page 404s on the site, or its page hasn't rebuilt), we preview it on a
    // published sibling of the same type and push this entry's values onto it, so live
    // editing works before publish. `templateTarget` is that borrowed page's URL.
    const [templateTarget, setTemplateTarget] = useState<string | null>(null);
    const fellBackRef = useRef(false); // guard: only borrow a template once per entry
    const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // CMS-stored field→DOM map for this entry's type + URL. Sent to the bridge so
    // the customer site needs no per-field attributes (M1 of assisted mapping).
    const [bindings, setBindings] = useState<Binding[]>([]);
    // Visual mapper drawer (M2): build the selector map by auto-suggest + clicks.
    const [mapping, setMapping] = useState(false);
    // In-preview section builder (live editor): add / edit / reorder components and
    // their fields right on the page. Needs the reusable component (block) defs.
    const [components, setComponents] = useState<ApiComponent[]>([]);
    // Two-way live link to the editor tab (same-origin BroadcastChannel).
    const syncRef = useRef<PreviewSyncHandle | null>(null);
    const draftRef = useRef<PreviewDraft>({});

    useEffect(() => {
        if (!id) return;
        let off = false;
        api<Entry>(`/entries/${id}`)
            .then((e) => !off && setEntry(e))
            .catch((e) => !off && setError(e instanceof ApiError ? e.message : "Could not load this preview."));
        return () => {
            off = true;
        };
    }, [id]);

    // Load the entry's content-type fields so the rendered preview can show schema
    // fields (Headline, Hero image, CTA…), not just the title + body.
    useEffect(() => {
        const ctId = entry?.contentType?.id;
        const ctName = entry?.contentType?.name;
        if (!ctId && !ctName) return;
        let off = false;
        api<ApiType[]>("/content-types")
            .then((types) => {
                if (off) return;
                const t = types.find((x) => x.id === ctId) ?? types.find((x) => x.name === ctName);
                setFields(t?.fields ?? []);
                setType(t ?? null);
            })
            .catch(() => undefined);
        return () => {
            off = true;
        };
    }, [entry?.contentType?.id, entry?.contentType?.name]);

    // Load the selector map for this entry's type + site path (exact > pattern >
    // type default). Sent to the bridge once the site signals it's ready.
    useEffect(() => {
        const ctId = type?.id;
        if (!ctId || !entry) return;
        let off = false;
        const url = "/" + pathSegments(entry, type).join("/");
        api<{ bindings?: Binding[] }>(`/selector-maps/resolve?contentTypeId=${encodeURIComponent(ctId)}&url=${encodeURIComponent(url)}`)
            .then((r) => !off && setBindings(Array.isArray(r.bindings) ? r.bindings : []))
            .catch(() => !off && setBindings([]));
        return () => {
            off = true;
        };
    }, [type, entry]);

    // Load the reusable component defs so the in-preview builder can add new blocks.
    useEffect(() => {
        let off = false;
        api<ApiComponent[]>("/content-types/components")
            .then((c) => !off && setComponents(Array.isArray(c) ? c : []))
            .catch(() => undefined);
        return () => {
            off = true;
        };
    }, []);

    const shownError = error ?? (!id ? "No entry to preview." : null);
    const previewUrl = ws?.previewUrl ?? "";
    const hasSite = !!previewUrl.trim();
    const mode: "site" | "content" = userMode ?? (hasSite ? "site" : "content");
    const dev = DEVICES.find((d) => d.id === device)!;

    const body = str(entry?.data?.body);
    const summary = str(entry?.data?.summary);
    const client = str(entry?.data?.client);
    // Schema fields worth surfacing in the content preview: everything except the
    // rich-text body (shown as prose), the slug, and the title (the H1).
    const metaFields = fields.filter((f) => f.type !== "Rich text" && f.type !== "Slug" && f.name.toLowerCase() !== "title" && f.type !== "DynamicZone");
    // Section-based page: render the dynamic-zone sections as the page content.
    const sections = findSections(entry?.data);
    const target = entry && hasSite ? buildTarget(previewUrl, entry, type) : "";
    // The URL the preview iframe actually loads: the entry's own page, or a borrowed
    // published-sibling template when that page can't render this (unpublished) entry.
    const frameSrc = templateTarget ?? target;
    const usingTemplate = !!templateTarget;
    // Bindings the live editor actually uses: structural / SEO / id fields are never
    // editable on the page (matches what the mapper now hides), even if an older saved
    // map still contains them.
    const liveBindings = useMemo(() => bindings.filter((b) => !isHiddenFieldPath(b.fieldPath)), [bindings]);

    // The dynamic-zone field (if any) + its block defs, for the in-preview builder.
    // Fall back to detecting the zone key straight from the data shape.
    const zoneField = fields.find((f) => f.type === "DynamicZone");
    const zoneName =
        zoneField?.name ??
        Object.keys(entry?.data ?? {}).find((k) => {
            const v = (entry?.data as Record<string, unknown> | null | undefined)?.[k];
            return Array.isArray(v) && v.some((x) => x && typeof x === "object" && "__component" in (x as object));
        });
    const componentDefs = useMemo(() => {
        const map: Record<string, ComponentDef> = {};
        for (const c of components) map[c.apiId] = { apiId: c.apiId, name: c.name, icon: c.icon, fields: c.fields };
        return map;
    }, [components]);
    const zoneSections: ZoneSection[] =
        zoneName && Array.isArray((entry?.data as Record<string, unknown> | undefined)?.[zoneName])
            ? ((entry!.data as Record<string, unknown>)[zoneName] as ZoneSection[])
            : [];
    // A section page we can edit in place: it has a zone and we know its block defs.
    const isSectionPage = !!zoneName && (sections != null || !!zoneField);
    const sectionEditing = editing && mode === "content" && isSectionPage && Object.keys(componentDefs).length > 0;
    // Empty page (new service / not yet filled) → show a default scaffold, not a blank.
    const hasMeta = metaFields.some((f) => !!str(entry?.data?.[f.name]));
    const isEmpty = !sections && !body && !hasMeta;

    // Two edit surfaces: an edit-aware Site iframe (postMessage bridge → edit on the
    // real rendered page) or the same-origin Content render (contentEditable). When
    // a Site is editable we edit there; otherwise we fall back to Content mode.
    const siteEditing = editing && mode === "site";

    // ── Two-way live sync with the editor tab (same-origin BroadcastChannel) ─────
    /** Apply a draft pushed from the editor so the rendered preview tracks unsaved
     *  edits instantly. Skipped while editing here, so we never clobber live edits. */
    const applyEditorDraft = (draft: PreviewDraft) => {
        setEntry((e) =>
            e
                ? {
                      ...e,
                      title: draft.title ?? e.title,
                      slug: draft.slug !== undefined ? draft.slug : e.slug,
                      status: draft.status ?? e.status,
                      data: draft.data ?? e.data,
                  }
                : e,
        );
    };
    /** Stream the in-place content-mode edits (title / summary / body) back to the
     *  editor so its fields update live. */
    const broadcastFromNodes = () => {
        if (!syncRef.current || !entry) return;
        const data: Record<string, unknown> = JSON.parse(JSON.stringify(entry.data ?? {}));
        if (summaryRef.current) data.summary = summaryRef.current.textContent ?? "";
        if (articleRef.current) data.body = articleRef.current.innerHTML ?? "";
        const nextTitle = titleRef.current ? titleRef.current.textContent ?? entry.title : entry.title;
        syncRef.current.post({ kind: "draft", from: "preview", draft: { title: nextTitle, slug: entry.slug ?? null, status: entry.status, data } });
    };
    /** Section builder edits (add / edit / reorder blocks): write the zone array into
     *  the entry and mirror it to the editor. */
    const updateSections = (next: ZoneSection[]) => {
        if (!entry || !zoneName) return;
        const data = { ...(entry.data ?? {}), [zoneName]: next };
        setEntry({ ...entry, data });
        setDirty(true);
        syncRef.current?.post({ kind: "draft", from: "preview", draft: { title: entry.title, slug: entry.slug ?? null, status: entry.status, data } });
    };

    const postToSite = (msg: Record<string, unknown>) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        let origin = "*";
        try {
            if (frameSrc) origin = new URL(frameSrc).origin;
        } catch {
            /* keep * */
        }
        win.postMessage({ source: "flowcms-studio", ...msg }, origin);
    };

    /** The entry's own live URL can't render it (a new page 404s on the site, or it
     *  hasn't rebuilt). Borrow the most recently updated published page of the same
     *  type as a live template; we push this entry's values onto it below. If none
     *  exists (or a borrowed one also fails), drop to the in-studio Content view. */
    const attemptTemplateFallback = async () => {
        if (!type || !entry || mode !== "site") return;
        if (fellBackRef.current) {
            setTemplateTarget(null);
            setUserMode("content");
            setEditNote("Couldn't load a live preview for this page; showing the content view. Your edits still save to this page.");
            return;
        }
        fellBackRef.current = true;
        try {
            const sibs = await api<Array<{ id: string; slug?: string | null }>>(`/entries?typeId=${encodeURIComponent(type.id)}&status=PUBLISHED`);
            const donor = sibs.find((s) => s.id !== entry.id && !!(s.slug ?? "").trim());
            if (!donor) {
                setUserMode("content");
                setEditNote(`This page isn't published yet and there's no published ${type.name} to preview it on. Showing the content view; your edits still save to this page.`);
                return;
            }
            const donorEntry = { id: donor.id, slug: donor.slug, status: "PUBLISHED", contentType: entry.contentType } as Entry;
            setSiteEditable(false);
            setTemplateTarget(buildTarget(previewUrl, donorEntry, type));
        } catch {
            setUserMode("content");
            setEditNote("Couldn't load a live preview for this page; showing the content view. Your edits still save to this page.");
        }
    };

    // Push the selector map to the bridge once the site is ready (and again if the
    // map / target changes). On the entry's own page we also `probe` whether the map
    // resolves (to detect a 404 / wrong page); on a borrowed template we instead push
    // this entry's values so the user edits their content on a real, rendered layout.
    useEffect(() => {
        if (!(siteEditable && mode === "site" && liveBindings.length)) return;
        postToSite({ type: "map", bindings: liveBindings });
        if (templateTarget) {
            const vals: Record<string, string> = {};
            for (const b of liveBindings) {
                const v = b.fieldPath === "title" ? entry?.title ?? "" : getPath((entry?.data ?? {}) as Record<string, unknown>, b.fieldPath);
                vals[b.fieldPath] = typeof v === "string" ? v : "";
            }
            postToSite({ type: "set", fields: vals });
        } else {
            postToSite({ type: "probe" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteEditable, liveBindings, target, templateTarget, mode]);

    // Reset the template-fallback state when switching to a different entry.
    useEffect(() => {
        fellBackRef.current = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTemplateTarget(null);
        setSiteEditable(false);
    }, [id]);

    // While trying to live-edit a real page, if the bridge never signals `ready`
    // within a few seconds (the page 404'd or doesn't run the live-edit script), fall
    // back to a borrowed template. Only when a map exists (else there's nothing to
    // live-edit and the normal "waiting…" / content flow applies).
    useEffect(() => {
        if (mode !== "site" || !frameSrc || siteEditable || !liveBindings.length) return;
        const t = setTimeout(() => attemptTemplateFallback(), 6000);
        readyTimerRef.current = t;
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, frameSrc, siteEditable, liveBindings.length]);

    // Keep a fresh probe-result handler for the iframe listener (which has a stable
    // closure): if none of the saved bindings resolve on the entry's own page, the
    // page isn't rendering this content, so borrow a template.
    const onProbeResult = useRef<(unresolved: string[]) => void>(() => {});
    useEffect(() => {
        onProbeResult.current = (unresolved) => {
            if (templateTarget || !liveBindings.length) return;
            // Count only the live (non-hidden) bindings as unresolved.
            const liveUnresolved = unresolved.filter((p) => !isHiddenFieldPath(p));
            if (liveUnresolved.length >= liveBindings.length) attemptTemplateFallback();
        };
    });

    // Listen to the edit-aware site iframe: `ready` unlocks in-place editing;
    // `dirty`/`fields` stream the edited fields back so Save persists them. Fields
    // arrive either as a `fields` map keyed by content-model field name (the
    // generalized bridge) or as legacy {title, summary, body} keys.
    useEffect(() => {
        const onMsg = (e: MessageEvent) => {
            if (e.source !== iframeRef.current?.contentWindow) return; // only our iframe
            const d = e.data as {
                source?: string;
                type?: string;
                title?: string;
                summary?: string;
                body?: string;
                fields?: Record<string, unknown>;
                arrays?: Record<string, ArrayItemMsg[]>;
                unresolved?: string[];
            } | null;
            if (!d || d.source !== "flowcms-preview") return;
            if (d.type === "ready") setSiteEditable(true);
            else if (d.type === "probe-result" && Array.isArray(d.unresolved)) onProbeResult.current(d.unresolved);
            else if (d.type === "dirty") setDirty(true);
            else if (d.type === "fields") {
                const map: Record<string, string> = {};
                if (d.fields && typeof d.fields === "object") {
                    for (const [k, v] of Object.entries(d.fields)) if (typeof v === "string") map[k] = v;
                }
                // Back-compat: accept the legacy flat keys too.
                for (const k of ["title", "summary", "body"] as const) if (typeof d[k] === "string") map[k] = d[k] as string;
                siteFieldsRef.current = map;
                // Repeating-list state (add / edit / remove), keyed by array path.
                if (d.arrays && typeof d.arrays === "object") siteArraysRef.current = d.arrays;
            }
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, []);

    // Live link to the editor tab. Keep the handler current (so it sees the latest
    // `editing` / `entry`) without re-opening the channel on every render.
    const onSync = useRef<(m: PreviewSyncMessage) => void>(() => {});
    useEffect(() => {
        onSync.current = (msg) => {
            if (msg.kind === "hello") {
                // Only answer with our copy when we hold unsaved in-place edits, so a
                // freshly opened editor/preview pair doesn't dirty each other on contact.
                if (entry && dirty) syncRef.current?.post({ kind: "draft", from: "preview", draft: draftRef.current });
            } else if (msg.kind === "draft" && !editing) {
                applyEditorDraft(msg.draft);
            }
        };
    });
    useEffect(() => {
        if (!id) return;
        const handle = openPreviewSync(id, "preview", (m) => onSync.current(m));
        syncRef.current = handle;
        handle?.post({ kind: "hello", from: "preview" });
        return () => {
            handle?.close();
            syncRef.current = null;
        };
    }, [id]);

    // Keep the outgoing snapshot fresh for the editor channel (hello replies + the
    // initial sync read it).
    useEffect(() => {
        draftRef.current = { title: entry?.title, slug: entry?.slug ?? null, status: entry?.status, data: (entry?.data ?? {}) as Record<string, unknown> };
    });

    const startEdit = () => {
        setSaveErr(null);
        setEditNote(null);
        if (mode === "site" && siteEditable) {
            setEditing(true);
            postToSite({ type: "edit", editing: true });
        } else {
            // Fallback: edit the studio's same-origin content render. If a real site
            // is configured but hasn't loaded the live-edit bridge, say why we
            // dropped to the content view instead of editing the live page.
            if (mode === "site" && !siteEditable) {
                setEditNote("This page isn't set up for live editing yet. Add flowcms-live-edit.js to your site to edit it in place; for now you're editing the content version.");
            }
            setUserMode("content");
            setEditing(true);
        }
    };
    const discard = () => {
        if (sectionEditing) {
            // Drop unsaved block edits by re-pulling the entry from the API.
            if (id) api<Entry>(`/entries/${id}`).then((e) => setEntry(e)).catch(() => undefined);
            setDirty(false);
            setSaveErr(null);
            setEditing(false);
            return;
        }
        if (siteEditing) {
            postToSite({ type: "revert" });
            postToSite({ type: "edit", editing: false });
        } else {
            if (titleRef.current) titleRef.current.textContent = entry?.title ?? "";
            if (summaryRef.current) summaryRef.current.textContent = summary;
            if (articleRef.current) articleRef.current.innerHTML = body || "<p>Nothing here yet — start writing in the editor.</p>";
        }
        setDirty(false);
        setSaveErr(null);
        setEditing(false);
    };
    const stopEdit = async () => {
        if (dirty && !(await confirm({ title: "Discard your unsaved changes?", confirmLabel: "Discard", tone: "danger" }))) return;
        if (siteEditing) {
            if (dirty) postToSite({ type: "revert" });
            postToSite({ type: "edit", editing: false });
            setDirty(false);
            setSaveErr(null);
            setEditing(false);
        } else {
            discard();
        }
    };
    const save = async () => {
        if (!id) return;
        // Section builder: the edited blocks already live in entry.data (via the
        // inline builder), so persist the entry data as-is.
        if (sectionEditing && entry) {
            setSaving(true);
            setSaveErr(null);
            try {
                await api(`/entries/${id}`, { method: "PATCH", body: JSON.stringify({ title: entry.title, data: entry.data }) });
                syncRef.current?.post({ kind: "saved", from: "preview" });
                setDirty(false);
                setSavedTick(true);
                setTimeout(() => setSavedTick(false), 2000);
            } catch (e) {
                setSaveErr(e instanceof ApiError ? e.message : "Could not save.");
            } finally {
                setSaving(false);
            }
            return;
        }
        // Collect the edited fields from whichever surface is active, as a flat map
        // keyed by content-model field name. Site mode streams that map over the
        // bridge; content mode reads the three editable nodes it renders.
        const src: Record<string, string> = siteEditing
            ? siteFieldsRef.current
            : {
                  ...(titleRef.current ? { title: titleRef.current.textContent ?? "" } : {}),
                  ...(summaryRef.current ? { summary: summaryRef.current.textContent ?? "" } : {}),
                  ...(articleRef.current ? { body: articleRef.current.innerHTML ?? "" } : {}),
              };
        // `title` maps to the entry title; everything else writes into entry data by
        // its field path (nested keys like "heroBanner.title" deep-set into data).
        // `slug` is a structural column (the live URL) — never rewrite it in place.
        // The API shallow-merges `data` at the top level, so we send the FULL
        // reconstructed object (a clone of the current data with edits applied),
        // which is the only safe way to change a nested field without dropping its
        // siblings.
        const nextData: Record<string, unknown> = JSON.parse(JSON.stringify(entry?.data ?? {}));
        const patch: Record<string, unknown> = {};
        let newTitle = "";
        let changedData = false;
        for (const [k, v] of Object.entries(src)) {
            if (typeof v !== "string") continue;
            if (k === "slug") continue;
            if (k === "title") {
                newTitle = v.trim();
                if (newTitle) patch.title = newTitle; // never blank out the title
            }
            setPath(nextData, k, v);
            changedData = true;
        }
        // Repeating lists: rebuild each edited array from the bridge's live items so
        // added / removed / reordered items persist (only in site mode).
        if (siteEditing) {
            for (const [path, items] of Object.entries(siteArraysRef.current)) {
                if (!Array.isArray(items)) continue;
                setPath(nextData, path, rebuildArray(getPath(nextData, path), items));
                changedData = true;
            }
        }
        if (changedData) patch.data = nextData;
        if (!Object.keys(patch).length) return;
        setSaving(true);
        setSaveErr(null);
        try {
            await api(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
            setEntry((e) => (e ? { ...e, title: (patch.title as string) ?? e.title, data: nextData } : e));
            // Reset the iframe's revert-baseline to the saved copy.
            if (siteEditing) postToSite({ type: "baseline", fields: { ...src, ...(newTitle ? { title: newTitle } : {}) } });
            // Tell the editor tab to reload the canonical saved copy.
            syncRef.current?.post({ kind: "saved", from: "preview" });
            setDirty(false);
            setSavedTick(true);
            setTimeout(() => setSavedTick(false), 2000);
        } catch (e) {
            setSaveErr(e instanceof ApiError ? e.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="relative flex h-dvh flex-col overflow-hidden bg-lavender-mist/40 dark:bg-dark-2">
            {/* Preview toolbar */}
            <header className="z-10 flex h-14 shrink-0 items-center gap-3 border-b border-grey-light bg-surface/90 px-4 backdrop-blur-md dark:border-grey-light/10 dark:bg-dark-1/90">
                <span className="inline-flex items-center gap-2 text-title font-semibold text-black dark:text-white">
                    <Icon className="h-4 w-4 fill-primary" name="eye" />
                    Preview
                </span>
                {entry && <StatusPill status={STATUS_PILL[entry.status] ?? "draft"} />}
                {entry?.hasDraft && (
                    <span className="inline-flex items-center rounded-md bg-warning/15 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-warning" title="Showing unpublished draft changes; the live page still shows the published version">
                        Draft changes
                    </span>
                )}

                {/* Device-width toggle */}
                <div className="mx-auto hidden items-center gap-1 rounded-2xl bg-lavender-mist p-1 sm:flex dark:bg-dark-3">
                    {DEVICES.map((d) => (
                        <button
                            key={d.id}
                            type="button"
                            onClick={() => setDevice(d.id)}
                            className={cn(
                                "h-8 rounded-xl px-3.5 text-caption-1 font-semibold transition-colors",
                                device === d.id ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey hover:text-primary",
                            )}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {/* Site vs content toggle — only when a Preview URL is configured */}
                    {hasSite && !editing && (
                        <div className="hidden items-center gap-1 rounded-2xl bg-lavender-mist p-1 md:flex dark:bg-dark-3">
                            {(["site", "content"] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setUserMode(m)}
                                    className={cn(
                                        "h-8 rounded-xl px-3 text-caption-1 font-semibold capitalize transition-colors",
                                        mode === m ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey hover:text-primary",
                                    )}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    )}
                    {mode === "site" && target && !editing && (
                        <a href={target} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-md" title="Open in new tab">
                            <Icon className="h-4 w-4 fill-current" name="external" />
                        </a>
                    )}
                    {/* Field mapper (Pro): set up which CMS field edits which element. */}
                    {entry && canLiveEdit && mode === "site" && !editing && (
                        <button
                            type="button"
                            onClick={() => setMapping((m) => !m)}
                            className={cn("btn-md", mapping ? "btn-primary" : "btn-secondary")}
                            title="Map fields to your page"
                        >
                            <Icon className={cn("h-4 w-4", mapping ? "fill-white" : "fill-current")} name="grid" />
                            <span className="hidden sm:inline">{mapping ? "Close mapper" : "Map fields"}</span>
                        </button>
                    )}
                    {/* Visual / live editor (Pro). Edits the content render in place. */}
                    {entry &&
                        !mapping &&
                        (canLiveEdit ? (
                            editing ? (
                                <button type="button" onClick={stopEdit} className="btn-secondary btn-md">
                                    <Icon className="h-4 w-4 fill-current" name="check" />
                                    <span className="hidden sm:inline">Done</span>
                                </button>
                            ) : (
                                <button type="button" onClick={() => { setMapping(false); startEdit(); }} className="btn-primary btn-md">
                                    <Icon className="h-4 w-4 fill-white" name="edit" />
                                    <span className="hidden sm:inline">Edit page</span>
                                </button>
                            )
                        ) : (
                            <Link href="/settings/plan" className="btn-ghost btn-md" title="Visual editor — upgrade to Pro">
                                <Icon className="h-4 w-4 fill-current" name="lock" />
                                <span className="hidden sm:inline">Edit · Pro</span>
                            </Link>
                        ))}
                    {!editing && (
                        <Link href={id ? `/content/editor?id=${id}` : "/content"} className="btn-secondary btn-md">
                            <Icon className="h-4 w-4 fill-current" name="edit" />
                            <span className="hidden sm:inline">Back to editor</span>
                        </Link>
                    )}
                </div>
            </header>

            {shownError ? (
                <div className="grid flex-1 place-items-center p-4">
                    <div className="max-w-md rounded-3xl bg-white p-10 text-center shadow-[0_0.5rem_2rem_rgba(227,230,236,0.55)] dark:bg-dark-1">
                        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                            <Icon className="h-6 w-6 fill-primary" name="eye" />
                        </span>
                        <p className="text-body text-grey">{shownError}</p>
                        <Link href="/content" className="btn-secondary btn-md mt-5">Back to content</Link>
                    </div>
                </div>
            ) : !entry ? (
                <div className="grid flex-1 place-items-center py-24">
                    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                </div>
            ) : mode === "site" ? (
                /* One iframe for every device size (never unmounts → no reload); the
                   frame's width / padding / bezel animate smoothly between sizes.
                   Desktop = full-bleed; Tablet / Mobile = a centered device frame. */
                <div className="flex min-h-0 flex-1 flex-col">
                    {usingTemplate && (
                        <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-caption-2 text-warning">
                            <Icon className="h-4 w-4 shrink-0 fill-warning" name="info" />
                            <span>
                                Previewing on your <strong className="font-semibold">{type?.name ?? "page"}</strong> template because this page isn&apos;t published yet. Fields you fill save to this page.
                            </span>
                        </div>
                    )}
                    <div
                        className={cn(
                            "flex min-h-0 flex-1 justify-center overflow-auto transition-[padding] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                            device === "desktop" ? "p-0" : "p-4 sm:p-6",
                        )}
                    >
                        <div
                            className={cn(
                                "h-full shrink-0 overflow-hidden bg-white transition-all duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-dark-1",
                                device === "desktop"
                                    ? "border-0"
                                    : "rounded-[1.75rem] border-[6px] border-ink/80 shadow-[0_1.5rem_3rem_rgba(26,26,46,0.22)] dark:border-black",
                            )}
                            style={{ width: dev.frame, maxWidth: "100%" }}
                        >
                            <iframe ref={iframeRef} key={frameSrc} src={frameSrc} onLoad={() => postToSite({ type: "hello" })} title="Live site preview" className="h-full w-full border-0" />
                        </div>
                    </div>
                </div>
            ) : (
                /* Content render (fallback / no Preview URL configured). */
                <div className="min-h-0 flex-1 overflow-auto px-4 py-8">
                    {!hasSite && !editing && (
                        <div className="mx-auto mb-5 flex max-w-[44rem] items-center gap-2 rounded-2xl bg-info/10 px-4 py-3 text-caption-1 text-info">
                            <Icon className="h-4 w-4 shrink-0 fill-info" name="info" />
                            <span>
                                Showing rendered content. Add a <strong className="font-semibold">Preview URL</strong> in{" "}
                                <Link href="/settings/system" className="font-semibold underline">Settings → System</Link> to preview it on your live site.
                            </span>
                        </div>
                    )}
                    <div
                        className="mx-auto rounded-3xl bg-white px-6 py-12 shadow-[0_0.5rem_2.5rem_rgba(26,26,46,0.10)] transition-[max-width] duration-300 ease-out sm:px-12 dark:bg-dark-1"
                        style={{ maxWidth: dev.card }}
                    >
                        {sectionEditing ? (
                            /* In-place block builder (Pro live editor): add / edit /
                               reorder components and their fields right on the page. */
                            <div className="-mx-2 sm:-mx-6">
                                <p className="mb-3 px-2 text-caption-2 text-grey">Add, edit, and reorder sections. Changes sync to the editor live.</p>
                                <SectionEditor sections={zoneSections} components={componentDefs} allowed={zoneField?.allowedComponents} onChange={updateSections} />
                            </div>
                        ) : sections ? (
                            <div className="-mx-6 sm:-mx-12">
                                <Sections sections={sections} />
                            </div>
                        ) : isEmpty && !editing ? (
                            /* New / not-yet-filled page → a tidy default instead of a blank. */
                            <div className="-mx-6 sm:-mx-12">
                                <div className="mb-4 flex items-center gap-2 px-6 text-caption-2 text-grey">
                                    <Icon className="h-4 w-4 shrink-0 fill-grey" name="info" />
                                    Showing default content while this page is being set up.
                                </div>
                                <Sections sections={defaultScaffold(entry.title)} />
                            </div>
                        ) : (
                        <article className="mx-auto max-w-[44rem]">
                            {client && <div className="mb-3 text-caption-1 font-semibold uppercase tracking-wide text-primary">{client}</div>}
                            <h1
                                ref={titleRef}
                                contentEditable={editing}
                                suppressContentEditableWarning
                                onInput={() => { setDirty(true); broadcastFromNodes(); }}
                                className={cn(
                                    "font-poppins text-[2.25rem] leading-[1.15] font-bold tracking-[-0.02em] text-balance text-black focus:outline-none dark:text-white",
                                    editing && "-mx-2 rounded-lg px-2 outline-2 outline-dashed outline-primary/40",
                                )}
                            >
                                {entry.title}
                            </h1>
                            {summary && (
                                <p
                                    ref={summaryRef}
                                    contentEditable={editing}
                                    suppressContentEditableWarning
                                    onInput={() => { setDirty(true); broadcastFromNodes(); }}
                                    className={cn("mt-4 text-[1.0625rem] leading-7 text-grey focus:outline-none", editing && "-mx-2 rounded-lg px-2 outline-2 outline-dashed outline-primary/40")}
                                >
                                    {summary}
                                </p>
                            )}
                            <div className="mt-6 mb-10 flex items-center gap-2 text-caption-2 text-grey">
                                <StatusPill status={STATUS_PILL[entry.status] ?? "draft"} />
                                {entry.contentType?.name && <span>· {entry.contentType.name}</span>}
                            </div>
                            {/* Schema fields (Headline, Hero image, CTA…) so authored
                                content shows up in the preview, not just title + body. */}
                            {metaFields.length > 0 && (
                                <dl className="mb-10 grid gap-5">
                                    {metaFields.map((f) => {
                                        const v = str(entry.data?.[f.name]);
                                        if (!v) return null;
                                        return (
                                            <div key={f.id} className="flex flex-col gap-1.5">
                                                <dt className="text-caption-2 font-semibold uppercase tracking-wide text-grey">{fieldLabel(f)}</dt>
                                                <dd>
                                                    {f.type === "Media" ? (
                                                        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/asset URL, not a known-size local asset
                                                        <img src={v} alt={f.name} className="max-h-96 w-full rounded-2xl object-cover" />
                                                    ) : f.type === "URL" ? (
                                                        <a href={v} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{v}</a>
                                                    ) : (
                                                        <span className="text-[1.0625rem] leading-7 text-black dark:text-white">{v}</span>
                                                    )}
                                                </dd>
                                            </div>
                                        );
                                    })}
                                </dl>
                            )}
                            {/* Authored content (TipTap output). Editable in place when the
                                live editor is on (Pro) — edits save back to the entry body. */}
                            <div
                                ref={articleRef}
                                contentEditable={editing}
                                suppressContentEditableWarning
                                onInput={() => { setDirty(true); broadcastFromNodes(); }}
                                className={cn("flow-prose focus:outline-none", editing && "-mx-3 rounded-xl p-3 outline-2 outline-dashed outline-primary/40")}
                                dangerouslySetInnerHTML={{ __html: body || "<p>Nothing here yet — start writing in the editor.</p>" }}
                            />
                        </article>
                        )}
                    </div>
                </div>
            )}

            {/* Live-editor action bar (Pro) — save / discard the in-place edits. */}
            {editing && (
                <div className="z-10 flex shrink-0 flex-wrap items-center gap-3 border-t border-grey-light bg-surface/95 px-4 py-3 backdrop-blur dark:border-grey-light/10 dark:bg-dark-1/95">
                    <span className="inline-flex items-center gap-1.5 text-caption-1 font-semibold text-primary">
                        <Icon className="h-4 w-4 fill-primary" name="edit" /> Live editing
                    </span>
                    <span className="text-caption-2">
                        {saveErr ? (
                            <span className="text-error">{saveErr}</span>
                        ) : editNote ? (
                            <span className="text-warning">{editNote}</span>
                        ) : (
                            <span className="text-grey">{dirty ? "Unsaved changes" : savedTick ? "Saved" : sectionEditing ? "Add, edit, and reorder sections below." : "Click the title, summary or body to edit it directly."}</span>
                        )}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={discard} disabled={!dirty || saving} className="btn-secondary btn-md disabled:opacity-50">
                            Discard
                        </button>
                        <button type="button" onClick={save} disabled={!dirty || saving} className="btn-primary btn-md disabled:opacity-60">
                            {saving ? "Saving…" : "Save changes"}
                        </button>
                    </div>
                </div>
            )}

            {/* Visual field mapper drawer (Pro). Auto-suggests + point-and-click to
                build the selector map; saving refreshes the bindings the bridge uses. */}
            <Mapper
                open={mapping && mode === "site"}
                onClose={() => setMapping(false)}
                ready={siteEditable}
                post={postToSite}
                contentTypeId={type?.id}
                entryData={entry?.data ?? null}
                initialBindings={bindings}
                onSaved={(b) => setBindings(b)}
            />
        </div>
    );
};

export default PreviewClient;
