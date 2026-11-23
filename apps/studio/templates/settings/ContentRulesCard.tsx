"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import UpgradeLock from "@/components/ui/UpgradeLock";
import { usePlan } from "@/components/providers/LicenseProvider";
import { api, ApiError } from "@/lib/api";

type Row = { id: string; name: string; apiId: string; guide: { label: string; url: string } | null };

const isHttps = (v: string) => {
    try {
        return new URL(v).protocol === "https:";
    } catch {
        return false;
    }
};

/**
 * Settings → Content → Content rules (Enterprise `content_rules`). Edits the guide link each
 * content type's rule set shows beside its messages. The rules themselves are set per type
 * through the agent model API; enforcement runs in the core content engine. Gated by
 * <UpgradeLock>; the endpoints are gated too.
 */
const ContentRulesCard = () => {
    const { has } = usePlan();
    const licensed = has("content_rules");
    const [rows, setRows] = useState<Row[] | null>(null);
    const [edits, setEdits] = useState<Record<string, { label: string; url: string }>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        if (!licensed) return;
        let off = false;
        api<Row[]>("/ee/content-rules/guides")
            .then((r) => {
                if (off) return;
                setRows(r);
                setEdits(Object.fromEntries(r.map((x) => [x.id, { label: x.guide?.label ?? "", url: x.guide?.url ?? "" }])));
            })
            .catch(() => setRows([]));
        return () => {
            off = true;
        };
    }, [licensed]);

    const save = async (typeId: string | null) => {
        const src = edits[typeId ?? rows?.[0]?.id ?? ""];
        if (!src) return;
        const url = src.url.trim();
        if (url && !isHttps(url)) {
            setMsg({ ok: false, text: "The guide link must be a full https:// address." });
            return;
        }
        setBusy(typeId ?? "all");
        setMsg(null);
        try {
            await api("/ee/content-rules/guide", { method: "PUT", body: JSON.stringify({ url, label: src.label.trim(), ...(typeId ? { typeId } : {}) }) });
            if (!typeId) setEdits((e) => Object.fromEntries(Object.keys(e).map((id) => [id, { label: src.label, url }])));
            setMsg({ ok: true, text: "Saved" });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setBusy(null);
        }
    };

    return (
        <UpgradeLock
            feature="content_rules"
            title="Content rules"
            description="Set the formatting rules each content type must meet, and the guide link editors see beside every message."
            icon="document"
            includes={["Rules that block publishing, scheduling and approval", "Plain messages with a link to your guide", "Auto tidy while editing and on save", "Formatting list with Tidy all in Content quality"]}
        >
            <Card>
                <h2 className="mb-1 text-h5 text-black dark:text-white">Content rules</h2>
                <p className="mb-5 text-caption-2 text-grey">The guide link (SOP) editors see as &ldquo;See: label&rdquo; next to each rule message, set per content type that has rules.</p>
                {rows === null && <p className="text-body-sm text-grey">Loading…</p>}
                {rows?.length === 0 && <p className="text-body-sm text-grey">No content type has rules yet. Rules are set per type through the model API.</p>}
                {rows?.map((r) => {
                    const e = edits[r.id] ?? { label: "", url: "" };
                    return (
                        <div key={r.id} className="mb-4 grid grid-cols-1 gap-3 border-b border-grey-light pb-4 last:border-0 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end dark:border-grey-light/10">
                            <div className="text-title text-black dark:text-white">{r.name}</div>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-caption-1 text-grey">Link text</span>
                                <input value={e.label} onChange={(ev) => setEdits({ ...edits, [r.id]: { ...e, label: ev.target.value } })} placeholder="Guide" className="flow-input" maxLength={80} />
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-caption-1 text-grey">Guide link (https)</span>
                                <input value={e.url} onChange={(ev) => setEdits({ ...edits, [r.id]: { ...e, url: ev.target.value } })} placeholder="https://" className="flow-input" inputMode="url" />
                            </label>
                            <button type="button" onClick={() => void save(r.id)} disabled={busy !== null} className="btn-primary disabled:opacity-60">
                                {busy === r.id ? "Saving…" : "Save"}
                            </button>
                        </div>
                    );
                })}
                {rows && rows.length > 1 && (
                    <div className="mt-2 flex justify-end">
                        <button type="button" onClick={() => void save(null)} disabled={busy !== null} className="btn-secondary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                            {busy === "all" ? "Saving…" : `Use the first row's link for all (${rows.length})`}
                        </button>
                    </div>
                )}
                {msg && <p className={`mt-3 text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</p>}
            </Card>
        </UpgradeLock>
    );
};

export default ContentRulesCard;
