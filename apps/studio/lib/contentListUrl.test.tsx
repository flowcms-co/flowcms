import { describe, expect, it } from "vitest";
import { listUrl } from "./contentListUrl";

const view = { q: "", type: "all", status: "all", by: "all", locale: "all", sort: "updated", dir: "desc", page: "1" };
const defaults = { type: "all", status: "all", by: "all", locale: "all", sort: "updated", dir: "desc", page: "1" };

describe("content list url", () => {
    it("leaves defaults out", () => expect(listUrl("/content", "", view, defaults, false)).toBe("/content"));

    it("writes the view for All content", () => {
        expect(listUrl("/content", "", { ...view, page: "5", status: "live", q: "roof" }, defaults, false)).toBe("/content?q=roof&status=live&page=5");
    });

    it("keeps the Reference tab and writes page and search for a locked list", () => {
        expect(listUrl("/content/reference", "?tab=abc", { ...view, page: "5", q: "tx", type: "x" }, defaults, true)).toBe("/content/reference?tab=abc&q=tx&page=5");
    });

    it("drops params that went back to default and keeps unrelated ones", () => {
        expect(listUrl("/content/reference", "?tab=abc&page=5&keep=1", view, defaults, true)).toBe("/content/reference?tab=abc&keep=1");
    });
});
