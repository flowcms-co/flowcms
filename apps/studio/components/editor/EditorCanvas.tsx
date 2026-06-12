"use client";

import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { runAi, aiErrorMessage } from "@/lib/useAi";

/**
 * TipTap canvas (free MIT core). Provides:
 *  - StarterKit blocks (headings, lists, quote, code, bold/italic, etc.)
 *  - a placeholder
 *  - a selection bubble toolbar for inline formatting + an "Ask AI" action that
 *    rewrites the selected text via the workspace's AI provider.
 */
const EditorCanvas = ({
    onReady,
    initialContent,
}: {
    onReady?: (editor: Editor) => void;
    /** Initial HTML/content. When undefined, the editor opens empty (placeholder shows). */
    initialContent?: string;
}) => {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: "Type “/” for blocks, or just start writing…",
            }),
        ],
        content: initialContent ?? "",
        editorProps: {
            attributes: {
                class: "flow-prose min-h-[60vh] max-w-[44rem] mx-auto py-10 focus:outline-none",
            },
        },
        onCreate: ({ editor }) => onReady?.(editor),
    });

    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    if (!editor) {
        return <div className="min-h-[60vh] max-w-[44rem] mx-auto py-10" />;
    }

    /** Briefly show an error toast (auto-dismisses). */
    const flashError = (msg: string) => {
        setAiError(msg);
        window.setTimeout(() => setAiError(null), 4500);
    };

    /** Rewrite the current selection via AI (improve clarity), then replace it. */
    const askAi = async () => {
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, "\n");
        if (!text.trim() || aiBusy) return;
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
        <>
            <BubbleMenu
                editor={editor}
                options={{ placement: "top" }}
                className="flex items-center gap-0.5 rounded-xl border border-grey-light bg-white p-1 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:bg-dark-1 dark:border-grey-light/10"
            >
                <BubbleBtn
                    active={editor.isActive("bold")}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    label="Bold"
                >
                    <span className="font-bold">B</span>
                </BubbleBtn>
                <BubbleBtn
                    active={editor.isActive("italic")}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    label="Italic"
                >
                    <span className="italic font-serif">i</span>
                </BubbleBtn>
                <BubbleBtn
                    active={editor.isActive("code")}
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    label="Code"
                >
                    <span className="font-mono text-[0.8em]">{"</>"}</span>
                </BubbleBtn>
                <span className="mx-0.5 h-5 w-px bg-grey-light dark:bg-grey-light/10" />
                <BubbleBtn
                    active={editor.isActive("heading", { level: 2 })}
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                    label="Heading"
                >
                    H2
                </BubbleBtn>
                <BubbleBtn
                    active={editor.isActive("bulletList")}
                    onClick={() =>
                        editor.chain().focus().toggleBulletList().run()
                    }
                    label="Bullet list"
                >
                    <Icon className="w-4 h-4 fill-current" name="menu-collapse" />
                </BubbleBtn>
                <span className="mx-0.5 h-5 w-px bg-grey-light dark:bg-grey-light/10" />
                <button
                    type="button"
                    title="Improve with AI"
                    onClick={() => void askAi()}
                    disabled={aiBusy}
                    className="inline-flex items-center gap-1 px-2 h-8 rounded-lg text-caption-1 text-primary transition-colors hover:bg-lavender-mist disabled:opacity-60 dark:hover:bg-dark-3"
                >
                    <Icon className="w-4 h-4 fill-primary" name="sparkles" />
                    {aiBusy ? "…" : "AI"}
                </button>
            </BubbleMenu>

            <EditorContent editor={editor} />

            {aiError && (
                <div
                    role="alert"
                    className="fixed bottom-6 left-1/2 z-50 flex max-w-[22rem] -translate-x-1/2 items-start gap-2 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-caption-1 text-error shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] backdrop-blur dark:bg-error/15"
                >
                    <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>{aiError}</span>
                </div>
            )}
        </>
    );
};

const BubbleBtn = ({
    active,
    onClick,
    label,
    children,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
}) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        onClick={onClick}
        className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-lg text-body text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3",
            active && "bg-primary/10 text-primary",
        )}
    >
        {children}
    </button>
);

export default EditorCanvas;
