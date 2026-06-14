"use client";

/**
 * Media picker modal: choose an image from the workspace Assets library (grid) or
 * paste a URL. Replaces the bare window.prompt. Rendered as a fixed, centered modal
 * (bottom sheet on mobile) so it never gets clipped by a scroll container.
 */

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type Asset = { id: string; name: string; type: string; url: string; thumbUrl: string };

const isImg = (s: string) => /^(https?:\/\/|\/)/.test(s);

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
    const commitUrl = () => {
        const v = url.trim();
        if (v) {
            onSelect(v);
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
                    <div className="flex min-h-0 flex-col gap-3 p-4">
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
                            <div className="grid grid-cols-3 gap-3 overflow-y-auto scrollbar-thin sm:grid-cols-4">
                                {shown.map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => { onSelect(a.url); onClose(); }}
                                        title={a.name}
                                        className={cn("overflow-hidden rounded-xl border transition-all", value === a.url ? "border-primary ring-2 ring-primary/30" : "border-grey-light hover:border-primary dark:border-grey-light/10")}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element -- workspace asset thumbnail */}
                                        <img src={a.thumbUrl} alt={a.name} className="aspect-square w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 p-4">
                        <input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && commitUrl()}
                            placeholder="/path or https://…"
                            className="flow-input"
                            autoFocus
                        />
                        {url.trim() && isImg(url.trim()) && (
                            <div className="overflow-hidden rounded-none border border-grey-light dark:border-grey-light/10">
                                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external/asset URL preview */}
                                <img src={url.trim()} alt="Preview" className="max-h-56 w-full object-cover" />
                            </div>
                        )}
                        <button type="button" onClick={commitUrl} disabled={!url.trim()} className="btn-primary self-end disabled:opacity-50">
                            Use this URL
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MediaPicker;
