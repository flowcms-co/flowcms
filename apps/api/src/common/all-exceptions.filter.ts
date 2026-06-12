import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Catch-all exception filter.
 *
 * Known `HttpException`s (validation errors, 401/403/404, etc.) pass through with
 * their status + developer-set message — those are safe to show. 5xx are logged.
 * Anything ELSE (an unexpected throw) is logged server-side in full and returned
 * to the client as a generic 500 with NO stack trace, error class, or internal
 * detail — so a thrown error can never leak a secret, a query internal, or a
 * stack frame in an HTTP response. In non-production we include the message +
 * stack in the body to keep local debugging sane.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger("Exception");
    private readonly isProd = process.env.NODE_ENV === "production";

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();
            if (status >= 500) this.logger.error(`${req.method} ${req.originalUrl} → ${status}`, exception.stack);
            res.status(status).json(typeof body === "string" ? { statusCode: status, message: body } : body);
            return;
        }

        // Middleware errors (body-parser, multer, …) aren't HttpExceptions but
        // carry a numeric status + an `expose`-safe message: a 1xMB body → 413
        // "request entity too large", malformed JSON → 400. Surface those as-is.
        const err = exception as Error & { status?: number; statusCode?: number; expose?: boolean };
        const mid = typeof err?.status === "number" ? err.status : typeof err?.statusCode === "number" ? err.statusCode : undefined;
        if (mid && mid >= 400 && mid < 500) {
            res.status(mid).json({ statusCode: mid, message: err.expose && err.message ? err.message : "Bad request" });
            return;
        }

        this.logger.error(`${req.method} ${req.originalUrl} → 500 ${err?.message ?? "unknown error"}`, err?.stack);
        const payload: Record<string, unknown> = {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            error: "Internal Server Error",
            message: "Internal server error",
        };
        // Local-only: surface the real cause so devs aren't debugging blind.
        if (!this.isProd && err) {
            payload.message = err.message;
            payload.stack = err.stack;
        }
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
    }
}
