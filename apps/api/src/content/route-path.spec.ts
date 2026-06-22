import { describe, it, expect } from "vitest";
import { entryPath, entryUrl, isHomeType, routePrefixForType } from "./route-path";

describe("route-path", () => {
    it("derives the prefix from the type's apiId (the URL segment the user named)", () => {
        expect(routePrefixForType({ apiId: "services", pluralApiId: "servicess" })).toBe("services");
        expect(routePrefixForType({ apiId: "blogs", pluralApiId: "blogss" })).toBe("blogs");
        expect(routePrefixForType({ apiId: "resources", pluralApiId: "resourcess" })).toBe("resources");
        // Underscores in an apiId become hyphens in the URL.
        expect(routePrefixForType({ apiId: "case_studies" })).toBe("case-studies");
    });

    it("treats home/homepage types as the site root", () => {
        for (const id of ["home", "homepage", "index", "root", "frontpage"]) {
            expect(isHomeType({ apiId: id, pluralApiId: `${id}s` })).toBe(true);
            expect(routePrefixForType({ apiId: id, pluralApiId: `${id}s` })).toBe("");
        }
        expect(isHomeType({ apiId: "services" })).toBe(false);
        // "landing" is NOT a homepage word: a Landing Page collection routes normally.
        expect(isHomeType({ apiId: "landing" })).toBe(false);
        expect(entryPath({ apiId: "landing" }, "spring-promo")).toBe("/landing/spring-promo");
    });

    it("builds the entry path from the prefix + slug", () => {
        expect(entryPath({ apiId: "services" }, "water-damage")).toBe("/services/water-damage");
        expect(entryPath({ apiId: "blogs" }, "spring-tips")).toBe("/blogs/spring-tips");
    });

    it("ignores the slug for a homepage type", () => {
        expect(entryPath({ apiId: "homepage" }, "whatever")).toBe("/");
        expect(entryPath({ apiId: "home" }, null)).toBe("/");
    });

    it("falls back to /<slug> when there is no resolvable prefix", () => {
        expect(entryPath({ apiId: "", pluralApiId: "" }, "lonely")).toBe("/lonely");
        expect(entryPath({ apiId: "", pluralApiId: "" }, null)).toBe("/");
    });

    it("joins a base URL, trimming trailing slashes", () => {
        expect(entryUrl("https://example.com/", { apiId: "services" }, "water-damage")).toBe("https://example.com/services/water-damage");
        expect(entryUrl("https://example.com", { apiId: "home" }, "x")).toBe("https://example.com");
    });

    describe("page types (schema.pageType)", () => {
        it("static types route at root-level slugs with no prefix", () => {
            const t = { apiId: "pages", schema: { pageType: "static" } };
            expect(routePrefixForType(t)).toBe("");
            expect(isHomeType(t)).toBe(false);
            expect(entryPath(t, "about-us")).toBe("/about-us");
            expect(entryPath(t, "legal")).toBe("/legal");
        });

        it("home page type is the slug-less root", () => {
            const t = { apiId: "landing", schema: { pageType: "home" } };
            expect(isHomeType(t)).toBe(true);
            expect(entryPath(t, "ignored")).toBe("/");
        });

        it("blog / service types are prefixed collections", () => {
            expect(entryPath({ apiId: "blog", schema: { pageType: "blog" } }, "spring-tips")).toBe("/blog/spring-tips");
            expect(entryPath({ apiId: "services", schema: { pageType: "service" } }, "water-damage")).toBe("/services/water-damage");
        });

        it("an explicit page type overrides home-name heuristics", () => {
            // A type named "home" but explicitly a blog stays a prefixed collection.
            const t = { apiId: "home", schema: { pageType: "blog" } };
            expect(isHomeType(t)).toBe(false);
            expect(entryPath(t, "post")).toBe("/home/post");
        });

        it("reads the page type from a pageType column too", () => {
            expect(entryPath({ apiId: "pages", pageType: "static" }, "about-us")).toBe("/about-us");
            expect(isHomeType({ apiId: "x", pageType: "home" })).toBe(true);
        });
    });
});
