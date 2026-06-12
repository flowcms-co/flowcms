"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlan } from "@/components/providers/LicenseProvider";
import { PLAN_LABEL, type FeatureKey } from "@/lib/plans";

type Props = {
    feature: FeatureKey;
    title: string;
    description: string;
    /** Icon name for the feature (defaults to a lock). */
    icon?: string;
    /** Optional "what you get" bullets shown on the promo card. */
    includes?: string[];
    /**
     * When provided, renders gate mode: the children show through if the feature
     * is unlocked, otherwise they're dimmed behind an upgrade overlay. Without
     * children this is a standalone promo card (and renders nothing once unlocked).
     */
    children?: ReactNode;
    className?: string;
};

/** The "Upgrade to Pro/Enterprise" call-to-action, gated to license managers. */
const UpgradeCta = ({ feature }: { feature: FeatureKey }) => {
    const { can } = useAuth();
    const { tierFor } = usePlan();
    const tier = tierFor(feature);
    if (!can("security.manage")) {
        return (
            <p className="text-caption-2 text-grey">
                Ask a workspace owner to upgrade to {PLAN_LABEL[tier]}.
            </p>
        );
    }
    return (
        <Link href="/settings/plan" className="btn-primary h-10 px-4">
            <Icon className="h-4 w-4 fill-white" name="sparkles" />
            Upgrade to {PLAN_LABEL[tier]}
        </Link>
    );
};

/** A small uppercase plan badge (Pro / Enterprise). */
const TierBadge = ({ feature }: { feature: FeatureKey }) => {
    const { tierFor } = usePlan();
    const tier = tierFor(feature);
    return (
        <span
            className={`rounded-md px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${
                tier === "enterprise"
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-primary/15 text-primary dark:text-lilac"
            }`}
        >
            {PLAN_LABEL[tier]}
        </span>
    );
};

const UpgradeLock = ({ feature, title, description, icon, includes, children, className }: Props) => {
    const { locked } = usePlan();
    const isLocked = locked(feature);

    // Gate mode: show the real UI when unlocked, dim + overlay when locked.
    if (children) {
        if (!isLocked) return <>{children}</>;
        return (
            <div className={`relative ${className ?? ""}`}>
                <div aria-hidden className="pointer-events-none select-none opacity-40 blur-[1px]">
                    {children}
                </div>
                <div className="absolute inset-0 flex items-center justify-center p-6">
                    <div className="max-w-sm rounded-2xl border border-grey-light bg-white/85 p-6 text-center backdrop-blur-sm dark:border-grey-light/10 dark:bg-dark-2/85">
                        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                            <Icon className="h-5 w-5 fill-primary dark:fill-lilac" name={icon ?? "lock"} />
                        </span>
                        <div className="mb-1 flex items-center justify-center gap-2">
                            <h3 className="text-h6 text-black dark:text-white">{title}</h3>
                            <TierBadge feature={feature} />
                        </div>
                        <p className="mx-auto mb-4 max-w-xs text-caption-2 text-grey">{description}</p>
                        <div className="flex justify-center">
                            <UpgradeCta feature={feature} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Promo mode: only render when the feature is locked (nothing to sell otherwise).
    if (!isLocked) return null;
    return (
        <Card className={`border border-dashed border-grey-light dark:border-grey-light/15 ${className ?? ""}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <Icon className="h-6 w-6 fill-primary dark:fill-lilac" name={icon ?? "lock"} />
                </span>
                <div className="grow">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-title text-black dark:text-white">{title}</h3>
                        <TierBadge feature={feature} />
                    </div>
                    <p className="mt-1 max-w-prose text-caption-2 text-grey">{description}</p>
                    {includes && includes.length > 0 && (
                        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {includes.map((item) => (
                                <li key={item} className="flex items-center gap-2 text-caption-1 text-grey">
                                    <Icon className="h-4 w-4 shrink-0 fill-primary dark:fill-lilac" name="check" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="shrink-0">
                    <UpgradeCta feature={feature} />
                </div>
            </div>
        </Card>
    );
};

export default UpgradeLock;
