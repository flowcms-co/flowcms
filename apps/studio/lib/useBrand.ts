"use client";

import { usePlan } from "@/components/providers/LicenseProvider";
import { useWorkspace } from "@/lib/useWorkspace";

export type Brand = {
    /** Custom product name, or null to use the Flow CMS wordmark. */
    name: string | null;
    logoUrl: string | null;
    /** A validated #rrggbb accent, or null. */
    accent: string | null;
    /** True when white-label is licensed AND this workspace has any brand set. */
    active: boolean;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The active workspace's effective white-label brand — but ONLY when the install
 * is licensed for `white_label`. On Community/Pro (or with no brand configured)
 * every field is null, so the studio falls back to default Flow CMS branding. The
 * accent is hex-validated here too (defense in depth before it reaches CSS).
 */
export function useBrand(): Brand {
    const ws = useWorkspace();
    const { has } = usePlan();
    const on = has("white_label");
    const accent = on && ws?.brandAccent && HEX.test(ws.brandAccent) ? ws.brandAccent : null;
    const name = on ? (ws?.brandName ?? null) : null;
    const logoUrl = on ? (ws?.brandLogoUrl ?? null) : null;
    return { name, logoUrl, accent, active: on && !!(name || logoUrl || accent) };
}
