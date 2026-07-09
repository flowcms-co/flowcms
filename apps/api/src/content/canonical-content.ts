/**
 * Canonical content extraction — the single place that turns ANY entry's `data`
 * (legacy flat `body`, inline components, and dynamic-zone "sections") into the
 * plain text / HTML / headings / images / structured-data the SEO, AEO, AI and
 * plugin layers consume.
 *
 * Why this exists: before this, the SEO/AI/plugin code read `data.body` directly
 * in 8+ places. Once page content moves into components/sections, those reads would
 * see an empty page. Routing everything through one extractor keeps the suites
 * working (and makes structured data / AEO possible).
 *
 * It is deliberately **schema-less** (it detects structure from the data itself),
 * so callers that don't have the content-type schema handy (plugins, the SEO audit)
 * can still extract correctly. Dynamic-zone items carry a `__component` discriminator
 * (the component apiId) which is enough to emit structured-data hints.
 *
 * Pure + dependency-free (regex over the TipTap HTML we control). This is a LEAF
 * module: it must not import other content/* files so plugins/seo can import it
 * without creating a cycle.
 */

export interface EntryLike {
    id?: string;
    title?: string | null;
    slug?: string | null;
    data?: Record<string, unknown> | null;
}

/** A structured-data hint derived from a recognised component (Testimonial → Review…). */
export interface StructuredDataSpec {
    /** schema.org @type to emit. */
    schemaType: "Review" | "FAQPage" | "HowTo" | string;
    /** The component apiId it came from (e.g. "testimonial"). */
    component: string;
    /** Raw, best-effort field values pulled from the component instance. */
    data: Record<string, unknown>;
}

export interface CanonicalContent {
    /** All content text, tags stripped, whitespace-collapsed. */
    plainText: string;
    /** Reassembled HTML (concatenated rich-text + wrapped plain blocks). */
    html: string;
    /** Word count of plainText. */
    wordCount: number;
    /** In-content headings (H2+ from rich text). The page title (H1) is added by callers. */
    headings: { level: number; text: string }[];
    /** Every image found (rich-text <img> + Media fields), for alt-text audits. */
    images: { src: string; alt?: string | null }[];
    /** Internal-link count across all rich text. */
    internalLinkCount: number;
    /** Structured-data hints from recognised components. */
    structuredDataSpecs: StructuredDataSpec[];
}

// ── pure HTML helpers (shared; re-exported via parse-content for back-compat) ──

import { stripTags } from "@flowcms/shared";
export { stripTags };

export function str(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function attr(tag: string, name: string): string | undefined {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
    return m ? m[1] : undefined;
}

export function extractHeadings(html: string): { level: number; text: string }[] {
    const out: { level: number; text: string }[] = [];
    const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) out.push({ level: Number(m[1]), text: stripTags(m[2]) });
    return out;
}

export function extractImages(html: string): { src: string; alt?: string | null }[] {
    const out: { src: string; alt?: string | null }[] = [];
    const re = /<img\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) out.push({ src: attr(m[0], "src") ?? "", alt: attr(m[0], "alt") ?? null });
    return out;
}

export function countInternalLinks(html: string): number {
    let n = 0;
    const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
        const href = m[1];
        if (href.startsWith("/") || (href.startsWith("#") === false && /^[a-z0-9./?_-]+$/i.test(href) && !/^https?:/i.test(href))) n++;
    }
    return n;
}

// ── structure detection ──

/**
 * Build schema.org JSON-LD from the structured-data hints a component-based entry
 * produced (Testimonial → Review, FAQ items → one FAQPage, HowTo steps → one
 * HowTo). Returns ready-to-inject `@context` objects. AEO/SEO can serve these
 * alongside the page so answer engines + search understand the structured content.
 */
export function buildJsonLd(specs: StructuredDataSpec[]): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    const reviews = specs.filter((s) => s.schemaType === "Review");
    const faqs = specs.filter((s) => s.schemaType === "FAQPage");
    const howtos = specs.filter((s) => s.schemaType === "HowTo");

    for (const r of reviews) {
        const author = str(r.data.author);
        const body = stripTags(str(r.data.reviewBody));
        const rating = str(r.data.reviewRating);
        if (!author && !body) continue;
        out.push({
            "@context": "https://schema.org",
            "@type": "Review",
            ...(author ? { author: { "@type": "Person", name: author } } : {}),
            ...(body ? { reviewBody: body } : {}),
            ...(rating && !Number.isNaN(Number(rating)) ? { reviewRating: { "@type": "Rating", ratingValue: Number(rating) } } : {}),
        });
    }

    const faqItems = faqs
        .filter((f) => str(f.data.question))
        .map((f) => ({ "@type": "Question", name: stripTags(str(f.data.question)), acceptedAnswer: { "@type": "Answer", text: stripTags(str(f.data.answer)) } }));
    if (faqItems.length) out.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqItems });

    const steps = howtos.filter((h) => str(h.data.text) || str(h.data.name)).map((h) => ({ "@type": "HowToStep", ...(str(h.data.name) ? { name: stripTags(str(h.data.name)) } : {}), text: stripTags(str(h.data.text)) }));
    if (steps.length) out.push({ "@context": "https://schema.org", "@type": "HowTo", step: steps });

    return out;
}

/** Entry-level keys that are metadata/SEO config, never page body content. */
const META_KEYS = new Set([
    "title", "slug", "summary", "excerpt", "metatitle", "metadescription",
    "focuskeyword", "canonical", "robots", "jsonld", "jsonldtype", "wordcount",
    "readingtime", "status", "scheduledat", "ogimage", "og_image", "ogtitle",
    "ogdescription", "locale", "author", "publishedat",
]);

const isHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);
const isImageUrl = (s: string) => /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(s) || /(^|\/)(images?|media|uploads|picsum)\b/i.test(s);
const isUrlOrPath = (s: string) => /^(https?:\/\/|\/|data:|mailto:|tel:|#)/i.test(s) || s.split(/\s+/).length === 1;

type Acc = {
    html: string[];
    text: string[];
    images: { src: string; alt?: string | null }[];
    links: number;
    specs: StructuredDataSpec[];
};

/** Map a recognised component instance to a structured-data hint. */
function structuredFor(component: string, item: Record<string, unknown>): StructuredDataSpec | null {
    const t = component.toLowerCase();
    const pick = (...keys: string[]) => {
        for (const k of keys) {
            for (const dk of Object.keys(item)) {
                if (dk.toLowerCase().replace(/[^a-z0-9]/g, "") === k) {
                    const v = item[dk];
                    // Capture numbers too (e.g. a testimonial Rating), not just strings.
                    if (v != null && v !== "") return typeof v === "string" ? v : String(v);
                }
            }
        }
        return "";
    };
    if (t.includes("testimonial") || t.includes("review")) {
        return { schemaType: "Review", component, data: { author: pick("author", "name"), reviewBody: pick("quote", "text", "content", "review", "body"), reviewRating: pick("rating", "stars") } };
    }
    if (t.includes("faq")) {
        return { schemaType: "FAQPage", component, data: { question: pick("question", "q"), answer: pick("answer", "a") } };
    }
    if (t.includes("howto") || t.includes("step")) {
        return { schemaType: "HowTo", component, data: { name: pick("title", "name", "step"), text: pick("text", "instruction", "content") } };
    }
    return null;
}

/** Recurse a component/section instance, pulling content strings + images + specs. */
function collectInstance(obj: Record<string, unknown>, acc: Acc, depth: number) {
    if (depth > 6) return;
    const component = str(obj.__component);
    if (component) {
        const spec = structuredFor(component, obj);
        if (spec) acc.specs.push(spec);
    }
    for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith("__")) continue;
        if (typeof v === "string") {
            const s = v.trim();
            if (!s) continue;
            if (isHtml(s)) {
                acc.html.push(s);
                acc.images.push(...extractImages(s));
                acc.links += countInternalLinks(s);
            } else if (isImageUrl(s)) {
                acc.images.push({ src: s, alt: null });
            } else if (isUrlOrPath(s)) {
                // CTA url / single-token value — not body content.
            } else {
                acc.text.push(s);
            }
        } else if (v && typeof v === "object") {
            collectValue(v, acc, depth + 1);
        }
    }
}

/** Recurse arbitrary nested values (arrays of components, nested objects). */
function collectValue(value: unknown, acc: Acc, depth: number) {
    if (depth > 6 || value == null) return;
    if (Array.isArray(value)) {
        for (const item of value) {
            if (item && typeof item === "object" && !Array.isArray(item)) collectInstance(item as Record<string, unknown>, acc, depth + 1);
            else collectValue(item, acc, depth + 1);
        }
    } else if (typeof value === "object") {
        collectInstance(value as Record<string, unknown>, acc, depth + 1);
    }
}

/**
 * Extract canonical content from any entry shape.
 *
 * Rules (back-compat by design):
 *  - `data.body` (legacy main content) is always included as rich text.
 *  - Other top-level **rich-text** strings (containing HTML) are included; plain
 *    top-level strings (title, labels, meta) are NOT (so body-only entries are
 *    unchanged and a flat "Headline" label isn't counted as body).
 *  - Top-level **objects/arrays** are treated as component/section instances and
 *    recursed: inside a component, BOTH rich text and plain text fields count as
 *    content (a Hero's Title/Subtitle are real page text); url/single-token and
 *    image values are skipped from text (images are collected separately).
 */
export function entryToCanonicalContent(entry: EntryLike): CanonicalContent {
    const d = (entry.data ?? {}) as Record<string, unknown>;
    const acc: Acc = { html: [], text: [], images: [], links: 0, specs: [] };

    // 1. Legacy body first (keeps ordering + output identical for body-only entries).
    const body = str(d.body);
    if (body.trim()) {
        acc.html.push(body);
        acc.images.push(...extractImages(body));
        acc.links += countInternalLinks(body);
    }

    // 2. Walk the rest of the data.
    for (const [key, value] of Object.entries(d)) {
        if (key === "body") continue;
        if (key.startsWith("__")) continue;
        if (META_KEYS.has(key.toLowerCase())) continue;
        if (typeof value === "string") {
            const s = value.trim();
            if (s && isHtml(s)) {
                acc.html.push(s);
                acc.images.push(...extractImages(s));
                acc.links += countInternalLinks(s);
            }
        } else if (value && typeof value === "object") {
            collectValue(value, acc, 0);
        }
    }

    const headings = acc.html.flatMap((h) => extractHeadings(h));
    const htmlAssembled = [...acc.html, ...acc.text.map((t) => `<p>${t}</p>`)].join("\n");
    const plainText = [...acc.html.map((h) => stripTags(h)), ...acc.text]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    return {
        plainText,
        html: htmlAssembled,
        wordCount: plainText ? plainText.split(/\s+/).filter(Boolean).length : 0,
        headings,
        images: acc.images,
        internalLinkCount: acc.links,
        structuredDataSpecs: acc.specs,
    };
}
