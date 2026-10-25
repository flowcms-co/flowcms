import { STORAGE } from "./storage.driver";
import { StorageService } from "./storage.service";

export { STORAGE } from "./storage.driver";
export type { StorageDriver } from "./storage.driver";
export { MEDIA_DIR, createStorage } from "./env";
export { StorageService } from "./storage.service";

/** STORAGE resolves to StorageService: Studio-saved credentials, else env, else local disk. */
export const StorageProvider = { provide: STORAGE, useExisting: StorageService };
