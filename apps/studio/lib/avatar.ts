/**
 * Team avatars — a fixed pool of illustrated 3D characters in
 * `/public/avatars/3d/` (1.png … 14.png). Gender-neutral; each user gets one
 * deterministically (stable rotation across the team) and can pick a different
 * one. The chosen character key is stored on the user as `avatarStyle`.
 */
export const AVATAR_POOL: string[] = Array.from({ length: 14 }, (_, i) => String(i + 1));

/** Public path for a character image. */
export const characterSrc = (key: string) => `/avatars/3d/${key}.png`;

/**
 * Public path for the full-body illustration that matches a character key.
 * `/public/illustrations/1.webp … 14.webp` are numbered to match the avatar pool,
 * so the person a user picked as their avatar is the figure on their dashboard.
 * (The source art was auto-traced SVG; rasterized to WebP since it displays small
 * and the traces were ~7 MB each. Swap back when flat layered vectors land.)
 */
export const illustrationSrc = (key: string) => `/illustrations/${key}.webp`;

/** Stable, well-distributed pick from a seed (FNV-1a → index into the pool). */
export function characterForSeed(seed: string): string {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return AVATAR_POOL[(h >>> 0) % AVATAR_POOL.length];
}

/** The character to show: an explicit valid pick, else deterministic from the user id. */
export function resolveCharacter(character?: string | null, seed?: string | null): string {
    if (character && AVATAR_POOL.includes(character)) return character;
    return characterForSeed(seed || "flowcms");
}
