/**
 * lib/memories/heic-convert.d.ts
 *
 * Ambient types for the untyped `heic-convert` dependency (Round 4).
 * Kept minimal: only the surface used by the photo pipeline.
 */
declare module "heic-convert" {
  export interface HeicConvertOptions {
    buffer: ArrayBuffer | Uint8Array | Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  export default function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
}
