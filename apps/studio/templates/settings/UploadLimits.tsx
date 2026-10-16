"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { notice } from "@/components/providers/ConfirmProvider";
import { api, ApiError } from "@/lib/api";

type Limits = { maxMb: number; allowedTypes: string[]; knownTypes: string[] };

/** Largest upload and the file types the media library accepts (studio and agent API alike). */
const UploadLimits = () => {
    const [l, setL] = useState<Limits | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        api<Limits>("/assets/limits").then(setL).catch(() => {});
    }, []);
    if (!l) return <p className="py-6 text-center text-caption-1 text-grey">Loading…</p>;

    const save = async () => {
        setSaving(true);
        try {
            setL(await api<Limits>("/assets/limits", { method: "PATCH", body: JSON.stringify({ maxMb: l.maxMb, allowedTypes: l.allowedTypes }) }));
            void notice({ title: "Saved", message: "Upload limits updated." });
        } catch (e) {
            void notice({ title: "Couldn't save", message: e instanceof ApiError ? e.message : "Please try again.", tone: "danger" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <h2 className="text-h5 text-black dark:text-white">Uploads</h2>
            <p className="mt-1 text-caption-2 text-grey">Applies to the media library and the agent API. SVG stays off: an SVG file can carry script.</p>
            <label className="mt-4 flex items-center gap-3 text-body-sm text-black dark:text-white">
                Largest file
                <input type="number" min={1} value={l.maxMb} onChange={(e) => setL({ ...l, maxMb: Number(e.target.value) })} className="flow-input h-9 w-24" />
                MB
            </label>
            <fieldset className="mt-4">
                <legend className="mb-2 text-caption-1 text-black dark:text-white">Allowed file types</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {l.knownTypes.map((t) => (
                        <label key={t} className="flex items-center gap-1.5 text-body-sm text-black dark:text-white">
                            <input
                                type="checkbox"
                                checked={l.allowedTypes.includes(t)}
                                onChange={(e) => setL({ ...l, allowedTypes: e.target.checked ? [...l.allowedTypes, t] : l.allowedTypes.filter((x) => x !== t) })}
                                className="h-4 w-4 accent-primary"
                            />
                            .{t}
                        </label>
                    ))}
                </div>
            </fieldset>
            <button type="button" onClick={save} disabled={saving} className="btn-primary mt-5 h-9 px-4 text-caption-1 disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
            </button>
        </Card>
    );
};

export default UploadLimits;
