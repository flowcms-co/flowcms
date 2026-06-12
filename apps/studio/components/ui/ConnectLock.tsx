"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import { resolveBrand } from "@/lib/brands";

type Props = {
    /** Whether the integration this card depends on is connected. */
    connected: boolean;
    /** While the connection status is still resolving, render through (no flash). */
    loading?: boolean;
    /** Overlay heading, e.g. "Connect Search Console". */
    title: string;
    /** One line on what connecting unlocks. */
    description: string;
    /** Brand name for the overlay logo (see `resolveBrand`); falls back to `icon`. */
    brand?: string;
    /** Fallback glyph when there is no brand asset. */
    icon?: string;
    /** Where the CTA links (the relevant integrations settings tab). */
    href?: string;
    /** CTA label, e.g. "Connect Search Console". */
    ctaLabel?: string;
    children: ReactNode;
    className?: string;
};

/**
 * Integration gate, mirroring `UpgradeLock`'s gate mode but driven by connection
 * status instead of license tier. When the required integration isn't connected,
 * the card renders as a dimmed teaser behind a centered "Connect X" overlay
 * (show, don't hide); once connected it renders the real card untouched. Used on
 * the SEO dashboard so cards that need GSC / GA4 / DataForSEO / PageSpeed only
 * populate with live data after the user connects the relevant source.
 */
const ConnectLock = ({
    connected,
    loading,
    title,
    description,
    brand,
    icon = "lock",
    href = "/settings/integrations?tab=analytics",
    ctaLabel = "Connect",
    children,
    className,
}: Props) => {
    // Unlocked, or status still resolving: show the real card. Rendering through
    // while loading keeps a connected dashboard from flashing a lock on first paint.
    if (connected || loading) return <>{children}</>;

    const brandKey = brand ? resolveBrand(brand) : null;
    return (
        <div className={`relative ${className ?? ""}`}>
            <div aria-hidden className="pointer-events-none select-none opacity-40 blur-[1px]">
                {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="max-w-sm rounded-2xl border border-grey-light bg-white/85 p-6 text-center backdrop-blur-sm dark:border-grey-light/10 dark:bg-dark-2/85">
                    <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                        {brandKey ? (
                            <BrandIcon brand={brand!} size={24} bare label={title} />
                        ) : (
                            <Icon className="h-5 w-5 fill-primary dark:fill-lilac" name={icon} />
                        )}
                    </span>
                    <h3 className="mb-1 text-h6 text-black dark:text-white">{title}</h3>
                    <p className="mx-auto mb-4 max-w-xs text-caption-2 text-grey">{description}</p>
                    <div className="flex justify-center">
                        <Link href={href} className="btn-primary h-10 px-4">
                            <Icon className="h-4 w-4 fill-white" name="plus" />
                            {ctaLabel}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConnectLock;
