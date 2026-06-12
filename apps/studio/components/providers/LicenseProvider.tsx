"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { FEATURE_TIER, PLAN_RANK, type FeatureKey, type Plan } from "@/lib/plans";

export type LicenseInfo = {
    valid: boolean;
    plan: Plan;
    features: string[];
    seats: number | null;
    expiresAt: string | null;
    expired: boolean;
    customer: string | null;
    source: "env" | "db" | "none";
};

const COMMUNITY: LicenseInfo = {
    valid: true,
    plan: "community",
    features: [],
    seats: null,
    expiresAt: null,
    expired: false,
    customer: null,
    source: "none",
};

type PlanContextValue = {
    info: LicenseInfo;
    plan: Plan;
    ready: boolean;
    /** True when the install's license entitles this feature (mirrors backend `has`). */
    has: (feature: FeatureKey) => boolean;
    /** Inverse of `has` — convenient for gating UI. */
    locked: (feature: FeatureKey) => boolean;
    /** The plan a feature requires (for "Upgrade to X" copy). */
    tierFor: (feature: FeatureKey) => Plan;
    /** True when the current plan is at least `plan`. */
    atLeast: (plan: Plan) => boolean;
    refresh: () => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
    const { status } = useAuth();
    const [info, setInfo] = useState<LicenseInfo>(COMMUNITY);
    const [ready, setReady] = useState(false);

    const sync = useCallback(async () => {
        if (status !== "authenticated") {
            setInfo(COMMUNITY);
            setReady(true);
            return;
        }
        try {
            setInfo(await api<LicenseInfo>("/license"));
        } catch {
            setInfo(COMMUNITY);
        } finally {
            setReady(true);
        }
    }, [status]);

    useEffect(() => {
        if (status === "loading") return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void sync();
    }, [status, sync]);

    const value = useMemo<PlanContextValue>(() => {
        const has = (feature: FeatureKey) =>
            info.valid && (info.features.includes("*") || info.features.includes(feature));
        return {
            info,
            plan: info.plan,
            ready,
            has,
            locked: (feature: FeatureKey) => !has(feature),
            tierFor: (feature: FeatureKey) => FEATURE_TIER[feature],
            atLeast: (plan: Plan) => PLAN_RANK[info.plan] >= PLAN_RANK[plan],
            refresh: sync,
        };
    }, [info, ready, sync]);

    return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

/** Plan-awareness for the studio: `const { locked, tierFor } = usePlan()`. */
export function usePlan(): PlanContextValue {
    const ctx = useContext(PlanContext);
    if (!ctx) throw new Error("usePlan must be used within a LicenseProvider");
    return ctx;
}
