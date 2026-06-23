"use client";

import type { ReactNode } from "react";

/**
 * Uniform stroke-icon set for the rich-text toolbars (Lucide geometry). Every
 * glyph is drawn on the same 24×24 grid with the same stroke weight, so the toolbar
 * and selection bubble read as one consistent set (like the TipTap reference editor)
 * instead of a mix of filled icons, thin strokes and text characters. Size is set by
 * the caller via `className` so every button in a given toolbar matches.
 */
const PATHS: Record<string, ReactNode> = {
    bold: (
        <>
            <path d="M6 4h8a4 4 0 0 1 0 8H6z" />
            <path d="M6 12h9a4 4 0 0 1 0 8H6z" />
        </>
    ),
    italic: (
        <>
            <line x1="19" y1="4" x2="10" y2="4" />
            <line x1="14" y1="20" x2="5" y2="20" />
            <line x1="15" y1="4" x2="9" y2="20" />
        </>
    ),
    underline: (
        <>
            <path d="M6 4v6a6 6 0 0 0 12 0V4" />
            <line x1="4" y1="21" x2="20" y2="21" />
        </>
    ),
    strike: (
        <>
            <path d="M16 4H9a3 3 0 0 0-2.83 4" />
            <path d="M14 12a4 4 0 0 1 0 8H7" />
            <line x1="4" y1="12" x2="20" y2="12" />
        </>
    ),
    code: (
        <>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
        </>
    ),
    highlight: (
        <>
            <path d="m9 11-6 6v3h3l6-6" />
            <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l6 6Z" />
        </>
    ),
    link: (
        <>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </>
    ),
    superscript: (
        <>
            <path d="m4 19 8-8" />
            <path d="m12 19-8-8" />
            <path d="M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07" />
        </>
    ),
    subscript: (
        <>
            <path d="m4 5 8 8" />
            <path d="m12 5-8 8" />
            <path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07" />
        </>
    ),
    bulletList: (
        <>
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
        </>
    ),
    orderedList: (
        <>
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <path d="M4 6h1v4" />
            <path d="M4 10h2" />
            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
        </>
    ),
    taskList: (
        <>
            <path d="m3 17 2 2 4-4" />
            <path d="m3 7 2 2 4-4" />
            <line x1="13" y1="6" x2="21" y2="6" />
            <line x1="13" y1="12" x2="21" y2="12" />
            <line x1="13" y1="18" x2="21" y2="18" />
        </>
    ),
    quote: (
        <>
            <path d="M10 11H6a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v6c0 2.5-1 4-3.5 4.5" />
            <path d="M19 11h-4a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v6c0 2.5-1 4-3.5 4.5" />
        </>
    ),
    codeBlock: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M10 9.5 8 12l2 2.5" />
            <path d="m14 9.5 2 2.5-2 2.5" />
        </>
    ),
    paragraph: (
        <>
            <path d="M13 4v16" />
            <path d="M17 4v16" />
            <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
        </>
    ),
    alignLeft: (
        <>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="15" y2="12" />
            <line x1="3" y1="18" x2="17" y2="18" />
        </>
    ),
    alignCenter: (
        <>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="5" y1="18" x2="19" y2="18" />
        </>
    ),
    alignRight: (
        <>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="9" y1="12" x2="21" y2="12" />
            <line x1="7" y1="18" x2="21" y2="18" />
        </>
    ),
    alignJustify: (
        <>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
        </>
    ),
    undo: (
        <>
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10" />
        </>
    ),
    redo: (
        <>
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H14" />
        </>
    ),
    image: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </>
    ),
    table: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
            <path d="M12 3v18" />
        </>
    ),
    rule: <line x1="4" y1="12" x2="20" y2="12" />,
    emoji: (
        <>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
        </>
    ),
    sparkles: (
        <>
            <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
            <path d="M5 3v4" />
            <path d="M19 17v4" />
            <path d="M3 5h4" />
            <path d="M17 19h4" />
        </>
    ),
    clear: (
        <>
            <path d="M4 7V4h16v3" />
            <path d="M5 20h6" />
            <path d="M13 4 8 20" />
            <path d="m15 15 5 5" />
            <path d="m20 15-5 5" />
        </>
    ),
    chevronDown: <path d="m6 9 6 6 6-6" />,
    check: <path d="M20 6 9 17l-5-5" />,
    return: (
        <>
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </>
    ),
    external: (
        <>
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </>
    ),
    trash: (
        <>
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </>
    ),
};

export type EditorIconName = keyof typeof PATHS;

export const EditorIcon = ({ name, className = "h-[1.125rem] w-[1.125rem]" }: { name: EditorIconName; className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PATHS[name]}
    </svg>
);

export default EditorIcon;
