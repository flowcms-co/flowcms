import { esc, str } from "./util";
import type { ElementTemplate } from "./index";

export type StepsValues = {
    title: string;
    layout: "horizontal" | "vertical";
    steps: { label: string; time: string; text: string }[];
};

export const MIN_STEPS = 3;
export const MAX_STEPS = 6;

const read = (values: unknown): StepsValues => {
    const v = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
    const rows = Array.isArray(v.steps) ? v.steps : [];
    return {
        title: str(v.title),
        layout: v.layout === "vertical" ? "vertical" : "horizontal",
        steps: rows.map((r) => {
            const s = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
            return { label: str(s.label), time: str(s.time), text: str(s.text) };
        }),
    };
};

export const steps: ElementTemplate = {
    id: "steps",
    name: "Steps Infographic",
    description: "Numbered steps joined by a line, each with a label, time and note.",
    enabled: true,
    fields: [
        { key: "title", label: "Title", type: "text" },
        {
            key: "layout",
            label: "Layout",
            type: "choice",
            options: [
                { value: "horizontal", label: "Horizontal" },
                { value: "vertical", label: "Vertical" },
            ],
        },
        {
            key: "steps",
            label: "Steps",
            type: "rows",
            min: MIN_STEPS,
            max: MAX_STEPS,
            columns: [
                { key: "label", label: "Label" },
                { key: "time", label: "Time (optional)" },
                { key: "text", label: "Description", long: true },
            ],
        },
    ],
    defaults: () => ({
        title: "How a local pro handles it",
        layout: "horizontal",
        steps: [
            { label: "Inspect", time: "Hour 1", text: "Find the source and map the wet areas." },
            { label: "Extract", time: "Hours 1-4", text: "Pull standing water out fast." },
            { label: "Dry", time: "Days 1-4", text: "Dehumidifiers and air movers run until dry." },
            { label: "Restore", time: "Week 1-2", text: "Replace damaged materials and finish." },
        ],
    }),
    validate(values) {
        const v = read(values);
        const out: string[] = [];
        if (v.steps.length < MIN_STEPS) out.push(`Steps needs at least ${MIN_STEPS} steps (it has ${v.steps.length}).`);
        if (v.steps.length > MAX_STEPS) out.push(`Steps allows at most ${MAX_STEPS} steps (it has ${v.steps.length}).`);
        v.steps.forEach((s, i) => {
            if (!s.label) out.push(`Step ${i + 1} needs a label.`);
            if (!s.text) out.push(`Step ${i + 1} needs a description.`);
        });
        return out;
    },
    render(values) {
        const v = read(values);
        const items = v.steps
            .map(
                (s, i) =>
                    `<li><span class="el-n">${i + 1}</span><div><div class="l">${esc(s.label)}</div>${s.time ? `<div class="tm">${esc(s.time)}</div>` : ""}<div class="el-tx">${esc(s.text)}</div></div></li>`,
            )
            .join("");
        const dir = v.layout === "vertical" ? "v" : "h";
        return `<div class="el-steps-card">${v.title ? `<p class="el-title">${esc(v.title)}</p>` : ""}<ol class="el-steps ${dir}">${items}</ol></div>`;
    },
};
