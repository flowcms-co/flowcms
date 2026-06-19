/**
 * @flowcms/client/visual-editing — the live-editor bridge for your frontend.
 *
 * Pair it with the data client: `@flowcms/client` *reads* content into your site;
 * this *enables in-place editing* of the rendered page inside the Flow CMS live
 * preview. They are independent — use either or both.
 *
 *   import { enableVisualEditing } from "@flowcms/client/visual-editing";
 *   enableVisualEditing(); // call once on the client, e.g. in a root layout effect
 *
 * Then mark editable regions with the matching content-model field name:
 *
 *   <h1 data-flowcms-field="title">{title}</h1>
 *   <p  data-flowcms-field="summary">{summary}</p>
 *   <div data-flowcms-field="body" data-flowcms-rich dangerouslySetInnerHTML={{ __html: body }} />
 *
 * - data-flowcms-field="<name>"  the field name in your content model. Use "title"
 *                             for the entry title; anything else writes to data.
 * - data-flowcms-rich            keep rich HTML for that field; omit it for
 *                             single-line text (edited plaintext-only).
 *
 * Why a bridge at all? The studio embeds your site in a cross-origin <iframe>, and
 * the browser's same-origin policy forbids it from touching your DOM directly. The
 * only sanctioned channel is postMessage, so the page must opt in by running this.
 *
 * It is inert unless the page is embedded in the Flow CMS preview, and a no-op
 * during server-side rendering, so it is safe to ship to production.
 */

export type VisualEditingOptions = {
    /** Attribute marking an editable region. Default "data-flowcms-field". */
    attribute?: string;
    /** Attribute marking a field as rich HTML (vs plaintext). Default "data-flowcms-rich". */
    richAttribute?: string;
    /** Class applied to fields while editing (for your own styling). Default "flowcms-edit-on". */
    editClassName?: string;
    /** Inject a minimal dashed outline for the edit class. Default true. */
    injectStyles?: boolean;
};

type Dict = Record<string, string>;

const FLAG = "__flowcmsVisualEditing";

/**
 * Wire up the live-edit bridge. Returns a cleanup function that removes the
 * listeners and editing state (handy in framework effects). Calling it more than
 * once is a no-op after the first.
 */
export function enableVisualEditing(options: VisualEditingOptions = {}): () => void {
    // No-op during SSR / non-browser runtimes.
    if (typeof window === "undefined" || typeof document === "undefined") return () => {};
    const w = window as unknown as Record<string, unknown>;
    if (w[FLAG]) return () => {};
    w[FLAG] = true;

    const attribute = options.attribute ?? "data-flowcms-field";
    const richAttribute = options.richAttribute ?? "data-flowcms-rich";
    const editClassName = options.editClassName ?? "flowcms-edit-on";
    const injectStyles = options.injectStyles ?? true;

    // Only talk to the embedding parent (the studio). "*" until we learn the origin.
    let parentOrigin = "*";
    try {
        if (document.referrer) parentOrigin = new URL(document.referrer).origin;
    } catch {
        /* keep * */
    }

    const nodes = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`));
    const fieldName = (el: HTMLElement): string => el.getAttribute(attribute) || "";
    const isRich = (el: HTMLElement): boolean => el.hasAttribute(richAttribute);
    const readValue = (el: HTMLElement): string => (isRich(el) ? el.innerHTML : el.textContent || "");
    const writeValue = (el: HTMLElement, v: string): void => {
        if (isRich(el)) el.innerHTML = v;
        else el.textContent = v;
    };

    // A field whose name looks like "<arrayPath>.<index>.<sub>" (or "…<index>" for a
    // scalar list) belongs to a repeating list, handled by the array module below.
    const ARR_RE = /^(.+)\.(\d+)(?:\.(.+))?$/;
    const parsePath = (p: string): { arrayPath: string; index: number; sub: string } | null => {
        const m = ARR_RE.exec(p);
        return m ? { arrayPath: m[1], index: parseInt(m[2], 10), sub: m[3] || "" } : null;
    };

    const snapshot = (): Dict => {
        const m: Dict = {};
        for (const el of nodes()) {
            const name = fieldName(el);
            if (parsePath(name)) continue; // repeating-list items reported under `arrays`
            m[name] = readValue(el);
        }
        return m;
    };

    let baseline: Dict = {};

    const post = (msg: Record<string, unknown>): void => {
        try {
            window.parent?.postMessage({ source: "flowcms-preview", ...msg }, parentOrigin);
        } catch {
            /* ignore */
        }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = (): void => {
        post({ type: "dirty" });
        clearTimeout(timer);
        timer = setTimeout(() => post({ type: "fields", fields: snapshot(), arrays: arraysSnapshot() }), 200);
    };

    const toggle = (on: boolean): void => {
        for (const el of nodes()) {
            if (parsePath(fieldName(el))) continue; // repeating-list items wire their own editing
            if (on) {
                el.setAttribute("contenteditable", isRich(el) ? "true" : "plaintext-only");
                el.classList.add(editClassName);
                el.addEventListener("input", onInput);
            } else {
                el.removeAttribute("contenteditable");
                el.classList.remove(editClassName);
                el.removeEventListener("input", onInput);
            }
        }
        if (on) mountArrayControls();
        else unmountArrayControls();
    };

    // ── Repeating lists: live add / edit / remove of array items ───────────────
    // Items are marked the same way as any field, with an index in the path, e.g.
    //   <div data-flowcms-field="faqSection.items.0.question">…</div>
    // We group those by array path, find each item's wrapper element, and let the
    // editor clone the last one (add) or drop one (remove). The whole list is rebuilt
    // from the DOM on every change, so add / edit / remove all just work on Save.

    type ArrField = { el: HTMLElement; mode: "text" | "rich"; sub: string; path: number[] | null };
    type ArrItem = { key: string; origIndex: number | null; clonedFrom: number | null; root: HTMLElement; fields: Record<string, ArrField> };
    type ArrBaseline = { node: HTMLElement; parent: Node | null; next: Node | null; html: string };
    type ArrGroup = { path: string; items: ArrItem[]; addBtn: HTMLButtonElement | null; baseline: ArrBaseline[] };

    let arrayGroups: ArrGroup[] = [];
    let addedCounter = 0;

    const ancestorsOf = (el: HTMLElement | null): HTMLElement[] => {
        const a: HTMLElement[] = [];
        while (el) {
            a.push(el);
            el = el.parentElement;
        }
        return a;
    };
    const lca = (els: HTMLElement[]): HTMLElement | null => {
        const list = els.filter(Boolean);
        if (!list.length) return null;
        let common = ancestorsOf(list[0]);
        for (let i = 1; i < list.length; i++) {
            const set = ancestorsOf(list[i]);
            common = common.filter((x) => set.indexOf(x) !== -1);
            if (!common.length) return null;
        }
        return common[0];
    };
    /** Largest wrapper holding all of one item's fields but none of a sibling's. */
    const itemRoot = (myEls: HTMLElement[], otherEls: HTMLElement[]): HTMLElement | null => {
        let root = lca(myEls);
        if (!root) return null;
        let p = root.parentElement;
        while (p && p !== document.body) {
            if (otherEls.some((o) => p!.contains(o))) break;
            root = p;
            p = p.parentElement;
        }
        return root;
    };
    const indexPath = (root: HTMLElement, el: HTMLElement): number[] | null => {
        const path: number[] = [];
        let n: HTMLElement | null = el;
        while (n && n !== root) {
            const parent: HTMLElement | null = n.parentElement;
            if (!parent) return null;
            path.unshift(Array.prototype.indexOf.call(parent.children, n));
            n = parent;
        }
        return n === root ? path : null;
    };
    const atPath = (root: HTMLElement, path: number[] | null): HTMLElement | null => {
        let n: Element | null = root;
        for (let i = 0; path && i < path.length && n; i++) n = n.children[path[i]] ?? null;
        return (n as HTMLElement) || null;
    };
    const byDocOrder = (a: ArrItem, b: ArrItem): number => {
        if (a.root === b.root) return 0;
        return a.root.compareDocumentPosition(b.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    };
    const readMode = (el: HTMLElement, mode: string): string => (mode === "rich" ? el.innerHTML : el.textContent || "");

    const buildArrayGroups = (): void => {
        arrayGroups = [];
        const raw: Record<string, Record<number, ArrField[]>> = {};
        for (const el of nodes()) {
            const p = parsePath(fieldName(el));
            if (!p) continue;
            const g = raw[p.arrayPath] || (raw[p.arrayPath] = {});
            (g[p.index] || (g[p.index] = [])).push({ el, mode: isRich(el) ? "rich" : "text", sub: p.sub || "_value", path: null });
        }
        for (const path of Object.keys(raw)) {
            const byIndex = raw[path];
            const indices = Object.keys(byIndex)
                .map(Number)
                .sort((a, b) => a - b);
            const allEls: HTMLElement[] = [];
            indices.forEach((idx) => byIndex[idx].forEach((f) => allEls.push(f.el)));
            const items: ArrItem[] = [];
            indices.forEach((idx) => {
                const fields = byIndex[idx];
                const myEls = fields.map((f) => f.el);
                const otherEls = allEls.filter((e) => myEls.indexOf(e) === -1);
                const root = itemRoot(myEls, otherEls);
                if (!root) return;
                const fieldDefs: Record<string, ArrField> = {};
                fields.forEach((f) => {
                    fieldDefs[f.sub] = { el: f.el, mode: f.mode, sub: f.sub, path: indexPath(root, f.el) };
                });
                items.push({ key: `${path}#${idx}`, origIndex: idx, clonedFrom: null, root, fields: fieldDefs });
            });
            if (!items.length) continue;
            items.sort(byDocOrder);
            arrayGroups.push({ path, items, addBtn: null, baseline: [] });
        }
    };

    const stampItem = (it: ArrItem): void => it.root.setAttribute("data-flowcms-item", it.key);
    const makeItemEditable = (it: ArrItem): void => {
        for (const sub of Object.keys(it.fields)) {
            const f = it.fields[sub];
            f.el.setAttribute("contenteditable", f.mode === "rich" ? "true" : "plaintext-only");
            f.el.classList.add(editClassName);
            f.el.addEventListener("input", onInput);
        }
    };
    const makeItemReadonly = (it: ArrItem): void => {
        for (const sub of Object.keys(it.fields)) {
            const f = it.fields[sub];
            f.el.removeAttribute("contenteditable");
            f.el.classList.remove(editClassName);
            f.el.removeEventListener("input", onInput);
        }
    };

    const addRemoveBtn = (it: ArrItem): void => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flowcms-arr-remove";
        btn.setAttribute("data-flowcms-control", "1");
        btn.title = "Remove this item";
        btn.setAttribute("aria-label", "Remove this item");
        btn.textContent = "×";
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeItem(it);
        });
        if (window.getComputedStyle(it.root).position === "static") it.root.style.position = "relative";
        it.root.appendChild(btn);
    };
    const addAddButton = (group: ArrGroup): void => {
        const last = group.items[group.items.length - 1];
        if (!last || !last.root.parentNode) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flowcms-arr-add";
        btn.setAttribute("data-flowcms-control", "1");
        btn.textContent = "+ Add item";
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            addItem(group);
        });
        group.addBtn = btn;
        last.root.parentNode.insertBefore(btn, last.root.nextSibling);
    };

    const addItem = (group: ArrGroup): void => {
        const src = group.items[group.items.length - 1];
        if (!src || !src.root.parentNode) return;
        const clone = src.root.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-flowcms-item");
        clone.querySelectorAll("[data-flowcms-control]").forEach((n) => n.remove());
        clone.querySelectorAll(`.${editClassName}`).forEach((n) => {
            n.classList.remove(editClassName);
            n.removeAttribute("contenteditable");
        });
        src.root.parentNode.insertBefore(clone, src.root.nextSibling);
        const newToken = 1e6 + addedCounter;
        const it: ArrItem = { key: `${group.path}#new-${addedCounter++}`, origIndex: null, clonedFrom: src.origIndex, root: clone, fields: {} };
        for (const sub of Object.keys(src.fields)) {
            const def = src.fields[sub];
            const el = atPath(clone, def.path);
            if (!el) continue;
            // Re-key the clone's field attribute so a later re-scan can't collide with
            // a real index, then wipe the photocopied text for the user to fill in.
            el.setAttribute(attribute, sub === "_value" ? `${group.path}.${newToken}` : `${group.path}.${newToken}.${sub}`);
            it.fields[sub] = { el, mode: def.mode, sub, path: def.path };
            if (def.mode === "rich") el.innerHTML = "";
            else el.textContent = "";
        }
        group.items.push(it);
        stampItem(it);
        makeItemEditable(it);
        addRemoveBtn(it);
        if (group.addBtn) clone.parentNode!.insertBefore(group.addBtn, clone.nextSibling);
        const first = Object.keys(it.fields)
            .map((s) => it.fields[s].el)
            .filter(Boolean)[0];
        if (first) first.focus();
        onInput();
    };

    const removeItem = (it: ArrItem): void => {
        makeItemReadonly(it);
        if (it.root.parentNode) it.root.parentNode.removeChild(it.root);
        for (const group of arrayGroups) {
            const i = group.items.indexOf(it);
            if (i >= 0) {
                group.items.splice(i, 1);
                break;
            }
        }
        onInput();
    };

    const mountArrayControls = (): void => {
        buildArrayGroups();
        for (const group of arrayGroups) {
            group.baseline = group.items.map((it) => ({ node: it.root, parent: it.root.parentNode, next: it.root.nextSibling, html: it.root.innerHTML }));
        }
        for (const group of arrayGroups) {
            for (const it of group.items) {
                stampItem(it);
                makeItemEditable(it);
                addRemoveBtn(it);
            }
            addAddButton(group);
        }
    };

    const unmountArrayControls = (): void => {
        for (const group of arrayGroups) {
            for (const it of group.items) {
                makeItemReadonly(it);
                it.root.removeAttribute("data-flowcms-item");
            }
        }
        document.querySelectorAll("[data-flowcms-control]").forEach((n) => n.remove());
        arrayGroups = [];
    };

    const revertArrays = (): void => {
        for (const group of arrayGroups) {
            group.items.filter((it) => it.origIndex == null).forEach((it) => it.root.parentNode?.removeChild(it.root));
            for (const b of group.baseline) {
                if (!document.body.contains(b.node) && b.parent) {
                    if (b.next && b.next.parentNode === b.parent) b.parent.insertBefore(b.node, b.next);
                    else b.parent.appendChild(b.node);
                }
                b.node.innerHTML = b.html;
            }
        }
        unmountArrayControls();
        mountArrayControls();
    };

    const arraysSnapshot = (): Record<string, Array<{ index: number | null; clonedFrom: number | null; fields: Dict; value?: string }>> => {
        const out: Record<string, Array<{ index: number | null; clonedFrom: number | null; fields: Dict; value?: string }>> = {};
        for (const group of arrayGroups) {
            const live = group.items.filter((it) => document.body.contains(it.root)).sort(byDocOrder);
            out[group.path] = live.map((it) => {
                const rec: { index: number | null; clonedFrom: number | null; fields: Dict; value?: string } = { index: it.origIndex, clonedFrom: it.clonedFrom, fields: {} };
                for (const sub of Object.keys(it.fields)) {
                    const f = it.fields[sub];
                    if (sub === "_value") rec.value = readMode(f.el, f.mode);
                    else rec.fields[sub] = readMode(f.el, f.mode);
                }
                return rec;
            });
        }
        return out;
    };

    const onMessage = (e: MessageEvent): void => {
        if (parentOrigin !== "*" && e.origin !== parentOrigin) return;
        const d = e.data as
            | { source?: string; type?: string; editing?: boolean; fields?: Record<string, unknown>; title?: unknown; summary?: unknown; body?: unknown }
            | null;
        if (!d || d.source !== "flowcms-studio") return;
        if (d.type === "hello") {
            post({ type: "ready", editable: true });
            return;
        }
        if (d.type === "baseline") {
            const f = (d.fields && typeof d.fields === "object" ? d.fields : d) as Record<string, unknown>;
            for (const [k, v] of Object.entries(f)) if (typeof v === "string") baseline[k] = v;
            return;
        }
        if (d.type === "revert") {
            revertArrays();
            for (const el of nodes()) {
                const n = fieldName(el);
                if (n in baseline) writeValue(el, baseline[n]);
            }
            return;
        }
        if (d.type === "edit") {
            toggle(!!d.editing);
            if (d.editing) nodes()[0]?.focus();
            return;
        }
    };

    window.addEventListener("message", onMessage);

    let styleEl: HTMLStyleElement | undefined;
    if (injectStyles) {
        styleEl = document.createElement("style");
        styleEl.textContent =
            `.${editClassName}{outline:2px dashed rgba(108,92,231,.5);outline-offset:4px;border-radius:4px;cursor:text}.${editClassName}:focus{outline-color:rgba(108,92,231,1)}` +
            ".flowcms-arr-add{display:inline-flex;align-items:center;gap:.375rem;margin:.75rem 0;padding:.4375rem .875rem;font:600 .8125rem/1 system-ui,-apple-system,sans-serif;color:#fff;background:#6c5ce7;border:0;border-radius:.5rem;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.18)}" +
            ".flowcms-arr-add:hover{background:#5a4bd4}" +
            ".flowcms-arr-remove{position:absolute;top:.375rem;right:.375rem;z-index:9;width:1.375rem;height:1.375rem;display:inline-flex;align-items:center;justify-content:center;padding:0;font:700 .9375rem/1 system-ui,sans-serif;color:#fff;background:rgba(214,48,49,.94);border:0;border-radius:999px;cursor:pointer;opacity:0;transition:opacity .12s}" +
            "[data-flowcms-item]:hover>.flowcms-arr-remove,.flowcms-arr-remove:focus{opacity:1}";
        document.head.appendChild(styleEl);
    }

    baseline = snapshot();
    // Handshake: announce that this page supports live editing.
    post({ type: "ready", editable: true });

    return () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        toggle(false);
        styleEl?.remove();
        w[FLAG] = false;
    };
}
