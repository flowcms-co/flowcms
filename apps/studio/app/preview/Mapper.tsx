"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

type Binding = { fieldPath: string; selector: string; mode: string; nth?: number };
type Suggestion = { fieldPath: string; selector?: string; nth?: number; mode?: string; value?: string; confidence: number; ambiguous?: boolean };
type Field = { path: string; value: string; kind: string };

const MEDIA_RE = /(\.(png|jpe?g|webp|gif|svg|avif|ico|bmp|mp4|webm|mov|mp3|wav|pdf|docx?|zip)(\?.*)?$)|^\/?(assets|images|img|uploads|media)\//i;

/** Same value-shape heuristic the importer uses, so the mapper labels fields the
 *  way they were modeled (image picker vs prose vs link). */
const kindOf = (path: string, value: string): string => {
    const leaf = path.split(".").pop() ?? "";
    if (MEDIA_RE.test(value) || /(image|photo|avatar|logo|icon|cover|thumbnail|banner)$/i.test(leaf)) return "media";
    if (/(^|_|\.)(url|link|href)$/i.test(path) || /^https?:\/\//i.test(value)) return "url";
    if (value.length > 160) return "rich";
    return "text";
};

/** Walk entry data into editable scalar leaves with their dot/array path. */
const flatten = (obj: unknown, prefix: string, out: Field[]) => {
    if (obj == null) return;
    if (Array.isArray(obj)) {
        obj.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out));
        return;
    }
    if (typeof obj === "object") {
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
        return;
    }
    if (typeof obj === "string" && obj.trim()) out.push({ path: prefix, value: obj, kind: kindOf(prefix, obj) });
};

const KIND_ICON: Record<string, string> = { media: "image", url: "external", rich: "document", text: "edit" };

type Props = {
    open: boolean;
    onClose: () => void;
    ready: boolean;
    post: (msg: Record<string, unknown>) => void;
    contentTypeId?: string;
    entryData: Record<string, unknown> | null;
    initialBindings: Binding[];
    onSaved: (bindings: Binding[]) => void;
};

/**
 * Visual field mapper (M2). Lists the entry's editable fields, auto-suggests a
 * DOM element for each (value matching, done in the bridge), and lets a
 * non-developer confirm or point-and-click the rest. Saves a SelectorMap so the
 * customer site needs only the universal bridge script.
 */
const Mapper = ({ open, onClose, ready, post, contentTypeId, entryData, initialBindings, onSaved }: Props) => {
    const fields = useMemo(() => {
        const out: Field[] = [];
        flatten(entryData ?? {}, "", out);
        return out;
    }, [entryData]);

    const [bindings, setBindings] = useState<Record<string, Binding>>({});
    const [sugg, setSugg] = useState<Record<string, Suggestion>>({});
    const [picking, setPicking] = useState<string | null>(null);
    const [stale, setStale] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "unmapped" | "mapped" | "stale">("all");

    // Seed the working map from the saved map.
    useEffect(() => {
        const m: Record<string, Binding> = {};
        for (const b of initialBindings) m[b.fieldPath] = b;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBindings(m);
    }, [initialBindings]);

    // Ask the bridge for suggestions + a staleness probe once it's ready.
    useEffect(() => {
        if (!open || !ready) return;
        post({ type: "suggest", fields });
        post({ type: "probe" });
    }, [open, ready, fields, post]);

    // Bridge replies: suggestions, a picked element, and which saved bindings broke.
    useEffect(() => {
        if (!open) return;
        const onMsg = (e: MessageEvent) => {
            const d = e.data as { source?: string; type?: string; items?: Suggestion[]; fieldPath?: string; selector?: string; mode?: string; nth?: number; unresolved?: string[] } | null;
            if (!d || d.source !== "flowcms-preview") return;
            if (d.type === "suggestions" && Array.isArray(d.items)) {
                const m: Record<string, Suggestion> = {};
                for (const it of d.items) if (it && it.fieldPath) m[it.fieldPath] = it;
                setSugg(m);
            } else if (d.type === "picked" && d.fieldPath && d.selector) {
                const fp = d.fieldPath;
                setBindings((b) => ({ ...b, [fp]: { fieldPath: fp, selector: d.selector as string, mode: d.mode || "text", nth: d.nth || 0 } }));
                setStale((s) => {
                    const n = new Set(s);
                    n.delete(fp);
                    return n;
                });
                setPicking(null);
            } else if (d.type === "probe-result" && Array.isArray(d.unresolved)) {
                setStale(new Set(d.unresolved));
            }
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, [open]);

    const accept = (path: string) => {
        const s = sugg[path];
        if (!s?.selector) return;
        setBindings((b) => ({ ...b, [path]: { fieldPath: path, selector: s.selector as string, mode: s.mode || "text", nth: s.nth || 0 } }));
    };
    const acceptAll = () => {
        setBindings((b) => {
            const n = { ...b };
            for (const f of fields) {
                const s = sugg[f.path];
                if (s?.selector && s.confidence >= 0.85 && !n[f.path]) n[f.path] = { fieldPath: f.path, selector: s.selector, mode: s.mode || "text", nth: s.nth || 0 };
            }
            return n;
        });
    };
    const clearOne = (path: string) => {
        setBindings((b) => {
            const n = { ...b };
            delete n[path];
            return n;
        });
        if (picking === path) cancelPick();
    };
    const pick = (path: string) => {
        setPicking(path);
        post({ type: "pick", fieldPath: path });
    };
    const cancelPick = () => {
        setPicking(null);
        post({ type: "pickCancel" });
    };

    const save = async () => {
        if (!contentTypeId) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const arr = Object.values(bindings);
            const res = await api<{ bindings?: Binding[] }>("/selector-maps", { method: "PUT", body: JSON.stringify({ contentTypeId, urlPattern: "", bindings: arr }) });
            onSaved(res.bindings ?? arr);
            setSaveMsg(`Saved ${arr.length} field${arr.length === 1 ? "" : "s"}.`);
            setTimeout(() => setSaveMsg(null), 2500);
        } catch (e) {
            setSaveMsg(e instanceof ApiError ? e.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const boundCount = Object.keys(bindings).length;
    const confidentCount = fields.filter((f) => !bindings[f.path] && (sugg[f.path]?.confidence ?? 0) >= 0.85).length;
    const staleCount = fields.filter((f) => bindings[f.path] && stale.has(f.path)).length;
    const q = query.trim().toLowerCase();
    const visible = fields.filter((f) => {
        if (q && !f.path.toLowerCase().includes(q) && !f.value.toLowerCase().includes(q)) return false;
        const bound = !!bindings[f.path];
        if (filter === "mapped") return bound;
        if (filter === "unmapped") return !bound;
        if (filter === "stale") return bound && stale.has(f.path);
        return true;
    });
    const FILTERS: { id: typeof filter; label: string }[] = [
        { id: "all", label: `All ${fields.length}` },
        { id: "unmapped", label: `Unmapped ${fields.length - boundCount}` },
        { id: "mapped", label: `Mapped ${boundCount}` },
        ...(staleCount ? ([{ id: "stale" as const, label: `Stale ${staleCount}` }]) : []),
    ];

    return (
        <aside className="absolute right-0 top-14 bottom-0 z-20 flex w-[22rem] max-w-[90vw] flex-col border-l border-grey-light bg-surface shadow-[-0.5rem_0_1.5rem_rgba(26,26,46,0.08)] dark:border-grey-light/10 dark:bg-dark-1">
            <div className="flex items-center gap-2 border-b border-grey-light px-4 py-3 dark:border-grey-light/10">
                <Icon className="h-4 w-4 fill-primary" name="edit" />
                <span className="text-title font-semibold text-black dark:text-white">Map fields</span>
                <span className="ml-auto text-caption-2 text-grey">{boundCount}/{fields.length} mapped</span>
                <button type="button" onClick={onClose} aria-label="Close" className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-grey hover:bg-lavender-mist dark:hover:bg-dark-3">
                    <Icon className="h-4 w-4 fill-current" name="close" />
                </button>
            </div>

            {!ready ? (
                <div className="px-4 py-6 text-caption-1 text-grey">Waiting for your page to load the live-edit script…</div>
            ) : (
                <>
                    <div className="flex items-center gap-2 border-b border-grey-light px-4 py-2.5 dark:border-grey-light/10">
                        <button type="button" onClick={acceptAll} disabled={!confidentCount} className="btn-secondary btn-md disabled:opacity-50">
                            <Icon className="h-4 w-4 fill-current" name="check" />
                            Auto-map{confidentCount ? ` (${confidentCount})` : ""}
                        </button>
                        <button type="button" onClick={save} disabled={saving || !boundCount} className="btn-primary btn-md ml-auto disabled:opacity-60">
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                    {(saveMsg || picking) && (
                        <div className={cn("px-4 py-2 text-caption-2", picking ? "bg-primary/10 text-primary" : "bg-success/10 text-success")}>
                            {picking ? (
                                <span className="flex items-center justify-between gap-2">
                                    <span>Click the element on your page for <b className="font-mono">{picking}</b></span>
                                    <button type="button" onClick={cancelPick} className="font-semibold underline">Cancel</button>
                                </span>
                            ) : (
                                saveMsg
                            )}
                        </div>
                    )}
                    {staleCount > 0 && (
                        <button type="button" onClick={() => setFilter("stale")} className="flex items-center gap-1.5 bg-error/10 px-4 py-2 text-left text-caption-2 text-error">
                            <Icon className="h-3.5 w-3.5 shrink-0 fill-error" name="info" />
                            {staleCount} mapped field{staleCount === 1 ? "" : "s"} no longer match the page. Re-pick them.
                        </button>
                    )}

                    <div className="border-b border-grey-light px-3 py-2 dark:border-grey-light/10">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter fields…"
                            className="h-8 w-full rounded-lg border border-grey-light bg-surface px-2.5 text-caption-2 text-black focus:border-primary focus:outline-none dark:border-grey-light/15 dark:bg-dark-3 dark:text-white"
                        />
                        <div className="mt-2 flex flex-wrap gap-1">
                            {FILTERS.map((ff) => (
                                <button
                                    key={ff.id}
                                    type="button"
                                    onClick={() => setFilter(ff.id)}
                                    className={cn("rounded-md px-2 py-1 text-[0.625rem] font-semibold transition-colors", filter === ff.id ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3")}
                                >
                                    {ff.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <ul className="min-h-0 flex-1 divide-y divide-grey-light overflow-y-auto dark:divide-grey-light/10">
                        {visible.map((f) => {
                            const bound = bindings[f.path];
                            const isStale = bound && stale.has(f.path);
                            const s = sugg[f.path];
                            const status: "stale" | "bound" | "suggested" | "unmapped" = isStale ? "stale" : bound ? "bound" : s?.selector ? "suggested" : "unmapped";
                            return (
                                <li key={f.path} className="flex flex-col gap-1.5 px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-3.5 w-3.5 shrink-0 fill-grey" name={KIND_ICON[f.kind] ?? "edit"} />
                                        <span className="truncate font-mono text-caption-2 text-black dark:text-white" title={f.path}>{f.path}</span>
                                        <span
                                            className={cn(
                                                "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide",
                                                status === "bound" && "bg-success/15 text-success",
                                                status === "stale" && "bg-error/15 text-error",
                                                status === "suggested" && "bg-primary/15 text-primary",
                                                status === "unmapped" && "bg-grey-light text-grey dark:bg-dark-3",
                                            )}
                                        >
                                            {status === "suggested" ? `${Math.round((s?.confidence ?? 0) * 100)}%` : status}
                                        </span>
                                    </div>
                                    <div className="truncate pl-5 text-caption-2 text-grey" title={f.value}>{f.value}</div>
                                    <div className="flex items-center gap-2 pl-5">
                                        {status === "suggested" && (
                                            <button type="button" onClick={() => accept(f.path)} className="text-caption-2 font-semibold text-primary hover:underline">Accept</button>
                                        )}
                                        <button type="button" onClick={() => pick(f.path)} className={cn("text-caption-2 font-semibold hover:underline", picking === f.path ? "text-primary" : "text-grey")}>
                                            {bound ? "Re-pick" : "Pick on page"}
                                        </button>
                                        {bound && (
                                            <button type="button" onClick={() => clearOne(f.path)} className="text-caption-2 font-semibold text-grey hover:text-error hover:underline">Clear</button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                        {!visible.length && <li className="px-4 py-6 text-caption-1 text-grey">{fields.length ? "No fields match this filter." : "No editable text fields found on this entry."}</li>}
                    </ul>
                </>
            )}
        </aside>
    );
};

export default Mapper;
