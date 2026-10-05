import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { render, waitFor } from "@testing-library/react";
import { richTextExtensions } from "./tiptap";
import { RichTextTracker } from "./richTextTracker";

vi.mock("@/lib/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), mediaUrl: (u: string) => u, ApiError: class extends Error {} }));
vi.mock("@/lib/useAi", () => ({ runAi: vi.fn(), aiErrorMessage: () => "" }));
vi.mock("@/lib/useWorkspace", () => ({ useWorkspace: () => ({ siteUrl: "https://example.com" }) }));
vi.mock("@/components/ui/MediaPicker", () => ({ default: () => null }));

// A published entry's stored rich text: internal links, a list, a bare ampersand.
const STORED =
    '<h2>Costs & timing</h2>\n<p>Read the <a href="/resources/basement-flood-cleanup-cost">cost guide</a> first.</p>\n<ul><li>Pumps</li><li>Fans & heaters</li></ul>\n<p>Or <a href="https://example.com/contact">contact us</a>.</p>';

const open = (html: string) => new Editor({ extensions: richTextExtensions(""), content: html });
/** Replace the first occurrence of `from` in the document's text with `to`, as typing would. */
function retype(editor: Editor, from: string, to: string) {
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
        const i = node.isText ? (node.text ?? "").indexOf(from) : -1;
        if (i >= 0 && at < 0) at = pos + i;
    });
    editor.commands.insertContentAt({ from: at, to: at + from.length }, to);
}

describe("opening and editing stored rich text", () => {
    it("adds no target or rel to links", () => {
        const html = open(STORED).getHTML();
        expect(html).toContain('<a href="/resources/basement-flood-cleanup-cost">cost guide</a>');
        expect(html).not.toMatch(/nofollow|target=|rel=/);
    });

    it("keeps link attributes an author set on purpose", () => {
        const html = open('<p><a href="https://other.com" target="_blank" rel="noopener noreferrer nofollow">out</a></p>').getHTML();
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer nofollow"');
    });

    it("open and close: nothing to save, the stored HTML is untouched", () => {
        const editor = open(STORED);
        const track = new RichTextTracker();
        track.load(STORED);
        track.ready(editor.getHTML());
        // The editor's own housekeeping (a trailing paragraph) fires an update.
        editor.commands.focus("end");
        expect(track.changed(editor.getHTML())).toBe(false);
        expect(track.value(editor.getHTML())).toBe(STORED);
    });

    it("edit one word: the diff is that word only", () => {
        const editor = open(STORED);
        const track = new RichTextTracker();
        track.load(STORED);
        track.ready(editor.getHTML());
        retype(editor, "first", "today");
        expect(track.changed(editor.getHTML())).toBe(true);
        expect(track.value(editor.getHTML())).toBe(STORED.replace("first", "today"));
    });

    it("typing the word back is no longer a change", () => {
        const editor = open(STORED);
        const track = new RichTextTracker();
        track.load(STORED);
        track.ready(editor.getHTML());
        retype(editor, "first", "today");
        track.changed(editor.getHTML());
        retype(editor, "today", "first");
        expect(track.value(editor.getHTML())).toBe(STORED);
    });
});

describe("RichTextField", () => {
    it("does not report a change when it mounts with stored content", async () => {
        const { default: RichTextField } = await import("@/components/editor/RichTextField");
        const onChange = vi.fn();
        const { container } = render(<RichTextField value={STORED} onChange={onChange} />);
        await waitFor(() => expect(container.querySelector(".ProseMirror")).toBeTruthy());
        await new Promise((r) => setTimeout(r, 50));
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("link options", () => {
    it("internal links get no target or rel; external links only what the author chose", async () => {
        const { linkAttrs } = await import("@/components/editor/RichToolbarMenus");
        const site = "https://example.com";
        expect(linkAttrs("/guide", site, { newTab: true, nofollow: true })).toEqual({ target: null, rel: null });
        expect(linkAttrs("https://example.com/guide", site, { newTab: true, nofollow: true })).toEqual({ target: null, rel: null });
        expect(linkAttrs("https://other.com", site, { newTab: false, nofollow: false })).toEqual({ target: null, rel: null });
        expect(linkAttrs("https://other.com", site, { newTab: true, nofollow: false })).toEqual({ target: "_blank", rel: "noopener noreferrer" });
        expect(linkAttrs("https://other.com", site, { newTab: false, nofollow: true })).toEqual({ target: null, rel: "nofollow" });
    });
});
