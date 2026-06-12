"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";

type Result = { ok: boolean; kind: string; filename: string; content: string; reason?: string };

const META: Record<string, { title: string; blurb: string }> = {
    llms: { title: "Generate llms.txt", blurb: "Tells AI assistants what your site is about and which pages matter: improves how LLMs cite you." },
    robots: { title: "Generate robots.txt", blurb: "Controls crawlers (incl. AI bots like GPTBot) and points them to your sitemap." },
    sitemap: { title: "Generate sitemap.xml", blurb: "Lists your URLs so search engines discover and index every page." },
};

/** Generate a site-root file, review it, copy/download, and follow upload steps. */
const FileGenModal = ({ open, onClose, kind }: { open: boolean; onClose: () => void; kind: "llms" | "robots" | "sitemap" | null }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const run = useCallback(async () => {
        if (!kind) return;
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const r = await api<Result>("/seo/generate-file", { method: "POST", body: JSON.stringify({ kind }) });
            if (r.ok) setResult(r);
            else setError("Connect Search Console first so we know your site URL.");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not generate.");
        } finally {
            setLoading(false);
        }
    }, [kind]);

    useEffect(() => {
        if (open && kind) void run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, kind]);

    const download = () => {
        if (!result) return;
        const blob = new Blob([result.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
    };
    const copy = async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const meta = kind ? META[kind] : null;

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
                                    <Dialog.Title className="text-h5 text-black dark:text-white">{meta?.title}</Dialog.Title>
                                </div>
                                <p className="mb-4 text-caption-2 text-grey">{meta?.blurb}</p>

                                {loading && (
                                    <div className="flex items-center gap-3 rounded-2xl bg-lavender-mist/60 px-4 py-6 text-body-sm text-grey dark:bg-dark-3/50">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        Generating from your crawled pages…
                                    </div>
                                )}
                                {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

                                {result && !loading && (
                                    <>
                                        <pre className="max-h-72 overflow-auto rounded-2xl bg-ink p-4 text-caption-2 leading-relaxed text-lilac scrollbar-thin">{result.content}</pre>
                                        <div className="mt-3 flex gap-2">
                                            <button type="button" onClick={download} className="btn-primary h-9 px-4 text-caption-1">
                                                <Icon className="h-4 w-4 fill-white" name="external" />
                                                Download {result.filename}
                                            </button>
                                            <button type="button" onClick={copy} className="btn-secondary h-9 px-4 text-caption-1">
                                                {copied ? "Copied!" : "Copy"}
                                            </button>
                                            <button type="button" onClick={run} className="btn-secondary h-9 px-3 text-caption-1">Regenerate</button>
                                        </div>
                                        <div className="mt-4 rounded-2xl bg-lavender-mist/60 p-4 text-caption-2 text-grey dark:bg-dark-3/50">
                                            <div className="mb-1 font-semibold text-black dark:text-white">How to publish</div>
                                            <ol className="list-decimal space-y-1 pl-4">
                                                <li>Download <code>{result.filename}</code> above.</li>
                                                <li>Upload it to your website&rsquo;s <strong>root</strong> so it&rsquo;s reachable at <code>/{result.filename}</code>.</li>
                                                <li>Re-run the audit to confirm it&rsquo;s detected.</li>
                                            </ol>
                                        </div>
                                    </>
                                )}

                                <div className="mt-6 flex justify-end">
                                    <button type="button" onClick={onClose} className="btn-secondary h-9 px-4 text-caption-1">Done</button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default FileGenModal;
