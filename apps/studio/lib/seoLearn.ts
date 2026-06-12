import { api } from "@/lib/api";

/**
 * Record an accepted fix into the SEO memory ("The Brain") so future AI suggestions
 * and the auto-apply pass follow what the user actually accepts. Best-effort: a
 * failure (e.g. a role without KNOWLEDGE_MANAGE) never blocks the save. Only the
 * meta + schema kinds carry learnable preferences today (title/description length,
 * keyword-lead, schema types); deterministic rule fixes (canonical, noindex) and
 * freeform content rewrites have nothing to generalise, so they're skipped.
 *
 * Returns true when something was learned.
 */
export async function learnFromFix(
    mode: string,
    path: string,
    vals: { metaTitle?: string; metaDesc?: string; schemaType?: string },
): Promise<boolean> {
    try {
        if (mode === "meta") {
            await api("/seo/learning", { method: "POST", body: JSON.stringify({ kind: "meta", path, after: { title: vals.metaTitle ?? "", description: vals.metaDesc ?? "" } }) });
            return true;
        }
        if (mode === "schema" || mode === "faq") {
            await api("/seo/learning", { method: "POST", body: JSON.stringify({ kind: "schema", path, after: { type: vals.schemaType ?? "" } }) });
            return true;
        }
    } catch {
        // best-effort; never block the fix
    }
    return false;
}
