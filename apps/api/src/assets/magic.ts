/**
 * Lightweight magic-byte sniffing for uploaded files (defense-in-depth, no deps).
 *
 * Multer takes a file's MIME type from the client-supplied multipart Content-Type
 * header, which is forgeable (SECURITY_AUDIT_REPORT F-14). For the image and PDF
 * types we accept, the byte signatures are simple and reliable, so we verify the
 * declared type against the actual bytes and reject a mismatch (e.g. an HTML
 * document claiming to be image/png). Container or no-signature types (video, zip,
 * docx, doc, text) are not strict-checked here: their signatures overlap (docx is a
 * zip, mp4/quicktime/avif share the `ftyp` box) or are absent (text), and they are
 * stored under random names and served non-executably, so the residual risk is low.
 */

const startsWith = (b: Buffer, bytes: number[]) =>
    b.length >= bytes.length && bytes.every((x, i) => b[i] === x);

const ascii = (b: Buffer, offset: number, s: string) =>
    b.length >= offset + s.length && b.toString("latin1", offset, offset + s.length) === s;

const isJpeg = (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]);
const isPng = (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isGif = (b: Buffer) => ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a");
const isWebp = (b: Buffer) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP");
const isAvif = (b: Buffer) =>
    ascii(b, 4, "ftyp") && ["avif", "avis", "mif1", "msf1", "miaf"].some((brand) => ascii(b, 8, brand));
const isPdf = (b: Buffer) => ascii(b, 0, "%PDF-");

/** Declared MIME -> byte-signature predicate. Only types with a reliable magic
 *  number are listed; anything else is intentionally not byte-checked here. */
const SIGNATURE: Record<string, (b: Buffer) => boolean> = {
    "image/jpeg": isJpeg,
    "image/png": isPng,
    "image/gif": isGif,
    "image/webp": isWebp,
    "image/avif": isAvif,
    "application/pdf": isPdf,
};

/**
 * True if `buffer`'s leading bytes are consistent with the client-declared
 * `mimetype`. Types without a signature entry are not byte-checked (returns true),
 * so this only ever rejects a clear mismatch, never a valid upload of an
 * unsignatured type.
 */
export function contentMatchesDeclared(mimetype: string, buffer: Buffer): boolean {
    const check = SIGNATURE[mimetype];
    return check ? check(buffer) : true;
}
