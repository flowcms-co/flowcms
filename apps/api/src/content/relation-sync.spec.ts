import { describe, it, expect } from "vitest";
import { refIds, reverseDelta, applyForwardValue } from "./relation-sync.service";

describe("refIds", () => {
    it("coerces single and multiple reference values to id lists", () => {
        expect(refIds("a")).toEqual(["a"]);
        expect(refIds(["a", "b"])).toEqual(["a", "b"]);
        expect(refIds(["a", 2, "", null])).toEqual(["a"]);
        expect(refIds(null)).toEqual([]);
        expect(refIds("")).toEqual([]);
        expect(refIds(undefined)).toEqual([]);
    });
});

describe("reverseDelta", () => {
    it("computes which links to add and remove", () => {
        expect(reverseDelta(["a", "b"], ["b", "c"])).toEqual({ add: ["c"], remove: ["a"] });
        expect(reverseDelta([], ["a"])).toEqual({ add: ["a"], remove: [] });
        expect(reverseDelta(["a"], [])).toEqual({ add: [], remove: ["a"] });
        expect(reverseDelta(["a"], ["a"])).toEqual({ add: [], remove: [] });
    });
});

describe("applyForwardValue", () => {
    it("adds to a multiple forward field without duplicates", () => {
        expect(applyForwardValue(["x"], "e1", "add", true)).toEqual(["x", "e1"]);
        expect(applyForwardValue(["e1"], "e1", "add", true)).toEqual(["e1"]);
        expect(applyForwardValue(undefined, "e1", "add", true)).toEqual(["e1"]);
    });

    it("removes from a multiple forward field", () => {
        expect(applyForwardValue(["x", "e1"], "e1", "remove", true)).toEqual(["x"]);
        expect(applyForwardValue([], "e1", "remove", true)).toEqual([]);
    });

    it("sets a single forward field on add", () => {
        expect(applyForwardValue("old", "e1", "add", false)).toBe("e1");
    });

    it("clears a single forward field only when it currently points at the target", () => {
        expect(applyForwardValue("e1", "e1", "remove", false)).toBeNull();
        expect(applyForwardValue("other", "e1", "remove", false)).toBe("other");
        expect(applyForwardValue(null, "e1", "remove", false)).toBeNull();
    });
});
