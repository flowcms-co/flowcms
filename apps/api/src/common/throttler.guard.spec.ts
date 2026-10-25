import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { Throttle, ThrottlerModule } from "@nestjs/throttler";
import type { INestApplication } from "@nestjs/common";
import { TokenOrIpThrottlerGuard } from "./throttler.guard";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { Public } from "../auth/decorators";

@Controller()
class TestController {
    @Public()
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @Get("open")
    open() {
        return { ok: true };
    }
}

@Module({
    imports: [ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 100 }] })],
    controllers: [TestController],
    providers: [
        { provide: AuthService, useValue: { validate: async () => null } },
        Reflector,
        // Same order as AppModule.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: TokenOrIpThrottlerGuard },
    ],
})
class TestModule {}

describe("TokenOrIpThrottlerGuard", () => {
    let app: INestApplication;
    let base: string;
    beforeAll(async () => {
        app = await NestFactory.create(TestModule, { logger: false });
        await app.listen(0, "127.0.0.1");
        base = await app.getUrl();
    });
    afterAll(async () => app?.close());

    it("random Bearer values on a public route share one IP bucket", async () => {
        const codes: number[] = [];
        for (let i = 0; i < 5; i++) {
            const r = await fetch(`${base}/open`, { headers: { authorization: `Bearer rand-${i}-${Math.random()}`, cookie: `flow_session=x${i}` } });
            codes.push(r.status);
        }
        expect(codes).toEqual([200, 200, 200, 429, 429]);
    });

    it("keys by validated user, else IP, never by the raw credential", async () => {
        const g = Object.create(TokenOrIpThrottlerGuard.prototype) as { getTracker(r: unknown): Promise<string> };
        expect(await g.getTracker({ ip: "1.2.3.4", headers: { authorization: "Bearer abc" } })).toBe("ip:1.2.3.4");
        expect(await g.getTracker({ ip: "1.2.3.4", user: { id: "u1" } })).toBe("user:u1");
    });
});
