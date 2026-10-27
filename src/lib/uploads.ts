/** Identify an image by its magic bytes; never trust the client-supplied type or filename. */
export function sniffImage(b: Uint8Array): { ext: "png" | "jpg" | "webp" } | null {
  if (b.length > 12) {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png" };
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg" };
    const tag = (i: number) => String.fromCharCode(...b.slice(i, i + 4));
    if (tag(0) === "RIFF" && tag(8) === "WEBP") return { ext: "webp" };
  }
  return null;
}

export const MAX_COVER_BYTES = 2 * 1024 * 1024;
