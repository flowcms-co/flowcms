"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { FEATURE_TIER, PLAN_RANK, type FeatureKey, type Plan } from "@/lib/plans";
import { LICENSE_COOKIE, type LicenseCookie } from "@/lib/brand";

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

/** Mirror the resolved license into a cookie so the server layout can seed the
 *  next load's first paint (no flash of default Flow CMS chrome). */
function writeLicenseCookie(info: LicenseInfo) {
    if (typeof document === "undefined") return;
    const payload: LicenseCookie = { valid: info.valid, plan: info.plan, features: info.features };
    document.cookie = `${LICENSE_COOKIE}=${encodeURIComponent(JSON.stringify(payload))}; path=/; max-age=2592000; samesite=lax`;
}

export function LicenseProvider({ children, initial }: { children: ReactNode; initial?: LicenseCookie }) {
    const { status } = useAuth();
    // Seed from the server-read cookie so white-label chrome is right on first paint.
    const [info, setInfo] = useState<LicenseInfo>(initial ? { ...COMMUNITY, valid: initial.valid, plan: initial.plan as Plan, features: initial.features } : COMMUNITY);
    const [ready, setReady] = useState(false);

    const sync = useCallback(async () => {
        if (status !== "authenticated") {
            setInfo(COMMUNITY);
            writeLicenseCookie(COMMUNITY);
            setReady(true);
            return;
        }
        try {
            const fetched = await api<LicenseInfo>("/license");
            setInfo(fetched);
            writeLicenseCookie(fetched);
        } catch {
            // Keep the last-known license (seeded from the cookie) on a transient
            // fetch failure. Downgrading to Community here would strip white-label
            // mid-session on a momentary network blip, wiping the branded chrome
            // and accent for an enterprise install.
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
