"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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

/** Fetch the current workspace's settings (locales etc.), module-cached. */
export function useWorkspace() {
    const [ws, setWs] = useState<Workspace | null>(cache);

    useEffect(() => {
        if (cache) return;
        api<Workspace>("/workspace")
            .then((w) => {
                cache = w;
                setWs(w);
            })
            .catch(() => {});
    }, []);

    return ws;
}

/** Invalidate the cache after editing workspace settings. */
export function clearWorkspaceCache() {
    cache = null;
}
