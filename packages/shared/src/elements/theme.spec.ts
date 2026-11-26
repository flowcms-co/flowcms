import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, DEFAULT_THEME_CSS, elementsCss, parseTheme, themeCss, themeOrDefault } from "./index";

const withField = (k: string, v: unknown) => ({ ...DEFAULT_THEME, [k]: v });

describe("elements theme validation", () => {
    it("accepts the default and a full custom theme", () => {
        expect(parseTheme(DEFAULT_THEME).errors).toEqual([]);
        const custom = { ...DEFAULT_THEME, accent: "#f3462a", radius: 0, font: "Merriweather" };
        expect(parseTheme(custom)).toEqual({ theme: custom, errors: [] });
    });

    it("rejects CSS injection and non-hex colours", () => {
        for (const bad of ["#fff;}body{display:none", "red", "#fff", "#12345G", "#1234567", "rgb(0,0,0)", "url(x)", "#123456;", 123, null, ""]) {
            for (const key of ["accent", "accentHover", "text", "muted", "border", "panel", "surface", "rule"]) {
                expect(parseTheme(withField(key, bad)).errors.length, `${key}=${String(bad)}`).toBeGreaterThan(0);
            }
        }
    });

    it("rejects an out-of-range or non-numeric radius", () => {
        for (const bad of [-1, 33, NaN, Infinity, "12", "12px;}", null]) expect(parseTheme(withField("radius", bad)).errors.length, String(bad)).toBeGreaterThan(0);
        expect(parseTheme(withField("radius", 32)).errors).toEqual([]);
    });

    it("rejects an unknown font and unknown fields, accepts inherit", () => {
        for (const bad of ["Comic Sans", "Inter, serif;}", "inherit;", "", 5]) expect(parseTheme(withField("font", bad)).errors.length, String(bad)).toBeGreaterThan(0);
        expect(parseTheme(withField("font", "inherit")).errors).toEqual([]);
        expect(parseTheme({ ...DEFAULT_THEME, extra: "x" }).errors.length).toBe(1);
        expect(parseTheme(null).errors.length).toBeGreaterThan(0);
    });

    it("a stored value that is not valid falls back to the default", () => {
        expect(themeOrDefault({ accent: "red" })).toEqual(DEFAULT_THEME);
        expect(themeOrDefault(null)).toEqual(DEFAULT_THEME);
    });
});

describe("elements theme css", () => {
    it("inherit sets font-family inherit and no import", () => {
        const css = themeCss(DEFAULT_THEME);
        expect(css).toContain("--el-font:inherit");
        expect(css).not.toContain("@import");
        expect(DEFAULT_THEME_CSS).toBe(css);
    });

    it("a listed font imports only that family, first in the sheet", () => {
        const css = elementsCss(themeCss({ ...DEFAULT_THEME, font: "Source Serif 4", accent: "#F3462A", radius: 20 }));
        expect(css.startsWith('@import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:')).toBe(true);
        expect(css.match(/@import/g)).toHaveLength(1);
        expect(css).toContain("--el-accent:#F3462A");
        expect(css).toContain("--el-radius:20px");
        expect(css).toContain("--el-font:'Source Serif 4',serif");
    });
});
