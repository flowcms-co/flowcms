"use client";

/**
 * Same-origin live link between the block editor and its preview tab. The editor
 * (/content/editor) and the preview (/preview) run in separate browser tabs but
 * share an origin, so a BroadcastChannel keyed by entry id streams unsaved edits
 * between them in real time: type in the editor and the preview updates instantly,
 * and edits made in the live preview flow straight back into the editor (and its
 * autosave). It is a local, draft-only mirror — no server round-trip and no
 * WebSocket; persistence still happens through the API on save / autosave.
 */

export type PreviewDraft = {
    title?: string;
    slug?: string | null;
    status?: string;
    data?: Record<string, unknown>;
};

type Peer = "editor" | "preview";

export type PreviewSyncMessage =
    /** A live snapshot of the unsaved entry, pushed by whichever side is being edited. */
    | { kind: "draft"; from: Peer; draft: PreviewDraft }
    /** "I just opened — anyone holding the latest draft, please send it." */
    | { kind: "hello"; from: Peer }
    /** The preview persisted its in-place edits, so the editor should reload. */
    | { kind: "saved"; from: Peer };

const channelName = (entryId: string) => `flowcms-preview:${entryId}`;

export type PreviewSyncHandle = {
    post: (msg: PreviewSyncMessage) => void;
    close: () => void;
};

/**
 * Open the live channel for an entry. `onMessage` only fires for messages from the
 * *other* peer (a channel never receives its own posts, but the `from` guard keeps
 * things robust if two views ever share a tab). Returns null when BroadcastChannel
 * is unavailable (SSR / very old browsers), so callers degrade to save-then-refresh.
 */
export function openPreviewSync(
    entryId: string,
    self: Peer,
    onMessage: (msg: PreviewSyncMessage) => void,
): PreviewSyncHandle | null {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
    let ch: BroadcastChannel;
    try {
        ch = new BroadcastChannel(channelName(entryId));
    } catch {
        return null;
    }
    ch.onmessage = (e) => {
        const m = e.data as PreviewSyncMessage | null;
        if (m && m.from !== self) onMessage(m);
    };
    return {
        post: (msg) => {
            try {
                ch.postMessage(msg);
            } catch {
                /* a closed/erroring channel must never break editing */
            }
        },
        close: () => {
            try {
                ch.close();
            } catch {
                /* ignore */
            }
        },
    };
}
