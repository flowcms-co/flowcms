/**
 * White-label accent → CSS variable overrides. The whole purple family is derived
 * from the one accent via color-mix so it moves together. Shared by BrandStyle
 * (runtime <style>) and the pre-paint boot script in app/layout.tsx — keep the
 * two CSS templates identical so a reload and a live change look the same.
 */
export const BRAND_COOKIE = "fc_brand";

export const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function brandAccentCss(a: string): string {
    return `:root{
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
}

/** Cookie payload mirrored from the active workspace's brand, read pre-paint. */
export type BrandCookie = { accent: string | null; name: string | null; logo: string | null };

// The license is fetched client-side, so the studio's chrome (white-label sidebar
// vs. the default Flow CMS logo) flips after first paint -> a flash. Mirroring the
// resolved license into this cookie lets the server layout seed it into the first
// render, so the branded chrome is correct from the very first paint.
export const LICENSE_COOKIE = "fc_license";

export type LicenseCookie = { valid: boolean; plan: string; features: string[] };

export function parseLicenseCookie(raw?: string): LicenseCookie | undefined {
    if (!raw) return undefined;
    try {
        const p = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
        if (p && typeof p === "object" && Array.isArray(p.features)) {
            return {
                valid: !!p.valid,
                plan: typeof p.plan === "string" ? p.plan : "community",
                features: (p.features as unknown[]).filter((x): x is string => typeof x === "string"),
            };
        }
    } catch {
        /* malformed cookie: ignore */
    }
    return undefined;
}
