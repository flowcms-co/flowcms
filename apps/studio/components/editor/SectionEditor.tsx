"use client";

/**
 * Section-based page builder. Renders a content type's DynamicZone field as a
 * vertical stack of component "sections" (Hero, Main Content, Testimonials…), each
 * a card with its own settings, drag-to-reorder, duplicate/delete and an
 * "+ Add block" control between them. Reuses FieldControl for section fields and
 * EditorCanvas (TipTap) for rich-text sections. The edited array is the value of
 * the zone field in the entry's data, so it autosaves/draft/publishes unchanged.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import type { Editor } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import EditorCanvas from "./EditorCanvas";
import { MediaField } from "@/components/ui/MediaPicker";
import { runAi, extractJson, aiErrorMessage } from "@/lib/useAi";
import { FieldControl } from "./FieldsForm";
import { fieldLabel, type SchemaField } from "@/mocks/schema";
import { cn } from "@/lib/cn";

export type ComponentDef = { apiId: string; name: string; icon: string; fields: SchemaField[] };
export type Section = Record<string, unknown> & { __component: string; __uid: string };

const newUid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Soft character target for a text field, inferred from its name (matches the
 *  Hero "Title 30/60" / "Subtitle 48/160" pattern). 0 = just show a live count. */
const limitFor = (name: string): number => {
    const n = name.toLowerCase();
    if (/\b(title|headline|heading|name)\b/.test(n)) return 60;
    if (/(subtitle|subhead|description|summary|excerpt|tagline|meta)/.test(n)) return 160;
    return 0;
};

/** Build a section with sensible empty values for a component's fields. */
const blankSection = (def: ComponentDef): Section => ({ __component: def.apiId, __uid: newUid() });

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A short preview of a section's content — its first non-empty text-ish field —
 *  shown on the header when the section is collapsed so it's identifiable folded. */
const sectionSummary = (def: ComponentDef, section: Section): string => {
    for (const f of def.fields) {
        if (f.type !== "Text" && f.type !== "URL" && f.type !== "Rich text") continue;
        const v = str(section[f.name]);
        if (!v.trim()) continue;
        const text = f.type === "Rich text" ? v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : v.trim();
        if (text) return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
    return "";
};

/* ── single field control with label + char counter / media preview ── */
const SectionField = ({ field, value, onChange }: { field: SchemaField; value: unknown; onChange: (v: unknown) => void }) => {
    const limit = limitFor(field.name);

    if (field.type === "Boolean") {
        return (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Switch checked={!!value} onChange={onChange} aria-label={fieldLabel(field)} />
                <span className="text-caption-1 text-grey">{fieldLabel(field)}</span>
            </label>
        );
    }

    if (field.type === "Media") {
        return (
            <div className="flex flex-col gap-1.5">
                <span className="text-caption-1 text-grey">{fieldLabel(field)}</span>
                {field.description && <span className="-mt-0.5 text-caption-2 text-grey/80">{field.description}</span>}
                <MediaField value={value} alt={fieldLabel(field)} onChange={onChange} />
            </div>
        );
    }

    if (field.type === "Text" || field.type === "URL") {
        const v = str(value);
        return (
            <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between gap-2 text-caption-1 text-grey">
                    <span className="flex items-center gap-1">
                        {fieldLabel(field)}
                        {field.required && <span className="text-error">*</span>}
                    </span>
                    <span className={cn("text-caption-2 tabular-nums", limit && v.length > limit ? "text-error" : "text-grey/70")}>
                        {limit ? `${v.length} / ${limit}` : v.length || ""}
                    </span>
                </span>
                {field.description && <span className="text-caption-2 text-grey/80">{field.description}</span>}
                <input
                    value={v}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.type === "URL" ? "/path or https://…" : undefined}
                    className="flow-input"
                />
                {/* underline progress (matches the Hero title accent) */}
                {limit > 0 && (
                    <span className="h-0.5 w-full overflow-hidden rounded-full bg-grey-light dark:bg-dark-3">
                        <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, (v.length / limit) * 100)}%` }} />
                    </span>
                )}
            </label>
        );
    }

    // Number / Date / Rich text / Component / Reference fall back to FieldControl.
    return (
        <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-caption-1 text-grey">
                {fieldLabel(field)}
                {field.required && <span className="text-error">*</span>}
            </span>
            {field.description && <span className="text-caption-2 text-grey/80">{field.description}</span>}
            <FieldControl field={field} value={value} onChange={onChange} />
        </label>
    );
};

/* ── a rich-text "Main Content" style section (TipTap) ── */
const RichTextBody = ({ value, onChange }: { value: string; onChange: (html: string) => void }) => {
    // The TipTap "update" handler is bound once on mount, but this section card
    // survives reorder/duplicate (keyed by __uid), so a captured onChange would go
    // stale and write edits to the section's OLD position. Route through a ref that
    // always holds the latest onChange (which closes over the current index/section).
    const latest = useRef(onChange);
    useEffect(() => {
        latest.current = onChange;
    });
    return (
        <EditorCanvas
            initialContent={value}
            onReady={(editor: Editor) => {
                editor.on("update", () => latest.current(editor.getHTML()));
            }}
        />
    );
};

/* ── per-section "Write with AI": generate the section's field values as JSON ── */
const SectionAiModal = ({ def, onApply, onClose }: { def: ComponentDef; onApply: (json: Record<string, unknown>) => void; onClose: () => void }) => {
    const [prompt, setPrompt] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const run = async () => {
        setBusy(true);
        setErr(null);
        try {
            const fieldList = def.fields
                .filter((f) => f.type !== "Media")
                .map((f) => `- ${f.name} (${f.type === "Rich text" ? "HTML" : f.type}${f.required ? ", required" : ""})`)
                .join("\n");
            const res = await runAi({
                feature: "content.generate",
                system: "You write concise, specific, on-brand website section copy. Return ONLY a JSON object, no prose, no code fences.",
                prompt: `Fill a "${def.name}" section. Fields:\n${fieldList}\n\nBrief: ${prompt.trim() || "Write compelling, specific copy for this section."}\n\nReturn a JSON object keyed by the exact field names above. Rich-text/HTML fields use simple tags (<p>, <h2>, <ul>). Boolean fields use true/false. Number fields use a number. Omit image/Media fields. No commentary.`,
                maxTokens: 1200,
                temperature: 0.7,
            });
            const json = extractJson<Record<string, unknown>>(res.text);
            if (!json || typeof json !== "object" || Array.isArray(json)) {
                setErr("The AI didn’t return usable content. Try a clearer brief.");
                return;
            }
            onApply(json);
            onClose();
        } catch (e) {
            setErr(aiErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm motion-safe:animate-[fadeIn_140ms_ease-out] sm:items-center" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-none border border-grey-light bg-white shadow-[0_1.5rem_4rem_rgba(26,26,46,0.28)] motion-safe:animate-[sheetUp_220ms_cubic-bezier(0.22,1,0.36,1)] dark:border-grey-light/10 dark:bg-dark-1">
                <div className="flex items-center gap-2 border-b border-grey-light px-4 py-3 dark:border-grey-light/10">
                    <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="sparkles" />
                    <span className="text-title font-semibold text-black dark:text-white">Write {def.name} with AI</span>
                    <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3">
                        <Icon className="h-4 w-4 fill-current" name="close" />
                    </button>
                </div>
                <div className="flex flex-col gap-3 p-4">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder={`What should this ${def.name.toLowerCase()} say? (e.g. “a hero for a self-hostable headless CMS aimed at agencies”)`}
                        className="flow-input resize-none"
                    />
                    {err && <p className="text-caption-2 text-error">{err}</p>}
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-caption-2 text-grey">Fills this section’s fields. Uses your AI provider.</span>
                        <button type="button" onClick={() => void run()} disabled={busy} className="btn-primary btn-md min-w-[6.5rem] disabled:opacity-60">
                            {busy ? "Writing…" : "Generate"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ── one section card ── */
const SectionCard = ({
    def,
    section,
    index,
    count,
    open,
    onToggle,
    onChange,
    onRemove,
    onDuplicate,
    onMove,
}: {
    def: ComponentDef;
    section: Section;
    index: number;
    count: number;
    open: boolean;
    onToggle: () => void;
    onChange: (next: Section) => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onMove: (dir: -1 | 1) => void;
}) => {
    const controls = useDragControls();
    const reduce = useReducedMotion();
    const [menu, setMenu] = useState(false);
    const [ai, setAi] = useState(false);
    const preview = sectionSummary(def, section);
    const set = (name: string, v: unknown) => onChange({ ...section, [name]: v });
    /** Merge AI-generated values (keyed by field name, lenient) into this section. */
    const applyAi = (json: Record<string, unknown>) => {
        const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
        const next: Section = { ...section };
        for (const f of def.fields) {
            const key = Object.keys(json).find((k) => norm(k) === norm(f.name));
            const v = key !== undefined ? json[key] : undefined;
            if (v !== undefined && v !== null && v !== "") next[f.name] = v as never;
        }
        onChange(next);
    };

    // A component whose only field is a single Rich text → render as a full
    // "Main Content" canvas (the screenshots' rich text block).
    const richOnly = def.fields.length === 1 && def.fields[0].type === "Rich text";

    return (
        <Reorder.Item as="div" value={section} dragListener={false} dragControls={controls} className="overflow-hidden rounded-none border border-white/60 bg-white/50 shadow-[0_0.5rem_1.5rem_rgba(26,26,46,0.06)] backdrop-blur-2xl transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.09)] dark:border-white/10 dark:bg-dark-1/45">
            {/* header */}
            <div className="flex items-center gap-3 border-b border-grey-light/60 px-4 py-3 dark:border-white/5">
                <button type="button" aria-label="Drag to reorder" onPointerDown={(e) => controls.start(e)} className="flex h-8 w-7 shrink-0 cursor-grab items-center justify-center text-grey transition-colors hover:text-primary active:cursor-grabbing touch-none">
                    <Icon className="h-4 w-4 fill-current" name="grip" />
                </button>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name={def.icon} />
                </span>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    className="group flex min-w-0 grow items-center gap-2 text-left"
                >
                    <span className="min-w-0 grow">
                        <span className="block truncate text-title font-semibold text-black dark:text-white">{def.name}</span>
                        <span className="block truncate text-caption-2 text-grey">
                            {open || !preview ? `Section ${index + 1} of ${count}` : preview}
                        </span>
                    </span>
                    <Icon
                        name="arrow-down"
                        className={`h-4 w-4 shrink-0 fill-grey transition-transform duration-200 group-hover:fill-primary ${open ? "rotate-0" : "-rotate-90"}`}
                    />
                </button>
                <button type="button" onClick={() => setAi(true)} title={`Write ${def.name} with AI`} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-caption-2 font-semibold text-primary transition-colors hover:bg-lavender-mist dark:text-lilac dark:hover:bg-dark-3">
                    <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="sparkles" />
                    <span className="hidden sm:inline">AI</span>
                </button>
                <div className="relative shrink-0">
                    <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Section settings" className="flex h-9 w-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3">
                        <Icon className="h-4 w-4 fill-current" name="dots" />
                    </button>
                    {menu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
                            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-none border border-grey-light bg-white py-1 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1">
                                <MenuItem icon="arrow-down" flip label="Move up" disabled={index === 0} onClick={() => { onMove(-1); setMenu(false); }} />
                                <MenuItem icon="arrow-down" label="Move down" disabled={index === count - 1} onClick={() => { onMove(1); setMenu(false); }} />
                                <MenuItem icon="copy" label="Duplicate" onClick={() => { onDuplicate(); setMenu(false); }} />
                                <MenuItem icon="trash" label="Delete" danger onClick={() => { onRemove(); setMenu(false); }} />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* body */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={reduce ? { duration: 0 } : { duration: 0.22, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-5 p-4">
                            {richOnly ? (
                                <RichTextBody value={str(section[def.fields[0].name])} onChange={(html) => set(def.fields[0].name, html)} />
                            ) : (
                                def.fields.map((f) => <SectionField key={f.id ?? f.name} field={f} value={section[f.name]} onChange={(v) => set(f.name, v)} />)
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {ai && <SectionAiModal def={def} onApply={applyAi} onClose={() => setAi(false)} />}
        </Reorder.Item>
    );
};

const MenuItem = ({ icon, label, onClick, disabled, danger, flip }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; flip?: boolean }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-caption-1 transition-colors disabled:opacity-40",
            danger ? "text-error hover:bg-error/10" : "text-black hover:bg-lavender-mist dark:text-white dark:hover:bg-dark-3",
        )}
    >
        <Icon className={cn("h-4 w-4 fill-current", flip && "rotate-180")} name={icon} />
        {label}
    </button>
);

/* ── "+ Add block" picker (centered modal so it's always in the viewport, never
      clipped by the editor's scroll container) ── */
const AddBlock = ({ options, onAdd }: { options: ComponentDef[]; onAdd: (def: ComponentDef) => void }) => {
    const [open, setOpen] = useState(false);
    if (!options.length) return null;
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-none border border-dashed border-grey-light py-3 text-caption-1 font-semibold text-primary transition-colors hover:border-primary hover:bg-lavender-mist/50 dark:border-grey-light/15 dark:hover:bg-dark-3/40"
            >
                <Icon className="h-4 w-4 fill-current" name="plus" />
                Add block
            </button>
            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm motion-safe:animate-[fadeIn_140ms_ease-out] sm:items-center"
                    onClick={() => setOpen(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md overflow-hidden rounded-none border border-grey-light bg-white shadow-[0_1.5rem_4rem_rgba(26,26,46,0.28)] motion-safe:animate-[sheetUp_220ms_cubic-bezier(0.22,1,0.36,1)] dark:border-grey-light/10 dark:bg-dark-1"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-grey-light dark:border-grey-light/10">
                            <span className="text-title font-semibold text-black dark:text-white">Add a section</span>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3">
                                <Icon className="h-4 w-4 fill-current" name="close" />
                            </button>
                        </div>
                        <div className="grid max-h-[60vh] gap-1 overflow-y-auto scrollbar-thin p-2">
                            {options.map((d) => (
                                <button
                                    key={d.apiId}
                                    type="button"
                                    onClick={() => { onAdd(d); setOpen(false); }}
                                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                                >
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                        <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name={d.icon} />
                                    </span>
                                    <span className="text-title text-black dark:text-white">{d.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

/* ── the section list ── */
const SectionEditor = ({
    sections,
    components,
    allowed,
    onChange,
}: {
    sections: Section[];
    /** All component defs keyed by apiId (resolved fields), for rendering. */
    components: Record<string, ComponentDef>;
    /** apiIds offered in "Add block" (the zone's allowedComponents). Defaults to all. */
    allowed?: string[];
    onChange: (next: Section[]) => void;
}) => {
    const options = (allowed?.length ? allowed.map((id) => components[id]).filter(Boolean) : Object.values(components)) as ComponentDef[];
    // Folded sections are tracked by their stable __uid, so collapse state survives
    // reorder/duplicate/delete instead of shifting with array indices.
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const toggle = (uid: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });
    const allCollapsed = sections.length > 0 && sections.every((s) => collapsed.has(s.__uid));
    const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(sections.map((s) => s.__uid)));

    const setAt = (i: number, next: Section) => onChange(sections.map((s, j) => (j === i ? next : s)));
    const removeAt = (i: number) => onChange(sections.filter((_, j) => j !== i));
    const duplicateAt = (i: number) => {
        const copy = { ...sections[i], __uid: newUid() };
        onChange([...sections.slice(0, i + 1), copy, ...sections.slice(i + 1)]);
    };
    const moveAt = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= sections.length) return;
        const next = [...sections];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };

    return (
        <div className="flex flex-col gap-3">
            {sections.length > 1 && (
                <div className="flex items-center justify-between px-0.5">
                    <span className="text-caption-2 text-grey/70">{sections.length} sections</span>
                    <button
                        type="button"
                        onClick={toggleAll}
                        className="text-caption-2 font-semibold text-primary transition-colors hover:text-primary/80 dark:text-lilac"
                    >
                        {allCollapsed ? "Expand all" : "Collapse all"}
                    </button>
                </div>
            )}
            <Reorder.Group as="div" axis="y" values={sections} onReorder={onChange} className="flex flex-col gap-3">
                {sections.map((s, i) => {
                    const def = components[s.__component];
                    if (!def) {
                        return (
                            <div key={s.__uid} className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-caption-1 text-warning">
                                Unknown section type “{s.__component}”.
                            </div>
                        );
                    }
                    return (
                        <SectionCard
                            key={s.__uid}
                            def={def}
                            section={s}
                            index={i}
                            count={sections.length}
                            open={!collapsed.has(s.__uid)}
                            onToggle={() => toggle(s.__uid)}
                            onChange={(next) => setAt(i, next)}
                            onRemove={() => removeAt(i)}
                            onDuplicate={() => duplicateAt(i)}
                            onMove={(dir) => moveAt(i, dir)}
                        />
                    );
                })}
            </Reorder.Group>
            <AddBlock options={options} onAdd={(def) => onChange([...sections, blankSection(def)])} />
        </div>
    );
};

/* ── footer stats bar ── */
export const EditorStatsBar = ({
    words,
    seoScore,
    aiSuggestions,
    lastEditedBy,
    lastEditedAt,
}: {
    words: number;
    seoScore?: number | null;
    aiSuggestions?: number;
    lastEditedBy?: string | null;
    lastEditedAt?: string | null;
}) => {
    const minutes = Math.max(1, Math.round(words / 200));
    const ago = lastEditedAt ? timeAgo(lastEditedAt) : null;
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-grey-light bg-surface px-4 py-2.5 text-caption-2 text-grey dark:border-grey-light/10 dark:bg-dark-1">
            <span>{words.toLocaleString()} words</span>
            <Dot />
            <span>{minutes} min read</span>
            {typeof seoScore === "number" && (
                <>
                    <Dot />
                    <span className="inline-flex items-center gap-1.5">
                        SEO
                        <span className={cn("inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-[0.625rem] font-bold", seoScore >= 80 ? "bg-success/15 text-success" : seoScore >= 50 ? "bg-warning/15 text-warning" : "bg-error/15 text-error")}>
                            {seoScore}
                        </span>
                    </span>
                </>
            )}
            {!!aiSuggestions && (
                <>
                    <Dot />
                    <span className="inline-flex items-center gap-1 text-primary dark:text-lilac">
                        <Icon className="h-3.5 w-3.5 fill-current" name="sparkles" />
                        {aiSuggestions} AI suggestion{aiSuggestions === 1 ? "" : "s"}
                    </span>
                </>
            )}
            {(lastEditedBy || ago) && <span className="ml-auto">Last edited{lastEditedBy ? ` by ${lastEditedBy}` : ""}{ago ? ` ${ago}` : ""}</span>}
        </div>
    );
};

const Dot = () => <span className="text-grey/40">·</span>;

function timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const s = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

export default SectionEditor;
