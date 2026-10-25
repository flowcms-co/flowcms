/**
 * Server-side admin recovery, for when nobody can sign in (for example the only
 * admin forgot their password and no email provider is set up). It needs a
 * shell on the server or access to its env vars, never a public endpoint.
 *
 *   node apps/api/dist/recover.js reset-password --email you@x.com                 # prints a 1-hour reset link
 *   node apps/api/dist/recover.js reset-password --email you@x.com --set-password  # reads a new password from stdin
 *
 * From a repo checkout, `flowcms admin reset-password ...` wraps the same thing.
 *
 * Boot fallback for hosts without a shell: FLOWCMS_RECOVERY_EMAIL plus
 * FLOWCMS_RECOVERY_PASSWORD (see applyEnvRecovery). docs/RECOVERY.md has the details.
 */
import { createHmac } from "node:crypto";
import { createInterface } from "node:readline";
import type { PrismaClient } from "@flowcms/db";
import { hashPassword } from "@flowcms/shared";
import { resetLink } from "./auth/reset-token";

type Via = "cli" | "env";
const ACTOR: Record<Via, string> = { cli: "Server recovery (CLI)", env: "Server recovery (env)" };
const MIN_PASSWORD = 12;

async function findUser(prisma: PrismaClient, email: string) {
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        select: { id: true, email: true, isActive: true, passwordHash: true, memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { workspaceId: true } } },
    });
    if (!user) throw new Error(`No user with email ${email}.`);
    if (!user.isActive) throw new Error(`${user.email} is disabled.`);
    const workspaceId = user.memberships[0]?.workspaceId;
    if (!workspaceId) throw new Error(`${user.email} is not a member of any workspace, so it could not sign in anyway.`);
    return { ...user, workspaceId };
}

const audit = (prisma: PrismaClient, u: { id: string; workspaceId: string }, via: Via, metadata: Record<string, unknown>) =>
    prisma.auditLog.create({
        data: { workspaceId: u.workspaceId, userId: u.id, action: "auth.password_reset_cli", resource: "User", resourceId: u.id, actorName: ACTOR[via], metadata: { via, ...metadata } },
    });

/** Print-a-link recovery: the user sets the password in Studio, as with the email. */
export async function issueRecoveryLink(prisma: PrismaClient, email: string): Promise<string> {
    const user = await findUser(prisma, email);
    await audit(prisma, user, "cli", { method: "link" });
    return resetLink(user);
}

/** Set a password directly. Ends every session, the same as a normal reset. */
export async function setRecoveryPassword(prisma: PrismaClient, email: string, password: string, via: Via, metadata: Record<string, unknown> = {}) {
    if (password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
    const user = await findUser(prisma, email);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await audit(prisma, user, via, { method: "password", ...metadata });
    return user.email;
}

/**
 * Boot fallback. Applied once per email + password pair: a keyed marker in the
 * audit row stops a restart from resetting the password again after the admin
 * changes it. Warns on every boot while the vars are still set.
 */
export async function applyEnvRecovery(prisma: PrismaClient, log: { warn: (m: string) => void; error: (m: string) => void }) {
    const email = process.env.FLOWCMS_RECOVERY_EMAIL?.trim();
    const password = process.env.FLOWCMS_RECOVERY_PASSWORD;
    if (!email && !password) return;
    if (!email || !password) return log.error("Admin recovery skipped: set both FLOWCMS_RECOVERY_EMAIL and FLOWCMS_RECOVERY_PASSWORD.");
    const marker = createHmac("sha256", process.env.JWT_SECRET || "flowcms.dev.reset").update(`${email.toLowerCase()}\n${password}`).digest("hex").slice(0, 32);
    try {
        const done = await prisma.auditLog.findFirst({ where: { action: "auth.password_reset_cli", metadata: { path: ["marker"], equals: marker } }, select: { id: true } });
        if (!done) {
            await setRecoveryPassword(prisma, email, password, "env", { marker });
            log.warn(`ADMIN RECOVERY: the password for ${email} was reset from FLOWCMS_RECOVERY_PASSWORD and its sessions were signed out.`);
        }
    } catch (err) {
        log.error(`Admin recovery failed: ${(err as Error).message}`);
    }
    log.warn("FLOWCMS_RECOVERY_EMAIL / FLOWCMS_RECOVERY_PASSWORD are still set. Sign in, change the password, then remove both vars.");
}

/** Read a password from stdin: hidden prompt on a terminal, else the piped value. */
async function readPassword(): Promise<string> {
    if (!process.stdin.isTTY) {
        let data = "";
        for await (const chunk of process.stdin) data += chunk;
        return data.replace(/\r?\n$/, "");
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s) => (muted ? undefined : out.output.write(s));
    const ask = (q: string) => new Promise<string>((res) => {
        rl.question(q, res);
        muted = true;
    });
    const a = await ask("New password (hidden): ");
    muted = false;
    process.stdout.write("\n");
    const b = await ask("Repeat it: ");
    process.stdout.write("\n");
    rl.close();
    if (a !== b) throw new Error("Passwords did not match.");
    return a;
}

async function main(argv: string[]) {
    const flag = (n: string) => {
        const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
        if (i < 0) return undefined;
        return argv[i].includes("=") ? argv[i].split("=").slice(1).join("=") : argv[i + 1]?.startsWith("--") ? "" : (argv[i + 1] ?? "");
    };
    const email = flag("email");
    if (argv[0] !== "reset-password" || !email) {
        console.error("Usage: node apps/api/dist/recover.js reset-password --email you@x.com [--set-password]");
        process.exit(2);
    }
    // A `railway ssh` / `docker exec` shell doesn't inherit what the entrypoint
    // derived, so mirror its STUDIO_URL fallback (deploy/aio-entrypoint.sh).
    process.env.STUDIO_URL ||= process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : process.env.RENDER_EXTERNAL_URL;
    const { prisma } = await import("@flowcms/db");
    try {
        if (argv.includes("--set-password")) {
            const done = await setRecoveryPassword(prisma, email, await readPassword(), "cli");
            console.log(`Password updated for ${done}. All of its sessions were signed out.`);
        } else {
            console.log(`Reset link for ${email} (valid for 1 hour, works once):\n\n${await issueRecoveryLink(prisma, email)}\n`);
            if (!process.env.STUDIO_URL) console.log("STUDIO_URL is not set, so the link points at localhost. Swap in your Studio address.");
        }
    } catch (err) {
        console.error((err as Error).message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) void main(process.argv.slice(2));
