import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { CLASSIC_CSS, DEFAULT_THEME, DEFAULT_THEME_CSS, MODERN_CSS, elementsCss, parseTheme, themeCss, themeOrDefault } from "./index";

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

describe("elements theme font sizes", () => {
    const sized = (k: string, v: unknown) => parseTheme(withField(k, v));
    it("defaults to auto, 16 / 15 / 16 / 17", () => {
        expect(DEFAULT_THEME).toMatchObject({ fontMode: "auto", fontSize: 16, fontSizeMobile: 15, fontSizeTablet: 16, fontSizeDesktop: 17 });
        expect(parseTheme({ ...DEFAULT_THEME, fontMode: undefined, fontSize: undefined }).errors).toEqual([]);
    });
    it("keeps valid sizes and falls to the default for invalid ones, each field on its own", () => {
        for (const k of ["fontSize", "fontSizeMobile", "fontSizeTablet", "fontSizeDesktop"] as const) {
            for (const ok of [12, 18.5, 24]) expect(sized(k, ok).theme[k]).toBe(ok);
            for (const bad of [11, 25, NaN, Infinity, "18", null, "16px;}"]) {
                const r = sized(k, bad);
                expect(r.theme[k], `${k}=${String(bad)}`).toBe(DEFAULT_THEME[k]);
                expect(r.errors).toEqual([]);
            }
        }
    });
    it("unknown mode is auto", () => {
        for (const bad of ["x", "AUTO", 1, null, "custom;}"]) expect(sized("fontMode", bad).theme.fontMode).toBe("auto");
        expect(sized("fontMode", "custom").theme.fontMode).toBe("custom");
    });
    it("auto css emits the clamp and only the single size", () => {
        const css = themeCss({ ...DEFAULT_THEME, fontSize: 18, fontSizeMobile: 13 });
        expect(css).toContain("--el-font-size:18px");
        expect(css).toContain(".flow-el>*{font-size:clamp(");
        expect(css).toContain("cqi");
        expect(css).not.toContain("@container");
        expect(css).not.toContain("13px");
    });
    it("custom css picks by container width and keeps the other values out of the css", () => {
        const css = themeCss({ ...DEFAULT_THEME, fontMode: "custom", fontSize: 22, fontSizeMobile: 13, fontSizeTablet: 15, fontSizeDesktop: 20 });
        expect(css).toContain(".flow-el>*{font-size:13px}");
        expect(css).toContain("@container (min-width:560px){.flow-el>*{font-size:15px}}");
        expect(css).toContain("@container (min-width:960px){.flow-el>*{font-size:20px}}");
        expect(css).not.toContain("22px");
        expect(css).not.toContain("clamp(");
    });
});

describe("elements style", () => {
    it("new and unset workspaces are modern, a stored theme without a style stays classic", () => {
        expect(DEFAULT_THEME.style).toBe("modern");
        expect(themeOrDefault(null).style).toBe("modern");
        const { style: _s, ...legacy } = DEFAULT_THEME;
        const parsed = parseTheme(legacy);
        expect(parsed.errors).toEqual([]);
        expect(parsed.theme.style).toBe("classic");
        expect(themeOrDefault(legacy).style).toBe("classic");
        expect(parseTheme({ ...DEFAULT_THEME, style: "modern" }).theme.style).toBe("modern");
        expect(parseTheme({ ...DEFAULT_THEME, style: "bogus" }).theme.style).toBe("classic");
    });

    it("the sheet follows the style and tells the script which one", () => {
        expect(themeCss(DEFAULT_THEME)).toContain("--el-style:modern");
        const classic = elementsCss(themeCss({ ...DEFAULT_THEME, style: "classic" }));
        expect(classic).toContain("--el-style:classic");
        expect(classic).toContain(CLASSIC_CSS);
        expect(classic).not.toContain(".el-dd-b{");
        expect(elementsCss()).toContain(MODERN_CSS);
        expect(elementsCss()).toContain(".el-dd-b{");
    });

    it("the classic sheet is byte for byte the v2.3.2 sheet", () => {
        expect(createHash("sha256").update(CLASSIC_CSS).digest("hex")).toBe("f117f8a76f5caba9bf55019f76d297e37305dd91630e639609b9cf5465daaa61");
    });

    it("modern restyles cost, steps and table; classic never carries those rules", () => {
        for (const rule of [".flow-el--cost .el-card{", ".flow-el--steps .el-n{", ".flow-el--table .el-tw{"]) {
            expect(MODERN_CSS).toContain(rule);
            expect(CLASSIC_CSS).not.toContain(rule);
        }
    });
});
