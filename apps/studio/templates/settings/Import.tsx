"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import BrandIcon from "@/components/ui/BrandIcon";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { resolveBrand } from "@/lib/brands";

type Kind = "wordpress" | "strapi" | "markdown" | "csv" | "json" | "contentful" | "sanity";
type PreviewGroup = { targetType: string; targetName: string; count: number; sample: { title: string; slug: string | null; status: string }[] };
type Preview = { groups: PreviewGroup[]; total: number };
type Report = { imported: number; skipped: number; typesCreated: number; errors: string[] };

const SOURCES: { kind: Kind; label: string; icon: string; desc: string }[] = [
    { kind: "wordpress", label: "WordPress", icon: "document", desc: "From a site's public REST API" },
    { kind: "strapi", label: "Strapi", icon: "grid", desc: "From a Strapi URL + read token" },
    { kind: "markdown", label: "Markdown", icon: "edit", desc: "Upload .md files (Hugo, Jekyll, Astro…)" },
    { kind: "csv", label: "CSV", icon: "chart", desc: "Paste rows from a spreadsheet" },
    { kind: "json", label: "JSON", icon: "document", desc: "Paste a JSON array of items" },
    { kind: "contentful", label: "Contentful", icon: "grid", desc: "Space + Content Delivery token" },
    { kind: "sanity", label: "Sanity", icon: "grid", desc: "Project + dataset (token for private)" },
];
const field = "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

// What the user still needs to provide before Preview is possible, per source.
const INPUT_HINT: Record<Kind, string> = {
    wordpress: "Enter your WordPress site URL above to begin.",
    strapi: "Enter your Strapi URL and at least one collection type above to begin.",
    markdown: "Choose one or more .md files above to begin.",
    csv: "Paste your CSV rows above to begin.",
    json: "Paste your JSON array above to begin.",
    contentful: "Enter your Space ID and Delivery token above to begin.",
    sanity: "Enter your Project ID above to begin.",
};

/**
 * Import wizard — bring content in from WordPress, Strapi, Markdown, CSV or JSON.
 * Preview shows what would be imported; Import runs it (idempotent — re-running
 * skips entries that already exist by slug).
 */
const Import = () => {
    const [kind, setKind] = useState<Kind>("wordpress");
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");
    const [typesStr, setTypesStr] = useState("");
    const [text, setText] = useState("");
    const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
    const [typeApiId, setTypeApiId] = useState("");
    // Contentful / Sanity config
    const [space, setSpace] = useState("");
    const [environment, setEnvironment] = useState("");
    const [project, setProject] = useState("");
    const [dataset, setDataset] = useState("");
    const [docType, setDocType] = useState("");
    const [preview, setPreview] = useState<Preview | null>(null);
    const [report, setReport] = useState<Report | null>(null);
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
            const res = await api<Preview & Report>(`/import/${mode}`, { method: "POST", body: JSON.stringify(body()) });
            if (mode === "preview") setPreview(res as Preview);
            else { setReport(res as Report); setPreview(null); }
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Import failed.");
        } finally {
            setBusy(null);
        }
    };

    const reset = () => { setPreview(null); setReport(null); setError(null); };

    // Enough provided to preview? (mirrors the server's required fields per source.)
    const hasInput =
        kind === "wordpress" ? !!url.trim()
        : kind === "strapi" ? !!url.trim() && !!typesStr.trim()
        : kind === "markdown" ? files.length > 0
        : kind === "csv" || kind === "json" ? !!text.trim()
        : kind === "contentful" ? !!space.trim() && !!token.trim()
        : kind === "sanity" ? !!project.trim()
        : false;

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h2 className="text-h5 text-black dark:text-white mb-1">Import content</h2>
                        <p className="text-caption-2 text-grey mb-5">Migrate from another platform. Preview first, then import: re-running is safe (it skips what already exists).</p>
                    </div>
                    <Link href="/setup" className="inline-flex items-center gap-1.5 text-caption-1 text-primary transition-opacity hover:opacity-70"><Icon className="w-4 h-4 fill-primary" name="compass" />Guided setup</Link>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 mb-6">
                    {SOURCES.map((s) => (
                        <button key={s.kind} type="button" onClick={() => { setKind(s.kind); reset(); }} className={cn("flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-colors", kind === s.kind ? "border-primary bg-primary/5" : "border-grey-light hover:bg-lavender-mist dark:border-grey-light/10 dark:hover:bg-dark-3")}>
                            {resolveBrand(s.kind) ? (
                                <BrandIcon brand={s.kind} size={20} bare label={s.label} />
                            ) : (
                                <Icon className={cn("w-5 h-5", kind === s.kind ? "fill-primary" : "fill-grey")} name={s.icon} />
                            )}
                            <span className={cn("text-caption-1 font-semibold", kind === s.kind ? "text-primary" : "text-black dark:text-white")}>{s.label}</span>
                        </button>
                    ))}
                </div>

                <p className="mb-4 text-caption-2 text-grey">{SOURCES.find((s) => s.kind === kind)!.desc}</p>

                {/* Source-specific inputs */}
                <div className="flex flex-col gap-4">
                    {kind === "wordpress" && (
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">WordPress site URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className={field} /></label>
                    )}
                    {kind === "strapi" && (
                        <>
                            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Strapi URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://my-strapi.example.com" className={field} /></label>
                            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">API token (read)</span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional for public content" className={field} /></label>
                            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Collection types</span><input value={typesStr} onChange={(e) => setTypesStr(e.target.value)} placeholder="articles, pages" className={field} /></label>
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
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Paste {kind.toUpperCase()}</span><textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={kind === "csv" ? "title,slug,body,status,date\n…" : '[{ "title": "…", "slug": "…", "body": "…", "status": "published" }]'} className={`${field} h-auto py-3 font-mono text-caption-1`} /></label>
                    )}
                    {kind === "contentful" && (
                        <>
                            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Space ID</span><input value={space} onChange={(e) => setSpace(e.target.value)} placeholder="abc123xyz" className={field} /></label>
                            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Content Delivery token</span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="CDA access token" className={field} /></label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Environment</span><input value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="master" className={field} /></label>
                                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Content type <span className="text-grey">(optional)</span></span><input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="blogPost: blank = all" className={field} /></label>
                            </div>
                        </>
                    )}
                    {kind === "sanity" && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Project ID</span><input value={project} onChange={(e) => setProject(e.target.value)} placeholder="abcd1234" className={field} /></label>
                                <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Dataset</span><input value={dataset} onChange={(e) => setDataset(e.target.value)} placeholder="production" className={field} /></label>
                            </div>
                            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">API token <span className="text-grey">(only for private datasets)</span></span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional" className={field} /></label>
                            <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Document type <span className="text-grey">(optional)</span></span><input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="post: blank = all with a title" className={field} /></label>
                        </>
                    )}
                    {(kind === "markdown" || kind === "csv" || kind === "json") && (
                        <label className="block"><span className="mb-1.5 block text-caption-1 text-grey">Import into content type <span className="text-grey">(api id, created if missing)</span></span><input value={typeApiId} onChange={(e) => setTypeApiId(e.target.value)} placeholder="article" className={field} /></label>
                    )}
                </div>

                {/* Guided two-step actions: 1) Preview checks what would come in,
                    2) Import applies it. Import stays locked until a preview succeeds,
                    and the hint below always says what to do next. */}
                <div className="mt-6 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => run("preview")}
                            disabled={!!busy || !hasInput}
                            className={cn("disabled:opacity-50", preview ? "btn-secondary" : "btn-primary")}
                        >
                            <Icon className="h-4 w-4 fill-current" name="eye" />
                            {busy === "preview" ? "Checking…" : preview ? "Re-check" : "Preview"}
                        </button>
                        <Icon name="arrow-right" className="hidden h-4 w-4 shrink-0 fill-grey/60 sm:block" />
                        <button
                            type="button"
                            onClick={() => run("run")}
                            disabled={!!busy || !preview}
                            title={preview ? "Import the previewed content" : "Run Preview first to unlock Import"}
                            className={cn("disabled:opacity-50", preview ? "btn-primary" : "btn-secondary")}
                        >
                            <Icon className="h-4 w-4 fill-current" name={preview ? "download" : "lock"} />
                            {busy === "run" ? "Importing…" : "Import"}
                        </button>
                    </div>

                    {/* Always tell the user the next step. */}
                    <p className="flex items-center gap-1.5 text-caption-2 text-grey">
                        {!hasInput ? (
                            <><Icon name="info" className="h-3.5 w-3.5 shrink-0 fill-grey" />{INPUT_HINT[kind]}</>
                        ) : preview ? (
                            <><Icon name="check" className="h-3.5 w-3.5 shrink-0 fill-success" />Checked {preview.total} item{preview.total === 1 ? "" : "s"} — now click <b className="font-semibold text-black dark:text-white">Import</b> to bring them in.</>
                        ) : (
                            <><span className="font-semibold text-primary">Step 1 of 2:</span>&nbsp;click <b className="font-semibold text-black dark:text-white">Preview</b> to check what will be imported (nothing changes yet). <b className="font-semibold text-black dark:text-white">Import</b> unlocks after.</>
                        )}
                    </p>
                </div>
                {error && <div className="mt-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
            </Card>

            {preview && (
                <Card>
                    <h3 className="text-h5 text-black dark:text-white mb-1">Preview: {preview.total} item{preview.total === 1 ? "" : "s"}</h3>
                    <p className="text-caption-2 text-grey mb-4">Looks good? Click <b>Import</b> above.</p>
                    <div className="flex flex-col gap-3">
                        {preview.groups.map((g) => (
                            <div key={g.targetType} className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-title text-black dark:text-white">{g.targetName} <span className="font-mono text-caption-2 text-grey">/{g.targetType}</span></span>
                                    <span className="rounded-pill bg-primary/10 px-2.5 py-1 text-caption-2 font-semibold text-primary">{g.count} entries</span>
                                </div>
                                <ul className="flex flex-col gap-1">
                                    {g.sample.map((s, i) => (
                                        <li key={i} className="flex items-center gap-2 text-caption-2 text-grey"><span className="truncate text-black dark:text-white">{s.title}</span><span className="font-mono">/{s.slug}</span><span className="ml-auto uppercase">{s.status}</span></li>
                                    ))}
                                    {g.count > g.sample.length && <li className="text-caption-2 text-grey">…and {g.count - g.sample.length} more</li>}
                                </ul>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {report && (
                <Card className="border border-success/30 bg-success/5">
                    <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 fill-success shrink-0 mt-0.5" name="check" />
                        <div>
                            <div className="text-title text-black dark:text-white">Import complete</div>
                            <p className="text-caption-2 text-grey">{report.imported} imported · {report.skipped} skipped (already existed) · {report.typesCreated} content type{report.typesCreated === 1 ? "" : "s"} created</p>
                            {report.errors.length > 0 && (
                                <ul className="mt-2 flex flex-col gap-1 text-caption-2 text-error">{report.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                            )}
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default Import;
