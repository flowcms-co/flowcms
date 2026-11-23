import type { ContentRules } from "@flowcms/shared";

/**
 * Optional hook that lets the core content engine apply a type's content rules WITHOUT
 * depending on the commercial `ee/` code. The EE `content_rules` module provides this port
 * globally; in Community (no `ee/`) it is absent and every rule check is inert, so saving,
 * publishing and scheduling are never blocked. The implementation must return no rules
 * unless the install is licensed for `content_rules`. Stored rules stay in the schema
 * either way: a lapsed license can never freeze publishing.
 */
export const CONTENT_RULES_PORT = "CONTENT_RULES_PORT";

export interface ContentRulesPort {
    /** The type's rules when licensed and set, otherwise null (nothing is checked or tidied). */
    rulesFor(schema: unknown): Promise<ContentRules | null>;
    /** Throw ForbiddenException (403) unless licensed. Guards saving or changing a type's rules. */
    assertCanEdit(): Promise<void>;
}

/** The active rules for a schema: null whenever the port is absent or unlicensed. */
export const activeRules = (port: ContentRulesPort | undefined, schema: unknown): Promise<ContentRules | null> =>
    port ? port.rulesFor(schema) : Promise.resolve(null);
