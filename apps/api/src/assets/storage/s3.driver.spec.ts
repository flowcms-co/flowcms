import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { S3StorageDriver } from "./s3.driver";

/** A stand-in for an S3-compatible store that, like the stores that broke deletes,
 *  rejects a batch DeleteObjects without Content-MD5 but accepts DeleteObject. */
describe("S3StorageDriver.delete", () => {
    const deleted: string[] = [];
    let server: http.Server;
    let driver: S3StorageDriver;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            req.resume();
            req.on("end", () => {
                if (req.method === "POST" && req.url?.includes("delete") && !req.headers["content-md5"]) {
                    res.writeHead(400, { "content-type": "application/xml" });
                    res.end('<?xml version="1.0"?><Error><Code>InvalidRequest</Code><Message>Missing required header for this request: Content-MD5</Message></Error>');
                    return;
                }
                if (req.method === "DELETE") deleted.push(decodeURIComponent(req.url!.split("?")[0].replace(/^\/bucket\//, "")));
                res.writeHead(204);
                res.end();
            });
        });
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const { port } = server.address() as AddressInfo;
        driver = new S3StorageDriver({
            endpoint: `http://127.0.0.1:${port}`,
            region: "auto",
            bucket: "bucket",
            accessKeyId: "test",
            secretAccessKey: "test",
            forcePathStyle: true,
        });
    });

    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it("deletes every key on a store that rejects checksum-signed batch deletes", async () => {
        await driver.delete("a.webp", "a_thumb.webp", "b.webp");
        expect(deleted.sort()).toEqual(["a.webp", "a_thumb.webp", "b.webp"]);
    });

    it("does nothing for no keys", async () => {
        deleted.length = 0;
        await driver.delete();
        expect(deleted).toEqual([]);
    });
});
