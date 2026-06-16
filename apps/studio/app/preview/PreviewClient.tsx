"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/useWorkspace";
import { usePlan } from "@/components/providers/LicenseProvider";
import { cn } from "@/lib/cn";
import { fieldLabel, type SchemaField } from "@/mocks/schema";
import Sections, { findSections } from "./Sections";
import Mapper from "./Mapper";
import { confirm } from "@/components/providers/ConfirmProvider";

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

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** One field→DOM binding from a CMS selector map. */
type Binding = { fieldPath: string; selector: string; mode: string; nth?: number };

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
    const [siteEditable, setSiteEditable] = useState(false);
    // CMS-stored field→DOM map for this entry's type + URL. Sent to the bridge so
    // the customer site needs no per-field attributes (M1 of assisted mapping).
    const [bindings, setBindings] = useState<Binding[]>([]);
    // Visual mapper drawer (M2): build the selector map by auto-suggest + clicks.
    const [mapping, setMapping] = useState(false);

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

    // Two edit surfaces: an edit-aware Site iframe (postMessage bridge → edit on the
    // real rendered page) or the same-origin Content render (contentEditable). When
    // a Site is editable we edit there; otherwise we fall back to Content mode.
    const siteEditing = editing && mode === "site";

    const postToSite = (msg: Record<string, unknown>) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        let origin = "*";
        try {
            if (target) origin = new URL(target).origin;
        } catch {
            /* keep * */
        }
        win.postMessage({ source: "flowcms-studio", ...msg }, origin);
    };

    // Push the selector map to the bridge once the site is ready (and again if the
    // map or target changes). The bridge applies it idempotently.
    useEffect(() => {
        if (siteEditable && mode === "site" && bindings.length) postToSite({ type: "map", bindings });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteEditable, bindings, target, mode]);

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
            } | null;
            if (!d || d.source !== "flowcms-preview") return;
            if (d.type === "ready") setSiteEditable(true);
            else if (d.type === "dirty") setDirty(true);
            else if (d.type === "fields") {
                const map: Record<string, string> = {};
                if (d.fields && typeof d.fields === "object") {
                    for (const [k, v] of Object.entries(d.fields)) if (typeof v === "string") map[k] = v;
                }
                // Back-compat: accept the legacy flat keys too.
                for (const k of ["title", "summary", "body"] as const) if (typeof d[k] === "string") map[k] = d[k] as string;
                siteFieldsRef.current = map;
            }
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, []);

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
        if (changedData) patch.data = nextData;
        if (!Object.keys(patch).length) return;
        setSaving(true);
        setSaveErr(null);
        try {
            await api(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
            setEntry((e) => (e ? { ...e, title: (patch.title as string) ?? e.title, data: nextData } : e));
            // Reset the iframe's revert-baseline to the saved copy.
            if (siteEditing) postToSite({ type: "baseline", fields: { ...src, ...(newTitle ? { title: newTitle } : {}) } });
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
                        <iframe ref={iframeRef} key={target} src={target} onLoad={() => postToSite({ type: "hello" })} title="Live site preview" className="h-full w-full border-0" />
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
                        {sections ? (
                            <div className="-mx-6 sm:-mx-12">
                                <Sections sections={sections} />
                            </div>
                        ) : (
                        <article className="mx-auto max-w-[44rem]">
                            {client && <div className="mb-3 text-caption-1 font-semibold uppercase tracking-wide text-primary">{client}</div>}
                            <h1
                                ref={titleRef}
                                contentEditable={editing}
                                suppressContentEditableWarning
                                onInput={() => setDirty(true)}
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
                                    onInput={() => setDirty(true)}
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
                                onInput={() => setDirty(true)}
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
                            <span className="text-grey">{dirty ? "Unsaved changes" : savedTick ? "Saved" : "Click the title, summary or body to edit it directly."}</span>
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
