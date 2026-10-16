/** A write token as needed to guess who made an unattributed change. */
export type WriteToken = { name: string; createdAt: Date; revokedAt: Date | null };

/**
 * Who made a change recorded without an author. Before v1.9.6 only API (agent)
 * writes were stored that way, so the actor was a token: named when exactly one
 * Agent/Admin token existed at that moment, otherwise "API agent".
 */
export function apiActorAt(tokens: WriteToken[], at: Date): string {
    const live = tokens.filter((t) => t.createdAt <= at && (!t.revokedAt || t.revokedAt > at));
    return live.length === 1 ? `${live[0].name} (API token)` : "API agent";
}
