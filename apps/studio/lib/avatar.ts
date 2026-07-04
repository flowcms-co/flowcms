import type { SyntheticEvent } from "react";

/**
 * Team avatars — a fixed pool of 14 illustrated characters. The v2 pack (soft
 * pastel storybook style matching the guided-tour art) lives in
 * `/public/avatars/v2/` and `/public/illustrations/v2/`; the original 3D pack
 * stays on disk as the fallback, so any slot without v2 art yet keeps showing
 * the classic character. Each user gets one deterministically (stable rotation
 * across the team) and can pick a different one; the chosen character key is
 * stored on the user as `avatarStyle`.
 */
export const AVATAR_POOL: string[] = Array.from({ length: 14 }, (_, i) => String(i + 1));

/** Public path for a character image (v2 pack; see `withAvatarFallback`). */
export const characterSrc = (key: string) => `/avatars/v2/${key}.webp`;

/** Classic 3D pack, kept as the per-slot fallback for missing v2 art. */
export const legacyCharacterSrc = (key: string) => `/avatars/3d/${key}.png`;

/**
 * Public path for the dashboard hero illustration that matches a character key
 * (v2 pack). Numbered to match the avatar pool, so the person a user picked as
 * their avatar is the figure on their dashboard.
 */
export const illustrationSrc = (key: string) => `/illustrations/v2/${key}.webp`;

/** Original traced-art hero pack, kept as the per-slot fallback. */
export const legacyIllustrationSrc = (key: string) => `/illustrations/${key}.webp`;

/**
 * onError handler: swap a v2 image to its legacy counterpart exactly once
 * (the dataset flag stops a loop if the legacy file were ever missing too).
 */
export function withAvatarFallback(e: SyntheticEvent<HTMLImageElement>, legacySrc: string): void {
    const img = e.currentTarget;
    if (img.dataset.fellBack) return;
    img.dataset.fellBack = "1";
    img.src = legacySrc;
}

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
