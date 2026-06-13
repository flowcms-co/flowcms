"use client";

import { useCallback, useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Checkbox from "@/components/ui/Checkbox";
import Switch from "@/components/ui/Switch";
import Select from "@/components/ui/Select";
import {
    FIELD_TYPES,
    SCHEMA_JSONLD,
    globalSchemaDefaults,
    type ContentTypeSchema,
    type FieldType,
    type SchemaField,
} from "@/mocks/schema";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

let idSeq = 0;
const newId = () => `nf-${(idSeq += 1)}`;
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

/**
 * Schema Builder (Content Model) — Strapi-style content-type builder. Define
 * content types and their fields, including nested + repeatable **components**,
 * with drag-to-reorder at every level. Plus site-wide structured-data defaults.
 * Mock state for now; the backend persists the model later.
 */
const SchemaPage = () => {
    const [types, setTypes] = useState<ContentTypeSchema[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await api<ContentTypeSchema[]>("/content-types");
            setTypes(data);
            setActiveId((cur) => cur ?? data[0]?.id ?? null);
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

    const active = types.find((t) => t.id === activeId) ?? null;

    const patchActive = (patch: Partial<ContentTypeSchema>) => {
        if (!active) return;
        setTypes((prev) => prev.map((t) => (t.id === active.id ? { ...t, ...patch } : t)));
        setDirty(true);
    };
    const setActiveFields = (fields: SchemaField[]) => patchActive({ fields });
    const setJsonLd = (jsonLd: string) => patchActive({ jsonLd });

    const addType = async () => {
        const created = await api<ContentTypeSchema>("/content-types", {
            method: "POST",
            body: JSON.stringify({
                name: "New type",
                schema: { icon: "document", color: "#6C5CE7", jsonLd: "Article", fields: [] },
            }),
        });
        setTypes((prev) => [...prev, created]);
        setActiveId(created.id);
        setDirty(false);
    };

    const saveActive = async () => {
        if (!active) return;
        setSaving(true);
        try {
            await api(`/content-types/${active.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: active.name,
                    schema: {
                        icon: active.icon,
                        color: active.color,
                        jsonLd: active.jsonLd,
                        fields: active.fields,
                    },
                }),
            });
            setDirty(false);
        } finally {
            setSaving(false);
        }
    };

    const deleteType = async () => {
        if (!active) return;
        if (!window.confirm(`Delete the "${active.name}" content type?`)) return;
        await api(`/content-types/${active.id}`, { method: "DELETE" });
        const next = types.filter((t) => t.id !== active.id);
        setTypes(next);
        setActiveId(next[0]?.id ?? null);
        setDirty(false);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_1fr]">
                {/* Content type list */}
                <Card className="flex flex-col h-full !p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-h5 text-black dark:text-white">
                            Content types
                        </h2>
                        <span className="text-caption-2 text-grey">{types.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {types.map((t) => {
                            const isActive = t.id === activeId;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveId(t.id)}
                                    className={cn(
                                        "flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all",
                                        isActive
                                            ? "bg-primary text-white shadow-glow"
                                            : "hover:bg-lavender-mist dark:hover:bg-dark-3",
                                    )}
                                >
                                    <span
                                        className="flex items-center justify-center w-9 h-9 rounded-[0.625rem] shrink-0"
                                        style={{
                                            backgroundColor: isActive
                                                ? "rgba(255,255,255,0.18)"
                                                : `${t.color}22`,
                                        }}
                                    >
                                        <Icon
                                            className="w-4 h-4"
                                            name={t.icon}
                                            fill={isActive ? "#fff" : t.color}
                                        />
                                    </span>
                                    <span className="min-w-0">
                                        <span
                                            className={cn(
                                                "block truncate text-title",
                                                isActive
                                                    ? "text-white"
                                                    : "text-black dark:text-white",
                                            )}
                                        >
                                            {t.name}
                                        </span>
                                        <span
                                            className={cn(
                                                "block text-caption-2",
                                                isActive ? "text-white/70" : "text-grey",
                                            )}
                                        >
                                            {t.fields.length} fields
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button type="button" onClick={addType} className="btn-secondary w-full mt-4">
                        <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="plus" />
                        New type
                    </button>
                </Card>

                {/* Field editor */}
                <Card className="flex flex-col h-full">
                    {!active ? (
                        <div className="grid h-full place-items-center py-16 text-center">
                            <div>
                                <p className="text-body-sm text-grey">
                                    {loading ? "Loading content types…" : "No content types yet."}
                                </p>
                                {!loading && (
                                    <button type="button" onClick={addType} className="btn-primary mt-4">
                                        <Icon className="w-5 h-5 fill-white" name="plus" />
                                        Create your first type
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span
                                        className="flex items-center justify-center w-11 h-11 rounded-2xl shrink-0"
                                        style={{ backgroundColor: `${active.color}22` }}
                                    >
                                        <Icon className="w-5 h-5" name={active.icon} fill={active.color} />
                                    </span>
                                    <div className="min-w-0">
                                        <input
                                            value={active.name}
                                            onChange={(e) => patchActive({ name: e.target.value })}
                                            className="w-full bg-transparent font-poppins text-h5 font-bold text-black outline-none dark:text-white"
                                            aria-label="Content type name"
                                        />
                                        <p className="text-caption-2 text-grey">
                                            <span className="font-mono">{active.apiId}</span> · {active.fields.length} fields · drag to reorder
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2">
                                        <span className="text-caption-1 text-grey">Schema</span>
                                        <Select
                                            variant="field"
                                            className="!w-auto"
                                            ariaLabel="Schema type"
                                            value={active.jsonLd}
                                            onChange={setJsonLd}
                                            options={SCHEMA_JSONLD.map((s) => ({ value: s, label: s }))}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={deleteType}
                                        aria-label="Delete type"
                                        className="flex items-center justify-center w-10 h-10 rounded-xl text-grey transition-colors hover:bg-error/10 hover:text-error"
                                    >
                                        <Icon className="w-5 h-5 fill-current" name="trash" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveActive}
                                        disabled={saving || !dirty}
                                        className="btn-primary disabled:opacity-50"
                                    >
                                        {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                                    </button>
                                </div>
                            </div>

                            {/* Recursive, drag-reorderable field tree */}
                            <FieldList fields={active.fields} onChange={setActiveFields} />
                        </>
                    )}
                </Card>
            </div>

            <GlobalSchemaCard />
        </div>
    );
};

/** A reorderable list of fields. Recurses into component fields for nesting. */
const FieldList = ({
    fields,
    onChange,
    depth = 0,
}: {
    fields: SchemaField[];
    onChange: (next: SchemaField[]) => void;
    depth?: number;
}) => {
    const update = (id: string, patch: Partial<SchemaField>) =>
        onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));

    return (
        <div className="flex flex-col gap-2">
            <Reorder.Group
                as="div"
                axis="y"
                values={fields}
                onReorder={onChange}
                className="flex flex-col gap-2"
            >
                {fields.map((f) => (
                    <FieldRow
                        key={f.id}
                        field={f}
                        depth={depth}
                        onUpdate={(patch) => update(f.id, patch)}
                        onUpdateChildren={(nf) => update(f.id, { fields: nf })}
                        onRemove={() => remove(f.id)}
                    />
                ))}
            </Reorder.Group>

            <div className="flex flex-wrap gap-2 mt-1">
                <button
                    type="button"
                    onClick={() => onChange([...fields, blankField()])}
                    className="btn-secondary h-9 px-3.5 text-caption-1"
                >
                    <Icon className="w-4 h-4 fill-primary dark:fill-lilac" name="plus" />
                    Add field
                </button>
                <button
                    type="button"
                    onClick={() => onChange([...fields, blankComponent()])}
                    className="btn-ghost h-9 px-3.5 text-caption-1 border border-grey-light dark:border-grey-light/10"
                >
                    <Icon className="w-4 h-4 fill-grey" name="copy" />
                    Add component
                </button>
            </div>
        </div>
    );
};

const FieldRow = ({
    field,
    depth,
    onUpdate,
    onUpdateChildren,
    onRemove,
}: {
    field: SchemaField;
    depth: number;
    onUpdate: (patch: Partial<SchemaField>) => void;
    onUpdateChildren: (next: SchemaField[]) => void;
    onRemove: () => void;
}) => {
    const controls = useDragControls();
    const isComp = field.type === "Component";

    const changeType = (type: FieldType) => {
        if (type === "Component") {
            onUpdate({ type, fields: field.fields ?? [], repeatable: field.repeatable ?? false });
        } else {
            onUpdate({ type, fields: undefined, repeatable: undefined });
        }
    };

    return (
        <Reorder.Item
            as="div"
            value={field}
            dragListener={false}
            dragControls={controls}
            className={cn(
                "rounded-2xl border border-grey-light dark:border-grey-light/10",
                isComp ? "bg-lavender-mist/40 dark:bg-dark-3/40" : "bg-white dark:bg-dark-1",
            )}
        >
            <div className="flex flex-wrap items-center gap-2.5 p-2.5">
                {/* drag handle */}
                <button
                    type="button"
                    aria-label="Drag to reorder"
                    onPointerDown={(e) => controls.start(e)}
                    className="flex items-center justify-center w-7 h-9 shrink-0 cursor-grab text-grey transition-colors hover:text-primary active:cursor-grabbing touch-none"
                >
                    <Icon className="w-4 h-4 fill-current" name="grip" />
                </button>

                {isComp && (
                    <Icon className="w-4 h-4 fill-primary shrink-0" name="copy" />
                )}

                <input
                    value={field.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    className="flow-input !py-2 min-w-0 flex-1 basis-40"
                />

                <Select
                    variant="field"
                    className="!w-auto"
                    ariaLabel="Field type"
                    value={field.type}
                    onChange={(v) => changeType(v as FieldType)}
                    options={FIELD_TYPES.map((ft) => ({ value: ft, label: ft }))}
                />

                {isComp ? (
                    <label className="flex items-center gap-2 shrink-0 px-1 cursor-pointer select-none">
                        <span className="text-caption-2 font-medium text-grey">
                            Repeatable
                        </span>
                        <Switch
                            checked={!!field.repeatable}
                            onChange={(v) => onUpdate({ repeatable: v })}
                            aria-label={`${field.name} repeatable`}
                        />
                    </label>
                ) : (
                    <div className="flex items-center gap-1.5 shrink-0 px-1">
                        <Checkbox
                            checked={field.required}
                            onChange={() => onUpdate({ required: !field.required })}
                            aria-label={`${field.name} required`}
                        />
                        <span className="text-caption-2 text-grey">Req</span>
                    </div>
                )}

                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remove ${field.name}`}
                    className="flex items-center justify-center w-8 h-9 rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error shrink-0"
                >
                    <Icon className="w-4 h-4 fill-current" name="close" />
                </button>
            </div>

            {/* nested fields for component types */}
            {isComp && (
                <div className="ml-5 mr-2.5 mb-2.5 pl-3 border-l-2 border-primary/25">
                    {depth >= 2 ? (
                        <p className="py-2 text-caption-2 text-grey">
                            Max nesting depth reached.
                        </p>
                    ) : (
                        <FieldList
                            fields={field.fields ?? []}
                            onChange={onUpdateChildren}
                            depth={depth + 1}
                        />
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
                    // No saved org schema yet: seed the name from the workspace name
                    // chosen in the welcome wizard, so it is never blank or sample data.
                    orgName: w.jsonLdOrg?.orgName || w.name || d.orgName,
                }));
            })
            .catch(() => {});
    }, []);

    // Only include fields the user has actually filled in; an Organization schema
    // with empty name/url/logo would be invalid to inject site-wide.
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
                    jsonLdOrg: {
                        orgName: org.orgName.trim(),
                        url: org.url.trim(),
                        logo: org.logo.trim(),
                        sameAs: cleanSameAs,
                    },
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
                <h2 className="text-h5 text-black dark:text-white">
                    Global structured data
                </h2>
            </div>
            <p className="mb-5 text-caption-2 text-grey">
                Organization schema injected site-wide on every page.
            </p>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-4">
                    <Field label="Organization name">
                        <input
                            value={org.orgName}
                            onChange={(e) => setOrg({ ...org, orgName: e.target.value })}
                            placeholder="Your organization"
                            className="flow-input"
                        />
                    </Field>
                    <Field label="Website URL">
                        <input
                            value={org.url}
                            onChange={(e) => setOrg({ ...org, url: e.target.value })}
                            placeholder="https://yourdomain.com"
                            className="flow-input"
                        />
                    </Field>
                    <Field label="Logo URL">
                        <input
                            value={org.logo}
                            onChange={(e) => setOrg({ ...org, logo: e.target.value })}
                            placeholder="https://yourdomain.com/logo.png"
                            className="flow-input"
                        />
                    </Field>
                    <Field label="Social profiles (sameAs)">
                        <div className="flex flex-col gap-2">
                            {org.sameAs.map((s, i) => (
                                <input
                                    key={i}
                                    value={s}
                                    onChange={(e) =>
                                        setOrg({
                                            ...org,
                                            sameAs: org.sameAs.map((x, j) =>
                                                j === i ? e.target.value : x,
                                            ),
                                        })
                                    }
                                    placeholder={SAMEAS_PLACEHOLDERS[i] ?? "https://..."}
                                    className="flow-input"
                                />
                            ))}
                        </div>
                    </Field>
                </div>

                <div>
                    <div className="mb-2 text-caption-1 text-grey">JSON-LD preview</div>
                    <pre className="rounded-2xl bg-ink p-4 text-caption-2 leading-relaxed text-lilac overflow-x-auto scrollbar-thin">
                        {jsonLd}
                    </pre>
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

const Field = ({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-caption-1 text-grey">{label}</span>
        {children}
    </label>
);

export default SchemaPage;
