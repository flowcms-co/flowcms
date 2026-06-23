"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/api";
import { runAi, aiErrorMessage } from "@/lib/useAi";
import { richTextExtensions, imageUploadProps } from "@/lib/tiptap";
import { ColorMenu, EmojiMenu, LinkMenu, TableMenu } from "./RichToolbarMenus";
import { EditorIcon } from "./EditorIcons";
import MediaPicker from "@/components/ui/MediaPicker";

// One uniform glyph size for every button in the canvas toolbar + bubble.
const ICON = "h-[1.125rem] w-[1.125rem]";
// Trigger styles for the inline LinkMenu so it matches the canvas TBtn buttons.
const LINK_TRIGGER = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-body text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3";
const LINK_ACTIVE = "bg-primary/10 text-primary dark:text-lilac";

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
    // Keep the selection bubble open while its link popover is being edited.
    const bubbleLinkOpen = useRef(false);

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
                <TBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}><EditorIcon name="undo" className={ICON} /></TBtn>
                <TBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}><EditorIcon name="redo" className={ICON} /></TBtn>
                <Sep />
                <BlockMenu
                    label={blockLabel}
                    onParagraph={() => editor.chain().focus().setParagraph().run()}
                    onHeading={(level) => editor.chain().focus().toggleHeading({ level }).run()}
                    onQuote={() => editor.chain().focus().toggleBlockquote().run()}
                />
                <Sep />
                <TBtn title="Bold" active={!!s?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><EditorIcon name="bold" className={ICON} /></TBtn>
                <TBtn title="Italic" active={!!s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><EditorIcon name="italic" className={ICON} /></TBtn>
                {hasUnderline && <TBtn title="Underline" active={!!s?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><EditorIcon name="underline" className={ICON} /></TBtn>}
                <TBtn title="Strikethrough" active={!!s?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><EditorIcon name="strike" className={ICON} /></TBtn>
                <TBtn title="Highlight" active={!!s?.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()}><EditorIcon name="highlight" className={ICON} /></TBtn>
                <ColorMenu editor={editor} />
                <TBtn title="Inline code" active={!!s?.code} onClick={() => editor.chain().focus().toggleCode().run()}><EditorIcon name="code" className={ICON} /></TBtn>
                {hasLink && <LinkMenu editor={editor} iconClass={ICON} triggerClass={LINK_TRIGGER} activeClass={LINK_ACTIVE} />}
                <TBtn title="Superscript" active={!!s?.sup} onClick={() => editor.chain().focus().toggleSuperscript().run()}><EditorIcon name="superscript" className={ICON} /></TBtn>
                <TBtn title="Subscript" active={!!s?.sub} onClick={() => editor.chain().focus().toggleSubscript().run()}><EditorIcon name="subscript" className={ICON} /></TBtn>
                <Sep />
                <TBtn title="Bulleted list" active={!!s?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><EditorIcon name="bulletList" className={ICON} /></TBtn>
                <TBtn title="Numbered list" active={!!s?.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><EditorIcon name="orderedList" className={ICON} /></TBtn>
                <TBtn title="Checklist" active={!!s?.task} onClick={() => editor.chain().focus().toggleTaskList().run()}><EditorIcon name="taskList" className={ICON} /></TBtn>
                <TBtn title="Quote" active={!!s?.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><EditorIcon name="quote" className={ICON} /></TBtn>
                <TBtn title="Code block" active={!!s?.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><EditorIcon name="codeBlock" className={ICON} /></TBtn>
                <Sep />
                <TBtn title="Align left" active={!!s?.alignLeft} onClick={() => editor.chain().focus().setTextAlign("left").run()}><EditorIcon name="alignLeft" className={ICON} /></TBtn>
                <TBtn title="Align center" active={!!s?.alignCenter} onClick={() => editor.chain().focus().setTextAlign("center").run()}><EditorIcon name="alignCenter" className={ICON} /></TBtn>
                <TBtn title="Align right" active={!!s?.alignRight} onClick={() => editor.chain().focus().setTextAlign("right").run()}><EditorIcon name="alignRight" className={ICON} /></TBtn>
                <TBtn title="Justify" active={!!s?.alignJustify} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><EditorIcon name="alignJustify" className={ICON} /></TBtn>
                <Sep />
                <EmojiMenu editor={editor} iconClass={ICON} />
                <TableMenu editor={editor} iconClass={ICON} />
                <TBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><EditorIcon name="rule" className={ICON} /></TBtn>
                <Sep />
                <button
                    type="button"
                    onClick={clearFormatting}
                    title="Clear formatting — reset selection (or the whole block) to plain text"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-caption-2 font-medium text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                >
                    <EditorIcon name="clear" className={ICON} />
                    Clear
                </button>
                <div className="ml-auto" />
                <button
                    type="button"
                    onClick={() => setImgPicker(true)}
                    title="Insert an image"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-caption-2 font-medium text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                >
                    <EditorIcon name="image" className={ICON} />
                    Add
                </button>
                <button
                    type="button"
                    onClick={() => void askAi()}
                    disabled={aiBusy}
                    title="Improve the selected text with AI"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-caption-2 font-semibold text-primary transition-colors hover:bg-lavender-mist disabled:opacity-60 dark:text-lilac dark:hover:bg-dark-3"
                >
                    <EditorIcon name="sparkles" className={ICON} />
                    {aiBusy ? "…" : "AI"}
                </button>
            </div>

            {/* Inline selection bubble — quick formatting where the cursor is. */}
            <BubbleMenu
                editor={editor}
                options={{ placement: "top" }}
                shouldShow={({ editor, state }) => bubbleLinkOpen.current || (editor.isEditable && !state.selection.empty)}
                className="flex items-center gap-0.5 rounded-lg border border-grey-light bg-white p-1 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1"
            >
                <TBtn title="Bold" active={!!s?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><EditorIcon name="bold" className={ICON} /></TBtn>
                <TBtn title="Italic" active={!!s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><EditorIcon name="italic" className={ICON} /></TBtn>
                <TBtn title="Highlight" active={!!s?.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()}><EditorIcon name="highlight" className={ICON} /></TBtn>
                <TBtn title="Inline code" active={!!s?.code} onClick={() => editor.chain().focus().toggleCode().run()}><EditorIcon name="code" className={ICON} /></TBtn>
                {hasLink && <LinkMenu editor={editor} iconClass={ICON} triggerClass={LINK_TRIGGER} activeClass={LINK_ACTIVE} onOpenChange={(o) => (bubbleLinkOpen.current = o)} />}
                <Sep />
                <TBtn title="Paragraph" active={blockLabel === "Paragraph"} onClick={() => editor.chain().focus().setParagraph().run()}><EditorIcon name="paragraph" className={ICON} /></TBtn>
                <TBtn title="Heading 2" active={!!s?.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><span className="text-caption-1 font-semibold">H2</span></TBtn>
                <TBtn title="Heading 3" active={!!s?.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><span className="text-caption-1 font-semibold">H3</span></TBtn>
                <TBtn title="Bulleted list" active={!!s?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><EditorIcon name="bulletList" className={ICON} /></TBtn>
                <Sep />
                <button
                    type="button"
                    onClick={() => void askAi()}
                    disabled={aiBusy}
                    title="Improve the selected text with AI"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-caption-2 font-semibold text-primary transition-colors hover:bg-lavender-mist disabled:opacity-60 dark:text-lilac dark:hover:bg-dark-3"
                >
                    <EditorIcon name="sparkles" className={ICON} />
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
            {active && <EditorIcon name="check" className="h-3.5 w-3.5" />}
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
                <EditorIcon name="chevronDown" className="h-3.5 w-3.5 text-grey" />
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
