import type { Prisma } from "@flowcms/db";

/** Who counts as an entry's author (Workspace.authorMode). */
export const AUTHOR_MODES = ["creator", "lastEditor"] as const;
export type AuthorMode = (typeof AUTHOR_MODES)[number];

type AuthorFields = { authorId: string | null; lastEditorId: string | null; authorOverrideId: string | null };

/** The author the workspace setting picks on its own, ignoring any override. */
export const autoAuthorId = (e: AuthorFields, mode: string): string | null =>
    mode === "lastEditor" ? (e.lastEditorId ?? e.authorId) : e.authorId;

/** The author to show: a hand-picked one wins, else the workspace setting decides. */
export const effectiveAuthorId = (e: AuthorFields, mode: string): string | null => e.authorOverrideId ?? autoAuthorId(e, mode);

/** Prisma filter matching entries whose effective author is `id` (mirrors effectiveAuthorId). */
export const authorWhere = (id: string, mode: string): Prisma.ContentEntryWhereInput => ({
    OR: [
        { authorOverrideId: id },
        mode === "lastEditor"
            ? { authorOverrideId: null, OR: [{ lastEditorId: id }, { lastEditorId: null, authorId: id }] }
            : { authorOverrideId: null, authorId: id },
    ],
});
