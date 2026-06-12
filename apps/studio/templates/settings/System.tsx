"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import WhiteLabelCard from "@/templates/settings/WhiteLabelCard";
import ApprovalsCard from "@/templates/settings/ApprovalsCard";
import { api, ApiError } from "@/lib/api";
import { clearWorkspaceCache, type Workspace } from "@/lib/useWorkspace";

/**
 * System — workspace identity, the frontend preview URL, data export, and the
 * destructive workspace actions. Integrations live under Settings → Integrations.
 */
const System = () => {
    const [name, setName] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        let off = false;
        api<Workspace>("/workspace")
            .then((w) => {
                if (off) return;
                setName(w.name);
                setPreviewUrl(w.previewUrl ?? "");
            })
            .catch(() => {});
        return () => {
            off = true;
        };
    }, []);

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api("/workspace", { method: "PATCH", body: JSON.stringify({ name: name.trim(), previewUrl: previewUrl.trim() }) });
            clearWorkspaceCache();
            setMsg({ ok: true, text: "Saved" });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-5">Workspace</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Workspace name">
                        <input value={name} onChange={(e) => setName(e.target.value)} className="flow-input" />
                    </Field>
                    <Field label="Live preview URL">
                        <input
                            value={previewUrl}
                            onChange={(e) => setPreviewUrl(e.target.value)}
                            placeholder="https://yoursite.com/preview?slug={slug}"
                            className="flow-input"
                        />
                    </Field>
                </div>
                <p className="mt-2.5 max-w-[44rem] text-caption-2 leading-relaxed text-grey">
                    Where the editor&apos;s <strong className="font-semibold text-black dark:text-white">Preview</strong> opens your
                    real site with the draft injected. Use{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{slug}"}</code>,{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{id}"}</code>,{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{type}"}</code> or{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{locale}"}</code>{" "}
                    placeholders. Leave empty to preview rendered content only. Your frontend reads the draft via the public API with a
                    Preview token (Settings → Developers).
                </p>
                <button
                    type="button"
                    onClick={() => setPreviewUrl(`${window.location.origin}/preview/site-demo?id={id}`)}
                    className="mt-2 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70"
                >
                    Use the bundled example frontend →
                </button>
                <div className="mt-5 flex items-center justify-end gap-3">
                    {msg && <span className={`text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</span>}
                    <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </Card>

            <ApprovalsCard />

            <WhiteLabelCard />

            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-1">Data</h2>
                <p className="text-caption-2 text-grey mb-4">Export all workspace content and media.</p>
                <button type="button" className="btn-secondary">
                    <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="download" />
                    Export workspace
                </button>
            </Card>

            <Card className="!border !border-error/20">
                <h2 className="text-h5 text-error mb-1">Danger zone</h2>
                <p className="text-caption-2 text-grey mb-4">
                    Permanently delete this workspace and all its content.
                </p>
                <button
                    type="button"
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-error/10 text-error font-bold transition-colors hover:bg-error/20"
                >
                    <Icon className="w-5 h-5 fill-error" name="trash" />
                    Delete workspace
                </button>
            </Card>
        </div>
    );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-caption-1 text-grey">{label}</span>
        {children}
    </label>
);

export default System;
