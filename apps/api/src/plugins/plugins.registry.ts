/**
 * Built-in plugin registry. Plugins are server-defined units of behaviour that
 * hook into the content lifecycle. A workspace turns them on/off (and configures
 * them) via the Plugin DB rows; the hook logic lives here. New plugins are added
 * by appending to BUILTINS — no schema or API change needed.
 */
export type PluginField = { key: string; label: string; type: "number" | "text" | "boolean"; default: string | number | boolean };

export type HookCtx = { data: Record<string, unknown>; title: string; status?: string };

export type BuiltinPlugin = {
    key: string;
    name: string;
    description: string;
    /** Optional config fields shown in the UI. */
    fields?: PluginField[];
    /** Transform/augment entry data before it's saved. Returns keys to merge in. */
    beforeSave?: (ctx: HookCtx, config: Record<string, unknown>) => Record<string, unknown> | void;
};

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const wordCount = (html: unknown) => stripHtml(String(html ?? "")).split(/\s+/).filter(Boolean).length;

export const BUILTINS: BuiltinPlugin[] = [
    {
        key: "reading-time",
        name: "Reading time",
        description: "Adds an estimated reading time (in minutes) to every entry, computed from the body length.",
        fields: [{ key: "wpm", label: "Words per minute", type: "number", default: 200 }],
        beforeSave: (ctx, cfg) => {
            const wpm = Number(cfg.wpm) || 200;
            const words = wordCount(ctx.data.body);
            return { readingTime: Math.max(1, Math.round(words / wpm)) };
        },
    },
    {
        key: "word-count",
        name: "Word count",
        description: "Stores the body word count on each entry (handy for editorial dashboards & length rules).",
        beforeSave: (ctx) => ({ wordCount: wordCount(ctx.data.body) }),
    },
    {
        key: "auto-excerpt",
        name: "Auto excerpt",
        description: "Generates a plain-text excerpt from the body when one isn't set.",
        fields: [{ key: "length", label: "Excerpt length (chars)", type: "number", default: 160 }],
        beforeSave: (ctx, cfg) => {
            if (ctx.data.excerpt) return;
            const len = Number(cfg.length) || 160;
            const text = stripHtml(String(ctx.data.body ?? ""));
            if (!text) return;
            return { excerpt: text.length > len ? `${text.slice(0, len).trimEnd()}…` : text };
        },
    },
];

export const builtinByKey = (key: string) => BUILTINS.find((p) => p.key === key);
export const defaultConfig = (p: BuiltinPlugin): Record<string, unknown> =>
    Object.fromEntries((p.fields ?? []).map((f) => [f.key, f.default]));
