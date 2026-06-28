"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlan } from "@/components/providers/LicenseProvider";
import { PLAN_LABEL, PLAN_RANK, PLANS, type Plan } from "@/lib/plans";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "https://flowcms-admin-production.up.railway.app";

/** Live plan pricing from the vendor console: Pro price, and Enterprise price if not custom. */
function useLivePricing() {
    const [price, setPrice] = useState<{ pro?: string; enterprise?: string }>({});
    useEffect(() => {
        let on = true;
        (async () => {
            try {
                const res = await fetch(`${ADMIN_URL}/api/pricing`);
                if (!res.ok) return;
                const p = await res.json();
                const fmt = (n: number) => {
                    try {
                        return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(n);
                    } catch {
                        return `${p.currency} ${n}`;
                    }
                };
                if (on) setPrice({ pro: fmt(p.pro.monthly), enterprise: p.enterprise.custom === false ? fmt(p.enterprise.monthly) : undefined });
            } catch {
                /* keep the static labels if the feed is unreachable */
            }
        })();
        return () => { on = false; };
    }, []);
    return price;
}

/**
 * Billing — compare editions and upgrade. Flow CMS is self-hosted and licensed
 * offline (Ed25519 key), so there's no card on file or hosted invoices here:
 * upgrading means activating a license key (Settings → License). This screen is
 * the plan-comparison + upgrade funnel; License is where a key is pasted.
 */
const Billing = () => {
    const { info, plan } = usePlan();
    const { can } = useAuth();
    const canManage = can("security.manage");
    const currentRank = PLAN_RANK[plan];
    const livePrice = useLivePricing();

    return (
        <div className="flex flex-col gap-6">
            {/* Current plan */}
            <Card
                className={
                    plan === "community"
                        ? ""
                        : "relative overflow-hidden bg-[linear-gradient(135deg,var(--color-primary),var(--color-purple-400))] text-white"
                }
            >
                {plan !== "community" && (
                    <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
                )}
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <span
                            className={`inline-flex items-center rounded-md px-2.5 py-1 text-caption-2 font-semibold ${
                                plan === "community" ? "bg-grey-light text-grey dark:bg-dark-3" : "bg-white/20 text-white"
                            }`}
                        >
                            Current plan
                        </span>
                        <div className="mt-3 flex items-end gap-2">
                            <span
                                className={`font-poppins text-[2.25rem] leading-none font-extrabold ${
                                    plan === "community" ? "text-black dark:text-white" : ""
                                }`}
                            >
                                {PLAN_LABEL[plan]}
                            </span>
                            {info.expired && (
                                <span className="mb-1 rounded-md bg-error/15 px-2 py-0.5 text-caption-2 font-semibold text-error">
                                    expired
                                </span>
                            )}
                        </div>
                        <p className={`mt-2 text-caption-1 ${plan === "community" ? "text-grey" : "text-white/85"}`}>
                            {plan === "community"
                                ? "Free and open-source, self-hosted forever."
                                : info.customer
                                  ? `Licensed to ${info.customer}`
                                  : "Licensed install"}
                            {info.expiresAt && !info.expired
                                ? ` · renews ${new Date(info.expiresAt).toLocaleDateString()}`
                                : ""}
                        </p>
                    </div>
                    <Link
                        href="/settings/plan"
                        className={
                            plan === "community"
                                ? "btn-secondary h-11 px-5"
                                : "inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-5 font-bold text-primary transition-transform active:scale-[0.98]"
                        }
                    >
                        <Icon
                            className={`h-5 w-5 ${plan === "community" ? "fill-primary dark:fill-lilac" : "fill-primary"}`}
                            name="key"
                        />
                        Manage license
                    </Link>
                </div>
            </Card>

            {/* Compare editions */}
            <div>
                <h2 className="mb-1 text-h5 text-black dark:text-white">Compare editions</h2>
                <p className="mb-4 text-caption-2 text-grey">
                    Every edition is the same self-hosted install. A license key unlocks the paid tiers.
                </p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {PLANS.map((p) => {
                        const isCurrent = p.id === plan;
                        const rank = PLAN_RANK[p.id];
                        return (
                            <Card
                                key={p.id}
                                className={`flex flex-col ${isCurrent ? "!border-2 !border-primary" : "border border-grey-light dark:border-grey-light/10"}`}
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-h5 text-black dark:text-white">{p.name}</h3>
                                    {isCurrent && (
                                        <span className="rounded-md bg-primary/15 px-2 py-0.5 text-caption-2 font-semibold text-primary dark:text-lilac">
                                            Current
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="font-poppins text-h4 font-extrabold text-black dark:text-white">{p.id === "pro" && livePrice.pro ? livePrice.pro : p.id === "enterprise" && livePrice.enterprise ? livePrice.enterprise : p.price}</span>
                                    <span className="text-caption-2 text-grey">{(p.id === "pro" && livePrice.pro) || (p.id === "enterprise" && livePrice.enterprise) ? "/mo · " : ""}{p.cadence}</span>
                                </div>
                                <p className="mt-2 min-h-[2.5rem] text-caption-2 text-grey">{p.tagline}</p>
                                <ul className="mt-4 flex grow flex-col gap-2">
                                    {p.highlights.map((h) => {
                                        const isLeadIn = h.startsWith("Everything in");
                                        return (
                                            <li
                                                key={h}
                                                className={`flex items-start gap-2 text-caption-1 ${
                                                    isLeadIn ? "font-semibold text-black dark:text-white" : "text-grey"
                                                }`}
                                            >
                                                {!isLeadIn && (
                                                    <Icon className="mt-0.5 h-4 w-4 shrink-0 fill-success" name="check" />
                                                )}
                                                <span>{h}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                                <div className="mt-5">
                                    <PlanCta id={p.id} name={p.name} isCurrent={isCurrent} rank={rank} currentRank={currentRank} canManage={canManage} />
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const PlanCta = ({
    id,
    name,
    isCurrent,
    rank,
    currentRank,
    canManage,
}: {
    id: Plan;
    name: string;
    isCurrent: boolean;
    rank: number;
    currentRank: number;
    canManage: boolean;
}) => {
    if (isCurrent) {
        return (
            <span className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary/10 font-bold text-primary dark:text-lilac">
                <Icon className="h-5 w-5 fill-primary dark:fill-lilac" name="check" />
                Your plan
            </span>
        );
    }
    if (rank < currentRank) {
        return <span className="block py-3 text-center text-caption-2 text-grey">Included in your plan</span>;
    }
    // An upgrade.
    if (!canManage) {
        return (
            <span className="block py-3 text-center text-caption-2 text-grey">Ask an owner to upgrade to {PLAN_LABEL[id]}</span>
        );
    }
    return (
        <Link href="/settings/plan" className="btn-primary h-11 w-full">
            <Icon className="h-5 w-5 fill-white" name="sparkles" />
            Upgrade to {name}
        </Link>
    );
};

export default Billing;
