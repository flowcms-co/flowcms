"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import UpgradeLock from "@/components/ui/UpgradeLock";
import { usePlan } from "@/components/providers/LicenseProvider";
import { api, ApiError, API_ORIGIN } from "@/lib/api";

type SsoConfig = {
    enabled: boolean;
    issuer: string;
    authorizationUrl: string;
    tokenUrl: string;
    jwksUri: string;
    clientId: string;
    clientSecretSet: boolean;
    autoProvision: boolean;
    allowedDomain: string;
};

const blank: SsoConfig = {
    enabled: false,
    issuer: "",
    authorizationUrl: "",
    tokenUrl: "",
    jwksUri: "",
    clientId: "",
    clientSecretSet: false,
    autoProvision: false,
    allowedDomain: "",
};

const CALLBACK_URL = `${API_ORIGIN}/api/auth/sso/callback`;

/**
 * Settings → Security → Single sign-on (Enterprise `sso`). Configures the
 * per-workspace OIDC provider; the login flow + id_token verification live in the
 * core auth layer. Gated by <UpgradeLock>; the endpoints are gated too. The
 * clientSecret is write-only (never returned) and stored encrypted.
 */
const SsoCard = () => {
    const { has } = usePlan();
    const licensed = has("sso");
    const [cfg, setCfg] = useState<SsoConfig>(blank);
    const [secret, setSecret] = useState("");
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        if (!licensed) return;
        let off = false;
        api<SsoConfig>("/ee/sso")
            .then((c) => !off && setCfg(c))
            .catch(() => {});
        return () => {
            off = true;
        };
    }, [licensed]);

    const set = <K extends keyof SsoConfig>(k: K, v: SsoConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const body: Record<string, unknown> = {
                enabled: cfg.enabled,
                issuer: cfg.issuer,
                authorizationUrl: cfg.authorizationUrl,
                tokenUrl: cfg.tokenUrl,
                jwksUri: cfg.jwksUri,
                clientId: cfg.clientId,
                autoProvision: cfg.autoProvision,
                allowedDomain: cfg.allowedDomain,
            };
            if (secret.trim()) body.clientSecret = secret.trim();
            const updated = await api<SsoConfig>("/ee/sso", { method: "PUT", body: JSON.stringify(body) });
            setCfg(updated);
            setSecret("");
            setMsg({ ok: true, text: "Saved" });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    const copyCallback = () => {
        void navigator.clipboard?.writeText(CALLBACK_URL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    };

    return (
        <UpgradeLock
            feature="sso"
            icon="key"
            title="Single sign-on (OIDC)"
            description="Let your team sign in with your identity provider (Okta, Azure AD, Google Workspace)."
            includes={["OpenID Connect (OIDC)", "id_token signature verification", "Just-in-time provisioning", "Restrict to your email domain"]}
        >
            <Card>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">Single sign-on (OIDC)</h2>
                        <p className="mt-1 text-caption-2 text-grey">Connect an OpenID Connect provider so your team signs in through it.</p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-caption-1 text-black dark:text-white">
                        <input type="checkbox" checked={cfg.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4 accent-primary" />
                        Enabled
                    </label>
                </div>

                {/* Redirect URI to register at the IdP */}
                <div className="mt-4 rounded-lg border border-grey-light bg-lavender-mist px-4 py-3 dark:border-grey-light/10 dark:bg-dark-2">
                    <span className="text-caption-2 text-grey">Add this redirect URI to your IdP app</span>
                    <div className="mt-1 flex items-center gap-2">
                        <code className="min-w-0 grow break-all font-mono text-caption-1 text-primary dark:text-lilac">{CALLBACK_URL}</code>
                        <button type="button" onClick={copyCallback} className="btn-secondary h-8 shrink-0 px-3 text-caption-1">
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Issuer" value={cfg.issuer} onChange={(v) => set("issuer", v)} placeholder="https://idp.example.com" />
                    <Field label="Client ID" value={cfg.clientId} onChange={(v) => set("clientId", v)} placeholder="flowcms" />
                    <Field label="Authorization URL" value={cfg.authorizationUrl} onChange={(v) => set("authorizationUrl", v)} placeholder="https://idp.example.com/authorize" />
                    <Field label="Token URL" value={cfg.tokenUrl} onChange={(v) => set("tokenUrl", v)} placeholder="https://idp.example.com/token" />
                    <Field label="JWKS URI" value={cfg.jwksUri} onChange={(v) => set("jwksUri", v)} placeholder="https://idp.example.com/.well-known/jwks.json" />
                    <Field
                        label="Restrict to email domain (optional)"
                        value={cfg.allowedDomain}
                        onChange={(v) => set("allowedDomain", v)}
                        placeholder="example.com"
                    />
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className="text-caption-1 text-grey">Client secret {cfg.clientSecretSet && <span className="text-success">(set, leave blank to keep)</span>}</span>
                        <input
                            type="password"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder={cfg.clientSecretSet ? "••••••••••••••••" : "Paste the client secret"}
                            autoComplete="new-password"
                            className="flow-input font-mono text-caption-1"
                        />
                    </label>
                </div>

                <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" checked={cfg.autoProvision} onChange={(e) => set("autoProvision", e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                    <span className="text-caption-1 text-black dark:text-white">
                        Auto-provision new users
                        <span className="block text-caption-2 text-grey">Create an Editor account on first sign-in (restricted to the email domain above, if set). Off = only already-invited members can use SSO.</span>
                    </span>
                </label>

                <div className="mt-5 flex items-center justify-end gap-3">
                    {msg && <span className={`text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</span>}
                    <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : "Save SSO settings"}
                    </button>
                </div>
            </Card>
        </UpgradeLock>
    );
};

const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-caption-1 text-grey">{label}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flow-input text-caption-1" />
    </label>
);

export default SsoCard;
