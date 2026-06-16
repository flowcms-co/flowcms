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
 * 1. Add the script:           <script src="/flowcms-live-edit.js" defer></script>
 * 2. Mark editable regions with the matching content-model field name:
 *
 *      <h1 data-flowcms-field="title">{{ title }}</h1>
 *      <p  data-flowcms-field="summary">{{ summary }}</p>
 *      <div data-flowcms-field="body" data-flowcms-rich>{{ body }}</div>
 *
 *    - data-flowcms-field="<name>"  the content-model field name. Use "title" for the
 *                                entry title; any other name writes to entry data.
 *    - data-flowcms-rich            keep rich HTML for this field (e.g. a body). Omit
 *                                it for single-line text (edited plaintext-only).
 *
 * When an editor clicks "Edit page" in the studio, the marked elements become
 * editable; edits stream back and "Save changes" persists them to the entry.
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

    function nodes() {
        return Array.prototype.slice.call(document.querySelectorAll("[data-flowcms-field]"));
    }
    function fieldName(el) {
        return el.getAttribute("data-flowcms-field") || "";
    }
    function isRich(el) {
        return el.hasAttribute("data-flowcms-rich");
    }
    function readValue(el) {
        return isRich(el) ? el.innerHTML : el.textContent || "";
    }
    function writeValue(el, v) {
        if (isRich(el)) el.innerHTML = v;
        else el.textContent = v;
    }
    function snapshot() {
        var m = {};
        nodes().forEach(function (el) {
            m[fieldName(el)] = readValue(el);
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

    function toggle(on) {
        nodes().forEach(function (el) {
            if (on) {
                el.setAttribute("contenteditable", isRich(el) ? "true" : "plaintext-only");
                el.classList.add("flowcms-edit-on");
                el.addEventListener("input", onInput);
            } else {
                el.removeAttribute("contenteditable");
                el.classList.remove("flowcms-edit-on");
                el.removeEventListener("input", onInput);
            }
        });
    }

    window.addEventListener("message", function (e) {
        if (parentOrigin !== "*" && e.origin !== parentOrigin) return;
        var d = e.data;
        if (!d || d.source !== "flowcms-studio") return;
        if (d.type === "hello") {
            post({ type: "ready", editable: true });
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
            nodes().forEach(function (el) {
                var n = fieldName(el);
                if (n in baseline) writeValue(el, baseline[n]);
            });
            return;
        }
        if (d.type === "edit") {
            toggle(!!d.editing);
            if (d.editing) {
                var first = nodes()[0];
                if (first) first.focus();
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
