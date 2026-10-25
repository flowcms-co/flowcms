import { describe, expect, it } from "vitest";
import { safeHtml } from "./safeHtml";

describe("safeHtml", () => {
    it("drops event handlers and scripts", () => {
        const out = safeHtml('<p>Hi</p><img src="x" onerror="alert(1)"><script>alert(2)</script>');
        expect(out).not.toMatch(/onerror|<script|alert/);
        expect(out).toContain('<img src="x">');
        expect(out).toContain("<p>Hi</p>");
    });

    it("drops javascript: links and srcdoc, keeps normal links and embeds", () => {
        const out = safeHtml('<a href="javascript:alert(1)">a</a><a href="/x" target="_blank">b</a><iframe src="https://www.youtube.com/embed/1" srcdoc="<script>1</script>"></iframe>');
        expect(out).not.toMatch(/javascript:|srcdoc/);
        expect(out).toContain('<a href="/x" target="_blank">b</a>');
        expect(out).toContain('<iframe src="https://www.youtube.com/embed/1"></iframe>');
    });
});
