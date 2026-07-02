/**
 * @flowcms/client — the official JavaScript client for Flow CMS.
 *
 *   import { createClient } from "@flowcms/client";
 *   const flow = createClient({ url: "https://your-cms/api", token: "flw_..." });
 *   const { data } = await flow.list("articles", { limit: 10, sort: "publishedAt:desc" });
 *   const post     = await flow.get("articles", "my-slug");
 *   await flow.create("articles", { title: "Hello", data: { body: "<p>Hi</p>" } }); // agent token
 *
 * Zero dependencies. Works in the browser and Node 18+ (uses the global fetch).
 */

export type FetchLike = typeof fetch;

export type ClientOptions = {
    /** Your Flow CMS API base URL, e.g. "https://cms.example.com/api". */
    url: string;
    /** An API token from Settings → API Keys (Content/Preview to read, Agent/Admin to write). */
    token: string;
    /** Optional custom fetch (defaults to the global fetch). */
    fetch?: FetchLike;
};

export type ListOptions = {
    limit?: number;
    offset?: number;
    /** "field:asc" | "field:desc" (publishedAt, createdAt, updatedAt, slug, id). */
    sort?: string;
    /** Only return these data fields. */
    fields?: string[];
    locale?: string;
    /** Equality filters on data fields (or top-level slug). */
    filters?: Record<string, string | number | boolean>;
};

export type Entry = Record<string, unknown> & { id: string; slug: string | null; locale: string; publishedAt: string | null };
export type ListResult = { data: Entry[]; meta?: { total: number; limit: number; offset: number } };
export type WriteBody = { title?: string; slug?: string; locale?: string; status?: string; scheduledAt?: string; data?: Record<string, unknown> };
/** A reviewer's sign-off decision on an entry. */
export type Review = { reviewer: string; decision: "APPROVED" | "CHANGES_REQUESTED"; note: string | null; at: string };
/** Sign-off state for an entry: recorded decisions + the workspace approval policy. */
export type ReviewState = {
    status: string;
    approvalsRequired: number;
    approvals: number;
    isApproved: boolean;
    /** Whether approval is licensed/enforced for this workspace. */
    enforced: boolean;
    reviews: Review[];
};

export class FlowError extends Error {
    constructor(
        message: string,
        public status: number,
        public body?: unknown,
    ) {
        super(message);
        this.name = "FlowError";
    }
}

function qs(opts: ListOptions = {}): string {
    const p = new URLSearchParams();
    if (opts.limit != null) p.set("limit", String(opts.limit));
    if (opts.offset != null) p.set("offset", String(opts.offset));
    if (opts.sort) p.set("sort", opts.sort);
    if (opts.locale) p.set("locale", opts.locale);
    if (opts.fields?.length) p.set("fields", opts.fields.join(","));
    for (const [k, v] of Object.entries(opts.filters ?? {})) p.set(`filters[${k}]`, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
}

export type FlowClient = ReturnType<typeof createClient>;

export function createClient(options: ClientOptions) {
    const base = options.url.replace(/\/$/, "");
    const doFetch: FetchLike = options.fetch ?? (globalThis.fetch as FetchLike);
    if (!doFetch) throw new Error("No fetch available — pass options.fetch in older Node runtimes.");

    async function request<T>(path: string, init?: RequestInit): Promise<T> {
        const res = await doFetch(`${base}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${options.token}`,
                ...(init?.body ? { "Content-Type": "application/json" } : {}),
                ...(init?.headers ?? {}),
            },
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (!res.ok) {
            const msg = (json && (json.message || json.error)) || res.statusText;
            throw new FlowError(Array.isArray(msg) ? msg.join(", ") : String(msg), res.status, json);
        }
        return json as T;
    }

    return {
        /** List published entries of a content type. */
        list(type: string, opts?: ListOptions): Promise<ListResult> {
            return request<ListResult>(`/public/${type}${qs(opts)}`);
        },
        /** Fetch one published entry by id or slug. */
        async get(type: string, idOrSlug: string, opts?: ListOptions): Promise<Entry> {
            const r = await request<{ data: Entry }>(`/public/${type}/${idOrSlug}${qs(opts)}`);
            return r.data;
        },
        /** Fetch a single-type entry. */
        async single(type: string, opts?: ListOptions): Promise<Entry | null> {
            const r = await request<{ data: Entry | null }>(`/public/${type}${qs(opts)}`);
            return (r as { data?: Entry | null }).data ?? null;
        },
        /** Run a GraphQL query against /graphql. Returns the `data` payload. */
        async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
            const r = await request<{ data: T; errors?: { message: string }[] }>(`/graphql`, {
                method: "POST",
                body: JSON.stringify({ query, variables }),
            });
            if (r.errors?.length) throw new FlowError(r.errors.map((e) => e.message).join(", "), 200, r);
            return r.data;
        },

        // ── Write — requires an Agent or Admin token ──
        types(): Promise<{ id: string; name: string; apiId: string }[]> {
            return request(`/agent/types`);
        },
        create(type: string, body: WriteBody): Promise<Entry> {
            return request(`/agent/${type}`, { method: "POST", body: JSON.stringify(body) });
        },
        update(type: string, id: string, body: WriteBody): Promise<Entry> {
            return request(`/agent/${type}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
        },
        publish(type: string, id: string): Promise<Entry> {
            return request(`/agent/${type}/${id}/publish`, { method: "POST" });
        },
        unpublish(type: string, id: string): Promise<Entry> {
            return request(`/agent/${type}/${id}/unpublish`, { method: "POST" });
        },
        /** Schedule an entry to auto-publish at `when` (ISO 8601). Needs content.publish. */
        schedule(type: string, id: string, when: string | Date): Promise<Entry> {
            const scheduledAt = typeof when === "string" ? when : when.toISOString();
            return request(`/agent/${type}/${id}`, { method: "PATCH", body: JSON.stringify({ status: "SCHEDULED", scheduledAt }) });
        },
        /** Submit a draft for review (moves it to IN_REVIEW). Needs content.update. */
        submitForReview(type: string, id: string): Promise<Entry> {
            return request(`/agent/${type}/${id}`, { method: "PATCH", body: JSON.stringify({ status: "IN_REVIEW" }) });
        },
        /** Read the sign-off state (decisions + approval policy) for an entry. */
        reviews(type: string, id: string): Promise<ReviewState> {
            return request(`/agent/${type}/${id}/reviews`);
        },
        /** Record a reviewer decision. Attributed to the user who created the token. Needs content.publish. */
        review(type: string, id: string, decision: "approve" | "request_changes", note?: string): Promise<ReviewState> {
            return request(`/agent/${type}/${id}/review`, { method: "POST", body: JSON.stringify({ decision, note }) });
        },
        /** Approve a published entry's pending draft (step 1 of Approve → Publish). Needs content.publish. */
        approveDraft(type: string, id: string): Promise<Entry> {
            return request(`/agent/${type}/${id}/approve-draft`, { method: "POST" });
        },
        /** Discard a published entry's pending draft and keep the live version. Needs content.update. */
        discardDraft(type: string, id: string): Promise<Entry> {
            return request(`/agent/${type}/${id}/discard-draft`, { method: "POST" });
        },
        remove(type: string, id: string): Promise<{ ok: boolean }> {
            return request(`/agent/${type}/${id}`, { method: "DELETE" });
        },
    };
}
