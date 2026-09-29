import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { StorageDriver } from "./storage.driver";

export type S3Options = {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Public base for serving objects (a CDN domain or public bucket URL). */
    publicUrl?: string;
    forcePathStyle: boolean;
};

/**
 * S3-compatible storage — works with Cloudflare R2, Supabase Storage, AWS S3 and
 * MinIO. Objects are served from the public bucket / CDN URL (`publicUrl`).
 */
export class S3StorageDriver implements StorageDriver {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly base: string;

    constructor(opts: S3Options) {
        this.bucket = opts.bucket;
        this.client = new S3Client({
            region: opts.region,
            endpoint: opts.endpoint,
            forcePathStyle: opts.forcePathStyle,
            credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
        });
        const fallback = opts.endpoint ? `${opts.endpoint.replace(/\/+$/, "")}/${opts.bucket}` : "";
        this.base = (opts.publicUrl || fallback).replace(/\/+$/, "");
    }

    async put(key: string, body: Buffer, contentType: string): Promise<void> {
        await this.client.send(
            new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
        );
    }

    async read(key: string): Promise<Buffer> {
        const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        const bytes = await res.Body!.transformToByteArray();
        return Buffer.from(bytes);
    }

    /**
     * One DeleteObject per key, not a batch DeleteObjects: current AWS SDKs sign the
     * batch call with a CRC32 checksum instead of Content-MD5, which some
     * S3-compatible stores (Cloudflare R2 among them) reject, so deletes failed and
     * the asset stayed in the library. DeleteObject carries no checksum and succeeds
     * for a key that is already gone (e.g. a missing thumbnail).
     * ponytail: 8 requests in flight; a 500-asset bulk delete is 1000 small calls.
     */
    async delete(...keys: string[]): Promise<void> {
        let next = 0;
        const worker = async () => {
            while (next < keys.length) {
                const Key = keys[next++];
                await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key }));
            }
        };
        await Promise.all(Array.from({ length: Math.min(8, keys.length) }, worker));
    }

    publicUrl(key: string): string | null {
        return this.base ? `${this.base}/${key}` : null;
    }
}
