/**
 * Elements: premade templates (steps, cost, table, calculator) that an author drops into
 * rich text. One definition per template serves the Studio form and preview, publish validation
 * and public delivery.
 *
 * Stored form (what the editor saves, and what Studio and agent reads return):
 *   <div data-flow-element="steps" data-values="{...escaped JSON...}"></div>
 * Public delivery expands it with `expandElements`:
 *   <div class="flow-el flow-el--steps" data-flow-element="steps">...</div>
 * Pure string work, no DOM.
 */
import { esc, safeJson } from "./util";
import { steps } from "./steps";
import { cost } from "./cost";
import { table } from "./table";
import { calculator } from "./calculator";

export { elementsCss, BASE_CSS, DEFAULT_THEME_CSS } from "./css";
export { ELEMENTS_JS } from "./js";
export { safeJson } from "./util";
export * from "./theme";
export type { StepsValues } from "./steps";

export type ElementField =
    | { key: string; label: string; type: "text"; long?: boolean; hint?: string }
    | { key: string; label: string; type: "number"; hint?: string }
    | { key: string; label: string; type: "choice"; options: { value: string; label: string }[] }
    | { key: string; label: string; type: "rows"; itemLabel: string; min: number; max: number; columns: { key: string; label: string; long?: boolean }[] };

export interface ElementTemplate {
    id: string;
    name: string;
    description: string;
    /** A template not built yet is listed as "coming soon". */
    enabled: boolean;
    fields: ElementField[];
    defaults(): Record<string, unknown>;
    /** Plain messages, one per problem. Empty means valid. */
    validate(values: unknown): string[];
    /** The inside of the element, every value escaped. */
    render(values: unknown): string;
}

export const ELEMENT_TEMPLATES: ElementTemplate[] = [steps, cost, table, calculator];

export const elementTemplate = (id: string): ElementTemplate | undefined => ELEMENT_TEMPLATES.find((t) => t.id === id && t.enabled);

/** The stored form of one element. */
export const elementHtml = (template: string, values: unknown): string =>
    `<div data-flow-element="${esc(template)}" data-values="${esc(safeJson(values ?? {}))}"></div>`;

const STORED = /<div\b[^>]*?\sdata-flow-element\s*=\s*(?:"([\w-]*)"|'([\w-]*)')[^>]*>\s*<\/div>/gi;
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Pull the template and values out of one stored element tag. Values is null when the JSON cannot be read. */
function readStored(tag: string, template: string): { template: string; values: unknown } {
    const m = /\sdata-values\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    let values: unknown = null;
    try {
        values = m ? JSON.parse(unescape(m[1] ?? m[2] ?? "")) : {};
    } catch {
        values = null;
    }
    return { template, values };
}

/** Each stored element in a rich text value, in order. */
export function storedElements(html: string): { template: string; values: unknown }[] {
    if (!html || !html.includes("data-flow-element")) return [];
    return [...html.matchAll(STORED)].map((m) => readStored(m[0], m[1] ?? m[2] ?? ""));
}

/** One element as public HTML: the wrapper plus the template's markup. Empty for an unknown template. */
export function renderElement(template: string, values: unknown): string {
    const t = elementTemplate(template);
    return t ? `<div class="flow-el flow-el--${esc(t.id)}" data-flow-element="${esc(t.id)}">${t.render(values)}</div>` : "";
}

/** Public delivery: every stored element becomes finished, escaped HTML. Anything that cannot be read is dropped, never half shown. */
export function expandElements(html: string): string {
    if (!html || !html.includes("data-flow-element")) return html;
    return html.replace(STORED, (tag, a: string | undefined, b: string | undefined) => {
        const { template, values } = readStored(tag, a ?? b ?? "");
        return values === null ? "" : renderElement(template, values);
    });
}

/** Problems in the elements of one rich text value, each tagged with its template name. */
export function elementProblems(html: string): string[] {
    const out: string[] = [];
    for (const e of storedElements(html)) {
        const t = elementTemplate(e.template);
        if (!t) out.push(`An element of an unknown kind (“${e.template}”) cannot be shown. Remove it.`);
        else if (e.values === null) out.push(`The ${t.name} element could not be read. Remove it and insert it again.`);
        else for (const m of t.validate(e.values)) out.push(`${t.name}: ${m}`);
    }
    return out;
}

const EXPANDED = /<[a-z][^>]*\sclass\s*=\s*(?:"[^"]*\bflow-el\b[^"]*"|'[^']*\bflow-el\b[^']*')[^>]*>/gi;

/** True when the html holds delivered element markup (a `flow-el` class tag with no `data-values`). Only the stored form may be saved. */
export const hasExpandedElements = (html: string): boolean =>
    !!html && html.includes("flow-el") && (html.match(EXPANDED) ?? []).some((tag) => !/\sdata-values\s*=/i.test(tag));
