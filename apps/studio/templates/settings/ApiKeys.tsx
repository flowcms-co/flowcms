"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";
import { useDisplayBase } from "@/lib/useDisplayBase";
import { formatDate } from "@/lib/format";

type Token = {
    id: string;
    name: string;
    prefix: string;
    type: "CONTENT" | "PREVIEW" | "AGENT" | "ADMIN";
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
};

const TYPE_LABEL: Record<Token["type"], string> = {
    CONTENT: "Content (read)",
    PREVIEW: "Preview (drafts)",
    AGENT: "Agent",
    ADMIN: "Admin",
};

const ApiKeys = () => {
    const displayBase = useDisplayBase();
    const [tokens, setTokens] = useState<Token[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [type, setType] = useState<Token["type"]>("CONTENT");
    const [saving, setSaving] = useState(false);
    const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setTokens(await api<Token[]>("/api-tokens"));
            setError(null);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not load tokens.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const create = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const res = await api<{ token: string; name: string }>("/api-tokens", {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), type }),
            });
            setOpen(false);
            setName("");
            setCreated({ token: res.token, name: res.name });
            await load();
        } catch (e) {
            window.alert(e instanceof ApiError ? e.message : "Could not create token.");
        } finally {
            setSaving(false);
        }
    };

    const revoke = async (t: Token) => {
        if (!window.confirm(`Revoke "${t.name}"? Any site using it will stop working.`)) return;
        await api(`/api-tokens/${t.id}`, { method: "DELETE" });
        await load();
    };

    const copy = async (value: string) => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="flex flex-col gap-6">
            <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-lavender-mist dark:bg-dark-3">
                        <Icon className="w-5 h-5 fill-primary" name="key" />
                    </span>
                    <div>
                        <h2 className="text-h5 text-black dark:text-white">API tokens</h2>
                        <p className="text-caption-2 text-grey">
                            {loading ? "Loading…" : `${tokens.length} active`} · for the public content API &amp; agents
                        </p>
                    </div>
                </div>
                <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
                    <Icon className="w-5 h-5 fill-white" name="plus" />
                    Create token
                </button>
            </Card>

            {/* Reveal-once banner after creation */}
            {created && (
                <Card className="border border-success/30 bg-success/5">
                    <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 fill-success shrink-0 mt-0.5" name="check" />
                        <div className="min-w-0 grow">
                            <div className="text-title text-black dark:text-white">
                                Token created: copy it now
                            </div>
                            <p className="text-caption-2 text-grey">
                                This is the only time you&rsquo;ll see <strong>{created.name}</strong>. Store it
                                somewhere safe.
                            </p>
                            <div className="mt-3 flex items-center gap-2">
                                <code className="grow truncate rounded-xl bg-white px-3 py-2 font-mono text-caption-1 text-black dark:bg-dark-2 dark:text-white">
                                    {created.token}
                                </code>
                                <button type="button" onClick={() => copy(created.token)} className="btn-secondary h-9 px-3 text-caption-1">
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                                <button type="button" onClick={() => setCreated(null)} className="btn-secondary h-9 px-3 text-caption-1">
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

            <Card className="!p-0 overflow-hidden">
                {!loading && tokens.length === 0 ? (
                    <div className="px-5 py-12 text-center text-body-sm text-grey">
                        No tokens yet. Create one to let an external site pull your published content.
                    </div>
                ) : (
                    tokens.map((t) => (
                        <div
                            key={t.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 border-b border-grey-light last:border-b-0 dark:border-grey-light/10"
                        >
                            <div className="min-w-0 grow">
                                <div className="flex items-center gap-2">
                                    <span className="text-title text-black dark:text-white">{t.name}</span>
                                    <span className="px-2 py-0.5 rounded-md bg-lavender-mist text-[0.6875rem] font-semibold text-primary dark:bg-dark-3 dark:text-lilac">
                                        {TYPE_LABEL[t.type]}
                                    </span>
                                </div>
                                <code className="mt-1 block font-mono text-caption-2 text-grey">{t.prefix}…••••••••</code>
                            </div>
                            <div className="text-caption-2 text-grey text-right">
                                <div suppressHydrationWarning>Created {formatDate(t.createdAt)}</div>
                                <div>Last used {t.lastUsedAt ? formatDate(t.lastUsedAt) : "never"}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => revoke(t)}
                                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-2xl bg-error/10 text-error text-caption-1 font-bold transition-colors hover:bg-error/20"
                            >
                                Revoke
                            </button>
                        </div>
                    ))
                )}
            </Card>

            {/* REST usage */}
            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-1">REST content API</h2>
                <p className="text-caption-2 text-grey mb-4">
                    Pull your published content from any site or app with a Content token. Supports
                    pagination, filtering, sorting and field selection.
                </p>
                <pre className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-caption-1 leading-relaxed text-white/90 dark:bg-dark-2">
{`# List published entries (e.g. "articles")
curl "${displayBase}/public/articles?limit=10&sort=publishedAt:desc" \\
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter + pick fields
curl "${displayBase}/public/articles?filters[category]=news&fields=title,slug" \\
  -H "Authorization: Bearer YOUR_TOKEN"

# Fetch one by id or slug
curl "${displayBase}/public/articles/your-slug" \\
  -H "Authorization: Bearer YOUR_TOKEN"`}
                </pre>
            </Card>

            {/* GraphQL usage */}
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <h2 className="text-h5 text-black dark:text-white">GraphQL content API</h2>
                    <a
                        href={`${displayBase}/graphql`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-caption-1 text-primary transition-opacity hover:opacity-70"
                    >
                        <Icon className="w-4 h-4 fill-primary" name="external" />
                        Open playground
                    </a>
                </div>
                <p className="text-caption-2 text-grey mb-4">
                    One flexible endpoint at <code className="font-mono">{displayBase}/graphql</code>. Query{" "}
                    <code className="font-mono">entries</code>, <code className="font-mono">entry</code> or{" "}
                    <code className="font-mono">single</code> with the same Bearer token.
                </p>
                <pre className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-caption-1 leading-relaxed text-white/90 dark:bg-dark-2">
{`curl "${displayBase}/graphql" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ entries(type:\\"article\\", limit:5){ id slug data } }"}'`}
                </pre>
                <p className="mt-3 text-caption-2 text-grey">
                    Tip: a <strong>Preview</strong> token also returns drafts: perfect for previewing
                    unpublished content on your site before it goes live.
                </p>
            </Card>

            {/* Create modal */}
            <Transition appear show={open} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setOpen(false)}>
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                                <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <Dialog.Title className="text-h5 text-black dark:text-white mb-5">Create API token</Dialog.Title>
                                    <div className="flex flex-col gap-4">
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Name</span>
                                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing site" className="flow-input" autoFocus />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Type</span>
                                            <Select
                                                variant="field"
                                                ariaLabel="Token type"
                                                value={type}
                                                onChange={(v) => setType(v as Token["type"])}
                                                options={[
                                                    { value: "CONTENT", label: "Content: read published content" },
                                                    { value: "PREVIEW", label: "Preview: read drafts + published (for previews)" },
                                                    { value: "AGENT", label: "Agent: for AI agents (Phase 5)" },
                                                    { value: "ADMIN", label: "Admin: full programmatic access" },
                                                ]}
                                            />
                                        </label>
                                    </div>
                                    <div className="mt-6 flex gap-3">
                                        <button type="button" onClick={() => setOpen(false)} className="btn-secondary grow">Cancel</button>
                                        <button type="button" onClick={create} disabled={saving || !name.trim()} className="btn-primary grow disabled:opacity-60">
                                            {saving ? "Creating…" : "Create token"}
                                        </button>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
};

export default ApiKeys;
