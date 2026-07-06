import { promises as fs, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { StorageDriver } from "./storage.driver";

/** Stores media on the server's local disk; served by `app.useStaticAssets` at /media.
 *
 *  Creating the directory is deliberately non-fatal: an unwritable volume used to
 *  throw in the constructor, which crash-looped the whole API at boot (every
 *  request down) over what is only a media problem. Now the CMS boots, uploads
 *  retry the mkdir, and a clear error surfaces on use instead. */
export class LocalStorageDriver implements StorageDriver {
    private prepared = false;

    constructor(private readonly dir: string) {
        this.prepared = LocalStorageDriver.prepare(dir);
    }

    /** Try to make the dir usable. Returns true when ready. */
    static prepare(dir: string): boolean {
        try {
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            return true;
        } catch {
            return false;
        }
    }

    private ensure(): void {
        if (!this.prepared) this.prepared = LocalStorageDriver.prepare(this.dir);
        if (!this.prepared)
            throw new Error(
                `Media storage isn't writable (${this.dir}). Mount a writable volume there, set MEDIA_DIR to a writable path, or configure S3 (STORAGE_DRIVER=s3).`,
            );
    }

    async put(key: string, body: Buffer): Promise<void> {
        this.ensure();
        await fs.writeFile(join(this.dir, key), body);
    }

    read(key: string): Promise<Buffer> {
        return fs.readFile(join(this.dir, key));
    }

    async delete(...keys: string[]): Promise<void> {
        await Promise.allSettled(keys.map((k) => fs.unlink(join(this.dir, k))));
    }

    publicUrl(): string | null {
        return null; // served at /media by the static handler
    }
}
