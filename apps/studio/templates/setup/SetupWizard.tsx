"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import { resolveBrand } from "@/lib/brands";
import { WindowScene, RocketScene, BoxesScene, PlugScene } from "@/templates/setup/illustrations";
import PowerUp from "@/templates/setup/PowerUp";
import { api, ApiError } from "@/lib/api";
import { clearWorkspaceCache } from "@/lib/useWorkspace";
import { useDisplayBase } from "@/lib/useDisplayBase";
import { STARTER_TASKS, FINISH_TASKS } from "@/lib/bootMessages";
import { cn } from "@/lib/cn";
import type { BootTask } from "@/lib/bootMessages";

gsap.registerPlugin(useGSAP, SplitText);

type Stage = "choose" | "fresh" | "migrate" | "connect";
type Booting = { title: string; subtitle?: string; tasks: BootTask[]; scene?: "content" | "launch" } | null;
type ConnectFw = "sdk" | "next" | "curl" | "other";
type ImportKind = "wordpress" | "strapi" | "markdown" | "csv" | "json" | "contentful" | "sanity";
type ConnectTab = { id: ConnectFw; label: string; badge: React.ReactNode };

const STARTERS = [
    { id: "blog", label: "Blog", icon: "document", subtitle: "Blog Post + Page", desc: "Ideal for articles, guides, news, and content marketing.", recommended: true },
    { id: "docs", label: "Documentation", icon: "grid", subtitle: "A Doc type with categories", desc: "Perfect for knowledge bases, help centers, and product docs.", recommended: false },
    { id: "marketing", label: "Marketing site", icon: "overview", subtitle: "Landing Page + Page", desc: "Best for marketing websites, product pages, and landing pages.", recommended: false },
    { id: "blank", label: "Blank", icon: "plus", subtitle: "Empty content model", desc: "Start from scratch with a clean slate and build your own structure.", recommended: false },
];

const STEPS = ["Choose", "Content", "Connect"];

const CONNECT_TABS: ConnectTab[] = [
    {
        id: "sdk", label: "JavaScript SDK",
        badge: <span className="flex h-[18px] w-6 items-center justify-center rounded bg-[#F7DF1E] text-[8px] font-extrabold leading-none text-[#1a1a2e]">JS</span>,
    },
    {
        id: "next", label: "Next.js",
        badge: <span className="flex h-[18px] w-[18px] items-center justify-center rounded bg-black text-[9px] font-extrabold leading-none text-white dark:bg-white dark:text-black">N</span>,
    },
    {
        id: "curl", label: "cURL",
        badge: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M2 4.5l2.5 2.5-2.5 2.5M7 9.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    {
        id: "other", label: "Other",
        badge: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M5 3L2 7l3 4M9 3l3 4-3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
];

const CONNECT_HINTS: Record<ConnectFw, string> = {
    sdk: "Install the SDK and add the client to a server-side file.",
    next: "Create the client in a lib file, then call it from any Server Component or Route Handler.",
    curl: "A quick terminal test: confirms your token and URL work before you wire up any code.",
    other: "Use the REST API directly from any language or environment.",
};

const CONNECT_HELP: { icon: React.ReactNode; title: string; desc: string }[] = [
    {
        icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 6.6C10.4 5.4 8.2 4.9 6 5.1c-.7.1-1.4.2-2 .4v12c.6-.2 1.3-.3 2-.4 2.2-.2 4.4.3 6 1.5 1.6-1.2 3.8-1.7 6-1.5.7.1 1.4.2 2 .4v-12c-.6-.2-1.3-.3-2-.4-2.2-.2-4.4.3-6 1.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 6.6v12" stroke="currentColor" strokeWidth="1.6"/></svg>,
        title: "View documentation", desc: "Detailed guides and API reference.",
    },
    {
        icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><path d="M10 8.5l5 3.5-5 3.5V8.5z" fill="currentColor"/></svg>,
        title: "Watch tutorial", desc: "Step-by-step video walkthrough.",
    },
    {
        icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><path d="M9.6 9.4c0-1.3 1.1-2.3 2.4-2.3s2.4 1 2.4 2.3c0 1.5-1.5 1.9-1.5 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="12" cy="16.2" r="1" fill="currentColor"/></svg>,
        title: "Still stuck?", desc: "Get help from our support team.",
    },
];

const IMPORT_SOURCES: { kind: ImportKind; label: string }[] = [
    { kind: "wordpress", label: "WordPress" },
    { kind: "strapi", label: "Strapi" },
    { kind: "markdown", label: "Markdown" },
    { kind: "csv", label: "CSV" },
    { kind: "json", label: "JSON" },
    { kind: "contentful", label: "Contentful" },
    { kind: "sanity", label: "Sanity" },
];

const PLATFORM_BADGE: Record<ImportKind, { bg: string; label: string }> = {
    wordpress:  { bg: "#21759B", label: "W" },
    strapi:     { bg: "#4945FF", label: "S" },
    markdown:   { bg: "#1a1a2e", label: "M↓" },
    csv:        { bg: "#0F9D58", label: "CSV" },
    json:       { bg: "#F5A623", label: "{}" },
    contentful: { bg: "#00C0FF", label: "C" },
    sanity:     { bg: "#F03E2F", label: "S" },
};

const buildSnippet = (fw: ConnectFw, token: string, base: string): string => {
    const t = token || "YOUR_TOKEN";
    if (fw === "curl") {
        return `# Test your connection in the terminal\ncurl "${base}/public/articles?limit=10" \\\n  -H "Authorization: Bearer ${t}"`;
    }
    if (fw === "next") {
        return `// lib/flow.ts\nimport { createClient } from "@flowcms/client";\nexport const flow = createClient({\n  url: "${base}",\n  token: process.env.FLOWCMS_TOKEN!,\n});\n\n// app/blog/page.tsx\nimport { flow } from "@/lib/flow";\nexport default async function Blog() {\n  const { data } = await flow.list("articles", { limit: 10 });\n  return <ul>{data.map((p) => <li key={p.id}>{String(p.title)}</li>)}</ul>;\n}`;
    }
    if (fw === "other") {
        return `# REST API — works from any language\nGET ${base}/public/articles?limit=10\nAuthorization: Bearer ${t}\n\n# Response shape\n{ "data": [...], "total": N }`;
    }
    return `# 1. Install the client in your website project\nnpm install @flowcms/client\n\n# 2. Create a client in any server-side file\nimport { createClient } from "@flowcms/client";\nconst flow = createClient({\n  url: "${base}",\n  token: "${t}",\n});\n\n# 3. Fetch your content anywhere\nconst { data } = await flow.list("articles", { limit: 10 });`;
};

// ─────────────────────────────────────────────────────────────────────────────

const SetupWizard = () => {
    const router = useRouter();
    const scope = useRef<HTMLDivElement>(null);
    const displayBase = useDisplayBase();

    const [stage, setStage] = useState<Stage>("choose");
    const [path, setPath] = useState<"fresh" | "migrate" | null>(null);
    const [applying, setApplying] = useState<string | null>(null);
    const [booting, setBooting] = useState<Booting>(null);
    const [launching, setLaunching] = useState(false);
    const [selectedStarter, setSelectedStarter] = useState("blog");

    const [connectFw, setConnectFw] = useState<ConnectFw>("sdk");
    const [connectToken, setConnectToken] = useState("");
    const [connectCreating, setConnectCreating] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);
    const [connectCopied, setConnectCopied] = useState(false);

    const bootDone = useRef<(() => void) | null>(null);
    const launchDone = useRef<(() => void) | null>(null);

    const stepIndex = stage === "choose" ? 0 : stage === "connect" ? 2 : 1;

    const playBoot = (cfg: Booting & object) =>
        new Promise<void>((resolve) => {
            bootDone.current = resolve;
            setBooting(cfg);
        });

    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduce || document.hidden) return;

            const q = gsap.utils.selector(scope);
            const tl = gsap.timeline();

            const heading = scope.current?.querySelector(".step-heading") as HTMLElement | null;
            if (heading) {
                const split = SplitText.create(heading, { type: "lines, words", mask: "lines" });
                tl.from(split.words, { yPercent: 100, duration: 0.9, stagger: 0.1, ease: "expo.out" }, 0);
            }

            const pop = q(".step-pop");
            if (pop.length) tl.from(pop, { scale: 0.75, autoAlpha: 0, rotation: -6, transformOrigin: "50% 60%", duration: 0.65, ease: "back.out(1.6)" }, 0);

            const sub = q(".step-sub");
            if (sub.length) tl.from(sub, { autoAlpha: 0, y: 8, duration: 0.5, ease: "power2.out", clearProps: "transform,opacity" }, 0.3);

            const stag = q(".step-stagger");
            if (stag.length) tl.from(stag, { autoAlpha: 0, scale: 0.97, duration: 0.4, stagger: 0.06, ease: "power2.out", clearProps: "transform,opacity,visibility" }, 0.35);

            const fade = q(".step-fade");
            if (fade.length) tl.from(fade, { autoAlpha: 0, y: 8, duration: 0.5, ease: "power2.out", clearProps: "transform,opacity" }, 0.35);
        },
        { scope, dependencies: [stage] },
    );

    const applyStarter = async (id: string) => {
        setApplying(id);
        const played = playBoot({ title: "Setting up your content", tasks: STARTER_TASKS, scene: "content" });
        try {
            const work = id !== "blank" ? api(`/workspace/starter/${id}`, { method: "POST" }) : Promise.resolve();
            await Promise.all([played, work]);
            setBooting(null);
            setStage("connect");
        } finally {
            setApplying(null);
        }
    };

    const finish = async () => {
        const launchFinished = new Promise<void>((resolve) => { launchDone.current = resolve; });
        setLaunching(true);
        await Promise.all([launchFinished, api("/workspace/onboard", { method: "POST" }).catch(() => {})]);
        clearWorkspaceCache();
        router.push("/");
    };

    const skip = async () => {
        await api("/workspace/onboard", { method: "POST" }).catch(() => {});
        clearWorkspaceCache();
        router.push("/");
    };

    const createConnectToken = async () => {
        setConnectCreating(true);
        setConnectError(null);
        try {
            const res = await api<{ token: string }>("/api-tokens", { method: "POST", body: JSON.stringify({ name: "Website (read)", type: "CONTENT" }) });
            setConnectToken(res.token);
        } catch (e) {
            setConnectError(e instanceof ApiError ? e.message : "Could not create a token.");
        } finally {
            setConnectCreating(false);
        }
    };

    const copySnippet = async () => {
        await navigator.clipboard.writeText(buildSnippet(connectFw, connectToken, displayBase));
        setConnectCopied(true);
        setTimeout(() => setConnectCopied(false), 1500);
    };

    const snippetLines = buildSnippet(connectFw, connectToken, displayBase).split("\n");

    return (
        <div ref={scope} className="flex flex-1 flex-col gap-5">
            {/* ── Stepper ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-center gap-3">
                {STEPS.map((label, i) => (
                    <div key={label} className="flex items-center gap-3">
                        <span className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-caption-2 font-bold transition-colors",
                            i < stepIndex ? "bg-success text-white" :
                            i === stepIndex ? "bg-primary text-white" :
                            "bg-[#EAE6F8] text-grey dark:bg-white/10 dark:text-white/60",
                        )}>
                            {i < stepIndex ? <Icon className="h-3 w-3 fill-white" name="check" /> : i + 1}
                        </span>
                        <span className={cn(
                            "hidden text-caption-1 sm:block",
                            i === stepIndex ? "font-semibold text-black dark:text-white" : "text-grey dark:text-white/60",
                        )}>{label}</span>
                        {i < STEPS.length - 1 && <span className="h-px w-8 bg-[#E2DCF5] dark:bg-white/12" />}
                    </div>
                ))}
            </div>

            {/* ── LAUNCH SEQUENCE — inline so stepper stays visible ─────────── */}
            {launching && (
                <LaunchView
                    title="Launching Flow CMS 🎉"
                    subtitle="Hang tight! We're getting everything ready for you."
                    tasks={FINISH_TASKS}
                    onDone={() => launchDone.current?.()}
                />
            )}

            {/* ── CHOOSE ───────────────────────────────────────────────────── */}
            {!launching && stage === "choose" && (
                <div className="flex flex-col items-center gap-6">
                    <div className="relative flex items-center justify-center">
                        <WindowScene size={200} className="step-pop" />
                        <div className="pointer-events-none absolute inset-0" aria-hidden>
                            <span className="absolute right-2 top-3 flex h-9 w-14 items-center justify-center rounded-xl border border-grey-light/60 bg-white/90 text-[11px] font-bold text-grey/60 shadow-sm dark:border-white/10 dark:bg-dark-2 dark:text-white/40">Aa</span>
                            <span className="absolute -left-3 top-1/2 h-2.5 w-2.5 rounded-full bg-[#E0529C]/55" />
                            <span className="absolute left-1/4 top-1 h-2 w-2 rounded-full bg-[#FFC15E]/80" />
                            <span className="absolute -bottom-1 right-1/3 h-3 w-3 rounded-full bg-[#A29BFE]/60" />
                            <span className="absolute -bottom-2 left-1/3 h-2 w-2 rounded-full bg-[#A29BFE]/40" />
                        </div>
                    </div>

                    <div className="text-center">
                        <h1 className="step-heading font-poppins text-h1 font-extrabold tracking-[-0.025em] text-black dark:text-white">
                            Welcome to <span className="text-primary dark:text-lilac">Flow CMS</span>
                        </h1>
                        <p className="step-sub mx-auto mt-2 max-w-sm text-body text-grey dark:text-white/75">
                            Let&rsquo;s set up your workspace. Starting fresh, or bringing content from another platform?
                        </p>
                    </div>

                    <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Start fresh */}
                        <button
                            type="button"
                            onClick={() => { setPath("fresh"); setStage("fresh"); }}
                            className="step-stagger group relative flex flex-col gap-5 overflow-visible rounded-3xl border border-grey-light bg-white/80 p-6 text-left shadow-sm backdrop-blur-sm transition-all hover:border-primary hover:bg-white hover:shadow-md active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/10"
                        >
                            <div className="flex items-start justify-between gap-3">
                                {/* Circle icon */}
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/15">
                                    <Icon className="h-6 w-6 fill-primary" name="plus" />
                                </span>
                                {/* Document illustration with dog-ear and green check */}
                                <div className="relative shrink-0">
                                    <svg width="96" height="122" viewBox="0 0 96 122" fill="none" aria-hidden>
                                        <path d="M8 0H62L96 34V114Q96 122 88 122H8Q0 122 0 114V8Q0 0 8 0Z" fill="#EDE8FF"/>
                                        <path d="M62 0L96 34H70Q62 34 62 26Z" fill="#C4B5FD"/>
                                        <rect x="13" y="52" width="50" height="9" rx="4.5" fill="#A29BFE" fillOpacity="0.55"/>
                                        <rect x="13" y="69" width="40" height="7" rx="3.5" fill="#A29BFE" fillOpacity="0.40"/>
                                        <rect x="13" y="84" width="46" height="7" rx="3.5" fill="#A29BFE" fillOpacity="0.35"/>
                                    </svg>
                                    <div className="absolute -bottom-4 -right-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#00B894] shadow-md ring-2 ring-white dark:ring-[#14131f]">
                                        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
                                            <path d="M4.5 10.5L8.5 14L15.5 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-black dark:text-white">Start fresh</p>
                                <p className="mt-2 text-sm leading-relaxed text-grey dark:text-white/65">Pick a starter content model and connect your site. New project, clean slate.</p>
                            </div>
                            <div className="mt-auto w-fit rounded-2xl bg-primary/10 px-6 py-3.5 text-sm font-medium text-primary transition-colors group-hover:bg-primary/[0.15] dark:bg-primary/15 dark:text-lilac">
                                Start a new project &rarr;
                            </div>
                        </button>

                        {/* Migrate content */}
                        <button
                            type="button"
                            onClick={() => { setPath("migrate"); setStage("migrate"); }}
                            className="step-stagger group relative flex flex-col gap-5 overflow-visible rounded-3xl border border-grey-light bg-white/80 p-6 text-left shadow-sm backdrop-blur-sm transition-all hover:border-[#E0529C] hover:bg-white hover:shadow-md active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/10"
                        >
                            <div className="flex items-start justify-between gap-3">
                                {/* Circle icon */}
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#E0529C]/10">
                                    <Icon className="h-6 w-6 fill-[#E0529C]" name="download" />
                                </span>
                                {/* Platform logo cluster — WP top, Strapi middle, CSV bottom-right */}
                                <div className="relative h-[138px] w-[128px] shrink-0">
                                    {/* WordPress — white card, top */}
                                    <div className="absolute right-4 top-0 flex h-[66px] w-[66px] items-center justify-center rounded-2xl bg-white shadow-md dark:bg-dark-3">
                                        <BrandIcon brand="wordpress" size={36} bare />
                                    </div>
                                    {/* Strapi — white card, middle-left */}
                                    <div className="absolute left-0 top-[50px] flex h-[54px] w-[54px] items-center justify-center rounded-xl bg-white shadow-md dark:bg-dark-3">
                                        <BrandIcon brand="strapi" size={28} bare />
                                    </div>
                                    {/* CSV — green card, bottom-right */}
                                    <div className="absolute bottom-0 right-0 flex h-[46px] w-[56px] items-center justify-center rounded-xl bg-[#34A853] shadow-sm">
                                        <span className="text-xs font-bold tracking-wide text-white">CSV</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-black dark:text-white">Migrate content</p>
                                <p className="mt-2 text-sm leading-relaxed text-grey dark:text-white/65">Import from WordPress, Strapi, Markdown, CSV or JSON: with a live preview first.</p>
                            </div>
                            <div className="mt-auto w-fit rounded-2xl bg-[#E0529C]/10 px-6 py-3.5 text-sm font-medium text-[#E0529C] transition-colors group-hover:bg-[#E0529C]/[0.15]">
                                Import your content &rarr;
                            </div>
                        </button>
                    </div>

                    <div className="step-stagger flex flex-col items-center gap-1.5">
                        <span className="text-caption-2 text-grey dark:text-white/40">or</span>
                        <button type="button" onClick={skip} className="inline-flex items-center gap-1.5 text-caption-1 text-grey transition-colors hover:text-primary dark:text-white/60 dark:hover:text-lilac">
                            Skip for now, I&rsquo;ll set it up later
                            <Icon className="h-4 w-4 fill-current" name="arrow-right" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── FRESH ────────────────────────────────────────────────────── */}
            {!launching && stage === "fresh" && (
                <div className="flex flex-col gap-5">
                    <BackButton onClick={() => setStage("choose")} />
                    <div className="flex items-center gap-4">
                        <RocketScene size={72} className="step-pop shrink-0" />
                        <div>
                            <h2 className="step-heading font-poppins text-h4 font-extrabold text-black dark:text-white">Pick a starting point</h2>
                            <p className="step-sub mt-1 text-body-sm text-grey dark:text-white/75">
                                We&rsquo;ll set up the right content types for you. Everything is editable later in the Schema Builder.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {STARTERS.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setSelectedStarter(s.id)}
                                disabled={!!applying}
                                className={cn(
                                    "step-stagger flex flex-col gap-3 rounded-2xl border p-5 text-left transition-all disabled:pointer-events-none disabled:opacity-60",
                                    selectedStarter === s.id
                                        ? "border-primary bg-primary/[0.04] shadow-sm dark:bg-primary/10"
                                        : "border-grey-light bg-white/80 hover:border-primary/40 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className={cn(
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                                        selectedStarter === s.id ? "bg-primary/15" : "bg-primary/10",
                                    )}>
                                        <Icon className="h-[18px] w-[18px] fill-primary" name={s.icon} />
                                    </span>
                                    <span className={cn(
                                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                                        selectedStarter === s.id ? "border-primary bg-primary" : "border-[#D4D0E8] dark:border-white/25",
                                    )}>
                                        {selectedStarter === s.id && <span className="h-2 w-2 rounded-full bg-white" />}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-title font-semibold text-black dark:text-white">{s.label}</p>
                                    <p className="text-caption-2 text-grey dark:text-white/60">{s.subtitle}</p>
                                </div>
                                <p className="text-caption-2 leading-relaxed text-grey dark:text-white/55">{s.desc}</p>
                                {s.recommended && (
                                    <span className="inline-flex w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-caption-2 font-medium text-primary">
                                        Recommended
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="step-fade flex items-center gap-2.5 rounded-2xl bg-primary/[0.06] px-4 py-3 dark:bg-primary/10">
                        <span className="shrink-0 text-primary" aria-hidden>✦</span>
                        <p className="text-caption-2 text-grey dark:text-white/65">
                            You can customize content types, fields, and relationships anytime in the{" "}
                            <span className="font-medium text-primary dark:text-lilac">Schema Builder.</span>
                        </p>
                    </div>

                    <div className="flex justify-end">
                        <button type="button" onClick={() => applyStarter(selectedStarter)} disabled={!!applying} className="btn-primary disabled:opacity-60">
                            {applying ? "Setting up..." : "Continue"}
                            <Icon className="h-5 w-5 fill-white" name="arrow-right" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── MIGRATE ──────────────────────────────────────────────────── */}
            {!launching && stage === "migrate" && (
                <div className="flex flex-col gap-5">
                    <BackButton onClick={() => setStage("choose")} />
                    <div className="flex items-center gap-4">
                        <BoxesScene size={72} className="step-pop shrink-0" />
                        <div>
                            <h2 className="step-heading font-poppins text-h4 font-extrabold text-black dark:text-white">Bring your content in</h2>
                            <p className="step-sub mt-1 text-body-sm text-grey dark:text-white/75">
                                Choose your platform, preview what we find, then import. Re-running later is always safe.
                            </p>
                        </div>
                    </div>

                    <div className="step-fade">
                        <SetupImportCard />
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-1">
                        <p className="flex items-center gap-1.5 text-caption-2 text-grey dark:text-white/50">
                            <Icon className="h-3.5 w-3.5 shrink-0 fill-current" name="lock" />
                            Your existing content will never be changed or deleted.
                        </p>
                        <button type="button" onClick={() => setStage("connect")} className="btn-primary shrink-0">
                            Continue <Icon className="h-5 w-5 fill-white" name="arrow-right" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── CONNECT ──────────────────────────────────────────────────── */}
            {!launching && stage === "connect" && (
                <div className="mx-auto flex w-full flex-col gap-5 lg:w-[832px]">
                    <BackButton onClick={() => setStage(path === "migrate" ? "migrate" : "fresh")} className="lg:-ml-[6rem]" />

                    <div className="flex flex-wrap items-start gap-4">
                        <div className="flex flex-1 items-center gap-4">
                            <PlugScene size={72} className="step-pop shrink-0" />
                            <div>
                                <h2 className="step-heading font-poppins text-h4 font-extrabold text-black dark:text-white">Connect your site</h2>
                                <p className="step-sub mt-1 text-body-sm text-grey dark:text-white/75">
                                    Generate a token and drop the snippet into your site. You can also do this later from Settings &rarr; API Docs.
                                </p>
                            </div>
                        </div>
                        <div className="step-fade hidden shrink-0 items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.04] px-3.5 py-3 sm:flex dark:border-primary/25 dark:bg-primary/[0.08]">
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 fill-primary" name="lock" />
                            <div>
                                <p className="text-caption-1 font-semibold text-black dark:text-white">Your data stays secure</p>
                                <p className="text-caption-2 text-grey dark:text-white/55">Read-only access. We never write to your database.</p>
                            </div>
                        </div>
                    </div>

                    {/* Main card — full width */}
                    <div className="step-fade overflow-hidden rounded-3xl border border-grey-light bg-white dark:border-white/10 dark:bg-white/[0.04]">
                            {/* Section 1 */}
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-grey-light px-8 py-6 dark:border-white/10">
                                <div className="flex items-start gap-3.5">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption-2 font-bold text-primary">1</span>
                                    <div>
                                        <p className="text-title text-black dark:text-white">Generate your token</p>
                                        <p className="mt-0.5 text-caption-2 text-grey dark:text-white/55">This token gives your site read-only access to your content.</p>
                                    </div>
                                </div>
                                {connectToken ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-caption-2 font-semibold text-success">
                                        <Icon className="h-3.5 w-3.5 fill-success" name="check" />Token ready
                                    </span>
                                ) : (
                                    <button type="button" onClick={createConnectToken} disabled={connectCreating} className="btn-primary shrink-0 disabled:opacity-60">
                                        <Icon className="h-4 w-4 fill-white" name="key" />
                                        {connectCreating ? "Creating..." : "Generate read token"}
                                    </button>
                                )}
                            </div>

                            {/* Section 2 */}
                            <div className="px-8 py-6">
                                <div className="mb-4 flex items-center gap-3.5">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption-2 font-bold text-primary">2</span>
                                    <p className="text-title text-black dark:text-white">Add the snippet to your site</p>
                                </div>

                                <div className="mb-3 inline-flex flex-wrap items-center rounded-xl border border-grey-light bg-lavender-mist p-0.5 dark:border-white/10 dark:bg-dark-3">
                                    {CONNECT_TABS.map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setConnectFw(tab.id)}
                                            className={cn(
                                                "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-caption-1 font-semibold transition-all",
                                                connectFw === tab.id ? "bg-white text-black shadow-sm dark:bg-dark-2 dark:text-white" : "text-grey hover:text-black dark:text-white/50 dark:hover:text-white/80",
                                            )}
                                        >
                                            <span className={connectFw === tab.id ? "opacity-85" : "opacity-60"}>{tab.badge}</span>
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <p className="text-caption-2 text-grey dark:text-white/55">{CONNECT_HINTS[connectFw]}</p>
                                    <span className="inline-flex shrink-0 items-center gap-1 text-caption-2 text-primary dark:text-lilac">
                                        <Icon className="h-3.5 w-3.5 fill-current" name="info" />
                                        Need help?
                                    </span>
                                </div>

                                {/* Code (left) + help links (right) */}
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_200px] lg:items-start">
                                  <div className="min-w-0">
                                {/* Code block with line numbers */}
                                <div className="relative">
                                    <div className="overflow-x-auto rounded-2xl bg-[#1a1a2e] py-3.5 text-[11px] leading-relaxed dark:bg-dark-1">
                                        <table className="w-full border-collapse font-mono">
                                            <tbody>
                                                {snippetLines.map((line, i) => (
                                                    <tr key={i}>
                                                        <td className="select-none whitespace-nowrap px-3.5 text-right text-white/25" style={{ minWidth: "2.5rem", width: "2.5rem" }}>{i + 1}</td>
                                                        <td className="pr-4 text-white/85">{line || " "}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={copySnippet}
                                        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-caption-2 font-semibold text-white transition-colors hover:bg-white/20"
                                    >
                                        <Icon className="h-3.5 w-3.5 fill-white" name="copy" />
                                        {connectCopied ? "Copied!" : "Copy"}
                                    </button>
                                </div>

                                <div className="mt-3 flex items-start gap-1.5 rounded-2xl bg-lavender-mist px-4 py-3 text-caption-2 text-grey dark:bg-white/[0.04] dark:text-white/55">
                                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current" name="compass" />
                                    <span>Not sure what your Flow CMS URL is? It&rsquo;s wherever this admin is hosted, e.g.{" "}
                                        <span className="font-mono text-primary underline underline-offset-2 dark:text-lilac">https://cms.yoursite.com/api</span>
                                    </span>
                                </div>

                                {connectError && (
                                    <div className="mt-3 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{connectError}</div>
                                )}
                                  </div>

                                  {/* Help links — single container, divided rows */}
                                  <div className="overflow-hidden rounded-2xl border border-grey-light bg-lavender-mist dark:border-white/10 dark:bg-white/[0.03]">
                                    {CONNECT_HELP.map((item, i) => (
                                        <div
                                            key={item.title}
                                            className={cn(
                                                "flex cursor-default items-center gap-3 px-4 py-4 transition-colors hover:bg-white/60 dark:hover:bg-white/[0.05]",
                                                i < CONNECT_HELP.length - 1 && "border-b border-grey-light dark:border-white/10",
                                            )}
                                        >
                                            <span className="shrink-0 text-primary dark:text-lilac">{item.icon}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-caption-1 font-semibold text-black dark:text-white">{item.title}</p>
                                                <p className="text-caption-2 leading-snug text-grey dark:text-white/50">{item.desc}</p>
                                            </div>
                                            <Icon className="h-3.5 w-3.5 shrink-0 fill-grey dark:fill-white/30" name="arrow-right" />
                                        </div>
                                    ))}
                                  </div>
                                </div>
                            </div>
                        </div>

                    <div className="flex justify-end">
                        <button type="button" onClick={finish} className="btn-primary">
                            <Icon className="h-5 w-5 fill-white" name="check" />Finish setup
                        </button>
                    </div>
                </div>
            )}

            {/* Content-setup boot overlay */}
            {booting && (
                <PowerUp
                    title={booting.title}
                    subtitle={booting.subtitle}
                    tasks={booting.tasks}
                    scene={booting.scene}
                    onDone={() => bootDone.current?.()}
                />
            )}
        </div>
    );
};

// ─── Inline launch sequence (Step 4) ─────────────────────────────────────────
// Renders within the page so the layout header + stepper remain visible.

const LAUNCH_STEP = 0.88;
const LAUNCH_HOLD = 1.1;

const LaunchView = ({
    title,
    subtitle,
    tasks,
    onDone,
}: {
    title: string;
    subtitle: string;
    tasks: BootTask[];
    onDone?: () => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            if (reduce || document.hidden) {
                tasks.forEach((_, i) => {
                    gsap.set(`.lv-prog-${i}`, { autoAlpha: 0 });
                    gsap.set(`.lv-done-${i}`, { autoAlpha: 1 });
                });
                const pctEl = ref.current?.querySelector(".lv-pct") as HTMLElement | null;
                if (pctEl) pctEl.textContent = "100%";
                gsap.set(".lv-bar", { scaleX: 1, transformOrigin: "left center" });
                setTimeout(() => onDone?.(), 1200);
                return;
            }

            const total = tasks.length * LAUNCH_STEP;
            const counter = { pct: 0 };
            const tl = gsap.timeline({ onComplete: () => onDone?.() });

            tl.from(".lv-ill", { scale: 0.82, autoAlpha: 0, duration: 0.7, ease: "back.out(1.5)" }, 0);
            tl.from(".lv-title", { autoAlpha: 0, y: 14, duration: 0.55, ease: "power2.out", clearProps: "transform,opacity" }, 0.2);
            tl.from(".lv-card", { autoAlpha: 0, y: 12, duration: 0.5, ease: "power2.out", clearProps: "transform,opacity" }, 0.3);
            tl.from(".lv-progress", { autoAlpha: 0, y: 8, duration: 0.45, ease: "power2.out", clearProps: "transform,opacity" }, 0.4);
            tl.from(".lv-footer", { autoAlpha: 0, duration: 0.4, ease: "power2.out" }, 0.5);

            const seqStart = 0.55;
            tasks.forEach((_, i) => {
                const t = seqStart + i * LAUNCH_STEP;
                tl.set(`.lv-prog-${i}`, { autoAlpha: 1 }, t);
                tl.set(`.lv-prog-${i}`, { autoAlpha: 0 }, seqStart + (i + 1) * LAUNCH_STEP);
                tl.set(`.lv-done-${i}`, { autoAlpha: 1 }, seqStart + (i + 1) * LAUNCH_STEP);
            });

            tl.fromTo(".lv-bar", { scaleX: 0 }, { scaleX: 1, transformOrigin: "left center", duration: total, ease: "power1.inOut" }, seqStart);

            const pctEl = ref.current?.querySelector(".lv-pct") as HTMLElement | null;
            if (pctEl) {
                tl.to(counter, {
                    pct: 100,
                    duration: total,
                    ease: "power1.inOut",
                    onUpdate: () => { pctEl.textContent = Math.round(counter.pct) + "%"; },
                }, seqStart);
            }

            tl.to({}, { duration: LAUNCH_HOLD });
        },
        { scope: ref, dependencies: [tasks.map((t) => t.title).join("|")] },
    );

    return (
        <div ref={ref} className="flex flex-col items-center gap-6">
            <RocketScene size={200} className="lv-ill shrink-0" />

            <div className="lv-title text-center">
                <h2 className="font-poppins text-[1.75rem] font-extrabold leading-tight tracking-[-0.015em] text-black dark:text-white">{title}</h2>
                <p className="mt-1.5 text-caption-1 text-grey dark:text-white/65">{subtitle}</p>
            </div>

            <div className="lv-card w-full max-w-[520px] overflow-hidden rounded-2xl border border-grey-light bg-white dark:border-white/10 dark:bg-white/[0.05]">
                {tasks.map((task, i) => (
                    <div key={i} className={cn("flex items-center gap-3.5 px-5 py-3.5", i < tasks.length - 1 && "border-b border-grey-light dark:border-white/10")}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            <Icon className="h-[18px] w-[18px] fill-primary" name={task.icon} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-title text-black dark:text-white">{task.title}</p>
                            <p className="text-caption-2 text-grey dark:text-white/55">{task.desc}</p>
                        </div>
                        <div className="relative h-5 w-[98px] shrink-0">
                            <div className={`lv-prog-${i} absolute inset-0 flex items-center gap-1.5 opacity-0`}>
                                <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <circle cx="12" cy="12" r="9" stroke="#A29BFE" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="18 38" />
                                </svg>
                                <span className="whitespace-nowrap text-caption-2 font-medium text-primary dark:text-lilac">In progress</span>
                            </div>
                            <div className={`lv-done-${i} absolute inset-0 flex items-center gap-1.5 opacity-0`}>
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success">
                                    <Icon className="h-2.5 w-2.5 fill-white" name="check" />
                                </span>
                                <span className="whitespace-nowrap text-caption-2 font-semibold text-success">Done</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="lv-progress w-full max-w-[520px]">
                <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 fill-primary" name="sparkles" />
                    <p className="flex-1 text-caption-2 text-grey dark:text-white/60">
                        <span className="font-semibold text-black dark:text-white">Almost there!</span> This usually takes less than a minute.
                    </p>
                    <span className="lv-pct text-caption-2 font-semibold text-primary dark:text-lilac">0%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/12 dark:bg-primary/20">
                    <div className="lv-bar h-full w-full rounded-full bg-[linear-gradient(90deg,#6C5CE7_0%,#A29BFE_100%)]" />
                </div>
            </div>

            <p className="lv-footer flex items-center gap-1.5 text-caption-2 text-grey dark:text-white/40">
                <Icon className="h-3.5 w-3.5 shrink-0 fill-current" name="lock" />
                Your data is safe with us. We never share, sell, or modify your content.
            </p>
        </div>
    );
};

// ─── Setup-specific import card (Step 2.2) ────────────────────────────────────
// Same API calls as Import.tsx, matched to the reference visual layout.

type SIPreviewGroup = { targetType: string; targetName: string; count: number; sample: { title: string; slug: string | null; status: string }[] };
type SIPreview = { groups: SIPreviewGroup[]; total: number };
type SIReport = { imported: number; skipped: number; typesCreated: number; errors: string[] };

const SetupImportCard = () => {
    const [kind, setKind] = useState<ImportKind>("wordpress");
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");
    const [typesStr, setTypesStr] = useState("");
    const [text, setText] = useState("");
    const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
    const [typeApiId, setTypeApiId] = useState("");
    const [space, setSpace] = useState("");
    const [environment, setEnvironment] = useState("");
    const [project, setProject] = useState("");
    const [dataset, setDataset] = useState("");
    const [docType, setDocType] = useState("");
    const [preview, setPreview] = useState<SIPreview | null>(null);
    const [report, setReport] = useState<SIReport | null>(null);
    const [busy, setBusy] = useState<null | "preview" | "run">(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const body = () => ({
        kind,
        url: url.trim() || undefined,
        token: token.trim() || undefined,
        types: typesStr.trim() ? typesStr.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        text: text || undefined,
        files: files.length ? files : undefined,
        typeApiId: typeApiId.trim() || undefined,
        space: space.trim() || undefined,
        environment: environment.trim() || undefined,
        project: project.trim() || undefined,
        dataset: dataset.trim() || undefined,
        docType: docType.trim() || undefined,
    });

    const onFiles = async (list: FileList | null) => {
        if (!list) return;
        const read = await Promise.all(
            Array.from(list).map(
                (f) => new Promise<{ name: string; content: string }>((res) => {
                    const r = new FileReader();
                    r.onload = () => res({ name: f.name, content: String(r.result ?? "") });
                    r.readAsText(f);
                }),
            ),
        );
        setFiles(read);
    };

    const run = async (mode: "preview" | "run") => {
        setBusy(mode);
        setError(null);
        if (mode === "preview") setReport(null);
        try {
            const res = await api<SIPreview & SIReport>(`/import/${mode}`, { method: "POST", body: JSON.stringify(body()) });
            if (mode === "preview") setPreview(res as SIPreview);
            else { setReport(res as SIReport); setPreview(null); }
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Import failed.");
        } finally {
            setBusy(null);
        }
    };

    const reset = () => { setPreview(null); setReport(null); setError(null); };

    const inp = "w-full h-10 px-3.5 rounded-xl border border-grey-light bg-white text-[0.8125rem] text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

    const needsExtraConfig = kind !== "wordpress";
    const showPublicApi = kind === "wordpress";

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-2xl border border-grey-light bg-white dark:border-white/10 dark:bg-white/[0.04]">

                {/* Platform grid */}
                <div className="p-5">
                    <div className="mb-1 flex items-center justify-between">
                        <p className="text-title font-semibold text-black dark:text-white">Import from a platform</p>
                        <button type="button" className="inline-flex items-center gap-1 rounded-xl border border-grey-light px-2.5 py-1 text-caption-2 font-medium text-grey transition-colors hover:border-primary hover:text-primary dark:border-white/15 dark:text-white/60">
                            <Icon className="h-3.5 w-3.5 fill-current" name="info" />How it works
                        </button>
                    </div>
                    <p className="mb-4 text-caption-2 text-grey dark:text-white/55">We&rsquo;ll connect, preview your content, and import everything you need.</p>

                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {IMPORT_SOURCES.map((s) => {
                            const badge = PLATFORM_BADGE[s.kind];
                            const selected = kind === s.kind;
                            return (
                                <button
                                    key={s.kind}
                                    type="button"
                                    onClick={() => { setKind(s.kind); reset(); }}
                                    className={cn(
                                        "relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all",
                                        selected ? "border-primary bg-primary/[0.04] dark:bg-primary/10" : "border-grey-light hover:border-primary/40 dark:border-white/10 dark:hover:border-white/20",
                                    )}
                                >
                                    {selected && (
                                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-success shadow-sm">
                                            <Icon className="h-2.5 w-2.5 fill-white" name="check" />
                                        </span>
                                    )}
                                    {resolveBrand(s.kind) ? (
                                        <BrandIcon brand={s.kind} size={32} rounded="rounded-xl" />
                                    ) : (
                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-bold text-white" style={{ background: badge.bg }}>
                                            {badge.label}
                                        </span>
                                    )}
                                    <span className={cn("text-caption-2 font-medium", selected ? "text-primary" : "text-black dark:text-white")}>{s.label}</span>
                                </button>
                            );
                        })}
                        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-grey-light p-3 text-center dark:border-white/10">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-grey-light dark:border-white/15">
                                <Icon className="h-4 w-4 fill-grey" name="plus" />
                            </span>
                            <span className="text-caption-2 text-grey dark:text-white/40">More soon</span>
                        </div>
                    </div>
                </div>

                {/* Extra platform config (Strapi, Contentful, Sanity, Markdown, CSV, JSON) */}
                {needsExtraConfig && (
                    <div className="border-t border-grey-light px-5 pb-5 pt-4 dark:border-white/10">
                        <div className="flex flex-col gap-3">
                            {kind === "strapi" && (
                                <>
                                    <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Strapi URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://my-strapi.example.com" className={inp} /></label>
                                    <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">API token (read)</span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional for public content" className={inp} /></label>
                                    <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Collection types</span><input value={typesStr} onChange={(e) => setTypesStr(e.target.value)} placeholder="articles, pages" className={inp} /></label>
                                </>
                            )}
                            {kind === "markdown" && (
                                <div>
                                    <input ref={fileRef} type="file" accept=".md,.markdown,.txt" multiple onChange={(e) => onFiles(e.target.files)} className="hidden" />
                                    <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary"><Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="plus" />Choose .md files</button>
                                    {files.length > 0 && <p className="mt-2 text-caption-2 text-grey">{files.length} file{files.length === 1 ? "" : "s"} selected</p>}
                                </div>
                            )}
                            {(kind === "csv" || kind === "json") && (
                                <label className="block">
                                    <span className="mb-1.5 block text-caption-2 text-grey">Paste {kind.toUpperCase()}</span>
                                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={kind === "csv" ? "title,slug,body,status,date\n…" : '[{ "title": "…", "slug": "…", "body": "…", "status": "published" }]'} className={`${inp} h-auto py-2.5 font-mono`} />
                                </label>
                            )}
                            {kind === "contentful" && (
                                <>
                                    <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Space ID</span><input value={space} onChange={(e) => setSpace(e.target.value)} placeholder="abc123xyz" className={inp} /></label>
                                    <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Content Delivery token</span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="CDA access token" className={inp} /></label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Environment</span><input value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="master" className={inp} /></label>
                                        <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Content type (optional)</span><input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="blogPost" className={inp} /></label>
                                    </div>
                                </>
                            )}
                            {kind === "sanity" && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Project ID</span><input value={project} onChange={(e) => setProject(e.target.value)} placeholder="abcd1234" className={inp} /></label>
                                        <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Dataset</span><input value={dataset} onChange={(e) => setDataset(e.target.value)} placeholder="production" className={inp} /></label>
                                    </div>
                                    <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">API token (private only)</span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional" className={inp} /></label>
                                    <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Document type (optional)</span><input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="post" className={inp} /></label>
                                </>
                            )}
                            {(kind === "markdown" || kind === "csv" || kind === "json") && (
                                <label className="block"><span className="mb-1.5 block text-caption-2 text-grey">Import into content type (created if missing)</span><input value={typeApiId} onChange={(e) => setTypeApiId(e.target.value)} placeholder="article" className={inp} /></label>
                            )}
                        </div>
                    </div>
                )}

                {/* Public API URL section — WordPress */}
                {showPublicApi && (
                    <div className="border-t border-grey-light dark:border-white/10">
                        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-5">
                            <div className="flex items-start gap-2.5 sm:max-w-[220px]">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                    <Icon className="h-4 w-4 fill-primary" name="compass" />
                                </span>
                                <div>
                                    <p className="text-caption-1 font-semibold text-black dark:text-white">Import from a site&rsquo;s public API</p>
                                    <p className="mt-0.5 text-caption-2 text-grey dark:text-white/55">Enter your site URL and we&rsquo;ll fetch your content via REST API.</p>
                                </div>
                            </div>
                            <div className="flex-1">
                                <div className="relative">
                                    <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-grey" name="external" />
                                    <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className={cn(inp, "pl-9")} />
                                </div>
                                <p className="mt-1.5 flex items-center gap-1 text-caption-2 text-grey dark:text-white/40">
                                    <Icon className="h-3.5 w-3.5 shrink-0 fill-current" name="lock" />
                                    We only import content. Your data is never modified.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3 border-t border-grey-light px-5 py-4 dark:border-white/10">
                    <button type="button" onClick={() => run("preview")} disabled={!!busy} className="btn-secondary disabled:opacity-60">
                        <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="eye" />
                        {busy === "preview" ? "Checking..." : "Preview first"}
                    </button>
                    <button type="button" onClick={() => run("run")} disabled={!!busy || !preview} className="btn-primary disabled:opacity-60">
                        <Icon className="h-4 w-4 fill-white" name="download" />
                        {busy === "run" ? "Importing..." : "Preview & Import"}
                    </button>
                </div>

                {error && <div className="mx-5 mb-5 rounded-2xl bg-error/10 px-4 py-3 text-caption-2 text-error">{error}</div>}
            </div>

            {preview && (
                <div className="rounded-2xl border border-grey-light bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
                    <h3 className="mb-1 text-title font-semibold text-black dark:text-white">Preview: {preview.total} item{preview.total === 1 ? "" : "s"}</h3>
                    <p className="mb-3 text-caption-2 text-grey">Looks good? Click <b>Preview &amp; Import</b> above.</p>
                    <div className="flex flex-col gap-2">
                        {preview.groups.map((g) => (
                            <div key={g.targetType} className="rounded-xl border border-grey-light p-3.5 dark:border-white/10">
                                <div className="mb-1.5 flex items-center justify-between">
                                    <span className="text-caption-1 font-semibold text-black dark:text-white">{g.targetName} <span className="font-mono text-caption-2 text-grey">/{g.targetType}</span></span>
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-caption-2 font-semibold text-primary">{g.count} entries</span>
                                </div>
                                <ul className="flex flex-col gap-0.5">
                                    {g.sample.map((s, i) => (
                                        <li key={i} className="flex items-center gap-2 text-caption-2 text-grey"><span className="truncate text-black dark:text-white">{s.title}</span><span className="font-mono">/{s.slug}</span></li>
                                    ))}
                                    {g.count > g.sample.length && <li className="text-caption-2 text-grey">...and {g.count - g.sample.length} more</li>}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {report && (
                <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
                    <div className="flex items-start gap-2.5">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 fill-success" name="check" />
                        <div>
                            <p className="text-caption-1 font-semibold text-black dark:text-white">Import complete</p>
                            <p className="text-caption-2 text-grey">{report.imported} imported · {report.skipped} skipped · {report.typesCreated} type{report.typesCreated === 1 ? "" : "s"} created</p>
                            {report.errors.length > 0 && <ul className="mt-1.5 flex flex-col gap-0.5 text-caption-2 text-error">{report.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────

const BackButton = ({ onClick, className }: { onClick: () => void; className?: string }) => (
    <button type="button" onClick={onClick} className={cn("inline-flex w-fit items-center gap-1.5 text-caption-1 text-grey transition-colors hover:text-primary dark:text-white/65 dark:hover:text-lilac", className)}>
        <Icon className="h-4 w-4 fill-current" name="arrow-left" />Back
    </button>
);

export default SetupWizard;
