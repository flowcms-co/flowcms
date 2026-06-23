/**
 * Schema Builder mock — content-type modeling (types + their fields) plus the
 * site-wide structured-data defaults. Per-page SEO/JSON-LD is edited inside the
 * block editor's "Schema" panel; this page defines the universal schema.
 */

export type FieldType =
    | "Text"
    | "Rich text"
    | "Number"
    | "Boolean"
    | "Date"
    | "Media"
    | "Reference"
    | "Slug"
    | "URL"
    | "Component"
    | "DynamicZone";

export const FIELD_TYPES: FieldType[] = [
    "Text",
    "Rich text",
    "Number",
    "Boolean",
    "Date",
    "Media",
    "Reference",
    "Slug",
    "URL",
    "Component",
    "DynamicZone",
];

/** schema.org types offered as the default for a content type. Kept for reference /
 *  back-compat; the content-type's schema.org type is now derived from its page
 *  type (see PAGE_TYPES) rather than picked directly. */
export const SCHEMA_JSONLD = [
    "Article",
    "BlogPosting",
    "WebPage",
    "FAQPage",
    "HowTo",
    "Product",
    "Event",
];

/** The four page types a content type can be. The page type drives three things at
 *  once: the public route shape, whether the type is a single page or a collection,
 *  and the default schema.org (JSON-LD) type for SEO.
 *
 *  - blog / service: a collection served under its own prefix, /<apiId>/<slug>
 *    (e.g. /blog/spring-tips, /services/water-damage).
 *  - home: the single site root, served at / with no prefix.
 *  - static: a collection of top-level pages served at the root slug, /<slug>
 *    (e.g. /about-us, /legal) with no prefix. */
export type PageType = "blog" | "service" | "home" | "static" | "reference";

export const PAGE_TYPES: { value: PageType; label: string; jsonLd: string; hint: string }[] = [
    { value: "blog", label: "Blog Page", jsonLd: "BlogPosting", hint: "Collection at /<apiId>/<slug>" },
    { value: "service", label: "Service or Product Page", jsonLd: "Product", hint: "Collection at /<apiId>/<slug>" },
    { value: "home", label: "Home Page", jsonLd: "WebPage", hint: "Single page at /" },
    { value: "static", label: "Static Page", jsonLd: "WebPage", hint: "Top-level pages like /about-us, /legal" },
    { value: "reference", label: "Reference Page", jsonLd: "WebPage", hint: "Custom URL, e.g. /blogs/tags/{slug} or /appliance-repair/{slug}" },
];

/** Default page type for a brand-new content type. */
export const DEFAULT_PAGE_TYPE: PageType = "blog";

/** The schema.org JSON-LD type a page type maps to (used as the content type's
 *  default structured-data type). Falls back to WebPage for anything unknown. */
export const jsonLdForPageType = (pageType?: string): string =>
    PAGE_TYPES.find((p) => p.value === pageType)?.jsonLd ?? "WebPage";

export type SchemaField = {
    id: string;
    name: string;
    type: FieldType;
    required: boolean;
    /** Optional human-friendly label shown to editors in the block editor in place
     *  of the machine `name`. Purely cosmetic — entry data is still keyed by `name`,
     *  so adding/changing a label never touches stored content. */
    label?: string;
    /** Optional helper text shown under the field in the content editor (Strapi-style). */
    description?: string;
    /** Component fields can repeat (a list) and nest their own fields (inline). */
    repeatable?: boolean;
    fields?: SchemaField[];
    /** Component field referencing a reusable component (by apiId) instead of inline fields. */
    componentApiId?: string;
    /** DynamicZone: component apiIds allowed as sections in this ordered list. */
    allowedComponents?: string[];
    /** Reference (relation) field: the id of the content type this field points at.
     *  The entry stores the referenced entry's id (single) or ids (multiple); the
     *  delivery API expands these into the full referenced entries. */
    referencedTypeId?: string;
    /** Polymorphic reference: the content type ids this field may point at (more than
     *  one). When set, the relation can link entries of any of these types; each
     *  populated entry carries a `__type` (its content type apiId) so consumers can
     *  tell them apart. Takes precedence over `referencedTypeId`. */
    referencedTypeIds?: string[];
    /** Reverse (mapped) side of a relation: the forward Reference field name on the
     *  referenced (owner) type that points back here. When set, this field is derived
     *  and read-only in the editor; the delivery API fills it from the join table. */
    mappedByField?: string;
    /** Reference field cardinality. false / undefined = a single entry (e.g. an
     *  author); true = many entries (e.g. tags). */
    multiple?: boolean;
    /** Richer validation rules + custom, user-friendly messages. The top-level
     *  `required` flag stays for backward compat; `messages.required` overrides the
     *  default required message. Rules other than required are only checked when a
     *  value is present. */
    validation?: FieldValidation;
};

/** Per-field validation rules with optional custom messages. Length rules apply to
 *  text values; min/max apply to numbers; pattern is a regex source string. */
export type FieldValidation = {
    required?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    messages?: {
        required?: string;
        minLength?: string;
        maxLength?: string;
        min?: string;
        max?: string;
        pattern?: string;
        type?: string;
    };
};

/** Coerce any human string into a camelCase machine key. Mirrors the API's
 *  `toCamelCase` (apps/api/src/content/naming.ts) so a field key / API ID is
 *  normalized identically whether the studio or the server does it.
 *  "Cover image" / "cover_image" / "OG image" → "coverImage" / "ogImage". */
export const camelCaseKey = (input: string): string => {
    const words = String(input ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[^A-Za-z0-9]+/g, " ")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return "";
    return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");
};

/** Coerce a content-type API ID. Unlike field keys / component IDs, a content-type
 *  ID doubles as a public URL slug (site.com/<pluralApiId>/…), so it stays lowercase
 *  rather than camelCase. Mirrors the API's `toLowerId`. "Blog Post" → "blogpost". */
export const lowerKey = (input: string): string => camelCaseKey(input).toLowerCase();

/** Camel-case every field name and de-duplicate siblings (coverImage, coverImage2,
 *  …), recursing into inline component sub-fields. Used to auto-fix the schema
 *  before save so stored keys are always unique camelCase. */
export const normalizeFieldKeys = (fields: SchemaField[]): SchemaField[] => {
    const used = new Set<string>();
    return fields.map((f) => {
        const base = camelCaseKey(f.name) || "field";
        let name = base;
        let n = 2;
        while (used.has(name)) name = `${base}${n++}`;
        used.add(name);
        return f.fields ? { ...f, name, fields: normalizeFieldKeys(f.fields) } : { ...f, name };
    });
};

/** The display label for a field in the block editor: the editor-friendly `label`
 *  when set, otherwise the field's machine `name`. */
export const fieldLabel = (f: { label?: string; name: string }): string => {
    const l = f.label?.trim();
    return l ? l : f.name;
};

export type ContentTypeSchema = {
    id: string;
    name: string;
    /** Machine name returned by the API (e.g. "article"); absent on local mock seeds. */
    apiId?: string;
    /** Number of entries of this type; the apiId is locked once this is > 0. */
    entryCount?: number;
    icon: string;
    color: string;
    jsonLd: string;
    /** Page type preset that drives routing, single-vs-collection, and the default
     *  JSON-LD type. Absent on legacy types (the API derives a sensible default). */
    pageType?: PageType;
    /** Fallback live-preview URL for this type: a representative published page (or a
     *  {slug}/{id}/{type}/{locale} template) the editor + live preview render when a
     *  new, unpublished entry has no published sibling to borrow. Empty = none. */
    previewUrl?: string;
    /** Reference page type only: the custom public URL template for this type's
     *  entries, e.g. "/blogs/tags/{slug}" or "/appliance-repair/{slug}". Supports
     *  {slug} and {locale}; a template with no placeholder appends the slug. */
    routePattern?: string;
    fields: SchemaField[];
};

export const contentTypeSchemas: ContentTypeSchema[] = [
    {
        id: "blog",
        name: "Blog Post",
        apiId: "article",
        icon: "document",
        color: "#6C5CE7",
        jsonLd: "BlogPosting",
        fields: [
            { id: "b1", name: "Title", type: "Text", required: true },
            { id: "b2", name: "Slug", type: "Slug", required: true },
            { id: "b3", name: "Body", type: "Rich text", required: true },
            { id: "b4", name: "Cover image", type: "Media", required: false },
            { id: "b5", name: "Author", type: "Reference", required: true },
            {
                id: "b6",
                name: "SEO",
                type: "Component",
                required: false,
                repeatable: false,
                fields: [
                    { id: "b6a", name: "Meta title", type: "Text", required: false },
                    { id: "b6b", name: "Meta description", type: "Text", required: false },
                    { id: "b6c", name: "OG image", type: "Media", required: false },
                ],
            },
            {
                id: "b7",
                name: "FAQ",
                type: "Component",
                required: false,
                repeatable: true,
                fields: [
                    { id: "b7a", name: "Question", type: "Text", required: true },
                    { id: "b7b", name: "Answer", type: "Rich text", required: true },
                ],
            },
        ],
    },
    {
        id: "page",
        name: "Page",
        apiId: "page",
        icon: "overview",
        color: "#3B82F6",
        jsonLd: "WebPage",
        fields: [
            { id: "p1", name: "Title", type: "Text", required: true },
            { id: "p2", name: "Slug", type: "Slug", required: true },
            { id: "p3", name: "Sections", type: "Rich text", required: true },
            { id: "p4", name: "Hero image", type: "Media", required: false },
        ],
    },
    {
        id: "landing",
        name: "Landing Page",
        apiId: "landing",
        icon: "chart",
        color: "#E0529C",
        jsonLd: "WebPage",
        fields: [
            { id: "l1", name: "Headline", type: "Text", required: true },
            { id: "l2", name: "Slug", type: "Slug", required: true },
            { id: "l3", name: "Hero", type: "Media", required: false },
            { id: "l4", name: "CTA URL", type: "URL", required: true },
            { id: "l5", name: "Blocks", type: "Rich text", required: false },
        ],
    },
    {
        id: "case_study",
        name: "Case Study",
        apiId: "case_study",
        icon: "star",
        color: "#00B894",
        jsonLd: "Article",
        fields: [
            { id: "cs1", name: "Title", type: "Text", required: true },
            { id: "cs2", name: "Slug", type: "Slug", required: true },
            { id: "cs3", name: "Client", type: "Text", required: true },
            { id: "cs4", name: "Summary", type: "Text", required: false },
            { id: "cs5", name: "Body", type: "Rich text", required: true },
            { id: "cs6", name: "Cover image", type: "Media", required: false },
        ],
    },
];

// Empty by default: the Organization name is prefilled from the workspace name
// (set in the first-run welcome wizard) and the rest stay blank with placeholders
// until the user fills them in. No sample data ships on a fresh install.
export const globalSchemaDefaults = {
    orgName: "",
    logo: "",
    url: "",
    sameAs: ["", "", "", ""],
};
