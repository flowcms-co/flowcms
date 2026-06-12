"use client";

import { useBrand } from "@/lib/useBrand";

/**
 * White-label accent: when a licensed workspace sets a brand accent, retint the
 * studio by overriding the brand CSS variables at runtime. Tailwind v4 emits
 * `var(--color-*)`-based utilities, so overriding the vars on :root retints every
 * `bg-primary` / `text-primary` / `shadow-glow` etc. The derived shades (lilac,
 * lavender-mist, glow, purple scale) are computed from the one accent via
 * color-mix, so the whole purple family moves together instead of clashing.
 * Renders nothing unless a valid accent is active.
 */
const BrandStyle = () => {
    const { accent } = useBrand();
    if (!accent) return null;
    const a = accent; // already hex-validated by useBrand
    const css = `:root{
  --color-primary:${a};
  --color-purple-500:${a};
  --color-purple-600:color-mix(in oklab, ${a} 86%, black);
  --color-purple-700:color-mix(in oklab, ${a} 68%, black);
  --color-purple-400:color-mix(in oklab, ${a} 74%, white);
  --color-lilac:color-mix(in oklab, ${a} 52%, white);
  --color-purple-300:color-mix(in oklab, ${a} 52%, white);
  --color-purple-200:color-mix(in oklab, ${a} 32%, white);
  --color-purple-100:color-mix(in oklab, ${a} 18%, white);
  --color-lavender-mist:color-mix(in oklab, ${a} 9%, white);
  --color-purple-50:color-mix(in oklab, ${a} 7%, white);
  --shadow-glow:0 0.5rem 1.25rem color-mix(in oklab, ${a} 38%, transparent);
}`;
    return <style id="flow-brand-accent" dangerouslySetInnerHTML={{ __html: css }} />;
};

export default BrandStyle;
