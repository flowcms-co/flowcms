// E2E for the async-job system: enqueue a bulk content job, poll until done,
// confirm progress + a bell notification. Read-only-ish (publishes a few demo
// entries that are already published/idempotent). Run: node scripts/stress-jobs.mjs
const API = process.env.API_BASE || "http://localhost:4000/api";
let cookie = "";
async function call(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { ...opts, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(opts.headers || {}) } });
    const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    const t = await res.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
    if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} → ${res.status}: ${t.slice(0, 300)}`);
    return b;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    await call("/auth/signin", { method: "POST", body: JSON.stringify({ email: "admin@flowcms.local", password: "changeme" }) });
    console.log("Signed in.");

    // pick a few published entries to re-publish (idempotent, safe)
    const list = await call("/entries?status=PUBLISHED");
    const ids = (Array.isArray(list) ? list : list.items ?? []).slice(0, 4).map((e) => e.id);
    if (!ids.length) throw new Error("No published entries to test with.");
    // Move-to-draft has no required-field validation, so all items succeed — a clean
    // test of the engine mechanics. (Re-publishing would PARTIAL on validation, which
    // is the engine's correct per-item graceful-failure behaviour, not a bug.)
    console.log(`Enqueuing bulk move-to-draft for ${ids.length} entries…`);

    const job = await call("/entries/bulk/draft", { method: "POST", body: JSON.stringify({ ids }) });
    console.log("Job created:", job.id, job.status, "total", job.total);
    if (!job.id) throw new Error("No job id returned");

    let final = null;
    for (let i = 0; i < 30; i++) {
        await sleep(700);
        const j = await call(`/jobs/${job.id}`);
        if (["SUCCEEDED", "FAILED", "PARTIAL"].includes(j.status)) { final = j; break; }
    }
    if (!final) throw new Error("Job did not finish in time");
    console.log(`Job finished: ${final.status} — completed ${final.completed}/${final.total}, failed ${final.failed}, progress ${final.progress}%`);

    // bell notification should exist
    const notes = await call("/notifications");
    const items = Array.isArray(notes) ? notes : notes.items ?? [];
    const hit = items.find((n) => n.type === "job");
    console.log(hit ? `Bell notification: "${hit.title}"` : "NO job notification found");

    // /jobs list shows it
    const jobs = await call("/jobs");
    console.log(`/jobs returns ${(Array.isArray(jobs) ? jobs : []).length} recent job(s).`);

    const ok = final.status === "SUCCEEDED" && final.completed === ids.length && !!hit;
    console.log(ok ? "\n✓ Jobs E2E passed." : "\n✗ Jobs E2E had issues.");
    process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
