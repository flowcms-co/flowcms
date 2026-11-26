import { describe, expect, it } from "vitest";
import { elementHtml, elementProblems, elementTemplate, expandElements, storedElements } from "./index";
import { steps } from "./steps";

const NASTY = `<script>alert(1)</script> "quoted" & 'single' <img src=x onerror=1>`;
const good = () => steps.defaults();

describe("steps render", () => {
    it("escapes script, quotes and ampersands in every field", () => {
        const html = steps.render({ title: NASTY, layout: "horizontal", steps: [1, 2, 3].map(() => ({ label: NASTY, time: NASTY, text: NASTY })) });
        expect(html).not.toMatch(/<script|<img/i);
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot; &amp; &#39;single&#39;");
        // Three steps, each with label, time and text, plus the title: 10 escaped copies.
        expect(html.split("&lt;script&gt;").length - 1).toBe(10);
    });

    it("draws both layouts and numbers the steps", () => {
        expect(steps.render({ ...good(), layout: "vertical" })).toContain('class="el-steps v"');
        const h = steps.render(good());
        expect(h).toContain('class="el-steps h"');
        expect(h).toContain('<span class="el-n">4</span>');
    });

    it("does not break on garbage values", () => {
        expect(() => steps.render(null)).not.toThrow();
        expect(() => steps.render({ steps: "x" })).not.toThrow();
    });
});

describe("steps validate", () => {
    it("accepts the defaults", () => expect(steps.validate(good())).toEqual([]));

    it("needs 3 to 6 steps", () => {
        const base = good() as { steps: unknown[] };
        expect(steps.validate({ ...base, steps: base.steps.slice(0, 2) })[0]).toMatch(/at least 3/);
        expect(steps.validate({ ...base, steps: [...base.steps, ...base.steps] })[0]).toMatch(/at most 6/);
    });

    it("needs a label and a description on each step, time is optional", () => {
        const base = good() as { steps: { label: string; time: string; text: string }[] };
        const rows = [{ label: "", time: "", text: "ok" }, { label: "ok", time: "", text: "  " }, base.steps[0]];
        expect(steps.validate({ ...base, steps: rows })).toEqual(["Step 1 needs a label.", "Step 2 needs a description."]);
    });
});

describe("stored form and delivery", () => {
    const stored = elementHtml("steps", { ...good(), title: NASTY });

    it("round trips values, whatever the title holds", () => {
        // Nothing inside the attribute can be read as markup: no angle brackets, ampersands or apostrophes.
        const attr = /data-values="([^"]*)"/.exec(stored)![1];
        expect(attr).not.toMatch(/[<>']/);
        expect(attr.replace(/&quot;/g, "")).not.toMatch(/&/);
        expect(storedElements(`<p>a</p>${stored}<p>b</p>`)).toEqual([{ template: "steps", values: { ...good(), title: NASTY } }]);
    });

    it("expands to finished html and leaves other markup alone", () => {
        const out = expandElements(`<h2>Hi</h2>${stored}<p>after</p>`);
        expect(out).toContain('<div class="flow-el flow-el--steps" data-flow-element="steps">');
        expect(out).not.toContain("data-values");
        expect(out).not.toContain("<script");
        expect(out.startsWith("<h2>Hi</h2>")).toBe(true);
        expect(out.endsWith("<p>after</p>")).toBe(true);
    });

    it("also reads what a browser serialiser writes (entity escaped quotes and ampersands)", () => {
        const browser = '<div data-flow-element="steps" data-values="{&quot;title&quot;:&quot;A &amp; B&quot;,&quot;layout&quot;:&quot;vertical&quot;,&quot;steps&quot;:[]}"></div>';
        expect(expandElements(browser)).toContain("A &amp; B");
        expect(expandElements(browser)).toContain("el-steps v");
    });

    it("drops an element it cannot read or does not know", () => {
        expect(expandElements('<p>x</p><div data-flow-element="steps" data-values="{broken"></div>')).toBe("<p>x</p>");
        expect(expandElements('<div data-flow-element="nope" data-values="{}"></div>')).toBe("");
    });

    it("reports problems per element and names the template", () => {
        expect(elementProblems(`<p>x</p>${elementHtml("steps", good())}`)).toEqual([]);
        const bad = elementProblems(elementHtml("steps", { title: "t", layout: "horizontal", steps: [] }));
        expect(bad).toEqual(["Steps Infographic: Steps needs at least 3 steps (it has 0)."]);
        expect(elementProblems('<div data-flow-element="steps" data-values="{x"></div>')[0]).toMatch(/could not be read/);
    });

    it("lists the other three templates as not available yet", () => {
        expect(elementTemplate("steps")?.enabled).toBe(true);
        expect(elementTemplate("cost")).toBeUndefined();
    });
});
