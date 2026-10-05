import { preserveHtml } from "@flowcms/shared/html";

/**
 * Tracks one rich text value through an edit session so that loading never counts
 * as editing. It remembers the stored HTML, what the editor made of it on load, and
 * the last value reported, and answers two questions: what should be stored now,
 * and did the user actually change anything.
 */
export class RichTextTracker {
    private original = "";
    private baseline: string | null = null;
    private last = "";

    /** A value was loaded (from the API, an AI rewrite, the live preview). */
    load(stored: string, editorHtml?: string): void {
        this.original = this.last = stored;
        this.baseline = editorHtml ?? null;
    }

    /** The editor has rendered the loaded value: this is its normalised form. */
    ready(editorHtml: string): void {
        this.baseline = editorHtml;
    }

    /** What to store for the editor's current content: the stored bytes when nothing
     *  was edited, and otherwise only the changed blocks rewritten. */
    value(editorHtml: string | null | undefined): string {
        return editorHtml == null ? this.original : preserveHtml(this.original, this.baseline ?? editorHtml, editorHtml);
    }

    /** Call on every editor update. True when the stored value would change, i.e.
     *  the user edited; false when the editor only tidied its own markup. */
    changed(editorHtml: string): boolean {
        const now = this.value(editorHtml);
        if (now === this.last) return false;
        this.last = now;
        return true;
    }

    /** The value last reported as an edit (or the loaded one). */
    get current(): string {
        return this.last;
    }
}
