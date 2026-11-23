/**
 * Shared TipTap extension set + helpers for FlowCMS rich-text editors (the main
 * canvas and the compact nested-field editor), so both expose the same formatting
 * capabilities: StarterKit (bold/italic/strike/code/code-block/underline/link/
 * lists/quote/headings/rule/history) plus inline images (library, URL, drag-drop &
 * paste upload), highlight, sub/superscript, text alignment, text color, task
 * lists, tables and emoji.
 */

import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Plugin } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Extension, type AnyExtension } from "@tiptap/react";
import type { EditorProps } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { uploadFile, mediaUrl } from "@/lib/api";

/** The block and mark types each content-rule `allow` name stands for. */
const ALLOW_TYPES: Record<string, string[]> = {
    heading: ["heading"],
    bulletList: ["bulletList"],
    orderedList: ["orderedList"],
    taskList: ["taskList"],
    blockquote: ["blockquote"],
    codeBlock: ["codeBlock"],
    table: ["table"],
    image: ["image"],
    rule: ["horizontalRule"],
    bold: ["bold"],
    italic: ["italic"],
    underline: ["underline"],
    strike: ["strike"],
    code: ["code"],
    highlight: ["highlight"],
    subscript: ["subscript"],
    superscript: ["superscript"],
    link: ["link"],
    color: ["textStyle"],
};

const countTypes = (doc: PmNode, names: Set<string>): Map<string, number> => {
    const n = new Map<string, number>();
    doc.descendants((node) => {
        if (names.has(node.type.name)) n.set(node.type.name, (n.get(node.type.name) ?? 0) + 1);
        for (const m of node.marks) if (names.has(m.type.name)) n.set(m.type.name, (n.get(m.type.name) ?? 0) + 1);
        return true;
    });
    return n;
};

/**
 * Keeps a field to what its content rule allows, whichever way a block or mark arrives:
 * a toolbar button, a keyboard shortcut or a typing shortcut such as `## ` or `- `. A change
 * that would ADD something not allowed is refused. What is already in the document is never
 * touched, so an old article that holds a list still loads and saves as it was.
 * (Pasted content is cleaned before it gets here, see filterPastedHtml.)
 */
export const allowOnly = (allow: readonly string[]) => {
    const banned = new Set(Object.entries(ALLOW_TYPES).filter(([token]) => !allow.includes(token)).flatMap(([, types]) => types));
    return Extension.create({
        name: "allowOnly",
        addProseMirrorPlugins() {
            return [
                new Plugin({
                    filterTransaction: (tr, state) => {
                        if (!tr.docChanged) return true;
                        const before = countTypes(state.doc, banned);
                        const after = countTypes(tr.doc, banned);
                        for (const [name, n] of after) if (n > (before.get(name) ?? 0)) return false;
                        return true;
                    },
                }),
            ];
        },
    });
};

/** Build the extension list for a rich-text editor with the given placeholder. `allow` is a
 *  content rule's allowed names: anything else cannot be added to this field. */
export const richTextExtensions = (placeholder: string, allow?: readonly string[]): AnyExtension[] => [
    ...(allow ? [allowOnly(allow)] : []),
    // Links carry only what the author sets. The Link extension's own defaults add
    // target="_blank" and rel="noopener noreferrer nofollow" to every link, which
    // would mark the site's internal links nofollow on the next save. "Open in new
    // tab" and "nofollow" are per-link choices in the link menu, off by default.
    StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { target: null, rel: null } } }),
    Placeholder.configure({ placeholder }),
    // Block-level images inserted from the asset library, a URL, or an upload (drag /
    // paste). No base64 — images live in the media library / on a CDN, keyed by URL.
    Image.configure({ allowBase64: false, HTMLAttributes: { class: "flow-prose-img" } }),
    Highlight,
    Subscript,
    Superscript,
    // Alignment applies to block text (paragraphs + headings).
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    // Checklists (nestable).
    TaskList,
    TaskItem.configure({ nested: true }),
    // Tables with resizable columns + header row.
    TableKit.configure({ table: { resizable: true } }),
    // Inline text color (Color rides on top of TextStyle).
    TextStyle,
    Color,
];

/** Common emojis offered by the toolbar's emoji picker (plain unicode — inserted as
 *  text, so no extra schema/extension is needed to store or render them). */
export const EMOJIS = [
    "😀", "😄", "😁", "😅", "😂", "🙂", "😉", "😊", "😍", "😘", "😎", "🤩",
    "🤔", "🤨", "😴", "😅", "😇", "🥳", "😢", "😭", "😡", "🤯", "🥹", "😬",
    "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👀", "🧠", "❤️", "🧡", "💛",
    "💚", "💙", "💜", "🖤", "🔥", "✨", "⭐", "🌟", "💡", "💯", "🎉", "🎊",
    "🚀", "🏆", "🎯", "📌", "📎", "🔗", "📝", "📈", "📉", "📅", "⏰", "🔒",
    "✅", "☑️", "❌", "⚠️", "➡️", "⬅️", "⬆️", "⬇️", "💬", "🌈", "☀️", "🌙",
];

/** Swatches for the toolbar text-color picker (plus a "default" reset handled in UI). */
export const TEXT_COLORS = [
    "#1A1A2E", "#E11D48", "#EA580C", "#CA8A04", "#16A34A",
    "#0891B2", "#2563EB", "#6C5CE7", "#DB2777", "#6B7280",
];

const imageFilesFrom = (list?: FileList | null) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

/** Upload one image file to the asset library and return its display URL (absolutized
 *  for cross-origin delivery), or null on failure. */
async function uploadImage(file: File): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    try {
        const a = await uploadFile<{ url?: string }>("/assets", form);
        return a?.url ? mediaUrl(a.url) : null;
    } catch {
        return null;
    }
}

function insertImageAt(view: EditorView, pos: number, src: string) {
    const type = view.state.schema.nodes.image;
    if (!type) return;
    view.dispatch(view.state.tr.insert(pos, type.create({ src })));
}

/**
 * editorProps handlers that upload image files dropped onto, or pasted into, the
 * editor (to the asset library) and insert them at the drop point / cursor. Returns
 * the handlers to spread into `useEditor({ editorProps })`. Non-image drops/pastes
 * fall through to TipTap's default handling.
 */
export function imageUploadProps(onError?: (msg: string) => void): Pick<EditorProps, "handleDrop" | "handlePaste"> {
    return {
        handlePaste(view, event) {
            const files = imageFilesFrom(event.clipboardData?.files);
            if (!files.length) return false;
            event.preventDefault();
            void (async () => {
                for (const f of files) {
                    const src = await uploadImage(f);
                    if (src) insertImageAt(view, view.state.selection.from, src);
                    else onError?.("Couldn’t upload the pasted image.");
                }
            })();
            return true;
        },
        handleDrop(view, event, _slice, moved) {
            if (moved) return false; // an internal node move, not a file drop
            const files = imageFilesFrom(event.dataTransfer?.files);
            if (!files.length) return false;
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const pos = coords?.pos ?? view.state.selection.from;
            void (async () => {
                for (const f of files) {
                    const src = await uploadImage(f);
                    if (src) insertImageAt(view, pos, src);
                    else onError?.("Couldn’t upload the dropped image.");
                }
            })();
            return true;
        },
    };
}
