/** Classifies a content-model change for the agent model API: what would drop or
 *  convert stored data, and what touches public routing. Pure, so it's unit-tested. */

type F = { id?: string; name?: string; type?: string; repeatable?: boolean; multiple?: boolean; componentApiId?: string; fields?: F[] };

export type DestructiveChange = { field: string; change: "removed" | "type" | "single" };

/** Schema keys that decide where entries live on the public site. */
export const ROUTING_KEYS = ["pageType", "routePattern", "slugPattern", "isPage"] as const;

/** Fields that vanish, change type, or go from many values to one. Fields match by
 *  id (as the server's key remap does), so a rename alone is not destructive. */
export function destructiveChanges(oldFields: F[] | undefined, newFields: F[] | undefined, prefix = ""): DestructiveChange[] {
    const out: DestructiveChange[] = [];
    const news = newFields ?? [];
    for (const of of oldFields ?? []) {
        const nf = news.find((n) => (of.id != null ? n.id === of.id : n.name === of.name));
        const field = prefix + (of.name ?? "");
        if (!nf) {
            out.push({ field, change: "removed" });
            continue;
        }
        if ((nf.type ?? null) !== (of.type ?? null)) out.push({ field, change: "type" });
        else if ((of.repeatable && !nf.repeatable) || (of.multiple && !nf.multiple)) out.push({ field, change: "single" });
        // Inline component sub-fields live inside this entry's data; library
        // components (componentApiId) are owned by their own type.
        if (Array.isArray(of.fields) && !of.componentApiId) out.push(...destructiveChanges(of.fields, nf.fields, `${field}.`));
    }
    return out;
}

export function routingChanges(oldSchema: Record<string, unknown> | null | undefined, newSchema: Record<string, unknown> | null | undefined): string[] {
    return ROUTING_KEYS.filter((k) => JSON.stringify(oldSchema?.[k] ?? null) !== JSON.stringify(newSchema?.[k] ?? null));
}
