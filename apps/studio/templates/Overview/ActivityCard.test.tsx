import { describe, expect, it, vi } from "vitest";
import { toActivityRows, visibleRows } from "./ActivityCard";

vi.mock("@/components/ui/Card", () => ({ default: () => null }));
vi.mock("@/lib/useDashboard", () => ({ useDashboard: () => ({ data: null, loading: true, error: false }) }));

const ev = (id: string, role: string, roleName: string, action: string) => ({ id, entryId: `e${id}`, person: "P", role, roleName, action, target: "T", type: "Page", at: new Date().toISOString() });

describe("activity rows", () => {
    const rows = toActivityRows([
        ...Array.from({ length: 6 }, (_, i) => ev(`a${i}`, "admin", "Admin", "edited")),
        ev("c", "legal_reviewer", "Legal Reviewer", "archived"),
        ev("s", "system", "Automation", "published"),
        ev("x", "search_strategist", "Search Strategist", "unpublished"),
    ]);

    it("keeps custom roles and automation as themselves, not as Editor", () => {
        expect(rows.find((r) => r.id === "c")).toMatchObject({ role: "other", roleName: "Legal Reviewer", action: "archived" });
        expect(rows.find((r) => r.id === "s")).toMatchObject({ role: "system", roleName: "Automation" });
        expect(rows.find((r) => r.id === "x")).toMatchObject({ role: "seo", action: "unpublished" });
    });

    it("filters before cutting to five, so a filter cannot empty a list with matches", () => {
        expect(visibleRows(rows, ["other", "system"], 5).map((r) => r.id)).toEqual(["c", "s"]);
        expect(visibleRows(rows, ["admin"], 5)).toHaveLength(5);
    });
});
