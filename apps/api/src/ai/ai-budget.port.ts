/**
 * Optional hook that lets the core AI gateway enforce a monthly spend cap WITHOUT
 * depending on the commercial `ee/` code. The EE `ai_budgets` module provides this
 * port globally; in Community (no `ee/`) it's simply absent and `AiService` skips
 * the check. Implementations must no-op (return null) unless the workspace is
 * licensed for `ai_budgets` and has a cap set.
 */
export const AI_BUDGET_PORT = "AI_BUDGET_PORT";

/** Handle for an in-flight spend reservation. The caller MUST release it once the
 *  AI call has settled (on success AND failure), so the held headroom is freed. */
export interface AiBudgetReservation {
    /** Free the reserved headroom. Idempotent. */
    release(): Promise<void>;
}

export interface AiBudgetPort {
    /**
     * Reserve headroom for one AI call BEFORE it runs. Throws HTTP 402 when the
     * workspace is already at/over its monthly cap — counting other in-flight
     * reservations, which is what closes the check-then-write TOCTOU (a burst of
     * concurrent calls near the cap can no longer all pass the same pre-spend read).
     *
     * Returns `null` when there is nothing to enforce (unlicensed, or no cap set),
     * in which case the caller proceeds without a reservation. When non-null, the
     * caller MUST `release()` it after the call settles.
     */
    reserve(workspaceId: string): Promise<AiBudgetReservation | null>;
}
