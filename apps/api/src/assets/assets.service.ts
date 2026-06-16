import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { extname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Media } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { STORAGE, type StorageDriver } from "./storage";
import { contentMatchesDeclared } from "./magic";

/** Public URL prefix the local static handler serves files at (see main.ts).
 *  `Media.url` stores a driver-agnostic `/media/<key>` reference; the actual URL
 *  is resolved per the active storage driver in `shape()`. */
const URL_PREFIX = "/media";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = new Set([
    // NOTE: image/svg+xml is intentionally NOT allowed. SVGs are XML documents that
    // can carry <script>; served from the API origin at /media they execute in the
    // app's origin (stored XSS → admin takeover). See SECURITY_AUDIT_REPORT F-01.
    // Re-add only behind server-side DOMPurify sanitisation or a separate media origin.
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
    "video/mp4", "video/webm", "video/quicktime",
    "application/pdf",
    "application/zip",
    "text/plain", "text/csv", "text/markdown",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

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

@Injectable()
export class AssetsService {
    private readonly logger = new Logger("AssetsService");

    constructor(
        private readonly prisma: PrismaService,
        private readonly ai: AiService,
        @Inject(STORAGE) private readonly storage: StorageDriver,
    ) {}

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

    private shape(m: Media) {
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
            createdById: m.createdById,
            createdAt: m.createdAt,
        };
    }

    async list(workspaceId: string, folder?: string, limit?: number, offset?: number, q?: string) {
        // Bounded by default so the media library never loads an unbounded set into
        // memory; callers may page with limit/offset (clamped to [1, 500]).
        const take = limit != null ? Math.min(Math.max(1, Math.floor(limit)), 500) : 500;
        const skip = offset != null ? Math.max(0, Math.floor(offset)) : 0;
        const search = q?.trim();
        const rows = await this.prisma.media.findMany({
            where: {
                workspaceId,
                ...(folder && folder !== "all" ? { folder } : {}),
                ...(search ? { OR: [{ filename: { contains: search, mode: "insensitive" } }, { alt: { contains: search, mode: "insensitive" } }] } : {}),
            },
            orderBy: { createdAt: "desc" },
            take,
            skip,
        });
        return rows.map((m) => this.shape(m));
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

    async upload(workspaceId: string, userId: string, file: UploadedFile, folder?: string) {
        if (!file) throw new BadRequestException("No file provided.");
        if (file.size > MAX_BYTES) throw new BadRequestException("File is larger than 25 MB.");
        if (!ALLOWED.has(file.mimetype)) throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
        // The MIME type is client-supplied (multipart Content-Type); for types with a
        // reliable magic number, verify the bytes match so a forged header can't smuggle
        // a different file in (e.g. HTML posing as image/png). SECURITY_AUDIT_REPORT F-14.
        if (!contentMatchesDeclared(file.mimetype, file.buffer))
            throw new BadRequestException("File content does not match its declared type.");

        // Gate the CPU/RAM-heavy decode so concurrent uploads can't OOM the API.
        const opt = await imageGate.run(() => this.optimizeImage(file));
        const ext = (extname(opt.filename) || `.${opt.mimetype.split("/")[1] ?? "bin"}`).toLowerCase();
        const stored = `${randomUUID()}${ext}`;
        await this.storage.put(stored, opt.buffer, opt.mimetype);

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

        const media = await this.prisma.media.create({
            data: {
                workspaceId,
                filename: opt.filename,
                mimeType: opt.mimetype,
                size: opt.buffer.length,
                url: `${URL_PREFIX}/${stored}`,
                width: opt.width,
                height: opt.height,
                alt: null,
                altSource: "none",
                folder: folder && folder !== "all" ? folder : null,
                createdById: userId,
            },
        });
        return this.shape(media);
    }

    async update(workspaceId: string, id: string, dto: { alt?: string; folder?: string; filename?: string }) {
        const existing = await this.prisma.media.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Asset not found.");
        const data: Record<string, unknown> = {};
        if (dto.alt !== undefined) {
            data.alt = dto.alt;
            data.altSource = dto.alt.trim() ? "manual" : "none";
        }
        if (dto.folder !== undefined) data.folder = dto.folder && dto.folder !== "all" ? dto.folder : null;
        if (dto.filename !== undefined) data.filename = dto.filename;
        const m = await this.prisma.media.update({ where: { id }, data });
        return this.shape(m);
    }

    async remove(workspaceId: string, id: string) {
        const m = await this.prisma.media.findFirst({ where: { id, workspaceId } });
        if (!m) throw new NotFoundException("Asset not found.");
        const key = this.keyOf(m);
        await this.storage.delete(key, this.thumbKey(key));
        await this.prisma.media.delete({ where: { id } });
        return { ok: true };
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
            const small = await imageGate.run(() =>
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
        return { ...this.shape(updated), provider: res.provider, model: res.model };
    }
}
