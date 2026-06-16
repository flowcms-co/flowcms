"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import Sections, { findSections } from "../Sections";

/**
 * Bundled EXAMPLE FRONTEND — a stand-in for a customer's real site, used to
 * demonstrate the live preview's "Site" mode end to end (and as a clean surface
 * for docs / marketing screenshots). It reads ?id (or ?slug), fetches the (draft)
 * entry from FlowCMS's API, and renders it inside a realistic agency-site shell:
 * header, image hero, article, "more stories", CTA, footer. A real frontend does
 * the same but fetches via the public API with a Preview token; here we read it
 * same-origin for the demo. The accent is deliberately NOT the studio purple so it
 * reads as a separate brand.
 */
type Entry = {
    id: string;
    title: string;
    slug?: string | null;
    status: string;
    contentType: { name: string } | null;
    author?: { name?: string | null } | null;
    publishedAt?: string | null;
    updatedAt?: string | null;
    data: Record<string, unknown> | null;
};

const ACCENT = "#F0552D"; // coral — distinct from the studio's purple
const str = (v: unknown) => (typeof v === "string" ? v : "");
const NAV = ["Work", "Services", "Journal", "About", "Contact"];
const img = (seed: string, w: number, h: number) => `https://picsum.photos/seed/nb-${seed}/${w}/${h}`;

const MORE = [
    { seed: "grid", cat: "Design", title: "The quiet power of a good grid" },
    { seed: "fintech", cat: "Branding", title: "Designing for trust in fintech" },
    { seed: "proto", cat: "Process", title: "Why we prototype in the browser" },
];

const SiteDemoClient = () => {
    const id = useSearchParams().get("id");
    const [entry, setEntry] = useState<Entry | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        let off = false;
        api<Entry>(`/entries/${id}`)
            .then((e) => !off && setEntry(e))
            .catch(() => !off && setError("Could not load this entry."));
        return () => {
            off = true;
        };
    }, [id]);

    const body = str(entry?.data?.body);
    const summary = str(entry?.data?.summary);
    const client = str(entry?.data?.client);
    const dateStr = entry?.publishedAt || entry?.updatedAt;
    const date = dateStr ? new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
    const minutes = Math.max(1, Math.round((body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length || 0) / 200));
    const coverSeed = entry?.slug || entry?.id || "cover";
    // Prefer the entry's own Headline / Hero-image fields (a Landing Page maps its
    // hero heading + image to these); fall back to the title and a seeded
    // placeholder so article-style entries still render.
    const data = entry?.data ?? {};
    const sections = findSections(data);
    const heading =
        ["Headline", "headline", "heading", "Heading"].map((k) => str(data[k])).find(Boolean) || (entry?.title ?? "");
    const heroImage =
        ["Hero image", "Hero Image", "hero", "heroImage", "Hero", "cover", "coverImage", "image", "featuredImage"]
            .map((k) => str(data[k]))
            .find(Boolean) ||
        Object.values(data).find(
            (v): v is string => typeof v === "string" && /^(https?:\/\/|\/)/.test(v) && /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)|picsum|\/image/i.test(v),
        ) ||
        "";

    // Visual-editing bridge (Storyblok-style): when this site is embedded in FlowCMS's
    // preview, the studio can toggle in-place editing of the article and we stream
    // the changes back over postMessage. A real customer frontend opts in the same
    // way. Only acts on messages from the embedding parent's origin.
    const articleRef = useRef<HTMLElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const summaryRef = useRef<HTMLParagraphElement>(null);
    const baselineRef = useRef<{ title: string; summary: string; body: string }>({ title: "", summary: "", body: "" });
    useEffect(() => {
        if (!entry) return;
        const titleEl = titleRef.current;
        const bodyEl = articleRef.current;
        if (!titleEl || !bodyEl) return;
        const sumEl = summaryRef.current; // null when the entry has no summary
        baselineRef.current = { title: titleEl.textContent ?? "", summary: sumEl?.textContent ?? "", body: body || "<p>Start writing in the editor…</p>" };
        let parentOrigin = "*";
        try {
            if (document.referrer) parentOrigin = new URL(document.referrer).origin;
        } catch {
            /* keep * */
        }
        const post = (msg: Record<string, unknown>) => {
            try {
                window.parent?.postMessage({ source: "flowcms-preview", ...msg }, parentOrigin);
            } catch {
                /* ignore */
            }
        };
        const fields = () => ({ title: titleEl.textContent ?? "", summary: sumEl?.textContent ?? "", body: bodyEl.innerHTML });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onInput = () => {
            post({ type: "dirty" });
            clearTimeout(timer);
            // Stream edits as a field map (generalized bridge protocol); the flat
            // keys are kept for back-compat with older studio builds.
            timer = setTimeout(() => post({ type: "fields", fields: fields(), ...fields() }), 200);
        };
        // Title + summary are single-line text (plaintext-only so no stray markup);
        // the body keeps rich formatting.
        const editables: { el: HTMLElement; mode: string }[] = [
            { el: titleEl, mode: "plaintext-only" },
            ...(sumEl ? [{ el: sumEl, mode: "plaintext-only" }] : []),
            { el: bodyEl, mode: "true" },
        ];
        const toggle = (on: boolean) => {
            for (const { el, mode } of editables) {
                if (on) {
                    el.setAttribute("contenteditable", mode);
                    el.classList.add("nb-edit-on");
                    el.addEventListener("input", onInput);
                } else {
                    el.removeAttribute("contenteditable");
                    el.classList.remove("nb-edit-on");
                    el.removeEventListener("input", onInput);
                }
            }
        };
        const onMessage = (e: MessageEvent) => {
            if (parentOrigin !== "*" && e.origin !== parentOrigin) return;
            const d = e.data as { source?: string; type?: string; editing?: boolean; title?: string; summary?: string; body?: string; fields?: Record<string, unknown> } | null;
            if (!d || d.source !== "flowcms-studio") return;
            if (d.type === "hello") return post({ type: "ready", editable: true });
            if (d.type === "baseline") {
                // New protocol carries a `fields` map; fall back to flat keys.
                const f = (d.fields && typeof d.fields === "object" ? d.fields : d) as { title?: unknown; summary?: unknown; body?: unknown };
                baselineRef.current = {
                    title: typeof f.title === "string" ? f.title : baselineRef.current.title,
                    summary: typeof f.summary === "string" ? f.summary : baselineRef.current.summary,
                    body: typeof f.body === "string" ? f.body : baselineRef.current.body,
                };
                return;
            }
            if (d.type === "revert") {
                titleEl.textContent = baselineRef.current.title;
                if (sumEl) sumEl.textContent = baselineRef.current.summary;
                bodyEl.innerHTML = baselineRef.current.body;
                return;
            }
            if (d.type === "edit") {
                toggle(!!d.editing);
                if (d.editing) bodyEl.focus();
            }
        };
        window.addEventListener("message", onMessage);
        post({ type: "ready", editable: true }); // handshake: this site supports live editing
        return () => {
            window.removeEventListener("message", onMessage);
            toggle(false);
            clearTimeout(timer);
        };
    }, [entry, body]);

    return (
        <div className="min-h-screen bg-white font-sans text-[#171717] dark:bg-[#14130f] dark:text-[#f5f3ef]">
            {/* Recolor the article's prose links/blockquote to the site accent. */}
            <style>{`.nb-article a{color:${ACCENT};text-decoration-color:${ACCENT}55}.nb-article blockquote{border-color:${ACCENT}}.nb-edit-on{outline:2px dashed ${ACCENT}66;outline-offset:6px;border-radius:6px;cursor:text}.nb-edit-on:focus{outline-color:${ACCENT}}`}</style>

            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#14130f]/85">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
                    <span className="font-poppins text-[1.3rem] font-extrabold tracking-tight">
                        Northbound<span style={{ color: ACCENT }}>.</span>
                    </span>
                    <nav className="hidden items-center gap-8 md:flex">
                        {NAV.map((n) => (
                            <span key={n} className="text-[0.9rem] font-medium text-[#525252] transition-colors hover:text-[#171717] dark:text-[#a3a3a3] dark:hover:text-white">{n}</span>
                        ))}
                    </nav>
                    <span className="inline-flex h-9 items-center rounded-full px-4 text-[0.8125rem] font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                        Start a project
                    </span>
                </div>
            </header>

            {error ? (
                <div className="mx-auto max-w-2xl px-6 py-28 text-center text-[#737373]">{error}</div>
            ) : !entry ? (
                <div className="grid place-items-center py-32">
                    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-black/10" style={{ borderTopColor: ACCENT }} />
                </div>
            ) : (
                <>
                    {sections ? (
                    <div className="py-6">
                        <Sections sections={sections} />
                    </div>
                    ) : (
                    <>
                    {/* Hero */}
                    <section className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center">
                        <div className="mb-4 text-[0.78rem] font-bold uppercase tracking-[0.14em]" style={{ color: ACCENT }}>
                            {client || entry.contentType?.name || "Journal"}
                        </div>
                        <h1 ref={titleRef} className="font-poppins text-[2.6rem] leading-[1.06] font-extrabold tracking-[-0.025em] text-balance focus:outline-none sm:text-[3.5rem]">
                            {heading}
                        </h1>
                        {summary && <p ref={summaryRef} className="mx-auto mt-6 max-w-2xl text-[1.2rem] leading-8 text-[#525252] focus:outline-none dark:text-[#b3b0a8]">{summary}</p>}
                        <div className="mt-7 flex items-center justify-center gap-3 text-[0.85rem] text-[#737373]">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[0.75rem] font-bold text-white" style={{ backgroundColor: ACCENT }}>
                                {(entry.author?.name || "Northbound").charAt(0)}
                            </span>
                            <span className="font-medium text-[#171717] dark:text-white">{entry.author?.name || "Northbound"}</span>
                            {date && <span>· {date}</span>}
                            <span>· {minutes} min read</span>
                        </div>
                    </section>

                    {/* Cover image */}
                    <div className="mx-auto max-w-5xl px-6">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={heroImage || img(String(coverSeed), 1600, 760)}
                            alt={heading || entry.title}
                            className="aspect-[16/8] w-full rounded-2xl object-cover shadow-[0_1.5rem_3rem_rgba(0,0,0,0.14)]"
                        />
                    </div>

                    {/* Article body — the injected content */}
                    <article
                        ref={articleRef}
                        className="nb-article flow-prose mx-auto max-w-[44rem] px-6 py-16 focus:outline-none"
                        dangerouslySetInnerHTML={{ __html: body || "<p>Start writing in the editor…</p>" }}
                    />
                    </>
                    )}

                    {/* More stories */}
                    <section className="border-t border-black/[0.06] dark:border-white/10">
                        <div className="mx-auto max-w-6xl px-6 py-16">
                            <h2 className="mb-8 font-poppins text-[1.6rem] font-bold tracking-tight">More from the journal</h2>
                            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                                {MORE.map((m) => (
                                    <article key={m.seed} className="group">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img(m.seed, 800, 600)} alt="" className="mb-4 aspect-[4/3] w-full rounded-xl object-cover" />
                                        <div className="mb-1.5 text-[0.72rem] font-bold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>{m.cat}</div>
                                        <h3 className="font-poppins text-[1.15rem] font-semibold leading-snug">{m.title}</h3>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* CTA */}
                    <section style={{ backgroundColor: `${ACCENT}12` }}>
                        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-6 py-20 text-center">
                            <h2 className="font-poppins text-[2rem] font-bold tracking-[-0.01em]">Have a project in mind?</h2>
                            <p className="max-w-xl text-[#525252] dark:text-[#b3b0a8]">We partner with ambitious teams on brand, web and growth. Tell us what you&apos;re building.</p>
                            <span className="inline-flex h-12 items-center rounded-full px-7 font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                                Tell us about your project
                            </span>
                        </div>
                    </section>
                </>
            )}

            {/* Footer */}
            <footer className="border-t border-black/[0.06] dark:border-white/10">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-[0.85rem] text-[#737373] sm:flex-row">
                    <span className="font-poppins font-bold text-[#171717] dark:text-white">Northbound<span style={{ color: ACCENT }}>.</span></span>
                    <span>Brand · Web · Growth — wearenorthbound.com</span>
                    <span>© 2026 Northbound Studio</span>
                </div>
            </footer>
        </div>
    );
};

export default SiteDemoClient;
