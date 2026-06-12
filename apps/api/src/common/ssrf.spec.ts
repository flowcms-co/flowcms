import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateIp } from "./ssrf";

describe("isPrivateIp()", () => {
    it("flags IPv4 loopback / private / link-local / cloud-metadata as private", () => {
        for (const ip of [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.5.4",
            "192.168.1.1",
            "169.254.169.254", // cloud metadata
            "100.64.0.1", // CGNAT
            "0.0.0.0",
        ]) {
            expect(isPrivateIp(ip), ip).toBe(true);
        }
    });

    it("treats public IPv4 addresses as not private", () => {
        for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
            expect(isPrivateIp(ip), ip).toBe(false);
        }
    });

    it("flags IPv6 loopback / link-local / unique-local as private", () => {
        for (const ip of ["::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"]) {
            expect(isPrivateIp(ip), ip).toBe(true);
        }
    });

    it("treats a public IPv6 address as not private", () => {
        expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    });

    it("treats an unparseable / non-IP string as unsafe (fail closed)", () => {
        expect(isPrivateIp("not-an-ip")).toBe(true);
        expect(isPrivateIp("::ffff:999.0.0.1")).toBe(true);
    });
});

describe("assertPublicUrl()", () => {
    it("rejects localhost", async () => {
        await expect(assertPublicUrl("http://localhost")).rejects.toBeDefined();
    });

    it("rejects the cloud metadata IP", async () => {
        await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeDefined();
    });

    it("rejects private literal-IP ranges", async () => {
        await expect(assertPublicUrl("http://127.0.0.1")).rejects.toBeDefined();
        await expect(assertPublicUrl("http://10.0.0.1")).rejects.toBeDefined();
        await expect(assertPublicUrl("http://192.168.0.1")).rejects.toBeDefined();
    });

    it("rejects non-http(s) schemes", async () => {
        await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeDefined();
        await expect(assertPublicUrl("gopher://example.com")).rejects.toBeDefined();
    });

    it("rejects a syntactically invalid URL", async () => {
        await expect(assertPublicUrl("http://")).rejects.toBeDefined();
    });

    it("allows a public literal IP (no DNS needed)", async () => {
        const url = await assertPublicUrl("https://8.8.8.8/path");
        expect(url.hostname).toBe("8.8.8.8");
    });
});
