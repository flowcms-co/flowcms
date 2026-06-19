"use client";

/**
 * Dropdown menus shared by both rich-text toolbars (main canvas + compact nested
 * editor): an emoji picker, a text-color picker and a table operations menu. Each
 * is a small popover button that runs TipTap commands on the passed editor.
 */

import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { EMOJIS, TEXT_COLORS } from "@/lib/tiptap";

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
export const EmojiMenu = ({ editor }: { editor: Editor }) => (
    <Popover title="Emoji" trigger={<span className="text-[1rem] leading-none">🙂</span>} panelClass="w-[17rem]">
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
                <span className="text-[0.85rem] font-semibold">A</span>
                <span className="mt-0.5 h-[3px] w-3.5 rounded-full" style={{ backgroundColor: (editor.getAttributes("textStyle").color as string) || "#6C5CE7" }} />
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
export const TableMenu = ({ editor }: { editor: Editor }) => {
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
        <Popover title="Table" trigger={<Icon className="h-4 w-4 fill-current" name="grid" />} panelClass="w-48">
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
