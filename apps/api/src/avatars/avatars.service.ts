import { Injectable } from "@nestjs/common";
import { createAvatar } from "@dicebear/core";
import * as collection from "@dicebear/collection";
import { PrismaService } from "../prisma/prisma.service";

/** Vibe → DiceBear illustrated style. Curated to clean, modern, on-brand styles
 *  that sit cohesively in the Unity look (no cartoonish/sketchy outliers). */
const STYLE_MAP: Record<string, keyof typeof collection> = {
    friendly: "adventurer", // warm, diverse skin tones, glasses, lots of variety
    bold: "avataaars", // very varied: specs, cool/nerd/fun looks
    minimal: "personas", // flat & modern, diverse
    classic: "lorelei", // soft illustrated, diverse
    professional: "micah", // clean & modern, diverse
    // allow passing a raw collection key too
};

const DEFAULT_STYLE = "friendly";
// Soft purple → lavender ramp so every avatar's background matches the Unity
// brand palette and the whole team reads as one cohesive family.
const BRAND_BG = ["EDE9FB", "DDD6FE", "C4B5FD", "A29BFE", "8674F0", "6C5CE7"];

@Injectable()
export class AvatarsService {
    constructor(private readonly prisma: PrismaService) {}

    private resolveStyle(style?: string | null) {
        const key = style && style in STYLE_MAP ? STYLE_MAP[style] : (style as keyof typeof collection);
        const c = (key && (collection as Record<string, unknown>)[key]) || collection.adventurer;
        return c as Parameters<typeof createAvatar>[0];
    }

    /** Deterministic SVG from a style + seed (+ optional bg hex, no '#').
     *  The figure is varied per seed (DiceBear randomizes skin tone / hair /
     *  features across its full pools → mixed ethnicity & cool/nerd/fun looks);
     *  we widen the accessory probabilities so roughly half the team wears specs.
     *  The background stays on the brand purple→lavender ramp for Unity cohesion. */
    render(opts: { style?: string | null; seed?: string | null; bg?: string | null }): string {
        const style = this.resolveStyle(opts.style ?? DEFAULT_STYLE);
        const seed = opts.seed || "flowcms";
        const backgroundColor = opts.bg ? [opts.bg.replace(/^#/, "")] : BRAND_BG;
        // Permissive options: extra `*Probability` keys are honoured where the
        // style supports them (adventurer/avataaars/lorelei/notionists/micah…)
        // and harmlessly ignored elsewhere — so we get specs/accessory variety
        // without per-style branching.
        const params = {
            seed,
            backgroundColor,
            backgroundType: ["solid"],
            glassesProbability: 50, // some with specs, some without
            accessoriesProbability: 35,
            featuresProbability: 25,
        } as Parameters<typeof createAvatar>[1];
        return createAvatar(style, params).toString();
    }

    /** A specific user's stored avatar.
     *  Seeded by the (already public, URL-supplied) userId, never by name/email, so
     *  the rendered SVG is identical whether or not the user exists. This removes the
     *  user-enumeration oracle (a missing user renders the same as a present one,
     *  and the endpoint already returns an avatar rather than 404) and keeps email or
     *  name out of the deterministic seed. SECURITY_AUDIT_REPORT F-15. */
    async forUser(userId: string): Promise<string> {
        const u = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { avatarStyle: true, avatarSeed: true, avatarBg: true },
        });
        return this.render({
            style: u?.avatarStyle ?? DEFAULT_STYLE,
            seed: u?.avatarSeed || userId,
            bg: u?.avatarBg ?? null,
        });
    }

    /** Store the chosen character key (1..N from the studio's avatar pool) on the
     *  user as `avatarStyle`. Empty → null, so the studio falls back to a stable
     *  deterministic-by-id pick. (Old DiceBear style/seed/bg are no longer used.) */
    profileFrom(input: { style?: string; gender?: string; bg?: string; name?: string | null; email?: string }) {
        return {
            avatarStyle: input.style?.trim() || null,
            avatarSeed: null,
            avatarBg: null,
        };
    }
}
