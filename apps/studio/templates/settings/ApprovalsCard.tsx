"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import UpgradeLock from "@/components/ui/UpgradeLock";
import Select from "@/components/ui/Select";
import { usePlan } from "@/components/providers/LicenseProvider";
import { api, ApiError } from "@/lib/api";

/**
 * Settings → System → Approvals (Pro `approval_workflows`). Sets how many reviewer
 * sign-offs are required before content can be published. The review mechanism
 * (submit → approve / request changes) is always available; this policy + the
 * publish gate are the paid lever. Wrapped in <UpgradeLock>; the PUT is gated too.
 */
const ApprovalsCard = () => {
    const { has } = usePlan();
    const licensed = has("approval_workflows");
    const [required, setRequired] = useState("1");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        if (!licensed) return;
        let off = false;
        api<{ approvalsRequired: number }>("/ee/approval-workflows")
            .then((r) => {
                if (!off) setRequired(String(r.approvalsRequired));
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
            await api("/ee/approval-workflows", { method: "PUT", body: JSON.stringify({ approvalsRequired: Number(required) }) });
            setMsg({ ok: true, text: "Saved" });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <UpgradeLock
            feature="approval_workflows"
            title="Approval workflows"
            description="Require reviewer sign-off before content can be published."
            icon="check"
            includes={[
                "Submit → review → approve before anything goes live",
                "Require one or more independent approvals",
                "Publishing is blocked until the entry is signed off",
            ]}
        >
            <Card>
                <h2 className="mb-1 text-h5 text-black dark:text-white">Approvals</h2>
                <p className="mb-5 text-caption-2 text-grey">
                    How many reviewers must approve an entry before it can be published. Reviewers are members who can publish.
                </p>
                <div className="max-w-xs">
                    <Select
                        variant="field"
                        ariaLabel="Approvals required"
                        value={required}
                        onChange={setRequired}
                        options={[
                            { value: "1", label: "1 approval" },
                            { value: "2", label: "2 approvals" },
                            { value: "3", label: "3 approvals" },
                        ]}
                    />
                </div>
                <div className="mt-5 flex items-center justify-end gap-3">
                    {msg && <span className={`text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</span>}
                    <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : "Save policy"}
                    </button>
                </div>
            </Card>
        </UpgradeLock>
    );
};

export default ApprovalsCard;
