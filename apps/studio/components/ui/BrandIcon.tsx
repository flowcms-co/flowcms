"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BRANDS, brandAsset, resolveBrand } from "@/lib/brands";

const initial = (s?: string | null) => (s || "?").trim().charAt(0).toUpperCase();

type BrandIconProps = {
    /** A brand key, provider id, or platform display name (see `resolveBrand`). */
    brand: string;
    /** Tile (and mark) size in px. Default 44. */
    size?: number;
    /** Radius utility class, matched to the call site. Default `rounded-[0.75rem]`. */
    rounded?: string;
    /** Render just the contained mark, with no tile surface behind it. */
    bare?: boolean;
    /** Inner padding as a fraction of `size` for tiled marks. Default 0.18. */
    padding?: number;
    className?: string;
    /** Alt text + fallback initial when the brand can't be resolved. */
    label?: string;
    /** Fallback letter-badge background colour when the brand can't be resolved. */
    color?: string;
    /** Custom fallback node, used instead of the default letter badge. */
    fallback?: ReactNode;
};

/**
 * Normalized third-party brand logo. Resolves `brand` to an asset in the central
 * registry and renders it at a consistent size on a neutral tile (light by
 * default, dark for white marks like Grok), with uniform padding so no logo is
 * over- or undersized. When the brand has no asset, falls back to the previous
 * placeholder (a custom `fallback`, or a coloured letter badge) so call sites
 * degrade gracefully. The badge box geometry is identical to the placeholders it
 * replaces, so layout, spacing, and sizing are unchanged.
 */
const BrandIcon = ({ brand, size = 44, rounded = "rounded-[0.75rem]", bare = false, padding = 0.18, className, label, color, fallback }: BrandIconProps) => {
    const [failed, setFailed] = useState(false);
    const key = resolveBrand(brand);

    if (!key || failed) {
        if (fallback !== undefined) return <>{fallback}</>;
        return (
            <span
                style={{ width: size, height: size, backgroundColor: color, fontSize: Math.max(11, Math.round(size * 0.4)) }}
                className={cn("flex shrink-0 items-center justify-center font-poppins font-extrabold text-white", rounded, !color && "bg-primary", className)}
            >
                {initial(label ?? brand)}
            </span>
        );
    }

    const def = BRANDS[key];
    const alt = label ?? def.name;
    // eslint-disable-next-line @next/next/no-img-element
    const mark = <img src={brandAsset(key)} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain" />;

    if (bare) {
        return (
            <span style={{ width: size, height: size }} className={cn("inline-flex shrink-0 items-center justify-center", className)}>
                {mark}
            </span>
        );
    }

    const pad = Math.round(size * padding);
    const dark = def.tile === "dark";
    return (
        <span
            style={{ width: size, height: size, padding: pad }}
            className={cn(
                "flex shrink-0 items-center justify-center ring-1",
                rounded,
                dark ? "bg-[#15151f] ring-white/10" : "bg-white ring-black/[0.06] dark:ring-white/10",
                className,
            )}
        >
            {mark}
        </span>
    );
};

export default BrandIcon;
