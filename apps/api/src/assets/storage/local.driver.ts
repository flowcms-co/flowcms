import { promises as fs, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { StorageDriver } from "./storage.driver";

/** Stores media on the server's local disk; served by `app.useStaticAssets` at /media. */
export class LocalStorageDriver implements StorageDriver {
    constructor(private readonly dir: string) {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    async put(key: string, body: Buffer): Promise<void> {
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
