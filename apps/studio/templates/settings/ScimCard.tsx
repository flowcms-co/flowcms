"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import UpgradeLock from "@/components/ui/UpgradeLock";
import { usePlan } from "@/components/providers/LicenseProvider";
import { api, ApiError, API_ORIGIN } from "@/lib/api";

type ScimToken = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type Minted = { token: string; id: string; name: string; prefix: string };

const SCIM_BASE = `${API_ORIGIN}/api/scim/v2`;

/**
 * Settings → Security → SCIM provisioning (Enterprise `scim`). Mints/lists/revokes
 * the bearer tokens an IdP uses against the SCIM 2.0 endpoint, and shows the base
 * URL to register. Gated by <UpgradeLock>; the endpoints are gated too.
 */
const ScimCard = () => {
    const { has } = usePlan();
    const licensed = has("scim");
    const [tokens, setTokens] = useState<ScimToken[] | null>(null);
    const [name, setName] = useState("");
    const [minted, setMinted] = useState<Minted | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        api<ScimToken[]>("/ee/scim/tokens")
            .then(setTokens)
            .catch(() => setTokens([]));
    };

    useEffect(() => {
        if (!licensed) return;
        load();
    }, [licensed]);

    const mint = async () => {
        setBusy(true);
        setError(null);
        try {
            const t = await api<Minted>("/ee/scim/tokens", { method: "POST", body: JSON.stringify({ name }) });
            setMinted(t);
            setName("");
            load();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not create a token.");
        } finally {
            setBusy(false);
        }
    };

    const revoke = async (id: string) => {
        if (!window.confirm("Revoke this SCIM token? The IdP using it will stop being able to provision users.")) return;
        try {
            await api(`/ee/scim/tokens/${id}`, { method: "DELETE" });
            load();
        } catch (e) {
            window.alert(e instanceof ApiError ? e.message : "Could not revoke.");
        }
    };

    const copy = (text: string, key: string) => {
        void navigator.clipboard?.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 1500);
        }).catch(() => {});
    };

    return (
        <UpgradeLock
            feature="scim"
            icon="users"
            title="SCIM user provisioning"
            description="Create, update, and deactivate users automatically from your identity provider, no manual invites."
            includes={["SCIM 2.0 Users endpoint", "Auto-provision on assign", "Deactivate on unassign", "Bearer-token authenticated"]}
        >
            <Card>
                <h2 className="text-h5 text-black dark:text-white">SCIM provisioning</h2>
                <p className="mt-1 text-caption-2 text-grey">Point your IdP at the SCIM 2.0 endpoint and authenticate it with a token below.</p>

                {/* SCIM base URL */}
                <div className="mt-4 rounded-lg border border-grey-light bg-lavender-mist px-4 py-3 dark:border-grey-light/10 dark:bg-dark-2">
                    <span className="text-caption-2 text-grey">SCIM 2.0 base URL</span>
                    <div className="mt-1 flex items-center gap-2">
                        <code className="min-w-0 grow break-all font-mono text-caption-1 text-primary dark:text-lilac">{SCIM_BASE}</code>
                        <button type="button" onClick={() => copy(SCIM_BASE, "base")} className="btn-secondary h-8 shrink-0 px-3 text-caption-1">
                            {copied === "base" ? "Copied" : "Copy"}
                        </button>
                    </div>
                </div>

                {error && <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>}

                {/* Freshly minted token (shown once) */}
                {minted && (
                    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                        <p className="text-caption-1 font-semibold text-black dark:text-white">Copy your SCIM token now</p>
                        <p className="mt-0.5 text-caption-2 text-grey">It won&apos;t be shown again. Paste it as the bearer token in your IdP&apos;s SCIM settings.</p>
                        <div className="mt-2 flex items-center gap-2">
                            <code className="min-w-0 grow break-all font-mono text-caption-1 text-black dark:text-white">{minted.token}</code>
                            <button type="button" onClick={() => copy(minted.token, "token")} className="btn-primary h-8 shrink-0 px-3 text-caption-1">
                                {copied === "token" ? "Copied" : "Copy"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Mint a token */}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="flex grow flex-col gap-1.5">
                        <span className="text-caption-1 text-grey">New token name</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Okta provisioning" className="flow-input text-caption-1" />
                    </label>
                    <button type="button" onClick={mint} disabled={busy} className="btn-primary disabled:opacity-60">
                        {busy ? "Creating…" : "Create token"}
                    </button>
                </div>

                {/* Existing tokens */}
                <div className="mt-5">
                    {tokens === null ? (
                        <p className="py-4 text-center text-caption-1 text-grey">Loading…</p>
                    ) : tokens.length === 0 ? (
                        <p className="py-4 text-center text-caption-1 text-grey">No SCIM tokens yet.</p>
                    ) : (
                        <ul className="divide-y divide-grey-light/60 dark:divide-grey-light/5">
                            {tokens.map((t) => (
                                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                                    <div className="min-w-0">
                                        <div className="truncate text-body-sm text-black dark:text-white">{t.name}</div>
                                        <div className="text-caption-2 text-grey">
                                            <span className="font-mono">{t.prefix}…</span> · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "never used"}
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => revoke(t.id)} className="btn-danger h-8 shrink-0 px-3 text-caption-1">
                                        Revoke
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Card>
        </UpgradeLock>
    );
};

export default ScimCard;
