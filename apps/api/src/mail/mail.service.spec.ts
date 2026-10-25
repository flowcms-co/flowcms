import { describe, expect, it, vi } from "vitest";
import { MailService } from "./mail.service";

process.env.SECRETS_ENCRYPTION_KEY = "test-vault-key-0123456789";

describe("SMTP host guard", () => {
    it.each(["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "localhost"])("refuses %s", async (host) => {
        const prisma = { integration: { findFirst: vi.fn(async () => null), create: vi.fn() } };
        const svc = new MailService(prisma as never);
        await expect(svc.connect("w1", { provider: "smtp", host, user: "u", password: "p", from: "a@x.com" })).rejects.toThrow(/ALLOW_PRIVATE_FETCH/);
        expect(prisma.integration.create).not.toHaveBeenCalled();
    });
});
