"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import UpgradeLock from "@/components/ui/UpgradeLock";
import Icon from "@/components/ui/Icon";
import { usePlan } from "@/components/providers/LicenseProvider";
import { api, ApiError } from "@/lib/api";

type Policy = { ipAllowlist: string[]; sessionMaxHours: number | null; sessionIdleMinutes: number | null };

/**
 * Settings → Security → Access & session policy (Enterprise `ip_policies`).
 * IP allowlist + session lifetime/idle controls + force sign-out. Enforcement is
 * in the core auth layer; this configures it. Gated by <UpgradeLock>; the endpoints
 * are gated too.
 */
const IpPolicyCard = () => {
    const { has } = usePlan();
    const licensed = has("ip_policies");
    const [allow, setAllow] = useState("");
    const [maxHours, setMaxHours] = useState("");
    const [idleMin, setIdleMin] = useState("");
    const [saving, setSaving] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        if (!licensed) return;
        let off = false;
        api<Policy>("/ee/ip-policies")
            .then((p) => {
                if (off) return;
                setAllow((p.ipAllowlist ?? []).join("\n"));
                setMaxHours(p.sessionMaxHours ? String(p.sessionMaxHours) : "");
                setIdleMin(p.sessionIdleMinutes ? String(p.sessionIdleMinutes) : "");
            })
            .catch(() => {});
        return () => {
            off = true;
        };
    }, [licensed]);

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const ipAllowlist = allow.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
            await api("/ee/ip-policies", {
                method: "PUT",
                body: JSON.stringify({ ipAllowlist, sessionMaxHours: Number(maxHours) || 0, sessionIdleMinutes: Number(idleMin) || 0 }),
            });
            setMsg({ ok: true, text: "Saved" });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    const revoke = async () => {
        if (!window.confirm("Sign out every member from all devices? Everyone (including you) will need to sign in again.")) return;
        setRevoking(true);
        try {
            const r = await api<{ revoked: number }>("/ee/ip-policies/revoke-sessions", { method: "POST" });
            window.alert(`Signed out ${r.revoked} session(s). You'll be signed out shortly.`);
        } catch (e) {
            window.alert(e instanceof ApiError ? e.message : "Could not revoke sessions.");
        } finally {
            setRevoking(false);
        }
    };

    return (
        <UpgradeLock
            feature="ip_policies"
            title="Access & session policy"
            description="Restrict studio access to trusted networks and control how long sessions last."
            icon="lock"
            includes={["IP allowlist (CIDR ranges)", "Maximum session lifetime", "Idle-timeout sign-out", "Force sign-out everywhere"]}
        >
            <Card>
                <h2 className="mb-1 text-h5 text-black dark:text-white">Access &amp; session policy</h2>
                <p className="mb-5 text-caption-2 text-grey">Limit where this workspace can be accessed from and how long sessions stay valid.</p>

                <label className="flex flex-col gap-1.5">
                    <span className="text-caption-1 text-grey">Allowed IPs / ranges (one per line)</span>
                    <textarea
                        value={allow}
                        onChange={(e) => setAllow(e.target.value)}
                        rows={3}
                        placeholder={"203.0.113.0/24\n198.51.100.7"}
                        className="flow-input resize-none font-mono text-caption-1"
                    />
                </label>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-grey">
                    Empty = any network. Supports single IPs and IPv4 CIDR. If you lock yourself out, recover by setting{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-primary dark:bg-dark-3 dark:text-lilac">IP_POLICY_DISABLED=1</code> on the server.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-caption-1 text-grey">Max session (hours, 0 = no cap)</span>
                        <input type="number" min={0} value={maxHours} onChange={(e) => setMaxHours(e.target.value)} placeholder="720" className="flow-input" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-caption-1 text-grey">Idle timeout (minutes, 0 = off)</span>
                        <input type="number" min={0} value={idleMin} onChange={(e) => setIdleMin(e.target.value)} placeholder="60" className="flow-input" />
                    </label>
                </div>

                <div className="mt-5 flex items-center justify-end gap-3">
                    {msg && <span className={`text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</span>}
                    <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : "Save policy"}
                    </button>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-grey-light pt-4 dark:border-grey-light/10">
                    <div>
                        <div className="text-title text-black dark:text-white">Force sign-out everywhere</div>
                        <p className="text-caption-2 text-grey">Revoke every member&rsquo;s sessions on all devices.</p>
                    </div>
                    <button type="button" onClick={revoke} disabled={revoking} className="btn-danger disabled:opacity-60">
                        <Icon className="h-4 w-4 fill-current" name="logout" />
                        {revoking ? "Signing out…" : "Sign out all"}
                    </button>
                </div>
            </Card>
        </UpgradeLock>
    );
};

export default IpPolicyCard;
