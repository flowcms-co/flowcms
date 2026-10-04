import type { ContentStatus } from "@flowcms/db";

/** Content events written to the audit log with the person who acted; the
 *  dashboard's Recent activity reads them. */
export type ContentEvent =
    | "content.create"
    | "content.edit"
    | "content.submit"
    | "content.approve"
    | "content.schedule"
    | "content.publish"
    | "content.unpublish"
    | "content.archive";

/** The event a status change stands for. Moving a live entry back to draft is an
 *  unpublish; any other move back to draft is just an edit. */
export function eventForStatusChange(from: ContentStatus, to: ContentStatus): ContentEvent {
    if (to === "PUBLISHED") return "content.publish";
    if (to === "IN_REVIEW") return "content.submit";
    if (to === "APPROVED") return "content.approve";
    if (to === "SCHEDULED") return "content.schedule";
    if (to === "ARCHIVED") return "content.archive";
    return from === "PUBLISHED" ? "content.unpublish" : "content.edit";
}
