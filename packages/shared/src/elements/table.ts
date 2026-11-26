import { esc, str } from "./util";
import type { ElementTemplate } from "./index";

export const MIN_ROWS = 2;

const cells = (line: string): string[] => line.split("|").map((c) => c.trim());

const read = (values: unknown) => {
    const v = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
    const cols = cells(typeof v.columns === "string" ? v.columns : "");
    const rows = (typeof v.rows === "string" ? v.rows : "").split("\n").filter((l) => l.trim()).map(cells);
    return { caption: str(v.caption), cols: cols.some(Boolean) ? cols : [], rows };
};

export const table: ElementTemplate = {
    id: "table",
    name: "Table",
    description: "A header row and rows of values.",
    enabled: true,
    fields: [
        { key: "caption", label: "Caption (optional)", type: "text" },
        { key: "columns", label: "Header", type: "text", hint: "Column names separated by | , for example: Service | Typical cost" },
        { key: "rows", label: "Rows", type: "text", long: true, hint: "One row per line, cells separated by |" },
    ],
    defaults: () => ({
        caption: "",
        columns: "Service | Typical cost",
        rows: "Water extraction | $300 - $1,000\nStructural drying (per day) | $200 - $500\nMold remediation | $1,000 - $4,000\nDrywall replacement (per sq ft) | $2 - $4\nContent pack-out | $500 - $2,500",
    }),
    validate(values) {
        const v = read(values);
        const out: string[] = [];
        if (!v.cols.length) out.push("Table needs a header row.");
        if (v.rows.length < MIN_ROWS) out.push(`Table needs at least ${MIN_ROWS} rows (it has ${v.rows.length}).`);
        if (v.cols.length) v.rows.forEach((r, i) => r.length > v.cols.length && out.push(`Row ${i + 1} has more cells than the header has columns.`));
        return out;
    },
    render(values) {
        const v = read(values);
        const head = v.cols.map((c) => `<th>${esc(c)}</th>`).join("");
        const body = v.rows.map((r) => `<tr>${v.cols.map((c, j) => `<td data-label="${esc(c)}">${esc(r[j] ?? "")}</td>`).join("")}</tr>`).join("");
        return `<div class="el-tw"><table class="el-table">${v.caption ? `<caption>${esc(v.caption)}</caption>` : ""}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    },
};
