"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { characterSrc, legacyCharacterSrc, resolveCharacter, withAvatarFallback } from "@/lib/avatar";

const initials = (name?: string | null) =>
    (name || "?")
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

/**
 * A person's avatar. Order of preference: an uploaded image (`src`) → the user's
 * chosen 3D character (`character`, an `avatarStyle` key) → a character picked
 * deterministically from their `userId` → initials. Avatars are the brand-allowed
 * exception to the no-circles rule, so they're round by default (`square` opts
 * into the rounded-rectangle shape).
 */
const Avatar = ({
    userId,
    character,
    src,
    name,
    size = 36,
    square = false,
    ring = false,
    className,
}: {
    userId?: string | null;
    character?: string | null;
    src?: string | null;
    name?: string | null;
    size?: number;
    square?: boolean;
    ring?: boolean;
    className?: string;
}) => {
    const [failed, setFailed] = useState(false);
    const shape = square ? "rounded-md" : "rounded-full";
    const cls = cn("shrink-0 bg-lavender-mist object-cover dark:bg-dark-3", shape, ring && "ring-2 ring-white dark:ring-dark-1", className);

    // Initials fallback (no identity, or an image failed to load).
    if (failed || (!src && !userId && !character)) {
        return (
            <span
                style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
                className={cn("inline-flex shrink-0 items-center justify-center bg-lavender-mist font-bold text-primary dark:bg-dark-3 dark:text-lilac", shape, ring && "ring-2 ring-white dark:ring-dark-1", className)}
            >
                {initials(name)}
            </span>
        );
    }

    // Uploaded override — arbitrary (possibly cross-origin) URL → plain <img>.
    if (src) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={src} alt={name || "Avatar"} width={size} height={size} style={{ width: size, height: size }} loading="lazy" onError={() => setFailed(true)} className={cls} />;
    }

    // Pooled character — small local asset served as-is (`unoptimized`); skipping
    // the next/image optimizer avoids stale-cache issues when the set is swapped.
    const charKey = resolveCharacter(character, userId);
    return (
        <Image
            src={characterSrc(charKey)}
            alt={name || "Avatar"}
            width={size}
            height={size}
            style={{ width: size, height: size }}
            unoptimized
            onError={(e) => withAvatarFallback(e, legacyCharacterSrc(charKey))}
            className={cls}
        />
    );
};

export default Avatar;
