"use client";

import { useEffect } from "react";
import { useBrand } from "@/lib/useBrand";
import { brandAccentCss, BRAND_COOKIE, type BrandCookie } from "@/lib/brand";

const DEFAULT_TITLE = "Flow CMS";
const DEFAULT_ICON = "/favicon.svg";

function setFavicon(href: string) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.href = href;
}

/**
 * White-label accent + identity. When a licensed workspace sets a brand, this
 * overrides the brand CSS variables (retinting every `bg-primary`/`text-lilac`/…),
 * sets the favicon + document title, and mirrors the brand into a cookie so the
 * pre-paint boot script in app/layout.tsx can apply it on the next load with no
 * flash of the default Flow CMS purple/logo. Mirrors null back to defaults when a
 * workspace has no brand (or the install isn't licensed).
 */
const BrandStyle = () => {
    const { accent, name, logoUrl, active } = useBrand();

    useEffect(() => {
        // Mirror the active brand into a cookie for the next load's boot script.
        const payload: BrandCookie | null = active ? { accent, name, logo: logoUrl } : null;
        document.cookie = payload
            ? `${BRAND_COOKIE}=${encodeURIComponent(JSON.stringify(payload))}; path=/; max-age=2592000; samesite=lax`
            : `${BRAND_COOKIE}=; path=/; max-age=0; samesite=lax`;
        // Hand off from the pre-paint boot <style> to this component's own (or to
        // defaults when the brand was cleared), so a reset doesn't leave it stuck.
        document.getElementById("flow-brand-accent-boot")?.remove();
        // Apply identity live (so switching workspaces updates without a reload).
        document.title = active && name ? name : DEFAULT_TITLE;
        setFavicon(active && logoUrl ? logoUrl : DEFAULT_ICON);
    }, [active, accent, name, logoUrl]);

    if (!accent) return null;
    return <style id="flow-brand-accent" dangerouslySetInnerHTML={{ __html: brandAccentCss(accent) }} />;
};

export default BrandStyle;
