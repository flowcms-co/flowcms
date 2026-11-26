import { describe, expect, it } from "vitest";
import { createSnapshotStack } from "./snapshotStack";

const make = () => {
    const s = createSnapshotStack<{ v: string }>();
    s.reset({ v: "a" });
    return s;
};

describe("snapshot stack", () => {
    it("starts empty", () => {
        const s = make();
        expect(s.canUndo()).toBe(false);
        expect(s.canRedo()).toBe(false);
        expect(s.undo()).toBeNull();
    });

    it("undoes and redoes one step", () => {
        const s = make();
        s.commit({ v: "b" }, 1000);
        expect(s.undo()).toEqual({ v: "a" });
        expect(s.canRedo()).toBe(true);
        expect(s.redo()).toEqual({ v: "b" });
        expect(s.canRedo()).toBe(false);
    });

    it("folds rapid edits into one step and splits after a pause", () => {
        const s = make();
        s.commit({ v: "b" }, 1000);
        s.commit({ v: "bc" }, 1200);
        s.commit({ v: "bcd" }, 1500);
        s.commit({ v: "x" }, 2500);
        expect(s.undo()).toEqual({ v: "bcd" });
        expect(s.undo()).toEqual({ v: "a" });
        expect(s.undo()).toBeNull();
    });

    it("ignores a commit that changes nothing", () => {
        const s = make();
        s.commit({ v: "a" }, 1000);
        expect(s.canUndo()).toBe(false);
    });

    it("keeps at most 50 steps", () => {
        const s = make();
        for (let i = 1; i <= 80; i++) s.commit({ v: String(i) }, i * 1000);
        let n = 0;
        while (s.undo()) n++;
        expect(n).toBe(50);
    });

    it("clears redo after a new edit, and the first edit after an undo is its own step", () => {
        const s = make();
        s.commit({ v: "b" }, 1000);
        s.undo();
        s.commit({ v: "c" }, 1100);
        expect(s.canRedo()).toBe(false);
        expect(s.undo()).toEqual({ v: "a" });
    });

    it("settle replaces the state without adding a step", () => {
        const s = make();
        s.commit({ v: "b" }, 1000);
        s.undo();
        s.settle({ v: "a-normalised" });
        expect(s.canUndo()).toBe(false);
        expect(s.redo()).toEqual({ v: "b" });
    });
});
