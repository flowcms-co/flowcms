/**
 * Tiny client for the Flow CMS backend API. Sends the session cookie with every
 * request (credentials: "include") and normalizes error messages.
 */
export const API_BASE =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/** API origin without the `/api` suffix — used to build absolute media URLs
 *  (uploaded files are served at `${API_ORIGIN}/media/...`). */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

/** Resolve a relative media path (e.g. "/media/abc.webp") to an absolute URL. */
export const mediaUrl = (path?: string | null): string =>
    !path ? "" : /^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path}`;

/**
 * A friendly base URL for code snippets / docs. When the app runs on a real
 * (public) host, `API_BASE` is the user's actual Flow CMS URL, so we show it
 * verbatim — the snippet is copy-paste-ready. On localhost (dev), a literal
 * `http://localhost:4000/api` reads as confusing in a "paste this into your
 * site" example, so we show a clear placeholder the user swaps for their domain.
 */
const isLocalBase = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|\.local(?::|\/|$)/i.test(API_BASE);
const isRelativeBase = API_BASE.startsWith("/");
export const EXAMPLE_BASE = "https://cms.yoursite.com/api";

/**
 * SSR/build-safe display base. The production Docker image is built with a
 * relative API base (`/api`) so one image works on any domain — but that means
 * the absolute public URL isn't known until the page runs in the browser. For
 * SSR (and localhost dev) we show a friendly placeholder; `browserDisplayBase()`
 * (via the `useDisplayBase()` hook) resolves the real origin after mount.
 */
export const DISPLAY_BASE = isLocalBase || isRelativeBase ? EXAMPLE_BASE : API_BASE;

/** Browser-accurate public API base — resolves the real origin for a relative build. */
export function browserDisplayBase(): string {
    if (typeof window !== "undefined") {
        if (isRelativeBase) return window.location.origin + API_BASE;
        if (!isLocalBase) return API_BASE;
    }
    return DISPLAY_BASE;
}

export class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}

export async function api<T = unknown>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            // CSRF: marks this as a same-origin app request; the API requires it on
            // cookie-authenticated mutations (a forged cross-site request can't set it).
            "X-Requested-With": "XMLHttpRequest",
            ...(options.headers ?? {}),
        },
        ...options,
    });

    const data = res.status === 204 ? null : await res.json().catch(() => null);

    if (!res.ok) {
        const raw = (data as { message?: string | string[] } | null)?.message;
        const message = Array.isArray(raw) ? raw.join(", ") : (raw ?? "Something went wrong.");
        throw new ApiError(res.status, message, data);
    }
    return data as T;
}

/**
 * Multipart upload (FormData). Does NOT set Content-Type — the browser adds the
 * multipart boundary itself. Sends the session cookie like `api()`.
 */
export async function uploadFile<T = unknown>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" }, // CSRF (see api()); browser sets the multipart Content-Type
        body: form,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
        const raw = (data as { message?: string | string[] } | null)?.message;
        const message = Array.isArray(raw) ? raw.join(", ") : (raw ?? "Upload failed.");
        throw new ApiError(res.status, message, data);
    }
    return data as T;
}
