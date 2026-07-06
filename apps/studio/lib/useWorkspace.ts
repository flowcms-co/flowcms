"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";

export type Workspace = {
    id: string;
    name: string;
    slug: string;
    locales: string[];
    defaultLocale: string;
    onboardedAt: string | null;
    previewUrl: string | null;
    /** White-label (applied only when licensed for `white_label`). */
    brandName: string | null;
    brandLogoUrl: string | null;
    brandAccent: string | null;
};

let cache: Workspace | null = null;

/** Common locale codes → friendly names for labels. */
export const LOCALE_NAMES: Record<string, string> = {
    en: "English", "en-US": "English (US)", "en-GB": "English (UK)", es: "Spanish", fr: "French", de: "German",
    it: "Italian", pt: "Portuguese", "pt-BR": "Portuguese (BR)", nl: "Dutch", ja: "Japanese", "zh": "Chinese",
    ko: "Korean", ar: "Arabic", hi: "Hindi", ru: "Russian", pl: "Polish", sv: "Swedish", tr: "Turkish",
};
export const localeName = (code: string) => LOCALE_NAMES[code] ?? code;

/** Fetch the current workspace's settings (locales etc.), module-cached.
 *  Gated on auth so components rendered before sign-in (e.g. on the login
 *  screen) don't fire a request that 401s in the console. */
export function useWorkspace() {
    const [ws, setWs] = useState<Workspace | null>(cache);
    const { status } = useAuth();

    useEffect(() => {
        if (cache || status !== "authenticated") return;
        api<Workspace>("/workspace")
            .then((w) => {
                cache = w;
                setWs(w);
            })
            .catch(() => {});
    }, [status]);

    return ws;
}

/** Invalidate the cache after editing workspace settings. */
export function clearWorkspaceCache() {
    cache = null;
}
