import "reflect-metadata";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";

async function bootstrap() {
    // bodyParser:false so we can register parsers with explicit size limits below
    // (the defaults are ~100 KB, which would silently reject large entries/imports).
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false, bodyParser: false });
    const isProd = process.env.NODE_ENV === "production";

    // Refuse to boot in production with missing/placeholder secrets — a deploy
    // that kept the .env.example values would otherwise run with a publicly
    // known encryption key / session secret.
    if (isProd) {
        const weak = (v?: string) => !v || v.includes("replace_me") || v.length < 16;
        if (weak(process.env.SECRETS_ENCRYPTION_KEY) || weak(process.env.JWT_SECRET)) {
            new Logger("Bootstrap").error(
                "Refusing to start: set strong SECRETS_ENCRYPTION_KEY and JWT_SECRET in production (generate with `openssl rand -base64 32`).",
            );
            process.exit(1);
        }
    }

    // Behind a reverse proxy (prod), trust X-Forwarded-* so req.ip is the real
    // client (used for rate limiting). OFF by default so a directly-exposed
    // deployment can't be tricked into trusting a spoofed XFF header to dodge
    // rate limits. Set TRUST_PROXY=1 (hop count) or =true when fronted by
    // nginx / Cloudflare / a load balancer.
    const tp = process.env.TRUST_PROXY;
    if (tp) app.set("trust proxy", /^\d+$/.test(tp) ? Number(tp) : tp === "true");
    else if (isProd) {
        // Behind a reverse proxy without TRUST_PROXY, req.ip is the proxy IP, so
        // per-IP rate limits + brute-force protection collapse to one bucket
        // (SECURITY_AUDIT_REPORT F-09). Warn so operators set it when fronted by a proxy.
        new Logger("Bootstrap").warn(
            "TRUST_PROXY is not set. If running behind a reverse proxy (Caddy, nginx, Cloudflare, a load balancer), set TRUST_PROXY=1 — otherwise rate limits use the proxy IP, not the real client IP.",
        );
    }

    // Security headers (helmet). The CSP is deliberately permissive about inline
    // script/style because the ONLY HTML this API serves is the dev GraphQL
    // playground (inline, same-origin) — every other response is JSON, which a
    // browser won't execute. Crucially we set Cross-Origin-Resource-Policy =
    // cross-origin so published content on other domains can still embed /media
    // assets (helmet's default of same-origin would break that).
    app.use(
        helmet({
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    "default-src": ["'self'"],
                    "base-uri": ["'self'"],
                    "frame-ancestors": ["'none'"],
                    "object-src": ["'none'"],
                    "img-src": ["'self'", "data:", "blob:"],
                    // 'unsafe-inline' is only needed for the dev GraphQL playground
                    // (inline bootstrap script), which is 404'd in production. Drop it
                    // in prod so any stray HTML the API serves can't run inline JS
                    // (defense-in-depth alongside the SVG-upload block, F-01).
                    "script-src": isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
                    "style-src": ["'self'", "'unsafe-inline'"],
                    "connect-src": ["'self'"],
                    // disabled so the http dev playground's same-origin POST isn't
                    // force-upgraded to https (prod is already https end-to-end).
                    "upgrade-insecure-requests": null,
                },
            },
            crossOriginResourcePolicy: { policy: "cross-origin" },
            crossOriginOpenerPolicy: { policy: "same-origin" },
        }),
    );

    // Uploaded media — served as public static files (a CMS needs public asset
    // URLs so published content can embed them). Filenames are random UUIDs, so
    // they're effectively unguessable; listing/upload/delete stay auth-gated.
    // Lives on the server where the CMS runs (local disk by default; point
    // MEDIA_DIR at a mounted volume / object-storage gateway in production).
    const mediaDir = process.env.MEDIA_DIR || join(process.cwd(), "storage", "media");
    if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });
    app.useStaticAssets(mediaDir, { prefix: "/media/" });

    // All routes live under /api (the "serving window" the studio + sites call).
    app.setGlobalPrefix("api");
    app.use(cookieParser());

    // Bound request bodies to stop trivially-large-payload DoS. Generous enough
    // for big rich-text entries + pasted imports; multipart file uploads are
    // capped separately (25 MB) by the assets controller's FileInterceptor.
    // Accept SCIM's `application/scim+json` alongside plain JSON, so an IdP's
    // SCIM provisioning requests (Okta/Azure AD) are parsed into req.body.
    app.useBodyParser("json", { limit: process.env.MAX_JSON_BODY ?? "10mb", type: ["application/json", "application/scim+json"] });
    app.useBodyParser("urlencoded", { limit: process.env.MAX_FORM_BODY ?? "1mb", extended: true });

    // whitelist strips unknown props; forbidNonWhitelisted rejects them with a
    // clear 400 (defence against unexpected/abusive fields); transform coerces
    // query/body into the DTO types.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());

    // The public delivery API (REST + GraphQL) is authenticated by Bearer tokens,
    // not cookies — so it's safe (and necessary) to allow any origin, WITHOUT
    // credentials. This runs before the credentialed studio CORS below.
    app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith("/api/public") || req.path.startsWith("/api/graphql") || req.path.startsWith("/api/strapi")) {
            res.header("Vary", "Origin"); // so a shared cache never serves this wildcard ACAO to the credentialed studio
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            res.header("Access-Control-Allow-Headers", "Authorization,Content-Type");
            res.header("Access-Control-Max-Age", "86400");
            if (req.method === "OPTIONS") {
                res.sendStatus(204);
                return;
            }
        }
        next();
    });

    const studioOrigin = process.env.STUDIO_URL ?? "http://localhost:3000";
    app.enableCors({ origin: [studioOrigin], credentials: true });

    // Drain on SIGTERM (deploys / scale-down): lets PrismaService, RedisService,
    // the BullMQ jobs runner and schedulers run their onModuleDestroy hooks so
    // in-flight work finishes and connections close cleanly instead of being killed.
    app.enableShutdownHooks();

    const port = Number(process.env.API_PORT ?? 4000);
    await app.listen(port, "0.0.0.0");
    new Logger("Bootstrap").log(`Flow CMS API listening on http://localhost:${port}/api`);
}

bootstrap();
