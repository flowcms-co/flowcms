"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { useSeoFixMode } from "@/lib/seoPrefs";

type Page = { path: string; title: string; description?: string; body?: string };
type MetaResult = { title: string; description: string; provider: string; model: string };
type SchemaResult = { jsonld: string; type: string | null; provider: string; model: string };

const titleOk = (n: number) => n >= 30 && n <= 60;
const descOk = (n: number) => n >= 70 && n <= 160;

/**
 * AI auto-fix modal. Generates a corrected title+meta-description (meta mode) or
 * a JSON-LD block (schema mode) for a crawled page, shown for review before the
 * user copies it into their site. Flow CMS audits the live site, so the fix is
 * generate→review→copy (it does not silently push changes to an external site).
 */
const AutoFixModal = ({
    open,
    onClose,
    mode,
    page,
    schemaKind = "auto",
}: {
    open: boolean;
    onClose: () => void;
    mode: "meta" | "schema";
    page: Page | null;
    /** For schema mode: "faq" forces an FAQPage block. */
    schemaKind?: "auto" | "faq";
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [meta, setMeta] = useState<MetaResult | null>(null);
    const [schema, setSchema] = useState<SchemaResult | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [autoCopied, setAutoCopied] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [fixMode] = useSeoFixMode();

    const run = useCallback(async () => {
        if (!page) return;
        setLoading(true);
        setError(null);
        setMeta(null);
        setSchema(null);
        setAutoCopied(false);
        setAccepted(false);
        try {
            if (mode === "meta") {
                const r = await api<MetaResult>("/seo/suggest-meta", { method: "POST", body: JSON.stringify(page) });
                setMeta(r);
                // "auto" mode: external pages can't be pushed to, so we auto-copy the title.
                if (fixMode === "auto" && r.title) {
                    await navigator.clipboard.writeText(r.title).catch(() => {});
                    setAutoCopied(true);
                }
            } else {
                const r = await api<SchemaResult>("/seo/suggest-schema", { method: "POST", body: JSON.stringify({ ...page, kind: schemaKind }) });
                setSchema(r);
                if (fixMode === "auto" && r.jsonld) {
                    await navigator.clipboard.writeText(r.jsonld).catch(() => {});
                    setAutoCopied(true);
                }
            }
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not generate a fix. Make sure an AI provider is connected in Settings → Integrations.");
        } finally {
            setLoading(false);
        }
    }, [mode, page, fixMode, schemaKind]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the modal kicks off the fetch
        if (open && page) void run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, page?.path, mode, schemaKind]);

    const copy = async (value: string, key: string) => {
        await navigator.clipboard.writeText(value);
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    };

    /** Record the accepted fix into the SEO learning memory + copy the snippet. */
    const accept = async () => {
        if (!page) return;
        try {
            if (mode === "meta" && meta) {
                await api("/seo/learning", {
                    method: "POST",
                    body: JSON.stringify({ kind: "meta", path: page.path, after: { title: meta.title, description: meta.description } }),
                });
                await navigator.clipboard
                    .writeText(`<title>${meta.title}</title>\n<meta name="description" content="${meta.description}">`)
                    .catch(() => {});
            } else if (mode === "schema" && schema) {
                await api("/seo/learning", {
                    method: "POST",
                    body: JSON.stringify({ kind: "schema", path: page.path, after: { type: schema.type ?? undefined } }),
                });
                await navigator.clipboard.writeText(`<script type="application/ld+json">\n${schema.jsonld}\n</script>`).catch(() => {});
            }
            setAccepted(true);
        } catch {
            /* learning is best-effort */
        }
    };

    const providerLine = meta ? `${meta.provider} · ${meta.model}` : schema ? `${schema.provider} · ${schema.model}` : "";

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <Icon className="h-5 w-5 fill-primary" name="sparkles" />
                                    <Dialog.Title className="text-h5 text-black dark:text-white">
                                        {mode === "meta" ? "Fix with AI · title & description" : schemaKind === "faq" ? "Generate FAQ schema with AI" : "Generate structured data with AI"}
                                    </Dialog.Title>
                                </div>
                                <p className="mb-4 text-caption-2 text-grey">
                                    For <span className="font-semibold text-black dark:text-white">{page?.path}</span> · review, then copy into your page&rsquo;s
                                    {mode === "meta" ? " <head>" : " <head> as a <script type=\"application/ld+json\">"}.
                                </p>
                                {autoCopied && (
                                    <div className="mb-4 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5 text-caption-1 text-success">
                                        <Icon className="h-4 w-4 fill-success" name="check" />
                                        Auto-apply is on: the fix is already copied to your clipboard. Paste it into your page&rsquo;s &lt;head&gt;.
                                    </div>
                                )}

                                {loading && (
                                    <div className="flex items-center gap-3 rounded-2xl bg-lavender-mist/60 px-4 py-6 text-body-sm text-grey dark:bg-dark-3/50">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        Generating with AI…
                                    </div>
                                )}

                                {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

                                {/* META result */}
                                {meta && !loading && (
                                    <div className="flex flex-col gap-4">
                                        <Field
                                            label="Title"
                                            value={meta.title}
                                            len={meta.title.length}
                                            ok={titleOk(meta.title.length)}
                                            onCopy={() => copy(meta.title, "title")}
                                            copied={copied === "title"}
                                        />
                                        <Field
                                            label="Meta description"
                                            value={meta.description}
                                            len={meta.description.length}
                                            ok={descOk(meta.description.length)}
                                            onCopy={() => copy(meta.description, "desc")}
                                            copied={copied === "desc"}
                                            multiline
                                        />
                                    </div>
                                )}

                                {/* SCHEMA result */}
                                {schema && !loading && (
                                    <div className="flex flex-col gap-3">
                                        {schema.type && (
                                            <span className="inline-flex w-fit items-center rounded-md bg-lavender-mist px-2 py-0.5 text-[0.6875rem] font-semibold text-primary dark:bg-dark-3 dark:text-lilac">
                                                {schema.type}
                                            </span>
                                        )}
                                        <pre className="max-h-80 overflow-auto rounded-2xl bg-ink p-4 text-caption-2 leading-relaxed text-lilac scrollbar-thin">
                                            {schema.jsonld}
                                        </pre>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => copy(schema.jsonld, "schema")} className="btn-primary h-9 px-4 text-caption-1">
                                                <Icon className="h-4 w-4 fill-white" name="check" />
                                                {copied === "schema" ? "Copied!" : "Copy JSON-LD"}
                                            </button>
                                            <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer" className="btn-secondary h-9 px-4 text-caption-1">
                                                <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="external" />
                                                Test in Rich Results
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {accepted && (
                                    <div className="mt-4 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5 text-caption-1 text-success">
                                        <Icon className="h-4 w-4 fill-success" name="check" />
                                        Applied &amp; learned: copied to your clipboard, and saved to the SEO memory to guide future fixes.
                                    </div>
                                )}

                                <div className="mt-6 flex items-center justify-between gap-3">
                                    <span className="text-caption-2 text-grey">{providerLine && `Generated by ${providerLine}`}</span>
                                    <div className="flex gap-2">
                                        {!loading && (meta || schema || error) && (
                                            <button type="button" onClick={run} className="btn-secondary h-9 px-3 text-caption-1">
                                                <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="overview" />
                                                Regenerate
                                            </button>
                                        )}
                                        {!loading && (meta || schema) && (
                                            <button type="button" onClick={accept} disabled={accepted} className="btn-primary h-9 px-4 text-caption-1 disabled:opacity-60">
                                                <Icon className="h-4 w-4 fill-white" name="check" />
                                                {accepted ? "Applied" : "Apply & learn"}
                                            </button>
                                        )}
                                        <button type="button" onClick={onClose} className="btn-secondary h-9 px-4 text-caption-1">
                                            Done
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

const Field = ({
    label,
    value,
    len,
    ok,
    onCopy,
    copied,
    multiline,
}: {
    label: string;
    value: string;
    len: number;
    ok: boolean;
    onCopy: () => void;
    copied: boolean;
    multiline?: boolean;
}) => (
    <div>
        <div className="mb-1.5 flex items-center justify-between">
            <span className="text-caption-1 text-black dark:text-white">{label}</span>
            <span className={ok ? "text-caption-2 font-semibold text-success" : "text-caption-2 font-semibold text-warning"}>{len} chars</span>
        </div>
        <div className="flex items-start gap-2">
            <p className={`grow rounded-2xl bg-lavender-mist/60 px-3 py-2.5 text-body-sm text-black dark:bg-dark-3/50 dark:text-white ${multiline ? "" : "truncate"}`}>
                {value}
            </p>
            <button type="button" onClick={onCopy} className="btn-secondary h-9 shrink-0 px-3 text-caption-1">
                {copied ? "Copied!" : "Copy"}
            </button>
        </div>
    </div>
);

export default AutoFixModal;
