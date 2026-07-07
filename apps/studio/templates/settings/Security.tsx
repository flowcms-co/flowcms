"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/lib/api";
import UpgradeLock from "@/components/ui/UpgradeLock";
import IpPolicyCard from "@/templates/settings/IpPolicyCard";
import SsoCard from "@/templates/settings/SsoCard";
import ScimCard from "@/templates/settings/ScimCard";

const inputCls =
    "w-full h-11 px-4 rounded-lg border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

type SetupData = { secret: string; otpauth: string; qr: string };
type Mode = "idle" | "setup" | "disable" | "regen" | "backup";

/** Friendly labels for audit actions. */
const ACTION_LABEL: Record<string, string> = {
    "auth.signin": "Signed in",
    "auth.signin_failed": "Failed sign-in",
    "auth.signout": "Signed out",
    "auth.password_reset": "Password reset",
    "auth.2fa_enabled": "Enabled 2FA",
    "auth.2fa_disabled": "Disabled 2FA",
    "auth.2fa_backup_regenerated": "Regenerated backup codes",
    "user.create": "Created user",
    "user.update": "Updated user",
    "user.delete": "Deleted user",
    "role.create": "Created role",
    "role.update": "Updated role",
    "role.delete": "Deleted role",
    "integration.connect": "Connected integration",
    "integration.remove": "Removed integration",
    "apitoken.create": "Created API token",
    "apitoken.revoke": "Revoked API token",
};

type AuditRow = {
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    metadata: Record<string, unknown> | null;
    ip: string | null;
    createdAt: string;
    actor: { id: string; name: string | null; email: string } | null;
};

const Security = () => {
    const { user, refresh, can } = useAuth();
    const enabled = !!user?.twoFactorEnabled;

    const [mode, setMode] = useState<Mode>("idle");
    const [setup, setSetup] = useState<SetupData | null>(null);
    const [code, setCode] = useState("");
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setMode("idle");
        setSetup(null);
        setCode("");
        setBackupCodes(null);
        setError(null);
    };

    const beginSetup = async () => {
        setBusy(true);
        setError(null);
        try {
            const data = await api<SetupData>("/auth/2fa/setup", { method: "POST" });
            setSetup(data);
            setMode("setup");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not start setup.");
        } finally {
            setBusy(false);
        }
    };

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            if (mode === "setup") {
                const res = await api<{ backupCodes: string[] }>("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
                setBackupCodes(res.backupCodes);
                setMode("backup");
                setCode("");
                await refresh();
            } else if (mode === "disable") {
                await api("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) });
                await refresh();
                reset();
            } else if (mode === "regen") {
                const res = await api<{ backupCodes: string[] }>("/auth/2fa/backup-codes", { method: "POST", body: JSON.stringify({ code }) });
                setBackupCodes(res.backupCodes);
                setMode("backup");
                setCode("");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "That didn't work.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Per-user 2FA leads (everyone can set it up), then the audit log +
                export, then the Enterprise security cards. */}
            <Card id="tour-2fa">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">Two-factor authentication</h2>
                        <p className="mt-1 text-caption-2 text-grey">
                            Add a second step at sign-in using an authenticator app (Google Authenticator, 1Password, Authy…).
                        </p>
                    </div>
                    <span
                        className={`shrink-0 rounded-md px-2.5 py-1 text-caption-2 font-semibold ${enabled ? "bg-success/15 text-success" : "bg-grey-light text-grey dark:bg-dark-3"}`}
                    >
                        {enabled ? "Enabled" : "Off"}
                    </span>
                </div>

                {error && (
                    <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>
                )}

                {/* Backup codes display (after enable or regenerate) */}
                {mode === "backup" && backupCodes && (
                    <div className="mt-5">
                        <p className="text-caption-1 font-semibold text-black dark:text-white">Save your backup codes</p>
                        <p className="mt-1 text-caption-2 text-grey">
                            Each can be used once if you lose your authenticator. Store them somewhere safe: they won&apos;t be shown again.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-grey-light p-4 font-mono text-body-sm dark:border-grey-light/10 sm:grid-cols-5">
                            {backupCodes.map((c) => (
                                <span key={c} className="text-black dark:text-white">{c}</span>
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => void navigator.clipboard?.writeText(backupCodes.join("\n")).catch(() => {})} className="btn-secondary h-9 px-3.5 text-caption-1">
                                Copy codes
                            </button>
                            <button type="button" onClick={reset} className="btn-primary h-9 px-3.5 text-caption-1">
                                I&apos;ve saved them
                            </button>
                        </div>
                    </div>
                )}

                {/* Setup: QR + verify */}
                {mode === "setup" && setup && (
                    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={setup.qr} alt="2FA QR code" width={160} height={160} className="h-40 w-40 shrink-0 rounded-lg border border-grey-light bg-white p-2 dark:border-grey-light/10" />
                        <div className="min-w-0 grow">
                            <p className="text-caption-2 text-grey">Scan the QR with your authenticator app, or enter this key manually:</p>
                            <code className="mt-1 block break-all rounded-lg bg-lavender-mist px-3 py-2 font-mono text-caption-1 text-black dark:bg-dark-2 dark:text-white">{setup.secret}</code>
                            <label className="mt-3 block">
                                <span className="text-caption-1 font-semibold text-black dark:text-white">Enter the 6-digit code</span>
                                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" className={`${inputCls} mt-1.5`} />
                            </label>
                            <div className="mt-3 flex gap-2">
                                <button type="button" onClick={submit} disabled={busy || code.length < 6} className="btn-primary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                                    {busy ? "Verifying…" : "Verify & turn on"}
                                </button>
                                <button type="button" onClick={reset} className="btn-secondary h-9 px-3.5 text-caption-1">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Disable / regenerate: code prompt */}
                {(mode === "disable" || mode === "regen") && (
                    <div className="mt-5 max-w-sm">
                        <label className="block">
                            <span className="text-caption-1 font-semibold text-black dark:text-white">
                                Enter a current code to {mode === "disable" ? "turn off 2FA" : "regenerate backup codes"}
                            </span>
                            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="Authenticator or backup code" className={`${inputCls} mt-1.5`} />
                        </label>
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={submit} disabled={busy || !code} className={`${mode === "disable" ? "btn-danger-solid" : "btn-primary"} btn-md`}>
                                {busy ? "Working…" : mode === "disable" ? "Turn off 2FA" : "Regenerate"}
                            </button>
                            <button type="button" onClick={reset} className="btn-secondary h-9 px-3.5 text-caption-1">Cancel</button>
                        </div>
                    </div>
                )}

                {/* Idle actions */}
                {mode === "idle" && (
                    <div className="mt-5 flex flex-wrap gap-2">
                        {enabled ? (
                            <>
                                <button type="button" onClick={() => { setMode("regen"); setError(null); }} className="btn-secondary h-9 px-3.5 text-caption-1">
                                    Regenerate backup codes
                                </button>
                                <button type="button" onClick={() => { setMode("disable"); setError(null); }} className="btn-danger btn-md">
                                    Turn off 2FA
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={beginSetup} disabled={busy} className="btn-primary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                                {busy ? "Starting…" : "Set up two-factor"}
                            </button>
                        )}
                    </div>
                )}
            </Card>

            {can("security.manage") && (
                <>
                    <div data-tour="security-audit">
                        <AuditLog />
                    </div>
                    <ConsentRecords />
                    <UpgradeLock
                        feature="audit_export"
                        icon="download"
                        title="Export the audit log"
                        description="Stream or export the full audit trail to CSV and your SIEM (Splunk, Datadog, Elastic) for long-term retention and compliance."
                    />
                    <div data-tour="security-enterprise" className="flex flex-col gap-6">
                        <SsoCard />
                        <ScimCard />
                        <IpPolicyCard />
                    </div>
                </>
            )}
        </div>
    );
};

type ConsentRow = {
    id: string;
    user: { name: string | null; email: string };
    source: string;
    termsAccepted: boolean;
    marketingAccepted: boolean;
    ip: string | null;
    clientIp: string | null;
    browser: string | null;
    os: string | null;
    device: string | null;
    createdAt: string;
};

const CONSENT_SOURCE: Record<string, string> = { setup: "First-run setup", signup: "Signup", prompt: "In-app prompt" };

/** Consent evidence trail (admins): every Terms + email-consent acceptance with
 *  the request IP, the browser-reported public IP and the parsed device. */
const ConsentRecords = () => {
    const [rows, setRows] = useState<ConsentRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<ConsentRow[]>("/auth/consent-records")
            // eslint-disable-next-line react-hooks/set-state-in-effect
            .then(setRows)
            .catch((e) => setError(e instanceof Error ? e.message : "Could not load consent records."));
    }, []);

    return (
        <Card>
            <div>
                <h2 className="text-h5 text-black dark:text-white">Consent records</h2>
                <p className="mt-1 text-caption-2 text-grey">
                    Every acceptance of the Terms and email consent, with the evidence recorded at the moment it happened: when, from
                    which IP (as the server saw it and as the browser reported itself), and on which browser and device.
                </p>
            </div>

            {error && <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>}
            {rows && rows.length === 0 && <p className="mt-4 text-body-sm text-grey">No consent records yet.</p>}

            {!!rows?.length && (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-body-sm">
                        <thead>
                            <tr className="border-b border-grey-light text-caption-2 uppercase tracking-wide text-grey dark:border-grey-light/10">
                                <th className="pb-2 pr-4 font-semibold">Person</th>
                                <th className="pb-2 pr-4 font-semibold">Accepted</th>
                                <th className="pb-2 pr-4 font-semibold">When</th>
                                <th className="pb-2 pr-4 font-semibold">IP (server)</th>
                                <th className="pb-2 pr-4 font-semibold">IP (browser)</th>
                                <th className="pb-2 pr-4 font-semibold">Device</th>
                                <th className="pb-2 font-semibold">Where</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-grey-light/60 last:border-b-0 dark:border-grey-light/5">
                                    <td className="py-2.5 pr-4">
                                        <span className="block text-black dark:text-white">{r.user.name || r.user.email}</span>
                                        {r.user.name && <span className="block text-caption-2 text-grey">{r.user.email}</span>}
                                    </td>
                                    <td className="py-2.5 pr-4 whitespace-nowrap text-grey">
                                        {r.termsAccepted && <span className="mr-2 inline-flex items-center gap-1 text-success"><Icon name="check" className="h-3.5 w-3.5 fill-success" />Terms</span>}
                                        {r.marketingAccepted && <span className="inline-flex items-center gap-1 text-success"><Icon name="check" className="h-3.5 w-3.5 fill-success" />Emails</span>}
                                    </td>
                                    <td className="py-2.5 pr-4 whitespace-nowrap text-grey">{new Date(r.createdAt).toLocaleString()}</td>
                                    <td className="py-2.5 pr-4 font-mono text-caption-1 text-grey">{r.ip || "—"}</td>
                                    <td className="py-2.5 pr-4 font-mono text-caption-1 text-grey">{r.clientIp || "—"}</td>
                                    <td className="py-2.5 pr-4 text-grey">{[r.browser, r.os, r.device].filter(Boolean).join(" · ") || "—"}</td>
                                    <td className="py-2.5 text-grey">{CONSENT_SOURCE[r.source] ?? r.source}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

/** Workspace audit trail (admins only). */
const AuditLog = () => {
    const [rows, setRows] = useState<AuditRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setRows(await api<AuditRow[]>("/audit?limit=5"));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load the audit log.");
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    return (
        <Card>
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Security audit log</h2>
                    <p className="mt-1 text-caption-2 text-grey">The 5 most recent security-sensitive actions. Export the full log below.</p>
                </div>
                <button type="button" onClick={load} className="btn-secondary h-9 px-3.5 text-caption-1">
                    Refresh
                </button>
            </div>

            {error && <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>}

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                    <thead>
                        <tr className="border-b border-grey-light text-caption-2 uppercase tracking-wide text-grey dark:border-grey-light/10">
                            <th className="pb-2 pr-4 font-semibold">Action</th>
                            <th className="pb-2 pr-4 font-semibold">Who</th>
                            <th className="pb-2 pr-4 font-semibold">IP</th>
                            <th className="pb-2 font-semibold">When</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows?.map((r) => (
                            <tr key={r.id} className="border-b border-grey-light/60 last:border-b-0 dark:border-grey-light/5">
                                <td className="py-2.5 pr-4 text-black dark:text-white">
                                    {ACTION_LABEL[r.action] ?? r.action}
                                    {r.metadata && typeof r.metadata === "object" && (r.metadata as { reason?: string }).reason && (
                                        <span className="ml-1.5 text-caption-2 text-error">({(r.metadata as { reason?: string }).reason})</span>
                                    )}
                                </td>
                                <td className="py-2.5 pr-4 text-grey">{r.actor?.name || r.actor?.email || "—"}</td>
                                <td className="py-2.5 pr-4 font-mono text-caption-1 text-grey">{r.ip ?? "—"}</td>
                                <td className="py-2.5 text-grey">{new Date(r.createdAt).toLocaleString()}</td>
                            </tr>
                        ))}
                        {rows && rows.length === 0 && (
                            <tr>
                                <td colSpan={4} className="py-6 text-center text-grey">No events yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
                {rows === null && !error && <p className="py-6 text-center text-caption-1 text-grey">Loading…</p>}
            </div>
        </Card>
    );
};

export default Security;
