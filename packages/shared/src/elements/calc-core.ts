/**
 * The one calculator engine. `flowCalc` (the maths and the result markup) and `flowBind` (reads
 * the inputs, applies the result) are used three ways from this single definition:
 *   - the server render for first paint (builder.ts),
 *   - the public script, which embeds their source text (js.ts: `fn.toString()`),
 *   - the Studio preview, which imports them directly.
 *
 * Because the source text is shipped to the browser, both functions MUST be self-contained:
 * no imports, no module-level helpers, no references to anything outside their own body.
 * A spec evaluates them in a bare scope to keep that true. The types are `any` on purpose:
 * the config is normalised by builder.ts before it gets here, and this code still tolerates junk.
 *
 * Formula, run once for low and once for high:
 *   (base + sum(number x rate) + sum(option add)) x product(option times) + sum(addons)
 * then the template minimum or the highest option minimum, whichever is higher. Multipliers
 * never scale addons. A plan option with a visit price replaces the amount of the choice named in
 * `plan.replaces`; with no `replaces` it replaces the whole per-visit amount. Per year is visits x visit.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function flowCalc(cfg: any, st: any): any {
    st = st || {};
    const cur = String(cfg.currency == null ? "$" : cfg.currency);
    const esc = (s: any) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const n0 = (x: any) => {
        x = Number(x);
        return isFinite(x) && x > 0 ? x : 0;
    };
    const pv = (p: any, k: string, d: number) => (p && typeof p[k] === "number" && isFinite(p[k]) ? p[k] : d);
    const money = (x: number) => cur + Math.round(x).toLocaleString("en-US");
    const range = (a: number, b: number) => (money(a) === money(b) ? money(a) : money(a) + " to " + money(b));
    const fields: any[] = Array.isArray(cfg.fields) ? cfg.fields.filter((f: any) => f && typeof f === "object") : [];
    const byId: any = {};
    fields.forEach((f) => {
        byId[f.id] = f;
    });

    // The state every field resolves to: what was passed, or its default.
    const S: any = {};
    fields.forEach((f) => {
        let v = st[f.id];
        if (f.type === "choice") {
            const opts: any[] = f.options || [];
            if (!opts.some((o) => o.label === v)) v = opts.some((o) => o.label === f.default) ? f.default : opts.length ? opts[0].label : "";
        } else if (f.type === "addon") v = v === undefined ? !!f.default : !!v;
        else v = v === undefined ? n0(f.default) : n0(v);
        S[f.id] = v;
    });
    const plan = cfg.plan && Array.isArray(cfg.plan.options) && cfg.plan.options.length ? cfg.plan : null;
    if (plan) S.plan = plan.options.some((o: any) => o.label === st.plan) ? st.plan : plan.options.some((o: any) => o.label === plan.default) ? plan.default : plan.options[0].label;

    // Shown only when its parent is shown and holds one of the listed values (checked-ness for an addon).
    const vis = (f: any, depth: number): boolean => {
        if (!f.showIf) return true;
        const p = byId[f.showIf.field];
        if (!p) return true;
        if (depth > 20) return false;
        return vis(p, depth + 1) && (f.showIf.in || []).indexOf(S[p.id]) >= 0;
    };
    const hidden: any = {};
    const shown = fields.filter((f) => {
        const ok = vis(f, 0);
        if (!ok) hidden[f.id] = true;
        return ok;
    });
    const pl = plan && vis(plan, 0) ? plan.options.find((o: any) => o.label === S.plan) : null;
    if (plan && !pl) hidden.plan = true;
    const choices = shown.filter((f) => f.type === "choice" && f.options && f.options.length).map((f) => ({ f, o: f.options.find((o: any) => o.label === S[f.id]) }));
    const visitOnly = !!(pl && pl.visit && !plan.replaces);

    const lines: any[] = [];
    const res: any = {};
    const mn: any = {};
    const hit: any = {};
    ["low", "high"].forEach((k) => {
        let i = 0;
        const L = (label: string, v: number, mul?: boolean) => {
            if (!lines[i]) lines[i] = { label, mul: !!mul };
            lines[i][k] = v;
            i++;
        };
        let sum = pv(cfg.base, k, 0);
        L("Base fee", sum);
        shown.forEach((f) => {
            if (f.type !== "number") return;
            let rate = f.rate;
            choices.forEach((c) => {
                if (c.o.rates && c.o.rates[f.id]) rate = c.o.rates[f.id];
            });
            const q = S[f.id];
            const v = q * pv(rate, k, 0);
            sum += v;
            L(f.label + ": " + q + (f.unit ? " " + f.unit : "") + " x " + cur + Math.round(pv(rate, k, 0) * 100) / 100, v);
        });
        choices.forEach((c) => {
            if (!c.o.add || (pl && pl.visit && c.f.id === plan.replaces)) return;
            sum += pv(c.o.add, k, 0);
            L(c.f.label + ": " + c.o.label, pv(c.o.add, k, 0));
        });
        if (pl && pl.visit && !visitOnly) {
            sum += pv(pl.visit, k, 0);
            L("Plan price per visit", pv(pl.visit, k, 0));
        }
        let t = sum;
        choices.forEach((c) => {
            if (!c.o.times) return;
            t *= pv(c.o.times, k, 1);
            L(c.f.label + ": " + c.o.label, pv(c.o.times, k, 1), true);
        });
        shown.forEach((f) => {
            if (f.type !== "addon" || !S[f.id]) return;
            let v = 0;
            if (f.per) v = (byId[f.per.field] && !hidden[f.per.field] ? S[f.per.field] || 0 : 0) * pv(f.per.rate, k, 0);
            else if (f.add) v = pv(f.add, k, 0);
            t += v;
            L(f.label, v);
        });
        if (visitOnly) {
            t = pv(pl.visit, k, 0);
            L("Plan price per visit", t);
        }
        let m = pv(cfg.minimum, k, 0);
        if (!visitOnly)
            choices.forEach((c) => {
                if (c.o.minimum) m = Math.max(m, pv(c.o.minimum, k, 0));
            });
        else m = 0;
        mn[k] = m;
        hit[k] = t < m;
        res[k] = Math.max(t, m);
    });
    if (hit.low || hit.high) lines.push({ label: "Minimum charge applied", mul: false, low: mn.low, high: mn.high });

    const lo = Math.round(Math.min(res.low, res.high));
    const hi = Math.round(Math.max(res.low, res.high));
    const quote = choices.some((c) => c.o.quote);
    const notes: string[] = choices.map((c) => c.o.note).filter((x: any) => x);
    const r = cfg.result || {};
    let year: number[] | null = null;
    let visits = 1;
    if (pl) {
        visits = pl.visitsPerYear > 0 ? pl.visitsPerYear : 1;
        year = [lo * visits, hi * visits];
        if (pl.visit && plan.note) notes.push(plan.note);
    }
    const parts: string[] = [];
    parts.push('<p class="el-cap">' + esc(r.label || "Estimate") + "</p>");
    parts.push('<div class="v">' + (quote ? "Ask for a quote" : esc(range(lo, hi) + (r.unit === "per visit" ? " per visit" : ""))) + "</div>");
    if (year && r.showYearly && !quote) parts.push('<p class="el-note">' + esc("About " + range(year[0], year[1]) + " per year (" + visits + " visit" + (visits > 1 ? "s" : "") + ", " + String(pl.label).toLowerCase() + ").") + "</p>");
    notes.forEach((x) => parts.push('<p class="el-note">' + esc(x) + "</p>"));
    if (r.coverage) parts.push('<p class="el-note">' + esc(r.coverage) + "</p>");
    if (r.note) parts.push('<p class="el-note">' + esc(r.note) + "</p>");
    (Array.isArray(r.advice) ? r.advice : []).forEach((a: any) => {
        if (hi > n0(a.over) && a.text) parts.push('<p class="el-note el-adv">' + esc(a.text) + "</p>");
    });
    if (r.breakdown) {
        const rows = lines
            .map((l) => "<tr><td>" + esc(l.label) + "</td><td>" + (l.mul ? (l.low === l.high ? "x" + l.low : "x" + l.low + " to x" + l.high) : esc(range(l.low, l.high))) + "</td></tr>")
            .join("");
        parts.push('<details class="el-det"><summary>How this is worked out</summary><table class="el-bd"><tbody>' + rows + "</tbody></table></details>");
    }
    return { lo, hi, quote, year, visits, hidden, st: S, html: parts.join("") };
}

/**
 * Make one rendered builder calculator live: read the inputs, run `calc` (flowCalc is passed in so this
 * function stays self-contained), show or hide fields and write the result. Safe to call twice on one box.
 * The result markup comes from flowCalc, which escapes every value, so setting it as html is safe.
 * Returns false when the box holds no builder calculator.
 */
export function flowBind(box: any, calc: any): boolean {
    const el = box.querySelector('.el-calc[data-preset="builder"]');
    if (!el) return false;
    if (el.getAttribute("data-bound")) return true;
    el.setAttribute("data-bound", "1");
    let cfg: any;
    try {
        cfg = JSON.parse(el.getAttribute("data-config") || "");
    } catch {
        return true;
    }
    const res = el.querySelector(".el-res");
    const read = () => {
        const st: any = {};
        el.querySelectorAll("[data-f]").forEach((w: any) => {
            const id = w.getAttribute("data-f");
            const t = w.getAttribute("data-t");
            if (t === "n") st[id] = w.querySelector("input").value;
            else if (t === "s") st[id] = w.querySelector("select").value;
            else if (t === "x") st[id] = w.querySelector("input").checked;
            else {
                const on = w.querySelector('button[aria-pressed="true"]');
                st[id] = on ? on.getAttribute("data-v") : "";
            }
        });
        return st;
    };
    const update = () => {
        upgrade();
        const out = calc(cfg, read());
        el.querySelectorAll("[data-f]").forEach((w: any) => {
            w.hidden = !!out.hidden[w.getAttribute("data-f")];
        });
        const d = res.querySelector("details");
        const open = d && d.open;
        res.innerHTML = out.html;
        if (open && res.querySelector("details")) res.querySelector("details").open = true;
    };
    // Custom dropdown over each native select. The select stays the source of truth (and the no-JS fallback).
    const enhance = (w: any) => {
        const sel = w.querySelector("select");
        const lab = w.querySelector("label");
        if (!sel || !lab || w.querySelector(".el-dd")) return;
        const doc = sel.ownerDocument;
        const uid = "el-dd-" + Math.random().toString(36).slice(2, 8);
        const name = () => {
            let t = "";
            lab.childNodes.forEach((n: any) => {
                if (n !== sel) t += n.textContent;
            });
            return t.replace(/\s+/g, " ").trim();
        };
        const dd = doc.createElement("div");
        dd.className = "el-dd";
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "el-dd-b";
        btn.setAttribute("aria-haspopup", "listbox");
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", uid);
        const txt = doc.createElement("span");
        txt.className = "el-dd-t";
        btn.appendChild(txt);
        const list = doc.createElement("div");
        list.className = "el-dd-l";
        list.id = uid;
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", name());
        list.hidden = true;
        const rows: any[] = [];
        Array.prototype.forEach.call(sel.options, (o: any, i: number) => {
            const r = doc.createElement("div");
            r.className = "el-dd-opt";
            r.id = uid + "-" + i;
            r.setAttribute("role", "option");
            r.textContent = o.textContent;
            if (o.title) r.title = o.title;
            rows.push(r);
            list.appendChild(r);
        });
        dd.appendChild(btn);
        dd.appendChild(list);
        lab.parentNode.insertBefore(dd, lab.nextSibling);
        w.classList.add("el-js");
        sel.tabIndex = -1;
        sel.setAttribute("aria-hidden", "true");
        let act = 0;
        const sync = () => {
            rows.forEach((r, i) => {
                r.setAttribute("aria-selected", String(i === sel.selectedIndex));
                r.classList.toggle("act", i === act);
            });
            const o = sel.options[sel.selectedIndex];
            txt.textContent = o ? o.textContent : "";
            btn.setAttribute("aria-label", name() + ": " + txt.textContent);
            if (!list.hidden && rows[act]) btn.setAttribute("aria-activedescendant", rows[act].id);
            else btn.removeAttribute("aria-activedescendant");
        };
        const show = (on: boolean) => {
            list.hidden = !on;
            btn.setAttribute("aria-expanded", String(on));
            if (on) act = Math.max(0, sel.selectedIndex);
            sync();
            if (on && rows[act] && rows[act].scrollIntoView) rows[act].scrollIntoView({ block: "nearest" });
        };
        const pick = (i: number) => {
            show(false);
            if (i === sel.selectedIndex || i < 0) return;
            sel.selectedIndex = i;
            sel.dispatchEvent(new (doc.defaultView as any).Event("change", { bubbles: true }));
        };
        const move = (i: number) => {
            act = Math.min(rows.length - 1, Math.max(0, i));
            sync();
            if (rows[act].scrollIntoView) rows[act].scrollIntoView({ block: "nearest" });
        };
        btn.addEventListener("click", () => show(list.hidden));
        btn.addEventListener("keydown", (e: any) => {
            const k = e.key;
            if (list.hidden) {
                if (k === "Enter" || k === " " || k === "ArrowDown" || k === "ArrowUp") {
                    e.preventDefault();
                    show(true);
                }
                return;
            }
            if (k === "ArrowDown") move(act + 1);
            else if (k === "ArrowUp") move(act - 1);
            else if (k === "Home") move(0);
            else if (k === "End") move(rows.length - 1);
            else if (k === "Enter" || k === " ") pick(act);
            else if (k === "Escape") show(false);
            else if (k === "Tab") show(false);
            else return;
            if (k !== "Tab") e.preventDefault();
        });
        list.addEventListener("mousedown", (e: any) => e.preventDefault());
        list.addEventListener("click", (e: any) => {
            const r = e.target && e.target.closest ? e.target.closest(".el-dd-opt") : null;
            if (r) pick(rows.indexOf(r));
        });
        list.addEventListener("mousemove", (e: any) => {
            const r = e.target && e.target.closest ? e.target.closest(".el-dd-opt") : null;
            if (r && rows.indexOf(r) !== act) {
                act = rows.indexOf(r);
                sync();
            }
        });
        doc.addEventListener("click", (e: any) => {
            if (!list.hidden && !dd.contains(e.target)) show(false);
        });
        sel.addEventListener("change", sync);
        sel.addEventListener("focus", () => btn.focus());
        // The native popup must never open: a click on the label or the hidden select goes to the button instead.
        sel.addEventListener("mousedown", (e: any) => e.preventDefault());
        lab.addEventListener("click", (e: any) => {
            e.preventDefault();
            btn.focus();
        });
        sync();
    };
    // Only the Modern style (--el-style from the theme sheet) gets the custom dropdown; Classic keeps the native select.
    const win = el.ownerDocument.defaultView;
    const modern = () => {
        try {
            return win.getComputedStyle(el).getPropertyValue("--el-style").trim() === "modern";
        } catch {
            return false;
        }
    };
    const upgrade = () => {
        if (modern()) el.querySelectorAll('[data-t="s"]').forEach(enhance);
    };
    upgrade();
    win.addEventListener("load", upgrade);
    el.addEventListener("input", update);
    el.addEventListener("change", update);
    el.addEventListener("click", (e: any) => {
        const b = e.target && e.target.closest ? e.target.closest("button[data-v]") : null;
        if (!b) return;
        b.parentNode.querySelectorAll("button[data-v]").forEach((x: any) => x.setAttribute("aria-pressed", String(x === b)));
        update();
    });
    update();
    return true;
}
