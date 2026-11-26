import { describe, expect, it } from "vitest";
import { blankConfig, normConfig, pruneConfig, validateConfig, type BuilderConfig } from "./builder";
import { flowCalc } from "./calc-core";
import { everything } from "./builder.fixture";
import { calculator } from "./calculator";

type Case = { name: string; st: Record<string, unknown>; lo: number; hi: number; hidden?: string[]; shown?: string[]; has?: string[]; not?: string[]; year?: [number, number]; cfg?: (c: BuilderConfig) => void };

// Defaults of the fixture: Area 100 (1 to 2 per unit), Rooms 2 (5 to 10), base 10 to 20 => 120 to 240.
const cases: Case[] = [
    { name: "defaults: base plus number x rate", st: {}, lo: 120, hi: 240, hidden: ["c2", "n3", "x4", "x5"] },
    { name: "number x rate", st: { n1: 200, n2: 0 }, lo: 210, hi: 420 },
    { name: "numbers are whole-dollar rounded", st: { n1: 63.3333, n2: 0 }, lo: 73, hi: 147 },
    { name: "option add", st: { c1: "Flat" }, lo: 220, hi: 440 },
    { name: "option times", st: { c1: "Premium" }, lo: 180, hi: 480 },
    { name: "two multipliers multiply", st: { c1: "Premium", c2: "L2" }, lo: 360, hi: 960 },
    { name: "option rates swap a number field's rate", st: { c1: "Swap" }, lo: 320, hi: 440 },
    { name: "flat addon is not scaled by times", st: { c1: "Premium", x1: true }, lo: 210, hi: 520 },
    { name: "per unit addon is not scaled by times", st: { c1: "Premium", x2: true }, lo: 186, hi: 488 },
    { name: "both addons, times only on the base part", st: { c1: "Premium", x1: true, x2: true }, lo: 216, hi: 528 },
    { name: "option minimum beats the template minimum", st: { c1: "Big min" }, lo: 500, hi: 700, has: ["Minimum charge applied"] },
    { name: "template minimum applies when nothing else does", st: { n1: 0, n2: 0 }, lo: 50, hi: 80, has: ["Minimum charge applied"] },
    { name: "showIf on a choice: shown", st: { c1: "Premium" }, lo: 180, hi: 480, shown: ["c2"] },
    { name: "showIf on a choice: hidden, its value is ignored", st: { c1: "Basic", c2: "L2" }, lo: 120, hi: 240, hidden: ["c2"] },
    { name: "showIf on an addon being ticked: off", st: { x6: false }, lo: 120, hi: 240, hidden: ["n3"] },
    { name: "showIf on an addon being ticked: on", st: { x6: true }, lo: 126, hi: 246, shown: ["n3"] },
    { name: "hidden through a hidden parent", st: { c1: "Basic", x4: "A", x5: true }, lo: 120, hi: 240, hidden: ["c2", "x4", "x5"] },
    { name: "shown when the whole chain is shown", st: { c1: "Premium", c2: "L2", x4: "A", x5: true }, lo: 860, hi: 1460, shown: ["c2", "x4", "x5"], has: ["Compare options"] },
    { name: "chain shown but the last value is not in the list", st: { c1: "Premium", c2: "L2", x4: "B", x5: true }, lo: 360, hi: 960, hidden: ["x5"], not: ["Compare options"] },
    { name: "plan visit replaces the replaced choice's amount; per year is visits x visit", st: { c1: "Flat", plan: "Quarterly" }, lo: 160, hi: 300, year: [640, 1200], has: ["About $640 to $1,200 per year (4 visits, quarterly)", "Plan price applies."] },
    { name: "plan without a visit price changes nothing", st: { c1: "Flat", plan: "Once" }, lo: 220, hi: 440, year: [220, 440] },
    { name: "plan with no replaces: the visit is the whole amount", st: { c1: "Premium", x1: true, plan: "Quarterly" }, lo: 40, hi: 60, year: [160, 240], cfg: (c) => { delete c.plan!.replaces; } },
    { name: "quote shows Ask for a quote and the option note", st: { c1: "Quote" }, lo: 120, hi: 240, has: ['<div class="v">Ask for a quote</div>', "Call us"], not: ["per year"] },
    { name: "an unknown option falls back to the default", st: { c1: "Nope" }, lo: 120, hi: 240 },
    { name: "junk numbers count as zero", st: { n1: "abc", n2: -5 }, lo: 50, hi: 80 },
];

describe("calculator builder: compute", () => {
    it("the test config is valid", () => expect(validateConfig(normConfig(everything()))).toEqual([]));

    it.each(cases)("$name", ({ st, lo, hi, hidden = [], shown = [], has = [], not = [], year, cfg }) => {
        const c = everything();
        cfg?.(c);
        const out = flowCalc(c, st);
        expect([out.lo, out.hi]).toEqual([lo, hi]);
        for (const id of hidden) expect(out.hidden[id]).toBe(true);
        for (const id of shown) expect(out.hidden[id]).toBeUndefined();
        for (const t of has) expect(out.html).toContain(t);
        for (const t of not) expect(out.html).not.toContain(t);
        if (year) expect(out.year).toEqual(year);
        expect(out.lo).toBeLessThanOrEqual(out.hi);
    });

    it("low is never above high across every combination of choices and addons", () => {
        const c = everything();
        for (const k of ["Basic", "Premium", "Flat", "Swap", "Big min", "Quote", "Guess"])
            for (const l of ["L1", "L2"])
                for (const p of ["Once", "Quarterly"])
                    for (const x of [false, true]) {
                        const out = flowCalc(c, { c1: k, c2: l, plan: p, x1: x, x2: x, x4: "A", x5: x, x6: x });
                        expect(out.lo).toBeLessThanOrEqual(out.hi);
                    }
    });

    it("shows the unit, the coverage line, the note, and the breakdown", () => {
        const out = flowCalc({ ...everything(), result: { ...everything().result, unit: "per visit" } }, {});
        expect(out.html).toContain("$120 to $240 per visit");
        expect(out.html).toContain("Coverage line");
        expect(out.html).toContain("Result note");
        expect(out.html).toContain("How this is worked out");
        expect(out.html).toContain("Area: 100 sq ft x $1");
    });

    it("escapes every text it prints", () => {
        const c = everything();
        c.result.label = '<img src=x onerror=1>';
        c.result.note = "<script>1</script>";
        c.currency = "<b>";
        const out = flowCalc(c, {});
        expect(out.html).not.toMatch(/<img|<script|<b>/);
    });

    it("does not throw on junk", () => {
        for (const junk of [{}, { fields: "x" }, { fields: [null, 3, {}] }, { plan: { options: [{}] } }]) expect(() => flowCalc(junk, null)).not.toThrow();
    });
});

describe("calculator builder: validation", () => {
    const bad = (edit: (c: BuilderConfig) => void) => {
        const c = everything();
        edit(c);
        return validateConfig(normConfig(c));
    };
    it("the blank starting config is valid and has no amounts", () => {
        const b = blankConfig();
        expect(validateConfig(b)).toEqual([]);
        expect(flowCalc(b, {}).lo).toBe(0);
        expect(b.fields.map((f) => f.label)).toEqual(["Quantity", "Option", "Extra"]);
        expect(b.result.label).toBe("Estimated cost");
        expect(calculator.defaults()).toEqual({ preset: "builder", config: b });
    });
    it("low must not be above high, anywhere", () => {
        expect(bad((c) => { c.base = { low: 5, high: 1 }; })).toEqual(["Base amount: the low cannot be above the high."]);
        expect(bad((c) => { (c.fields[0] as { rate: unknown }).rate = { low: 9, high: 1 }; })[0]).toMatch(/Area, rate: the low cannot be above the high/);
        expect(bad((c) => { (c.fields[2] as { options: { times?: unknown }[] }).options[1].times = { low: 3, high: 1 }; })[0]).toMatch(/times/);
        expect(bad((c) => { c.plan!.options[1].visit = { low: 9, high: 1 }; })[0]).toMatch(/visit price/);
    });
    it("needs a field, labels and a result label", () => {
        expect(bad((c) => { c.fields = []; })).toContain("Add at least one field.");
        expect(bad((c) => { c.result.label = ""; })).toContain("The result needs a label.");
        expect(bad((c) => { c.fields[0].label = ""; })).toContain("Field 1 needs a label.");
        expect(bad((c) => { (c.fields[2] as { options: { label: string }[] }).options[0].label = ""; }).join()).toMatch(/option 1 needs a label/);
    });
    it("showIf must point at a real field and option", () => {
        expect(bad((c) => { c.fields[3].showIf = { field: "gone", in: ["L1"] }; }).join()).toMatch(/missing or cannot be used/);
        expect(bad((c) => { c.fields[3].showIf = { field: "c3", in: ["L1"] }; }).join()).toMatch(/missing/);
        expect(bad((c) => { c.fields[3].showIf = { field: "c1", in: ["Nope"] }; }).join()).toMatch(/option that does not exist/);
        expect(bad((c) => { c.fields[3].showIf = { field: "c2", in: ["L1"] }; }).join()).toMatch(/missing or cannot be used/); // itself
        expect(bad((c) => { c.fields[3].showIf = { field: "n1", in: ["x"] }; }).join()).toMatch(/cannot be used/);
        expect(bad((c) => { c.fields[3].showIf = { field: "x1", in: ["Ticked"] }; }).join()).toMatch(/ticked or not ticked/);
    });
    it("catches duplicate ids, bad rate swaps and a bad plan", () => {
        expect(bad((c) => { c.fields[1].id = "n1"; }).join()).toMatch(/used twice/);
        expect(bad((c) => { c.plan!.options[0].visitsPerYear = 0; }).join()).toMatch(/visits per year/);
        expect(bad((c) => { c.plan!.replaces = "n1"; }).join()).toMatch(/replaces a choice/);
        expect(bad((c) => { (c.fields[2] as { options: { rates?: unknown }[] }).options[3].rates = { zzz: { low: 1, high: 2 } }; }).join()).toMatch(/rate swap points/);
    });
    it("non-numbers in a pair are reported, not silently zero", () => {
        const c = JSON.parse(JSON.stringify(everything()));
        c.base = { low: "abc", high: 2 };
        expect(validateConfig(normConfig(c))).toEqual(["Base amount: the low and the high must be numbers."]);
    });
    it("pruneConfig drops references to what was removed", () => {
        const c = everything();
        c.fields = c.fields.filter((f) => f.id !== "c2" && f.id !== "n2");
        const p = pruneConfig(c);
        expect(p.fields.find((f) => f.id === "x4")!.showIf).toBeUndefined();
        const per = p.fields.find((f) => f.id === "x2") as { per?: { field: string } };
        expect(per.per!.field).toBe("n1");
        expect(validateConfig(p)).toEqual([]);
    });
    it("pruneConfig resets a default that pointed at a removed option", () => {
        const c = everything();
        (c.fields[2] as { options: { label: string }[] }).options.shift(); // Basic was the default
        c.plan!.options.shift(); // Once was the default
        const p = pruneConfig(c);
        expect((p.fields[2] as { default: string }).default).toBe("Premium");
        expect(p.plan!.default).toBe("Quarterly");
        expect(validateConfig(p)).toEqual([]);
    });
});
