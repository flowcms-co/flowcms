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
            post({ type: "fields", fields: snapshot() });
        }, 200);
    }

    var editing = false;
    function toggle(on) {
        editing = on;
        targets().forEach(function (t) {
            if (!isInline(t.mode)) return; // images/links are edited from the studio panel
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
    }

    function applyMap(bindings) {
        mapBindings = Array.isArray(bindings) ? bindings : [];
        baseline = snapshot();
        if (editing) {
            toggle(false);
            toggle(true);
        }
        post({ type: "fields", fields: snapshot() });
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
        ".flowcms-hover{outline:2px solid rgba(108,92,231,.95) !important;outline-offset:2px;background:rgba(108,92,231,.10) !important}";
    document.head.appendChild(style);

    baseline = snapshot();
    // Handshake: tell the studio this page supports live editing.
    post({ type: "ready", editable: true });
})();
