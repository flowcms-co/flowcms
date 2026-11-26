// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it } from "vitest";
import { calculator } from "./calculator";
import { ELEMENTS_JS } from "./js";

const cfg = {
    title: "T",
    currency: "$",
    base: { low: 0, high: 0 },
    minimum: { low: 0, high: 0 },
    fields: [
        { id: "k", type: "choice", label: "Kind", display: "select", default: "A", options: [{ label: "A", minimum: { low: 100, high: 200 } }, { label: "B", minimum: { low: 300, high: 400 } }, { label: "C", minimum: { low: 500, high: 600 } }] },
    ],
    plan: null,
    result: { label: "Est", breakdown: false },
};

const setup = (style = "modern") => {
    document.head.innerHTML = `<style>:root{--el-style:${style}}</style>`;
    delete (window as any).FlowElements;
    document.body.innerHTML = `<div class="flow-el flow-el--calculator">${calculator.render({ preset: "builder", config: cfg })}</div>`;
    new Function(ELEMENTS_JS)();
    const q = <T extends Element>(s: string) => document.querySelector<T>(s)!;
    return { sel: q<HTMLSelectElement>("select"), btn: q<HTMLButtonElement>(".el-dd-b"), list: q<HTMLElement>(".el-dd-l"), v: () => q(".el-res .v").textContent, rows: () => Array.from(document.querySelectorAll<HTMLElement>(".el-dd-opt")) };
};
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("custom dropdown", () => {
    it("opens and selects with a click, and the result recalculates", () => {
        const { sel, btn, list, rows, v } = setup();
        expect(btn.getAttribute("aria-haspopup")).toBe("listbox");
        expect(list.hidden).toBe(true);
        const first = v();
        btn.click();
        expect(list.hidden).toBe(false);
        expect(btn.getAttribute("aria-expanded")).toBe("true");
        expect(rows()[0].getAttribute("aria-selected")).toBe("true");
        rows()[2].click();
        expect(sel.value).toBe("C");
        expect(list.hidden).toBe(true);
        expect(v()).not.toBe(first);
        expect(btn.textContent).toBe("C");
    });
    it("works from the keyboard and closes on Escape, Tab and outside click", () => {
        const { sel, btn, list, v } = setup();
        key(btn, "ArrowDown");
        expect(list.hidden).toBe(false);
        key(btn, "ArrowDown");
        key(btn, "Enter");
        expect(sel.value).toBe("B");
        expect(list.hidden).toBe(true);
        expect(v()).toContain("300");
        key(btn, " ");
        expect(list.hidden).toBe(false);
        key(btn, "Escape");
        expect(list.hidden).toBe(true);
        expect(sel.value).toBe("B");
        key(btn, "Enter");
        key(btn, "Tab");
        expect(list.hidden).toBe(true);
        btn.click();
        document.body.click();
        expect(list.hidden).toBe(true);
    });
    it("is skipped under the Classic style: the native select stays", () => {
        document.head.innerHTML = "<style>:root{--el-style:classic}</style>";
        delete (window as any).FlowElements;
        document.body.innerHTML = `<div class="flow-el flow-el--calculator">${calculator.render({ preset: "builder", config: cfg })}</div>`;
        new Function(ELEMENTS_JS)();
        expect(document.querySelector(".el-dd")).toBeNull();
        const sel = document.querySelector<HTMLSelectElement>("select")!;
        sel.value = "C";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        expect(document.querySelector(".el-res .v")!.textContent).toContain("500");
    });
});
