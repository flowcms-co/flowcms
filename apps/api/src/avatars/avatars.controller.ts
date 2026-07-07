import { Controller, Get, Header, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { AvatarsService } from "./avatars.service";

/**
 * Avatar images — public SVGs (non-sensitive, embeddable in-app and in email).
 *   GET /avatars/u/:userId    → that user's stored illustrated avatar
 *   GET /avatars/preview      → ?style=&seed=&bg= live preview (avatar picker)
 */
@Controller("avatars")
@Public()
export class AvatarsController {
    constructor(private readonly avatars: AvatarsService) {}

    @Get("u/:userId")
    @Header("Content-Type", "image/svg+xml")
    @Header("Cache-Control", "public, max-age=300")
    async forUser(@Param("userId") userId: string, @Res({ passthrough: true }) res: Response) {
        res.setHeader("Content-Type", "image/svg+xml");
        return this.avatars.forUser(userId);
    }

    @Get("preview")
    @Header("Content-Type", "image/svg+xml")
    @Header("Cache-Control", "public, max-age=86400")
    preview(@Query("style") style?: string, @Query("seed") seed?: string, @Query("bg") bg?: string) {
        return this.avatars.render({ style, seed, bg });
    }
}
