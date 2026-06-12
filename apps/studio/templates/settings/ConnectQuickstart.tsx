"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { useDisplayBase } from "@/lib/useDisplayBase";
import { cn } from "@/lib/cn";

type Fw = "sdk" | "next" | "curl";
const TABS: { id: Fw; label: string }[] = [
    { id: "sdk", label: "JS SDK" },
    { id: "next", label: "Next.js" },
    { id: "curl", label: "cURL" },
];

// One-line "where does this go?" guidance per stack.
const HINTS: Record<Fw, string> = {
    sdk: "Works in any JavaScript / TypeScript project. Run the install in your site, then drop the client into a server-side file.",
    next: "Create the client in a lib file, then call it from any Server Component or Route Handler.",
    curl: "A quick terminal test: confirms your token and URL work before you wire up any code.",
};

const snippet = (fw: Fw, token: string, displayBase: string) => {
    const t = token || "YOUR_TOKEN";
    const url = `"${displayBase}", // 👈 your Flow CMS URL`;
    if (fw === "curl")
        return `# Paste this into your terminal to test the connection\ncurl "${displayBase}/public/articles?limit=10" \\\n  -H "Authorization: Bearer ${t}"`;
    if (fw === "next")
        return `// 1. lib/flow.ts: create the client once\nimport { createClient } from "@flowcms/client";\nexport const flow = createClient({\n  url: ${url}\n  token: process.env.FLOWCMS_TOKEN!, // add FLOWCMS_TOKEN to .env.local\n});\n\n// 2. app/blog/page.tsx: use it in a Server Component\nimport { flow } from "@/lib/flow";\nexport default async function Blog() {\n  const { data } = await flow.list("articles", { limit: 10 });\n  return <ul>{data.map((p) => <li key={p.id}>{String(p.title)}</li>)}</ul>;\n}`;
    return `# 1. Install the client in your website project\nnpm install @flowcms/client\n\n# 2. Create a client: put this in any server-side file (e.g. lib/flow.js)\nimport { createClient } from "@flowcms/client";\nconst flow = createClient({\n  url: ${url}\n  token: "${t}", // keep this secret: store it in an env var\n});\n\n# 3. Fetch your content anywhere\nconst { data } = await flow.list("articles", { limit: 10 });`;
};

/**
 * Connect-your-site quickstart — generate a read token in one click and copy a
 * ready-to-run snippet (SDK / Next.js / cURL) with your real URL + token in it,
 * plus a plain-English note on where each snippet goes.
 */
const ConnectQuickstart = () => {
    const displayBase = useDisplayBase();
    const [fw, setFw] = useState<Fw>("sdk");
    const [token, setToken] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

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
        </Card>
    );
};

export default ConnectQuickstart;
