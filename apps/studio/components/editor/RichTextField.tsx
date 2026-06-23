"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { mediaUrl } from "@/lib/api";
import { runAi, aiErrorMessage } from "@/lib/useAi";
import { richTextExtensions, imageUploadProps } from "@/lib/tiptap";
import { ColorMenu, EmojiMenu, LinkMenu, TableMenu } from "./RichToolbarMenus";
import { EditorIcon } from "./EditorIcons";
import MediaPicker from "@/components/ui/MediaPicker";

// One uniform glyph size for every button in the compact toolbar + bubble.
const ICON = "h-4 w-4";
// Trigger styles for the inline LinkMenu so it matches the compact TBtn buttons.
const LINK_TRIGGER = "inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-2 py-1 text-caption-1 transition-colors text-grey hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3";
const LINK_ACTIVE = "bg-primary text-white hover:bg-primary hover:text-white";

const TBtn = ({ on, active, label, title }: { on: () => void; active?: boolean; label: React.ReactNode; title: string }) => (
    <button
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={!!active}
        onMouseDown={(e) => { e.preventDefault(); on(); }}
        className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-2 py-1 text-caption-1 transition-colors ${active ? "bg-primary text-white" : "text-grey hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"}`}
    >
        {label}
    </button>
);

const Div = () => <span className="mx-1 h-4 w-px bg-grey-light dark:bg-grey-light/15" />;

/** AI "rewrite the selection" button — shared by the toolbar and the bubble menu so
 *  both surfaces stay in sync with the canvas editor. */
const AiBtn = ({ onAi, busy, compact }: { onAi: () => void; busy: boolean; compact?: boolean }) => (
    <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onAi(); }}
        disabled={busy}
        title="Improve the selected text with AI"
        className={`inline-flex items-center gap-1 rounded-md ${compact ? "px-2 py-1" : "px-2 py-1"} text-caption-1 font-semibold text-primary transition-colors hover:bg-lavender-mist disabled:opacity-60 dark:text-lilac dark:hover:bg-dark-3`}
    >
        <EditorIcon name="sparkles" className={ICON} />
        {busy ? "…" : "AI"}
    </button>
);

const Toolbar = ({ editor, onInsertImage, onAi, aiBusy }: { editor: Editor; onInsertImage: () => void; onAi: () => void; aiBusy: boolean }) => {
    return (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-grey-light bg-lavender-mist/40 px-2 py-1.5 dark:border-grey-light/10 dark:bg-dark-3/40">
            <TBtn title="Bold" label={<EditorIcon name="bold" className={ICON} />} active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()} />
            <TBtn title="Italic" label={<EditorIcon name="italic" className={ICON} />} active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()} />
            {!!editor.schema.marks.underline && <TBtn title="Underline" label={<EditorIcon name="underline" className={ICON} />} active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()} />}
            <TBtn title="Strikethrough" label={<EditorIcon name="strike" className={ICON} />} active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()} />
            <TBtn title="Highlight" label={<EditorIcon name="highlight" className={ICON} />} active={editor.isActive("highlight")} on={() => editor.chain().focus().toggleHighlight().run()} />
            <ColorMenu editor={editor} />
            <TBtn title="Inline code" label={<EditorIcon name="code" className={ICON} />} active={editor.isActive("code")} on={() => editor.chain().focus().toggleCode().run()} />
            {!!editor.schema.marks.link && <LinkMenu editor={editor} iconClass={ICON} triggerClass={LINK_TRIGGER} activeClass={LINK_ACTIVE} />}
            <TBtn title="Superscript" label={<EditorIcon name="superscript" className={ICON} />} active={editor.isActive("superscript")} on={() => editor.chain().focus().toggleSuperscript().run()} />
            <TBtn title="Subscript" label={<EditorIcon name="subscript" className={ICON} />} active={editor.isActive("subscript")} on={() => editor.chain().focus().toggleSubscript().run()} />
            <Div />
            <TBtn title="Heading 2" label={<span className="text-caption-1 font-semibold">H2</span>} active={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
            <TBtn title="Heading 3" label={<span className="text-caption-1 font-semibold">H3</span>} active={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
            <TBtn title="Paragraph" label={<EditorIcon name="paragraph" className={ICON} />} active={editor.isActive("paragraph")} on={() => editor.chain().focus().setParagraph().run()} />
            <Div />
            <TBtn title="Bullet list" label={<EditorIcon name="bulletList" className={ICON} />} active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()} />
            <TBtn title="Numbered list" label={<EditorIcon name="orderedList" className={ICON} />} active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()} />
            <TBtn title="Checklist" label={<EditorIcon name="taskList" className={ICON} />} active={editor.isActive("taskList")} on={() => editor.chain().focus().toggleTaskList().run()} />
            <TBtn title="Quote" label={<EditorIcon name="quote" className={ICON} />} active={editor.isActive("blockquote")} on={() => editor.chain().focus().toggleBlockquote().run()} />
            <TBtn title="Code block" label={<EditorIcon name="codeBlock" className={ICON} />} active={editor.isActive("codeBlock")} on={() => editor.chain().focus().toggleCodeBlock().run()} />
            <Div />
            <TBtn title="Align left" label={<EditorIcon name="alignLeft" className={ICON} />} active={editor.isActive({ textAlign: "left" })} on={() => editor.chain().focus().setTextAlign("left").run()} />
            <TBtn title="Align center" label={<EditorIcon name="alignCenter" className={ICON} />} active={editor.isActive({ textAlign: "center" })} on={() => editor.chain().focus().setTextAlign("center").run()} />
            <TBtn title="Align right" label={<EditorIcon name="alignRight" className={ICON} />} active={editor.isActive({ textAlign: "right" })} on={() => editor.chain().focus().setTextAlign("right").run()} />
            <Div />
            <EmojiMenu editor={editor} iconClass={ICON} />
            <TableMenu editor={editor} iconClass={ICON} />
            <TBtn title="Horizontal rule" label={<EditorIcon name="rule" className={ICON} />} on={() => editor.chain().focus().setHorizontalRule().run()} />
            <TBtn title="Insert image" label={<EditorIcon name="image" className={ICON} />} on={onInsertImage} />
            <Div />
            <AiBtn onAi={onAi} busy={aiBusy} />
        </div>
    );
};

/**
 * A compact visual rich-text editor (TipTap) for inline fix modals + nested Rich
 * text fields, so non-developers review and edit content without ever seeing HTML
 * tags. Exposes the same capabilities as the main canvas (marks, highlight, links,
 * super/subscript, lists, quote, code block, alignment, inline images) plus an "AI"
 * action that rewrites the selection — both on the toolbar and in the inline
 * selection bubble. Value in/out is HTML.
 */
const RichTextField = ({ value, onChange, placeholder, minH = "12rem" }: { value: string; onChange: (html: string) => void; placeholder?: string; minH?: string }) => {
    const [imgPicker, setImgPicker] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    // Keep the selection bubble open while its link popover is being edited (the
    // input steals focus from the editor, which would otherwise hide the bubble).
    const bubbleLinkOpen = useRef(false);
    const editor = useEditor({
        immediatelyRender: false,
        extensions: richTextExtensions(placeholder ?? "Write here…"),
        content: value || "",
        editorProps: {
            attributes: { class: "flow-prose max-w-none px-4 py-3 focus:outline-none", style: `min-height:${minH}` },
            // Drag-and-drop / paste image files → upload to the asset library + insert.
            ...imageUploadProps(),
        },
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });

    // Sync external value changes (e.g. an AI rewrite) into the editor.
    useEffect(() => {
        if (editor && value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
    }, [value, editor]);

    if (!editor) return <div className="rounded-2xl border border-grey-light px-4 py-3 text-body-sm text-grey dark:border-grey-light/10">Loading editor…</div>;

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

    return (
        <div className="overflow-hidden rounded-2xl border border-grey-light dark:border-grey-light/10">
            <Toolbar editor={editor} onInsertImage={() => setImgPicker(true)} onAi={() => void askAi()} aiBusy={aiBusy} />

            {/* Inline selection bubble — quick formatting + AI where the cursor is. */}
            <BubbleMenu
                editor={editor}
                options={{ placement: "top" }}
                shouldShow={({ editor, state }) => bubbleLinkOpen.current || (editor.isEditable && !state.selection.empty)}
                className="flex items-center gap-0.5 rounded-lg border border-grey-light bg-white p-1 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1"
            >
                <TBtn title="Bold" label={<EditorIcon name="bold" className={ICON} />} active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()} />
                <TBtn title="Italic" label={<EditorIcon name="italic" className={ICON} />} active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()} />
                <TBtn title="Highlight" label={<EditorIcon name="highlight" className={ICON} />} active={editor.isActive("highlight")} on={() => editor.chain().focus().toggleHighlight().run()} />
                <TBtn title="Inline code" label={<EditorIcon name="code" className={ICON} />} active={editor.isActive("code")} on={() => editor.chain().focus().toggleCode().run()} />
                {!!editor.schema.marks.link && <LinkMenu editor={editor} iconClass="h-3.5 w-3.5" triggerClass={LINK_TRIGGER} activeClass={LINK_ACTIVE} onOpenChange={(o) => (bubbleLinkOpen.current = o)} />}
                <Div />
                <AiBtn onAi={() => void askAi()} busy={aiBusy} compact />
            </BubbleMenu>

            <div className="max-h-[20rem] overflow-auto bg-white dark:bg-dark-1 scrollbar-thin">
                <EditorContent editor={editor} />
            </div>
            {imgPicker && (
                <MediaPicker
                    onSelect={(url) => editor.chain().focus().setImage({ src: mediaUrl(url) }).run()}
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

export default RichTextField;
