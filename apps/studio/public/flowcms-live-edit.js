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
        ".flowcms-edit-on{outline:2px dashed rgba(108,92,231,.5);outline-offset:4px;border-radius:4px;cursor:text}.flowcms-edit-on:focus{outline-color:rgba(108,92,231,1)}";
    document.head.appendChild(style);

    baseline = snapshot();
    // Handshake: tell the studio this page supports live editing.
    post({ type: "ready", editable: true });
})();
