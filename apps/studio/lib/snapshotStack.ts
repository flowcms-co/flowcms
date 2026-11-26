/**
 * Undo / redo history for one editing session. `commit` is called with the page's state after every edit:
 * edits less than `pauseMs` after the last one fold into the same step, so typing is one undo, not one per key.
 * In memory only; a new session starts empty.
 */
export type SnapshotStack<T> = {
    reset(state: T): void;
    commit(state: T, now: number): void;
    /** Replace the current state without making a step (the echo of an undo or redo). */
    settle(state: T): void;
    undo(): T | null;
    redo(): T | null;
    canUndo(): boolean;
    canRedo(): boolean;
};

export function createSnapshotStack<T>(cap = 50, pauseMs = 600): SnapshotStack<T> {
    let present: T | undefined;
    let has = false;
    let past: T[] = [];
    let future: T[] = [];
    let last = 0;
    const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
    return {
        reset(state) {
            present = state;
            has = true;
            past = [];
            future = [];
            last = 0;
        },
        commit(state, now) {
            if (!has) return this.reset(state);
            if (same(state, present as T)) return;
            // A pause (or the first edit after an undo) starts a new step; a quick follow-up edit joins the last one.
            if (now - last >= pauseMs || last === 0) {
                past.push(present as T);
                if (past.length > cap) past.shift();
            }
            present = state;
            future = [];
            last = now;
        },
        settle(state) {
            present = state;
            has = true;
        },
        undo() {
            if (!past.length) return null;
            future.push(present as T);
            present = past.pop() as T;
            last = 0;
            return present;
        },
        redo() {
            if (!future.length) return null;
            past.push(present as T);
            present = future.pop() as T;
            last = 0;
            return present;
        },
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
    };
}
