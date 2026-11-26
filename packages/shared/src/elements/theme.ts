/**
 * The Elements theme: one per workspace. Values are written straight into CSS, so everything
 * goes through `parseTheme` (strict) and `themeCss` only ever sees a parsed theme.
 */
export const THEME_COLOR_KEYS = ["accent", "accentHover", "text", "muted", "border", "panel", "surface", "rule"] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

/** Fixed web font list: name, CSS fallback stack, Google Fonts weights. "inherit" is not in it. */
export const ELEMENT_FONTS: { name: string; stack: string; weights: string }[] = [
    { name: "Inter", stack: "sans-serif", weights: "400;600;700;800" },
    { name: "Roboto", stack: "sans-serif", weights: "400;500;700;900" },
    { name: "Open Sans", stack: "sans-serif", weights: "400;600;700;800" },
    { name: "Lato", stack: "sans-serif", weights: "400;700;900" },
    { name: "Poppins", stack: "sans-serif", weights: "400;600;700;800" },
    { name: "Merriweather", stack: "serif", weights: "400;700;900" },
    { name: "Source Serif 4", stack: "serif", weights: "400;600;700;800" },
];

export type ElementsTheme = Record<ThemeColorKey, string> & { radius: number; font: string };

export const DEFAULT_THEME: ElementsTheme = {
    accent: "#6C5CE7",
    accentHover: "#5A4BD4",
    text: "#1A1A2E",
    muted: "#6A6A85",
    border: "#ECEAF5",
    panel: "#F5F3FF",
    surface: "#FFFFFF",
    rule: "#D4D4D8",
    radius: 12,
    font: "inherit",
};

export const THEME_LABELS: Record<ThemeColorKey, string> = {
    accent: "Accent",
    accentHover: "Accent hover",
    text: "Text",
    muted: "Muted text",
    border: "Border",
    panel: "Panel",
    surface: "Surface",
    rule: "Table divider",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Strict check of a whole theme. Returns the clean theme or the problems; a partial or unknown
 * key is a problem. Nothing outside a 6-digit hex, a 0 to 32 number and a listed font gets through.
 */
export function parseTheme(input: unknown): { theme: ElementsTheme; errors: string[] } {
    const errors: string[] = [];
    const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    if (src !== input) errors.push("The theme must be an object.");
    const theme: ElementsTheme = { ...DEFAULT_THEME };
    for (const k of THEME_COLOR_KEYS) {
        const v = src[k];
        if (typeof v === "string" && HEX.test(v)) theme[k] = v;
        else errors.push(`${THEME_LABELS[k]} must be a 6-digit hex colour like #6C5CE7.`);
    }
    const r = src.radius;
    if (typeof r === "number" && Number.isFinite(r) && r >= 0 && r <= 32) theme.radius = r;
    else errors.push("Radius must be a number from 0 to 32.");
    const f = src.font;
    if (f === "inherit" || (typeof f === "string" && ELEMENT_FONTS.some((x) => x.name === f))) theme.font = f as string;
    else errors.push("Font must be \"inherit\" or one from the list.");
    for (const k of Object.keys(src)) if (!(k in DEFAULT_THEME)) errors.push(`Unknown theme field “${k.slice(0, 40).replace(/[^\w ]/g, "")}”.`);
    return { theme, errors };
}

/** A stored value read back: anything invalid or missing falls to the default, never half applied. */
export const themeOrDefault = (stored: unknown): ElementsTheme => {
    const { theme, errors } = parseTheme(stored);
    return errors.length ? DEFAULT_THEME : theme;
};

const fontEntry = (font: string) => ELEMENT_FONTS.find((f) => f.name === font);

/** The theme as CSS: an @import for the one chosen web font (first, as CSS needs), then the variables on :root. */
export function themeCss(t: ElementsTheme): string {
    const f = fontEntry(t.font);
    const imp = f ? `@import url("https://fonts.googleapis.com/css2?family=${f.name.replace(/ /g, "+")}:wght@${f.weights}&display=swap");\n` : "";
    const font = f ? `'${f.name}',${f.stack}` : "inherit";
    return `${imp}:root{--el-accent:${t.accent};--el-accent-hover:${t.accentHover};--el-text:${t.text};--el-muted:${t.muted};--el-border:${t.border};--el-panel:${t.panel};--el-surface:${t.surface};--el-rule:${t.rule};--el-radius:${t.radius}px;--el-font:${font}}`;
}
