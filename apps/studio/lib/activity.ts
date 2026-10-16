/** Shared vocabulary for the activity log, version history and diffs. */

export type FieldChange = { path: string; before: unknown; after: unknown; formattingOnly?: boolean };

export type ActivityRow = {
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    entryType: string | null;
    title: string | null;
    slug: string | null;
    versionBefore: number | null;
    versionAfter: number | null;
    metadata: (Record<string, unknown> & { changes?: FieldChange[] }) | null;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
    tokenId: string | null;
    actor: { id: string | null; name: string; email: string | null; role: string | null } | null;
};

/** Friendly labels for logged actions. */
export const ACTION_LABEL: Record<string, string> = {
    "auth.signin": "Signed in",
    "auth.signin_failed": "Failed sign-in",
    "auth.signout": "Signed out",
    "auth.password_reset": "Password reset",
    "auth.2fa_enabled": "Enabled 2FA",
    "auth.2fa_disabled": "Disabled 2FA",
    "auth.2fa_backup_regenerated": "Regenerated backup codes",
    "user.create": "Created user",
    "user.update": "Updated user",
    "user.role_change": "Changed a user's role",
    "user.delete": "Deleted user",
    "role.create": "Created role",
    "role.update": "Updated role",
    "role.delete": "Deleted role",
    "integration.connect": "Connected integration",
    "integration.remove": "Removed integration",
    "apitoken.create": "Created API token",
    "apitoken.update": "Changed API token access",
    "apitoken.revoke": "Revoked API token",
    "webhook.create": "Created webhook",
    "webhook.update": "Updated webhook",
    "webhook.delete": "Deleted webhook",
    "model.create": "Created content type",
    "model.update": "Changed content type",
    "model.delete": "Deleted content type",
    "content.create": "Created",
    "content.edit": "Edited",
    "content.submit": "Submitted for review",
    "content.approve": "Approved",
    "content.request_changes": "Requested changes",
    "content.schedule": "Scheduled",
    "content.publish": "Published",
    "content.unpublish": "Unpublished",
    "content.archive": "Archived",
    "content.discard_draft": "Discarded draft",
    "content.slug_change": "Changed slug",
    "content.restore": "Restored a version",
    "content.delete": "Deleted",
    "content.restore_deleted": "Restored from Deleted items",
    "media.upload": "Uploaded file",
    "media.edit": "Edited file details",
    "media.move": "Moved file",
    "media.replace": "Replaced file",
    "media.delete": "Deleted file",
    "media.restore_deleted": "Restored file",
    "media.folder_create": "Created folder",
    "media.folder_rename": "Renamed folder",
    "media.folder_delete": "Deleted folder",
    "media.settings": "Changed upload limits",
    "workspace.activity_settings": "Changed activity settings",
};

export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

/** Action filter choices for the Activity page (prefixes end in "."). */
export const ACTION_FILTERS: { value: string; label: string }[] = [
    { value: "", label: "All actions" },
    { value: "content.", label: "All content changes" },
    { value: "content.edit", label: "Edits" },
    { value: "content.publish", label: "Publishes" },
    { value: "content.unpublish", label: "Unpublishes" },
    { value: "content.approve", label: "Approvals" },
    { value: "content.restore", label: "Restores" },
    { value: "content.slug_change", label: "Slug changes" },
    { value: "content.delete", label: "Deletes" },
    { value: "media.", label: "All media changes" },
    { value: "auth.", label: "Sign-ins" },
    { value: "user.", label: "Users" },
    { value: "role.", label: "Roles" },
    { value: "apitoken.", label: "API tokens" },
    { value: "webhook.", label: "Webhooks" },
    { value: "model.", label: "Content model" },
];

/** Text of an HTML string, for previews (never rendered as HTML). */
export const textOf = (v: string) =>
    v
        .replace(/<(br|\/p|\/li|\/h[1-6]|\/div)>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

/** A media reference or image URL, shown as an image rather than text. */
export const isImageRef = (v: unknown): v is string =>
    typeof v === "string" && v.length < 600 && (/^\/media\/[^\s"<>]+$/.test(v) || /^https?:\/\/[^\s"<>]+\.(png|jpe?g|webp|avif|gif|svg)(\?[^\s"<>]*)?$/i.test(v));

/** A short one-line form of any value. */
export function preview(v: unknown, max = 140): string {
    if (v === null || v === undefined || v === "") return "(empty)";
    const s = typeof v === "string" ? textOf(v) : JSON.stringify(v);
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

export type WordPart = { text: string; kind: "same" | "add" | "del" };

/**
 * Word-by-word diff of two texts (rich text is compared as its text). Longest
 * common subsequence over words.
 * ponytail: O(n·m) table, capped at 1500 words a side; past that it shows the
 * whole before and after.
 */
export function wordDiff(before: string, after: string): WordPart[] {
    const a = before.split(/(\s+)/).filter(Boolean);
    const b = after.split(/(\s+)/).filter(Boolean);
    if (a.length > 1500 || b.length > 1500) return [{ text: before, kind: "del" }, { text: after, kind: "add" }];
    const n = a.length;
    const m = b.length;
    const t: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    const out: WordPart[] = [];
    const push = (text: string, kind: WordPart["kind"]) => {
        const last = out[out.length - 1];
        if (last?.kind === kind) last.text += text;
        else out.push({ text, kind });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            push(a[i], "same");
            i++;
            j++;
        } else if (t[i + 1][j] >= t[i][j + 1]) push(a[i++], "del");
        else push(b[j++], "add");
    }
    while (i < n) push(a[i++], "del");
    while (j < m) push(b[j++], "add");
    return out;
}

/** Top-level field names a list of changes touches (for "restore only these"). */
export const topFields = (changes: FieldChange[]) => [...new Set(changes.map((c) => c.path.split(/[.[]/)[0]).filter(Boolean))];
