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
/** True when the full set of required S3 variables is present. */
const s3Configured = (): boolean => !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

function s3Driver(): S3StorageDriver {
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

export function createStorage(): StorageDriver {
    const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
    if (driver === "s3") return s3Driver();
    // Local driver, with a self-healing escape hatch: when the media dir isn't
    // writable (missing volume, bad permissions) but S3 is fully configured,
    // use S3 instead of letting the whole API fail over a storage path. This
    // turns a crash-loop outage into a loud log line.
    if (!LocalStorageDriver.prepare(MEDIA_DIR) && s3Configured()) {
        console.warn(
            `[storage] MEDIA_DIR (${MEDIA_DIR}) is not writable but S3 is configured — using the S3 driver. ` +
                `Set STORAGE_DRIVER=s3 explicitly to silence this warning.`,
        );
        return s3Driver();
    }
    return new LocalStorageDriver(MEDIA_DIR);
}

/** Nest provider wiring the active driver to the STORAGE token. */
export const StorageProvider = { provide: STORAGE, useFactory: createStorage };
