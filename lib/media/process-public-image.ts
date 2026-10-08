import sharp from "sharp";
import { imageTypeForSharpFormat } from "@/lib/media/public-media";
import type { PublicMediaType } from "@/lib/media/constants";

const MAX_INPUT_PIXELS = 50_000_000;

// Required by the sharp advisory: untrusted uploads must never reach the SVG decoder.
sharp.block({ operation: ["VipsForeignLoadSvg"] });

export async function processPublicImage(input: Buffer): Promise<{
  body: Buffer;
  width: number;
  height: number;
  inputType: PublicMediaType;
}> {
  const limits = { limitInputPixels: MAX_INPUT_PIXELS, pages: 1 };
  const metadata = await sharp(input, limits).metadata();
  const inputType = imageTypeForSharpFormat(metadata.format, metadata.compression);

  if (!inputType || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
    throw new Error("Unsupported or invalid image.");
  }

  const processed = await sharp(input, limits)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return {
    body: processed.data,
    width: processed.info.width,
    height: processed.info.height,
    inputType,
  };
}
