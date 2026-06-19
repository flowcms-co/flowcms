"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/api";
import { runAi, aiErrorMessage } from "@/lib/useAi";
import { richTextExtensions, imageUploadProps } from "@/lib/tiptap";
import { ColorMenu, EmojiMenu, TableMenu } from "./RichToolbarMenus";
import MediaPicker from "@/components/ui/MediaPicker";

/**
 * TipTap canvas (free MIT core) for the body + Main Content sections. Provides a
 * persistent (pinned) formatting toolbar — undo/redo, block type, marks (bold,
 * italic, underline, strike, inline code, highlight), links, super/subscript,
 * lists, quote, code block, text alignment and inline images from the asset
 * library — plus a "Clear" action that strips marks/nodes back to plain paragraphs
 * (handy for pasted, pre-formatted web content), and an "AI" action that rewrites
 * the selection.
 */
const EditorCanvas = ({
    onReady,
    initialContent,
}: {
    onReady?: (editor: Editor) => void;
    /** Initial HTML/content. When undefined, the editor opens empty (placeholder shows). */
    initialContent?: string;
}) => {
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [imgPicker, setImgPicker] = useState(false);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: richTextExtensions("Write, or paste your content here…"),
        content: initialContent ?? "",
        editorProps: {
            attributes: { class: "flow-prose min-h-[14rem] max-w-[44rem] mx-auto px-1 py-6 focus:outline-none" },
            // Drag-and-drop and paste image files → upload to the asset library + insert.
            ...imageUploadProps((msg) => {
                setAiError(msg);
                window.setTimeout(() => setAiError(null), 4500);
            }),
        },
        onCreate: ({ editor }) => onReady?.(editor),
    });

    // Reactive active-states for the toolbar (re-renders only when these change).
    const s = useEditorState({
        editor,
        selector: ({ editor }) =>
            editor
                ? {
                      bold: editor.isActive("bold"),
                      italic: editor.isActive("italic"),
                      underline: editor.isActive("underline"),
                      strike: editor.isActive("strike"),
                      code: editor.isActive("code"),
                      codeBlock: editor.isActive("codeBlock"),
                      highlight: editor.isActive("highlight"),
                      sup: editor.isActive("superscript"),
                      sub: editor.isActive("subscript"),
                      link: editor.isActive("link"),
                      bullet: editor.isActive("bulletList"),
                      ordered: editor.isActive("orderedList"),
                      task: editor.isActive("taskList"),
                      quote: editor.isActive("blockquote"),
                      h2: editor.isActive("heading", { level: 2 }),
                      h3: editor.isActive("heading", { level: 3 }),
                      alignLeft: editor.isActive({ textAlign: "left" }),
                      alignCenter: editor.isActive({ textAlign: "center" }),
                      alignRight: editor.isActive({ textAlign: "right" }),
                      alignJustify: editor.isActive({ textAlign: "justify" }),
                  }
                : null,
    });

    if (!editor) {
        return <div className="min-h-[14rem]" />;
    }

    const flashError = (msg: string) => {
        setAiError(msg);
        window.setTimeout(() => setAiError(null), 4500);
    };

    /** Rewrite the current selection via AI (improve clarity), then replace it. */
    const askAi = async () => {
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, "\n");
        if (!text.trim()) {
            flashError("Select some text first, then click AI to improve it.");
            return;
        }
        if (aiBusy) return;
        setAiBusy(true);
        setAiError(null);
        try {
            const res = await runAi({ feature: "ai.refresh", prompt: `Improve the clarity and flow of this text. Return only the improved version:\n\n${text}`, maxTokens: 1200 });
            const out = res.text.trim();
            if (!out) {
                flashError("The AI returned no text. Check your provider in Settings, then try again.");
                return;
            }
            editor.chain().focus().insertContent(out).run();
        } catch (e) {
            flashError(aiErrorMessage(e));
        } finally {
            setAiBusy(false);
        }
    };

    const hasUnderline = !!editor.schema.marks.underline;
    const hasLink = !!editor.schema.marks.link;

    const toggleLink = () => {
        const prev = (editor.getAttributes("link").href as string) ?? "";
        const url = window.prompt("Link URL", prev);
        if (url === null) return;
        if (url.trim() === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
        else editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
    };

    /** Insert an image from the asset library / a URL at the cursor (absolutized so
     *  it loads in the editor across origins). */
    const insertImage = (url: string) => {
        if (url) editor.chain().focus().setImage({ src: mediaUrl(url) }).run();
    };

    /** Strip all marks + reset nodes to plain paragraphs. Works on the selection, or
     *  the whole document when nothing is selected (paste → reset to plain text). */
    const clearFormatting = () => {
        const c = editor.chain().focus();
        if (editor.state.selection.empty) c.selectAll();
        c.unsetAllMarks().clearNodes().run();
    };

    const blockLabel = s?.h2 ? "Heading 2" : s?.h3 ? "Heading 3" : s?.quote ? "Quote" : "Paragraph";

    return (
        <div className="flex flex-col">
            {/* Pinned toolbar */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-grey-light bg-white/80 px-1.5 py-1.5 backdrop-blur dark:border-grey-light/10 dark:bg-dark-1/80">
                <TBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}><span className="text-[1rem] leading-none">↺</span></TBtn>
                <TBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}><span className="text-[1rem] leading-none">↻</span></TBtn>
                <Sep />
                <BlockMenu
                    label={blockLabel}
                    onParagraph={() => editor.chain().focus().setParagraph().run()}
                    onHeading={(level) => editor.chain().focus().toggleHeading({ level }).run()}
                    onQuote={() => editor.chain().focus().toggleBlockquote().run()}
                />
                <Sep />
                <TBtn title="Bold" active={!!s?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><span className="font-bold">B</span></TBtn>
                <TBtn title="Italic" active={!!s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><span className="font-serif italic">i</span></TBtn>
                {hasUnderline && <TBtn title="Underline" active={!!s?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><span className="underline">U</span></TBtn>}
                <TBtn title="Strikethrough" active={!!s?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><span className="line-through">S</span></TBtn>
                <TBtn title="Highlight" active={!!s?.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()}><Icon className="h-4 w-4 fill-current" name="edit" /></TBtn>
                <ColorMenu editor={editor} />
                <TBtn title="Inline code" active={!!s?.code} onClick={() => editor.chain().focus().toggleCode().run()}><span className="font-mono text-[0.78em]">{"</>"}</span></TBtn>
                {hasLink && <TBtn title="Link" active={!!s?.link} onClick={toggleLink}><Icon className="h-4 w-4 fill-current" name="external" /></TBtn>}
                <TBtn title="Superscript" active={!!s?.sup} onClick={() => editor.chain().focus().toggleSuperscript().run()}><span className="text-[0.82em]">x<sup>2</sup></span></TBtn>
                <TBtn title="Subscript" active={!!s?.sub} onClick={() => editor.chain().focus().toggleSubscript().run()}><span className="text-[0.82em]">x<sub>2</sub></span></TBtn>
                <Sep />
                <TBtn title="Bulleted list" active={!!s?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><Icon className="h-4 w-4 fill-current" name="menu-collapse" /></TBtn>
                <TBtn title="Numbered list" active={!!s?.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><span className="text-[0.72rem] font-bold">1.</span></TBtn>
                <TBtn title="Checklist" active={!!s?.task} onClick={() => editor.chain().focus().toggleTaskList().run()}><span className="text-[0.9em] leading-none">☑</span></TBtn>
                <TBtn title="Quote" active={!!s?.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><span className="font-serif text-[1.15em] leading-none">&rdquo;</span></TBtn>
                <TBtn title="Code block" active={!!s?.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><span className="font-mono text-[0.7rem] font-bold">{"{}"}</span></TBtn>
                <Sep />
                <TBtn title="Align left" active={!!s?.alignLeft} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignIcon dir="left" /></TBtn>
                <TBtn title="Align center" active={!!s?.alignCenter} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignIcon dir="center" /></TBtn>
                <TBtn title="Align right" active={!!s?.alignRight} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignIcon dir="right" /></TBtn>
                <TBtn title="Justify" active={!!s?.alignJustify} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignIcon dir="justify" /></TBtn>
                <Sep />
                <EmojiMenu editor={editor} />
                <TableMenu editor={editor} />
                <TBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><span className="text-[1.1em] font-bold leading-none">―</span></TBtn>
                <Sep />
                <button
                    type="button"
                    onClick={clearFormatting}
                    title="Clear formatting — reset selection (or the whole block) to plain text"
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-caption-2 font-medium text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                >
                    <span className="font-serif">T</span>
                    <span className="text-[0.65rem]">✕</span>
                    Clear
                </button>
                <div className="ml-auto" />
                <button
                    type="button"
                    onClick={() => setImgPicker(true)}
                    title="Insert an image"
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-caption-2 font-medium text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                >
                    <Icon className="h-4 w-4 fill-current" name="image" />
                    Add
                </button>
                <button
                    type="button"
                    onClick={() => void askAi()}
                    disabled={aiBusy}
                    title="Improve the selected text with AI"
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-caption-2 font-semibold text-primary transition-colors hover:bg-lavender-mist disabled:opacity-60 dark:text-lilac dark:hover:bg-dark-3"
                >
                    <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="sparkles" />
                    {aiBusy ? "…" : "AI"}
                </button>
            </div>

            {/* Inline selection bubble — quick formatting where the cursor is. */}
            <BubbleMenu
                editor={editor}
                options={{ placement: "top" }}
                className="flex items-center gap-0.5 rounded-lg border border-grey-light bg-white p-1 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1"
            >
                <TBtn title="Bold" active={!!s?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><span className="font-bold">B</span></TBtn>
                <TBtn title="Italic" active={!!s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><span className="font-serif italic">i</span></TBtn>
                <TBtn title="Highlight" active={!!s?.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()}><Icon className="h-4 w-4 fill-current" name="edit" /></TBtn>
                <TBtn title="Inline code" active={!!s?.code} onClick={() => editor.chain().focus().toggleCode().run()}><span className="font-mono text-[0.78em]">{"</>"}</span></TBtn>
                {hasLink && <TBtn title="Link" active={!!s?.link} onClick={toggleLink}><Icon className="h-4 w-4 fill-current" name="external" /></TBtn>}
                <Sep />
                <TBtn title="Paragraph" active={blockLabel === "Paragraph"} onClick={() => editor.chain().focus().setParagraph().run()}><span className="font-serif">¶</span></TBtn>
                <TBtn title="Heading 2" active={!!s?.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</TBtn>
                <TBtn title="Heading 3" active={!!s?.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</TBtn>
                <TBtn title="Bulleted list" active={!!s?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><Icon className="h-4 w-4 fill-current" name="menu-collapse" /></TBtn>
                <Sep />
                <button
                    type="button"
                    onClick={() => void askAi()}
                    disabled={aiBusy}
                    title="Improve the selected text with AI"
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-caption-2 font-semibold text-primary transition-colors hover:bg-lavender-mist disabled:opacity-60 dark:text-lilac dark:hover:bg-dark-3"
                >
                    <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="sparkles" />
                    {aiBusy ? "…" : "AI"}
                </button>
            </BubbleMenu>

            <EditorContent editor={editor} />

            {imgPicker && (
                <MediaPicker
                    onSelect={(url) => insertImage(url)}
                    onClose={() => setImgPicker(false)}
                />
            )}

            {aiError && (
                <div role="alert" className="fixed bottom-6 left-1/2 z-50 flex max-w-[22rem] -translate-x-1/2 items-start gap-2 rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-caption-1 text-error shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] backdrop-blur dark:bg-error/15">
                    <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>{aiError}</span>
                </div>
            )}
        </div>
    );
};

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-grey-light dark:bg-grey-light/15" />;

/** Four-line alignment glyph; the indented lines vary by direction. */
const AlignIcon = ({ dir }: { dir: "left" | "center" | "right" | "justify" }) => {
    const lines: Record<typeof dir, [string, string]> = {
        left: ["M3 9h12", "M3 15h12"],
        center: ["M6 9h12", "M6 15h12"],
        right: ["M9 9h12", "M9 15h12"],
        justify: ["M3 9h18", "M3 15h18"],
    };
    const [a, b] = lines[dir];
    return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d={a} />
            <path d="M3 12h18" />
            <path d={b} />
        </svg>
    );
};

const TBtn = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={!!active}
        onClick={onClick}
        className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-body text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3",
            active && "bg-primary/10 text-primary dark:text-lilac",
        )}
    >
        {children}
    </button>
);

const BlockMenu = ({ label, onParagraph, onHeading, onQuote }: { label: string; onParagraph: () => void; onHeading: (level: 2 | 3) => void; onQuote: () => void }) => {
    const [open, setOpen] = useState(false);
    const item = (text: string, fn: () => void, active: boolean) => (
        <button
            type="button"
            onClick={() => { fn(); setOpen(false); }}
            className={cn("flex w-full items-center justify-between px-3 py-1.5 text-left text-caption-1 transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3", active ? "text-primary dark:text-lilac" : "text-black dark:text-white")}
        >
            {text}
            {active && <Icon className="h-3.5 w-3.5 fill-current" name="check" />}
        </button>
    );
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-caption-1 font-medium text-black transition-colors hover:bg-lavender-mist dark:text-white dark:hover:bg-dark-3"
            >
                {label}
                <Icon className="h-3.5 w-3.5 fill-current text-grey" name="arrow-down" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
                    <div className="absolute left-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-grey-light bg-white py-1 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1">
                        {item("Paragraph", onParagraph, label === "Paragraph")}
                        {item("Heading 2", () => onHeading(2), label === "Heading 2")}
                        {item("Heading 3", () => onHeading(3), label === "Heading 3")}
                        {item("Quote", onQuote, label === "Quote")}
                    </div>
                </>
            )}
        </div>
    );
};

export default EditorCanvas;
