"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { api } from "@/lib/api";

type PluginField = { key: string; label: string; type: "number" | "text" | "boolean"; default: string | number | boolean };
type Plugin = {
    key: string;
    name: string;
    description: string;
    fields: PluginField[];
    enabled: boolean;
    config: Record<string, unknown>;
};

/**
 * Plugins — toggle built-in plugins that hook into the content lifecycle (e.g.
 * reading time, word count, auto-excerpt computed on every save) and tweak their
 * config. Enabled plugins run server-side whenever an entry is created/updated.
 */
const Plugins = () => {
    const [items, setItems] = useState<Plugin[] | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<Plugin[]>("/plugins").then(setItems).catch(() => setItems([]));
    }, []);

    const patch = async (key: string, body: { enabled?: boolean; config?: Record<string, unknown> }) => {
        setItems((prev) => prev?.map((p) => (p.key === key ? { ...p, ...(body.enabled !== undefined ? { enabled: body.enabled } : {}), ...(body.config ? { config: { ...p.config, ...body.config } } : {}) } : p)) ?? prev);
        try {
            await api(`/plugins/${key}`, { method: "PATCH", body: JSON.stringify(body) });
        } catch {
            /* revert silently on failure */
            api<Plugin[]>("/plugins").then(setItems).catch(() => {});
        }
    };

    if (!items) {
        return (
            <div className="grid place-items-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {items.map((p) => (
                <Card key={p.key} className="flex flex-col gap-4">
                    <div className="flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-lavender-mist dark:bg-dark-3">
                            <Icon className="h-5 w-5 fill-primary" name="grid" />
                        </span>
                        <div className="min-w-0 grow">
                            <div className="text-title text-black dark:text-white">{p.name}</div>
                            <p className="mt-0.5 text-caption-2 text-grey">{p.description}</p>
                        </div>
                        <Switch checked={p.enabled} onChange={(v) => patch(p.key, { enabled: v })} />
                    </div>

                    {p.enabled && p.fields.length > 0 && (
                        <div className="flex flex-wrap gap-4 border-t border-grey-light pt-4 dark:border-grey-light/10">
                            {p.fields.map((f) => (
                                <label key={f.key} className="flex flex-col gap-1.5">
                                    <span className="text-caption-2 text-grey">{f.label}</span>
                                    <input
                                        type={f.type === "number" ? "number" : "text"}
                                        value={String(p.config[f.key] ?? f.default)}
                                        onChange={(e) => patch(p.key, { config: { [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value } })}
                                        className="h-10 w-44 rounded-lg border border-grey-light bg-white px-3 text-caption-1 text-black outline-none focus:border-primary dark:border-grey-light/10 dark:bg-dark-1 dark:text-white"
                                    />
                                </label>
                            ))}
                        </div>
                    )}
                </Card>
            ))}
            <p className="text-caption-2 text-grey">
                Plugins run on the server when content is saved. More plugins (and a developer plugin API) are on the roadmap.
            </p>
        </div>
    );
};

export default Plugins;
