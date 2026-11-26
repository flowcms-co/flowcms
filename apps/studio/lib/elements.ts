"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, elementsCss, themeCss, type ElementsTheme } from "@flowcms/shared/elements";
import { usePlanIfAny } from "@/components/providers/LicenseProvider";
import { api } from "@/lib/api";

const STYLE_ID = "flow-elements-css";

let saved: ElementsTheme = DEFAULT_THEME;
let loaded: Promise<void> | null = null;

/** Write a theme into the page's one Elements stylesheet. Every element preview on the page follows it at once. */
export function applyElementsTheme(theme: ElementsTheme) {
    if (typeof document === "undefined") return;
    let el = document.getElementById(STYLE_ID);
    if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = elementsCss(themeCss(theme));
}

/** The workspace's saved theme, fetched once per page load. */
function loadSaved(force = false): Promise<void> {
    if (force || !loaded) {
        loaded = api<ElementsTheme>("/elements/theme")
            .then((t) => {
                saved = t;
                applyElementsTheme(t);
            })
            .catch(() => {
                loaded = null;
            });
    }
    return loaded;
}

/** Remember a theme as the saved one (after a successful save) and show it. */
export function setSavedTheme(theme: ElementsTheme) {
    saved = theme;
    loaded = Promise.resolve();
    applyElementsTheme(theme);
}

/** The saved theme as of now (it changes after a save, so read it when a panel opens, not from a stale hook value). */
export const getSavedTheme = () => saved;

/** Put the saved theme back, dropping any unsaved live preview. */
export const restoreSavedTheme = () => applyElementsTheme(saved);

/** Element previews in the editor and drawers: the base styles plus the workspace theme. */
export function useElementStyles() {
    const licensed = usePlanIfAny()?.has("elements") ?? false;
    useEffect(() => {
        if (!document.getElementById(STYLE_ID)) applyElementsTheme(saved);
        if (licensed) void loadSaved();
    }, [licensed]);
}

/** The saved theme for the Element templates tab. */
export function useSavedTheme(): { theme: ElementsTheme; ready: boolean } {
    const [theme, setTheme] = useState<ElementsTheme>(saved);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let live = true;
        void loadSaved(true).then(() => {
            if (!live) return;
            setTheme(saved);
            setReady(true);
        });
        return () => {
            live = false;
        };
    }, []);
    return { theme, ready };
}

/** Tells the toolbar that owns this editor to open the fill drawer on the element at `pos`. */
export const EDIT_ELEMENT_EVENT = "flow-element-edit";
export type EditElementDetail = { editor: unknown; pos: number };
