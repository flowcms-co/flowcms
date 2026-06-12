"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import Select from "@/components/ui/Select";
import RichTextField from "@/components/editor/RichTextField";
import { api, ApiError } from "@/lib/api";
import { learnFromFix } from "@/lib/seoLearn";

/** The issue handed to the modal (a managed-entry issue with a page id). */
export type FixIssue = { id: string; path: string; title: string; key: string; fix: string; autoAi?: boolean };

type Mode = "meta" | "canonical" | "noindex" | "schema" | "faq" | "headings" | "content" | "alt";

const SCHEMA_TYPES = ["Article", "BlogPosting", "NewsArticle", "WebPage", "Product", "Service", "FAQPage", "Organization", "BreadcrumbList"];

function modeFor(issue: FixIssue): Mode {
    if (issue.fix === "meta") return "meta";
    if (issue.fix === "faq") return "faq";
    if (issue.fix === "alt") return "alt";
    if (issue.key === "TECH_CANONICAL_MISSING") return "canonical";
    if (issue.key === "TECH_NOINDEX") return "noindex";
    if (issue.fix === "schema") return "schema";
    if (/^H1_|HEADING_SKIP/.test(issue.key)) return "headings";
    return "content"; // THIN_CONTENT / READABILITY_HARD / DUPLICATE_CONTENT
}

const TITLES: Record<Mode, string> = {
    meta: "Edit title & meta description",
    canonical: "Set the canonical URL",
    noindex: "Indexing (robots)",
    schema: "Add structured data (JSON-LD)",
    faq: "Add FAQ schema",
    headings: "Fix heading structure",
    content: "Improve this content",
    alt: "Add image alt text",
};

const titleOk = (n: number) => n >= 30 && n <= 60;
const descOk = (n: number) => n >= 70 && n <= 160;

/** Deterministic JSON-LD scaffold for a type (no AI needed) the user can edit. */
function schemaTemplate(type: string, ctx: { title: string; url: string; description: string }): string {
    const base = { "@context": "https://schema.org", "@type": type };
    let obj: Record<string, unknown>;
    switch (type) {
        case "FAQPage":
            obj = { ...base, mainEntity: [{ "@type": "Question", name: "What is …?", acceptedAnswer: { "@type": "Answer", text: "…" } }, { "@type": "Question", name: "How does … work?", acceptedAnswer: { "@type": "Answer", text: "…" } }] };
            break;
        case "Organization":
            obj = { ...base, name: ctx.title, url: ctx.url, logo: `${ctx.url}/logo.png`, sameAs: ["https://www.linkedin.com/company/your-company"] };
            break;
        case "Product":
            obj = { ...base, name: ctx.title, description: ctx.description, offers: { "@type": "Offer", price: "0.00", priceCurrency: "USD", availability: "https://schema.org/InStock" } };
            break;
        case "Service":
            obj = { ...base, name: ctx.title, description: ctx.description, provider: { "@type": "Organization", name: "" }, areaServed: "" };
            break;
        case "BreadcrumbList":
            obj = { ...base, itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "/" }, { "@type": "ListItem", position: 2, name: ctx.title, item: ctx.url }] };
            break;
        case "WebPage":
            obj = { ...base, name: ctx.title, description: ctx.description, url: ctx.url };
            break;
        default: // Article / BlogPosting / NewsArticle
            obj = { ...base, headline: ctx.title, description: ctx.description, url: ctx.url, datePublished: "", author: { "@type": "Organization", name: "" }, publisher: { "@type": "Organization", name: "" } };
    }
    return JSON.stringify(obj, null, 2);
}

/**
 * One in-place fix surface for managed-entry issues. Loads the entry, edits the
 * relevant field(s) by hand (the default), offers an optional AI assist, and saves
 * straight back to the page. No leaving the AI Optimizer.
 */
const IssueFixModal = ({ issue, onClose, onSaved }: { issue: FixIssue | null; onClose: () => void; onSaved?: () => void }) => {
    // Retain the last issue while the close transition plays, so the body doesn't
    // flash the default (content / rich-text) mode as `issue` drops to null on close.
    const [shown, setShown] = useState<FixIssue | null>(issue);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- keep last issue during close
        if (issue) setShown(issue);
    }, [issue]);
    const active = issue ?? shown;
    const mode = active ? modeFor(active) : "content";

    const [data, setData] = useState<Record<string, unknown>>({});
    const [entryTitle, setEntryTitle] = useState("");
    const [loading, setLoading] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [learned, setLearned] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // editable working copies
    const [metaTitle, setMetaTitle] = useState("");
    const [metaDesc, setMetaDesc] = useState("");
    const [canonical, setCanonical] = useState("");
    const [schemaType, setSchemaType] = useState("Article");
    const [jsonld, setJsonld] = useState("");
    const [body, setBody] = useState("");
    const [alts, setAlts] = useState<{ src: string; alt: string }[]>([]);

    const bodyText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // Load the entry when the modal opens.
    useEffect(() => {
        if (!issue?.id) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the modal loads the entry
        setLoading(true);
        setSaved(false);
        setLearned(false);
        setError(null);
        api<{ title: string; slug?: string | null; data: Record<string, unknown> }>(`/entries/${issue.id}`)
            .then((e) => {
                const d = e.data ?? {};
                setData(d);
                setEntryTitle(String(d.title ?? e.title ?? ""));
                setMetaTitle(String(d.metaTitle ?? e.title ?? ""));
                setMetaDesc(String(d.metaDescription ?? d.summary ?? ""));
                // Canonical defaults to the page's own URL (self-canonical): existing value,
                // else the slug from the issue/entry. So the field is never blank.
                const selfUrl = issue.path || (e.slug ? `/${e.slug}` : "");
                setCanonical(String(d.canonical ?? selfUrl));
                const defaultType = issue.key === "SCHEMA_SERVICE_MISSING" ? "Service"
                    : issue.key === "SCHEMA_ORG_MISSING" ? "Organization"
                    : issue.fix === "faq" ? "FAQPage" : "Article";
                const st = String(d.jsonLdType ?? defaultType);
                setSchemaType(st);
                // Prefill a deterministic JSON-LD scaffold when none exists (no AI needed).
                const existingLd = String(d.jsonLd ?? "");
                setJsonld(existingLd || ((issue.fix === "schema" || issue.fix === "faq")
                    ? schemaTemplate(st, { title: String(d.title ?? e.title ?? ""), url: issue.path || "", description: String(d.metaDescription ?? d.summary ?? "") })
                    : ""));
                const b = String(d.body ?? "");
                setBody(b);
                // alt: collect images missing alt
                const imgs: { src: string; alt: string }[] = [];
                const re = /<img\b[^>]*>/gi;
                let m: RegExpExecArray | null;
                while ((m = re.exec(b))) {
                    const tag = m[0];
                    const cur = /alt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
                    const src = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
                    if (src && !cur.trim()) imgs.push({ src, alt: "" });
                }
                setAlts(imgs);
            })
            .catch(() => setError("Couldn't load this page."))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issue?.id, issue?.path]);

    const runAi = async () => {
        if (!issue) return;
        setAiBusy(true);
        setError(null);
        try {
            if (mode === "meta") {
                const r = await api<{ title: string; description: string }>("/seo/suggest-meta", { method: "POST", body: JSON.stringify({ path: issue.path, title: metaTitle || entryTitle, description: metaDesc }) });
                if (r.title) setMetaTitle(r.title);
                if (r.description) setMetaDesc(r.description);
            } else if (mode === "schema" || mode === "faq") {
                const r = await api<{ jsonld: string; type: string | null }>("/seo/suggest-schema", { method: "POST", body: JSON.stringify({ path: issue.path, title: entryTitle, description: String(data.summary ?? ""), body: bodyText(body).slice(0, 800), kind: mode === "faq" ? "faq" : "auto" }) });
                setJsonld(r.jsonld);
                if (r.type) setSchemaType(r.type);
            } else if (mode === "alt") {
                const r = await api<{ suggestions: { src: string; alt: string }[] }>(`/seo/scan/alt/${issue.id}`, { method: "POST" });
                const map = new Map(r.suggestions.map((s) => [s.src.split("/").pop(), s.alt]));
                setAlts((prev) => prev.map((a) => ({ ...a, alt: map.get(a.src.split("/").pop() ?? "") ?? a.alt })));
            } else if (mode === "content") {
                const instruction =
                    issue.key === "THIN_CONTENT" ? "Expand this page with useful, original, well-structured detail (keep the same topic and voice)."
                    : issue.key === "READABILITY_HARD" ? "Rewrite this page to be clearer and easier to read: shorter sentences, simpler words, keep all meaning."
                    : "Rewrite this page so it no longer overlaps other pages: make the wording original while keeping the meaning.";
                const r = await api<{ text: string }>("/ai/generate", { method: "POST", body: JSON.stringify({ feature: "ai.refresh", system: "You are an expert web editor. Return clean HTML body content only (use <h2>, <p>, <ul>). No markdown fences, no commentary.", prompt: `${instruction}\n\nTitle: ${entryTitle}\n\nCurrent content (HTML):\n${body.slice(0, 6000)}`, maxTokens: 1600, temperature: 0.5 }) });
                if (r.text) setBody(r.text.trim().replace(/^```html?/i, "").replace(/```$/, "").trim());
            }
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "AI assist failed. Connect an AI provider in Settings, Integrations.");
        } finally {
            setAiBusy(false);
        }
    };

    // Auto-run AI if the row's "Fix with AI" opened the modal.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-runs the AI assist
        if (issue?.autoAi && !loading && !aiBusy && issue.id) void runAi();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issue?.autoAi, loading]);

    const save = async () => {
        if (!issue) return;
        setSaving(true);
        setError(null);
        const patch: Record<string, unknown> = {};
        if (mode === "meta") { patch.metaTitle = metaTitle; patch.metaDescription = metaDesc; }
        else if (mode === "canonical") patch.canonical = canonical;
        else if (mode === "noindex") patch.robots = String(data.robots ?? "").replace(/noindex/gi, "").trim();
        else if (mode === "schema" || mode === "faq") { patch.jsonLdType = schemaType; if (jsonld) patch.jsonLd = jsonld; }
        else if (mode === "headings" || mode === "content") patch.body = body;
        else if (mode === "alt") {
            let b = body;
            for (const a of alts) {
                if (!a.alt.trim()) continue;
                const safe = a.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const tagRe = new RegExp(`(<img\\b[^>]*src\\s*=\\s*["']${safe}["'][^>]*>)`, "i");
                b = b.replace(tagRe, (tag) => /alt\s*=/.test(tag) ? tag.replace(/alt\s*=\s*["'][^"']*["']/i, `alt="${a.alt.replace(/"/g, "&quot;")}"`) : tag.replace(/<img\b/i, `<img alt="${a.alt.replace(/"/g, "&quot;")}"`));
            }
            patch.body = b;
        }
        try {
            await api(`/entries/${issue.id}`, { method: "PATCH", body: JSON.stringify({ data: patch }) });
            // Learn from the fix: record it into the SEO memory (The Brain) so future
            // suggestions + the auto-apply pass follow what the user actually accepts.
            setLearned(await learnFromFix(mode, issue.path || canonical, { metaTitle, metaDesc, schemaType }));
            setSaved(true);
            onSaved?.();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    // Permanently dismiss this finding so the audit stops re-surfacing it.
    const [ignoring, setIgnoring] = useState(false);
    const ignoreIssue = async () => {
        if (!active) return;
        setIgnoring(true);
        setError(null);
        try {
            await api("/seo/scan/ignore", { method: "POST", body: JSON.stringify({ code: active.key, entryId: active.id }) });
            onSaved?.();
            onClose();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't ignore this issue.");
        } finally {
            setIgnoring(false);
        }
    };

    const aiLabel = mode === "content" || mode === "alt" ? "Suggest with AI" : "Fix with AI";
    const showAi = mode === "meta" || mode === "schema" || mode === "faq" || mode === "alt" || mode === "content";

    return (
        <Transition appear show={!!issue} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <Dialog.Title className="mb-1 text-h5 text-black dark:text-white">{TITLES[mode]}</Dialog.Title>
                                <p className="mb-4 text-caption-2 text-grey">
                                    For <span className="font-semibold text-black dark:text-white">{active?.title}</span> · fix it here and save, without leaving this page.
                                </p>

                                {loading ? (
                                    <div className="flex items-center gap-3 rounded-2xl bg-lavender-mist/60 px-4 py-6 text-body-sm text-grey dark:bg-dark-3/50">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Loading…
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-4">
                                        {mode === "meta" && (
                                            <>
                                                <Field label="Title" counter={`${metaTitle.length} / 60`} ok={titleOk(metaTitle.length)}>
                                                    <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} className="flow-input h-11 px-3 text-body-sm" />
                                                </Field>
                                                <Field label="Meta description" counter={`${metaDesc.length} / 160`} ok={descOk(metaDesc.length)}>
                                                    <textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} rows={3} className="flow-input px-3 py-2.5 text-body-sm" />
                                                </Field>
                                            </>
                                        )}
                                        {mode === "canonical" && (
                                            <>
                                                <Field label="Canonical URL">
                                                    <input value={canonical} onChange={(e) => setCanonical(e.target.value)} placeholder="/your-page" className="flow-input h-11 px-3 text-body-sm" />
                                                </Field>
                                                <p className="text-caption-2 text-grey">Pre-filled with this page&rsquo;s own URL (a self-canonical), which is the right default. Change it only if this page is a duplicate that should point at another URL.</p>
                                            </>
                                        )}
                                        {mode === "noindex" && (
                                            <p className="rounded-2xl bg-lavender-mist/60 p-4 text-body-sm text-grey dark:bg-dark-3/50">This page is set to <code>noindex</code>, so it won&rsquo;t appear in search. Saving removes the noindex directive so it can be indexed.</p>
                                        )}
                                        {(mode === "schema" || mode === "faq") && (
                                            <>
                                                {mode === "schema" && (
                                                    <Field label="Schema type">
                                                        <Select variant="field" ariaLabel="Schema type" value={schemaType} onChange={setSchemaType} options={SCHEMA_TYPES.map((t) => ({ value: t, label: t }))} />
                                                    </Field>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-caption-1 text-black dark:text-white">JSON-LD</span>
                                                    <button type="button" onClick={() => setJsonld(schemaTemplate(schemaType, { title: entryTitle, url: active?.path ?? "", description: String(data.metaDescription ?? data.summary ?? "") }))} className="btn-ghost btn-sm text-primary">Insert template</button>
                                                </div>
                                                <textarea value={jsonld} onChange={(e) => setJsonld(e.target.value)} rows={9} placeholder="Paste or generate JSON-LD here." className="flow-input px-3 py-2.5 font-mono text-caption-2" />
                                                <p className="text-caption-2 text-grey">A starter {schemaType} template is filled in. Edit the values, or use Fix with AI to generate from the page content.</p>
                                            </>
                                        )}
                                        {mode === "headings" && (
                                            <>
                                                <p className="text-body-sm text-grey">{active?.key === "H1_MULTIPLE" ? "Keep a single H1 (the page title). Demote the extra heading in the content to H2." : "Use sequential heading levels (don't jump from H2 to H4). Edit the structure below."}</p>
                                                <RichTextField value={body} onChange={setBody} placeholder="Page content…" />
                                            </>
                                        )}
                                        {mode === "content" && (
                                            <>
                                                <p className="text-caption-2 text-grey">Edit the content below, or use AI to rewrite it, then save.</p>
                                                <RichTextField value={body} onChange={setBody} minH="16rem" placeholder="Page content…" />
                                            </>
                                        )}
                                        {mode === "alt" && (
                                            <div className="flex flex-col gap-3">
                                                {alts.length === 0 && <p className="text-body-sm text-grey">No images missing alt text on this page.</p>}
                                                {alts.map((a, i) => (
                                                    <div key={i} className="flex items-center gap-3">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={a.src} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                                        <input value={a.alt} onChange={(e) => setAlts((p) => p.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} placeholder="Describe this image…" className="flow-input h-10 grow px-3 text-body-sm" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {error && <div className="mt-3 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
                                {saved && (
                                    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5 text-caption-1 text-success">
                                        <Icon className="h-4 w-4 fill-success" name="check" /> Saved to the page{learned ? " · learned into The Brain so future fixes match" : ""}.
                                    </div>
                                )}

                                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-1">
                                        {showAi && (
                                            <button type="button" onClick={runAi} disabled={aiBusy || loading} className="btn-ghost btn-sm gap-1.5 text-primary disabled:opacity-60">
                                                <Icon className="h-4 w-4 fill-primary" name="sparkles" />
                                                {aiBusy ? "Thinking…" : aiLabel}
                                            </button>
                                        )}
                                        <button type="button" onClick={ignoreIssue} disabled={ignoring || loading} title="Permanently dismiss this issue and stop reminding me" className="btn-ghost btn-sm gap-1.5 text-grey disabled:opacity-60">
                                            <Icon className="h-4 w-4 fill-grey" name="close" /> {ignoring ? "Ignoring…" : "Ignore"}
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={onClose} className="btn-ghost h-9 px-4 text-caption-1">Close</button>
                                        <button type="button" onClick={save} disabled={saving || loading} className="btn-primary h-9 px-4 text-caption-1 disabled:opacity-60">
                                            {saving ? "Saving…" : saved ? "Saved" : "Save fix"}
                                        </button>
                                    </div>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

const Field = ({ label, counter, ok, children }: { label: string; counter?: string; ok?: boolean; children: ReactNode }) => (
    <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between">
            <span className="text-caption-1 text-black dark:text-white">{label}</span>
            {counter && <span className={ok ? "text-caption-2 font-semibold text-success" : "text-caption-2 font-semibold text-warning"}>{counter}</span>}
        </span>
        {children}
    </label>
);

export default IssueFixModal;
