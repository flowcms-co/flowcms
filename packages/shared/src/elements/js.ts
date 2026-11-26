/**
 * What GET /api/public/elements.js serves. A small vanilla script that makes every
 * `.flow-el--calculator` live. The server already renders the full static markup, so the page
 * reads fine without it. `window.FlowElements.init(root)` is safe to call again and again:
 * a calculator is bound once. Results are written with textContent, never innerHTML.
 * The maths mirrors calculator.ts.
 */
export const ELEMENTS_JS = `(function (w, d) {
  if (w.FlowElements && w.FlowElements.init) { w.FlowElements.init(); return; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function r10(x) { return Math.round(x / 10) * 10; }
  function n(x) { x = Number(x); return x > 0 && isFinite(x) ? x : 0; }
  function update(box) {
    var calc = box.querySelector(".el-calc");
    if (!calc) return;
    function val(k) { var e = calc.querySelector('[data-k="' + k + '"]'); return e ? e.value : ""; }
    var out, ds = calc.dataset;
    if (ds.preset === "drying") {
      var cat = val("s");
      if (cat !== "gray" && cat !== "black") cat = "clean";
      var base = n(val("a")) * n(ds["rate" + cat.charAt(0).toUpperCase() + cat.slice(1)]);
      out = ["Estimated drying cost", usd(r10(base * 0.8)) + " - " + usd(r10(base * 1.25)), "Typical drying time: 3 to 5 days for " + cat + " water."];
    } else {
      var est = n(val("a")), pay = val("s") === "gradual" ? est : Math.min(est, n(val("b")));
      out = ["You pay", usd(pay), "Insurer may pay " + usd(est - pay)];
    }
    var cap = calc.querySelector(".el-res .el-cap"), v = calc.querySelector(".el-res .v"), note = calc.querySelector(".el-res .el-note");
    if (cap) cap.textContent = out[0];
    if (v) v.textContent = out[1];
    if (note) note.textContent = out[2];
  }
  function init(root) {
    root = root || d;
    var list = root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll(".flow-el--calculator")) : [];
    if (root.matches && root.matches(".flow-el--calculator")) list.push(root);
    list.forEach(function (box) {
      if (box.getAttribute("data-flow-bound")) return;
      box.setAttribute("data-flow-bound", "1");
      box.addEventListener("input", function () { update(box); });
      box.addEventListener("change", function () { update(box); });
      update(box);
    });
  }
  w.FlowElements = { init: init };
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", function () { init(); });
  else init();
})(window, document);
`;
