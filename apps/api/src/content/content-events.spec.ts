import { describe, expect, it } from "vitest";
import { eventForStatusChange } from "./content-events";

describe("eventForStatusChange", () => {
    it("names the action a status change stands for", () => {
        expect(eventForStatusChange("DRAFT", "IN_REVIEW")).toBe("content.submit");
        expect(eventForStatusChange("IN_REVIEW", "APPROVED")).toBe("content.approve");
        expect(eventForStatusChange("APPROVED", "SCHEDULED")).toBe("content.schedule");
        expect(eventForStatusChange("APPROVED", "PUBLISHED")).toBe("content.publish");
        expect(eventForStatusChange("PUBLISHED", "ARCHIVED")).toBe("content.archive");
    });

    it("tells taking a page offline apart from sending a draft back", () => {
        expect(eventForStatusChange("PUBLISHED", "DRAFT")).toBe("content.unpublish");
        expect(eventForStatusChange("IN_REVIEW", "DRAFT")).toBe("content.edit");
    });
});
