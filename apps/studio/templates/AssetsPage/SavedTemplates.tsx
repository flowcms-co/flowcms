"use client";

import { useRef, useState } from "react";
import { elementTemplate } from "@flowcms/shared/elements";
import ElementDrawer from "@/components/editor/ElementDrawer";
import NameDialog from "@/components/editor/NameDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { confirm, notice } from "@/components/providers/ConfirmProvider";
import { api, ApiError } from "@/lib/api";
import { changeMessage, pagesWord, reloadSavedTemplates, useSavedTemplates, type SavedTemplate, type UsedOn } from "@/lib/elementTemplates";

const fail = (title: string, e: unknown) => notice({ title, message: e instanceof ApiError ? e.message : "Try again." });
const btn = "inline-flex h-8 items-center rounded-lg px-2.5 text-caption-2 font-semibold text-primary transition-colors hover:bg-lavender-mist disabled:opacity-50 dark:text-lilac dark:hover:bg-dark-3";

/** Assets > Element templates: the workspace's saved templates that pages link to. */
const SavedTemplates = () => {
    const { can } = useAuth();
    const canEdit = can("content.update");
    const canDelete = can("content.delete");
    const rows = useSavedTemplates(true);
    const [dialog, setDialog] = useState<{ kind: "rename" | "duplicate"; t: SavedTemplate } | null>(null);
    const [editing, setEditing] = useState<SavedTemplate | null>(null);
    const [note, setNote] = useState("");
    const file = useRef<HTMLInputElement>(null);

    const remove = async (t: SavedTemplate) => {
        let used: UsedOn[] = [];
        try {
            used = (await api<{ usedOn: UsedOn[] }>(`/element-templates/${t.id}`)).usedOn;
        } catch (e) {
            return void fail("Could not check where it is used", e);
        }
        const names = used.slice(0, 8).map((u) => `• ${u.title || u.slug}`).join("\n") + (used.length > 8 ? `\n• and ${used.length - 8} more` : "");
        const ok = await confirm({
            title: `Delete “${t.name}”?`,
            message: used.length ? `It is used on ${pagesWord(used.length)}:\n${names}\n\nThey keep the values they had when last saved, but stop following this template.` : "No page uses it.",
            confirmLabel: "Delete template",
            tone: "danger",
        });
        if (!ok) return;
        try {
            await api(`/element-templates/${t.id}?force=1`, { method: "DELETE" });
            await reloadSavedTemplates();
        } catch (e) {
            void fail("Could not delete the template", e);
        }
    };

    const exportAll = async () => {
        try {
            const data = await api<unknown>("/element-templates/export");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            a.download = "element-templates.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        } catch (e) {
            void fail("Could not export", e);
        }
    };

    const importFile = async (f: File) => {
        setNote("");
        try {
            const out = await api<{ created: number; updated: number }>("/element-templates/import", { method: "POST", body: await f.text() });
            setNote(`Imported: ${out.created} new, ${out.updated} updated.`);
            await reloadSavedTemplates();
        } catch (e) {
            void fail("Nothing was imported", e);
        }
    };

    const saveValues = async (t: SavedTemplate, values: Record<string, unknown>) => {
        if (!(await confirm({ title: `Update “${t.name}”?`, message: changeMessage(t.name, t.pages), confirmLabel: "Update template" }))) return;
        try {
            await api(`/element-templates/${t.id}`, { method: "PATCH", body: JSON.stringify({ values }) });
            await reloadSavedTemplates();
            setEditing(null);
        } catch (e) {
            void fail("The template was not changed", e);
        }
    };

    return (
        <section aria-label="Saved templates" className="mt-8">
            <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-h6 text-black dark:text-white">Saved templates</h2>
                <span className="text-caption-1 text-grey">Pages link to these. Change one and every page using it changes.</span>
                <span className="ml-auto flex gap-2">
                    {canEdit && (
                        <button type="button" className="btn-secondary" onClick={() => file.current?.click()}>
                            Import
                        </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={exportAll} disabled={!rows?.length}>
                        Export
                    </button>
                    <input ref={file} type="file" accept="application/json,.json" aria-label="Import templates" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
                </span>
            </div>
            {note && <p className="mb-2 text-caption-1 text-success" aria-live="polite">{note}</p>}
            <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_0.25rem_1.25rem_rgba(26,26,46,0.06)] dark:bg-dark-1">
                <table className="w-full text-left text-caption-1">
                    <thead>
                        <tr className="border-b border-grey-light text-caption-2 text-grey dark:border-grey-light/15">
                            <th className="px-4 py-2 font-semibold">Name</th>
                            <th className="px-4 py-2 font-semibold">Element</th>
                            <th className="px-4 py-2 font-semibold">Pages using it</th>
                            <th className="px-4 py-2 font-semibold">Updated</th>
                            <th className="px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows === null && (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-grey">Loading…</td>
                            </tr>
                        )}
                        {rows?.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-grey">No saved templates yet. Open an element in the editor and choose “Save as template”, or import a file.</td>
                            </tr>
                        )}
                        {rows?.map((t) => (
                            <tr key={t.id} data-template-row={t.name} className="border-b border-grey-light last:border-b-0 dark:border-grey-light/15">
                                <td className="px-4 py-2 font-semibold text-black dark:text-white">{t.name}</td>
                                <td className="px-4 py-2 text-grey">{elementTemplate(t.element)?.name ?? t.element}</td>
                                <td className="px-4 py-2 text-black dark:text-white">{t.pages}</td>
                                <td className="px-4 py-2 text-grey">{new Date(t.updatedAt).toLocaleDateString()}</td>
                                <td className="whitespace-nowrap px-4 py-2 text-right">
                                    {canEdit && elementTemplate(t.element) && <button type="button" className={btn} onClick={() => setEditing(t)}>Edit</button>}
                                    {canEdit && <button type="button" className={btn} onClick={() => setDialog({ kind: "rename", t })}>Rename</button>}
                                    {canEdit && <button type="button" className={btn} onClick={() => setDialog({ kind: "duplicate", t })}>Duplicate</button>}
                                    {canDelete && <button type="button" className={`${btn} !text-error`} onClick={() => void remove(t)}>Delete</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {dialog && (
                <NameDialog
                    title={dialog.kind === "rename" ? `Rename “${dialog.t.name}”` : `Duplicate “${dialog.t.name}”`}
                    hint={dialog.kind === "duplicate" ? "The copy starts with the same values and no pages. Link a page to it by opening the element on that page." : undefined}
                    initial={dialog.kind === "rename" ? dialog.t.name : `${dialog.t.name} 2`}
                    confirmLabel={dialog.kind === "rename" ? "Rename" : "Duplicate"}
                    onSubmit={async (name) => {
                        if (dialog.kind === "rename") await api(`/element-templates/${dialog.t.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
                        else await api(`/element-templates/${dialog.t.id}/duplicate`, { method: "POST", body: JSON.stringify({ name }) });
                        await reloadSavedTemplates();
                        setDialog(null);
                    }}
                    onClose={() => setDialog(null)}
                />
            )}
            {editing && elementTemplate(editing.element) && (
                <ElementDrawer template={elementTemplate(editing.element)!} initial={editing.values} editing onSave={(v) => void saveValues(editing, v)} onClose={() => setEditing(null)} />
            )}
        </section>
    );
};

export default SavedTemplates;
