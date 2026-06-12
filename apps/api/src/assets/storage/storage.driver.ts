/**
 * Pluggable media storage. Local disk by default; any S3-compatible object store
 * (Cloudflare R2, Supabase Storage, AWS S3, MinIO) when STORAGE_DRIVER=s3.
 */
export interface StorageDriver {
    /** Store an object under `key`. */
    put(key: string, body: Buffer, contentType: string): Promise<void>;
    /** Read an object's bytes (used for AI alt-text + downloads). */
    read(key: string): Promise<Buffer>;
    /** Delete one or more objects (missing keys are ignored). */
    delete(...keys: string[]): Promise<void>;
    /**
     * Absolute public URL for a key, or `null` when the object is served locally
     * by the `/media` static handler (the local driver). For S3-style stores this
     * is the public bucket / CDN URL.
     */
    publicUrl(key: string): string | null;
}

/** DI token for the active storage driver. */
export const STORAGE = Symbol("STORAGE");
