"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

const TBtn = ({ on, active, label, title }: { on: () => void; active: boolean; label: string; title: string }) => (
    <button
        type="button"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); on(); }}
        className={`rounded-md px-2 py-1 text-caption-1 transition-colors ${active ? "bg-primary text-white" : "text-grey hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"}`}
    >
        {label}
    </button>
);

const Toolbar = ({ editor }: { editor: Editor }) => (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-grey-light bg-lavender-mist/40 px-2 py-1.5 dark:border-grey-light/10 dark:bg-dark-3/40">
        <TBtn title="Bold" label="B" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()} />
        <TBtn title="Italic" label="I" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()} />
        <span className="mx-1 h-4 w-px bg-grey-light dark:bg-grey-light/15" />
        <TBtn title="Heading 2" label="H2" active={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <TBtn title="Heading 3" label="H3" active={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <TBtn title="Paragraph" label="¶" active={editor.isActive("paragraph")} on={() => editor.chain().focus().setParagraph().run()} />
        <span className="mx-1 h-4 w-px bg-grey-light dark:bg-grey-light/15" />
        <TBtn title="Bullet list" label="• List" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()} />
        <TBtn title="Numbered list" label="1. List" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()} />
        <TBtn title="Quote" label="❝" active={editor.isActive("blockquote")} on={() => editor.chain().focus().toggleBlockquote().run()} />
    </div>
);

/**
 * A compact visual rich-text editor (TipTap) for inline fix modals, so non-developers
 * review and edit content without ever seeing HTML tags. Value in/out is HTML.
 */
const RichTextField = ({ value, onChange, placeholder, minH = "12rem" }: { value: string; onChange: (html: string) => void; placeholder?: string; minH?: string }) => {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Placeholder.configure({ placeholder: placeholder ?? "Write here…" }),
        ],
        content: value || "",
        editorProps: { attributes: { class: "flow-prose max-w-none px-4 py-3 focus:outline-none", style: `min-height:${minH}` } },
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });

    // Sync external value changes (e.g. an AI rewrite) into the editor.
    useEffect(() => {
        if (editor && value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
    }, [value, editor]);

    if (!editor) return <div className="rounded-2xl border border-grey-light px-4 py-3 text-body-sm text-grey dark:border-grey-light/10">Loading editor…</div>;

    return (
        <div className="overflow-hidden rounded-2xl border border-grey-light dark:border-grey-light/10">
            <Toolbar editor={editor} />
            <div className="max-h-[20rem] overflow-auto bg-white dark:bg-dark-1 scrollbar-thin">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
};

export default RichTextField;
