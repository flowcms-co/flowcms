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

/** schema.org types offered as the default for a content type. */
export const SCHEMA_JSONLD = [
    "Article",
    "BlogPosting",
    "WebPage",
    "FAQPage",
    "HowTo",
    "Product",
    "Event",
];

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
