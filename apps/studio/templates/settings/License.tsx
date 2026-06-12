"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/lib/api";

type LicenseInfo = {
    valid: boolean;
    plan: "community" | "pro" | "enterprise";
    features: string[];
    seats: number | null;
    expiresAt: string | null;
    expired: boolean;
    customer: string | null;
    source: "env" | "db" | "none";
};

const PLAN_LABEL: Record<string, string> = { community: "Community", pro: "Pro", enterprise: "Enterprise" };
const FEATURE_LABEL: Record<string, string> = {
    "*": "All paid features",
    audit_export: "Audit export (CSV/SIEM)",
    white_label: "White-label / remove branding",
    sso: "SSO / SAML / OIDC",
    scim: "SCIM provisioning",
    advanced_rbac: "Advanced RBAC + workflows",
    multi_workspace: "Multi-workspace console",
};

const Plan = ({ info }: { info: LicenseInfo }) => {
    const isPaid = info.plan !== "community";
    return (
        <span
            className={`rounded-md px-2.5 py-1 text-caption-2 font-semibold ${
                info.expired
                    ? "bg-error/15 text-error"
                    : isPaid
                      ? "bg-primary/15 text-primary dark:text-lilac"
                      : "bg-grey-light text-grey dark:bg-dark-3"
            }`}
        >
            {PLAN_LABEL[info.plan] ?? info.plan}
            {info.expired ? " · expired" : ""}
        </span>
    );
};

const License = () => {
    const { can } = useAuth();
    const manage = can("security.manage");
    const [info, setInfo] = useState<LicenseInfo | null>(null);
    const [key, setKey] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setInfo(await api<LicenseInfo>("/license"));
        } catch {
            /* ignore */
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const activate = async () => {
        setBusy(true);
        setError(null);
        setOk(null);
        try {
            const next = await api<LicenseInfo>("/license", { method: "POST", body: JSON.stringify({ key: key.trim() }) });
            setInfo(next);
            setKey("");
            setOk(`Activated: you're on the ${PLAN_LABEL[next.plan] ?? next.plan} plan.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not activate that key.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        setError(null);
        setOk(null);
        try {
            setInfo(await api<LicenseInfo>("/license", { method: "DELETE" }));
            setOk("License removed: back on Community.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not remove the license.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">Plan &amp; license</h2>
                        <p className="mt-1 text-caption-2 text-grey">
                            Flow CMS is free &amp; open-source. A license key unlocks paid Pro / Enterprise features on this install.
                        </p>
                    </div>
                    {info && <Plan info={info} />}
                </div>

                {info && (
                    <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                        <Field label="Plan" value={PLAN_LABEL[info.plan] ?? info.plan} />
                        <Field label="Licensed to" value={info.customer ?? "—"} />
                        <Field label="Seats" value={info.seats ? String(info.seats) : "Unlimited"} />
                        <Field label="Expires" value={info.expiresAt ? new Date(info.expiresAt).toLocaleDateString() : info.plan === "community" ? "—" : "Never"} />
                    </dl>
                )}

                {info && info.plan !== "community" && (
                    <div className="mt-4">
                        <span className="text-caption-1 font-semibold text-black dark:text-white">Unlocked features</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {info.features.map((f) => (
                                <span key={f} className="rounded-md bg-lavender-mist px-2.5 py-1 text-caption-2 font-medium text-primary dark:bg-dark-3 dark:text-lilac">
                                    {FEATURE_LABEL[f] ?? f}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {info?.expired && (
                    <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm font-medium text-error">
                        This license has expired: paid features are disabled. Renew to re-enable them.
                    </div>
                )}
            </Card>

            {manage ? (
                <Card>
                    <h2 className="text-h5 text-black dark:text-white">{info && info.plan !== "community" ? "Update license" : "Activate a license"}</h2>
                    <p className="mt-1 text-caption-2 text-grey">Paste the license key we issued you. It&apos;s verified locally: no internet required.</p>
                    {error && <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>}
                    {ok && <div className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-body-sm font-medium text-success">{ok}</div>}
                    <textarea
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="Paste your Flow CMS license key…"
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-grey-light bg-white p-3 font-mono text-caption-2 text-black outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={activate} disabled={busy || !key.trim()} className="btn-primary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                            {busy ? "Activating…" : "Activate"}
                        </button>
                        {info && info.source === "db" && info.plan !== "community" && (
                            <button type="button" onClick={remove} disabled={busy} className="btn-danger btn-md">
                                Remove license
                            </button>
                        )}
                    </div>
                    {info?.source === "env" && (
                        <p className="mt-3 text-caption-2 text-grey">A license is currently set via the <code className="font-mono">FLOWCMS_LICENSE_KEY</code> environment variable, which takes precedence over a key entered here.</p>
                    )}
                </Card>
            ) : (
                <Card>
                    <p className="text-body-sm text-grey">Only workspace owners/admins can change the license. Ask one of them to upgrade.</p>
                </Card>
            )}
        </div>
    );
};

const Field = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-caption-2 text-grey">{label}</dt>
        <dd className="mt-0.5 text-body-sm font-semibold text-black dark:text-white">{value}</dd>
    </div>
);

export default License;
