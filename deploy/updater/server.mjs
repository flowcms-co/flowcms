#!/usr/bin/env node
/**
 * Flow CMS updater — a small privileged sidecar for the docker-compose self-host.
 * It performs FULL backups (Postgres + media + .env) and, in a later phase, the
 * one-click upgrade + rollback. It is the only piece with access to the Docker
 * socket + the compose dir, and it survives while the api/studio containers
 * restart. Reachable ONLY on the internal docker network (no published port),
 * authenticated with a shared UPDATER_TOKEN. Plain Node http + shelling out to
 * docker/tar/gzip — no dependencies.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";

const PORT = Number(process.env.UPDATER_PORT || 9000);
const TOKEN = process.env.UPDATER_TOKEN || "";
const FLOWCMS_DIR = process.env.FLOWCMS_DIR || "/opt/flowcms";
const MEDIA_DIR = process.env.MEDIA_DIR || "/media";
const BACKUP_DIR = path.join(FLOWCMS_DIR, "backups");
const KEEP = Number(process.env.BACKUP_KEEP || 5);
// Backup retention is capped by BOTH count (KEEP) and total size, so a few large-media
// backups can't fill the disk on their own. The newest backup is always kept.
const BACKUP_MAX_GB = Number(process.env.BACKUP_MAX_GB || 10);
// Required free space before an upgrade pulls new images. A full disk is the most common
// cause of a failed pull; we reclaim first, then refuse with a clear message if still low.
const MIN_FREE_GB = Number(process.env.UPGRADE_MIN_FREE_GB || 6);
const PROJECT = process.env.COMPOSE_PROJECT || "flowcms";

if (!TOKEN) {
    console.error("[updater] UPDATER_TOKEN is required");
    process.exit(1);
}

const log = (...a) => console.log("[updater]", ...a);

/** Run a command, resolving its stdout (rejects on non-zero exit). */
function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, opts);
        let out = "";
        let err = "";
        p.stdout?.on("data", (d) => (out += d));
        p.stderr?.on("data", (d) => (err += d));
        p.on("error", reject);
        p.on("close", (code) => {
            if (code === 0) resolve(out);
            else reject(new Error(`${cmd} ${args.join(" ")} -> ${code}: ${err.slice(-500)}`));
        });
    });
}

/** Parse the compose .env (KEY=value lines) for DB creds etc. */
async function readEnv() {
    const txt = await fsp.readFile(path.join(FLOWCMS_DIR, ".env"), "utf8").catch(() => "");
    const env = {};
    for (const line of txt.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] = m[2];
    }
    return env;
}

/** Resolve the Postgres container (by compose labels, or an explicit override). */
async function pgContainer() {
    if (process.env.PG_CONTAINER) return process.env.PG_CONTAINER;
    const ids = await run("docker", [
        "ps",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${PROJECT}`,
        "--filter",
        "label=com.docker.compose.service=postgres",
    ]);
    const id = ids.trim().split("\n")[0].trim();
    if (!id) throw new Error("postgres container not found");
    return id;
}

const backupId = () => "flowcms-" + new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
const safeId = (id) => /^flowcms-[\w-]+$/.test(id);

/** Create a full backup: pg_dump (gzip) + media tarball + .env, packed into a
 *  single <id>.tar.gz with a sidecar <id>.json manifest. Applies retention. */
async function createBackup() {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const id = backupId();
    const dir = path.join(BACKUP_DIR, id);
    await fsp.mkdir(dir, { recursive: true });
    try {
        const env = await readEnv();
        const pgC = await pgContainer();
        const user = env.POSTGRES_USER || "flowcms";
        const db = env.POSTGRES_DB || "flowcms";

        // 1. DB dump via the postgres container (matches the server's pg version).
        await new Promise((resolve, reject) => {
            const dump = spawn("docker", [
                "exec",
                "-e",
                `PGPASSWORD=${env.POSTGRES_PASSWORD || ""}`,
                pgC,
                "pg_dump",
                "-U",
                user,
                "-d",
                db,
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
            ]);
            const out = fs.createWriteStream(path.join(dir, "db.sql.gz"));
            let err = "";
            dump.stderr.on("data", (d) => (err += d));
            dump.on("error", reject);
            dump.stdout.pipe(createGzip()).pipe(out);
            out.on("error", reject);
            dump.on("close", (code) => (code === 0 ? resolve() : reject(new Error("pg_dump failed: " + err.slice(-400)))));
        });

        // 2. Media archive (uploaded files).
        if (fs.existsSync(MEDIA_DIR)) await run("tar", ["-czf", path.join(dir, "media.tar.gz"), "-C", MEDIA_DIR, "."]);
        else await fsp.writeFile(path.join(dir, "media.tar.gz"), "");

        // 3. .env — contains SECRETS_ENCRYPTION_KEY; required to decrypt restored data.
        await fsp.copyFile(path.join(FLOWCMS_DIR, ".env"), path.join(dir, "env")).catch(() => undefined);

        // 4. Manifest.
        const dbBytes = (await fsp.stat(path.join(dir, "db.sql.gz"))).size;
        const mediaBytes = (await fsp.stat(path.join(dir, "media.tar.gz")).catch(() => ({ size: 0 }))).size;
        const manifest = { id, createdAt: new Date().toISOString(), version: process.env.FLOWCMS_VERSION || null, dbBytes, mediaBytes };
        await fsp.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

        // 5. Pack into one tarball + a sidecar manifest for fast listing.
        await run("tar", ["-czf", path.join(BACKUP_DIR, id + ".tar.gz"), "-C", BACKUP_DIR, id]);
        const totalBytes = (await fsp.stat(path.join(BACKUP_DIR, id + ".tar.gz"))).size;
        const listManifest = { ...manifest, totalBytes };
        await fsp.writeFile(path.join(BACKUP_DIR, id + ".json"), JSON.stringify(listManifest, null, 2));
        await fsp.rm(dir, { recursive: true, force: true });
        await pruneBackups();
        return listManifest;
    } catch (e) {
        await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
        throw e;
    }
}

async function listBackups() {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    // Only backup manifests, named <id>.json. Exclude upgrade-status.json (it lives
    // in this dir too) and any stray json, so the list never shows a phantom entry
    // with an "Invalid Date" / "NaN MB" because the file isn't a real backup.
    const files = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.endsWith(".json") && f !== "upgrade-status.json");
    const out = [];
    for (const f of files) {
        try {
            const m = JSON.parse(await fsp.readFile(path.join(BACKUP_DIR, f), "utf8"));
            if (m && m.id && m.createdAt) out.push(m);
        } catch {
            /* skip unreadable manifest */
        }
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function deleteBackup(id) {
    if (!safeId(id)) throw new Error("bad backup id");
    await fsp.rm(path.join(BACKUP_DIR, id + ".tar.gz"), { force: true });
    await fsp.rm(path.join(BACKUP_DIR, id + ".json"), { force: true });
}

async function pruneBackups() {
    const all = await listBackups(); // newest -> oldest
    const capBytes = BACKUP_MAX_GB * 1024 ** 3;
    const keep = new Set();
    let cumulative = 0;
    all.forEach((b, i) => {
        cumulative += Number(b.totalBytes || 0);
        // Always keep the newest; keep the rest only while within both the count and the
        // cumulative-size cap, so retention can never grow the disk without bound.
        if (keep.size === 0 || (i < KEEP && cumulative <= capBytes)) keep.add(b.id);
    });
    for (const b of all) if (!keep.has(b.id)) await deleteBackup(b.id).catch(() => undefined);
}

// ── Upgrade orchestration ────────────────────────────────────────────────────
const COMPOSE_FILE = process.env.COMPOSE_FILE || path.join(FLOWCMS_DIR, "docker-compose.prod.yml");
const ENV_FILE = path.join(FLOWCMS_DIR, ".env");
const STATUS_FILE = path.join(BACKUP_DIR, "upgrade-status.json");
const HEALTH_TIMEOUT = Number(process.env.UPGRADE_HEALTH_TIMEOUT || 150); // seconds to wait for healthy
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run `docker compose` against the install's compose file + .env + project. */
function compose(...args) {
    return run("docker", ["compose", "--env-file", ENV_FILE, "-f", COMPOSE_FILE, "-p", PROJECT, ...args]);
}

/** Free space (GB) on the filesystem holding the install dir. Null if it can't be read. */
async function freeGB(dir = FLOWCMS_DIR) {
    try {
        const out = await run("df", ["-Pk", dir]);
        const cols = out.trim().split("\n").pop().trim().split(/\s+/);
        const availKb = Number(cols[3]); // df -P columns: fs, blocks, used, available, %, mount
        return Number.isFinite(availKb) ? availKb / (1024 * 1024) : null;
    } catch {
        return null;
    }
}

/** Reclaim disk: drop images not used by a running container + build cache. Best-effort;
 *  never throws. With the containerd image store this also frees the overlayfs snapshots.
 *  Volumes (database + media) are never touched. */
async function reclaimDisk() {
    await run("docker", ["image", "prune", "-a", "-f"]).catch(() => undefined);
    await run("docker", ["builder", "prune", "-a", "-f"]).catch(() => undefined);
}

/** Replace the tag (the ":tag" after the last "/") of an image ref. */
function retag(ref, tag) {
    const slash = ref.lastIndexOf("/");
    const colon = ref.lastIndexOf(":");
    const base = colon > slash ? ref.slice(0, colon) : ref;
    return `${base}:${tag}`;
}

/** Update keys in .env in place, preserving everything else + mode 600. */
async function writeEnvKeys(updates) {
    let txt = await fsp.readFile(ENV_FILE, "utf8");
    for (const [k, v] of Object.entries(updates)) {
        const re = new RegExp(`^${k}=.*$`, "m");
        if (re.test(txt)) txt = txt.replace(re, `${k}=${v}`);
        else txt += (txt.endsWith("\n") ? "" : "\n") + `${k}=${v}\n`;
    }
    await fsp.writeFile(ENV_FILE, txt, { mode: 0o600 });
}

/** Poll the API health endpoint (internal network) until healthy or timeout. */
async function waitHealthy(seconds) {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch("http://api:4000/api/health", { signal: AbortSignal.timeout(4000) });
            if (res.ok) return true;
        } catch {
            /* not up yet */
        }
        await sleep(3000);
    }
    return false;
}

let job = null;
async function setStatus(patch) {
    job = { ...(job || {}), ...patch, updatedAt: new Date().toISOString() };
    await fsp.mkdir(BACKUP_DIR, { recursive: true }).catch(() => undefined);
    await fsp.writeFile(STATUS_FILE, JSON.stringify(job)).catch(() => undefined);
    return job;
}
async function getStatus() {
    if (job) return job;
    try {
        return JSON.parse(await fsp.readFile(STATUS_FILE, "utf8"));
    } catch {
        return null;
    }
}

async function currentImages() {
    const env = await readEnv();
    return {
        api: env.API_IMAGE || "ghcr.io/flowcms-co/flowcms-api:latest",
        studio: env.STUDIO_IMAGE || "ghcr.io/flowcms-co/flowcms-studio:latest",
    };
}

/** Restore DB + media (and optionally .env) from a packed backup tarball. */
async function restoreFromBackup(id, { restoreEnv = false } = {}) {
    if (!safeId(id)) throw new Error("bad backup id");
    const tarball = path.join(BACKUP_DIR, id + ".tar.gz");
    if (!fs.existsSync(tarball)) throw new Error("backup not found");
    const work = path.join(BACKUP_DIR, ".restore-" + id);
    await fsp.rm(work, { recursive: true, force: true });
    await fsp.mkdir(work, { recursive: true });
    try {
        await run("tar", ["-xzf", tarball, "-C", work]);
        const inner = path.join(work, id);
        const env = await readEnv();
        const pgC = await pgContainer();
        const user = env.POSTGRES_USER || "flowcms";
        const db = env.POSTGRES_DB || "flowcms";
        // DB: gunzip the dump and pipe it into psql inside the postgres container.
        await new Promise((resolve, reject) => {
            const psql = spawn("docker", ["exec", "-i", "-e", `PGPASSWORD=${env.POSTGRES_PASSWORD || ""}`, pgC, "psql", "-U", user, "-d", db], { stdio: ["pipe", "ignore", "pipe"] });
            let err = "";
            psql.stderr.on("data", (d) => (err += d));
            psql.on("error", reject);
            psql.on("close", (code) => (code === 0 ? resolve() : reject(new Error("psql restore failed: " + err.slice(-400)))));
            const gunzip = spawn("gunzip", ["-c", path.join(inner, "db.sql.gz")]);
            gunzip.on("error", reject);
            gunzip.stdout.pipe(psql.stdin);
        });
        // Media: replace the media directory contents.
        const mediaTar = path.join(inner, "media.tar.gz");
        if (fs.existsSync(mediaTar) && (await fsp.stat(mediaTar)).size > 0) {
            await run("sh", ["-c", `rm -rf "${MEDIA_DIR}"/* "${MEDIA_DIR}"/.[!.]* 2>/dev/null; true`]);
            await run("tar", ["-xzf", mediaTar, "-C", MEDIA_DIR]);
        }
        if (restoreEnv && fs.existsSync(path.join(inner, "env"))) {
            await fsp.copyFile(path.join(inner, "env"), ENV_FILE);
            await fsp.chmod(ENV_FILE, 0o600).catch(() => undefined);
        }
    } finally {
        await fsp.rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function runUpgrade(ctx) {
    try {
        // Pre-flight: reclaim stale/unused images first (a previous failed upgrade may have
        // left some behind), then require enough headroom for the backup + the new pull. A
        // full disk is the #1 cause of a failed pull; fail with a clear message instead of a
        // cryptic registry error, and never even start a doomed upgrade.
        await reclaimDisk();
        const free = await freeGB();
        if (free != null && free < MIN_FREE_GB) {
            throw new Error(`Not enough disk space to upgrade safely: only ${free.toFixed(1)} GB free, about ${MIN_FREE_GB} GB is needed. Free some space (old backups or unused images) and try again.`);
        }

        await setStatus({ step: "backup" });
        const backup = await createBackup();
        ctx.backupId = backup.id;
        await setStatus({ backupId: backup.id });

        await setStatus({ step: "download" });
        await writeEnvKeys({ API_IMAGE: ctx.newApi, STUDIO_IMAGE: ctx.newStudio });
        // Pull the new images, retrying a few times so a transient registry/network
        // blip doesn't fail the whole upgrade. GHCR throttles anonymous pulls and an
        // occasional 5xx/timeout is expected; a short backoff clears almost all of them.
        let pullErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await compose("pull", "api", "studio");
                pullErr = null;
                break;
            } catch (e) {
                pullErr = e;
                if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 3000));
            }
        }
        if (pullErr) {
            // Every pull attempt failed. Local/offline test images may not be in a
            // registry at all, so accept them if both are already present locally.
            // Otherwise surface the REAL pull error — not a misleading "No such image"
            // from the inspect fallback, which only fails because nothing was pulled.
            try {
                await run("docker", ["image", "inspect", ctx.newApi]);
                await run("docker", ["image", "inspect", ctx.newStudio]);
            } catch {
                throw new Error(`could not pull ${ctx.newApi}: ${pullErr.message || pullErr}`);
            }
        }

        await setStatus({ step: "migrate" });
        await compose("up", "-d", "api", "studio");

        await setStatus({ step: "verify" });
        if (!(await waitHealthy(HEALTH_TIMEOUT))) throw new Error("the new version did not become healthy in time");

        await setStatus({ status: "success", step: "done", finishedAt: new Date().toISOString() });
    } catch (e) {
        await rollback(ctx, e?.message || String(e));
    } finally {
        // Reclaim disk on BOTH paths. On success this drops the prior versions just
        // replaced; on failure it drops the freshly-pulled (now-unused) images so a loop
        // of failed upgrades can never pile up in the image store and fill the disk (the
        // old code only pruned after success, so failed attempts accumulated unbounded).
        // Best-effort and last, so it can never change the upgrade's outcome.
        await reclaimDisk();
    }
}

async function rollback(ctx, reason) {
    await setStatus({ status: "rolling_back", step: "rollback", error: reason });
    try {
        await writeEnvKeys({ API_IMAGE: ctx.curApi, STUDIO_IMAGE: ctx.curStudio });
        try {
            await compose("pull", "api", "studio");
        } catch {
            /* the old images are present locally */
        }
        await compose("up", "-d", "api", "studio");
        let ok = await waitHealthy(HEALTH_TIMEOUT);
        // If the failed upgrade applied a migration the old image can't run, restore
        // the pre-upgrade database so the rolled-back version is consistent.
        if (!ok && ctx.backupId) {
            await setStatus({ step: "restore_db" });
            await restoreFromBackup(ctx.backupId, { restoreEnv: false }).catch(() => undefined);
            await compose("up", "-d", "api", "studio");
            ok = await waitHealthy(HEALTH_TIMEOUT);
        }
        await setStatus({ status: ok ? "rolled_back" : "failed", step: ok ? "done" : "rollback_failed", error: reason, finishedAt: new Date().toISOString() });
    } catch (e) {
        await setStatus({ status: "failed", step: "rollback_failed", error: `${reason}; rollback also failed: ${e?.message || e}` });
    }
}

async function startUpgrade({ toVersion, apiImage, studioImage } = {}) {
    if (job && job.status === "running") throw new Error("an upgrade is already in progress");
    const cur = await currentImages();
    const v = toVersion ? "v" + String(toVersion).replace(/^v/, "") : null;
    const newApi = apiImage || (v ? retag(cur.api, v) : cur.api);
    const newStudio = studioImage || (v ? retag(cur.studio, v) : cur.studio);
    const id = "upg-" + new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
    await setStatus({ id, status: "running", step: "starting", toVersion: toVersion || null, from: cur, to: { api: newApi, studio: newStudio }, backupId: null, error: null, startedAt: new Date().toISOString(), finishedAt: null });
    // Fire-and-forget: api/studio restart mid-run, so the studio polls /status.
    runUpgrade({ curApi: cur.api, curStudio: cur.studio, newApi, newStudio, backupId: null }).catch((e) => setStatus({ status: "failed", step: "error", error: e?.message || String(e) }));
    return getStatus();
}

function readJson(req) {
    return new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c));
        req.on("end", () => {
            try {
                resolve(d ? JSON.parse(d) : {});
            } catch {
                resolve({});
            }
        });
    });
}

const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
    };
    try {
        if ((req.headers.authorization || "") !== `Bearer ${TOKEN}`) return send(401, { error: "unauthorized" });
        const url = new URL(req.url, "http://updater");

        if (req.method === "GET" && url.pathname === "/health") return send(200, { ok: true, version: process.env.FLOWCMS_VERSION || null });
        if (req.method === "GET" && url.pathname === "/backups") return send(200, { backups: await listBackups() });
        if (req.method === "POST" && url.pathname === "/backups") return send(201, await createBackup());

        const dl = url.pathname.match(/^\/backups\/([\w-]+)\/download$/);
        if (req.method === "GET" && dl && safeId(dl[1])) {
            const file = path.join(BACKUP_DIR, dl[1] + ".tar.gz");
            if (!fs.existsSync(file)) return send(404, { error: "not found" });
            res.writeHead(200, { "content-type": "application/gzip", "content-disposition": `attachment; filename="${dl[1]}.tar.gz"` });
            return fs.createReadStream(file).pipe(res);
        }

        const del = url.pathname.match(/^\/backups\/([\w-]+)$/);
        if (req.method === "DELETE" && del) {
            await deleteBackup(del[1]);
            return send(200, { ok: true });
        }

        // ── Upgrade / restore ──
        if (req.method === "GET" && url.pathname === "/images") return send(200, await currentImages());
        if (req.method === "GET" && url.pathname === "/status") return send(200, (await getStatus()) || { status: "idle" });
        if (req.method === "POST" && url.pathname === "/upgrade") return send(202, await startUpgrade(await readJson(req)));
        const rs = url.pathname.match(/^\/restore\/([\w-]+)$/);
        if (req.method === "POST" && rs) {
            const body = await readJson(req);
            await restoreFromBackup(rs[1], { restoreEnv: !!body.restoreEnv });
            return send(200, { ok: true });
        }

        return send(404, { error: "not found" });
    } catch (e) {
        log("error", e?.message || e);
        send(500, { error: e?.message || "internal error" });
    }
});

server.listen(PORT, () => log(`updater listening on :${PORT} (dir=${FLOWCMS_DIR})`));
