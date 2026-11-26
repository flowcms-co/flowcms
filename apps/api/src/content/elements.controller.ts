import { Controller, Get, Header } from "@nestjs/common";
import { ELEMENTS_JS, elementsCss } from "@flowcms/shared";
import { Public } from "../auth/decorators";

/**
 * The stylesheet for Elements in delivered content: theme variables plus base styles. Open on
 * purpose, a site loads it with a plain <link> tag and no token. Slice 3 builds the theme part
 * from the workspace's saved theme; until then it serves the default theme.
 */
@Controller("public")
@Public()
export class ElementsController {
    @Get("elements.css")
    @Header("Content-Type", "text/css; charset=utf-8")
    @Header("Cache-Control", "public, max-age=300")
    css(): string {
        return elementsCss();
    }

    /** The small script that makes calculators live. Open, same as the stylesheet. */
    @Get("elements.js")
    @Header("Content-Type", "application/javascript; charset=utf-8")
    @Header("Cache-Control", "public, max-age=300")
    js(): string {
        return ELEMENTS_JS;
    }
}
