import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "@flowcms/shared";

/** How long a preview link stays valid. Studio refreshes it before this runs out. */
export const PREVIEW_TOKEN_TTL_SECONDS = 3600;

const sign = (secret: string, workspace: string, type: string, slug: string, exp: number): string =>
    createHmac("sha256", secret).update(`flowcms-preview|${workspace}|${type}|${slug}|${exp}`).digest("base64url");

/** `<exp>.<sig>`: bound to the workspace, content type and slug it was minted for. */
export function mintPreviewToken(secret: string, workspace: string, type: string, slug: string, nowMs = Date.now()) {
    const exp = Math.floor(nowMs / 1000) + PREVIEW_TOKEN_TTL_SECONDS;
    return { token: `${exp}.${sign(secret, workspace, type, slug, exp)}`, exp };
}

/** The check the site runs; kept here so the format has one tested definition. */
export function verifyPreviewToken(secret: string, workspace: string, type: string, slug: string, token: string, nowMs = Date.now()): boolean {
    const dot = token.indexOf(".");
    if (!secret || dot < 1) return false;
    const exp = Number(token.slice(0, dot));
    if (!Number.isInteger(exp) || exp <= Math.floor(nowMs / 1000)) return false;
    const given = Buffer.from(token.slice(dot + 1));
    const want = Buffer.from(sign(secret, workspace, type, slug, exp));
    return given.length === want.length && timingSafeEqual(given, want);
}

export const newPreviewSecret = () => "pvs_" + randomBytes(32).toString("base64url");

type SecretStore = {
    workspace: {
        findUniqueOrThrow(a: { where: { id: string }; select: { previewSecretEnc: true } }): Promise<{ previewSecretEnc: string | null }>;
        update(a: { where: { id: string }; data: { previewSecretEnc: string } }): Promise<unknown>;
    };
};

/** The workspace's preview secret, stored AES-encrypted like webhook secrets and made on first use. */
export async function previewSecretFor(db: SecretStore, workspaceId: string, rotate = false): Promise<string> {
    if (!rotate) {
        const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { previewSecretEnc: true } });
        if (w.previewSecretEnc) return decryptSecret(w.previewSecretEnc);
    }
    const secret = newPreviewSecret();
    await db.workspace.update({ where: { id: workspaceId }, data: { previewSecretEnc: encryptSecret(secret) } });
    return secret;
}
