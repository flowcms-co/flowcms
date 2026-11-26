import { describe, expect, it } from "vitest";
import { elementHtml, elementProblems, elementTemplate, expandElements, storedElements } from "./index";
import { steps } from "./steps";
import { cost } from "./cost";
import { table } from "./table";
import { calculator } from "./calculator";
import { ELEMENTS_JS } from "./js";

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

    it("all four templates are available", () => {
        for (const id of ["steps", "cost", "table", "calculator"]) expect(elementTemplate(id)?.enabled).toBe(true);
    });
});

const clean = (html: string) => {
    expect(html).not.toMatch(/<script|<img/i);
    expect(html).toContain("&lt;script&gt;");
};

describe("cost", () => {
    const base = () => cost.defaults() as Record<string, unknown>;

    it("escapes every text field", () => {
        const html = cost.render({ ...base(), title: NASTY, location: NASTY, note: NASTY });
        clean(html);
        expect(html.split("&lt;script&gt;").length - 1).toBe(4); // title, location (twice), note
    });

    it("validates each rule", () => {
        expect(cost.validate(base())).toEqual([]);
        expect(cost.validate({ ...base(), low: 5000 })).toEqual(["Low end cannot be above the average."]);
        expect(cost.validate({ ...base(), avg: 7000 })).toEqual(["Average cannot be above the high end."]);
        expect(cost.validate({ ...base(), min: 2000 })).toEqual(["Bar minimum cannot be above the low end."]);
        expect(cost.validate({ ...base(), max: 5000 })).toEqual(["High end cannot be above the bar maximum."]);
        expect(cost.validate({ ...base(), low: "abc" })).toEqual(["Low end must be a number."]);
    });

    it("shows the data note only when filled", () => {
        expect(cost.render(base())).not.toContain("How we get this data");
        expect(cost.render({ ...base(), note: "Survey of 120 jobs" })).toContain("How we get this data");
        expect(cost.render({ ...base(), note: "   " })).not.toContain("<details");
    });

    it("bar positions are numbers only, even for hostile strings", () => {
        const hostile = '12%;background:url(//evil)"><script>';
        const html = cost.render({ ...base(), low: hostile, avg: hostile, high: hostile, min: hostile, max: hostile });
        const style = /class="el-bar" style="([^"]*)"/.exec(html)![1];
        expect(style).toMatch(/^--p-low:\d+(\.\d+)?%;--p-high:\d+(\.\d+)?%;--p-avg:\d+(\.\d+)?%$/);
        expect(html).not.toMatch(/evil|<script/);
        const ok = /--p-low:([\d.]+)%;--p-high:([\d.]+)%;--p-avg:([\d.]+)%/.exec(cost.render(base()))!;
        expect(ok.slice(1).map(Number)).toEqual([6.87, 39.52, 20.62]);
    });

    it("has no call to action button", () => expect(cost.render(base())).not.toMatch(/<a |<button/));
});

describe("table", () => {
    const base = () => table.defaults() as Record<string, unknown>;

    it("escapes every text field", () => {
        const html = table.render({ caption: NASTY, columns: `${NASTY} | B`, rows: `${NASTY} | ${NASTY}\nx | y` });
        clean(html);
        // caption, header, 2 data-label attributes, 2 cells in row one
        expect(html.split("&lt;script&gt;").length - 1).toBe(6);
    });

    it("needs a header and two rows", () => {
        expect(table.validate(base())).toEqual([]);
        expect(table.validate({ ...base(), columns: " | " })).toEqual(["Table needs a header row."]);
        expect(table.validate({ ...base(), rows: "a | b" })).toEqual(["Table needs at least 2 rows (it has 1)."]);
        expect(table.validate({ ...base(), rows: "a | b | c\nd | e" })).toEqual(["Row 1 has more cells than the header has columns."]);
    });

    it("labels each cell with its column, for the stacked layout", () => {
        expect(table.render(base())).toContain('<td data-label="Typical cost">$300 - $1,000</td>');
    });
});

describe("calculator", () => {
    const base = () => calculator.defaults() as Record<string, unknown>;

    it("escapes the title", () => clean(calculator.render({ ...base(), title: NASTY })));

    it("needs positive drying rates, the insurance preset needs none", () => {
        expect(calculator.validate(base())).toEqual([]);
        expect(calculator.validate({ ...base(), rateGray: 0 })).toEqual(["The gray water rate must be a number above zero."]);
        expect(calculator.validate({ ...base(), rateBlack: "x" })).toEqual(["The black water rate must be a number above zero."]);
        expect(calculator.validate({ ...base(), preset: "insurance-out-of-pocket", rateGray: 0 })).toEqual([]);
    });

    it("renders readable static markup with the values as data attributes", () => {
        const html = calculator.render(base());
        expect(html).toContain('data-preset="drying" data-rate-clean="3.75" data-rate-gray="4.5" data-rate-black="7"');
        expect(html).toContain("$2,400 - $3,750"); // 800 sq ft x 3.75 x 0.8 and x 1.25
        const ins = calculator.render({ ...base(), preset: "insurance-out-of-pocket" });
        expect(ins).toContain('data-preset="insurance"');
        expect(ins).toContain('<div class="v">$1,000</div>');
    });

    it("hostile rates never reach an attribute", () => {
        const html = calculator.render({ ...base(), rateClean: '1" onmouseover="x', rateGray: "<b>", rateBlack: NaN });
        expect(html).toContain('data-rate-clean="0" data-rate-gray="0" data-rate-black="0"');
    });
});

describe("elements.js", () => {
    it("is plain script with the init entry point", () => {
        expect(ELEMENTS_JS).toContain("window");
        expect(ELEMENTS_JS).toContain("FlowElements");
        expect(() => new Function(ELEMENTS_JS)).not.toThrow();
        expect(ELEMENTS_JS).not.toMatch(/innerHTML/);
    });
});
