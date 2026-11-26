// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it } from "vitest";
import { calculator } from "./calculator";
import { ELEMENTS_JS } from "./js";

describe("custom calculator parity", () => {
    const custom = () => ({ preset: "custom", title: "House drying cost estimator", rateClean: 3.75, rateGray: 4.5, rateBlack: 7, optLabel: "Option", qtyUnit: "", qtyLabel: "Roof size (sq ft)", qty: 2000, option1Name: "Shingle", option1Rate: 5.5, option2Name: "Metal", option2Rate: 12, low: 0.9, high: 1.3, caption: "Roof estimate", note: "Excludes permits." });

    it("renders the same first result the script computes, and after a change", () => {
        document.body.innerHTML = `<div class="flow-el flow-el--calculator">${calculator.render(custom())}</div>`;
        const res = () => document.querySelector(".el-res .v")!.textContent;
        const first = res();
        new Function(ELEMENTS_JS)();
        expect(res()).toBe(first);
        const a = document.querySelector<HTMLInputElement>('[data-k="a"]')!;
        const s = document.querySelector<HTMLSelectElement>('[data-k="s"]')!;
        a.value = "1234";
        s.selectedIndex = 1;
        s.dispatchEvent(new Event("change", { bubbles: true }));
        // Render with the same inputs as a stored element would: 1234 sq ft at the metal rate.
        const expected = calculator.render({ ...custom(), qty: 1234, option1Name: "Metal", option1Rate: 12, option2Name: "" });
        expect(expected).toContain(`<div class="v">${res()}</div>`);
        expect(document.querySelector(".el-res .el-cap")!.textContent).toBe("Roof estimate");
    });
});
