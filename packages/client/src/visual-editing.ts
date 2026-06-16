/**
 * @flowcms/client/visual-editing — the live-editor bridge for your frontend.
 *
 * Pair it with the data client: `@flowcms/client` *reads* content into your site;
 * this *enables in-place editing* of the rendered page inside the Flow CMS live
 * preview. They are independent — use either or both.
 *
 *   import { enableVisualEditing } from "@flowcms/client/visual-editing";
 *   enableVisualEditing(); // call once on the client, e.g. in a root layout effect
 *
 * Then mark editable regions with the matching content-model field name:
 *
 *   <h1 data-flowcms-field="title">{title}</h1>
 *   <p  data-flowcms-field="summary">{summary}</p>
 *   <div data-flowcms-field="body" data-flowcms-rich dangerouslySetInnerHTML={{ __html: body }} />
 *
 * - data-flowcms-field="<name>"  the field name in your content model. Use "title"
 *                             for the entry title; anything else writes to data.
 * - data-flowcms-rich            keep rich HTML for that field; omit it for
 *                             single-line text (edited plaintext-only).
 *
 * Why a bridge at all? The studio embeds your site in a cross-origin <iframe>, and
 * the browser's same-origin policy forbids it from touching your DOM directly. The
 * only sanctioned channel is postMessage, so the page must opt in by running this.
 *
 * It is inert unless the page is embedded in the Flow CMS preview, and a no-op
 * during server-side rendering, so it is safe to ship to production.
 */

export type VisualEditingOptions = {
    /** Attribute marking an editable region. Default "data-flowcms-field". */
    attribute?: string;
    /** Attribute marking a field as rich HTML (vs plaintext). Default "data-flowcms-rich". */
    richAttribute?: string;
    /** Class applied to fields while editing (for your own styling). Default "flowcms-edit-on". */
    editClassName?: string;
    /** Inject a minimal dashed outline for the edit class. Default true. */
    injectStyles?: boolean;
};

type Dict = Record<string, string>;

const FLAG = "__flowcmsVisualEditing";

/**
 * Wire up the live-edit bridge. Returns a cleanup function that removes the
 * listeners and editing state (handy in framework effects). Calling it more than
 * once is a no-op after the first.
 */
export function enableVisualEditing(options: VisualEditingOptions = {}): () => void {
    // No-op during SSR / non-browser runtimes.
    if (typeof window === "undefined" || typeof document === "undefined") return () => {};
    const w = window as unknown as Record<string, unknown>;
    if (w[FLAG]) return () => {};
    w[FLAG] = true;

    const attribute = options.attribute ?? "data-flowcms-field";
    const richAttribute = options.richAttribute ?? "data-flowcms-rich";
    const editClassName = options.editClassName ?? "flowcms-edit-on";
    const injectStyles = options.injectStyles ?? true;

    // Only talk to the embedding parent (the studio). "*" until we learn the origin.
    let parentOrigin = "*";
    try {
        if (document.referrer) parentOrigin = new URL(document.referrer).origin;
    } catch {
        /* keep * */
    }

    const nodes = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`));
    const fieldName = (el: HTMLElement): string => el.getAttribute(attribute) || "";
    const isRich = (el: HTMLElement): boolean => el.hasAttribute(richAttribute);
    const readValue = (el: HTMLElement): string => (isRich(el) ? el.innerHTML : el.textContent || "");
    const writeValue = (el: HTMLElement, v: string): void => {
        if (isRich(el)) el.innerHTML = v;
        else el.textContent = v;
    };
    const snapshot = (): Dict => {
        const m: Dict = {};
        for (const el of nodes()) m[fieldName(el)] = readValue(el);
        return m;
    };

    let baseline: Dict = {};

    const post = (msg: Record<string, unknown>): void => {
        try {
            window.parent?.postMessage({ source: "flowcms-preview", ...msg }, parentOrigin);
        } catch {
            /* ignore */
        }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = (): void => {
        post({ type: "dirty" });
        clearTimeout(timer);
        timer = setTimeout(() => post({ type: "fields", fields: snapshot() }), 200);
    };

    const toggle = (on: boolean): void => {
        for (const el of nodes()) {
            if (on) {
                el.setAttribute("contenteditable", isRich(el) ? "true" : "plaintext-only");
                el.classList.add(editClassName);
                el.addEventListener("input", onInput);
            } else {
                el.removeAttribute("contenteditable");
                el.classList.remove(editClassName);
                el.removeEventListener("input", onInput);
            }
        }
    };

    const onMessage = (e: MessageEvent): void => {
        if (parentOrigin !== "*" && e.origin !== parentOrigin) return;
        const d = e.data as
            | { source?: string; type?: string; editing?: boolean; fields?: Record<string, unknown>; title?: unknown; summary?: unknown; body?: unknown }
            | null;
        if (!d || d.source !== "flowcms-studio") return;
        if (d.type === "hello") {
            post({ type: "ready", editable: true });
            return;
        }
        if (d.type === "baseline") {
            const f = (d.fields && typeof d.fields === "object" ? d.fields : d) as Record<string, unknown>;
            for (const [k, v] of Object.entries(f)) if (typeof v === "string") baseline[k] = v;
            return;
        }
        if (d.type === "revert") {
            for (const el of nodes()) {
                const n = fieldName(el);
                if (n in baseline) writeValue(el, baseline[n]);
            }
            return;
        }
        if (d.type === "edit") {
            toggle(!!d.editing);
            if (d.editing) nodes()[0]?.focus();
            return;
        }
    };

    window.addEventListener("message", onMessage);

    let styleEl: HTMLStyleElement | undefined;
    if (injectStyles) {
        styleEl = document.createElement("style");
        styleEl.textContent = `.${editClassName}{outline:2px dashed rgba(108,92,231,.5);outline-offset:4px;border-radius:4px;cursor:text}.${editClassName}:focus{outline-color:rgba(108,92,231,1)}`;
        document.head.appendChild(styleEl);
    }

    baseline = snapshot();
    // Handshake: announce that this page supports live editing.
    post({ type: "ready", editable: true });

    return () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        toggle(false);
        styleEl?.remove();
        w[FLAG] = false;
    };
}
