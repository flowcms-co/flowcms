"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import { mediaUrl } from "@/lib/api";
import { richTextExtensions, imageUploadProps } from "@/lib/tiptap";
import { ColorMenu, EmojiMenu, TableMenu } from "./RichToolbarMenus";
import MediaPicker from "@/components/ui/MediaPicker";

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

const Toolbar = ({ editor, onInsertImage }: { editor: Editor; onInsertImage: () => void }) => {
    const linkPrompt = () => {
        const prev = (editor.getAttributes("link").href as string) ?? "";
        const url = window.prompt("Link URL", prev);
        if (url === null) return;
        if (!url.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
        else editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
    };
    return (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-grey-light bg-lavender-mist/40 px-2 py-1.5 dark:border-grey-light/10 dark:bg-dark-3/40">
            <TBtn title="Bold" label={<span className="font-bold">B</span>} active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()} />
            <TBtn title="Italic" label={<span className="font-serif italic">i</span>} active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()} />
            {!!editor.schema.marks.underline && <TBtn title="Underline" label={<span className="underline">U</span>} active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()} />}
            <TBtn title="Strikethrough" label={<span className="line-through">S</span>} active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()} />
            <TBtn title="Highlight" label={<Icon className="h-3.5 w-3.5 fill-current" name="edit" />} active={editor.isActive("highlight")} on={() => editor.chain().focus().toggleHighlight().run()} />
            <ColorMenu editor={editor} />
            <TBtn title="Inline code" label={<span className="font-mono text-[0.72rem]">{"</>"}</span>} active={editor.isActive("code")} on={() => editor.chain().focus().toggleCode().run()} />
            {!!editor.schema.marks.link && <TBtn title="Link" label={<Icon className="h-3.5 w-3.5 fill-current" name="external" />} active={editor.isActive("link")} on={linkPrompt} />}
            <TBtn title="Superscript" label={<span className="text-[0.78rem]">x<sup>2</sup></span>} active={editor.isActive("superscript")} on={() => editor.chain().focus().toggleSuperscript().run()} />
            <TBtn title="Subscript" label={<span className="text-[0.78rem]">x<sub>2</sub></span>} active={editor.isActive("subscript")} on={() => editor.chain().focus().toggleSubscript().run()} />
            <Div />
            <TBtn title="Heading 2" label="H2" active={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
            <TBtn title="Heading 3" label="H3" active={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
            <TBtn title="Paragraph" label="¶" active={editor.isActive("paragraph")} on={() => editor.chain().focus().setParagraph().run()} />
            <Div />
            <TBtn title="Bullet list" label="•" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()} />
            <TBtn title="Numbered list" label={<span className="text-[0.72rem] font-bold">1.</span>} active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()} />
            <TBtn title="Checklist" label="☑" active={editor.isActive("taskList")} on={() => editor.chain().focus().toggleTaskList().run()} />
            <TBtn title="Quote" label="❝" active={editor.isActive("blockquote")} on={() => editor.chain().focus().toggleBlockquote().run()} />
            <TBtn title="Code block" label={<span className="font-mono text-[0.66rem] font-bold">{"{}"}</span>} active={editor.isActive("codeBlock")} on={() => editor.chain().focus().toggleCodeBlock().run()} />
            <Div />
            <TBtn title="Align left" label="⇤" active={editor.isActive({ textAlign: "left" })} on={() => editor.chain().focus().setTextAlign("left").run()} />
            <TBtn title="Align center" label="≡" active={editor.isActive({ textAlign: "center" })} on={() => editor.chain().focus().setTextAlign("center").run()} />
            <TBtn title="Align right" label="⇥" active={editor.isActive({ textAlign: "right" })} on={() => editor.chain().focus().setTextAlign("right").run()} />
            <Div />
            <EmojiMenu editor={editor} />
            <TableMenu editor={editor} />
            <TBtn title="Horizontal rule" label={<span className="font-bold leading-none">―</span>} on={() => editor.chain().focus().setHorizontalRule().run()} />
            <TBtn title="Insert image" label={<Icon className="h-3.5 w-3.5 fill-current" name="image" />} on={onInsertImage} />
        </div>
    );
};

/**
 * A compact visual rich-text editor (TipTap) for inline fix modals + nested Rich
 * text fields, so non-developers review and edit content without ever seeing HTML
 * tags. Exposes the same capabilities as the main canvas (marks, highlight, links,
 * super/subscript, lists, quote, code block, alignment, inline images). Value
 * in/out is HTML.
 */
const RichTextField = ({ value, onChange, placeholder, minH = "12rem" }: { value: string; onChange: (html: string) => void; placeholder?: string; minH?: string }) => {
    const [imgPicker, setImgPicker] = useState(false);
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

    return (
        <div className="overflow-hidden rounded-2xl border border-grey-light dark:border-grey-light/10">
            <Toolbar editor={editor} onInsertImage={() => setImgPicker(true)} />
            <div className="max-h-[20rem] overflow-auto bg-white dark:bg-dark-1 scrollbar-thin">
                <EditorContent editor={editor} />
            </div>
            {imgPicker && (
                <MediaPicker
                    onSelect={(url) => editor.chain().focus().setImage({ src: mediaUrl(url) }).run()}
                    onClose={() => setImgPicker(false)}
                />
            )}
        </div>
    );
};

export default RichTextField;
