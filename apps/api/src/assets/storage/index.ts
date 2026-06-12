import { join } from "node:path";
import { STORAGE, type StorageDriver } from "./storage.driver";
import { LocalStorageDriver } from "./local.driver";
import { S3StorageDriver } from "./s3.driver";

export { STORAGE } from "./storage.driver";
export type { StorageDriver } from "./storage.driver";

/** Local media dir (when STORAGE_DRIVER=local). Point at a mounted volume in prod. */
export const MEDIA_DIR = process.env.MEDIA_DIR || join(process.cwd(), "storage", "media");

function req(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Storage: ${name} is required when STORAGE_DRIVER=s3`);
    return v;
}

/**
 * Build the active storage driver from env.
 *   STORAGE_DRIVER=local (default) — disk at MEDIA_DIR, served at /media.
 *   STORAGE_DRIVER=s3 — any S3-compatible store (R2 / Supabase Storage / S3 / MinIO):
 *     S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (required),
 *     S3_ENDPOINT (R2/Supabase/MinIO), S3_REGION (default "auto"),
 *     S3_PUBLIC_URL (CDN / public bucket base), S3_FORCE_PATH_STYLE (default true).
 */
export function createStorage(): StorageDriver {
    const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
    if (driver === "s3") {
        return new S3StorageDriver({
            endpoint: process.env.S3_ENDPOINT || undefined,
            region: process.env.S3_REGION || "auto",
            bucket: req("S3_BUCKET"),
            accessKeyId: req("S3_ACCESS_KEY_ID"),
            secretAccessKey: req("S3_SECRET_ACCESS_KEY"),
            publicUrl: process.env.S3_PUBLIC_URL || undefined,
            forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") !== "false",
        });
    }
    return new LocalStorageDriver(MEDIA_DIR);
}

/** Nest provider wiring the active driver to the STORAGE token. */
export const StorageProvider = { provide: STORAGE, useFactory: createStorage };
