/**
 * Content rules: a small, closed set of formatting rules, set per content type in
 * `schema.contentRules` and keyed by field path. The same code runs in the API (where
 * it is the lock on publishing) and in the studio (where it shows the same messages
 * inline). Pure string work, no DOM.
 *
 * Paths use the stored field names, with `[]` for a repeatable list:
 *   "servicePageContent.sections[].content"
 */
import { splitBlocks } from "./html";
import { cityProblem, labelParagraph, linksIn, wordCount } from "./content-rules-checks";
import { addCounts, emptyCounts, tidyRich, tidyText, type TidyCounts } from "./tidy";

export type RuleLevel = "block" | "warn";

export const RULE_KEYS = [
    "allow",
    "maxLists",
    "listMustBeLast",
    "notEmpty",
    "noTrailingColon",
    "titleCase",
    "startsWithVerb",
    "minItems",
    "maxItems",
    "exactItems",
    "noEmptyItems",
    "maxParagraphs",
    "noQuestionMark",
    "lastItemIs",
    "uniqueItems",
    "startsWith",
    "endsWith",
    "containsAny",
    "notContains",
    "pattern",
    "minWords",
    "maxWords",
    "minChars",
    "maxChars",
    "minParagraphs",
    "minLists",
    "minListItems",
    "maxListItems",
    "noLabelParagraphs",
    "noNestedLists",
    "noOrderedLists",
    "noLinks",
    "linksRelative",
    "mustBeEmpty",
    "plainText",
    "cityTokens",
    "noBraces",
    "sameAs",
    "containedIn",
    "onlyKeys",
    "itemRules",
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

/** A rule is a bare value (true, a number, a list) or the long form with a level, guide anchor and message. */
export type RuleValue = boolean | number | string | string[] | ItemRuleSpec[];

/** Rules for particular items of a repeatable list: `index` is a 1-based item number, or first, last, notLast, all. `rules` maps a sub-field name to its rules. */
export type ItemRuleSpec = { index: number | "first" | "last" | "notLast" | "all"; rules: Record<string, FieldRules> };

export type RuleDef = RuleValue | { value?: RuleValue; level?: RuleLevel; guideAnchor?: string; message?: string; [extra: string]: unknown };

export type ContentRules = {
    version?: number;
    guide?: { label?: string; url: string };
    /** Quietly tidy accidental formatting on save and in the editor. On unless false. */
    tidy?: boolean;
    fields: Record<string, FieldRules>;
};

/** The rules of one field. `guideAnchor` here is the default anchor for all of the field's rules. */
export type FieldRules = Partial<Record<RuleKey, RuleDef>> & {
    guideAnchor?: string;
    /** A second set of the same rules for the same field, each at "warn" unless it says otherwise. It lets a field have a hard minimum and a softer target, which one rule key cannot. */
    soft?: Partial<Record<RuleKey, RuleDef>>;
};

/** What the engine needs to know about a field. Compatible with the API and studio field types. */
export type RuleField = {
    name: string;
    type: string;
    label?: string;
    description?: string;
    repeatable?: boolean;
    fields?: RuleField[];
    componentApiId?: string;
    mappedByField?: string;
};
export type RuleComponents = Record<string, RuleField[]>;

export type RuleIssue = {
    /** Data path in the API's form: `servicePageContent.sections[1].content`. */
    path: string;
    /** Rule path as configured: `servicePageContent.sections[].content`. */
    pattern: string;
    /** Where it is, in the labels the editor sees: `Article sections #2 › Content`. */
    location: string;
    rule: RuleKey;
    level: RuleLevel;
    /** What is wrong and what to do, in plain words. */
    message: string;
    /** The whole sentence as the API sends it: location, message and the guide. */
    text: string;
    /** The field's own helper text, shown as a small grey line. */
    fieldHelp?: string;
    guide?: { label: string; url: string };
};

// ─── Reading entry data the way validation does ─────────────────────────────

/** Candidate data keys for a field: the human name, camelCase, snake_case, the first word. */
export function candidateKeys(name: string): string[] {
    const raw = name.trim();
    // Split camel humps too, so a camelCase field name ("coverImage") still resolves
    // data keyed in any earlier convention ("Cover image", "cover_image", "cover").
    const lower = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    const parts = lower.split(/[\s_-]+/).filter(Boolean);
    const camel = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
    const snake = parts.join("_");
    const first = parts[0];
    return [...new Set([raw, raw.toLowerCase(), lower, camel, snake, first].filter(Boolean))];
}

/** The key a field's value is actually stored under in `data`, if any. */
export function storedKey(data: Record<string, unknown>, name: string): string | undefined {
    for (const k of candidateKeys(name)) {
        if (k in data && data[k] !== undefined && data[k] !== null && data[k] !== "") return k;
    }
    return undefined;
}

export function valueFor(data: Record<string, unknown>, name: string): unknown {
    const k = storedKey(data, name);
    return k === undefined ? undefined : data[k];
}

/** "ctaContent" / "service_categories" → "Cta Content" / "Service Categories". */
export const humanizeName = (input: string): string =>
    String(input ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[^A-Za-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");

const labelOf = (f: { label?: string; name: string }) => f.label?.trim() || humanizeName(f.name);

// ─── Reading rich text ──────────────────────────────────────────────────────

type BlockKind = "paragraph" | "heading" | "bulletList" | "orderedList" | "taskList" | "blockquote" | "table" | "image" | "codeBlock" | "rule" | "other";
type Block = { kind: BlockKind; text: string; html: string };

const decode = (s: string) =>
    s
        .replace(/<\/(?:p|li|h[1-6]|div|blockquote|tr|td|th)>|<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;|&#160;|&#xa0;|\u00A0/gi, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

/** The top-level blocks of an HTML value. Malformed markup never throws: whatever is not understood is "other". */
function blocksOf(html: string): Block[] {
    return splitBlocks(html).map((b) => {
        const tag = /^<([a-zA-Z][\w-]*)/.exec(b)?.[1]?.toLowerCase();
        const text = decode(b);
        if (!tag) return { kind: "paragraph", text, html: b };
        if (tag === "p") return { kind: !text && /<img\b/i.test(b) ? "image" : "paragraph", text, html: b };
        if (/^h[1-6]$/.test(tag)) return { kind: "heading", text, html: b };
        if (tag === "ul") return { kind: /data-type=["']taskList/i.test(b) ? "taskList" : "bulletList", text, html: b };
        if (tag === "ol") return { kind: "orderedList", text, html: b };
        if (tag === "blockquote") return { kind: "blockquote", text, html: b };
        if (tag === "table") return { kind: "table", text, html: b };
        if (tag === "img") return { kind: "image", text, html: b };
        if (tag === "pre") return { kind: "codeBlock", text, html: b };
        if (tag === "hr") return { kind: "rule", text, html: b };
        return { kind: "other", text, html: b };
    });
}

const isList = (b: Block) => b.kind === "bulletList" || b.kind === "orderedList" || b.kind === "taskList";

/** Whether a rich text value holds anything a reader would see. Empty paragraphs do not count. */
export function isRichEmpty(html: string): boolean {
    return !blocksOf(html).some((b) => b.text || b.kind === "image" || b.kind === "table" || b.kind === "rule");
}

const MARKS: { token: string; name: string; re: RegExp }[] = [
    { token: "bold", name: "bold text", re: /<(?:strong|b)\b/i },
    { token: "italic", name: "italic text", re: /<(?:em|i)\b/i },
    { token: "link", name: "a link", re: /<a\b/i },
    { token: "underline", name: "underlined text", re: /<u\b/i },
    { token: "strike", name: "crossed-out text", re: /<(?:s|strike|del)\b/i },
    { token: "code", name: "code formatting", re: /<code\b/i },
    { token: "highlight", name: "highlighted text", re: /<mark\b/i },
    { token: "subscript", name: "subscript text", re: /<sub\b/i },
    { token: "superscript", name: "superscript text", re: /<sup\b/i },
];

// ─── Title case and action words ────────────────────────────────────────────

const MINOR = new Set(["a", "an", "the", "and", "or", "but", "nor", "for", "of", "to", "in", "on", "at", "by", "vs", "with", "from", "as", "per", "into", "than", "via"]);

/** Heading words that start lower case where they should not, with the suggested fix. Null when it reads fine. */
export function titleCaseProblem(text: string): string | null {
    const words = text.split(/\s+/).filter(Boolean);
    let bad = false;
    const fixed = words.map((w, i) => {
        const m = /^([^A-Za-z0-9]*)([A-Za-z])(.*)$/.exec(w);
        if (!m) return w;
        const [, pre, first, rest] = m;
        if (first === first.toUpperCase()) return w;
        if (i > 0 && MINOR.has(`${first}${rest}`.replace(/[^A-Za-z]/g, "").toLowerCase())) return w;
        // Mixed case inside the word (iPhone, eBay) is a brand, leave it.
        if (/[A-Z]/.test(rest)) return w;
        bad = true;
        return `${pre}${first.toUpperCase()}${rest}`;
    });
    return bad ? fixed.join(" ") : null;
}

const ACTION_WORDS = new Set(
    (
        "add answer arrange ask avoid begin book bring call change check choose clean clear close collect compare confirm connect contact " +
        "continue cover create decide describe determine discuss document dry email enter explain file find fix follow gather get give go " +
        "hire identify inspect keep learn let list look make measure monitor move note open order pick plan prepare protect provide " +
        "read record remove repair replace report request research reserve respond review save schedule see seek send set share shut " +
        "speak start stay stop submit switch take talk tell test track trust turn understand upload use verify visit wait watch work write"
    ).split(" "),
);

export const startsWithAction = (text: string): boolean => {
    const first = text.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "").toLowerCase() ?? "";
    return ACTION_WORDS.has(first);
};

// ─── Messages ───────────────────────────────────────────────────────────────

type Ctx = { text?: string; n?: number; need?: number; diff?: number; suggestion?: string; thing?: string; item?: number; mark?: string; list?: string; other?: string };

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);
const said = (l: string[]) => (l.length < 2 ? `“${l[0] ?? ""}”` : `${l.slice(0, -1).map((x) => `“${x}”`).join(", ")} or “${l[l.length - 1]}”`);

const M: Record<string, (c: Ctx) => string> = {
    listNotAllowed: () => "This box has a bullet list, and lists are not used here. Rewrite the points as one or two normal sentences, or move the list into an article section.",
    headingNotAllowed: (c) =>
        `This box has a heading inside the text (“${c.text}”). Headings are not used here. If it is a new topic, add a new article section and put it in that section's Heading box. If it is a question and answer, move it to the FAQ.`,
    blockNotAllowed: (c) => `This box has a ${c.thing}, which is not used here. Remove it, or say the same thing in a normal sentence.`,
    numberedNotAllowed: () => "This box has a numbered list. Use a bullet list here. Numbered steps belong in the action steps block.",
    markNotAllowed: (c) => `This box has ${c.mark}, which is not used here. Select the text and remove the formatting.`,
    maxLists: (c) => `This section has ${c.n} bullet lists. Keep one list per section. Join them into one list, or move the second list into a new section with its own heading.`,
    listMustBeLast: () => "This paragraph comes after the bullet list. Move it above the list, or into the next section.",
    notEmptyRich: () => "This box is empty. Write the text, or remove this section if it is not needed.",
    notEmptyHeading: () => "This section has no heading. Add a short heading, or remove the section.",
    noEmptyItems: (c) => `Section #${c.item} is empty: it has no heading and no text. Delete it using the bin icon on the section.`,
    noTrailingColon: (c) =>
        `This heading ends with a colon (“${c.text}”). Remove the colon. If it introduces a list, make it a bold line inside the text above the list instead of a heading.`,
    titleCase: (c) => `This heading's capital letters look uneven (“${c.text}”). Suggested: “${c.suggestion}”. Change it, or leave it if a brand name needs it this way.`,
    exactItems: (c) => `This block needs exactly ${c.need} items and has ${c.n}. ${(c.diff ?? 0) > 0 ? `Add ${c.diff}` : `Remove ${Math.abs(c.diff ?? 0)}`} so there are ${c.need}.`,
    maxParagraphs: (c) => `This box has ${c.n} paragraphs, and at most ${c.need} ${c.need === 1 ? "is" : "are"} used here. Join them into one, or move the extra text into the next section.`,
    noQuestionMark: (c) => `This heading ends with a question mark (“${c.text}”). Write it as a statement or an action instead, and take the question mark off.`,
    lastWrong: (c) => `The last one must be headed “${c.text}”${c.suggestion ? `, and it is “${c.suggestion}”` : ""}. Move it to the end, or change the heading.`,
    lastOnly: (c) => `“${c.text}” can only be the last one. Move it to the end, or change its heading.`,
    unique: (c) => `Two ${c.thing} have the same heading (“${c.text}”). Give each one its own heading, or merge them.`,
    startsWithVerb: (c) => `${c.item ? `Step #${c.item}` : "This"} reads like a topic, not an action (“${c.text}”). Start it with an action word, for example “Check...”, “Call...”, “Turn off...”.`,
    startsWith: (c) => `This should start with ${c.list} (it starts with “${c.text}”). Rewrite the beginning.`,
    endsWith: (c) => `This should end with ${c.list}. Add it at the end, or reword.`,
    containsAny: (c) => `This should mention ${c.list}. Add it, or reword so it does.`,
    notContains: (c) => `This should not contain ${c.list}. Take it out.`,
    pattern: () => "This does not follow the pattern the other pages use. Compare it with a page that is already live.",
    minWords: (c) => `This has ${c.n} words. Aim for at least ${c.need}.`,
    maxWords: (c) => `This has ${c.n} words. Keep it to ${c.need} or fewer.`,
    minChars: (c) => `This is ${c.n} characters. Aim for at least ${c.need}.`,
    maxChars: (c) => `This is ${c.n} characters. Keep it to ${c.need} or fewer.`,
    minParagraphs: (c) => `This box has ${c.n} paragraphs and needs at least ${c.need}. Add one.`,
    minLists: (c) => `This box has ${c.n} bullet lists and needs at least ${c.need}. Add a list.`,
    minListItems: (c) => `A bullet list here has ${c.n} points and needs at least ${c.need}. Add more points.`,
    maxListItems: (c) => `A bullet list here has ${c.n} points and can have at most ${c.need}. Trim it, or split it.`,
    noLabelParagraphs: (c) => `This paragraph is only a label (“${c.text}”). Labels are not used here. Write it as part of a normal sentence, or remove it.`,
    noLinksList: (c) => `A bullet point has a link in it (“${c.text}”). Links inside bullet points do not work on the page: the text shows but the link is removed. Move the link into the paragraph above the list.`,
    noLinksAll: (c) => `This box has a link in it (“${c.text}”). Links are not used here. Remove the link.`,
    noNestedLists: () => "This box has a list inside a list. Use one plain bullet list.",
    noOrderedLists: () => "This box has a numbered list. Use one plain bullet list.",
    linksRelative: (c) => `This link uses a full web address (“${c.text}”). For pages on our own site use the short form that starts with a slash, for example /water-damage-restoration.`,
    mustBeEmpty: () => "This box should stay empty. Clear it.",
    plainText: (c) => `This box has formatting code in it (“${c.text}”). It is a plain text box, so the code would show on the page. Retype it as plain text.`,
    cityUnknown: (c) => `The city placeholder ${c.text} is not one the site knows, so it would vanish from the page. Use {City:Near You} or {City, STATEABV:Near You}.`,
    cityNoFallback: (c) => `The city placeholder ${c.text} has no fallback, so on the main service page nothing shows in its place. Add the words to show when there is no city, for example {City:Near You}.`,
    cityComma: (c) => `The fallback inside ${c.text} has a comma or colon, which cuts it short on the page. Reword the fallback without them.`,
    cityCount: (c) => `${c.text} only works in the Hero subheadline. Anywhere else it disappears. Remove it here.`,
    cityBrace: () => "A curly bracket is not closed, so the placeholder would show on the page as typed. Close it with }.",
    noBraces: (c) => `City placeholders do not work here and would show as typed (${c.text}). Write the text without curly brackets.`,
    sameAs: (c) => `This should be exactly the same as ${c.other}.`,
    containedIn: (c) => `The words “${c.text}” should also appear in ${c.other}.`,
    onlyKeys: (c) => `This row also holds hidden fields (${c.text}) that the editor does not show, and the page would show them as an extra entry. Delete this row with the bin icon and add it again.`,
    emptyBlock: () => "This block is empty. Fill it in.",
    minItems: (c) => `This block needs at least ${c.need} items and has ${c.n}. Add ${c.diff} more.`,
    maxItems: (c) => `This block can have at most ${c.need} items and has ${c.n}. Remove ${c.diff}, or merge them.`,
};

const THING: Partial<Record<BlockKind, string>> = { table: "table", image: "picture", blockquote: "quote", codeBlock: "code block", rule: "divider line", taskList: "checklist", other: "block that is not plain text" };

/** A custom message from the config, with {text} {n} {need} {diff} {item} {suggestion} {list} {other} filled in. */
const fill = (tpl: string, c: Ctx) =>
    tpl.replace(/\{(text|n|need|diff|item|suggestion|thing|list|other)\}/g, (_m, k: keyof Ctx) => String(c[k] ?? ""));

// ─── The engine ─────────────────────────────────────────────────────────────

type Norm = { value: RuleValue; level: RuleLevel; anchor?: string; message?: string; extra: Record<string, unknown> };

function norm(key: RuleKey, def: RuleDef | undefined, fieldAnchor?: string): Norm | null {
    if (def === undefined || def === null || def === false) return null;
    const warnByDefault = key === "titleCase" || key === "startsWithVerb";
    const base: Norm = { value: true, level: warnByDefault ? "warn" : "block", anchor: fieldAnchor, extra: {} };
    if (typeof def === "object" && !Array.isArray(def)) {
        const { value, level, guideAnchor, message, ...extra } = def;
        const v = (value ?? true) as RuleValue;
        if (v === false) return null;
        return { value: v, level: level === "warn" || level === "block" ? level : base.level, anchor: guideAnchor ?? fieldAnchor, message: typeof message === "string" ? message : undefined, extra };
    }
    return { ...base, value: def };
}

/** The rule path for a data path: indexes become `[]`. */
export const patternOf = (path: string) => path.replace(/\[\d+\]/g, "[]");

type Walk = {
    rules: ContentRules;
    components: RuleComponents;
    out: RuleIssue[];
    /** Items flagged empty, so their inner fields are not reported a second time. */
    emptied: Set<string>;
    /** The whole entry, for rules that compare one field with another. */
    root: Record<string, unknown>;
};

const readPath = (root: Record<string, unknown>, path: string): unknown => {
    let cur: unknown = root;
    for (const seg of path.split(".")) {
        if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;
        cur = valueFor(cur as Record<string, unknown>, seg);
    }
    return cur;
};

const subFields = (f: RuleField, comps: RuleComponents): RuleField[] => (f.componentApiId && comps[f.componentApiId] ? comps[f.componentApiId] : f.fields ?? []);

function push(w: Walk, f: RuleField, path: string, pattern: string, where: string[], key: RuleKey, n: Norm, built: string, ctx: Ctx) {
    const message = n.message ? fill(n.message, ctx) : built;
    const g = w.rules.guide;
    const guide = g?.url ? { label: g.label?.trim() || "Guide", url: `${g.url}${n.anchor ?? ""}` } : undefined;
    const location = where.join(" › ");
    w.out.push({
        path,
        pattern,
        location,
        rule: key,
        level: n.level,
        message,
        text: `${location}: ${message}${guide ? ` See: ${guide.label}.` : ""}`,
        fieldHelp: f.description?.trim() || undefined,
        guide,
    });
}

function visit(w: Walk, fields: RuleField[], data: Record<string, unknown>, prefix: string, pPrefix: string, where: string[], topLevel: boolean) {
    for (const f of fields) {
        if (!f?.name || !f.type) continue;
        if (f.type === "Reference" && f.mappedByField) continue;
        if (f.type === "Slug" && topLevel) continue;
        const path = prefix ? `${prefix}.${f.name}` : f.name;
        const pattern = pPrefix ? `${pPrefix}.${f.name}` : f.name;
        const label = labelOf(f);
        const rules = w.rules.fields[pattern] ?? {};
        const here = [...where, label];
        const value = valueFor(data, f.name);
        const get = (k: RuleKey) => norm(k, rules[k], rules.guideAnchor);

        if (f.type === "Component") {
            const sub = subFields(f, w.components);
            const items: unknown[] = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
            const n = items.length;
            countRules(w, f, path, pattern, here, n, get);
            const repeatable = !!f.repeatable || Array.isArray(value);
            const at = (i: number) => (repeatable ? { path: `${path}[${i}]`, where: [...where, `${label} #${i + 1}`] } : { path, where: here });
            const itemText = (it: unknown, name: string) => decode(String((it && typeof it === "object" ? valueFor(it as Record<string, unknown>, name) : "") ?? ""));
            const ne = get("notEmpty");
            if (ne && (n === 0 || items.every((it) => !it || typeof it !== "object" || Object.values(it as object).every((v) => isEmptyValue(v))))) push(w, f, path, pattern, here, "notEmpty", ne, M.emptyBlock({}), {});
            const last = get("lastItemIs");
            if (last && Array.isArray(last.value) && last.value.length >= 2 && n > 0) {
                const [sub1, want] = last.value as string[];
                const present = items.some((it) => itemText(it, sub1) === want);
                // "ifPresent": only when the item exists at all (a page may leave it out).
                if (last.value[2] !== "ifPresent" || present) {
                    if (itemText(items[n - 1], sub1) !== want) push(w, f, at(n - 1).path, pattern, at(n - 1).where, "lastItemIs", last, M.lastWrong({ text: want, suggestion: itemText(items[n - 1], sub1) }), { text: want, suggestion: itemText(items[n - 1], sub1) });
                    items.slice(0, -1).forEach((it, i) => {
                        if (itemText(it, sub1) === want) push(w, f, at(i).path, pattern, at(i).where, "lastItemIs", last, M.lastOnly({ text: want }), { text: want });
                    });
                }
            }
            const uniq = get("uniqueItems");
            if (uniq && Array.isArray(uniq.value) && uniq.value[0]) {
                const sub1 = uniq.value[0] as string;
                const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
                const seen = new Map<string, number>();
                // Headings elsewhere on the page that these may not repeat (`also`: data paths).
                for (const other of listOf(uniq.extra.also)) {
                    const v = readPath(w.root, other);
                    if (typeof v === "string" && key(decode(v))) seen.set(key(decode(v)), -1);
                }
                items.forEach((it, i) => {
                    const text = itemText(it, sub1);
                    if (!key(text)) return;
                    if (seen.has(key(text))) push(w, f, `${path}[${i}]`, pattern, [...where, `${label} #${i + 1}`], "uniqueItems", uniq, M.unique({ text, thing: label.toLowerCase() }), { text, thing: label.toLowerCase() });
                    else seen.set(key(text), i);
                });
            }
            const only = get("onlyKeys");
            if (only && Array.isArray(only.value)) {
                const ok = new Set(only.value as string[]);
                items.forEach((it, i) => {
                    if (!it || typeof it !== "object" || Array.isArray(it)) return;
                    const extra = Object.keys(it).filter((k) => !ok.has(k) && !k.startsWith("__"));
                    if (extra.length) push(w, f, at(i).path, pattern, at(i).where, "onlyKeys", only, M.onlyKeys({ text: extra.map((k) => `“${k}”`).join(", ") }), { text: extra.join(", ") });
                });
            }
            const empties = get("noEmptyItems");
            const listed = empties && Array.isArray(empties.value) ? (empties.value as string[]) : null;
            items.forEach((raw, i) => {
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
                const item = raw as Record<string, unknown>;
                const itemPath = at(i).path;
                const itemWhere = at(i).where;
                if (listed && listed.every((s) => isEmptyValue(valueFor(item, s)))) {
                    push(w, f, itemPath, pattern, itemWhere, "noEmptyItems", empties!, M.noEmptyItems({ item: i + 1 }), { item: i + 1 });
                    w.emptied.add(itemPath);
                }
                visit(w, sub, item, itemPath, repeatable ? `${pattern}[]` : pattern, repeatable ? itemWhere : where, false);
            });
            // Rules for particular items (the last section, step 2, every FAQ), checked as if each sub-field had its own rule.
            const ir = get("itemRules");
            if (ir && Array.isArray(ir.value)) {
                for (const spec of ir.value as ItemRuleSpec[]) {
                    const picks = items.map((_, i) => i).filter((i) => (spec.index === "all" ? true : spec.index === "first" ? i === 0 : spec.index === "last" ? i === n - 1 : spec.index === "notLast" ? i < n - 1 : i === Number(spec.index) - 1));
                    for (const i of picks) {
                        const raw = items[i];
                        const item = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
                        for (const [name, subRules] of Object.entries(spec.rules ?? {})) {
                            const sf = sub.find((s) => s.name === name);
                            if (!sf) continue;
                            const leafGet = (k: RuleKey) => norm(k, (subRules as FieldRules)[k], (subRules as FieldRules).guideAnchor ?? rules.guideAnchor);
                            leaf(w, sf, `${at(i).path}.${sf.name}`, `${pattern}${repeatable ? "[]" : ""}.${sf.name}`, [...at(i).where, labelOf(sf)], valueFor(item, name), leafGet);
                        }
                    }
                }
            }
            continue;
        }

        const leafHas = Object.keys(rules).length > 0;
        if (leafHas) leaf(w, f, path, pattern, here, value, get);
    }
}

/** Item-count rules, for a repeatable block or any list field (tags, references). */
function countRules(w: Walk, f: RuleField, path: string, pattern: string, where: string[], n: number, get: Get) {
    const exact = get("exactItems");
    const min = get("minItems");
    const max = get("maxItems");
    if (exact && typeof exact.value === "number" && n !== exact.value) push(w, f, path, pattern, where, "exactItems", exact, M.exactItems({ need: exact.value, n, diff: exact.value - n }), { need: exact.value, n, diff: Math.abs(exact.value - n) });
    if (min && typeof min.value === "number" && n < min.value) push(w, f, path, pattern, where, "minItems", min, M.minItems({ need: min.value, n, diff: min.value - n }), { need: min.value, n, diff: min.value - n });
    if (max && typeof max.value === "number" && n > max.value) push(w, f, path, pattern, where, "maxItems", max, M.maxItems({ need: max.value, n, diff: n - max.value }), { need: max.value, n, diff: n - max.value });
}

/** The rules of one value that is not a component: rich text, text, a list of ids, an image address. */
function leaf(w: Walk, f: RuleField, path: string, pattern: string, where: string[], value: unknown, get: Get) {
    if (f.type === "Rich text") return richRules(w, f, path, pattern, where, typeof value === "string" ? value : "", get);
    if (Array.isArray(value) || value === undefined) countRules(w, f, path, pattern, where, Array.isArray(value) ? value.length : 0, get);
    textRules(w, f, path, pattern, where, value, get);
}

const repeatableOf = (f: RuleField, value: unknown) => !!f.repeatable || Array.isArray(value);
void repeatableOf;

function isEmptyValue(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return isRichEmpty(v);
    if (Array.isArray(v)) return v.length === 0;
    return false;
}

type Get = (k: RuleKey) => Norm | null;

/** Rules that read the words of a value, whether it is plain text or rich text. `html` is the raw value. */
function wordRules(w: Walk, f: RuleField, path: string, pattern: string, where: string[], html: string, text: string, get: Get) {
    const say = (key: RuleKey, n: Norm, built: string, ctx: Ctx) => push(w, f, path, pattern, where, key, n, built, ctx);
    const low = text.toLowerCase();
    const sw = get("startsWith");
    if (sw && text) {
        const l = listOf(sw.value);
        if (l.length && !l.some((x) => low.startsWith(x.toLowerCase()))) say("startsWith", sw, M.startsWith({ list: said(l), text: text.split(/\s+/)[0] }), { list: said(l), text: text.split(/\s+/)[0] });
    }
    const ew = get("endsWith");
    if (ew && text) {
        const l = listOf(ew.value);
        if (l.length && !l.some((x) => low.endsWith(x.toLowerCase()))) say("endsWith", ew, M.endsWith({ list: said(l) }), { list: said(l), text });
    }
    const ca = get("containsAny");
    if (ca) {
        const l = listOf(ca.value);
        if (l.length && !l.some((x) => low.includes(x.toLowerCase()))) say("containsAny", ca, M.containsAny({ list: said(l) }), { list: said(l), text });
    }
    const nc = get("notContains");
    if (nc && text) {
        const hit = listOf(nc.value).filter((x) => low.includes(x.toLowerCase()));
        if (hit.length) say("notContains", nc, M.notContains({ list: said(hit) }), { list: said(hit), text });
    }
    const pat = get("pattern");
    if (pat && typeof pat.value === "string" && text) {
        let ok = true;
        try {
            ok = new RegExp(pat.value).test(text);
        } catch {
            ok = true; // a bad pattern in the config never blocks anyone
        }
        if (!ok) say("pattern", pat, M.pattern({}), { text });
    }
    const words = wordCount(text);
    const minW = get("minWords");
    const maxW = get("maxWords");
    if (text) {
        if (minW && typeof minW.value === "number" && words < minW.value) say("minWords", minW, M.minWords({ n: words, need: minW.value }), { n: words, need: minW.value });
        if (maxW && typeof maxW.value === "number" && words > maxW.value) say("maxWords", maxW, M.maxWords({ n: words, need: maxW.value }), { n: words, need: maxW.value });
    }
    const minC = get("minChars");
    const maxC = get("maxChars");
    if (text) {
        if (minC && typeof minC.value === "number" && text.length < minC.value) say("minChars", minC, M.minChars({ n: text.length, need: minC.value }), { n: text.length, need: minC.value });
        if (maxC && typeof maxC.value === "number" && text.length > maxC.value) say("maxChars", maxC, M.maxChars({ n: text.length, need: maxC.value }), { n: text.length, need: maxC.value });
    }
    const same = get("sameAs");
    if (same && typeof same.value === "string" && text) {
        const o = readPath(w.root, same.value);
        const ot = typeof o === "string" ? decode(o) : "";
        if (ot && ot !== text) say("sameAs", same, M.sameAs({ other: `“${ot}”` }), { text, other: `“${ot}”` });
    }
    const cin = get("containedIn");
    if (cin && typeof cin.value === "string" && text) {
        const o = readPath(w.root, cin.value);
        const ot = typeof o === "string" ? decode(o) : "";
        if (ot && !ot.toLowerCase().includes(low)) say("containedIn", cin, M.containedIn({ text, other: `“${ot}”` }), { text, other: `“${ot}”` });
    }
    // Links: inside bullet points, or anywhere; and the form of the address.
    const nl = get("noLinks");
    const rel = get("linksRelative");
    if ((nl || rel) && /<a\b/i.test(html)) {
        const links = linksIn(html);
        if (nl) {
            const inList = nl.value === "listItem" || (Array.isArray(nl.value) && (nl.value as unknown[]).includes("listItem"));
            const hit = links.find((l) => (inList ? l.inList : true));
            if (hit) say("noLinks", nl, inList ? M.noLinksList({ text: hit.text }) : M.noLinksAll({ text: hit.text }), { text: hit.text });
        }
        if (rel) {
            const bad = links.find((l) => l.href && !/^(\/(?!\/)|#|mailto:|tel:)/i.test(l.href));
            if (bad) say("linksRelative", rel, M.linksRelative({ text: bad.href }), { text: bad.href });
        }
    }
}

function richRules(w: Walk, f: RuleField, path: string, pattern: string, where: string[], html: string, get: Get) {
    const blocks = blocksOf(html);
    const empty = isRichEmpty(html);
    const ne = get("notEmpty");
    if (ne && empty) push(w, f, path, pattern, where, "notEmpty", ne, M.notEmptyRich({}), {});
    const be = get("mustBeEmpty");
    if (be && !empty) push(w, f, path, pattern, where, "mustBeEmpty", be, M.mustBeEmpty({}), {});

    const allow = get("allow");
    if (allow && Array.isArray(allow.value) && !empty) {
        const ok = new Set(allow.value as string[]);
        const say = (built: string, ctx: Ctx = {}) => push(w, f, path, pattern, where, "allow", allow, built, ctx);
        const heading = blocks.find((b) => b.kind === "heading");
        if (heading && !ok.has("heading")) say(M.headingNotAllowed({ text: heading.text }), { text: heading.text });
        if (blocks.some((b) => b.kind === "bulletList") && !ok.has("bulletList")) say(M.listNotAllowed({}));
        if (blocks.some((b) => b.kind === "orderedList") && !ok.has("orderedList")) say(ok.has("bulletList") ? M.numberedNotAllowed({}) : M.listNotAllowed({}));
        for (const kind of ["taskList", "table", "image", "blockquote", "codeBlock", "rule", "other"] as const) {
            const hit = blocks.find((b) => b.kind === kind);
            // A divider or an unknown tag counts only when the config does not name it.
            if (hit && !ok.has(kind)) say(M.blockNotAllowed({ thing: THING[kind] }), { thing: THING[kind] });
        }
        for (const m of MARKS) if (!ok.has(m.token) && m.re.test(html)) say(M.markNotAllowed({ mark: m.name }), { text: m.name });
    }

    const paras = blocks.filter((b) => b.kind === "paragraph" && b.text).length;
    const mp = get("maxParagraphs");
    if (mp && typeof mp.value === "number" && paras > mp.value) push(w, f, path, pattern, where, "maxParagraphs", mp, M.maxParagraphs({ n: paras, need: mp.value }), { n: paras, need: mp.value });
    const minP = get("minParagraphs");
    if (minP && typeof minP.value === "number" && !empty && paras < minP.value) push(w, f, path, pattern, where, "minParagraphs", minP, M.minParagraphs({ n: paras, need: minP.value }), { n: paras, need: minP.value });

    const max = get("maxLists");
    const lists = blocks.filter(isList).length;
    if (max && typeof max.value === "number" && lists > max.value) push(w, f, path, pattern, where, "maxLists", max, M.maxLists({ n: lists }), { n: lists });
    const minL = get("minLists");
    if (minL && typeof minL.value === "number" && lists < minL.value) push(w, f, path, pattern, where, "minLists", minL, M.minLists({ n: lists, need: minL.value }), { n: lists, need: minL.value });

    const last = get("listMustBeLast");
    if (last) {
        const at = blocks.map(isList).lastIndexOf(true);
        if (at >= 0 && blocks.slice(at + 1).some((b) => b.text || b.kind === "image" || b.kind === "table")) push(w, f, path, pattern, where, "listMustBeLast", last, M.listMustBeLast({}), {});
    }

    const minLi = get("minListItems");
    const maxLi = get("maxListItems");
    if (minLi || maxLi) {
        for (const b of blocks.filter(isList)) {
            const n = (b.html.match(/<li\b/gi) ?? []).length;
            if (minLi && typeof minLi.value === "number" && n < minLi.value) push(w, f, path, pattern, where, "minListItems", minLi, M.minListItems({ n, need: minLi.value }), { n, need: minLi.value });
            else if (maxLi && typeof maxLi.value === "number" && n > maxLi.value) push(w, f, path, pattern, where, "maxListItems", maxLi, M.maxListItems({ n, need: maxLi.value }), { n, need: maxLi.value });
        }
    }
    const nest = get("noNestedLists");
    if (nest && blocks.some((b) => isList(b) && /<li\b[^>]*>(?:(?!<\/li>)[\s\S])*<(?:ul|ol)\b/i.test(b.html))) push(w, f, path, pattern, where, "noNestedLists", nest, M.noNestedLists({}), {});
    const noOl = get("noOrderedLists");
    if (noOl && blocks.some((b) => b.kind === "orderedList")) push(w, f, path, pattern, where, "noOrderedLists", noOl, M.noOrderedLists({}), {});
    const lab = get("noLabelParagraphs");
    if (lab && !empty) {
        const kinds = Array.isArray(lab.value) ? { bold: (lab.value as unknown[]).includes("bold"), colon: (lab.value as unknown[]).includes("colon") } : undefined;
        const hit = labelParagraph(blocks.filter((b) => b.kind === "paragraph").map((b) => b.html), kinds);
        if (hit) push(w, f, path, pattern, where, "noLabelParagraphs", lab, M.noLabelParagraphs({ text: hit }), { text: hit });
    }
    wordRules(w, f, path, pattern, where, html, decode(html), get);
}

function textRules(w: Walk, f: RuleField, path: string, pattern: string, where: string[], value: unknown, get: Get) {
    const raw = typeof value === "string" ? value : "";
    const text = decode(raw);
    const present = typeof value === "string" ? !!text : !(value === undefined || value === null || (Array.isArray(value) && value.length === 0));
    const ne = get("notEmpty");
    const headingLike = /heading|title|header|headline/i.test(f.name);
    if (ne && !present) push(w, f, path, pattern, where, "notEmpty", ne, headingLike ? M.notEmptyHeading({}) : M.notEmptyRich({}), {});
    const be = get("mustBeEmpty");
    if (be && present) push(w, f, path, pattern, where, "mustBeEmpty", be, M.mustBeEmpty({}), {});
    if (!text) return;
    const item = /\[(\d+)\]/.exec(path.split(".").slice(-2, -1)[0] ?? "") ?? /\[(\d+)\]/.exec(path);
    const itemNo = item ? Number(item[1]) + 1 : undefined;
    const colon = get("noTrailingColon");
    if (colon && /[:\uFF1A]$/.test(text)) push(w, f, path, pattern, where, "noTrailingColon", colon, M.noTrailingColon({ text }), { text });
    const qm = get("noQuestionMark");
    if (qm && /\?$/.test(text)) push(w, f, path, pattern, where, "noQuestionMark", qm, M.noQuestionMark({ text }), { text });
    const tc = get("titleCase");
    if (tc) {
        const fix = titleCaseProblem(text);
        if (fix) push(w, f, path, pattern, where, "titleCase", tc, M.titleCase({ text, suggestion: fix }), { text, suggestion: fix });
    }
    const sv = get("startsWithVerb");
    if (sv && !startsWithAction(text)) push(w, f, path, pattern, where, "startsWithVerb", sv, M.startsWithVerb({ text, item: itemNo }), { text, item: itemNo });
    const pt = get("plainText");
    if (pt) {
        const tag = /<\/?[a-z][^>]*>/i.exec(raw);
        if (tag) push(w, f, path, pattern, where, "plainText", pt, M.plainText({ text: tag[0] }), { text: tag[0] });
    }
    const ct = get("cityTokens");
    if (ct) {
        const prob = cityProblem(raw, ct.value === "allowCount");
        if (prob) {
            const built = { unknown: M.cityUnknown, nofallback: M.cityNoFallback, comma: M.cityComma, count: M.cityCount, brace: M.cityBrace }[prob.kind]({ text: prob.token });
            push(w, f, path, pattern, where, "cityTokens", ct, built, { text: prob.token });
        }
    }
    const nb = get("noBraces");
    if (nb) {
        const tok = /\{[^}]*\}?/.exec(raw);
        if (tok) push(w, f, path, pattern, where, "noBraces", nb, M.noBraces({ text: tok[0] }), { text: tok[0] });
    }
    wordRules(w, f, path, pattern, where, raw, text, get);
}

/**
 * Check an entry's data against a content type's rules. Returns every problem, each
 * with a level: "block" stops publishing, "warn" is shown but never stops anything.
 * Fields the data does not have are checked as empty; paths that match no field are ignored.
 */
export function checkContentRules(rules: ContentRules | null | undefined, fields: RuleField[], components: RuleComponents, data: Record<string, unknown>): RuleIssue[] {
    if (!rules?.fields || typeof rules.fields !== "object") return [];
    const w: Walk = { rules, components, out: [], emptied: new Set(), root: data ?? {} };
    try {
        visit(w, fields, data ?? {}, "", "", [], true);
        // The soft rule sets: the same walk, with every rule at "warn".
        const softFields = Object.entries(rules.fields).filter(([, v]) => v && typeof v === "object" && v.soft);
        if (softFields.length) {
            const sw: Walk = { ...w, out: [], rules: { ...rules, fields: Object.fromEntries(softFields.map(([p, v]) => [p, softened(v.soft!, v.guideAnchor)])) } };
            visit(sw, fields, data ?? {}, "", "", [], true);
            w.out = [...w.out, ...sw.out];
        }
    } catch {
        // Unreadable data must never crash a save; it is reported as a problem instead.
        return [{ path: "", pattern: "", location: "This article", rule: "allow", level: "block", message: "The content could not be read. Open the article, check each box, and save it again.", text: "This article: The content could not be read. Open the article, check each box, and save it again." }];
    }
    return w.out.filter((i) => ![...w.emptied].some((p) => i.path.startsWith(`${p}.`) || (i.path === p && i.rule !== "noEmptyItems")));
}

/** A rule set with every rule at "warn" unless it names a level of its own. */
function softened(set: Partial<Record<RuleKey, RuleDef>>, anchor?: string): FieldRules {
    const out: Record<string, RuleDef> = {};
    for (const [k, def] of Object.entries(set)) {
        if (def === undefined || def === null) continue;
        out[k] = typeof def === "object" && !Array.isArray(def) ? { ...def, level: def.level ?? "warn" } : { value: def as RuleValue, level: "warn" };
    }
    return { ...out, guideAnchor: anchor } as FieldRules;
}

export const blocking = (issues: RuleIssue[]) => issues.filter((i) => i.level === "block");

/** `path -> sentence` map in the API's `errors` shape: location, every message for that path, and the guide. */
export function issueErrors(issues: RuleIssue[]): Record<string, string> {
    const by = new Map<string, RuleIssue[]>();
    for (const i of issues) by.set(i.path, [...(by.get(i.path) ?? []), i]);
    const out: Record<string, string> = {};
    for (const [path, list] of by) {
        const guide = list.find((i) => i.guide)?.guide;
        out[path] = `${list[0].location}: ${list.map((i) => i.message).join(" ")}${guide ? ` See: ${guide.label}.` : ""}`;
    }
    return out;
}

/** `path -> messages` for showing under a field, without the location. */
export function inlineMessages(issues: RuleIssue[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const i of issues) out[i.path] = out[i.path] ? `${out[i.path]} ${i.message}` : i.message;
    return out;
}

/** "This article can't be published yet. 2 things need fixing." */
export const publishBlockedMessage = (n: number) => `This article can't be published yet. ${n} ${n === 1 ? "thing needs" : "things need"} fixing.`;

// ─── Config checks ──────────────────────────────────────────────────────────

/** Validate a `contentRules` config as written by a person or an agent. Returns the problems, in plain words. */
export function configProblems(raw: unknown, fields: RuleField[], components: RuleComponents): string[] {
    const bad: string[] = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["contentRules must be an object with a `fields` map."];
    const r = raw as Record<string, unknown>;
    if (!r.fields || typeof r.fields !== "object" || Array.isArray(r.fields)) return ["contentRules needs a `fields` map of field path to rules."];
    if (r.guide !== undefined && (typeof r.guide !== "object" || !r.guide || typeof (r.guide as { url?: unknown }).url !== "string")) bad.push("contentRules.guide needs a `url`.");
    const known = new Map<string, RuleField>();
    const walk = (list: RuleField[], pat: string) => {
        for (const f of list) {
            if (!f?.name) continue;
            const p = pat ? `${pat}.${f.name}` : f.name;
            known.set(p, f);
            if (f.type === "Component") walk(subFields(f, components), f.repeatable ? `${p}[]` : p);
        }
    };
    walk(fields, "");
    for (const [path, set] of Object.entries(r.fields as Record<string, unknown>)) {
        if (!known.has(path)) {
            bad.push(`“${path}” does not match any field of this content type. Use the field names, with [] for a repeatable list, for example “pageContent.sections[].heading”.`);
            continue;
        }
        if (!set || typeof set !== "object" || Array.isArray(set)) {
            bad.push(`The rules for “${path}” must be an object.`);
            continue;
        }
        for (const key of Object.keys(set)) {
            if (key !== "guideAnchor" && key !== "soft" && !(RULE_KEYS as readonly string[]).includes(key)) bad.push(`“${key}” (on “${path}”) is not a known rule. Known rules: ${RULE_KEYS.join(", ")}.`);
        }
        const softSet = (set as Record<string, unknown>).soft;
        if (softSet !== undefined) {
            if (!softSet || typeof softSet !== "object" || Array.isArray(softSet)) bad.push(`“soft” (on “${path}”) must be an object of rules.`);
            else for (const k of Object.keys(softSet)) if (!(RULE_KEYS as readonly string[]).includes(k)) bad.push(`“${k}” (in soft on “${path}”) is not a known rule.`);
        }
        const specs = (set as Record<string, unknown>).itemRules;
        const field = known.get(path);
        const itemRule = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) && "value" in v ? (v as { value: unknown }).value : v);
        if (specs !== undefined) {
            const list = itemRule(specs);
            if (!Array.isArray(list)) bad.push(`“itemRules” (on “${path}”) must be a list of { index, rules }.`);
            else {
                const subs = field ? subFields(field as RuleField, components) : [];
                for (const s of list as { index?: unknown; rules?: Record<string, unknown> }[]) {
                    if (!(typeof s?.index === "number" || ["first", "last", "notLast", "all"].includes(String(s?.index))) || !s.rules || typeof s.rules !== "object") {
                        bad.push(`Each item in “itemRules” (on “${path}”) needs an index (a number, first, last, notLast or all) and rules.`);
                        continue;
                    }
                    for (const [name, rs] of Object.entries(s.rules)) {
                        if (!subs.some((x) => x.name === name)) bad.push(`“${name}” (in itemRules on “${path}”) is not a field of that block.`);
                        for (const k of Object.keys((rs ?? {}) as object)) if (k !== "guideAnchor" && !(RULE_KEYS as readonly string[]).includes(k)) bad.push(`“${k}” (in itemRules on “${path}”) is not a known rule.`);
                    }
                }
            }
        }
    }
    return bad;
}

// ─── Tidy a whole entry ─────────────────────────────────────────────────────

/**
 * Tidy every Text and Rich text value of an entry that the type's rules cover (all of
 * them, unless `tidy: false`). Headings with `noTrailingColon` also lose a trailing colon.
 * Returns new data (the input is never changed) and what was fixed.
 */
export function tidyEntryData(rules: ContentRules | null | undefined, fields: RuleField[], components: RuleComponents, data: Record<string, unknown>): { data: Record<string, unknown>; counts: TidyCounts } {
    let counts = emptyCounts();
    if (!rules?.fields || rules.tidy === false) return { data, counts };
    const walk = (list: RuleField[], obj: Record<string, unknown>, pPrefix: string, top: boolean): Record<string, unknown> => {
        let next = obj;
        for (const f of list) {
            if (!f?.name || !f.type || (f.type === "Slug" && top)) continue;
            const key = storedKey(obj, f.name);
            if (key === undefined) continue;
            const pattern = pPrefix ? `${pPrefix}.${f.name}` : f.name;
            const v = obj[key];
            let out: unknown = v;
            if (f.type === "Rich text" && typeof v === "string") {
                // A field with an allow list takes no styling of its own; a free one keeps the editor's alignment and colour.
                const r = tidyRich(v, { keepStyles: norm("allow", rules.fields[pattern]?.allow) === null });
                counts = addCounts(counts, r.counts);
                out = r.value;
            } else if (f.type === "Text" && typeof v === "string") {
                const colon = norm("noTrailingColon", rules.fields[pattern]?.noTrailingColon) !== null;
                const r = tidyText(v, { stripColon: colon });
                counts = addCounts(counts, r.counts);
                out = r.value;
            } else if (f.type === "Component") {
                const sub = subFields(f, components);
                if (Array.isArray(v)) out = v.map((it) => (it && typeof it === "object" && !Array.isArray(it) ? walk(sub, it as Record<string, unknown>, `${pattern}[]`, false) : it));
                else if (v && typeof v === "object") out = walk(sub, v as Record<string, unknown>, pattern, false);
            }
            if (out !== v) next = { ...next, [key]: out };
        }
        return next;
    };
    return { data: walk(fields, data, "", true), counts };
}
