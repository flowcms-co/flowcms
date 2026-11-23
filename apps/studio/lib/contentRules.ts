"use client";

import { createContext, useContext } from "react";
import { patternOf, type ContentRules, type FieldRules } from "@flowcms/shared/content-rules";
import type { TidyCounts } from "@flowcms/shared/tidy";

/** The content type's formatting rules, and where to report what was tidied. Empty = no rules. */
export type RulesContextValue = {
    rules: ContentRules | null;
    /** Called with what a field just tidied; the editor page turns it into the small note. */
    onTidy?: (c: TidyCounts) => void;
    /** Soft problems (path -> message), shown in amber under the field. They never block anything. */
    warnings?: Record<string, string>;
};

export const ContentRulesContext = createContext<RulesContextValue>({ rules: null });
export const useContentRules = () => useContext(ContentRulesContext);

/** The rule set for a field at `path` (`sections[2].content` finds `sections[].content`). */
export const rulesAt = (rules: ContentRules | null, path: string): FieldRules | undefined => rules?.fields?.[patternOf(path)];

/** The names an `allow` rule lists for the field at `path`, or undefined when it has none. */
export const allowAt = (rules: ContentRules | null, path: string): string[] | undefined => {
    const a = rulesAt(rules, path)?.allow;
    const v = a && typeof a === "object" && !Array.isArray(a) ? a.value : a;
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
};

/** Whether the field at `path` has a `noTrailingColon` rule (so tidy also removes one). */
export const stripsColon = (rules: ContentRules | null, path: string): boolean => {
    const r = rulesAt(rules, path)?.noTrailingColon;
    return !!r && !(typeof r === "object" && !Array.isArray(r) && r.value === false);
};

export const tidyOn = (rules: ContentRules | null) => !!rules && rules.tidy !== false;

/** Ask every repeatable block and folded card to open the field at `path` (a jump from the publish panel). */
export const REVEAL_EVENT = "flowcms:reveal";
export const revealField = (path: string) => window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: path }));
