/*!
 * Flow CMS live-edit bridge (standalone, no build step).
 *
 * Using a bundler (Next.js, Vite, Astro, …)? Prefer the packaged version instead:
 *   import { enableVisualEditing } from "@flowcms/client/visual-editing";
 *   enableVisualEditing();
 * This file is the zero-tooling equivalent for plain-HTML sites.
 *
 * Drop this script on any page of your frontend (the site you set as the
 * "Preview URL" in Flow CMS → Settings → System) to enable in-place editing
 * inside the Flow CMS live preview, the same way the bundled Northbound demo works.
 *
 * Two ways to mark what's editable, used together:
 *
 * 1. A selector map pushed by the studio (recommended; no markup changes). Flow CMS
 *    stores a field→element map and sends it to this script, so you only add the
 *    one <script> line, like an analytics tag. Nested fields use dot/array paths
 *    (e.g. "heroBanner.title", "mainContent.contentList.0.title").
 *
 * 2. data-flowcms-field attributes in your own markup (explicit, backward compatible):
 *      <h1 data-flowcms-field="title">{{ title }}</h1>
 *      <div data-flowcms-field="body" data-flowcms-rich>{{ body }}</div>
 *
 * The script is inert unless the page is embedded in the Flow CMS preview, so it
 * is safe to ship to production.
 */
(function () {
    "use strict";
    if (window.__flowcmsLiveEdit) return;
    window.__flowcmsLiveEdit = true;

    // Only talk to the embedding parent (the studio). "*" until we learn the origin.
    var parentOrigin = "*";
    try {
        if (document.referrer) parentOrigin = new URL(document.referrer).origin;
    } catch (e) {
        /* keep * */
    }

    // ── Target model ──────────────────────────────────────────────────────────
    // A target is one editable binding: { key, el, mode }.
    //   key  = field path (e.g. "heroBanner.title"); doubles as the content key.
    //   mode = "text" | "rich" | "attr:src" | "attr:alt" | "attr:href" | "style:bg".
    // Targets come from two sources, merged: the studio's selector map (priority)
    // and any data-flowcms-field attributes already on the page.

    var mapBindings = []; // last selector map received from the studio
    var arrayGroups = []; // active repeating-list groups while editing (see array module)
    var addedCounter = 0; // unique suffix for items added live

    function attrTargets() {
        return Array.prototype.slice
            .call(document.querySelectorAll("[data-flowcms-field]"))
            .map(function (el) {
                return { key: el.getAttribute("data-flowcms-field") || "", el: el, mode: el.hasAttribute("data-flowcms-rich") ? "rich" : "text" };
            })
            .filter(function (t) {
                return t.key;
            });
    }

    function mapTargets() {
        var out = [];
        for (var i = 0; i < mapBindings.length; i++) {
            var b = mapBindings[i];
            if (!b || !b.selector || !b.fieldPath) continue;
            var list;
            try {
                list = document.querySelectorAll(b.selector);
            } catch (e) {
                continue; // a bad selector never breaks the rest of the map
            }
            var el = list[b.nth || 0];
            if (!el) continue;
            out.push({ key: b.fieldPath, el: el, mode: b.mode || "text" });
        }
        return out;
    }

    function targets() {
        // Map bindings win; attribute targets fill in keys the map doesn't cover.
        var ts = mapTargets();
        var seen = {};
        ts.forEach(function (t) {
            seen[t.key] = true;
        });
        attrTargets().forEach(function (t) {
            if (!seen[t.key]) {
                seen[t.key] = true;
                ts.push(t);
            }
        });
        return ts;
    }

    function isInline(mode) {
        return mode === "text" || mode === "rich";
    }

    function readValue(el, mode) {
        if (mode === "rich") return el.innerHTML;
        if (mode === "attr:src") return el.getAttribute("src") || "";
        if (mode === "attr:alt") return el.getAttribute("alt") || "";
        if (mode === "attr:href") return el.getAttribute("href") || "";
        if (mode === "style:bg") {
            var m = (el.style.backgroundImage || "").match(/url\((['"]?)(.*?)\1\)/);
            return m ? m[2] : "";
        }
        return el.textContent || "";
    }

    function writeValue(el, mode, v) {
        if (mode === "rich") { el.innerHTML = v; return; }
        if (mode === "attr:src") { el.setAttribute("src", v); return; }
        if (mode === "attr:alt") { el.setAttribute("alt", v); return; }
        if (mode === "attr:href") { el.setAttribute("href", v); return; }
        if (mode === "style:bg") { el.style.backgroundImage = v ? 'url("' + v + '")' : ""; return; }
        el.textContent = v;
    }

    function snapshot() {
        var m = {};
        targets().forEach(function (t) {
            // Repeating-list items are reported separately, under `arrays`, so the
            // studio can rebuild the whole list (incl. added / removed items).
            if (parsePath(t.key)) return;
            m[t.key] = readValue(t.el, t.mode);
        });
        return m;
    }

    var baseline = {};

    function post(msg) {
        msg.source = "flowcms-preview";
        try {
            if (window.parent) window.parent.postMessage(msg, parentOrigin);
        } catch (e) {
            /* ignore */
        }
    }

    var timer;
    function onInput() {
        post({ type: "dirty" });
        clearTimeout(timer);
        timer = setTimeout(function () {
            post({ type: "fields", fields: snapshot(), arrays: arraysSnapshot() });
        }, 200);
    }

    var editing = false;
    function toggle(on) {
        editing = on;
        targets().forEach(function (t) {
            if (!isInline(t.mode)) return; // images/links are edited from the studio panel
            if (parsePath(t.key)) return; // repeating-list items wire their own editing
            if (on) {
                t.el.setAttribute("contenteditable", t.mode === "rich" ? "true" : "plaintext-only");
                t.el.classList.add("flowcms-edit-on");
                t.el.addEventListener("input", onInput);
            } else {
                t.el.removeAttribute("contenteditable");
                t.el.classList.remove("flowcms-edit-on");
                t.el.removeEventListener("input", onInput);
            }
        });
        if (on) mountArrayControls();
        else unmountArrayControls();
    }

    function applyMap(bindings) {
        mapBindings = Array.isArray(bindings) ? bindings : [];
        baseline = snapshot();
        if (editing) {
            toggle(false);
            toggle(true);
        }
        post({ type: "fields", fields: snapshot(), arrays: arraysSnapshot() });
        post({ type: "mapped", count: targets().length });
    }

    // ── Visual mapper: value-match suggestions + point-and-click pick ──────────
    // The studio sends the entry's field values; we find each on the page and
    // return a resilient selector + confidence, so a human only confirms/fixes.

    function depth(el) {
        var d = 0;
        while ((el = el.parentElement)) d++;
        return d;
    }
    function cssEsc(s) {
        return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }
    function fileName(u) {
        return String(u).split("?")[0].split("#")[0].split("/").pop();
    }

    /** A short, id-anchored CSS selector for an element, plus its index among
     *  matches (0 when unique) so a list item still resolves precisely. */
    function selectorFor(el) {
        if (el.id) return { selector: "#" + cssEsc(el.id), nth: 0 };
        var parts = [];
        var node = el;
        while (node && node.nodeType === 1 && node !== document.body) {
            if (node.id) {
                parts.unshift("#" + cssEsc(node.id));
                break;
            }
            var tag = node.tagName.toLowerCase();
            var idx = 1,
                sib = node;
            while ((sib = sib.previousElementSibling)) if (sib.tagName === node.tagName) idx++;
            parts.unshift(tag + ":nth-of-type(" + idx + ")");
            node = node.parentElement;
        }
        var selector = parts.join(" > ");
        var nth = 0;
        try {
            var ms = document.querySelectorAll(selector);
            for (var i = 0; i < ms.length; i++)
                if (ms[i] === el) {
                    nth = i;
                    break;
                }
        } catch (e) {
            /* unparseable selector: leave nth 0 */
        }
        return { selector: selector, nth: nth };
    }

    function suggestOne(f, els) {
        var val = f.value == null ? "" : String(f.value).trim();
        if (!val) return { fieldPath: f.path, confidence: 0 };
        // URL fields: match a link's href (never an image / background).
        if (f.kind === "url") {
            var ufn = fileName(val);
            for (var u = 0; u < els.length; u++) {
                var href = els[u].getAttribute && els[u].getAttribute("href");
                if (href && (href === val || (ufn && fileName(href) === ufn))) {
                    var su = selectorFor(els[u]);
                    return { fieldPath: f.path, selector: su.selector, nth: su.nth, mode: "attr:href", value: val, confidence: 0.85 };
                }
            }
            return { fieldPath: f.path, confidence: 0 };
        }
        // Media fields: match an image src or a CSS background image. Guard the
        // empty file name (a trailing-slash URL) so it can't match everything.
        if (f.kind === "media") {
            var mfn = fileName(val);
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                var src = el.getAttribute && (el.getAttribute("src") || el.getAttribute("data-src"));
                if (src && (src === val || (mfn && fileName(src) === mfn))) {
                    var s = selectorFor(el);
                    return { fieldPath: f.path, selector: s.selector, nth: s.nth, mode: "attr:src", value: val, confidence: 0.9 };
                }
                var bg = el.style && el.style.backgroundImage;
                if (bg && bg !== "none" && (bg.indexOf(val) >= 0 || (mfn && bg.indexOf(mfn) >= 0))) {
                    var s3 = selectorFor(el);
                    return { fieldPath: f.path, selector: s3.selector, nth: s3.nth, mode: "style:bg", value: val, confidence: 0.85 };
                }
            }
            return { fieldPath: f.path, confidence: 0 };
        }
        // Text: the deepest element whose text equals the value (exact), else a
        // long-value "contains" fallback (rich text rendered with extra markup).
        var exact = [],
            contains = [];
        for (var j = 0; j < els.length; j++) {
            var t = (els[j].textContent || "").trim();
            if (!t) continue;
            if (t === val) exact.push(els[j]);
            else if (val.length >= 40 && t.indexOf(val) >= 0) contains.push(els[j]);
        }
        function deepest(list) {
            var best = null,
                bd = -1;
            for (var k = 0; k < list.length; k++) {
                var dd = depth(list[k]);
                if (dd > bd) {
                    bd = dd;
                    best = list[k];
                }
            }
            return best;
        }
        if (exact.length) {
            // Drop ancestors that only match because a descendant does (e.g. a <li>
            // wrapping the <h3> that holds the text), so nesting isn't false ambiguity.
            var leaf = exact.filter(function (e) {
                return !exact.some(function (o) {
                    return o !== e && e.contains(o);
                });
            });
            var se = selectorFor(deepest(leaf));
            return { fieldPath: f.path, selector: se.selector, nth: se.nth, mode: f.kind === "rich" ? "rich" : "text", value: val, confidence: leaf.length === 1 ? 0.95 : 0.6, ambiguous: leaf.length > 1 };
        }
        if (contains.length) {
            var sc = selectorFor(deepest(contains));
            return { fieldPath: f.path, selector: sc.selector, nth: sc.nth, mode: "rich", value: val, confidence: 0.4 };
        }
        return { fieldPath: f.path, confidence: 0 };
    }
    function suggestAll(fields) {
        var els = Array.prototype.slice.call(document.body.querySelectorAll("*"));
        return (fields || []).map(function (f) {
            return suggestOne(f, els);
        });
    }

    // Point-and-click: studio asks to bind one field; we highlight on hover and
    // capture the next click, returning its selector.
    var picking = null;
    var hoverEl = null;
    function clearHover() {
        if (hoverEl && hoverEl.classList) hoverEl.classList.remove("flowcms-hover");
        hoverEl = null;
    }
    function pickModeFor(el) {
        var tag = el.tagName ? el.tagName.toLowerCase() : "";
        if (tag === "img") return "attr:src";
        if (tag === "a") return "attr:href";
        if (el.style && el.style.backgroundImage && el.style.backgroundImage !== "none") return "style:bg";
        return "text";
    }
    function onHover(e) {
        if (!picking) return;
        clearHover();
        hoverEl = e.target;
        if (hoverEl && hoverEl.classList) hoverEl.classList.add("flowcms-hover");
    }
    function onPick(e) {
        if (!picking) return;
        e.preventDefault();
        e.stopPropagation();
        var el = e.target;
        var mode = pickModeFor(el);
        var sel = selectorFor(el);
        post({ type: "picked", fieldPath: picking, selector: sel.selector, nth: sel.nth, mode: mode, value: readValue(el, mode) });
        stopPick();
    }
    function startPick(fieldPath) {
        picking = fieldPath;
        document.body.classList.add("flowcms-picking");
    }
    function stopPick() {
        picking = null;
        clearHover();
        document.body.classList.remove("flowcms-picking");
    }
    document.addEventListener("mouseover", onHover, true);
    document.addEventListener("click", onPick, true);

    /** Report which current bindings no longer resolve (markup changed) so the
     *  studio can flag them for a quick re-map. */
    function probe() {
        var unresolved = [];
        for (var i = 0; i < mapBindings.length; i++) {
            var b = mapBindings[i];
            var ok = false;
            try {
                ok = !!document.querySelectorAll(b.selector)[b.nth || 0];
            } catch (e) {
                ok = false;
            }
            if (!ok) unresolved.push(b.fieldPath);
        }
        post({ type: "probe-result", unresolved: unresolved });
    }

    // ── Repeating lists: live add / edit / remove of array items ───────────────
    // Any set of selector-map bindings whose field path looks like
    // "<arrayPath>.<index>.<field>" (or "<arrayPath>.<index>" for a scalar list)
    // is treated as one repeating list (FAQs, services, testimonials…). We locate
    // each rendered item's wrapper element, then the editor can clone the last one
    // to add, or drop one to remove. The whole list is rebuilt from the DOM (in
    // order) on every change, so add / edit / remove all just work on Save — no
    // fragile index bookkeeping. Items already in the saved content carry their
    // original index back so the studio can preserve non-rendered fields (id, etc.).

    var ARR_RE = /^(.+)\.(\d+)(?:\.(.+))?$/;

    function parsePath(fieldPath) {
        var m = ARR_RE.exec(String(fieldPath || ""));
        if (!m) return null;
        return { arrayPath: m[1], index: parseInt(m[2], 10), sub: m[3] || "" };
    }

    function resolveBinding(b) {
        try {
            return document.querySelectorAll(b.selector)[b.nth || 0] || null;
        } catch (e) {
            return null;
        }
    }

    function ancestorsOf(el) {
        var a = [];
        while (el) {
            a.push(el);
            el = el.parentElement;
        }
        return a;
    }

    /** Lowest common ancestor of a set of elements (the closest shared wrapper). */
    function lca(els) {
        els = els.filter(Boolean);
        if (!els.length) return null;
        var common = ancestorsOf(els[0]);
        for (var i = 1; i < els.length; i++) {
            var set = ancestorsOf(els[i]);
            common = common.filter(function (x) {
                return set.indexOf(x) !== -1;
            });
            if (!common.length) return null;
        }
        return common[0];
    }

    /** The repeating block for one item: the largest wrapper that holds all of this
     *  item's fields but none of any sibling item's fields. */
    function itemRoot(myEls, otherEls) {
        var root = lca(myEls);
        if (!root) return null;
        var p = root.parentElement;
        while (p && p !== document.body) {
            var swallows = false;
            for (var i = 0; i < otherEls.length; i++) {
                if (p.contains(otherEls[i])) {
                    swallows = true;
                    break;
                }
            }
            if (swallows) break;
            root = p;
            p = p.parentElement;
        }
        return root;
    }

    /** Child-index path from an item root down to one of its field elements, so the
     *  matching element can be found inside a structurally identical clone. */
    function indexPath(root, el) {
        var path = [];
        var n = el;
        while (n && n !== root) {
            var parent = n.parentElement;
            if (!parent) return null;
            path.unshift(Array.prototype.indexOf.call(parent.children, n));
            n = parent;
        }
        return n === root ? path : null;
    }
    function atPath(root, path) {
        var n = root;
        for (var i = 0; path && i < path.length && n; i++) n = n.children[path[i]];
        return n || null;
    }

    function byDocOrder(get) {
        return function (a, b) {
            var na = get(a),
                nb = get(b);
            if (na === nb) return 0;
            return na.compareDocumentPosition(nb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        };
    }

    /** Group the current bindings into repeating lists with resolved item roots. */
    function buildArrayGroups() {
        arrayGroups = [];
        var raw = {};
        for (var i = 0; i < mapBindings.length; i++) {
            var b = mapBindings[i];
            if (!b || !b.fieldPath || !b.selector) continue;
            var p = parsePath(b.fieldPath);
            if (!p) continue;
            var g = raw[p.arrayPath] || (raw[p.arrayPath] = { path: p.arrayPath, items: {} });
            (g.items[p.index] || (g.items[p.index] = [])).push({ sub: p.sub, selector: b.selector, nth: b.nth || 0, mode: b.mode || "text" });
        }
        Object.keys(raw).forEach(function (key) {
            var g = raw[key];
            var indices = Object.keys(g.items)
                .map(Number)
                .sort(function (a, b) {
                    return a - b;
                });
            // Resolve every binding's element first (so item roots can exclude siblings).
            var perIndex = {};
            var allEls = [];
            indices.forEach(function (idx) {
                var fields = {};
                g.items[idx].forEach(function (bd) {
                    var el = resolveBinding(bd);
                    if (!el) return;
                    fields[bd.sub || "_value"] = { el: el, mode: bd.mode };
                    allEls.push(el);
                });
                perIndex[idx] = fields;
            });
            var items = [];
            indices.forEach(function (idx) {
                var subs = Object.keys(perIndex[idx]);
                if (!subs.length) return;
                var myEls = subs.map(function (s) {
                    return perIndex[idx][s].el;
                });
                var otherEls = allEls.filter(function (e) {
                    return myEls.indexOf(e) === -1;
                });
                var root = itemRoot(myEls, otherEls);
                if (!root) return;
                var fieldDefs = {};
                subs.forEach(function (s) {
                    var fe = perIndex[idx][s];
                    fieldDefs[s] = { path: indexPath(root, fe.el), mode: fe.mode, el: fe.el };
                });
                items.push({ key: g.path + "#" + idx, origIndex: idx, clonedFrom: null, root: root, fields: fieldDefs });
            });
            if (!items.length) return;
            items.sort(
                byDocOrder(function (it) {
                    return it.root;
                }),
            );
            arrayGroups.push({ path: g.path, items: items, addBtn: null, baseline: [] });
        });
    }

    function stampItem(it) {
        if (it.root) it.root.setAttribute("data-flowcms-item", it.key);
    }
    function makeItemEditable(it) {
        Object.keys(it.fields).forEach(function (s) {
            var f = it.fields[s];
            if (!f.el || (f.mode !== "text" && f.mode !== "rich")) return;
            f.el.setAttribute("contenteditable", f.mode === "rich" ? "true" : "plaintext-only");
            f.el.classList.add("flowcms-edit-on");
            f.el.addEventListener("input", onInput);
        });
    }
    function makeItemReadonly(it) {
        Object.keys(it.fields).forEach(function (s) {
            var f = it.fields[s];
            if (!f.el) return;
            f.el.removeAttribute("contenteditable");
            f.el.classList.remove("flowcms-edit-on");
            f.el.removeEventListener("input", onInput);
        });
    }

    function addRemoveBtn(it) {
        if (!it.root) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flowcms-arr-remove";
        btn.setAttribute("data-flowcms-control", "1");
        btn.title = "Remove this item";
        btn.setAttribute("aria-label", "Remove this item");
        btn.textContent = "×";
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            removeItem(it);
        });
        if (window.getComputedStyle(it.root).position === "static") it.root.style.position = "relative";
        it.root.appendChild(btn);
    }

    function addAddButton(group) {
        var last = group.items[group.items.length - 1];
        if (!last || !last.root || !last.root.parentNode) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flowcms-arr-add";
        btn.setAttribute("data-flowcms-control", "1");
        btn.textContent = "+ Add item";
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            addItem(group);
        });
        group.addBtn = btn;
        last.root.parentNode.insertBefore(btn, last.root.nextSibling);
    }

    function addItem(group) {
        var src = group.items[group.items.length - 1];
        if (!src || !src.root || !src.root.parentNode) return;
        var clone = src.root.cloneNode(true);
        clone.removeAttribute("data-flowcms-item");
        Array.prototype.slice.call(clone.querySelectorAll("[data-flowcms-control]")).forEach(function (n) {
            n.parentNode && n.parentNode.removeChild(n);
        });
        Array.prototype.slice.call(clone.querySelectorAll(".flowcms-edit-on")).forEach(function (n) {
            n.classList.remove("flowcms-edit-on");
            n.removeAttribute("contenteditable");
        });
        src.root.parentNode.insertBefore(clone, src.root.nextSibling);
        var it = { key: group.path + "#new-" + addedCounter++, origIndex: null, clonedFrom: src.origIndex, root: clone, fields: {} };
        Object.keys(src.fields).forEach(function (s) {
            var def = src.fields[s];
            var el = atPath(clone, def.path);
            if (!el) return;
            it.fields[s] = { path: def.path, mode: def.mode, el: el };
            // Wipe the photocopied text so the user fills the new item in. Media /
            // link values are left as-is (changed from the studio media panel).
            if (def.mode === "rich") el.innerHTML = "";
            else if (def.mode === "text") el.textContent = "";
        });
        group.items.push(it);
        stampItem(it);
        makeItemEditable(it);
        addRemoveBtn(it);
        if (group.addBtn) clone.parentNode.insertBefore(group.addBtn, clone.nextSibling);
        var first = Object.keys(it.fields)
            .map(function (s) {
                return it.fields[s].el;
            })
            .filter(Boolean)[0];
        if (first) first.focus();
        onInput();
    }

    function removeItem(it) {
        makeItemReadonly(it);
        if (it.root && it.root.parentNode) it.root.parentNode.removeChild(it.root);
        for (var i = 0; i < arrayGroups.length; i++) {
            var idx = arrayGroups[i].items.indexOf(it);
            if (idx >= 0) {
                arrayGroups[i].items.splice(idx, 1);
                break;
            }
        }
        onInput();
    }

    function mountArrayControls() {
        buildArrayGroups();
        // Record a baseline (node + position + clean HTML) before injecting anything,
        // so a discard / revert can restore the original items exactly.
        arrayGroups.forEach(function (group) {
            group.baseline = group.items.map(function (it) {
                return { node: it.root, parent: it.root.parentNode, next: it.root.nextSibling, html: it.root.innerHTML };
            });
        });
        arrayGroups.forEach(function (group) {
            group.items.forEach(function (it) {
                stampItem(it);
                makeItemEditable(it);
                addRemoveBtn(it);
            });
            addAddButton(group);
        });
    }

    function unmountArrayControls() {
        arrayGroups.forEach(function (group) {
            group.items.forEach(function (it) {
                makeItemReadonly(it);
                if (it.root) it.root.removeAttribute("data-flowcms-item");
            });
        });
        Array.prototype.slice.call(document.querySelectorAll("[data-flowcms-control]")).forEach(function (n) {
            n.parentNode && n.parentNode.removeChild(n);
        });
        arrayGroups = [];
    }

    function revertArrays() {
        arrayGroups.forEach(function (group) {
            // Drop items added live.
            group.items
                .filter(function (it) {
                    return it.origIndex == null;
                })
                .forEach(function (it) {
                    if (it.root && it.root.parentNode) it.root.parentNode.removeChild(it.root);
                });
            // Restore original items (re-insert any removed; reset edited HTML, which
            // also strips any injected controls captured after the baseline).
            group.baseline.forEach(function (b) {
                if (!document.body.contains(b.node) && b.parent) {
                    if (b.next && b.next.parentNode === b.parent) b.parent.insertBefore(b.node, b.next);
                    else b.parent.appendChild(b.node);
                }
                b.node.innerHTML = b.html;
            });
        });
        // Rebuild controls against the restored DOM.
        unmountArrayControls();
        mountArrayControls();
    }

    /** The current state of every repeating list, in document order. Each item
     *  carries its original index (or null when added live) plus the source index it
     *  was cloned from, so the studio can preserve non-rendered fields on Save. */
    function arraysSnapshot() {
        var out = {};
        arrayGroups.forEach(function (group) {
            var live = group.items.filter(function (it) {
                return it.root && document.body.contains(it.root);
            });
            live.sort(
                byDocOrder(function (it) {
                    return it.root;
                }),
            );
            out[group.path] = live.map(function (it) {
                var rec = { index: it.origIndex, clonedFrom: it.clonedFrom, fields: {} };
                Object.keys(it.fields).forEach(function (s) {
                    var f = it.fields[s];
                    if (s === "_value") rec.value = readValue(f.el, f.mode);
                    else rec.fields[s] = readValue(f.el, f.mode);
                });
                return rec;
            });
        });
        return out;
    }

    window.addEventListener("message", function (e) {
        if (parentOrigin !== "*" && e.origin !== parentOrigin) return;
        var d = e.data;
        if (!d || d.source !== "flowcms-studio") return;
        if (d.type === "hello") {
            post({ type: "ready", editable: true });
            return;
        }
        if (d.type === "map") {
            applyMap(d.bindings);
            return;
        }
        if (d.type === "suggest") {
            post({ type: "suggestions", items: suggestAll(d.fields) });
            return;
        }
        if (d.type === "pick") {
            startPick(d.fieldPath);
            return;
        }
        if (d.type === "pickCancel") {
            stopPick();
            return;
        }
        if (d.type === "probe") {
            probe();
            return;
        }
        if (d.type === "baseline") {
            var f = d.fields && typeof d.fields === "object" ? d.fields : d;
            Object.keys(f).forEach(function (k) {
                if (typeof f[k] === "string") baseline[k] = f[k];
            });
            return;
        }
        if (d.type === "revert") {
            revertArrays();
            targets().forEach(function (t) {
                if (t.key in baseline) writeValue(t.el, t.mode, baseline[t.key]);
            });
            return;
        }
        if (d.type === "set") {
            // Studio pushes updated values (e.g. media picked in the panel).
            var fields = d.fields && typeof d.fields === "object" ? d.fields : {};
            targets().forEach(function (t) {
                if (t.key in fields) writeValue(t.el, t.mode, fields[t.key]);
            });
            return;
        }
        if (d.type === "edit") {
            toggle(!!d.editing);
            if (d.editing) {
                var first = targets().filter(function (t) {
                    return isInline(t.mode);
                })[0];
                if (first) first.el.focus();
            }
            return;
        }
    });

    // Minimal edit-mode outline; override `.flowcms-edit-on` in your own CSS to taste.
    var style = document.createElement("style");
    style.textContent =
        ".flowcms-edit-on{outline:2px dashed rgba(108,92,231,.5);outline-offset:4px;border-radius:4px;cursor:text}.flowcms-edit-on:focus{outline-color:rgba(108,92,231,1)}" +
        ".flowcms-picking,.flowcms-picking *{cursor:crosshair !important}" +
        ".flowcms-hover{outline:2px solid rgba(108,92,231,.95) !important;outline-offset:2px;background:rgba(108,92,231,.10) !important}" +
        ".flowcms-arr-add{display:inline-flex;align-items:center;gap:.375rem;margin:.75rem 0;padding:.4375rem .875rem;font:600 .8125rem/1 system-ui,-apple-system,sans-serif;color:#fff;background:#6c5ce7;border:0;border-radius:.5rem;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.18)}" +
        ".flowcms-arr-add:hover{background:#5a4bd4}" +
        ".flowcms-arr-remove{position:absolute;top:.375rem;right:.375rem;z-index:9;width:1.375rem;height:1.375rem;display:inline-flex;align-items:center;justify-content:center;padding:0;font:700 .9375rem/1 system-ui,sans-serif;color:#fff;background:rgba(214,48,49,.94);border:0;border-radius:999px;cursor:pointer;opacity:0;transition:opacity .12s}" +
        "[data-flowcms-item]:hover>.flowcms-arr-remove,.flowcms-arr-remove:focus{opacity:1}";
    document.head.appendChild(style);

    baseline = snapshot();
    // Handshake: tell the studio this page supports live editing.
    post({ type: "ready", editable: true });
})();
