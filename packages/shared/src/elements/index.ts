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

export { elementsCss, BASE_CSS, CLASSIC_CSS, MODERN_CSS, DEFAULT_THEME_CSS } from "./css";
export { ELEMENTS_JS } from "./js";
export { safeJson } from "./util";
export { flowCalc, flowBind } from "./calc-core";
export { blankConfig, normConfig, pruneConfig, renderBuilder, validateConfig, MAX_FIELDS, MAX_OPTIONS, MAX_PLAN_OPTIONS, MAX_ADVICE } from "./builder";
export type { BuilderConfig, CalcField, CalcOption, CalcPlan, NumberField, ChoiceField, AddonField, PlanOption, Pair, ShowIf } from "./builder";
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

/** The stored form of one element. With `templateId` it is linked to a workspace template, and `values` is only the fallback snapshot. */
export const elementHtml = (template: string, values: unknown, templateId?: string): string =>
    `<div data-flow-element="${esc(template)}"${templateId ? ` data-template="${esc(templateId)}"` : ""} data-values="${esc(safeJson(values ?? {}))}"></div>`;

const STORED = /<div\b[^>]*?\sdata-flow-element\s*=\s*(?:"([\w-]*)"|'([\w-]*)')[^>]*>\s*<\/div>/gi;
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The template id a stored element is linked to, if any. */
const linkOf = (tag: string): string | undefined => /\sdata-template\s*=\s*(?:"([\w-]+)"|'([\w-]+)')/i.exec(tag)?.slice(1).find(Boolean);

/** Pull the template and values out of one stored element tag. Values is null when the JSON cannot be read. */
function readStored(tag: string, template: string): { template: string; values: unknown; templateId?: string } {
    const m = /\sdata-values\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    let values: unknown = null;
    try {
        values = m ? JSON.parse(unescape(m[1] ?? m[2] ?? "")) : {};
    } catch {
        values = null;
    }
    return { template, values, templateId: linkOf(tag) };
}

/** Each stored element in a rich text value, in order. */
export function storedElements(html: string): { template: string; values: unknown; templateId?: string }[] {
    if (!html || !html.includes("data-flow-element")) return [];
    return [...html.matchAll(STORED)].map((m) => readStored(m[0], m[1] ?? m[2] ?? ""));
}

/** One element as public HTML: the wrapper plus the template's markup. Empty for an unknown template. */
export function renderElement(template: string, values: unknown): string {
    const t = elementTemplate(template);
    return t ? `<div class="flow-el flow-el--${esc(t.id)}" data-flow-element="${esc(t.id)}">${t.render(values)}</div>` : "";
}

/** The ids of the workspace templates a rich text value links to. */
export const linkedTemplateIds = (html: string): string[] => [...new Set(storedElements(html).flatMap((e) => (e.templateId ? [e.templateId] : [])))];

/**
 * Public delivery: every stored element becomes finished, escaped HTML. Anything that cannot be read is dropped, never half shown.
 * A linked element shows its template's current values from `templates` (id to values); with no such template it shows its own snapshot.
 */
export function expandElements(html: string, templates?: ReadonlyMap<string, unknown> | Record<string, unknown>): string {
    if (!html || !html.includes("data-flow-element")) return html;
    const current = (id: string): unknown => (templates instanceof Map ? templates.get(id) : templates ? Object.hasOwn(templates, id) ? (templates as Record<string, unknown>)[id] : undefined : undefined);
    return html.replace(STORED, (tag, a: string | undefined, b: string | undefined) => {
        const { template, values, templateId } = readStored(tag, a ?? b ?? "");
        const live = templateId ? current(templateId) : undefined;
        const use = live !== undefined ? live : values;
        return use === null ? "" : renderElement(template, use);
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
