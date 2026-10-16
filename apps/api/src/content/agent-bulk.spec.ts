import { describe, expect, it, vi } from "vitest";
import { AgentController } from "./agent.controller";
import { getPath, setPaths } from "./draft-diff";

describe("bulk field update: paths", () => {
    const hero = { headline: "H", subheadline: "Serving {City:Your City} and Nearby Areas", featuredReview: { starRating: "5" }, serviceCategories: [] };

    it("deep-sets one key and keeps every other key at every level", () => {
        const next = setPaths({ title: "T", heroSection: hero }, { "heroSection.subheadline": "Serving {CityCount} cities." });
        expect(next).toEqual({ title: "T", heroSection: { ...hero, subheadline: "Serving {CityCount} cities." } });
        expect(hero.subheadline).toContain("{City:Your City}"); // input untouched
    });

    it("creates missing objects, sets list items, and refuses a step through a value", () => {
        expect(setPaths({}, { "a.b": 1 })).toEqual({ a: { b: 1 } });
        expect(setPaths({ faq: [{ q: "A", a: "1" }] }, { "faq[0].a": "2" })).toEqual({ faq: [{ q: "A", a: "2" }] });
        expect(() => setPaths({ title: "T" }, { "title.x": 1 })).toThrow(/not an object/);
    });

    it("reads a path, undefined when missing", () => {
        expect(getPath({ heroSection: hero }, "heroSection.featuredReview.starRating")).toBe("5");
        expect(getPath({}, "heroSection.subheadline")).toBeUndefined();
    });
});

describe("PATCH /agent/:type/bulk", () => {
    const setup = (scopes: string[]) => {
        const bulkSet = vi.fn().mockResolvedValue({ matched: 0, updated: 0, skipped: 0, failed: [], entries: [] });
        const ctrl = new AgentController({ bulkSet } as never, null as never, { resolveType: async () => ({ id: "t1" }) } as never, null as never);
        return { ctrl, bulkSet, req: { apiToken: { workspaceId: "w", scopes } } as never };
    };
    const body = { set: { "heroSection.subheadline": "Serving {CityCount} cities." }, dryRun: true };

    it("needs content.update, never publish, and passes no publish right", async () => {
        const { ctrl, bulkSet, req } = setup(["content.read", "content.update"]);
        await ctrl.bulkSet(req, "services", body as never);
        expect(bulkSet).toHaveBeenCalledWith("w", "t1", { where: undefined, set: body.set, dryRun: true }, []);
    });

    it("refuses a token without content.update", async () => {
        const { ctrl, req } = setup(["content.read"]);
        await expect(ctrl.bulkSet(req, "services", body as never)).rejects.toThrow(/content.update/);
    });
});
