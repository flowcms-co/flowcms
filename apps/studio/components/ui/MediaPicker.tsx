"use client";

/**
 * Media picker modal: choose an image from the workspace Assets library (grid) or
 * paste a URL. Replaces the bare window.prompt. Rendered as a fixed, centered modal
 * (bottom sheet on mobile) so it never gets clipped by a scroll container.
 */

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { api, mediaUrl } from "@/lib/api";
import { cn } from "@/lib/cn";

type Asset = { id: string; name: string; type: string; url: string; thumbUrl: string };

const isImg = (s: string) => /^(https?:\/\/|\/)/.test(s);

/* ── image preview with graceful broken-image fallback (remount via key resets) ── */
export const MediaPreview = ({ url, alt, onReplace, onRemove }: { url: string; alt: string; onReplace: () => void; onRemove: () => void }) => {
    const [broken, setBroken] = useState(false);
    const overlay = (
        <div className="absolute right-2 top-2 flex gap-1.5">
            <button type="button" onClick={onReplace} className="inline-flex items-center gap-1 rounded-lg bg-ink/70 px-2.5 py-1.5 text-caption-2 font-medium text-white backdrop-blur transition-colors hover:bg-ink/85">
                <Icon className="h-3.5 w-3.5 fill-current" name="refresh" />
                Replace
            </button>
            <button type="button" onClick={onRemove} aria-label="Remove image" className="inline-flex items-center justify-center rounded-lg bg-ink/70 px-2 py-1.5 text-white backdrop-blur transition-colors hover:bg-error/80">
                <Icon className="h-3.5 w-3.5 fill-current" name="trash" />
            </button>
        </div>
    );
    if (broken) {
        return (
            <div className="relative flex h-28 items-center justify-center gap-2 rounded-none border border-grey-light bg-lavender-mist/40 text-caption-2 text-grey dark:border-grey-light/10 dark:bg-dark-3/40">
                <Icon className="h-4 w-4 fill-grey" name="image" />
                Couldn’t load image
                {overlay}
            </div>
        );
    }
    return (
        <div className="group relative flex items-center justify-center overflow-hidden rounded-none border border-grey-light bg-lavender-mist/40 p-2 dark:border-grey-light/10 dark:bg-dark-3/40">
            {/* object-contain so the WHOLE image is visible (no center-crop), capped in height. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary asset/external URL */}
            <img src={mediaUrl(url)} alt={alt} onError={() => setBroken(true)} className="max-h-64 w-auto max-w-full object-contain" />
            {overlay}
        </div>
    );
};

/**
 * A complete Media field control: shows the chosen image (with Replace/Remove) or a
 * "Choose image" dropzone, and opens the asset picker. Shared by the section page
 * builder and the schema-driven (nested component) field editor so every Media field
 * gets the asset library picker, not a bare URL text box.
 */
export const MediaField = ({ value, alt, onChange }: { value: unknown; alt: string; onChange: (url: string) => void }) => {
    const [picker, setPicker] = useState(false);
    const url = typeof value === "string" ? value : "";
    return (
        <>
            {url ? (
                <MediaPreview key={url} url={url} alt={alt} onReplace={() => setPicker(true)} onRemove={() => onChange("")} />
            ) : (
                <button
                    type="button"
                    onClick={() => setPicker(true)}
                    className="flex h-28 items-center justify-center gap-2 rounded-none border border-dashed border-grey-light text-caption-1 text-grey transition-colors hover:border-primary hover:text-primary dark:border-grey-light/15"
                >
                    <Icon className="h-4 w-4 fill-current" name="image" />
                    Choose image
                </button>
            )}
            {picker && <MediaPicker value={url} onSelect={(v) => onChange(v)} onClose={() => setPicker(false)} />}
        </>
    );
};

const MediaPicker = ({ value, onSelect, onClose }: { value?: string; onSelect: (url: string) => void; onClose: () => void }) => {
    const [tab, setTab] = useState<"library" | "url">("library");
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [url, setUrl] = useState(value ?? "");
    const [q, setQ] = useState("");

    useEffect(() => {
        let off = false;
        api<Asset[] | { data?: Asset[]; items?: Asset[] }>("/assets?limit=100")
            .then((r) => {
                if (off) return;
                const list = Array.isArray(r) ? r : r.data ?? r.items ?? [];
                setAssets(list.filter((a) => a.type === "image"));
            })
            .catch(() => undefined)
            .finally(() => !off && setLoading(false));
        return () => {
            off = true;
        };
    }, []);

    const shown = assets.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()));
    const trimmed = url.trim();
    const valid = isImg(trimmed);
    const commitUrl = () => {
        if (trimmed && valid) {
            onSelect(trimmed);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm motion-safe:animate-[fadeIn_140ms_ease-out] sm:items-center" onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-none border border-grey-light bg-white shadow-[0_1.5rem_4rem_rgba(26,26,46,0.28)] motion-safe:animate-[sheetUp_220ms_cubic-bezier(0.22,1,0.36,1)] dark:border-grey-light/10 dark:bg-dark-1"
            >
                <div className="flex items-center justify-between border-b border-grey-light px-4 py-3 dark:border-grey-light/10">
                    <div className="inline-flex items-center gap-1 rounded-xl bg-lavender-mist p-1 dark:bg-dark-3">
                        {(["library", "url"] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setTab(m)}
                                className={cn("h-8 rounded-lg px-3 text-caption-1 font-semibold transition-colors", tab === m ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey hover:text-primary")}
                            >
                                {m === "library" ? "Library" : "Paste URL"}
                            </button>
                        ))}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3">
                        <Icon className="h-4 w-4 fill-current" name="close" />
                    </button>
                </div>

                {tab === "library" ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                        <p className="flex items-start gap-2 rounded-xl bg-lavender-mist/60 px-3 py-2 text-caption-2 text-grey dark:bg-dark-3/60">
                            <Icon className="mt-px h-3.5 w-3.5 shrink-0 fill-grey" name="info" />
                            <span>FlowCMS-hosted images get a permanent URL that updates instantly, no site redeploy needed. Or use Paste URL for an externally hosted image.</span>
                        </p>
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media…" className="flow-input shrink-0" />
                        {loading ? (
                            <div className="grid place-items-center py-16">
                                <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                            </div>
                        ) : shown.length === 0 ? (
                            <div className="grid place-items-center gap-2 py-12 text-center">
                                <Icon className="h-6 w-6 fill-grey" name="image" />
                                <p className="text-caption-1 text-grey">{assets.length ? "No matches." : "No images in your library yet. Paste a URL instead."}</p>
                            </div>
                        ) : (
                            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 content-start gap-3 overflow-y-auto scrollbar-thin sm:grid-cols-4">
                                {shown.map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => { onSelect(a.url); onClose(); }}
                                        title={a.name}
                                        className={cn("group flex flex-col overflow-hidden rounded-xl border text-left transition-all", value === a.url ? "border-primary ring-2 ring-primary/30" : "border-grey-light hover:border-primary dark:border-grey-light/10")}
                                    >
                                        <span className="block aspect-square w-full overflow-hidden bg-lavender-mist dark:bg-dark-3">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- workspace asset thumbnail */}
                                            <img src={mediaUrl(a.thumbUrl)} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
                                        </span>
                                        <span className="truncate px-2 py-1 text-caption-2 text-grey">{a.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 p-4">
                        <p className="flex items-start gap-2 rounded-xl bg-lavender-mist/60 px-3 py-2 text-caption-2 text-grey dark:bg-dark-3/60">
                            <Icon className="mt-px h-3.5 w-3.5 shrink-0 fill-grey" name="external" />
                            <span>Point this field at an already-hosted image (your CDN, Cloudinary, an existing URL). Nothing is uploaded to FlowCMS, so it never triggers a site rebuild.</span>
                        </p>
                        <input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && commitUrl()}
                            placeholder="/path or https://…"
                            className="flow-input"
                            autoFocus
                        />
                        {trimmed && !valid && <p className="text-caption-2 text-error">Enter a full https:// URL or a root-relative /path.</p>}
                        {trimmed && valid && (
                            <div className="overflow-hidden rounded-none border border-grey-light dark:border-grey-light/10">
                                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external/asset URL preview */}
                                <img src={mediaUrl(trimmed)} alt="Preview" className="max-h-56 w-full object-cover" />
                            </div>
                        )}
                        <button type="button" onClick={commitUrl} disabled={!trimmed || !valid} className="btn-primary self-end disabled:opacity-50">
                            Use this URL
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MediaPicker;
