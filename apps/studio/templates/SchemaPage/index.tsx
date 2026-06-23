"use client";

import { useCallback, useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Checkbox from "@/components/ui/Checkbox";
import Switch from "@/components/ui/Switch";
import Select from "@/components/ui/Select";
import SaveStatus from "@/components/ui/SaveStatus";
import {
    FIELD_TYPES,
    PAGE_TYPES,
    DEFAULT_PAGE_TYPE,
    jsonLdForPageType,
    camelCaseKey,
    lowerKey,
    fieldLabel,
    globalSchemaDefaults,
    normalizeFieldKeys,
    type ContentTypeSchema,
    type FieldType,
    type PageType,
    type SchemaField,
} from "@/mocks/schema";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

// A content type's icon color. The default purple follows the workspace brand
// accent (so white-label types aren't stuck on Flow CMS purple); a color the user
// explicitly customized is kept as-is.
const typeColor = (c?: string) => (!c || c.toLowerCase() === "#6c5ce7" ? "var(--color-primary)" : c);
import { confirm } from "@/components/providers/ConfirmProvider";

let idSeq = 0;
// Globally-unique id. A plain counter ("nf-1") resets to 0 each page load, so a
// freshly-added field would collide with an already-saved "nf-1" and the two rows
// would then edit/delete together. A random suffix makes collisions impossible.
const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? `nf-${crypto.randomUUID()}` : `nf-${(idSeq += 1)}-${Math.random().toString(36).slice(2, 8)}`;

/** Guarantee every field (recursively) has a UNIQUE id. Imported/seeded schemas can
 *  contain duplicate ids; since the schema builder edits/removes fields by id, a
 *  collision makes two rows move together and resist deletion. Field identity is
 *  client-only (entry data is keyed by field name), so reassigning is safe. */
const uniqueFieldIds = (fields: SchemaField[] | undefined, seen: Set<string>): SchemaField[] =>
    (fields ?? []).map((f) => {
        let id = f.id;
        if (!id || seen.has(id)) id = newId();
        seen.add(id);
        return f.fields ? { ...f, id, fields: uniqueFieldIds(f.fields, seen) } : { ...f, id };
    });
const normalizeTypes = (list: ContentTypeSchema[]): ContentTypeSchema[] =>
    list.map((t) => ({ ...t, fields: uniqueFieldIds(t.fields, new Set<string>()) }));
const blankField = (): SchemaField => ({
    id: newId(),
    name: "New field",
    type: "Text",
    required: false,
});
const blankComponent = (): SchemaField => ({
    id: newId(),
    name: "New component",
    type: "Component",
    required: false,
    repeatable: false,
    fields: [],
});

/** A reusable component the schema can reference (apiId + display name). */
type ComponentRef = { apiId: string; name: string };

/** A content type a Reference field can point at (id + display name). The id is the
 *  content type's database id — what the entry editor queries entries by. `refFields`
 *  lists this type's forward Reference fields, offered as the "mapped by" target when
 *  configuring a reverse relation that points back from this type. */
type TypeRef = { id: string; name: string; refFields: { name: string; label: string }[] };

/**
 * Schema Builder (Content Model) — Strapi-style content-type builder. Define
 * content types and their fields, including inline + **reusable** components and
 * **dynamic zones** (an ordered list of mixed component sections), with
 * drag-to-reorder at every level. A separate Components tab manages the reusable
 * component library. Persisted via the content-types API.
 */
const SchemaPage = () => {
    const [types, setTypes] = useState<ContentTypeSchema[]>([]);
    const [components, setComponents] = useState<ContentTypeSchema[]>([]);
    const [tab, setTab] = useState<"types" | "components">("types");
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    const load = useCallback(async () => {
        try {
            const [t, c] = await Promise.all([
                api<ContentTypeSchema[]>("/content-types"),
                api<ContentTypeSchema[]>("/content-types/components").catch(() => [] as ContentTypeSchema[]),
            ]);
            setTypes(normalizeTypes(t));
            setComponents(normalizeTypes(c));
            setActiveId((cur) => cur ?? t[0]?.id ?? null);
        } catch {
            /* read requires content.read */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const collection = tab === "types" ? types : components;
    const setCollection = tab === "types" ? setTypes : setComponents;
    const active = collection.find((t) => t.id === activeId) ?? null;
    const componentRefs: ComponentRef[] = components.map((c) => ({ apiId: c.apiId ?? "", name: c.name })).filter((c) => c.apiId);
    // Content types a Reference field can target (always the full type list, so a
    // type can even reference itself, e.g. "related posts"). Each carries its forward
    // Reference fields for configuring the reverse (mapped-by) side.
    const typeRefs: TypeRef[] = types.map((t) => ({
        id: t.id,
        name: t.name,
        refFields: (t.fields ?? [])
            .filter((f) => f.type === "Reference" && !f.mappedByField)
            .map((f) => ({ name: f.name, label: fieldLabel(f) })),
    }));

    const switchTab = (next: "types" | "components") => {
        if (next === tab) return;
        setTab(next);
        const list = next === "types" ? types : components;
        setActiveId(list[0]?.id ?? null);
        setDirty(false);
    };

    const patchActive = (patch: Partial<ContentTypeSchema>) => {
        if (!active) return;
        setCollection((prev) => prev.map((t) => (t.id === active.id ? { ...t, ...patch } : t)));
        setDirty(true);
    };
    const setActiveFields = (fields: SchemaField[]) => patchActive({ fields });
    // Page type drives routing + single/collection on the server and sets the default
    // schema.org (JSON-LD) type, so we keep jsonLd in lock-step with the choice.
    const setPageType = (pageType: string) => patchActive({ pageType: pageType as PageType, jsonLd: jsonLdForPageType(pageType) });

    const add = async () => {
        const isComp = tab === "components";
        const created = await api<ContentTypeSchema>("/content-types", {
            method: "POST",
            body: JSON.stringify({
                name: isComp ? "New component" : "New type",
                ...(isComp ? { kind: "COMPONENT" } : {}),
                schema: {
                    icon: isComp ? "copy" : "document",
                    color: "#6C5CE7",
                    // New content types start as a Blog Page (a prefixed collection); the
                    // server reads schema.pageType to set kind + routing. Components don't route.
                    ...(isComp ? { jsonLd: "WebPage" } : { pageType: DEFAULT_PAGE_TYPE, jsonLd: jsonLdForPageType(DEFAULT_PAGE_TYPE) }),
                    fields: [],
                },
            }),
        });
        setCollection((prev) => [...prev, created]);
        setActiveId(created.id);
        setDirty(false);
    };

    const saveActive = async () => {
        if (!active) return;
        setSaving(true);
        try {
            // Auto-fix field keys + API ID to unique camelCase before saving (the
            // backend normalizes too; we mirror it so the UI shows the stored value).
            const fields = normalizeFieldKeys(active.fields);
            // Components use camelCase IDs; content types stay lowercase (URL slugs).
            const coerceId = tab === "components" ? camelCaseKey : lowerKey;
            const apiId = active.apiId ? coerceId(active.apiId) : active.apiId;
            const updated = await api<ContentTypeSchema>(`/content-types/${active.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: active.name,
                    // Only send apiId while the type is empty; the backend rejects a
                    // change once entries exist (or a component is referenced).
                    ...((active.entryCount ?? 0) === 0 && apiId ? { apiId } : {}),
                    schema: {
                        icon: active.icon,
                        color: active.color,
                        // Content types carry a page type (routing + kind + JSON-LD default);
                        // components have no route, so they keep a plain jsonLd.
                        ...(tab === "types"
                            ? {
                                  pageType: active.pageType ?? DEFAULT_PAGE_TYPE,
                                  jsonLd: jsonLdForPageType(active.pageType ?? DEFAULT_PAGE_TYPE),
                                  // Omit when blank so the stored schema stays clean.
                                  previewUrl: active.previewUrl?.trim() || undefined,
                                  // Reference types carry a custom URL template; cleared for others.
                                  routePattern: active.pageType === "reference" ? active.routePattern?.trim() || undefined : undefined,
                              }
                            : { jsonLd: active.jsonLd }),
                        fields,
                    },
                }),
            });
            setCollection((prev) =>
                prev.map((t) => (t.id === active.id ? { ...t, apiId: updated.apiId, fields: updated.fields ?? fields } : t)),
            );
            setDirty(false);
        } catch (e) {
            window.alert(e instanceof Error ? e.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    };

    const deleteActive = async () => {
        if (!active) return;
        const noun = tab === "types" ? "content type" : "component";
        if (!(await confirm({ title: `Delete the "${active.name}" ${noun}?`, confirmLabel: "Delete", tone: "danger" }))) return;
        try {
            await api(`/content-types/${active.id}`, { method: "DELETE" });
            const next = collection.filter((t) => t.id !== active.id);
            setCollection(next);
            setActiveId(next[0]?.id ?? null);
            setDirty(false);
        } catch (e) {
            window.alert(e instanceof Error ? e.message : "Could not delete.");
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Types / Components toggle */}
            <div className="inline-flex w-fit items-center gap-1 rounded-2xl bg-lavender-mist p-1 dark:bg-dark-3">
                {(["types", "components"] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => switchTab(m)}
                        className={cn(
                            "h-9 rounded-xl px-4 text-caption-1 font-semibold capitalize transition-colors",
                            tab === m ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey hover:text-primary",
                        )}
                    >
                        {m === "types" ? "Content types" : "Components"}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_1fr]">
                {/* Left list */}
                <Card className="flex flex-col h-full !p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-h5 text-black dark:text-white">{tab === "types" ? "Content types" : "Components"}</h2>
                        <span className="text-caption-2 text-grey">{collection.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {collection.map((t) => {
                            const isActive = t.id === activeId;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveId(t.id)}
                                    className={cn(
                                        "flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all",
                                        isActive ? "bg-primary text-white shadow-glow" : "hover:bg-lavender-mist dark:hover:bg-dark-3",
                                    )}
                                >
                                    <span className="flex items-center justify-center w-9 h-9 rounded-[0.625rem] shrink-0" style={{ backgroundColor: isActive ? "rgba(255,255,255,0.18)" : `color-mix(in srgb, ${typeColor(t.color)} 13%, transparent)` }}>
                                        <Icon className="w-4 h-4" name={t.icon} fill={isActive ? "#fff" : typeColor(t.color)} />
                                    </span>
                                    <span className="min-w-0">
                                        <span className={cn("block truncate text-title", isActive ? "text-white" : "text-black dark:text-white")}>{t.name}</span>
                                        <span className={cn("block text-caption-2", isActive ? "text-white/70" : "text-grey")}>{t.fields.length} fields</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button type="button" onClick={add} className="btn-secondary w-full mt-4">
                        <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="plus" />
                        {tab === "types" ? "New type" : "New component"}
                    </button>
                </Card>

                {/* Field editor */}
                <Card className="flex flex-col h-full">
                    {!active ? (
                        <div className="grid h-full place-items-center py-16 text-center">
                            <div>
                                <p className="text-body-sm text-grey">
                                    {loading ? "Loading…" : tab === "types" ? "No content types yet." : "No components yet."}
                                </p>
                                {!loading && (
                                    <button type="button" onClick={add} className="btn-primary mt-4">
                                        <Icon className="w-5 h-5 fill-white" name="plus" />
                                        {tab === "types" ? "Create your first type" : "Create your first component"}
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="flex items-center justify-center w-11 h-11 rounded-2xl shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${typeColor(active.color)} 13%, transparent)` }}>
                                        <Icon className="w-5 h-5" name={active.icon} fill={typeColor(active.color)} />
                                    </span>
                                    <div className="min-w-0">
                                        <input
                                            value={active.name}
                                            onChange={(e) => patchActive({ name: e.target.value })}
                                            className="w-full bg-transparent font-poppins text-h5 font-bold text-black outline-none dark:text-white"
                                            aria-label={tab === "types" ? "Content type name" : "Component name"}
                                        />
                                        <p className="flex flex-wrap items-center gap-x-1 text-caption-2 text-grey">
                                            {(active.entryCount ?? 0) === 0 ? (
                                                <input
                                                    value={active.apiId ?? ""}
                                                    onChange={(e) => patchActive({ apiId: e.target.value })}
                                                    onBlur={(e) => {
                                                        // Auto-fix the API ID silently: components camelCase,
                                                        // content types lowercase (they double as URL slugs).
                                                        const c = (tab === "components" ? camelCaseKey : lowerKey)(e.target.value);
                                                        if (c && c !== active.apiId) patchActive({ apiId: c });
                                                    }}
                                                    spellCheck={false}
                                                    aria-label="API ID"
                                                    title={tab === "components" ? "Machine name (camelCase) used by the delivery API / referenced by other types." : "URL slug (lowercase) used by the delivery API, e.g. site.com/<apiId>/…"}
                                                    className="bg-transparent font-mono text-grey outline-none focus:text-primary dark:focus:text-lilac"
                                                />
                                            ) : (
                                                <span className="font-mono" title="Locked: changing the API ID would break existing content URLs.">{active.apiId}</span>
                                            )}
                                            <span>· {active.fields.length} fields · drag to reorder</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {tab === "types" && (
                                        <label className="flex items-center gap-2">
                                            <span className="text-caption-1 text-grey">Page type</span>
                                            <Select
                                                variant="field"
                                                className="!w-auto"
                                                ariaLabel="Page type"
                                                value={active.pageType ?? DEFAULT_PAGE_TYPE}
                                                onChange={setPageType}
                                                options={PAGE_TYPES.map((p) => ({ value: p.value, label: p.label }))}
                                            />
                                        </label>
                                    )}
                                    <button type="button" onClick={deleteActive} aria-label="Delete" className="flex items-center justify-center w-10 h-10 rounded-xl text-grey transition-colors hover:bg-error/10 hover:text-error">
                                        <Icon className="w-5 h-5 fill-current" name="trash" />
                                    </button>
                                    <SaveStatus state={saving ? "saving" : dirty ? "dirty" : "saved"} className="mr-1 hidden sm:inline-flex" />
                                    <button type="button" onClick={saveActive} disabled={saving || !dirty} className="btn-primary min-w-[8.5rem] disabled:opacity-50">
                                        Save changes
                                    </button>
                                </div>
                            </div>

                            {tab === "types" && active.pageType === "reference" && (
                                <label className="mb-5 flex flex-col gap-1.5">
                                    <span className="text-caption-1 text-grey">URL pattern <span className="text-error">*</span></span>
                                    <input
                                        value={active.routePattern ?? ""}
                                        onChange={(e) => patchActive({ routePattern: e.target.value })}
                                        placeholder="/blogs/tags/{slug}  ·  or  /appliance-repair/{slug}"
                                        spellCheck={false}
                                        className="flow-input font-mono text-caption-1"
                                    />
                                    <span className="text-caption-2 leading-relaxed text-grey">
                                        The public URL for this reference type&rsquo;s entries. Put{" "}
                                        <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{slug}"}</code>{" "}
                                        where the entry slug goes (e.g.{" "}
                                        <span className="font-medium text-black dark:text-white">/blogs/tags/{"{slug}"}</span> &rarr; /blogs/tags/common-problems). Also supports{" "}
                                        <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{locale}"}</code>. If you omit{" "}
                                        <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{slug}"}</code>, it&rsquo;s appended to the end.
                                    </span>
                                </label>
                            )}

                            {tab === "types" && (
                                <label className="mb-5 flex flex-col gap-1.5">
                                    <span className="text-caption-1 text-grey">Fallback preview URL <span className="text-grey/70">(optional)</span></span>
                                    <input
                                        value={active.previewUrl ?? ""}
                                        onChange={(e) => patchActive({ previewUrl: e.target.value })}
                                        placeholder="https://yoursite.com/services/example  ·  or  /services/{slug}"
                                        spellCheck={false}
                                        className="flow-input font-mono text-caption-1"
                                    />
                                    <span className="text-caption-2 leading-relaxed text-grey">
                                        Shown in the live preview and editor when a new entry has no published{" "}
                                        <span className="font-medium text-black dark:text-white">{active.name}</span> page to borrow. Use a full page URL, or a
                                        template with{" "}
                                        <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{slug}"}</code>{" "}
                                        <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{id}"}</code>{" "}
                                        <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{type}"}</code>{" "}
                                        <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{locale}"}</code> placeholders.
                                    </span>
                                </label>
                            )}

                            <FieldList fields={active.fields} onChange={setActiveFields} components={componentRefs} contentTypes={typeRefs} allowZones={tab === "types"} />
                        </>
                    )}
                </Card>
            </div>

            <GlobalSchemaCard />
        </div>
    );
};

/** A reorderable list of fields. Recurses into inline component fields for nesting. */
const FieldList = ({
    fields,
    onChange,
    components,
    contentTypes,
    allowZones,
    depth = 0,
}: {
    fields: SchemaField[];
    onChange: (next: SchemaField[]) => void;
    components: ComponentRef[];
    contentTypes: TypeRef[];
    allowZones: boolean;
    depth?: number;
}) => {
    const update = (id: string, patch: Partial<SchemaField>) => onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));

    return (
        <div className="flex flex-col gap-2">
            <Reorder.Group as="div" axis="y" values={fields} onReorder={onChange} className="flex flex-col gap-2">
                {fields.map((f) => (
                    <FieldRow
                        key={f.id}
                        field={f}
                        depth={depth}
                        components={components}
                        contentTypes={contentTypes}
                        allowZones={allowZones}
                        onUpdate={(patch) => update(f.id, patch)}
                        onUpdateChildren={(nf) => update(f.id, { fields: nf })}
                        onRemove={() => remove(f.id)}
                    />
                ))}
            </Reorder.Group>

            <div className="flex flex-wrap gap-2 mt-1">
                <button type="button" onClick={() => onChange([...fields, blankField()])} className="btn-secondary h-9 px-3.5 text-caption-1">
                    <Icon className="w-4 h-4 fill-primary dark:fill-lilac" name="plus" />
                    Add field
                </button>
                <button type="button" onClick={() => onChange([...fields, blankComponent()])} className="btn-ghost h-9 px-3.5 text-caption-1 border border-grey-light dark:border-grey-light/10">
                    <Icon className="w-4 h-4 fill-grey" name="copy" />
                    Add component
                </button>
                {allowZones && depth === 0 && (
                    <button
                        type="button"
                        onClick={() => onChange([...fields, { id: newId(), name: "Sections", type: "DynamicZone", required: false, allowedComponents: components.map((c) => c.apiId) }])}
                        className="btn-ghost h-9 px-3.5 text-caption-1 border border-grey-light dark:border-grey-light/10"
                    >
                        <Icon className="w-4 h-4 fill-grey" name="grid" />
                        Add dynamic zone
                    </button>
                )}
            </div>
        </div>
    );
};

const INLINE = "__inline__";
// How deep inline components may nest in the builder UI before we steer the user
// toward a reusable component. Deep enough for realistic imported models (page ->
// section -> component), bounded so the editor stays usable.
const MAX_INLINE_DEPTH = 5;

const FieldRow = ({
    field,
    depth,
    components,
    contentTypes,
    allowZones,
    onUpdate,
    onUpdateChildren,
    onRemove,
}: {
    field: SchemaField;
    depth: number;
    components: ComponentRef[];
    contentTypes: TypeRef[];
    allowZones: boolean;
    onUpdate: (patch: Partial<SchemaField>) => void;
    onUpdateChildren: (next: SchemaField[]) => void;
    onRemove: () => void;
}) => {
    const controls = useDragControls();
    const [showDesc, setShowDesc] = useState(false);
    const [showLabel, setShowLabel] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const isComp = field.type === "Component";
    const isZone = field.type === "DynamicZone";
    const isRef = isComp && !!field.componentApiId;
    const isReference = field.type === "Reference";
    const isPoly = isReference && Array.isArray(field.referencedTypeIds);
    const isReverse = isReference && field.mappedByField !== undefined;
    // The forward Reference fields available on the owner type a reverse field maps by.
    const reverseOwner = isReverse ? contentTypes.find((t) => t.id === field.referencedTypeId) : undefined;
    // Validation rules apply to plain value fields (not components / zones / toggles).
    const isNumberField = field.type === "Number";
    const canValidate = !isComp && !isZone && ["Text", "Rich text", "URL", "Slug", "Number"].includes(field.type);
    const v = field.validation ?? {};
    const hasValidation = !!field.validation && (v.minLength != null || v.maxLength != null || v.min != null || v.max != null || !!v.pattern || !!v.messages);
    // A single, user-friendly message per field: stored against every rule so
    // whichever rule fails shows it (covers "required" too).
    const customMessage = v.messages ? v.messages.required ?? v.messages.pattern ?? v.messages.minLength ?? v.messages.type ?? "" : "";
    const setV = (patch: Partial<NonNullable<SchemaField["validation"]>>) => onUpdate({ validation: { ...v, ...patch } });
    const setCustomMessage = (text: string) =>
        setV({ messages: text ? { required: text, minLength: text, maxLength: text, min: text, max: text, pattern: text, type: text } : undefined });

    const changeType = (type: FieldType) => {
        if (type === "Component") onUpdate({ type, fields: field.fields ?? [], repeatable: field.repeatable ?? false, allowedComponents: undefined, componentApiId: undefined, referencedTypeId: undefined, referencedTypeIds: undefined, mappedByField: undefined, multiple: undefined });
        else if (type === "DynamicZone") onUpdate({ type, allowedComponents: field.allowedComponents ?? components.map((c) => c.apiId), fields: undefined, componentApiId: undefined, repeatable: undefined, referencedTypeId: undefined, referencedTypeIds: undefined, mappedByField: undefined, multiple: undefined });
        else if (type === "Reference") onUpdate({ type, referencedTypeId: field.referencedTypeId ?? contentTypes[0]?.id, multiple: field.multiple ?? false, fields: undefined, repeatable: undefined, componentApiId: undefined, allowedComponents: undefined });
        else onUpdate({ type, fields: undefined, repeatable: undefined, componentApiId: undefined, allowedComponents: undefined, referencedTypeId: undefined, referencedTypeIds: undefined, mappedByField: undefined, multiple: undefined });
    };

    const toggleAllowed = (apiId: string) => {
        const set = new Set(field.allowedComponents ?? []);
        if (set.has(apiId)) set.delete(apiId);
        else set.add(apiId);
        onUpdate({ allowedComponents: [...set] });
    };

    // Polymorphic target content types (which types this relation may point at).
    const toggleTargetType = (id: string) => {
        const set = new Set(field.referencedTypeIds ?? []);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        onUpdate({ referencedTypeIds: [...set] });
    };

    // Switch a Reference field between single-target and polymorphic (multi-target).
    const togglePolymorphic = (on: boolean) =>
        on
            ? onUpdate({ referencedTypeIds: field.referencedTypeId ? [field.referencedTypeId] : [], referencedTypeId: undefined })
            : onUpdate({ referencedTypeIds: undefined, referencedTypeId: field.referencedTypeIds?.[0] ?? contentTypes[0]?.id });

    // Switch a Reference field between the forward (owning) and reverse (mapped) side.
    // The reverse side is derived from the join table, so it's never polymorphic.
    const toggleReverse = (on: boolean) =>
        on
            ? onUpdate({ mappedByField: "", referencedTypeId: field.referencedTypeId ?? contentTypes[0]?.id, referencedTypeIds: undefined })
            : onUpdate({ mappedByField: undefined });

    return (
        <Reorder.Item
            as="div"
            value={field}
            dragListener={false}
            dragControls={controls}
            className={cn("rounded-2xl border border-grey-light dark:border-grey-light/10", isComp || isZone ? "bg-lavender-mist/40 dark:bg-dark-3/40" : "bg-white dark:bg-dark-1")}
        >
            <div className="flex flex-wrap items-center gap-2.5 p-2.5">
                <button type="button" aria-label="Drag to reorder" onPointerDown={(e) => controls.start(e)} className="flex items-center justify-center w-7 h-9 shrink-0 cursor-grab text-grey transition-colors hover:text-primary active:cursor-grabbing touch-none">
                    <Icon className="w-4 h-4 fill-current" name="grip" />
                </button>

                {(isComp || isZone) && <Icon className="w-4 h-4 fill-primary shrink-0" name={isZone ? "grid" : "copy"} />}

                <input
                    value={field.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    onBlur={(e) => {
                        // Auto-fix the data key to camelCase (silently). Uniqueness across
                        // siblings is resolved on save. Add a friendly label for display.
                        const c = camelCaseKey(e.target.value);
                        if (c && c !== field.name) onUpdate({ name: c });
                    }}
                    title="Field key (the data key, camelCase). Add a friendly label below to change how it reads in the editor."
                    className="flow-input !py-2 min-w-0 flex-1 basis-40"
                />

                <Select
                    variant="field"
                    className="!w-auto"
                    ariaLabel="Field type"
                    value={field.type}
                    onChange={(v) => changeType(v as FieldType)}
                    options={FIELD_TYPES.filter((ft) => ft !== "DynamicZone" || allowZones).map((ft) => ({ value: ft, label: ft === "DynamicZone" ? "Dynamic zone" : ft }))}
                />

                {/* Component: inline vs reference a library component */}
                {isComp && (
                    <Select
                        variant="field"
                        className="!w-auto"
                        ariaLabel="Component source"
                        value={field.componentApiId ?? INLINE}
                        onChange={(v) => (v === INLINE ? onUpdate({ componentApiId: undefined }) : onUpdate({ componentApiId: v, fields: undefined }))}
                        options={[{ value: INLINE, label: "Inline" }, ...components.map((c) => ({ value: c.apiId, label: c.name }))]}
                    />
                )}

                {/* Reference (relation): which content type, one vs many, single vs
                    polymorphic (multi-type) target. */}
                {isReference && (
                    <>
                        {!isPoly && (
                            <Select
                                variant="field"
                                className="!w-auto"
                                ariaLabel="Referenced content type"
                                value={field.referencedTypeId ?? ""}
                                onChange={(v) => onUpdate({ referencedTypeId: v || undefined })}
                                options={
                                    contentTypes.length
                                        ? contentTypes.map((t) => ({ value: t.id, label: t.name }))
                                        : [{ value: "", label: "No content types" }]
                                }
                            />
                        )}
                        <label className="flex items-center gap-2 shrink-0 px-1 cursor-pointer select-none">
                            <span className="text-caption-2 font-medium text-grey">Multiple</span>
                            <Switch checked={!!field.multiple} onChange={(v) => onUpdate({ multiple: v })} aria-label={`${field.name} multiple`} />
                        </label>
                        {!isReverse && (
                            <label className="flex items-center gap-2 shrink-0 px-1 cursor-pointer select-none">
                                <span className="text-caption-2 font-medium text-grey">Polymorphic</span>
                                <Switch checked={isPoly} onChange={togglePolymorphic} aria-label={`${field.name} polymorphic`} />
                            </label>
                        )}
                        {!isPoly && (
                            <label className="flex items-center gap-2 shrink-0 px-1 cursor-pointer select-none">
                                <span className="text-caption-2 font-medium text-grey">Reverse</span>
                                <Switch checked={isReverse} onChange={toggleReverse} aria-label={`${field.name} reverse relation`} />
                            </label>
                        )}
                    </>
                )}

                {(isComp || isZone) ? (
                    isZone ? null : (
                        <label className="flex items-center gap-2 shrink-0 px-1 cursor-pointer select-none">
                            <span className="text-caption-2 font-medium text-grey">Repeatable</span>
                            <Switch checked={!!field.repeatable} onChange={(v) => onUpdate({ repeatable: v })} aria-label={`${field.name} repeatable`} />
                        </label>
                    )
                ) : (
                    <div className="flex items-center gap-1.5 shrink-0 px-1">
                        <Checkbox checked={field.required} onChange={() => onUpdate({ required: !field.required })} aria-label={`${field.name} required`} />
                        <span className="text-caption-2 text-grey">Req</span>
                    </div>
                )}

                <button type="button" onClick={onRemove} aria-label={`Remove ${field.name}`} className="flex items-center justify-center w-8 h-9 rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error shrink-0">
                    <Icon className="w-4 h-4 fill-current" name="close" />
                </button>
            </div>

            {/* Optional per-field label (pretty name) + description (helper text),
                both shown to editors in the block editor. The label never changes the
                stored data key — it's purely how the field reads to authors. */}
            <div className="flex flex-col gap-1.5 px-2.5 pb-2.5 -mt-1">
                {(showLabel || field.label) && (
                    <input
                        value={field.label ?? ""}
                        onChange={(e) => onUpdate({ label: e.target.value })}
                        onBlur={(e) => !e.target.value && setShowLabel(false)}
                        autoFocus={showLabel && !field.label}
                        placeholder="Label shown to editors (optional, e.g. “Hero image”)"
                        className="flow-input !py-1.5 !text-caption-2"
                    />
                )}
                {(showDesc || field.description) && (
                    <input
                        value={field.description ?? ""}
                        onChange={(e) => onUpdate({ description: e.target.value })}
                        onBlur={(e) => !e.target.value && setShowDesc(false)}
                        autoFocus={showDesc && !field.description}
                        placeholder="Description shown to editors (optional)"
                        className="flow-input !py-1.5 !text-caption-2"
                    />
                )}
                {((!showLabel && !field.label) || (!showDesc && !field.description) || (canValidate && !showValidation && !hasValidation)) && (
                    <div className="flex flex-wrap items-center gap-3">
                        {!showLabel && !field.label && (
                            <button type="button" onClick={() => setShowLabel(true)} className="inline-flex items-center gap-1 text-caption-2 text-grey transition-colors hover:text-primary">
                                <Icon className="h-3 w-3 fill-current" name="plus" />
                                Add label
                            </button>
                        )}
                        {!showDesc && !field.description && (
                            <button type="button" onClick={() => setShowDesc(true)} className="inline-flex items-center gap-1 text-caption-2 text-grey transition-colors hover:text-primary">
                                <Icon className="h-3 w-3 fill-current" name="plus" />
                                Add description
                            </button>
                        )}
                        {canValidate && !showValidation && !hasValidation && (
                            <button type="button" onClick={() => setShowValidation(true)} className="inline-flex items-center gap-1 text-caption-2 text-grey transition-colors hover:text-primary">
                                <Icon className="h-3 w-3 fill-current" name="plus" />
                                Add validation
                            </button>
                        )}
                    </div>
                )}

                {/* Validation rules + a custom, user-friendly error message. Optional;
                    the backend enforces these and surfaces the message inline. */}
                {canValidate && (showValidation || hasValidation) && (
                    <div className="mt-1 flex flex-col gap-2 rounded-xl border border-grey-light bg-lavender-mist/30 p-2.5 dark:border-grey-light/10 dark:bg-dark-3/30">
                        <div className="flex items-center justify-between">
                            <span className="text-caption-2 font-semibold text-grey">Validation</span>
                            <button type="button" onClick={() => { setShowValidation(false); onUpdate({ validation: undefined }); }} className="text-caption-2 text-grey transition-colors hover:text-error">
                                Clear
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {isNumberField ? (
                                <>
                                    <label className="flex flex-1 basis-28 flex-col gap-1">
                                        <span className="text-caption-2 text-grey">Min value</span>
                                        <input type="number" value={v.min ?? ""} onChange={(e) => setV({ min: e.target.value === "" ? undefined : Number(e.target.value) })} className="flow-input !py-1.5 !text-caption-2" />
                                    </label>
                                    <label className="flex flex-1 basis-28 flex-col gap-1">
                                        <span className="text-caption-2 text-grey">Max value</span>
                                        <input type="number" value={v.max ?? ""} onChange={(e) => setV({ max: e.target.value === "" ? undefined : Number(e.target.value) })} className="flow-input !py-1.5 !text-caption-2" />
                                    </label>
                                </>
                            ) : (
                                <>
                                    <label className="flex flex-1 basis-28 flex-col gap-1">
                                        <span className="text-caption-2 text-grey">Min length</span>
                                        <input type="number" min={0} value={v.minLength ?? ""} onChange={(e) => setV({ minLength: e.target.value === "" ? undefined : Number(e.target.value) })} className="flow-input !py-1.5 !text-caption-2" />
                                    </label>
                                    <label className="flex flex-1 basis-28 flex-col gap-1">
                                        <span className="text-caption-2 text-grey">Max length</span>
                                        <input type="number" min={0} value={v.maxLength ?? ""} onChange={(e) => setV({ maxLength: e.target.value === "" ? undefined : Number(e.target.value) })} className="flow-input !py-1.5 !text-caption-2" />
                                    </label>
                                    <label className="flex flex-[2] basis-44 flex-col gap-1">
                                        <span className="text-caption-2 text-grey">Pattern (regex)</span>
                                        <input value={v.pattern ?? ""} onChange={(e) => setV({ pattern: e.target.value || undefined })} placeholder="e.g. ^[a-z0-9-]+$" className="flow-input !py-1.5 !text-caption-2 font-mono" />
                                    </label>
                                </>
                            )}
                        </div>
                        <label className="flex flex-col gap-1">
                            <span className="text-caption-2 text-grey">Custom error message</span>
                            <input value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Shown when this field fails (e.g. “Enter a valid phone number”)" className="flow-input !py-1.5 !text-caption-2" />
                        </label>
                    </div>
                )}
            </div>

            {/* Inline component → nested fields */}
            {isComp && !isRef && (
                <div className="ml-5 mr-2.5 mb-2.5 pl-3 border-l-2 border-primary/25">
                    {depth >= MAX_INLINE_DEPTH ? (
                        <p className="py-2 text-caption-2 text-grey">
                            This is nested very deep. For structures deeper than this, define a reusable component on the{" "}
                            <strong className="font-semibold text-black dark:text-white">Components</strong> tab and reference it here instead of inlining it.
                        </p>
                    ) : (
                        <FieldList fields={field.fields ?? []} onChange={onUpdateChildren} components={components} contentTypes={contentTypes} allowZones={false} depth={depth + 1} />
                    )}
                </div>
            )}

            {/* Reference component → note */}
            {isRef && (
                <p className="ml-5 mr-2.5 mb-2.5 pl-3 border-l-2 border-primary/25 py-1.5 text-caption-2 text-grey">
                    References the <span className="font-mono text-primary dark:text-lilac">{field.componentApiId}</span> component. Edit its fields in the Components tab.
                </p>
            )}

            {/* Reference relation → polymorphic target picker + note */}
            {isReference && (
                <div className="ml-5 mr-2.5 mb-2.5 pl-3 border-l-2 border-primary/25">
                    {isPoly && (
                        <>
                            <div className="py-1 text-caption-2 text-grey">Allowed types</div>
                            {contentTypes.length === 0 ? (
                                <p className="pb-2 text-caption-2 text-grey">No content types yet.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2 pb-2">
                                    {contentTypes.map((t) => {
                                        const on = (field.referencedTypeIds ?? []).includes(t.id);
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => toggleTargetType(t.id)}
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 rounded-xl border px-2.5 h-8 text-caption-2 transition-colors",
                                                    on ? "border-primary bg-primary/10 text-primary dark:text-lilac" : "border-grey-light text-grey hover:text-primary dark:border-grey-light/10",
                                                )}
                                            >
                                                {on && <Icon className="w-3.5 h-3.5 fill-current" name="check" />}
                                                {t.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                    {isReverse && (
                        <div className="flex flex-wrap items-center gap-2 py-1">
                            <span className="text-caption-2 text-grey">Mapped by</span>
                            <Select
                                variant="field"
                                className="!w-auto"
                                ariaLabel="Mapped-by field"
                                value={field.mappedByField || ""}
                                onChange={(v) => onUpdate({ mappedByField: v })}
                                options={
                                    reverseOwner && reverseOwner.refFields.length
                                        ? reverseOwner.refFields.map((rf) => ({ value: rf.name, label: rf.label }))
                                        : [{ value: "", label: reverseOwner ? `No relation fields on ${reverseOwner.name}` : "Pick a type first" }]
                                }
                            />
                        </div>
                    )}
                    {isReverse ? (
                        <p className="py-1.5 text-caption-2 text-grey">
                            Reverse relation (read-only). Shows {field.multiple ? "all" : "the"}{" "}
                            <span className="font-mono text-primary dark:text-lilac">{reverseOwner?.name ?? "—"}</span>{" "}
                            {field.multiple ? "entries whose" : "entry whose"}{" "}
                            <span className="font-mono text-primary dark:text-lilac">{field.mappedByField || "—"}</span> field links to this one. Filled automatically by the delivery API.
                        </p>
                    ) : (
                        <p className="py-1.5 text-caption-2 text-grey">
                            Links to {field.multiple ? "many" : "one"}{" "}
                            <span className="font-mono text-primary dark:text-lilac">
                                {isPoly
                                    ? (field.referencedTypeIds ?? []).map((id) => contentTypes.find((t) => t.id === id)?.name ?? id).join(", ") || "—"
                                    : contentTypes.find((t) => t.id === field.referencedTypeId)?.name ?? "—"}
                            </span>{" "}
                            {field.multiple ? "entries" : "entry"}. Editors pick existing entries; the delivery API returns the full referenced {field.multiple ? "entries" : "entry"}.
                        </p>
                    )}
                </div>
            )}

            {/* Dynamic zone → allowed components */}
            {isZone && (
                <div className="ml-5 mr-2.5 mb-2.5 pl-3 border-l-2 border-primary/25">
                    <div className="py-1 text-caption-2 text-grey">Allowed sections</div>
                    {components.length === 0 ? (
                        <p className="pb-2 text-caption-2 text-grey">No components yet — create some in the Components tab.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2 pb-2">
                            {components.map((c) => {
                                const on = (field.allowedComponents ?? []).includes(c.apiId);
                                return (
                                    <button
                                        key={c.apiId}
                                        type="button"
                                        onClick={() => toggleAllowed(c.apiId)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-xl border px-2.5 h-8 text-caption-2 transition-colors",
                                            on ? "border-primary bg-primary/10 text-primary dark:text-lilac" : "border-grey-light text-grey hover:text-primary dark:border-grey-light/10",
                                        )}
                                    >
                                        {on && <Icon className="w-3.5 h-3.5 fill-current" name="check" />}
                                        {c.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </Reorder.Item>
    );
};

/** Example social URLs shown as placeholders (never prefilled values). */
const SAMEAS_PLACEHOLDERS = [
    "https://twitter.com/yourbrand",
    "https://linkedin.com/company/yourbrand",
    "https://instagram.com/yourbrand",
    "https://youtube.com/@yourbrand",
];

/** Site-wide structured data (Organization) with a live JSON-LD preview. */
const GlobalSchemaCard = () => {
    const [org, setOrg] = useState(globalSchemaDefaults);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api<{ name?: string; jsonLdOrg: Partial<typeof globalSchemaDefaults> | null }>("/workspace")
            .then((w) => {
                setOrg((d) => ({
                    ...d,
                    ...(w.jsonLdOrg ?? {}),
                    orgName: w.jsonLdOrg?.orgName || w.name || d.orgName,
                }));
            })
            .catch(() => {});
    }, []);

    const cleanSameAs = org.sameAs.map((s) => s.trim()).filter(Boolean);
    const jsonLd = JSON.stringify(
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            ...(org.orgName.trim() ? { name: org.orgName.trim() } : {}),
            ...(org.url.trim() ? { url: org.url.trim() } : {}),
            ...(org.logo.trim() ? { logo: org.logo.trim() } : {}),
            ...(cleanSameAs.length ? { sameAs: cleanSameAs } : {}),
        },
        null,
        2,
    );

    const save = async () => {
        setSaving(true);
        try {
            await api("/workspace", {
                method: "PATCH",
                body: JSON.stringify({
                    jsonLdOrg: { orgName: org.orgName.trim(), url: org.url.trim(), logo: org.logo.trim(), sameAs: cleanSameAs },
                }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            /* ignore */
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <div className="mb-1 flex items-center gap-2">
                <Icon className="w-5 h-5 fill-primary" name="chart" />
                <h2 className="text-h5 text-black dark:text-white">Global structured data</h2>
            </div>
            <p className="mb-5 text-caption-2 text-grey">Organization schema injected site-wide on every page.</p>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-4">
                    <Field label="Organization name">
                        <input value={org.orgName} onChange={(e) => setOrg({ ...org, orgName: e.target.value })} placeholder="Your organization" className="flow-input" />
                    </Field>
                    <Field label="Website URL">
                        <input value={org.url} onChange={(e) => setOrg({ ...org, url: e.target.value })} placeholder="https://yourdomain.com" className="flow-input" />
                    </Field>
                    <Field label="Logo URL">
                        <input value={org.logo} onChange={(e) => setOrg({ ...org, logo: e.target.value })} placeholder="https://yourdomain.com/logo.png" className="flow-input" />
                    </Field>
                    <Field label="Social profiles (sameAs)">
                        <div className="flex flex-col gap-2">
                            {org.sameAs.map((s, i) => (
                                <input
                                    key={i}
                                    value={s}
                                    onChange={(e) => setOrg({ ...org, sameAs: org.sameAs.map((x, j) => (j === i ? e.target.value : x)) })}
                                    placeholder={SAMEAS_PLACEHOLDERS[i] ?? "https://..."}
                                    className="flow-input"
                                />
                            ))}
                        </div>
                    </Field>
                </div>

                <div>
                    <div className="mb-2 text-caption-1 text-grey">JSON-LD preview</div>
                    <pre className="rounded-2xl bg-ink p-4 text-caption-2 leading-relaxed text-lilac overflow-x-auto scrollbar-thin">{jsonLd}</pre>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
                {saved && <span className="text-caption-2 text-grey">Saved</span>}
                <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </Card>
    );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-caption-1 text-grey">{label}</span>
        {children}
    </label>
);

export default SchemaPage;
