"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import UpgradeLock from "@/components/ui/UpgradeLock";
import { usePlan } from "@/components/providers/LicenseProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

type BudgetStatus = {
    budgetUsd: number | null;
    spentUsd: number;
    remainingUsd: number | null;
    percent: number;
    overBudget: boolean;
    warn: boolean;
    resetsAt: string;
};

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

/**
 * Pro (`ai_budgets`) — monthly AI spend cap. Shows an upgrade promo when locked;
 * the live spend meter + cap setter when unlocked. Enforcement is server-side
 * (the AI gateway blocks calls over budget); this is the control surface.
 */
const AiBudgetCard = () => {
    const { has } = usePlan();
    if (!has("ai_budgets")) {
        return (
            <UpgradeLock
                feature="ai_budgets"
                icon="wallet"
                title="AI budgets & spend caps"
                description="Put a monthly cap on AI spend. When the workspace hits it, AI calls pause until you raise the cap or it resets on the 1st."
                includes={["Monthly USD cap per workspace", "Auto-pauses AI calls over budget", "Resets on the 1st each month"]}
            />
        );
    }
    return <BudgetMeter />;
};

const BudgetMeter = () => {
    const { can } = useAuth();
    const editable = can("billing.manage");
    const [s, setS] = useState<BudgetStatus | null>(null);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = async () => {
        try {
            const d = await api<BudgetStatus>("/ee/ai-budgets");
            setS(d);
            setDraft(d.budgetUsd != null ? String(d.budgetUsd) : "");
        } catch {
            /* gated / unavailable — leave empty */
        }
    };
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, []);

    const save = async (clear: boolean) => {
        setSaving(true);
        setErr(null);
        try {
            const n = Number(draft);
            const usd = clear ? null : Number.isFinite(n) && n > 0 ? n : null;
            const d = await api<BudgetStatus>("/ee/ai-budgets", { method: "PUT", body: JSON.stringify({ usd }) });
            setS(d);
            setDraft(d.budgetUsd != null ? String(d.budgetUsd) : "");
        } catch (e) {
            setErr(e instanceof ApiError ? e.message : "Could not save the budget.");
        } finally {
            setSaving(false);
        }
    };

    const resetLabel = s ? new Date(s.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
    const barColor = !s?.budgetUsd ? "#6a6a85" : s.overBudget ? "#e24b4a" : s.warn ? "#f5a623" : "#00b894";
    const pct = s ? Math.min(100, s.percent) : 0;

    return (
        <Card>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="h-5 w-5 fill-primary dark:fill-lilac" name="wallet" />
                    </span>
                    <div>
                        <h3 className="text-h6 text-black dark:text-white">AI budget</h3>
                        <p className="text-caption-2 text-grey">Monthly spend cap{s?.budgetUsd ? ` · resets ${resetLabel}` : ""}</p>
                    </div>
                </div>
                <span className={cn("rounded-md px-2 py-1 text-[0.6875rem] font-semibold", s?.budgetUsd ? "bg-primary/10 text-primary dark:bg-lilac/15 dark:text-lilac" : "bg-grey/10 text-grey")}>
                    {s?.budgetUsd ? "Active" : "No cap"}
                </span>
            </div>

            <div className="mt-5">
                <div className="flex items-baseline justify-between text-caption-1">
                    <span className="font-semibold text-black dark:text-white">
                        {s ? fmtUsd(s.spentUsd) : "…"} <span className="font-normal text-grey">spent this month</span>
                    </span>
                    {s?.budgetUsd ? <span className="text-grey">of {fmtUsd(s.budgetUsd)}</span> : null}
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-grey-light dark:bg-dark-3">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
                {s?.overBudget ? (
                    <p className="mt-2 text-caption-2 font-semibold text-error">Budget reached — AI calls are paused until {resetLabel} or you raise the cap.</p>
                ) : s?.budgetUsd ? (
                    <p className={cn("mt-2 text-caption-2", s.warn ? "font-semibold text-warning" : "text-grey")}>{fmtUsd(s.remainingUsd ?? 0)} left this month.</p>
                ) : (
                    <p className="mt-2 text-caption-2 text-grey">No cap set — AI spend is unlimited.</p>
                )}
            </div>

            {editable && (
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-grey-light pt-4 dark:border-grey-light/10">
                    <span className="text-caption-1 font-semibold text-grey">Set cap</span>
                    <span className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body-sm text-grey">$</span>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="decimal"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="50"
                            className="h-9 w-28 rounded-md border border-grey-light bg-white pl-6 pr-3 text-body-sm text-black outline-none transition-colors focus:border-primary dark:border-grey-light/10 dark:bg-dark-1 dark:text-white"
                        />
                    </span>
                    <span className="text-caption-2 text-grey">/ month</span>
                    <button type="button" onClick={() => save(false)} disabled={saving} className="btn-primary btn-md">
                        {saving ? "Saving…" : "Save"}
                    </button>
                    {s?.budgetUsd ? (
                        <button type="button" onClick={() => save(true)} disabled={saving} className="btn-secondary btn-md">
                            Remove cap
                        </button>
                    ) : null}
                    {err && <span className="text-caption-2 text-error">{err}</span>}
                </div>
            )}
        </Card>
    );
};

export default AiBudgetCard;
