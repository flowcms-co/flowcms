"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { api, ApiError } from "@/lib/api";
import { confirm } from "@/components/providers/ConfirmProvider";
import { useAuth } from "@/components/providers/AuthProvider";

type Shape = { endpoint: string; region: string; bucket: string; publicUrl: string; forcePathStyle: boolean; accessKeyHint: string };
type Status = { source: "studio" | "env" | "local"; saved: (Shape & { updatedAt: string }) | null; env: Shape | null };

const field =
    "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";
const noAuto = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, autoComplete: "off" } as const;
const SOURCE: Record<Status["source"], string> = {
    studio: "Using the keys saved here (encrypted).",
    env: "Using S3_* environment variables on the server.",
    local: "Using the server's local disk.",
};

/** Settings > Integrations > Storage: S3-compatible media storage (Cloudflare R2, S3, Supabase, MinIO). */
const StorageSettings = () => {
    const { user } = useAuth();
    const owner = user?.role.key === "super_admin";
    const [status, setStatus] = useState<Status | null>(null);
    const [form, setForm] = useState({ endpoint: "", region: "auto", bucket: "", publicUrl: "", forcePathStyle: true, accessKeyId: "", secretAccessKey: "" });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const load = useCallback(async () => {
        const s = await api<Status>("/storage").catch(() => null);
        setStatus(s);
        const base = s?.saved ?? s?.env;
        if (base) setForm((f) => ({ ...f, endpoint: base.endpoint, region: base.region || "auto", bucket: base.bucket, publicUrl: base.publicUrl, forcePathStyle: base.forcePathStyle }));
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
    const knownKeys = status?.saved?.accessKeyHint || status?.env?.accessKeyHint;

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const s = await api<Status>("/storage", { method: "PUT", body: JSON.stringify(form) });
            setStatus(s);
            setForm((f) => ({ ...f, accessKeyId: "", secretAccessKey: "" }));
            setMsg({ ok: true, text: "Checked and saved. New uploads use these keys now." });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        const fallback = status?.env ? "the S3_* environment variables" : "the server's local disk";
        if (!(await confirm({ title: "Remove saved storage keys?", message: `Media will be served from ${fallback}. Files already in the bucket stay there but may stop loading if the fallback points elsewhere.`, confirmLabel: "Remove", tone: "danger" }))) return;
        setStatus(await api<Status>("/storage", { method: "DELETE" }));
    };

    if (!status) return null;

    return (
        <Card className="flex flex-col">
            <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                    <Icon className="h-5 w-5 fill-primary" name="image" />
                </span>
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Media storage</h2>
                    <p className="text-caption-2 text-grey">{SOURCE[status.source]}</p>
                </div>
            </div>

            {status.source === "studio" && status.env && (
                <div className="mb-5 rounded-2xl bg-warning/10 px-4 py-3 text-body-sm text-black dark:text-white">
                    The saved keys are in use. Delete <span className="font-mono">S3_ACCESS_KEY_ID</span> and <span className="font-mono">S3_SECRET_ACCESS_KEY</span> from your host&rsquo;s environment so they can&rsquo;t leak from there.
                </div>
            )}
            {status.source === "env" && (
                <p className="mb-5 text-body-sm text-grey">
                    Save below to move these settings into Studio. Leave the key fields blank to copy the current keys, or enter new ones. Then delete the S3_* key variables from your host.
                </p>
            )}

            <fieldset disabled={!owner} className="grid grid-cols-1 gap-4 disabled:opacity-70 sm:grid-cols-2">
                <label className="block sm:col-span-2"><span className="mb-1.5 block text-caption-1 text-grey">Endpoint</span><input value={form.endpoint} onChange={set("endpoint")} placeholder="https://<account-id>.r2.cloudflarestorage.com" className={field} {...noAuto} /></label>
                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Bucket</span><input value={form.bucket} onChange={set("bucket")} placeholder="media" className={field} {...noAuto} /></label>
                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Region</span><input value={form.region} onChange={set("region")} placeholder="auto" className={field} {...noAuto} /></label>
                <label className="block sm:col-span-2"><span className="mb-1.5 block text-caption-1 text-grey">Public URL</span><input value={form.publicUrl} onChange={set("publicUrl")} placeholder="https://media.yourdomain.com" className={field} {...noAuto} /></label>
                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Access key ID</span><input value={form.accessKeyId} onChange={set("accessKeyId")} placeholder={knownKeys ? `${knownKeys} (unchanged)` : ""} className={field} {...noAuto} /></label>
                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Secret access key</span><input type="password" value={form.secretAccessKey} onChange={set("secretAccessKey")} placeholder={knownKeys ? "•••••••• (unchanged)" : ""} className={field} {...noAuto} /></label>
                <label className="flex items-center gap-2.5 text-body-sm text-black dark:text-white sm:col-span-2">
                    <Switch checked={form.forcePathStyle} onChange={(v) => setForm({ ...form, forcePathStyle: v })} aria-label="Path-style URLs" /> Path-style URLs (leave on for R2, Supabase and MinIO)
                </label>
            </fieldset>

            <p className="mt-4 text-caption-2 text-grey">
                For Cloudflare R2, create an API token with <span className="font-semibold">Object Read &amp; Write</span> on this bucket only, so a leaked key can&rsquo;t touch anything else. Keys are checked with a test upload before saving, stored encrypted, and never shown again.
            </p>

            {owner ? (
                <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={save} disabled={saving || !form.bucket.trim()} className="btn-primary disabled:opacity-60">{saving ? "Checking…" : status.saved ? "Update" : "Check and save"}</button>
                    {status.saved && <button type="button" onClick={remove} className="btn-secondary">Remove saved keys</button>}
                </div>
            ) : (
                <p className="mt-5 text-caption-2 text-grey">Only a Super Admin can change media storage, since it serves every workspace.</p>
            )}

            {msg && <div className={`mt-4 rounded-2xl px-4 py-3 text-body-sm ${msg.ok ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>{msg.text}</div>}
        </Card>
    );
};

export default StorageSettings;
