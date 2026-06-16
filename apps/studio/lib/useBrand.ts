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
    /**
     * True once the brand is *known*: the license has resolved and — when
     * white-label is licensed — the workspace (which carries the brand fields)
     * has loaded. Consumers must not act on `active`/`accent` until this is true,
     * or they'll mistake "still loading" for "no brand" and wipe a set brand.
     */
    ready: boolean;
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
    const { has, ready: licenseReady } = usePlan();
    const on = has("white_label");
    const accent = on && ws?.brandAccent && HEX.test(ws.brandAccent) ? ws.brandAccent : null;
    const name = on ? (ws?.brandName ?? null) : null;
    const logoUrl = on ? (ws?.brandLogoUrl ?? null) : null;
    // Resolved once the license is known and, when white-label is licensed, the
    // workspace has loaded (it carries the brand fields). If white-label isn't
    // licensed the workspace brand is irrelevant, so the license alone settles it.
    const ready = licenseReady && (!on || ws !== null);
    return { name, logoUrl, accent, active: on && !!(name || logoUrl || accent), ready };
}
