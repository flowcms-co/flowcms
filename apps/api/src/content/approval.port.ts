/**
 * Optional hook that lets the core content engine enforce reviewer sign-off before
 * publishing WITHOUT depending on the commercial `ee/` code. The EE
 * `approval_workflows` module provides this port globally; in Community (no `ee/`)
 * it's simply absent and the publish path proceeds unguarded. Implementations must
 * no-op unless the workspace is licensed for `approval_workflows`.
 */
export const APPROVAL_PORT = "APPROVAL_PORT";

export interface ApprovalPort {
    /**
     * Throw (HTTP 403) when a transition into a publish state (`PUBLISHED` /
     * `SCHEDULED`) is attempted before the entry has the required approvals. The
     * scheduler's `SCHEDULED → PUBLISHED` is allowed (already past sign-off).
     */
    assertCanPublish(
        workspaceId: string,
        entry: { id: string; status: string },
        nextStatus: string,
    ): Promise<void>;

    /** Whether approval is actually enforced for this workspace (licensed). Lets the
     *  UI decide between a "Submit for approval" and a direct "Publish" action. */
    isEnforced(workspaceId: string): Promise<boolean>;
}
