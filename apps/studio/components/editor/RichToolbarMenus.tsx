"use client";

/**
 * Dropdown menus shared by both rich-text toolbars (main canvas + compact nested
 * editor): an emoji picker, a text-color picker and a table operations menu. Each
 * is a small popover button that runs TipTap commands on the passed editor.
 */

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { isInternalHref } from "@flowcms/shared/html";
import { useWorkspace } from "@/lib/useWorkspace";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/cn";
import { EMOJIS, TEXT_COLORS } from "@/lib/tiptap";
import { ELEMENT_TEMPLATES, elementTemplate, type ElementTemplate } from "@flowcms/shared/elements";
import { usePlanIfAny } from "@/components/providers/LicenseProvider";
import { EDIT_ELEMENT_EVENT, type EditElementDetail } from "@/lib/elements";
import { api, ApiError } from "@/lib/api";
import { changeMessage, reloadSavedTemplates, useSavedTemplates, type SavedTemplate } from "@/lib/elementTemplates";
import { confirm, notice } from "@/components/providers/ConfirmProvider";
import ElementDrawer from "./ElementDrawer";

const ElementUpgrade = lazy(() => import("./ElementUpgrade"));
import { EditorIcon } from "./EditorIcons";

/** Prefix a bare host (no scheme) with https:// so "open in new tab" works. */
const hrefForVisit = (raw: string) => (/^[a-z][\w+.-]*:|^\/\//i.test(raw) ? raw : `https://${raw}`);

/**
 * Inline link editor — replaces the old window.prompt. The toolbar button opens an
 * anchored popover with a URL field (pre-filled when the cursor sits on a link), a
 * return key to apply, an open-in-new-tab action and a remove action. Shared by the
 * pinned toolbar and the selection bubble in both editors. `triggerClass` /
 * `activeClass` let the host match its own button styling; `iconClass` keeps the
 * glyphs the same size as the surrounding toolbar.
 */
/** The target and rel a link is stored with. A link to the site itself (relative, or
 *  on the workspace's site URL) gets neither. An external link gets only what the
 *  author chose: a new tab adds the usual "noopener noreferrer" with it. */
export function linkAttrs(href: string, siteUrl: string | null | undefined, opts: { newTab: boolean; nofollow: boolean }): { target: string | null; rel: string | null } {
    if (isInternalHref(href, siteUrl)) return { target: null, rel: null };
    const rel = [opts.newTab ? "noopener noreferrer" : "", opts.nofollow ? "nofollow" : ""].filter(Boolean).join(" ");
    return { target: opts.newTab ? "_blank" : null, rel: rel || null };
}

export const LinkMenu = ({
    editor,
    iconClass = "h-4 w-4",
    triggerClass,
    activeClass,
    onOpenChange,
}: {
    editor: Editor;
    iconClass?: string;
    triggerClass: string;
    activeClass: string;
    onOpenChange?: (open: boolean) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState("");
    // External links only, both off unless the author turns them on.
    const [newTab, setNewTab] = useState(false);
    const [nofollow, setNofollow] = useState(false);
    const workspace = useWorkspace();
    const internal = isInternalHref(url, workspace?.siteUrl);
    const inputRef = useRef<HTMLInputElement>(null);
    const active = editor.isActive("link");

    const change = (v: boolean) => {
        setOpen(v);
        onOpenChange?.(v);
    };

    const start = () => {
        const cur = editor.getAttributes("link") as { href?: string; target?: string | null; rel?: string | null };
        setUrl(cur.href ?? "");
        setNewTab(cur.target === "_blank");
        setNofollow(/\bnofollow\b/i.test(cur.rel ?? ""));
        change(true);
    };

    // Select the pre-filled URL once the popover mounts so paste-over is instant.
    useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => inputRef.current?.select(), 0);
        return () => window.clearTimeout(id);
    }, [open]);

    const apply = () => {
        const href = url.trim();
        if (href) editor.chain().focus().extendMarkRange("link").setLink({ href, ...linkAttrs(href, workspace?.siteUrl, { newTab, nofollow }) }).run();
        else editor.chain().focus().extendMarkRange("link").unsetLink().run();
        change(false);
    };
    const remove = () => {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        change(false);
    };
    const visit = () => {
        const href = url.trim();
        if (href) window.open(hrefForVisit(href), "_blank", "noopener,noreferrer");
    };

    const iconBtn = "flex h-7 w-7 items-center justify-center rounded-lg text-grey transition-colors hover:bg-lavender-mist hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-grey dark:hover:bg-dark-3";

    return (
        <div className="relative">
            <button
                type="button"
                title="Link"
                aria-label="Link"
                aria-pressed={active}
                aria-expanded={open}
                onMouseDown={(e) => {
                    e.preventDefault();
                    if (open) change(false);
                    else start();
                }}
                className={cn(triggerClass, active && activeClass)}
            >
                <EditorIcon name="link" className={iconClass} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onMouseDown={() => change(false)} aria-hidden />
                    <div className="absolute left-0 top-full z-30 mt-1.5 flex w-[19rem] max-w-[78vw] flex-wrap items-center gap-0.5 rounded-xl border border-grey-light bg-white py-1 pl-3 pr-1 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1">
                        <input
                            ref={inputRef}
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    apply();
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    change(false);
                                }
                            }}
                            placeholder="Paste a link…"
                            className="min-w-0 flex-1 bg-transparent text-caption-1 text-black outline-none placeholder:text-grey dark:text-white"
                        />
                        <button type="button" title="Apply" onMouseDown={(e) => { e.preventDefault(); apply(); }} className={iconBtn}>
                            <EditorIcon name="return" className={iconClass} />
                        </button>
                        <span className="mx-0.5 h-5 w-px bg-grey-light dark:bg-grey-light/15" />
                        <button type="button" title="Open in new tab" disabled={!url.trim()} onMouseDown={(e) => { e.preventDefault(); visit(); }} className={iconBtn}>
                            <EditorIcon name="external" className={iconClass} />
                        </button>
                        <button type="button" title="Remove link" disabled={!active} onMouseDown={(e) => { e.preventDefault(); remove(); }} className={cn(iconBtn, "hover:text-error")}>
                            <EditorIcon name="trash" className={iconClass} />
                        </button>
                        {/* Links to another site can opt in to these; links to your own
                            site never get them. Applied with the link (Enter or Apply). */}
                        {!!url.trim() && !internal && (
                            <div className="flex w-full basis-full items-center gap-4 border-t border-grey-light pb-1 pt-1.5 text-caption-2 text-grey dark:border-grey-light/10">
                                <label className="inline-flex cursor-pointer items-center gap-1.5">
                                    <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} /> Open in new tab
                                </label>
                                <label className="inline-flex cursor-pointer items-center gap-1.5">
                                    <input type="checkbox" checked={nofollow} onChange={(e) => setNofollow(e.target.checked)} /> nofollow
                                </label>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

/** A toolbar button that opens an anchored popover panel. `children` receives a
 *  `close` callback so menu items can dismiss the panel after acting. */
const Popover = ({ title, trigger, panelClass, children }: { title: string; trigger: ReactNode; panelClass?: string; children: (close: () => void) => ReactNode }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                type="button"
                title={title}
                aria-label={title}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-1.5 text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
            >
                {trigger}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
                    <div className={cn("absolute left-0 z-20 mt-1 overflow-hidden rounded-xl border border-grey-light bg-white p-2 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1", panelClass)}>
                        {children(() => setOpen(false))}
                    </div>
                </>
            )}
        </div>
    );
};

/** Emoji picker — inserts the chosen emoji as plain text at the cursor. */
export const EmojiMenu = ({ editor, iconClass }: { editor: Editor; iconClass?: string }) => (
    <Popover title="Emoji" trigger={<EditorIcon name="emoji" className={iconClass} />} panelClass="w-[17rem]">
        {(close) => (
            <div className="grid max-h-56 grid-cols-9 gap-0.5 overflow-y-auto scrollbar-thin">
                {EMOJIS.map((e, i) => (
                    <button
                        key={`${e}-${i}`}
                        type="button"
                        onClick={() => { editor.chain().focus().insertContent(e).run(); close(); }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[1.05rem] transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                    >
                        {e}
                    </button>
                ))}
            </div>
        )}
    </Popover>
);

/** Text color picker — sets (or clears) the inline color of the selection. */
export const ColorMenu = ({ editor }: { editor: Editor }) => (
    <Popover
        title="Text color"
        trigger={
            <span className="flex flex-col items-center leading-none">
                <span className="text-[0.95rem] font-semibold leading-none">A</span>
                <span className="mt-[3px] h-[3px] w-[1.05rem] rounded-full" style={{ backgroundColor: (editor.getAttributes("textStyle").color as string) || "#6C5CE7" }} />
            </span>
        }
        panelClass="w-[12.5rem]"
    >
        {(close) => (
            <div className="flex flex-col gap-2">
                <div className="grid grid-cols-5 gap-1.5">
                    {TEXT_COLORS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            title={c}
                            onClick={() => { editor.chain().focus().setColor(c).run(); close(); }}
                            className="h-7 w-7 rounded-md border border-black/10 transition-transform hover:scale-110 dark:border-white/15"
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => { editor.chain().focus().unsetColor().run(); close(); }}
                    className="rounded-lg px-2 py-1.5 text-left text-caption-1 text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                >
                    Default color
                </button>
            </div>
        )}
    </Popover>
);

/** Table menu — insert a table and run row/column operations when inside one. */
export const TableMenu = ({ editor, iconClass }: { editor: Editor; iconClass?: string }) => {
    const inTable = editor.isActive("table");
    const item = (label: string, run: () => void, close: () => void, disabled = false) => (
        <button
            type="button"
            disabled={disabled}
            onClick={() => { run(); close(); }}
            className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-caption-1 text-black transition-colors hover:bg-lavender-mist hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent dark:text-white dark:hover:bg-dark-3"
        >
            {label}
        </button>
    );
    return (
        <Popover title="Table" trigger={<EditorIcon name="table" className={iconClass} />} panelClass="w-48">
            {(close) => (
                <div className="flex flex-col">
                    {item("Insert table", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), close)}
                    <span className="my-1 h-px bg-grey-light dark:bg-grey-light/15" />
                    {item("Add row", () => editor.chain().focus().addRowAfter().run(), close, !inTable)}
                    {item("Add column", () => editor.chain().focus().addColumnAfter().run(), close, !inTable)}
                    {item("Delete row", () => editor.chain().focus().deleteRow().run(), close, !inTable)}
                    {item("Delete column", () => editor.chain().focus().deleteColumn().run(), close, !inTable)}
                    {item("Toggle header row", () => editor.chain().focus().toggleHeaderRow().run(), close, !inTable)}
                    {item("Delete table", () => editor.chain().focus().deleteTable().run(), close, !inTable)}
                </div>
            )}
        </Popover>
    );
};

/** The saved templates in the Insert element menu. Reloads each time the menu opens so a copy made elsewhere shows. */
const SavedList = ({ templates, onPick }: { templates: SavedTemplate[] | null; onPick: (t: SavedTemplate) => void }) => {
    useEffect(() => {
        void reloadSavedTemplates();
    }, []);
    return (
        <div data-saved-templates className="mt-1 border-t border-grey-light pt-1 dark:border-grey-light/15">
            <p className="px-2.5 py-1 text-caption-2 font-semibold text-grey">From a saved template</p>
            {templates && templates.length === 0 && <p className="px-2.5 py-1 text-caption-2 text-grey">None yet. Use “Save as template” in an element.</p>}
            <div className="max-h-56 overflow-y-auto">
                {(templates ?? []).map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => onPick(t)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-caption-1 text-black transition-colors hover:bg-lavender-mist hover:text-primary dark:text-white dark:hover:bg-dark-3"
                    >
                        <span className="min-w-0 truncate">{t.name}</span>
                        <span className="flex-none text-caption-2 text-grey">{elementTemplate(t.element)?.name ?? t.element}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

type DrawerState = { template: ElementTemplate; values: Record<string, unknown>; pos: number | null; link: { id: string; name: string; pages: number | null } | null };

/**
 * Insert > Element. Lists the premade templates (only the built ones can be picked) and opens the
 * fill drawer, plus the workspace's saved templates, which insert a linked element. Without the
 * `elements` license the menu stays visible but only offers the upgrade; elements already in the
 * text keep showing, and can be removed but not edited.
 * The drawer also opens from an element's own Edit button (EDIT_ELEMENT_EVENT). A linked element
 * edits its template, after a confirm that names how many pages change.
 */
export const ElementMenu = ({ editor, iconClass }: { editor: Editor; iconClass?: string }) => {
    const licensed = usePlanIfAny()?.has("elements") ?? false;
    const saved = useSavedTemplates(licensed);
    const [drawer, setDrawer] = useState<DrawerState | null>(null);

    useEffect(() => {
        if (!licensed) return;
        const on = (e: Event) => {
            const d = (e as CustomEvent<EditElementDetail>).detail;
            if (d.editor !== editor) return;
            const node = editor.state.doc.nodeAt(d.pos);
            const template = node ? elementTemplate(String(node.attrs.template)) : undefined;
            if (!node || !template) return;
            const own = (node.attrs.values ?? {}) as Record<string, unknown>;
            const id = node.attrs.templateId ? String(node.attrs.templateId) : null;
            if (!id) return setDrawer({ template, values: own, pos: d.pos, link: null });
            // A linked element edits the template's current values; a template that is gone leaves the snapshot, unlinked.
            api<SavedTemplate>(`/element-templates/${id}`)
                .then((t) => setDrawer({ template, values: t.values, pos: d.pos, link: { id: t.id, name: t.name, pages: t.pages } }))
                .catch(() => setDrawer({ template, values: own, pos: d.pos, link: null }));
        };
        window.addEventListener(EDIT_ELEMENT_EVENT, on);
        return () => window.removeEventListener(EDIT_ELEMENT_EVENT, on);
    }, [editor, licensed]);

    // The block boundary after the block the cursor is in (after the whole list, table or quote).
    const insertAt = () => {
        const { $to, to } = editor.state.selection;
        return $to.depth >= 1 ? $to.after(1) : to;
    };
    /** Put an element (linked when `templateId` is given) in the document: replace the one at `pos`, or insert a new one. */
    const place = (element: string, values: Record<string, unknown>, templateId: string | null, pos: number | null) => {
        if (pos !== null) editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { template: element, templateId, values }); return true; }).run();
        else editor.chain().focus().insertContentAt(insertAt(), { type: "flowElement", attrs: { template: element, templateId, values } }).run();
    };

    const save = async (values: Record<string, unknown>) => {
        if (!drawer) return;
        const { template, pos, link } = drawer;
        if (link) {
            if (!(await confirm({ title: `Update “${link.name}”?`, message: changeMessage(link.name, link.pages ?? 0), confirmLabel: "Update template" }))) return;
            try {
                await api(`/element-templates/${link.id}`, { method: "PATCH", body: JSON.stringify({ values }) });
            } catch (e) {
                await notice({ title: "The template was not changed", message: e instanceof ApiError ? e.message : "Try again." });
                return;
            }
            void reloadSavedTemplates();
        }
        place(template.id, values, link?.id ?? null, pos);
        setDrawer(null);
    };

    /** Create a template from the drawer's values and link this element to it (also what "Duplicate as new template" does). */
    const makeTemplate = async (name: string, values: Record<string, unknown>) => {
        if (!drawer) return;
        const t = await api<SavedTemplate>("/element-templates", { method: "POST", body: JSON.stringify({ name, element: drawer.template.id, values }) });
        place(drawer.template.id, values, t.id, drawer.pos);
        void reloadSavedTemplates();
        setDrawer(null);
    };

    return (
        <>
            <Popover title="Insert element" trigger={<EditorIcon name="element" className={iconClass} />} panelClass="w-64">
                {(close) =>
                    licensed ? (
                        <div className="flex flex-col">
                            {ELEMENT_TEMPLATES.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    disabled={!t.enabled}
                                    onClick={() => { setDrawer({ template: t, values: t.defaults(), pos: null, link: null }); close(); }}
                                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-caption-1 text-black transition-colors hover:bg-lavender-mist hover:text-primary disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-black dark:text-white dark:hover:bg-dark-3 dark:disabled:hover:text-white"
                                >
                                    {t.name}
                                    {!t.enabled && <span className="text-caption-2 text-grey">Coming soon</span>}
                                </button>
                            ))}
                            <SavedList templates={saved} onPick={(t) => { place(t.element, t.values, t.id, null); close(); }} />
                        </div>
                    ) : (
                        <Suspense fallback={null}>
                            <ElementUpgrade />
                        </Suspense>
                    )
                }
            </Popover>
            {drawer && (
                <ElementDrawer
                    template={drawer.template}
                    initial={drawer.values}
                    editing={drawer.pos !== null}
                    templates={{ linked: drawer.link, saveAsTemplate: makeTemplate, duplicate: makeTemplate }}
                    onSave={save}
                    onClose={() => setDrawer(null)}
                />
            )}
        </>
    );
};
