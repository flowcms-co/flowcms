"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import ConnectQuickstart from "@/templates/settings/ConnectQuickstart";
import { API_BASE } from "@/lib/api";
import { useDisplayBase } from "@/lib/useDisplayBase";

const methodColor: Record<string, string> = { GET: "#00B894", POST: "#6C5CE7", PATCH: "#F5A623", DELETE: "#E24B4A" };

type Endpoint = { method: string; path: string; desc: string };

const DELIVERY: Endpoint[] = [
    { method: "GET", path: "/public/:type", desc: "List published entries (limit, offset, sort, fields, locale, filters[k]=v)" },
    { method: "GET", path: "/public/:type/:idOrSlug", desc: "Fetch one published entry by id or slug" },
    { method: "POST", path: "/graphql", desc: "GraphQL: entries / entry / single queries" },
];

const AGENT: Endpoint[] = [
    { method: "GET", path: "/agent/types", desc: "List content types" },
    { method: "GET", path: "/agent/:type", desc: "List entries (all statuses)" },
    { method: "GET", path: "/agent/:type/:id", desc: "Get one entry" },
    { method: "POST", path: "/agent/:type", desc: "Create an entry (body: title, slug?, locale?, data)" },
    { method: "PATCH", path: "/agent/:type/:id", desc: "Update (title?, slug?, data?, status?, scheduledAt?)" },
    { method: "POST", path: "/agent/:type/:id/publish", desc: "Publish an entry" },
    { method: "POST", path: "/agent/:type/:id/unpublish", desc: "Move an entry back to draft" },
    { method: "DELETE", path: "/agent/:type/:id", desc: "Delete an entry" },
];

const MethodRow = ({ e }: { e: Endpoint }) => (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-grey-light last:border-b-0 dark:border-grey-light/10">
        <span className="inline-flex w-16 justify-center px-2 py-1 rounded-md text-[0.6875rem] font-bold shrink-0" style={{ backgroundColor: `${methodColor[e.method]}1a`, color: methodColor[e.method] }}>{e.method}</span>
        <code className="font-mono text-body-sm text-black dark:text-white">{e.path}</code>
        <span className="ml-auto hidden text-caption-2 text-grey sm:block">{e.desc}</span>
    </div>
);

const Code = ({ children }: { children: string }) => (
    <pre className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-caption-1 leading-relaxed text-white/90 dark:bg-dark-2">{children}</pre>
);

/**
 * API Docs — the full Flow CMS HTTP surface: the read (delivery) API for sites
 * and apps, and the write (agent) API for AI agents / third parties. Manage the
 * tokens these examples use in Settings → API Keys.
 */
const OpenApi = () => {
    const displayBase = useDisplayBase();
    return (
    <div className="flex flex-col gap-6">
        <ConnectQuickstart />

        {/* Base + auth */}
        <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-h5 text-black dark:text-white mb-1">Base URL</h2>
                    <code className="font-mono text-body-sm text-grey">{displayBase}</code>
                    <p className="mt-1 text-caption-2 text-grey">This is your Flow CMS address: wherever this admin is hosted (e.g. <code className="font-mono">https://cms.yoursite.com/api</code>). Swap it into the examples below.</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/settings/developers?tab=api-keys" className="btn-secondary"><Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="key" />Manage tokens</Link>
                    <a href={`${API_BASE}/graphql`} target="_blank" rel="noreferrer" className="btn-primary"><Icon className="w-5 h-5 fill-white" name="external" />GraphQL playground</a>
                </div>
            </div>
            <div className="rounded-2xl bg-lavender-mist/60 p-4 dark:bg-dark-2">
                <p className="text-body-sm text-black dark:text-white">Every request authenticates with a Bearer token: <code className="font-mono">Authorization: Bearer YOUR_TOKEN</code></p>
                <ul className="mt-2 flex flex-col gap-1 text-caption-2 text-grey">
                    <li>• <b>Content</b>: read published content (for your live site)</li>
                    <li>• <b>Preview</b>: read drafts + published (for previews)</li>
                    <li>• <b>Agent / Admin</b>: read <b>and write</b> content (for AI agents &amp; integrations)</li>
                </ul>
            </div>
        </Card>

        {/* Delivery API */}
        <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-grey-light dark:border-grey-light/10">
                <h3 className="text-title text-black dark:text-white">Delivery API: connect your site (read)</h3>
                <p className="mt-0.5 text-caption-2 text-grey">Use a <b>Content</b> token. CORS is open, so a browser frontend can call it directly.</p>
            </div>
            {DELIVERY.map((e) => <MethodRow key={e.method + e.path} e={e} />)}
        </Card>
        <Code>{`# List published blog posts, newest first
curl "${displayBase}/public/articles?limit=10&sort=publishedAt:desc" \\
  -H "Authorization: Bearer YOUR_CONTENT_TOKEN"

# GraphQL
curl "${displayBase}/graphql" -H "Authorization: Bearer YOUR_CONTENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ entries(type:\\"article\\", limit:5){ id slug data } }"}'`}</Code>

        {/* Agent API */}
        <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-grey-light dark:border-grey-light/10">
                <h3 className="text-title text-black dark:text-white">Agent API: let an agent or app make changes (write)</h3>
                <p className="mt-0.5 text-caption-2 text-grey">Use an <b>Agent</b> or <b>Admin</b> token. Same validation, notifications &amp; webhooks as the studio. Content/Preview tokens get 403 here.</p>
            </div>
            {AGENT.map((e) => <MethodRow key={e.method + e.path} e={e} />)}
        </Card>
        <Code>{`# Create a draft, then publish it (acts like a team member)
curl "${displayBase}/agent/article" -H "Authorization: Bearer YOUR_AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Written by an agent","slug":"agent-post","data":{"body":"<p>Hello</p>"}}'

curl -X POST "${displayBase}/agent/article/ENTRY_ID/publish" \\
  -H "Authorization: Bearer YOUR_AGENT_TOKEN"`}</Code>

        {/* Webhooks pointer */}
        <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h3 className="text-title text-black dark:text-white">Outbound webhooks</h3>
                <p className="mt-0.5 text-caption-2 text-grey">Get notified on your systems when content changes (signed with <code className="font-mono">X-Flow-Signature</code>).</p>
            </div>
            <Link href="/settings/developers?tab=webhooks" className="btn-secondary shrink-0">Configure webhooks</Link>
        </Card>
    </div>
    );
};

export default OpenApi;
