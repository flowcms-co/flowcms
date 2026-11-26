"use client";

import { useEffect, useMemo, useState } from "react";
import {
    DEFAULT_THEME,
    ELEMENT_FONTS,
    ELEMENT_TEMPLATES,
    THEME_COLOR_KEYS,
    THEME_LABELS,
    parseTheme,
    renderElement,
    type ElementTemplate,
    type ElementsTheme,
} from "@flowcms/shared/elements";
import Icon from "@/components/ui/Icon";
import { TierBadge } from "@/components/ui/UpgradeLock";
import ElementDrawer from "@/components/editor/ElementDrawer";
import ElementUpgrade from "@/components/editor/ElementUpgrade";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlan } from "@/components/providers/LicenseProvider";
import { api, ApiError } from "@/lib/api";
import { applyElementsTheme, restoreSavedTheme, setSavedTheme, useSavedTheme } from "@/lib/elements";

const WIDTHS: { id: string; label: string; px: number | null }[] = [
    { id: "320", label: "320", px: 320 },
    { id: "768", label: "768", px: 768 },
    { id: "full", label: "Full", px: null },
];

/** The sandbox preview of one template: the default values rendered with the live theme. */
const Card = ({ t, px, onTry }: { t: ElementTemplate; px: number | null; onTry: () => void }) => {
    const html = useMemo(() => renderElement(t.id, t.defaults()), [t]);
    return (
        <button
            type="button"
            onClick={onTry}
            data-element-card={t.id}
            className="flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_0.25rem_1.25rem_rgba(26,26,46,0.06)] transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.12)] dark:bg-dark-1"
        >
            <div className="pointer-events-none bg-lavender-mist p-4 dark:bg-dark-3">
                <div data-preview className="mx-auto min-w-0 max-w-full" style={{ width: px ?? "100%", outline: px ? "1px dashed var(--color-lilac, #b9b1f5)" : undefined, outlineOffset: 6 }} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
            <div className="p-4">
                <p className="flex flex-wrap items-center gap-2 text-body-2 font-semibold text-black dark:text-white">
                    {t.name}
                    <TierBadge feature="elements" />
                </p>
                <p className="mt-0.5 text-caption-1 text-grey">{t.description}</p>
                <p className="mt-2 text-right text-caption-2 font-semibold text-primary dark:text-lilac">Try the fields →</p>
            </div>
        </button>
    );
};

const Row = ({ label, children, value }: { label: string; children: React.ReactNode; value: string }) => (
    <div className="flex items-center gap-3 border-b border-grey-light py-2 last:border-b-0 dark:border-grey-light/15">
        <span className="flex-1 text-caption-1 font-semibold text-black dark:text-white">{label}</span>
        <code className="w-16 text-right text-caption-2 text-grey">{value}</code>
        {children}
    </div>
);

/** The theme panel: edits show on every preview at once, and only Save keeps them. */
const ThemePanel = ({ saved, onClose }: { saved: ElementsTheme; onClose: () => void }) => {
    const { can } = useAuth();
    const canSave = can("workspace.manage");
    const [draft, setDraft] = useState<ElementsTheme>(saved);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const change = (patch: Partial<ElementsTheme>) => {
        const next = { ...draft, ...patch };
        setDraft(next);
        setMsg(null);
        applyElementsTheme(next);
    };
    const save = async () => {
        const { theme, errors } = parseTheme(draft);
        if (errors.length) return setMsg({ ok: false, text: errors[0] });
        setBusy(true);
        try {
            const out = await api<ElementsTheme>("/elements/theme", { method: "PUT", body: JSON.stringify(theme) });
            setSavedTheme(out);
            setMsg({ ok: true, text: "Theme saved. Sites pick it up within a minute, no republish needed." });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save the theme." });
        } finally {
            setBusy(false);
        }
    };
    const close = () => {
        restoreSavedTheme();
        onClose();
    };
    return (
        <aside role="complementary" aria-label="Edit theme" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[24rem] flex-col bg-white shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
            <div className="flex items-center justify-between border-b border-grey-light px-5 py-4 dark:border-grey-light/15">
                <div>
                    <p className="text-caption-2 font-semibold uppercase tracking-wide text-grey">Elements theme</p>
                    <h2 className="text-h6 text-black dark:text-white">Edit theme</h2>
                </div>
                <button type="button" onClick={close} aria-label="Close theme panel" className="btn-circle h-9 w-9 dark:bg-dark-3">
                    <Icon className="h-4 w-4 fill-grey" name="close" />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                <p className="mb-2 text-caption-2 text-grey">Changes show live on every preview. One theme for every element, in the editor and on your site.</p>
                {THEME_COLOR_KEYS.map((k) => (
                    <Row key={k} label={THEME_LABELS[k]} value={draft[k].toLowerCase()}>
                        <input type="color" aria-label={THEME_LABELS[k]} value={draft[k].toLowerCase()} onChange={(e) => change({ [k]: e.target.value })} className="h-8 w-10 cursor-pointer rounded-md border border-grey-light bg-white p-0.5" />
                    </Row>
                ))}
                <Row label="Corner radius" value={`${draft.radius}px`}>
                    <input type="range" min={0} max={32} step={1} aria-label="Corner radius" value={draft.radius} onChange={(e) => change({ radius: Number(e.target.value) })} className="w-36 accent-primary" />
                </Row>
                <Row label="Font" value="">
                    <select aria-label="Font" className="flow-input h-9 w-44 px-2" value={draft.font} onChange={(e) => change({ font: e.target.value })}>
                        <option value="inherit">Inherit site font</option>
                        {ELEMENT_FONTS.map((f) => (
                            <option key={f.name} value={f.name}>
                                {f.name}
                            </option>
                        ))}
                    </select>
                </Row>
            </div>
            <div className="border-t border-grey-light px-5 py-4 dark:border-grey-light/15">
                <p className={`mb-2 min-h-4 text-caption-2 ${msg ? (msg.ok ? "text-success" : "text-error") : "text-grey"}`} aria-live="polite">
                    {msg?.text ?? (canSave ? "" : "Only workspace managers can save the theme.")}
                </p>
                <div className="flex gap-2">
                    <button type="button" className="btn-primary" disabled={busy || !canSave} onClick={save}>
                        {busy ? "Saving…" : "Save theme"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => change({ ...DEFAULT_THEME })}>
                        Reset to defaults
                    </button>
                </div>
            </div>
        </aside>
    );
};

/** Assets > Element templates: a live preview of every template in the workspace theme, a sandbox for the fields, and the theme panel. */
const ElementTemplates = () => {
    const { locked } = usePlan();
    const { theme: saved, ready } = useSavedTheme();
    const [width, setWidth] = useState("full");
    const [tryT, setTryT] = useState<ElementTemplate | null>(null);
    const [panel, setPanel] = useState(false);
    const px = WIDTHS.find((w) => w.id === width)?.px ?? null;
    const templates = ELEMENT_TEMPLATES.filter((t) => t.enabled);

    // Leaving the tab drops an unsaved live preview.
    useEffect(() => () => restoreSavedTheme(), []);

    if (locked("elements"))
        return (
            <div className="max-w-md rounded-2xl bg-white p-6 shadow-[0_0.25rem_1.25rem_rgba(26,26,46,0.06)] dark:bg-dark-1">
                <ElementUpgrade />
            </div>
        );

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <TierBadge feature="elements" />
                <span className="text-caption-1 text-grey">Click a card to try the fields. Real values are filled in the editor.</span>
                <button type="button" onClick={() => setPanel(true)} disabled={!ready} className="btn-secondary ml-auto">
                    <Icon className="h-4 w-4 fill-current" name="settings" />
                    Edit theme
                </button>
            </div>
            <div className="mb-4 flex items-start gap-3 rounded-xl bg-lavender-mist p-3 text-caption-1 text-black dark:bg-dark-3 dark:text-white">
                <Icon className="mt-0.5 h-4 w-4 flex-none fill-primary" name="info" />
                <p>Each time you insert an element, its values are saved with that page only. Nothing here changes pages that already use one.</p>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <b className="text-caption-1 text-black dark:text-white">Preview width</b>
                <div role="group" aria-label="Preview width" className="inline-flex gap-0.5 rounded-xl bg-lavender-mist p-0.5 dark:bg-dark-3">
                    {WIDTHS.map((w) => (
                        <button
                            key={w.id}
                            type="button"
                            aria-pressed={width === w.id}
                            onClick={() => setWidth(w.id)}
                            className={`h-8 rounded-lg px-4 text-caption-1 font-semibold transition-colors ${width === w.id ? "bg-white text-primary shadow-sm dark:bg-dark-1 dark:text-lilac" : "text-grey"}`}
                        >
                            {w.label}
                        </button>
                    ))}
                </div>
                <span className="text-caption-2 text-grey">{px ? `Showing each element in a ${px}px wide column.` : "Showing each element at the full card width."}</span>
            </div>
            <div className={`grid items-start gap-4 ${px ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
                {templates.map((t) => (
                    <Card key={t.id} t={t} px={px} onTry={() => setTryT(t)} />
                ))}
            </div>
            {tryT && <ElementDrawer template={tryT} initial={tryT.defaults()} editing={false} sandbox onSave={() => setTryT(null)} onClose={() => setTryT(null)} />}
            {panel && <ThemePanel saved={saved} onClose={() => setPanel(false)} />}
        </div>
    );
};

export default ElementTemplates;
