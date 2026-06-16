"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { useDisplayBase } from "@/lib/useDisplayBase";
import { cn } from "@/lib/cn";

type Fw = "fetch" | "next" | "curl";
const TABS: { id: Fw; label: string }[] = [
    { id: "fetch", label: "JavaScript" },
    { id: "next", label: "Next.js" },
    { id: "curl", label: "cURL" },
];

// One-line "where does this go?" guidance per stack. Everything here uses the
// plain REST API + your token, so there's nothing to install.
const HINTS: Record<Fw, string> = {
    fetch: "Works in any JavaScript / TypeScript project. No install: fetch the REST API with your token.",
    next: "Drop this into a Server Component or Route Handler. No package to install.",
    curl: "A quick terminal test: confirms your token and URL work before you wire up any code.",
};

const snippet = (fw: Fw, token: string, displayBase: string) => {
    const t = token || "YOUR_TOKEN";
    if (fw === "curl")
        return `# Test the connection from your terminal\ncurl "${displayBase}/public/articles?limit=10" \\\n  -H "Authorization: Bearer ${t}"`;
    if (fw === "next")
        return `// app/blog/page.tsx — a Server Component (nothing to install)\nexport default async function Blog() {\n  const res = await fetch("${displayBase}/public/articles?limit=10", {\n    headers: { Authorization: "Bearer ${t}" }, // keep the token in FLOWCMS_TOKEN\n    next: { revalidate: 60 }, // ISR; pair with a webhook for instant updates\n  });\n  const { data } = await res.json();\n  return <ul>{data.map((p) => <li key={p.id}>{String(p.title)}</li>)}</ul>;\n}`;
    return `// Any JS/TS project — no install, just fetch the REST API.\nconst res = await fetch("${displayBase}/public/articles?limit=10", {\n  headers: { Authorization: "Bearer ${t}" }, // store the token in an env var\n});\nconst { data } = await res.json();\nconsole.log(data);`;
};

// Live-editor setup: enables clicking-to-edit on the real page inside the FlowCMS
// preview. No token, no npm — load the bridge script and tag editable regions with
// data-flowcms-field="<your field name>" (talks to the studio over postMessage).
const liveSnippet = (fw: Fw, displayBase: string) => {
    let origin = "";
    try {
        origin = new URL(displayBase).origin;
    } catch {
        /* relative base (e.g. "/api"): leave empty so the path is site-relative */
        origin = "";
    }
    if (fw === "next")
        return `// 1. app/layout.tsx — load the bridge once, inside <body>\nimport Script from "next/script";\n//   <Script src="${origin}/flowcms-live-edit.js" strategy="afterInteractive" />\n\n// 2. Tag the editable parts of your pages with the content-model field name:\n//   <h1 data-flowcms-field="title">{title}</h1>\n//   <p  data-flowcms-field="summary">{summary}</p>\n//   <div data-flowcms-field="body" data-flowcms-rich dangerouslySetInnerHTML={{ __html: body }} />`;
    if (fw === "fetch")
        return `<!-- 1. Add the bridge once to your site (any framework) -->\n<script src="${origin}/flowcms-live-edit.js" defer></script>\n\n<!-- 2. Tag the editable parts of your pages -->\n<h1 data-flowcms-field="title">Your title</h1>\n<p  data-flowcms-field="summary">Your summary</p>\n<div data-flowcms-field="body" data-flowcms-rich>…rich content…</div>`;
    return `<!-- Add once to your site's HTML -->\n<script src="${origin}/flowcms-live-edit.js" defer></script>\n\n<!-- Then tag editable fields by their content-model name -->\n<h1 data-flowcms-field="title">Your title</h1>\n<div data-flowcms-field="body" data-flowcms-rich>…rich content…</div>`;
};

/**
 * Connect-your-site quickstart — generate a read token in one click and copy a
 * ready-to-run snippet (SDK / Next.js / cURL) with your real URL + token in it,
 * plus a plain-English note on where each snippet goes.
 */
const ConnectQuickstart = () => {
    const displayBase = useDisplayBase();
    const [fw, setFw] = useState<Fw>("fetch");
    const [token, setToken] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [copiedLive, setCopiedLive] = useState(false);

    const createToken = async () => {
        setCreating(true);
        setError(null);
        try {
            const res = await api<{ token: string }>("/api-tokens", { method: "POST", body: JSON.stringify({ name: "Website (read)", type: "CONTENT" }) });
            setToken(res.token);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not create a token.");
        } finally {
            setCreating(false);
        }
    };

    const copy = async () => {
        await navigator.clipboard.writeText(snippet(fw, token, displayBase));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const copyLive = async () => {
        await navigator.clipboard.writeText(liveSnippet(fw, displayBase));
        setCopiedLive(true);
        setTimeout(() => setCopiedLive(false), 1500);
    };

    return (
        <Card className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Connect your site in 60 seconds</h2>
                    <p className="text-caption-2 text-grey">Generate a token, copy the snippet, and paste it into your website&rsquo;s code. That&rsquo;s it.</p>
                </div>
                {token ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-success/10 text-success text-caption-2 font-semibold"><Icon className="w-3.5 h-3.5 fill-success" name="check" />Token created: it&rsquo;s in the snippet below</span>
                ) : (
                    <button type="button" onClick={createToken} disabled={creating} className="btn-primary disabled:opacity-60"><Icon className="w-5 h-5 fill-white" name="key" />{creating ? "Creating…" : "Generate a read token"}</button>
                )}
            </div>

            <div className="flex gap-2 mb-2">
                {TABS.map((t) => (
                    <button key={t.id} type="button" onClick={() => setFw(t.id)} className={cn("px-3 h-9 rounded-xl text-caption-1 font-semibold transition-colors", fw === t.id ? "bg-primary text-white" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3")}>{t.label}</button>
                ))}
            </div>
            <p className="mb-3 flex items-start gap-1.5 text-caption-2 text-grey"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-grey" name="info" />{HINTS[fw]}</p>

            <div className="relative">
                <pre className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-caption-1 leading-relaxed text-white/90 dark:bg-dark-2">{snippet(fw, token, displayBase)}</pre>
                <button type="button" onClick={copy} className="absolute right-3 top-3 rounded-lg bg-white/10 px-2.5 py-1 text-caption-2 font-semibold text-white transition-colors hover:bg-white/20">{copied ? "Copied!" : "Copy"}</button>
            </div>

            {token ? (
                <p className="mt-2 text-caption-2 text-grey">Heads up: this token is shown <b>once</b>. Store it as <code className="font-mono">FLOWCMS_TOKEN</code> in your site&rsquo;s environment variables (never commit it). Manage tokens anytime in <b>Settings → API Keys</b>.</p>
            ) : (
                <p className="mt-2 text-caption-2 text-grey">Not sure what your Flow CMS URL is? It&rsquo;s wherever this admin is hosted: e.g. <code className="font-mono">https://cms.yoursite.com/api</code>.</p>
            )}
            {error && <div className="mt-3 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

            {/* Optional second step: live editing (visual editor on the real page). */}
            <div className="mt-5 border-t border-grey-light pt-4 dark:border-grey-light/10">
                <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 fill-primary" name="edit" />
                    <h3 className="text-title font-semibold text-black dark:text-white">Enable live editing on your pages <span className="text-caption-2 font-normal text-grey">(optional)</span></h3>
                </div>
                <p className="mb-3 text-caption-2 text-grey">
                    Lets editors click and edit the real page inside the live preview. No npm package or token needed: load the bridge script and tag each editable element with <code className="font-mono">data-flowcms-field</code> (matching your content-model field name; use <code className="font-mono">title</code> for the entry title). Inert in production unless opened through the studio preview.
                </p>
                <div className="relative">
                    <pre className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-caption-1 leading-relaxed text-white/90 dark:bg-dark-2">{liveSnippet(fw, displayBase)}</pre>
                    <button type="button" onClick={copyLive} className="absolute right-3 top-3 rounded-lg bg-white/10 px-2.5 py-1 text-caption-2 font-semibold text-white transition-colors hover:bg-white/20">{copiedLive ? "Copied!" : "Copy"}</button>
                </div>
            </div>
        </Card>
    );
};

export default ConnectQuickstart;
