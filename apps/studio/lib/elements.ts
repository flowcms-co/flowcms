"use client";

import { useEffect } from "react";
import { elementsCss } from "@flowcms/shared/elements";

/** Add the Elements stylesheet (default theme plus base styles) to the page once, for editor previews. */
export function useElementStyles() {
    useEffect(() => {
        if (document.getElementById("flow-elements-css")) return;
        const el = document.createElement("style");
        el.id = "flow-elements-css";
        el.textContent = elementsCss();
        document.head.appendChild(el);
    }, []);
}

/** Tells the toolbar that owns this editor to open the fill drawer on the element at `pos`. */
export const EDIT_ELEMENT_EVENT = "flow-element-edit";
export type EditElementDetail = { editor: unknown; pos: number };
