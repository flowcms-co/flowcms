import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { fieldsOf } from "./entry-validation";

/** Coerce a stored reference value into an id list (single refs store a string,
 *  multiple store an array of ids). */
export const refIds = (v: unknown): string[] =>
    Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
        : typeof v === "string" && v
          ? [v]
          : [];

/** The add/remove delta to turn the `previous` linked-id set into `desired`. Used to
 *  propagate a reverse-side relation edit onto the owning entries' forward field. */
export const reverseDelta = (previous: string[], desired: string[]): { add: string[]; remove: string[] } => ({
    add: desired.filter((id) => !previous.includes(id)),
    remove: previous.filter((id) => !desired.includes(id)),
});

/** Compute the new value of an owner's forward Reference field when `targetId` is
 *  linked ("add") or unlinked ("remove") from it. `multiple` forward fields keep a
 *  de-duplicated list; single fields hold one id (cleared only if it currently points
 *  at the target, so we never clobber an unrelated link). */
export const applyForwardValue = (current: unknown, targetId: string, op: "add" | "remove", multiple: boolean): unknown => {
    if (multiple) {
        const list = refIds(current);
        return op === "add" ? [...new Set([...list, targetId])] : list.filter((x) => x !== targetId);
    }
    if (op === "add") return targetId;
    return current === targetId ? null : (current ?? null);
};

/**
 * Keeps the EntryRelation join table in step with entries' Reference fields. The
 * forward value still lives in the entry's `data` JSON (authoritative); this table
 * is a derived index that lets the delivery API answer the *reverse* side of a
 * relation ("which posts link to this author?") without scanning every entry's blob.
 *
 * `syncEntry` recomputes an owner entry's forward links from its data and is called
 * after every write that changes that data (create / direct update / publish-promote
 * / unpublish-fold / duplicate). It's best-effort: a failure here never blocks the
 * content save, since the forward relation is still readable straight from the JSON.
 */
@Injectable()
export class RelationSyncService {
    private readonly logger = new Logger(RelationSyncService.name);

    constructor(private readonly prisma: PrismaService) {}

    async syncEntry(
        workspaceId: string,
        entryId: string,
        contentTypeId: string,
        schema: unknown,
        data: Record<string, unknown>,
    ): Promise<void> {
        try {
            // Forward Reference fields only: reverse fields (mappedByField) hold no
            // stored value, they're derived from the other side's rows.
            const forward = fieldsOf(schema).filter((f) => f.type === "Reference" && !f.mappedByField);
            const desired: { fromField: string; toId: string; order: number }[] = [];
            for (const f of forward) {
                refIds(data?.[f.name]).forEach((toId, i) => desired.push({ fromField: f.name, toId, order: i }));
            }

            // FK safety: only link to entries that still exist in this workspace, so a
            // stale id in the blob (e.g. from an import) can't fail the insert.
            const toIds = [...new Set(desired.map((d) => d.toId))];
            const valid = toIds.length
                ? new Set(
                      (
                          await this.prisma.contentEntry.findMany({
                              where: { workspaceId, id: { in: toIds } },
                              select: { id: true },
                          })
                      ).map((e) => e.id),
                  )
                : new Set<string>();

            const rows = desired
                .filter((d) => valid.has(d.toId))
                .map((d) => ({
                    workspaceId,
                    fromId: entryId,
                    fromField: d.fromField,
                    fromTypeId: contentTypeId,
                    toId: d.toId,
                    order: d.order,
                }));

            // Replace this entry's forward links wholesale — per-entry volume is small,
            // so a delete-then-insert is simpler and race-free than diffing.
            await this.prisma.$transaction([
                this.prisma.entryRelation.deleteMany({ where: { fromId: entryId } }),
                ...(rows.length ? [this.prisma.entryRelation.createMany({ data: rows, skipDuplicates: true })] : []),
            ]);
        } catch (err) {
            // Non-fatal: the forward value is still in the entry data; only the reverse
            // index is (temporarily) stale. Most likely cause: migration not yet run.
            this.logger.warn(`Relation sync failed for entry ${entryId}: ${(err as Error).message}`);
        }
    }
}
