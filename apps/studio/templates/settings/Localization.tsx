"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";
import { clearWorkspaceCache, localeName, LOCALE_NAMES } from "@/lib/useWorkspace";

const field = "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";
const SUGGEST = Object.keys(LOCALE_NAMES);

/**
 * Localization — manage the workspace's content languages. Content can be
 * authored per locale; the public API serves them via ?locale=.
 */
const Localization = () => {
    const [locales, setLocales] = useState<string[]>([]);
    const [defaultLocale, setDefaultLocale] = useState("en");
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<{ locales: string[]; defaultLocale: string }>("/workspace")
            .then((w) => {
                setLocales(w.locales);
                setDefaultLocale(w.defaultLocale);
            })
            .catch(() => {});
    }, []);

    const add = () => {
        const code = draft.trim();
        if (!code || locales.includes(code)) {
            setDraft("");
            return;
        }
        if (!/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/.test(code)) {
            setMsg({ ok: false, text: "Use codes like 'en' or 'pt-BR'." });
            return;
        }
        setLocales([...locales, code]);
        setDraft("");
        setMsg(null);
    };

    const removeLocale = (code: string) => {
        if (locales.length === 1) return;
        const next = locales.filter((l) => l !== code);
        setLocales(next);
        if (defaultLocale === code) setDefaultLocale(next[0]);
    };

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api("/workspace", { method: "PATCH", body: JSON.stringify({ locales, defaultLocale }) });
            clearWorkspaceCache();
            setMsg({ ok: true, text: "Languages saved." });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Card className="flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                    <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="w-5 h-5 fill-primary" name="compass" />
                    </span>
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">Content languages</h2>
                        <p className="text-caption-2 text-grey">Author content per language; the API serves each via <code className="font-mono">?locale=</code>.</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                    {locales.map((l) => (
                        <span key={l} className="inline-flex items-center gap-2 rounded-xl border border-grey-light px-3 py-1.5 text-caption-1 dark:border-grey-light/10">
                            <span className="text-black dark:text-white">{localeName(l)}</span>
                            <span className="font-mono text-grey">{l}</span>
                            {l === defaultLocale ? (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-bold text-primary">DEFAULT</span>
                            ) : (
                                <button type="button" onClick={() => removeLocale(l)} aria-label={`Remove ${l}`} className="opacity-50 hover:opacity-100">
                                    <Icon className="w-3 h-3 fill-current" name="close" />
                                </button>
                            )}
                        </span>
                    ))}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <label className="block grow min-w-[12rem]">
                        <span className="mb-1.5 block text-caption-1 text-grey">Add a language</span>
                        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} list="locale-suggest" placeholder="e.g. es, fr, pt-BR" className={field} />
                        <datalist id="locale-suggest">{SUGGEST.map((c) => <option key={c} value={c}>{localeName(c)}</option>)}</datalist>
                    </label>
                    <button type="button" onClick={add} className="btn-secondary">Add</button>
                    <label className="block">
                        <span className="mb-1.5 block text-caption-1 text-grey">Default language</span>
                        <Select variant="field" ariaLabel="Default language" value={defaultLocale} onChange={setDefaultLocale} options={locales.map((l) => ({ value: l, label: localeName(l) }))} />
                    </label>
                </div>

                <div className="mt-5 flex items-center gap-3">
                    <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">{saving ? "Saving…" : "Save languages"}</button>
                    {msg && <span className={`text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</span>}
                </div>
            </Card>
        </div>
    );
};

export default Localization;
