// @vitest-environment jsdom
/// <reference lib="dom" />
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { normConfig, renderBuilder, type BuilderConfig } from "./builder";
import { flowBind, flowCalc } from "./calc-core";
import { everything } from "./builder.fixture";
import { ELEMENTS_JS } from "./js";
import { elementHtml, expandElements } from "./index";
import { tidyRich } from "../tidy";

const mount = (cfg: BuilderConfig) => {
    document.body.innerHTML = `<div class="flow-el flow-el--calculator">${renderBuilder(cfg)}</div>`;
};
/** What a reader sees: the result markup and which fields are hidden, as the DOM serialises them. */
const view = () => ({
    result: document.querySelector(".el-res")!.innerHTML,
    hidden: Array.from(document.querySelectorAll("[data-f]")).filter((e) => (e as HTMLElement).hidden).map((e) => e.getAttribute("data-f")),
});
/** First paint from the server for the fixture whose defaults are the given state. */
const paint = (defaults: Record<string, unknown>) => {
    const c = everything();
    for (const f of c.fields) if (f.id in defaults) (f as { default: unknown }).default = defaults[f.id];
    if (defaults.plan) c.plan!.default = String(defaults.plan);
    mount(c);
    return view();
};
const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));
const at = (id: string) => document.querySelector(`[data-f="${id}"]`)!;

describe("builder calculator: server first paint equals what the script computes", () => {
    it("on load, and again after changing every kind of input", () => {
        mount(everything());
        const first = view();
        new Function(ELEMENTS_JS)();
        expect(view()).toEqual(first);

        const n1 = at("n1").querySelector("input")!;
        n1.value = "250";
        fire(n1, "input");
        document.querySelector<HTMLButtonElement>('[data-f="c1"] button[data-v="Premium"]')!.click();
        const c2 = at("c2").querySelector("select")!;
        c2.value = "L2";
        fire(c2, "change");
        const x1 = at("x1").querySelector("input")!;
        x1.checked = true;
        fire(x1, "change");
        const plan = at("plan").querySelector("select")!;
        plan.value = "Quarterly";
        fire(plan, "change");

        const live = view();
        expect(live.hidden).not.toContain("c2");
        const expected = flowCalc(everything(), { n1: 250, c1: "Premium", c2: "L2", x1: true, plan: "Quarterly" });
        expect(document.querySelector(".v")!.textContent).toBe(`$${expected.lo.toLocaleString("en-US")} to $${expected.hi.toLocaleString("en-US")}`);
        expect(live).toEqual(paint({ n1: 250, c1: "Premium", c2: "L2", x1: true, plan: "Quarterly" }));
    });

    it("back to a hidden parent: the hidden field's value is ignored on both sides", () => {
        mount(everything());
        new Function(ELEMENTS_JS)();
        document.querySelector<HTMLButtonElement>('[data-f="c1"] button[data-v="Premium"]')!.click();
        document.querySelector<HTMLButtonElement>('[data-f="c1"] button[data-v="Basic"]')!.click();
        const live = view();
        expect(live.hidden).toContain("c2");
        expect(live).toEqual(paint({ c1: "Basic" }));
    });

    it("a quote option shows the same text on both sides", () => {
        mount(everything());
        new Function(ELEMENTS_JS)();
        document.querySelector<HTMLButtonElement>('[data-f="c1"] button[data-v="Quote"]')!.click();
        const live = view();
        expect(document.querySelector(".v")!.textContent).toBe("Ask for a quote");
        expect(live).toEqual(paint({ c1: "Quote" }));
    });

    it("keeps the breakdown open while the reader types", () => {
        mount(everything());
        new Function(ELEMENTS_JS)();
        document.querySelector("details")!.open = true;
        const n2 = at("n2").querySelector("input")!;
        n2.value = "4";
        fire(n2, "input");
        expect(document.querySelector("details")!.open).toBe(true);
    });

    it("binding with flowBind directly (what Studio does) gives the same result, once", () => {
        mount(everything());
        const box = document.querySelector<HTMLElement>(".flow-el")!;
        expect(flowBind(box, flowCalc)).toBe(true);
        expect(flowBind(box, flowCalc)).toBe(true);
        const n1 = at("n1").querySelector("input")!;
        n1.value = "7";
        fire(n1, "input");
        expect(view()).toEqual(paint({ n1: 7 }));
    });
});

describe("builder calculator: one source of truth", () => {
    it("the public script embeds the exact source of flowCalc and flowBind", () => {
        expect(ELEMENTS_JS).toContain(flowCalc.toString());
        expect(ELEMENTS_JS).toContain(flowBind.toString());
    });

    it("both functions are self-contained: they run in a bare context with no module scope", () => {
        const calc = runInNewContext(`(${flowCalc.toString()})`) as typeof flowCalc;
        const out = calc(everything(), { c1: "Premium", x1: true });
        expect(JSON.parse(JSON.stringify([out.lo, out.hi]))).toEqual([210, 520]);
        expect(runInNewContext(`typeof (${flowBind.toString()})`)).toBe("function");
        expect(flowCalc.toString()).not.toMatch(/__name|cov_|require\(|import\(/);
    });
});

describe("builder calculator: the config survives storage, tidy and delivery", () => {
    const NASTY = `<script>alert(1)</script> "quoted" & 'single' <img src=x onerror=1> x  y — z é中 style="a" </div>`;
    const cfg = () => {
        const c = everything();
        c.title = NASTY;
        c.result.label = NASTY;
        c.fields[2].label = NASTY;
        (c.fields[2] as { options: { label: string }[] }).options[1].label = NASTY;
        c.fields[3].showIf = { field: "c1", in: [NASTY] };
        return c;
    };

    it("stored form, through the tidy pass and public expansion, hands the browser the same config", () => {
        const stored = `<p>Intro</p>${elementHtml("calculator", { preset: "builder", config: cfg() })}<p>After</p>`;
        const tidied = tidyRich(stored).value;
        expect(tidied).toBe(stored);
        const delivered = expandElements(tidied);
        expect(delivered).not.toContain("data-values");
        expect(delivered).not.toMatch(/<script|<img/i);
        document.body.innerHTML = delivered;
        const attr = document.querySelector(".el-calc")!.getAttribute("data-config")!;
        expect(JSON.parse(attr)).toEqual(JSON.parse(JSON.stringify(normConfig(cfg()))));
    });

    it("and the live script runs from that delivered markup", () => {
        document.body.innerHTML = expandElements(elementHtml("calculator", { preset: "builder", config: cfg() }));
        const first = view();
        new Function(ELEMENTS_JS)();
        expect(view()).toEqual(first);
    });
});
