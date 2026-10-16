import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional, PayloadTooLargeException } from "@nestjs/common";
import { extname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { Prisma, type Media } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { AuditService } from "../audit/audit.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { RedisService } from "../redis/redis.service";
import { BackupsService, BULK_DELETE_SNAPSHOT_AT } from "../backups/backups.service";
import { currentActor } from "../common/request-context";
import { safeFetch } from "../common/ssrf";
import { STORAGE, type StorageDriver } from "./storage";
import { contentMatchesDeclared } from "./magic";

/** Public URL prefix the local static handler serves files at (see main.ts).
 *  `Media.url` stores a driver-agnostic `/media/<key>` reference; the actual URL
 *  is resolved per the active storage driver in `shape()`. */
const URL_PREFIX = "/media";

/** Hard ceiling on any upload, whatever a workspace sets (the workspace's own
 *  limit, `mediaMaxMb`, is checked below it). */
export const UPLOAD_CEILING_BYTES = Math.max(1, Number(process.env.MEDIA_MAX_UPLOAD_MB) || 100) * 1024 * 1024;

/** The extension each accepted type is listed under in a workspace's allowed types.
 *  NOTE: image/svg+xml is intentionally absent, whatever the setting says. SVGs are
 *  XML documents that can carry <script>; served from the API origin at /media they
 *  execute in the app's origin (stored XSS → admin takeover). See
 *  SECURITY_AUDIT_REPORT F-01. Re-add only behind server-side sanitising or a
 *  separate media origin. */
const EXT_OF_MIME: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
    "text/markdown": "md",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const MIME_OF_EXT: Record<string, string> = { ...Object.fromEntries(Object.entries(EXT_OF_MIME).map(([m, e]) => [e, m])), jpeg: "image/jpeg", markdown: "text/markdown" };

/** Fields an asset can be edited by (studio, agent API, bulk). */
export type AssetEdit = { alt?: string; caption?: string | null; filename?: string; folder?: string | null; tags?: string[] };

const DAY_MS = 86_400_000;
const TRASH_DAYS = 30;

export type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

// ── Bound image processing so it can't take the whole API down ──────────────────
// A single sharp decode can hold many times the file's size in RAM, so an unbounded
// burst of uploads (or a bulk alt-text job) on a small box exhausts memory and the
// process gets OOM-killed (the site goes ERR_TIMED_OUT, then restarts). Defences:
//   • libvips: no decode cache between calls; bounded per-op thread pool.
//   • a semaphore so only N images are decoded at once, regardless of request burst.
//   • a hard input-pixel cap so a decompression-bomb image is rejected, not decoded.
// All tunable via env for larger instances.
sharp.cache(false);
sharp.concurrency(Math.max(1, Number(process.env.SHARP_CONCURRENCY) || 1));

const MAX_INPUT_PIXELS = Math.max(1_000_000, Number(process.env.MEDIA_MAX_PIXELS) || 50_000_000); // ~50 MP
const SHARP_OPTS = { failOn: "none" as const, limitInputPixels: MAX_INPUT_PIXELS };

/** Minimal counting semaphore: hands a freed slot directly to the next waiter so the
 *  active count can never exceed `max` (no increment race on release). */
class Semaphore {
    private active = 0;
    private readonly queue: (() => void)[] = [];
    constructor(private readonly max: number) {}
    private acquire(): Promise<void> {
        if (this.active < this.max) {
            this.active++;
            return Promise.resolve();
        }
        return new Promise<void>((res) => this.queue.push(res));
    }
    private release(): void {
        const next = this.queue.shift();
        if (next) next(); // hand the slot over (active unchanged)
        else this.active--; // slot is now free
    }
    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}
const imageGate = new Semaphore(Math.max(1, Number(process.env.MEDIA_PROCESS_CONCURRENCY) || 2));
// Separate (small) lane for AI alt-text downscaling so a big background bulk job
// can't starve interactive uploads of the imageGate. Bounds total concurrent
// decodes to imageGate + altGate.
const altGate = new Semaphore(Math.max(1, Number(process.env.MEDIA_ALT_CONCURRENCY) || 1));

@Injectable()
export class AssetsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger("AssetsService");
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly ai: AiService,
        @Inject(STORAGE) private readonly storage: StorageDriver,
        @Optional() private readonly audit?: AuditService,
        @Optional() private readonly webhooks?: WebhooksService,
        @Optional() private readonly redis?: RedisService,
        @Optional() private readonly backups?: BackupsService,
    ) {}

    onModuleInit() {
        // Empty the "Deleted items" bin of anything past its 30 days.
        this.timer = setInterval(() => void this.purgeDeleted(), 6 * 3_600_000);
        this.timer.unref?.();
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /** Log a media action (actor, IP, old and new values) to the activity log. */
    private async log(workspaceId: string, action: string, m: { id: string; filename: string; mimeType?: string }, metadata?: Record<string, unknown>) {
        await this.audit?.log({ workspaceId, action, resource: "Media", resourceId: m.id, title: m.filename, entryType: "media", metadata: metadata ?? null });
    }

    /** Tell subscribed sites about a media change (best effort). */
    private emit(workspaceId: string, event: "media.created" | "media.updated" | "media.replaced" | "media.deleted", payload: unknown) {
        void this.webhooks?.dispatch(workspaceId, event, payload);
    }

    private kind(mime: string): "image" | "video" | "doc" {
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        return "doc";
    }

    private humanSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /** Object key for a media row (e.g. "<uuid>.png"), from its stored reference. */
    private keyOf(m: Media): string {
        return basename(m.url);
    }

    private thumbKey(key: string): string {
        return `${key.replace(/\.[^.]+$/, "")}_thumb.webp`;
    }

    /** Resolve a stored object key to a servable URL (local /media or absolute CDN). */
    private urlOf(key: string): string {
        return this.storage.publicUrl(key) ?? `${URL_PREFIX}/${key}`;
    }

    /** Ids of assets that have a twin in the workspace: the same bytes (hash) or the
     *  same file name, ignoring case. Name matching also covers files uploaded before
     *  hashes were recorded.
     *  ponytail: self-join per call, fine at media-library scale; add an index on
     *  lower(filename) if it ever shows up in a profile. */
    private async duplicateIds(workspaceId: string): Promise<Set<string>> {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT m.id FROM "Media" m
            WHERE m."workspaceId" = ${workspaceId} AND EXISTS (
                SELECT 1 FROM "Media" o
                WHERE o."workspaceId" = m."workspaceId" AND o.id <> m.id
                  AND (o.hash = m.hash OR lower(o.filename) = lower(m.filename))
            )`;
        return new Set(rows.map((r) => r.id));
    }

    private shape(m: Media, duplicate = false) {
        const key = this.keyOf(m);
        const ext = extname(key).replace(".", "").toUpperCase();
        const type = this.kind(m.mimeType);
        const hasThumb = type === "image" && m.mimeType !== "image/svg+xml";
        const url = this.urlOf(key);
        return {
            id: m.id,
            name: m.filename,
            type,
            ext: ext || (type === "image" ? "IMG" : "FILE"),
            mimeType: m.mimeType,
            sizeBytes: m.size,
            size: this.humanSize(m.size),
            dimensions: m.width && m.height ? `${m.width}×${m.height}` : undefined,
            folder: m.folder ?? "all",
            url,
            thumbUrl: hasThumb ? this.urlOf(this.thumbKey(key)) : url,
            alt: m.alt ?? "",
            altSource: (m.altSource as "ai" | "manual" | "none") ?? "none",
            caption: m.caption ?? "",
            tags: m.tags ?? [],
            width: m.width,
            height: m.height,
            // The reference content fields store (a driver-agnostic `/media/<key>`).
            ref: `${URL_PREFIX}/${key}`,
            duplicate,
            createdById: m.createdById,
            uploadedBy: m.uploadedBy ?? null,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
        };
    }

    async list(workspaceId: string, folder?: string, limit?: number, offset?: number, q?: string, duplicates?: boolean, missingAlt?: boolean) {
        // Bounded by default so the media library never loads an unbounded set into
        // memory; callers may page with limit/offset (clamped to [1, 500]).
        const take = limit != null ? Math.min(Math.max(1, Math.floor(limit)), 500) : 500;
        const skip = offset != null ? Math.max(0, Math.floor(offset)) : 0;
        const search = q?.trim();
        const dupes = await this.duplicateIds(workspaceId);
        const rows = await this.prisma.media.findMany({
            where: {
                workspaceId,
                ...(folder && folder !== "all" ? { folder } : {}),
                ...(search ? { OR: [{ filename: { contains: search, mode: "insensitive" } }, { alt: { contains: search, mode: "insensitive" } }] } : {}),
                // Duplicates view: only files whose bytes match another asset, grouped together.
                ...(duplicates ? { id: { in: [...dupes] } } : {}),
                // Missing-alt view: raster images with no alt text yet (AND keeps it clear of the search OR).
                ...(missingAlt ? { mimeType: { startsWith: "image/" }, AND: [{ OR: [{ altSource: "none" }, { altSource: null }] }] } : {}),
            },
            // Duplicates view: same-named copies sit next to each other, oldest first.
            orderBy: duplicates ? [{ filename: "asc" }, { createdAt: "asc" }] : { createdAt: "desc" },
            take,
            skip,
        });
        // Postgres sorts capitals first, so re-sort ignoring case to keep "Hero" next to "hero".
        if (duplicates) rows.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" }) || +a.createdAt - +b.createdAt);
        return rows.map((m) => this.shape(m, dupes.has(m.id)));
    }

    /** Total assets in the workspace (the list itself is capped at one page). */
    async count(workspaceId: string) {
        return { total: await this.prisma.media.count({ where: { workspaceId } }) };
    }

    /**
     * Compress raster uploads and convert them to WebP (much smaller, broadly
     * supported). JPEG / PNG / AVIF / WebP are re-encoded to WebP at q80 and
     * capped at 2560px on the longest edge (auto-oriented from EXIF first, since
     * WebP drops EXIF). SVG (vector) and GIF (often animated) are preserved as-is;
     * non-images pass through untouched. Set MEDIA_OPTIMIZE_IMAGES=false to skip.
     * Returns the bytes to store plus the resolved name / type / dimensions.
     */
    private async optimizeImage(file: UploadedFile): Promise<{
        buffer: Buffer;
        mimetype: string;
        filename: string;
        width: number | null;
        height: number | null;
    }> {
        const pass = {
            buffer: file.buffer,
            mimetype: file.mimetype,
            filename: file.originalname,
            width: null as number | null,
            height: null as number | null,
        };
        const CONVERTIBLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

        if (process.env.MEDIA_OPTIMIZE_IMAGES === "false" || !CONVERTIBLE.has(file.mimetype)) {
            // Not converting — still record dimensions for raster images (e.g. GIF).
            if (file.mimetype.startsWith("image/") && file.mimetype !== "image/svg+xml") {
                try {
                    const meta = await sharp(file.buffer, SHARP_OPTS).metadata();
                    pass.width = meta.width ?? null;
                    pass.height = meta.height ?? null;
                } catch {
                    /* unreadable — leave dimensions null */
                }
            }
            return pass;
        }

        try {
            const MAX_EDGE = 2560;
            const out = await sharp(file.buffer, SHARP_OPTS)
                .rotate()
                .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer({ resolveWithObject: true });
            return {
                buffer: out.data,
                mimetype: "image/webp",
                filename: `${basename(file.originalname, extname(file.originalname))}.webp`,
                width: out.info.width ?? null,
                height: out.info.height ?? null,
            };
        } catch (e) {
            this.logger.warn(`image optimize failed; storing original: ${e instanceof Error ? e.message : e}`);
            return pass;
        }
    }

    /** The workspace's upload limits: max size and allowed extensions. */
    async limits(workspaceId: string) {
        const w = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { mediaMaxMb: true, mediaAllowedTypes: true } });
        const maxMb = Math.min(w?.mediaMaxMb ?? 25, UPLOAD_CEILING_BYTES / (1024 * 1024));
        const types = (w?.mediaAllowedTypes ?? []).map((t) => t.toLowerCase());
        return { maxMb, maxBytes: maxMb * 1024 * 1024, allowedTypes: types, knownTypes: Object.values(EXT_OF_MIME) };
    }

    async setLimits(workspaceId: string, dto: { maxMb?: number; allowedTypes?: string[] }) {
        const before = await this.limits(workspaceId);
        const known = new Set(Object.values(EXT_OF_MIME));
        const types = dto.allowedTypes?.map((t) => t.toLowerCase().replace(/^\./, "")).map((t) => (t === "jpeg" ? "jpg" : t));
        const unknown = types?.filter((t) => !known.has(t)) ?? [];
        if (unknown.length) throw new BadRequestException(`Not an uploadable type: ${unknown.join(", ")}.${unknown.includes("svg") ? " SVG stays off: an SVG can carry script." : ""}`);
        await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { ...(dto.maxMb !== undefined ? { mediaMaxMb: Math.max(1, Math.min(Math.floor(dto.maxMb), UPLOAD_CEILING_BYTES / (1024 * 1024))) } : {}), ...(types ? { mediaAllowedTypes: [...new Set(types)] } : {}) },
        });
        const after = await this.limits(workspaceId);
        await this.audit?.log({ workspaceId, action: "media.settings", resource: "Workspace", resourceId: workspaceId, metadata: { before: { maxMb: before.maxMb, allowedTypes: before.allowedTypes }, after: { maxMb: after.maxMb, allowedTypes: after.allowedTypes } } });
        return after;
    }

    /** Refuse a file the workspace doesn't accept: too big, a type not on its list, or
     *  bytes that don't match the declared type. */
    private async assertAcceptable(workspaceId: string, file: UploadedFile) {
        if (!file) throw new BadRequestException("No file provided.");
        const { maxBytes, maxMb, allowedTypes } = await this.limits(workspaceId);
        if (file.size > maxBytes) throw new PayloadTooLargeException(`File is larger than ${maxMb} MB.`);
        const ext = EXT_OF_MIME[file.mimetype];
        if (!ext) throw new BadRequestException(`Unsupported file type: ${file.mimetype}${file.mimetype === "image/svg+xml" ? " (SVG can carry script, so it isn't accepted)" : ""}`);
        if (!allowedTypes.includes(ext)) throw new BadRequestException(`.${ext} files aren't allowed in this workspace. Allowed: ${allowedTypes.join(", ")}.`);
        // The MIME type is client-supplied (multipart Content-Type); for types with a
        // reliable magic number, verify the bytes match so a forged header can't smuggle
        // a different file in (e.g. HTML posing as image/png). SECURITY_AUDIT_REPORT F-14.
        if (!contentMatchesDeclared(file.mimetype, file.buffer))
            throw new BadRequestException("File content does not match its declared type.");
    }

    /**
     * Store a file. `dedupe` (the agent API) returns the existing asset when the same
     * bytes are already in the library, instead of storing a copy; the studio stores
     * it and flags the duplicate, leaving the choice to the person.
     */
    async upload(workspaceId: string, userId: string | null, file: UploadedFile, folder?: string, opts: { alt?: string; caption?: string; tags?: string[]; dedupe?: boolean } = {}) {
        await this.assertAcceptable(workspaceId, file);

        // Hash the original bytes (before WebP re-encoding) so re-uploading the same
        // file is flagged as a duplicate, as is a file with an existing name (checked
        // below).
        const hash = createHash("sha256").update(file.buffer).digest("hex");
        if (opts.dedupe) {
            const same = await this.prisma.media.findFirst({ where: { workspaceId, hash }, orderBy: { createdAt: "asc" } });
            if (same) return { ...this.shape(same, true), existing: true };
        }

        // Gate the CPU/RAM-heavy decode so concurrent uploads can't OOM the API.
        const opt = await imageGate.run(() => this.optimizeImage(file));
        const ext = (extname(opt.filename) || `.${opt.mimetype.split("/")[1] ?? "bin"}`).toLowerCase();
        const stored = `${randomUUID()}${ext}`;
        await this.storage.put(stored, opt.buffer, opt.mimetype);
        const duplicate = !!(await this.prisma.media.findFirst({
            where: { workspaceId, OR: [{ hash }, { filename: { equals: opt.filename, mode: "insensitive" } }] },
            select: { id: true },
        }));

        // Web-friendly thumbnail for images (skip SVG), from the stored bytes.
        if (opt.mimetype.startsWith("image/") && opt.mimetype !== "image/svg+xml") {
            try {
                const thumb = await imageGate.run(() =>
                    sharp(opt.buffer, SHARP_OPTS)
                        .resize(640, 640, { fit: "inside", withoutEnlargement: true })
                        .webp({ quality: 78 })
                        .toBuffer(),
                );
                await this.storage.put(this.thumbKey(stored), thumb, "image/webp");
            } catch (e) {
                this.logger.warn(`thumbnail failed for ${stored}: ${e instanceof Error ? e.message : e}`);
            }
        }

        const alt = opts.alt?.trim() || null;
        const media = await this.prisma.media.create({
            data: {
                workspaceId,
                filename: opt.filename,
                mimeType: opt.mimetype,
                size: opt.buffer.length,
                url: `${URL_PREFIX}/${stored}`,
                width: opt.width,
                height: opt.height,
                alt,
                altSource: alt ? "manual" : "none",
                caption: opts.caption?.trim() || null,
                tags: this.cleanTags(opts.tags),
                folder: folder && folder !== "all" ? folder : null,
                hash,
                createdById: userId ?? currentActor().userId,
                uploadedBy: currentActor().name,
            },
        });
        const shaped = this.shape(media, duplicate);
        await this.log(workspaceId, "media.upload", media, { size: media.size, mimeType: media.mimeType, folder: media.folder, ...(alt ? { alt } : {}) });
        this.emit(workspaceId, "media.created", shaped);
        return shaped;
    }

    /** Import a file from a public URL (redirects and private addresses refused). */
    async fetchUrl(workspaceId: string, url: string): Promise<UploadedFile> {
        const { maxBytes, maxMb } = await this.limits(workspaceId);
        let res: Response;
        try {
            res = (await safeFetch(url, {}, { timeoutMs: 20_000, maxRedirects: 3 })) as unknown as Response;
        } catch (e) {
            throw new BadRequestException(`Couldn't fetch that URL: ${e instanceof Error ? e.message : e}`);
        }
        if (!res.ok) throw new BadRequestException(`Couldn't fetch that URL (HTTP ${res.status}).`);
        if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new PayloadTooLargeException(`File is larger than ${maxMb} MB.`);
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > maxBytes) throw new PayloadTooLargeException(`File is larger than ${maxMb} MB.`);
        const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "download") || "download";
        // Trust the server's type when it names one we know; else go by the extension.
        const declared = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        const mimetype = EXT_OF_MIME[declared] ? declared : (MIME_OF_EXT[extname(name).slice(1).toLowerCase()] ?? declared);
        return { originalname: name, mimetype, size: buffer.length, buffer };
    }

    private cleanTags(tags?: string[]): string[] {
        return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 50);
    }

    async update(workspaceId: string, id: string, dto: AssetEdit) {
        const existing = await this.prisma.media.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Asset not found.");
        const data: Prisma.MediaUpdateInput = {};
        if (dto.alt !== undefined) {
            data.alt = dto.alt;
            data.altSource = dto.alt.trim() ? "manual" : "none";
        }
        if (dto.caption !== undefined) data.caption = dto.caption?.trim() || null;
        if (dto.tags !== undefined) data.tags = this.cleanTags(dto.tags);
        if (dto.folder !== undefined) data.folder = dto.folder && dto.folder !== "all" ? dto.folder : null;
        if (dto.filename !== undefined) data.filename = this.cleanFilename(dto.filename, existing.filename);
        const m = await this.prisma.media.update({ where: { id }, data });
        // Old and new value of each field that changed.
        const keys = ["alt", "caption", "tags", "folder", "filename"] as const;
        const changes = keys
            .filter((k) => JSON.stringify(existing[k] ?? null) !== JSON.stringify(m[k] ?? null))
            .map((k) => ({ path: k, before: existing[k] ?? null, after: m[k] ?? null }));
        const shaped = this.shape(m, (await this.duplicateIds(workspaceId)).has(m.id));
        if (changes.length) {
            const moved = changes.length === 1 && changes[0].path === "folder";
            await this.log(workspaceId, moved ? "media.move" : "media.edit", m, { changes });
            this.emit(workspaceId, "media.updated", { ...shaped, changes });
        }
        return shaped;
    }

    /** Edit many assets in one call (e.g. fill missing alt text on 50 images). Each
     *  item succeeds or fails on its own. */
    async updateMany(workspaceId: string, items: (AssetEdit & { id: string })[]) {
        const results: { id: string; ok: boolean; error?: string; asset?: ReturnType<AssetsService["shape"]> }[] = [];
        for (const { id, ...edit } of items.slice(0, 200)) {
            try {
                results.push({ id, ok: true, asset: await this.update(workspaceId, id, edit) });
            } catch (e) {
                results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
            }
        }
        return { updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
    }

    /** One asset, by id, with who uploaded it. */
    async get(workspaceId: string, id: string) {
        const m = await this.prisma.media.findFirst({ where: { id, workspaceId } });
        if (!m) throw new NotFoundException("Asset not found.");
        return this.shape(m, (await this.duplicateIds(workspaceId)).has(m.id));
    }

    /**
     * Swap an asset's file and keep its id. The new file is stored under a new key
     * (so caches and CDNs can't serve the old bytes), and every entry using the asset,
     * live and draft, is pointed at it in one step: pages update without anyone
     * editing them. The old file is kept, so older versions of those entries still
     * render. Fires media.replaced with the entries affected.
     */
    async replace(workspaceId: string, id: string, file: UploadedFile) {
        const existing = await this.prisma.media.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Asset not found.");
        await this.assertAcceptable(workspaceId, file);
        const hash = createHash("sha256").update(file.buffer).digest("hex");
        const opt = await imageGate.run(() => this.optimizeImage(file));
        const ext = (extname(opt.filename) || `.${opt.mimetype.split("/")[1] ?? "bin"}`).toLowerCase();
        const stored = `${randomUUID()}${ext}`;
        await this.storage.put(stored, opt.buffer, opt.mimetype);
        if (opt.mimetype.startsWith("image/")) {
            try {
                const thumb = await imageGate.run(() => sharp(opt.buffer, SHARP_OPTS).resize(640, 640, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer());
                await this.storage.put(this.thumbKey(stored), thumb, "image/webp");
            } catch (e) {
                this.logger.warn(`thumbnail failed for ${stored}: ${e instanceof Error ? e.message : e}`);
            }
        }
        const oldKey = this.keyOf(existing);
        const affected = await this.usageOf(workspaceId, existing);
        // Keys are random UUIDs, so a text replace of the key touches nothing else.
        const [m] = await this.prisma.$transaction([
            this.prisma.media.update({
                where: { id },
                data: {
                    url: `${URL_PREFIX}/${stored}`,
                    mimeType: opt.mimetype,
                    size: opt.buffer.length,
                    width: opt.width,
                    height: opt.height,
                    hash,
                    // A renamed extension follows the new file; the name stays the person's.
                    filename: `${basename(existing.filename, extname(existing.filename))}${extname(opt.filename) || extname(existing.filename)}`,
                },
            }),
            this.prisma.$executeRaw`
                UPDATE "ContentEntry" SET
                    "data" = replace("data"::text, ${oldKey}, ${stored})::jsonb,
                    "draftData" = CASE WHEN "draftData" IS NULL THEN NULL ELSE replace("draftData"::text, ${oldKey}, ${stored})::jsonb END
                WHERE "workspaceId" = ${workspaceId} AND ("data"::text LIKE ${`%${oldKey}%`} OR COALESCE("draftData"::text, '') LIKE ${`%${oldKey}%`})`,
        ]);
        const shaped = this.shape(m, (await this.duplicateIds(workspaceId)).has(m.id));
        await this.log(workspaceId, "media.replace", m, {
            changes: [{ path: "file", before: `${URL_PREFIX}/${oldKey}`, after: `${URL_PREFIX}/${stored}` }],
            before: { size: existing.size, mimeType: existing.mimeType, width: existing.width, height: existing.height },
            after: { size: m.size, mimeType: m.mimeType, width: m.width, height: m.height },
            affectedEntries: affected.map((a) => ({ id: a.id, type: a.type, title: a.title, slug: a.slug, fields: a.fields })),
        });
        this.emit(workspaceId, "media.replaced", { ...shaped, previousUrl: this.urlOf(oldKey), entries: affected });
        return { ...shaped, affectedEntries: affected };
    }

    /** Validate a rename. Only the display name changes (the stored object key and URL
     *  stay put, so pages using the image keep working), and the file's real
     *  extension is always kept: "Team photo" or "Team photo.webp" → "Team photo.webp". */
    private cleanFilename(input: string, current: string): string {
        const ext = extname(current);
        let base = input.replace(/[\u0000-\u001f\u007f]/g, "").trim();
        if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length).trim();
        if (!base) throw new BadRequestException("Name can’t be empty.");
        if (/[\\/]/.test(base)) throw new BadRequestException("Name can’t contain / or \\.");
        if (base.length + ext.length > 200) throw new BadRequestException("Name is too long (200 characters max).");
        return `${base}${ext}`;
    }

    /**
     * Delete an asset into the "Deleted items" bin (30 days, then its files are
     * purged). Refused while an entry uses it, unless `force`. Its files stay in
     * storage until the purge, so a restore brings it back exactly.
     */
    async remove(workspaceId: string, id: string, opts: { force?: boolean } = {}) {
        const m = await this.prisma.media.findFirst({ where: { id, workspaceId } });
        if (!m) throw new NotFoundException("Asset not found.");
        const used = await this.usageOf(workspaceId, m);
        if (used.length && !opts.force) {
            throw new ConflictException({
                message: `This file is used by ${used.length} entr${used.length === 1 ? "y" : "ies"}. Pass force=true to delete it anyway.`,
                usage: used,
            });
        }
        await this.trash(workspaceId, m, used);
        return { ok: true, deleted: 1 };
    }

    private async trash(workspaceId: string, m: Media, used: { id: string; title: string }[]) {
        const who = currentActor();
        await this.prisma.$transaction([
            this.prisma.deletedItem.create({
                data: {
                    workspaceId,
                    kind: "media",
                    itemId: m.id,
                    title: m.filename,
                    detail: m.mimeType,
                    payload: JSON.parse(JSON.stringify({ media: m })) as Prisma.InputJsonValue,
                    deletedById: who.userId,
                    deletedBy: who.name,
                    purgeAt: new Date(Date.now() + TRASH_DAYS * DAY_MS),
                },
            }),
            this.prisma.media.deleteMany({ where: { id: m.id, workspaceId } }),
        ]);
        await this.log(workspaceId, "media.delete", m, { usedBy: used.map((u) => ({ id: u.id, title: u.title })), url: m.url });
        this.emit(workspaceId, "media.deleted", { id: m.id, url: this.urlOf(this.keyOf(m)), ref: m.url, filename: m.filename, usedBy: used });
    }

    /** Bring a deleted asset back under its old id. */
    async restoreDeleted(workspaceId: string, deletedId: string) {
        const item = await this.prisma.deletedItem.findFirst({ where: { id: deletedId, workspaceId, kind: "media" } });
        if (!item) throw new NotFoundException("Deleted item not found.");
        const row = (item.payload as unknown as { media: Media }).media;
        const [m] = await this.prisma.$transaction([
            this.prisma.media.create({ data: { ...row, workspaceId, tags: row.tags ?? [] } as Prisma.MediaUncheckedCreateInput }),
            this.prisma.deletedItem.delete({ where: { id: item.id } }),
        ]);
        await this.log(workspaceId, "media.restore_deleted", m, { deletedAt: item.deletedAt, deletedBy: item.deletedBy });
        const shaped = this.shape(m);
        this.emit(workspaceId, "media.created", shaped);
        return shaped;
    }

    /** Purge bin items past their 30 days: rows go, and an asset's files with them. */
    async purgeDeleted(): Promise<number> {
        try {
            if (this.redis && !(await this.redis.tryAcquire("sched:trash-purge", 3_600_000))) return 0;
            const due = await this.prisma.deletedItem.findMany({ where: { purgeAt: { lte: new Date() } }, take: 500 });
            for (const d of due) {
                if (d.kind === "media") {
                    const key = basename((d.payload as unknown as { media: Media }).media.url);
                    // A file another asset now points at (restored twin) is left alone.
                    const shared = await this.prisma.media.findFirst({ where: { url: { endsWith: `/${key}` } }, select: { id: true } });
                    if (!shared) await this.storage.delete(key, this.thumbKey(key)).catch((e) => this.logger.warn(`purge of ${key} failed: ${e instanceof Error ? e.message : e}`));
                }
                await this.prisma.deletedItem.delete({ where: { id: d.id } });
            }
            return due.length;
        } catch (e) {
            this.logger.warn(`bin purge failed: ${e instanceof Error ? e.message : e}`);
            return 0;
        }
    }

    /**
     * Which content entries reference each asset, so the studio can warn before a
     * delete breaks a page. Entries store media as URL strings (fields and body
     * HTML, relative "/media/<key>" or an absolute CDN URL), so this matches the
     * unique object key after a "/" in the live and draft JSON.
     * ponytail: text scan of the workspace's entries per call; fine at CMS scale,
     * a media↔entry link table would be the upgrade if it ever gets slow.
     */
    async usage(workspaceId: string, ids: string[]) {
        const rows = await this.prisma.media.findMany({ where: { workspaceId, id: { in: ids.slice(0, 500) } }, select: { id: true, url: true } });
        const out: Record<string, { id: string; title: string }[]> = {};
        if (!rows.length) return out;
        const keys = rows.map((m) => ({ id: m.id, pattern: `%/${basename(m.url).replace(/[\\%_]/g, "\\$&")}%` }));
        const hits = await this.prisma.$queryRaw<{ pattern: string; id: string; title: string | null }[]>`
            SELECT k.pattern, e.id, e.data->>'title' AS title
            FROM unnest(${keys.map((k) => k.pattern)}::text[]) AS k(pattern)
            JOIN "ContentEntry" e ON e."workspaceId" = ${workspaceId}
             AND (e.data::text LIKE k.pattern OR COALESCE(e."draftData"::text, '') LIKE k.pattern)`;
        for (const k of keys) {
            const used = hits.filter((h) => h.pattern === k.pattern).map((h) => ({ id: h.id, title: h.title || "Untitled" }));
            if (used.length) out[k.id] = used;
        }
        return out;
    }

    /** Every entry using one asset, with the field paths that hold it (live and draft),
     *  so an agent can tell whether the file is safe to replace or delete. */
    private async usageOf(workspaceId: string, m: Pick<Media, "url">) {
        const key = basename(m.url);
        const pattern = `%/${key.replace(/[\\%_]/g, "\\$&")}%`;
        const rows = await this.prisma.$queryRaw<{ id: string; slug: string | null; title: string | null; status: string; data: unknown; draftData: unknown; type: string; typeName: string }[]>`
            SELECT e.id, e.slug, e.data->>'title' AS title, e.status::text AS status, e.data, e."draftData", t."apiId" AS type, t.name AS "typeName"
            FROM "ContentEntry" e JOIN "ContentType" t ON t.id = e."contentTypeId"
            WHERE e."workspaceId" = ${workspaceId}
              AND (e.data::text LIKE ${pattern} OR COALESCE(e."draftData"::text, '') LIKE ${pattern})`;
        return rows.map((r) => ({
            id: r.id,
            type: r.type,
            typeName: r.typeName,
            title: r.title || "Untitled",
            slug: r.slug,
            status: r.status,
            fields: [...new Set([...pathsHolding(r.data, key), ...pathsHolding(r.draftData, key).map((p) => `draft:${p}`)])],
        }));
    }

    async usageDetail(workspaceId: string, id: string) {
        const m = await this.prisma.media.findFirst({ where: { id, workspaceId }, select: { url: true } });
        if (!m) throw new NotFoundException("Asset not found.");
        const entries = await this.usageOf(workspaceId, m);
        return { id, used: entries.length > 0, entries };
    }

    /**
     * The library for the agent API: search (filename, alt text, caption, tag),
     * folder, type ("image" | "video" | "doc" or a mime prefix), minimum width and
     * height, unused only, paged. Returns { items, total }.
     */
    async search(workspaceId: string, f: { q?: string; folder?: string; type?: string; width?: number; height?: number; unused?: boolean; missingAlt?: boolean; tag?: string; limit?: number; offset?: number }) {
        const take = Math.min(Math.max(1, Math.floor(f.limit ?? 50)), 200);
        const skip = Math.max(0, Math.floor(f.offset ?? 0));
        const and: Prisma.MediaWhereInput[] = [];
        const q = f.q?.trim();
        if (q) and.push({ OR: [{ filename: { contains: q, mode: "insensitive" } }, { alt: { contains: q, mode: "insensitive" } }, { caption: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }] });
        if (f.folder && f.folder !== "all") and.push({ folder: f.folder === "none" ? null : f.folder });
        if (f.type) {
            const t = f.type.toLowerCase();
            if (t === "image" || t === "video") and.push({ mimeType: { startsWith: `${t}/` } });
            else if (t === "doc") and.push({ NOT: [{ mimeType: { startsWith: "image/" } }, { mimeType: { startsWith: "video/" } }] });
            else and.push({ mimeType: { startsWith: t } });
        }
        if (f.width) and.push({ width: { gte: f.width } });
        if (f.height) and.push({ height: { gte: f.height } });
        if (f.tag) and.push({ tags: { has: f.tag.trim().toLowerCase() } });
        if (f.missingAlt) and.push({ mimeType: { startsWith: "image/" } }, { OR: [{ alt: null }, { alt: "" }] });
        if (f.unused) {
            // ponytail: one text scan of the workspace's entries; a link table if it gets slow.
            const used = await this.prisma.$queryRaw<{ id: string }[]>`
                SELECT m.id FROM "Media" m WHERE m."workspaceId" = ${workspaceId} AND EXISTS (
                    SELECT 1 FROM "ContentEntry" e WHERE e."workspaceId" = m."workspaceId"
                      AND (e.data::text LIKE '%/' || regexp_replace(m.url, '^.*/', '') || '%'
                           OR COALESCE(e."draftData"::text, '') LIKE '%/' || regexp_replace(m.url, '^.*/', '') || '%'))`;
            and.push({ id: { notIn: used.map((u) => u.id) } });
        }
        const where: Prisma.MediaWhereInput = { workspaceId, AND: and };
        const [rows, total, dupes] = await Promise.all([
            this.prisma.media.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, skip }),
            this.prisma.media.count({ where }),
            this.duplicateIds(workspaceId),
        ]);
        return { items: rows.map((m) => this.shape(m, dupes.has(m.id))), total, limit: take, offset: skip };
    }

    // ── Folders ─────────────────────────────────────────────────────────────────
    // An asset names its folder (Media.folder); a MediaFolder row lets a folder
    // exist while empty.

    async folders(workspaceId: string) {
        const [counts, rows] = await Promise.all([
            this.prisma.media.groupBy({ by: ["folder"], where: { workspaceId, folder: { not: null } }, _count: { _all: true } }),
            this.prisma.mediaFolder.findMany({ where: { workspaceId } }),
        ]);
        const names = new Set([...counts.map((c) => c.folder as string), ...rows.map((r) => r.name)]);
        return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, count: counts.find((c) => c.folder === name)?._count._all ?? 0 }));
    }

    private cleanFolder(name: string): string {
        const n = (name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
        if (!n || n === "all" || n === "none") throw new BadRequestException("Give the folder a name (not “all” or “none”).");
        if (n.length > 100) throw new BadRequestException("Folder name is too long (100 characters max).");
        return n;
    }

    async createFolder(workspaceId: string, name: string) {
        const n = this.cleanFolder(name);
        await this.prisma.mediaFolder.upsert({ where: { workspaceId_name: { workspaceId, name: n } }, create: { workspaceId, name: n }, update: {} });
        await this.audit?.log({ workspaceId, action: "media.folder_create", resource: "MediaFolder", title: n });
        return { name: n, count: await this.prisma.media.count({ where: { workspaceId, folder: n } }) };
    }

    /** Rename a folder: its assets move with it. */
    async renameFolder(workspaceId: string, from: string, to: string) {
        const n = this.cleanFolder(to);
        const moved = await this.prisma.$transaction(async (tx) => {
            const r = await tx.media.updateMany({ where: { workspaceId, folder: from }, data: { folder: n } });
            const had = await tx.mediaFolder.deleteMany({ where: { workspaceId, name: from } });
            if (!r.count && !had.count) throw new NotFoundException("Folder not found.");
            await tx.mediaFolder.upsert({ where: { workspaceId_name: { workspaceId, name: n } }, create: { workspaceId, name: n }, update: {} });
            return r.count;
        });
        await this.audit?.log({ workspaceId, action: "media.folder_rename", resource: "MediaFolder", title: n, metadata: { changes: [{ path: "name", before: from, after: n }], assetsMoved: moved } });
        return { name: n, count: moved };
    }

    /** Delete a folder. One with assets in it is refused unless `force`, which moves
     *  them out to no folder (the files themselves are never deleted here). */
    async deleteFolder(workspaceId: string, name: string, force = false) {
        const inside = await this.prisma.media.count({ where: { workspaceId, folder: name } });
        if (inside && !force) throw new ConflictException(`“${name}” has ${inside} file${inside === 1 ? "" : "s"} in it. Pass force=true to move them out and delete the folder.`);
        const [moved, gone] = await this.prisma.$transaction([
            this.prisma.media.updateMany({ where: { workspaceId, folder: name }, data: { folder: null } }),
            this.prisma.mediaFolder.deleteMany({ where: { workspaceId, name } }),
        ]);
        if (!moved.count && !gone.count) throw new NotFoundException("Folder not found.");
        await this.audit?.log({ workspaceId, action: "media.folder_delete", resource: "MediaFolder", title: name, metadata: { assetsMovedOut: moved.count } });
        return { ok: true, movedOut: moved.count };
    }

    /** Delete many assets at once (multi-select) into the bin. The studio has already
     *  shown which are in use and asked. Ids outside the workspace are ignored. */
    async removeMany(workspaceId: string, ids: string[]) {
        const rows = await this.prisma.media.findMany({ where: { workspaceId, id: { in: ids.slice(0, 500) } } });
        // A big delete takes a workspace snapshot first (master rollback point).
        if (rows.length >= BULK_DELETE_SNAPSHOT_AT) await this.backups?.create(workspaceId, "pre-bulk-delete", `before deleting ${rows.length} files`).catch(() => undefined);
        for (const m of rows) await this.trash(workspaceId, m, await this.usageOf(workspaceId, m));
        return { ok: true, deleted: rows.length };
    }

    /** Generate accessible alt text for an image via a vision-capable AI provider. */
    async generateAlt(workspaceId: string, userId: string, id: string) {
        const m = await this.prisma.media.findFirst({ where: { id, workspaceId } });
        if (!m) throw new NotFoundException("Asset not found.");
        if (!m.mimeType.startsWith("image/") || m.mimeType === "image/svg+xml") {
            throw new BadRequestException("Alt text can only be generated for raster images.");
        }
        let buffer: Buffer;
        try {
            buffer = await this.storage.read(this.keyOf(m));
        } catch {
            throw new NotFoundException("Image file is missing from storage.");
        }
        // Downscale for a cheap, fast vision call (model doesn't need full res).
        let b64: string;
        let mime = m.mimeType;
        try {
            const small = await altGate.run(() =>
                sharp(buffer, SHARP_OPTS).resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
            );
            b64 = small.toString("base64");
            mime = "image/jpeg";
        } catch {
            b64 = buffer.toString("base64");
        }

        let res: { text: string; provider: string; model: string };
        try {
            res = await this.ai.generate(workspaceId, userId, {
                feature: "media.alt_text",
                prompt:
                    "Write a single concise, descriptive alt-text sentence for this image, for web accessibility and SEO. Describe what is shown plainly; do not start with \"image of\" or \"picture of\"; no quotes; under 160 characters.",
                imageBase64: b64,
                imageMimeType: mime,
                maxTokens: 120,
                temperature: 0.4,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            // Text-only models reject the multimodal message shape — surface a clear hint.
            if (/content must be a string|image|vision|multimodal|invalid.*content|unsupported/i.test(msg)) {
                throw new BadRequestException(
                    "The connected AI model can't read images. Connect a vision-capable model (e.g. GPT-4o, Gemini, Claude, or a vision Llama) in Settings → Integrations to auto-write alt text.",
                );
            }
            throw e;
        }
        const alt = (res.text || "").trim().replace(/^["']|["']$/g, "").slice(0, 300);
        if (!alt) throw new BadRequestException("The model returned no alt text. Try a different (vision-capable) provider.");
        const updated = await this.prisma.media.update({ where: { id }, data: { alt, altSource: "ai" } });
        return { ...this.shape(updated, (await this.duplicateIds(workspaceId)).has(updated.id)), provider: res.provider, model: res.model };
    }
}

/** Paths in a JSON value whose string holds `key` ("hero.image", "body", "sections[2].image"). */
export function pathsHolding(value: unknown, key: string, path = ""): string[] {
    if (typeof value === "string") return value.includes(key) ? [path || "(value)"] : [];
    if (Array.isArray(value)) return value.flatMap((v, i) => pathsHolding(v, key, `${path}[${i}]`));
    if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => pathsHolding(v, key, path ? `${path}.${k}` : k));
    return [];
}
