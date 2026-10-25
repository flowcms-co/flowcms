import DOMPurify from "dompurify";

/**
 * Entry HTML for the preview pages, with scripts, event handlers and javascript:
 * URLs removed. The preview renders in the Studio origin, so raw entry HTML there
 * is stored XSS against whoever opens it. Embedded iframes and link targets are
 * kept so in-place editing doesn't drop them from the saved body.
 *
 * DOMPurify needs a DOM: on the server this returns "" (preview content only
 * loads client-side, so the first render is empty either way).
 */
export function safeHtml(html: string | null | undefined): string {
    if (!html || typeof window === "undefined") return "";
    return DOMPurify.sanitize(html, {
        ADD_TAGS: ["iframe"],
        ADD_ATTR: ["target", "allow", "allowfullscreen", "frameborder"],
        FORBID_ATTR: ["srcdoc"],
    });
}
