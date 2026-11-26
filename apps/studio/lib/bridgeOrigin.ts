/** The origin of the site shown in the preview frame, or null when the URL is missing or not absolute. */
export function siteOriginOf(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const o = new URL(url).origin;
        return o === "null" ? null : o;
    } catch {
        return null;
    }
}

/** A message is trusted only when it comes from the frame's window and the site's own origin. */
export function fromSiteFrame(e: { source: unknown; origin: string }, frameWindow: unknown, siteOrigin: string | null): boolean {
    return !!siteOrigin && !!frameWindow && e.source === frameWindow && e.origin === siteOrigin;
}
