"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollResetOnChange } from "@/lib/useScroll";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { useRevealBatch } from "@/lib/useReveal";
import { api, uploadFile, mediaUrl, ApiError } from "@/lib/api";
import { useJobs } from "@/components/providers/JobsProvider";
import { confirm } from "@/components/providers/ConfirmProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { typeIcon, type AltSource } from "@/mocks/assets";
import { cn } from "@/lib/cn";

gsap.registerPlugin(useGSAP);

/** How many files to upload at once. The rest queue and start as slots free up. */
const UPLOAD_CONCURRENCY = 3;

/** Live asset shape returned by the API (GET /assets). */
type LiveAsset = {
    id: string;
    name: string;
    type: "image" | "video" | "doc";
    ext: string;
    mimeType: string;
    sizeBytes: number;
    size: string;
    dimensions?: string;
    folder: string;
    url: string;
    thumbUrl: string;
    alt: string;
    altSource: AltSource;
    /** Same bytes as another asset in the workspace. */
    duplicate: boolean;
    createdAt: string;
};

const altMeta: Record<AltSource, { label: string; color: string; icon: string }> = {
    ai: { label: "AI generated", color: "#6C5CE7", icon: "sparkles" },
    manual: { label: "Edited", color: "#3B82F6", icon: "edit" },
    none: { label: "Missing alt", color: "#F5A623", icon: "clock" },
};

/**
 * Assets — the workspace media library, wired to the live backend. Uploads go to
 * the server where Flow CMS runs (POST /assets → stored on disk, served at
 * /media/...); the grid lists real files; images get a thumbnail and can have
 * AI-written alt text generated via a vision-capable provider.
 */
const AssetsPage = () => {
    const [items, setItems] = useState<LiveAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState<number | null>(null); // whole library, not just the loaded page
    const [folder, setFolder] = useState("all");
    const [view, setView] = useState<"all" | "duplicates" | "missingAlt">("all"); // server-side filters
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [notice, setNotice] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [pending, setPending] = useState(0); // files queued + in flight (drives the button + unload guard)
    const [altBusy, setAltBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const queueRef = useRef<{ file: File; folder: string }[]>([]);
    const inFlightRef = useRef(0);
    const imageIdsRef = useRef<string[]>([]);
    const dupeCountRef = useRef(0);
    const { enqueue } = useJobs();
    const { can } = useAuth();

    // One-off backfill: copy asset alt text onto pages that use the image without any.
    const fillPageAlts = async () => {
        const ok = await confirm({
            title: "Fill alt text on pages?",
            message:
                "Every page that uses a library image without alt text gets the asset’s alt text. Alt text already written on a page is kept.\n\nLive pages get the change as a draft to approve and publish; drafts are updated directly.",
            confirmLabel: "Fill alt text",
        });
        if (ok) void enqueue("/entries/bulk/fill-alt");
    };

    // Search runs server-side: the list endpoint returns one capped page, so
    // filtering only what is loaded would never find older assets.
    const loadSeq = useRef(0);
    const load = () => {
        const seq = ++loadSeq.current;
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (view !== "all") params.set(view, "1");
        const qs = params.toString();
        void api<{ total: number }>("/assets/count").then((d) => setTotal(d.total)).catch(() => undefined);
        return api<LiveAsset[]>(`/assets${qs ? `?${qs}` : ""}`)
            .then((d) => seq === loadSeq.current && setItems(d))
            .catch(() => seq === loadSeq.current && setItems([]))
            .finally(() => setLoading(false));
    };

    // Global search links here as /assets?q=<name>.
    useEffect(() => {
        const initial = new URLSearchParams(window.location.search).get("q");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (initial) setQuery(initial);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => void load(), query ? 250 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, view]);

    // A selection only makes sense within the current view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => setChecked(new Set()), [query, folder, view]);

    // Warn before leaving while uploads are still in flight: the file bytes live in
    // this tab and can't resume after a refresh. (Queued AI alt-text jobs DO continue
    // server-side, so once a file has uploaded its alt text finishes regardless.)
    useEffect(() => {
        if (pending === 0) return;
        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [pending]);

    // The folder filter still runs client-side over the one loaded page (500);
    // pass ?folder= to the API and page with offset if libraries outgrow that.
    const visible = items.filter((a) => folder === "all" || a.folder === folder);
    const selected = items.find((a) => a.id === selectedId) ?? null;
    const missingAlt = items.filter((a) => a.type === "image" && a.altSource === "none").length;

    // Folders derived from the real loaded assets: "All" plus any distinct
    // (non-empty) folder names the API returned. No invented taxonomy. The API
    // reports unfoldered assets as folder "all" (its catch-all sentinel), so
    // that value must not become a chip of its own next to "All assets".
    const folders = [
        { id: "all", name: "All assets" },
        ...Array.from(new Set(items.map((a) => a.folder).filter((name) => name && name !== "all")))
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ id: name, name })),
    ];

    const gridRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    useScrollResetOnChange(topRef, folder);
    useRevealBatch(gridRef, ".reveal-up", [folder, items.length]);

    const drawerRef = useRef<HTMLElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    useGSAP(
        () => {
            if (!selectedId || !drawerRef.current) return;
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return;
            gsap.from(backdropRef.current, { autoAlpha: 0, duration: 0.3, ease: "power2.out" });
            gsap.from(drawerRef.current, { xPercent: 100, duration: 0.42, ease: "power3.out", clearProps: "transform" });
        },
        { dependencies: [selectedId] },
    );

    const patchLocal = (id: string, p: Partial<LiveAsset>) =>
        setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));

    // Upload one file to the server (a slot in the concurrency pool).
    const uploadOne = async ({ file, folder: targetFolder }: { file: File; folder: string }) => {
        const fd = new FormData();
        fd.append("file", file);
        if (targetFolder) fd.append("folder", targetFolder);
        try {
            const created = await uploadFile<LiveAsset>("/assets", fd);
            setItems((prev) => [created, ...prev]);
            setTotal((t) => (t === null ? t : t + 1));
            if (created.duplicate) dupeCountRef.current += 1;
            if (created.type === "image") imageIdsRef.current.push(created.id);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : `Couldn’t upload ${file.name}.`);
        }
    };

    // Drain the queue with at most UPLOAD_CONCURRENCY uploads in flight. When the
    // whole batch finishes, kick off AI alt text for the images it added (inline for
    // one, a background job for several) so the big batch never blocks the page.
    const pump = () => {
        while (inFlightRef.current < UPLOAD_CONCURRENCY && queueRef.current.length) {
            const item = queueRef.current.shift()!;
            inFlightRef.current += 1;
            void uploadOne(item).finally(() => {
                inFlightRef.current -= 1;
                setPending(queueRef.current.length + inFlightRef.current);
                if (queueRef.current.length || inFlightRef.current) {
                    pump();
                } else {
                    const ids = imageIdsRef.current;
                    imageIdsRef.current = [];
                    const dupes = dupeCountRef.current;
                    dupeCountRef.current = 0;
                    if (dupes) {
                        setNotice(`${dupes} uploaded file${dupes === 1 ? " is a duplicate" : "s are duplicates"} of existing assets.`);
                        void load(); // refresh flags on the originals too
                    }
                    if (ids.length === 1) void autoAlt(ids[0]);
                    else if (ids.length > 1) void enqueue("/assets/bulk-process", { ids });
                }
            });
        }
        setPending(queueRef.current.length + inFlightRef.current);
    };

    // Real upload → server. Queues the chosen files and keeps the Upload button free
    // so more can be added mid-flight; each file remembers the folder it was added to.
    const onFiles = (files: FileList | null) => {
        if (!files?.length) return;
        setError(null);
        const targetFolder = folder === "all" ? "" : folder;
        queueRef.current.push(...Array.from(files).map((file) => ({ file, folder: targetFolder })));
        setPending(queueRef.current.length + inFlightRef.current);
        pump();
        if (fileRef.current) fileRef.current.value = "";
    };

    // Generate alt text on the server (vision model). Silent on the auto path.
    const autoAlt = async (id: string) => {
        try {
            const updated = await api<LiveAsset>(`/assets/${id}/generate-alt`, { method: "POST" });
            patchLocal(id, { alt: updated.alt, altSource: updated.altSource });
        } catch {
            /* no vision provider / failed — leave as "missing", user can retry */
        }
    };

    const generateAlt = async (id: string) => {
        setAltBusy(true);
        setError(null);
        try {
            const updated = await api<LiveAsset>(`/assets/${id}/generate-alt`, { method: "POST" });
            patchLocal(id, { alt: updated.alt, altSource: updated.altSource });
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not generate alt text.");
        } finally {
            setAltBusy(false);
        }
    };

    const saveAlt = async (id: string, alt: string) => {
        try {
            const updated = await api<LiveAsset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify({ alt }) });
            patchLocal(id, { alt: updated.alt, altSource: updated.altSource });
        } catch {
            /* ignore */
        }
    };

    // Rename only changes the display name; the file's URL stays the same, so pages
    // using it are unaffected. Reload after, since a new name can create or clear a
    // duplicate match with another file. Returns an error message, or null on success.
    const rename = async (id: string, name: string): Promise<string | null> => {
        try {
            const updated = await api<LiveAsset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify({ filename: name }) });
            patchLocal(id, { name: updated.name, duplicate: updated.duplicate });
            void load();
            return null;
        } catch (e) {
            return e instanceof ApiError ? e.message : "Couldn’t rename this file.";
        }
    };

    // Pages (content entries) that use any of these assets, deduped. null if the check
    // itself failed, so callers can still ask before deleting.
    const pagesUsing = async (ids: string[]) => {
        try {
            const usage = await api<Record<string, { id: string; title: string }[]>>("/assets/usage", { method: "POST", body: JSON.stringify({ ids }) });
            return [...new Map(Object.values(usage).flat().map((p) => [p.id, p])).values()];
        } catch {
            return null;
        }
    };

    const usageMessage = (pages: { title: string }[]) => {
        const names = pages.slice(0, 5).map((p) => `• ${p.title}`);
        if (pages.length > 5) names.push(`…and ${pages.length - 5} more`);
        return `Used on ${pages.length} page${pages.length === 1 ? "" : "s"}:\n${names.join("\n")}\n\nDeleting will leave a broken image on ${pages.length === 1 ? "it" : "them"}. This can’t be undone.`;
    };

    // Reload after deleting either way: removing one copy can clear the other's duplicate flag.
    const remove = async (id: string) => {
        const pages = await pagesUsing([id]);
        const name = items.find((a) => a.id === id)?.name ?? "this asset";
        if (pages === null && !(await confirm({ title: `Delete ${name}?`, message: "Couldn’t check whether any page uses it. This can’t be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
        if (pages?.length && !(await confirm({ title: `${name} is in use`, message: usageMessage(pages), confirmLabel: "Delete anyway", tone: "danger" }))) return;
        setItems((prev) => prev.filter((x) => x.id !== id));
        setSelectedId(null);
        setError(null);
        try {
            await api(`/assets/${id}`, { method: "DELETE" });
        } catch (e) {
            // Say why instead of letting the asset silently reappear on the reload below.
            setError(e instanceof ApiError ? e.message : `Couldn’t delete ${name}.`);
        }
        void load();
    };

    // Filter views span the whole library, so they reset the folder chip.
    const showView = (v: "duplicates" | "missingAlt") => {
        setView(v);
        setFolder("all");
    };

    const toggleChecked = (id: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            if (!next.delete(id)) next.add(id);
            return next;
        });

    const removeChecked = async () => {
        const ids = [...checked];
        if (!ids.length) return;
        const label = `${ids.length} asset${ids.length === 1 ? "" : "s"}`;
        const pages = await pagesUsing(ids);
        const message = pages?.length ? usageMessage(pages) : pages ? "This can’t be undone." : "Couldn’t check whether any page uses them. This can’t be undone.";
        if (!(await confirm({ title: `Delete ${label}?`, message, confirmLabel: pages?.length ? "Delete anyway" : "Delete", tone: "danger" }))) return;
        setItems((prev) => prev.filter((x) => !checked.has(x.id)));
        setChecked(new Set());
        setError(null);
        try {
            await api(`/assets/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) });
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn’t delete the selected assets.");
        }
        void load();
    };

    return (
        <div className="flex flex-col gap-6">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} aria-hidden />
            <div ref={topRef} className="scroll-mt-6" />

            {/* Toolbar: stays pinned while scrolling the grid (below the mobile top bar,
                at the very top on desktop where the top bar scrolls away). The page-coloured
                background bleeds to the edges so cards don't show through. */}
            <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 flex flex-col gap-3 bg-bg px-4 py-3 md:-mx-6 md:px-6 lg:top-0 xl:-mx-8 xl:px-8 dark:bg-dark-2">
                <div className="flex flex-wrap items-center gap-3">
                    <label className="relative flex items-center grow max-w-xs">
                        <Icon className="absolute left-3.5 w-4 h-4 fill-grey" name="search" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search assets…"
                            className="w-full h-11 pl-10 pr-3 rounded-lg bg-white border border-grey-light text-body-sm text-black outline-none transition-colors focus:border-primary placeholder:text-grey dark:bg-dark-1 dark:border-grey-light/10 dark:text-white"
                        />
                    </label>
                    {total !== null && (
                        <span className="text-caption-1 font-semibold text-grey whitespace-nowrap">
                            {query.trim() || view !== "all" || folder !== "all" ? `${visible.length} of ${total} assets` : `${total} asset${total === 1 ? "" : "s"}`}
                        </span>
                    )}
                    {missingAlt > 0 && view !== "missingAlt" && (
                        <button
                            type="button"
                            onClick={() => showView("missingAlt")}
                            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-warning/10 text-warning text-caption-1 font-semibold transition-colors hover:bg-warning/20"
                        >
                            <Icon className="w-4 h-4 fill-warning" name="clock" />
                            {missingAlt} missing alt
                        </button>
                    )}
                    {can("content.update") && (
                        <button type="button" onClick={fillPageAlts} className="btn-secondary ml-auto" title="Copy asset alt text onto pages that use the image without any">
                            <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="sparkles" />
                            Fill page alt text
                        </button>
                    )}
                    <button type="button" onClick={() => fileRef.current?.click()} aria-busy={pending > 0} data-tour="assets-upload" className={cn("btn-primary", !can("content.update") && "ml-auto")}>
                        <Icon className="w-5 h-5 fill-white" name="plus" />
                        {pending > 0 ? `Uploading ${pending}… · add more` : "Upload"}
                    </button>
                </div>

                {error && <div className="rounded-lg bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
                {notice && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning/10 px-4 py-3 text-body-sm text-warning">
                        <Icon className="w-4 h-4 fill-warning" name="copy" />
                        {notice}
                        <button
                            type="button"
                            onClick={() => {
                                showView("duplicates");
                                setNotice(null);
                            }}
                            className="font-semibold underline"
                        >
                            Review duplicates
                        </button>
                        <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto">
                            <Icon className="w-4 h-4 fill-warning" name="close" />
                        </button>
                    </div>
                )}

                {checked.size > 0 && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-lavender-mist px-4 py-2.5 dark:bg-dark-3">
                        <span className="text-body-sm font-semibold text-black dark:text-white">{checked.size} selected</span>
                        <button type="button" onClick={() => setChecked(new Set(visible.map((a) => a.id)))} className="text-caption-1 font-semibold text-primary">
                            Select all ({visible.length})
                        </button>
                        <button type="button" onClick={() => setChecked(new Set())} className="text-caption-1 font-semibold text-grey">
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={removeChecked}
                            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-error/10 text-caption-1 font-semibold text-error transition-colors hover:bg-error/20"
                        >
                            <Icon className="w-4 h-4 fill-error" name="trash" />
                            Delete {checked.size}
                        </button>
                    </div>
                )}

            </div>

            {/* Folder chips */}
            <div className="flex flex-wrap gap-2">
                {folders.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                            setFolder(f.id);
                            setView("all");
                        }}
                        className={cn(
                            "h-9 px-3.5 rounded-md text-caption-1 font-semibold transition-colors",
                            view === "all" && folder === f.id ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3",
                        )}
                    >
                        {f.name}
                    </button>
                ))}
                {(
                    [
                        { id: "missingAlt", label: "Missing alt", icon: "clock" },
                        { id: "duplicates", label: "Duplicates", icon: "copy" },
                    ] as const
                ).map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => showView(v.id)}
                        className={cn(
                            "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-caption-1 font-semibold transition-colors",
                            view === v.id ? "bg-warning text-white" : "bg-lavender-mist text-grey hover:text-warning dark:bg-dark-3",
                        )}
                    >
                        <Icon className={cn("w-4 h-4", view === v.id ? "fill-white" : "fill-warning")} name={v.icon} />
                        {v.label}
                    </button>
                ))}
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid place-items-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                </div>
            ) : (
                <div ref={gridRef} className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                    {visible.map((a) => (
                        <div key={a.id} className="reveal-up group relative">
                            <button
                                type="button"
                                // While a selection is active, clicking a card adds/removes it instead of opening details.
                                onClick={() => (checked.size ? toggleChecked(a.id) : setSelectedId(a.id))}
                                className={cn(
                                    "flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_0.5rem_2rem_rgba(227,230,236,0.55)] transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.12)] dark:bg-dark-1 dark:shadow-[0_0.5rem_2rem_rgba(0,0,0,0.3)]",
                                    (selectedId === a.id || checked.has(a.id)) && "ring-2 ring-primary",
                                )}
                            >
                                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-lavender-mist dark:bg-dark-3">
                                    {a.type === "image" ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={mediaUrl(a.thumbUrl)} alt={a.alt || a.name} loading="lazy" className="h-full w-full object-cover" />
                                    ) : (
                                        <Icon className="w-9 h-9 fill-primary/70" name={typeIcon[a.type]} />
                                    )}
                                    <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/35 text-[0.625rem] font-bold text-white backdrop-blur-sm">
                                        {a.ext}
                                    </span>
                                    {a.type === "image" && (
                                        <span
                                            className={cn(
                                                "absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.625rem] font-bold backdrop-blur-sm",
                                                a.altSource === "none" ? "bg-warning text-white" : "bg-white/85 text-primary",
                                            )}
                                        >
                                            <Icon
                                                className={cn("w-3 h-3", a.altSource === "none" ? "fill-white" : "fill-primary")}
                                                name={a.altSource === "none" ? "clock" : a.altSource === "ai" ? "sparkles" : "check"}
                                            />
                                            {a.altSource === "none" ? "No alt" : "Alt"}
                                        </span>
                                    )}
                                    {a.duplicate && (
                                        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-warning text-[0.625rem] font-bold text-white">
                                            <Icon className="w-3 h-3 fill-white" name="copy" />
                                            Duplicate
                                        </span>
                                    )}
                                </div>
                                <div className="p-3.5">
                                    <div className="truncate text-body-sm font-semibold text-black dark:text-white">{a.name}</div>
                                    <div className="mt-0.5 text-caption-2 text-grey">
                                        {a.size}
                                        {a.dimensions ? ` · ${a.dimensions}` : ""}
                                    </div>
                                </div>
                            </button>
                            <input
                                type="checkbox"
                                checked={checked.has(a.id)}
                                onChange={() => toggleChecked(a.id)}
                                aria-label={`Select ${a.name}`}
                                className={cn(
                                    "absolute top-2.5 left-2.5 h-5 w-5 cursor-pointer accent-primary transition-opacity",
                                    checked.size || checked.has(a.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                                )}
                            />
                        </div>
                    ))}
                </div>
            )}

            {!loading && visible.length === 0 && (
                <Card className="flex flex-col items-center gap-3 py-16 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="h-6 w-6 fill-primary" name="image" />
                    </span>
                    <p className="text-body text-grey">{view === "duplicates" ? "No duplicate files. Nice and tidy." : view === "missingAlt" ? "Every image has alt text." : query.trim() ? "No assets match your search." : items.length === 0 ? "No assets yet: upload your first file." : "No assets in this folder."}</p>
                    <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary">
                        <Icon className="w-5 h-5 fill-white" name="plus" />
                        Upload
                    </button>
                </Card>
            )}

            {/* Detail drawer */}
            {selected && (
                <>
                    <div ref={backdropRef} className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm" onClick={() => setSelectedId(null)} />
                    <aside ref={drawerRef} className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[26rem] flex-col overflow-y-auto bg-white p-6 shadow-[0_0_3rem_rgba(26,26,46,0.25)] dark:bg-dark-1">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-h5 text-black dark:text-white">Asset details</h2>
                            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close" className="btn-circle w-9 h-9 dark:bg-dark-3">
                                <Icon className="w-4 h-4 fill-grey" name="close" />
                            </button>
                        </div>

                        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-lavender-mist dark:bg-dark-3">
                            {selected.type === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={mediaUrl(selected.url)} alt={selected.alt || selected.name} className="h-full w-full object-contain" />
                            ) : (
                                <Icon className="w-12 h-12 fill-primary/70" name={typeIcon[selected.type]} />
                            )}
                        </div>

                        <RenameField key={selected.id} name={selected.name} onRename={(n) => rename(selected.id, n)} />
                        <div className="mt-1 text-caption-2 text-grey">
                            {selected.ext} · {selected.size}
                            {selected.dimensions ? ` · ${selected.dimensions}` : ""}
                        </div>

                        {selected.type === "image" ? (
                            <div className="mt-5">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-caption-1 text-black dark:text-white">Alt text</span>
                                    <AltBadge source={selected.altSource} />
                                </div>
                                <textarea
                                    value={selected.alt}
                                    onChange={(e) => patchLocal(selected.id, { alt: e.target.value, altSource: "manual" })}
                                    onBlur={(e) => saveAlt(selected.id, e.target.value)}
                                    rows={3}
                                    placeholder="Describe this image for accessibility & SEO…"
                                    className="flow-input resize-none"
                                />
                                <button type="button" onClick={() => generateAlt(selected.id)} disabled={altBusy} className="btn-secondary w-full mt-2 disabled:opacity-60">
                                    <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="sparkles" />
                                    {altBusy ? "Generating…" : selected.alt ? "Regenerate with AI" : "Generate with AI"}
                                </button>
                                <p className="mt-2 text-caption-2 text-grey">
                                    Alt text is written by a vision-capable AI provider. Connect one in Settings → Integrations.
                                </p>
                            </div>
                        ) : (
                            <p className="mt-5 rounded-lg bg-lavender-mist/60 p-3 text-caption-2 text-grey dark:bg-dark-3/50">
                                Alt text isn&rsquo;t required for {selected.type} files.
                            </p>
                        )}

                        <div className="mt-auto flex gap-2 pt-6">
                            <a href={mediaUrl(selected.url)} download={selected.name} target="_blank" rel="noopener noreferrer" className="btn-secondary grow">
                                <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="download" />
                                Download
                            </a>
                            <button
                                type="button"
                                onClick={() => remove(selected.id)}
                                className="flex items-center justify-center w-11 h-11 rounded-lg bg-error/10 text-error transition-colors hover:bg-error/20"
                                aria-label="Delete asset"
                            >
                                <Icon className="w-5 h-5 fill-error" name="trash" />
                            </button>
                        </div>
                    </aside>
                </>
            )}
        </div>
    );
};

/** The asset name, editable in place. The extension is shown but not editable (the
 *  server keeps it); Enter or leaving the field saves, Escape cancels. */
const RenameField = ({ name, onRename }: { name: string; onRename: (name: string) => Promise<string | null> }) => {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot) : "";
    const base = ext ? name.slice(0, dot) : name;
    const [draft, setDraft] = useState(base);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        const next = draft.trim();
        if (!next || next === base) {
            setDraft(base);
            setError(null);
            return;
        }
        setSaving(true);
        const err = await onRename(`${next}${ext}`);
        setSaving(false);
        setError(err);
        if (err) setDraft(base);
    };

    return (
        <div className="mt-4">
            <label className="flex items-center gap-1 rounded-lg border border-transparent px-2 -mx-2 transition-colors focus-within:border-primary hover:border-grey-light dark:hover:border-grey-light/10">
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void save()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                            setDraft(base);
                            setError(null);
                        }
                    }}
                    disabled={saving}
                    aria-label="File name"
                    title="Rename file"
                    className="min-w-0 grow bg-transparent py-1 text-title text-black outline-none dark:text-white"
                />
                {ext && <span className="shrink-0 text-title text-grey">{ext}</span>}
                <Icon className="h-4 w-4 shrink-0 fill-grey" name="edit" />
            </label>
            {error && <p className="mt-1 text-caption-2 text-error">{error}</p>}
        </div>
    );
};

const AltBadge = ({ source }: { source: AltSource }) => {
    const m = altMeta[source];
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.6875rem] font-semibold" style={{ backgroundColor: `${m.color}1a`, color: m.color }}>
            <Icon className="w-3 h-3" name={m.icon} fill={m.color} />
            {m.label}
        </span>
    );
};

export default AssetsPage;
