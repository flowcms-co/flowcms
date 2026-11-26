import type { BuilderConfig } from "./builder";

/** A test calculator that uses every feature, with small round numbers so results can be worked out by hand. Not a template. */
export const everything = (): BuilderConfig => ({
    title: "Test calculator",
    intro: "Intro text",
    currency: "$",
    base: { low: 10, high: 20 },
    minimum: { low: 50, high: 80 },
    fields: [
        { id: "n1", type: "number", label: "Area", unit: "sq ft", min: 0, max: 1000, step: 1, default: 100, rate: { low: 1, high: 2 } },
        { id: "n2", type: "number", label: "Rooms", unit: "rooms", min: 0, max: 20, step: 1, default: 2, rate: { low: 5, high: 10 } },
        {
            id: "c1", type: "choice", label: "Kind", display: "buttons", default: "Basic",
            options: [
                { label: "Basic" },
                { label: "Premium", times: { low: 1.5, high: 2 } },
                { label: "Flat", add: { low: 100, high: 200 } },
                { label: "Swap", rates: { n1: { low: 3, high: 4 } } },
                { label: "Big min", minimum: { low: 500, high: 700 } },
                { label: "Quote", quote: true, note: "Call us" },
                { label: "Guess", est: true },
            ],
        },
        { id: "c2", type: "choice", label: "Level", display: "select", default: "L1", showIf: { field: "c1", in: ["Premium", "Flat"] }, options: [{ label: "L1" }, { label: "L2", times: { low: 2, high: 2 } }] },
        { id: "x1", type: "addon", label: "Extra", default: false, add: { low: 30, high: 40 } },
        { id: "x2", type: "addon", label: "Per room", default: false, per: { field: "n2", rate: { low: 3, high: 4 } } },
        { id: "x6", type: "addon", label: "Cracks", default: false, add: { low: 0, high: 0 } },
        { id: "n3", type: "number", label: "Crack count", unit: "cracks", min: 0, max: 50, step: 1, default: 3, rate: { low: 2, high: 2 }, showIf: { field: "x6", in: [true] } },
        { id: "x4", type: "choice", label: "Tier", display: "buttons", default: "A", showIf: { field: "c2", in: ["L2"] }, options: [{ label: "A" }, { label: "B" }] },
        { id: "x5", type: "addon", label: "Deep clean", default: false, add: { low: 500, high: 500 }, showIf: { field: "x4", in: ["A"] } },
    ],
    plan: {
        label: "Plan", default: "Once", replaces: "c1", note: "Plan price applies.",
        options: [{ label: "Once", visitsPerYear: 1 }, { label: "Quarterly", visitsPerYear: 4, visit: { low: 40, high: 60 } }],
    },
    result: { label: "Estimated cost", unit: "total", showYearly: true, breakdown: true, note: "Result note", coverage: "Coverage line", advice: [{ over: 1000, text: "Compare options" }] },
});
