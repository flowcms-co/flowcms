"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import UpgradeLock from "@/components/ui/UpgradeLock";
import { api, ApiError } from "@/lib/api";
import { clearWorkspaceCache, type Workspace } from "@/lib/useWorkspace";

const HEX = /^#?[0-9a-fA-F]{6}$/;

/**
 * Settings → System → Branding (Enterprise `white_label`). Sets this workspace's
 * studio brand: logo, product name, accent color. Wrapped in <UpgradeLock> so
 * Community/Pro see the locked promo; the write endpoint (PUT /ee/white-label) is
 * gated too. On save it reloads so the new branding applies everywhere at once.
 */
const WhiteLabelCard = () => {
    const [name, setName] = useState("");
    const [logo, setLogo] = useState("");
    const [accent, setAccent] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        let off = false;
        api<Workspace>("/workspace")
            .then((w) => {
                if (off) return;
                setName(w.brandName ?? "");
                setLogo(w.brandLogoUrl ?? "");
                setAccent(w.brandAccent ?? "");
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
            await api("/ee/white-label", {
                method: "PUT",
                body: JSON.stringify({ brandName: name.trim(), brandLogoUrl: logo.trim(), brandAccent: accent.trim() }),
            });
            clearWorkspaceCache();
            setMsg({ ok: true, text: "Saved, applying…" });
            // The brand touches the whole shell (sidebar logo + accent), so reload
            // to apply it consistently everywhere.
            setTimeout(() => window.location.reload(), 600);
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
            setSaving(false);
        }
    };

    const swatch = accent && HEX.test(accent) ? (accent.startsWith("#") ? accent : `#${accent}`) : "#6c5ce7";

    return (
        <UpgradeLock
            feature="white_label"
            title="White-label branding"
            description="Replace Flow CMS branding with your own across this workspace's studio."
            icon="sparkles"
            includes={[
                "Your logo in the sidebar, in place of the FlowCMS mark",
                "Your product name instead of the Flow CMS wordmark",
                "A brand accent color applied across the studio",
            ]}
        >
            <Card>
                <h2 className="mb-1 text-h5 text-black dark:text-white">Branding</h2>
                <p className="mb-5 text-caption-2 text-grey">
                    Your logo, product name and accent color, shown across this workspace&apos;s studio.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-caption-1 text-grey">Product name</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" className="flow-input" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-caption-1 text-grey">Logo URL</span>
                        <input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://… or /media/…" className="flow-input" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-caption-1 text-grey">Accent color</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                aria-label="Accent color"
                                value={swatch}
                                onChange={(e) => setAccent(e.target.value)}
                                className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-grey-light bg-surface p-1 dark:border-grey-light/15 dark:bg-dark-1"
                            />
                            <input value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#6C5CE7" className="flow-input" />
                        </div>
                    </label>
                </div>
                <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-lavender-mist/60 px-3 py-2.5 dark:bg-dark-3/50">
                    {logo.trim() ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo.trim()} alt="" className="h-8 w-8 shrink-0 rounded-[0.6rem] object-cover" />
                    ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] text-[0.72rem] font-bold text-white" style={{ backgroundColor: swatch }}>
                            {(name || "WS").slice(0, 2).toUpperCase()}
                        </span>
                    )}
                    <span className="text-caption-2 text-grey">
                        Preview: <span className="font-semibold text-black dark:text-white">{name || "Your workspace"}</span>
                    </span>
                </div>
                <div className="mt-5 flex items-center justify-end gap-3">
                    {msg && <span className={`text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</span>}
                    <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : "Save branding"}
                    </button>
                </div>
            </Card>
        </UpgradeLock>
    );
};

export default WhiteLabelCard;
