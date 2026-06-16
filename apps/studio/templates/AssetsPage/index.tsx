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
    createdAt: string;
};

const altMeta: Record<AltSource, { label: string; color: string; icon: string }> = {
    ai: { label: "AI generated", color: "#6C5CE7", icon: "sparkles" },
    manual: { label: "Edited", color: "#3B82F6", icon: "edit" },
    none: { label: "Missing alt", color: "#F5A623", icon: "clock" },
};

const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
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
    const [folder, setFolder] = useState("all");
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [pending, setPending] = useState(0); // files queued + in flight (drives the button + unload guard)
    const [altBusy, setAltBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const queueRef = useRef<{ file: File; folder: string }[]>([]);
    const inFlightRef = useRef(0);
    const imageIdsRef = useRef<string[]>([]);
    const { enqueue } = useJobs();

    const load = () =>
        api<LiveAsset[]>("/assets")
            .then((d) => setItems(d))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const q = query.trim().toLowerCase();
    const visible = items.filter(
        (a) => (folder === "all" || a.folder === folder) && (!q || a.name.toLowerCase().includes(q)),
    );
    const selected = items.find((a) => a.id === selectedId) ?? null;
    const missingAlt = items.filter((a) => a.type === "image" && a.altSource === "none").length;

    // Folders derived from the real loaded assets: "All" plus any distinct
    // (non-empty) folder names the API returned. No invented taxonomy.
    const folders = [
        { id: "all", name: "All assets" },
        ...Array.from(new Set(items.map((a) => a.folder).filter(Boolean)))
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

    const remove = async (id: string) => {
        setItems((prev) => prev.filter((x) => x.id !== id));
        setSelectedId(null);
        try {
            await api(`/assets/${id}`, { method: "DELETE" });
        } catch {
            void load();
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} aria-hidden />
            <div ref={topRef} className="scroll-mt-6" />

            {/* Toolbar */}
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
                {missingAlt > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-warning/10 text-warning text-caption-1 font-semibold">
                        <Icon className="w-4 h-4 fill-warning" name="clock" />
                        {missingAlt} missing alt
                    </span>
                )}
                <button type="button" onClick={() => fileRef.current?.click()} aria-busy={pending > 0} className="btn-primary ml-auto">
                    <Icon className="w-5 h-5 fill-white" name="plus" />
                    {pending > 0 ? `Uploading ${pending}… · add more` : "Upload"}
                </button>
            </div>

            {error && <div className="rounded-lg bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

            {/* Folder chips */}
            <div className="flex flex-wrap gap-2">
                {folders.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setFolder(f.id)}
                        className={cn(
                            "h-9 px-3.5 rounded-md text-caption-1 font-semibold transition-colors",
                            folder === f.id ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3",
                        )}
                    >
                        {f.name}
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
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelectedId(a.id)}
                            className={cn(
                                "reveal-up group flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_0.5rem_2rem_rgba(227,230,236,0.55)] transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.12)] dark:bg-dark-1 dark:shadow-[0_0.5rem_2rem_rgba(0,0,0,0.3)]",
                                selectedId === a.id && "ring-2 ring-primary",
                            )}
                        >
                            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-lavender-mist dark:bg-dark-3">
                                {a.type === "image" ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={mediaUrl(a.thumbUrl)} alt={a.alt || a.name} loading="lazy" className="h-full w-full object-cover" />
                                ) : (
                                    <Icon className="w-9 h-9 fill-primary/70" name={typeIcon[a.type]} />
                                )}
                                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/35 text-[0.625rem] font-bold text-white backdrop-blur-sm">
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
                            </div>
                            <div className="p-3.5">
                                <div className="truncate text-body-sm font-semibold text-black dark:text-white">{a.name}</div>
                                <div className="mt-0.5 text-caption-2 text-grey">
                                    {a.size}
                                    {a.dimensions ? ` · ${a.dimensions}` : ""}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {!loading && visible.length === 0 && (
                <Card className="flex flex-col items-center gap-3 py-16 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="h-6 w-6 fill-primary" name="image" />
                    </span>
                    <p className="text-body text-grey">{items.length === 0 ? "No assets yet: upload your first file." : "No assets in this folder."}</p>
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

                        <div className="mt-4 truncate text-title text-black dark:text-white">{selected.name}</div>
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
