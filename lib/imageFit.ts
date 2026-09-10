/**
 * Full-image ("fit") banner rendering.
 *
 * The legacy banner flow extracts only the react-easy-crop rectangle via
 * getCroppedImg, which silently discards every pixel outside the crop box.
 * These helpers implement the opposite contract: the COMPLETE source image
 * is always preserved. The image is scaled to fit inside a frame of the
 * requested banner aspect ratio (letterboxed on a neutral background when
 * the aspects differ) and can be zoomed out / repositioned within the frame,
 * but never cropped — pan offsets are clamped so the image stays fully
 * inside the frame at every setting.
 *
 * The layout math is pure (no DOM) so it is unit-testable; only
 * getContainedImg touches the DOM (same canvas pattern as getCroppedImg).
 */

export interface ContainLayoutInput {
  /** Natural source image size in pixels. Must both be > 0. */
  srcWidth: number;
  srcHeight: number;
  /** Requested frame aspect ratio (width / height), e.g. 16 / 9. */
  frameAspect: number;
  /** 0 < zoom <= 1. 1 = fitted edge-to-edge; smaller zooms the image out
   *  (more padding). Zoom-in is intentionally impossible: magnifying past
   *  fit would force cropping, which this mode forbids. */
  zoom?: number;
  /** Desired image-center offset in output pixels. Clamped to keep the whole
   *  image inside the frame. */
  panX?: number;
  panY?: number;
  /** Long-edge cap for the output frame in pixels. No upscaling ever occurs:
   *  sources smaller than the cap keep their natural pixel size. */
  maxLongEdge?: number;
}

export interface ContainLayout {
  frameWidth: number;
  frameHeight: number;
  /** Drawn image size in output pixels. */
  imageWidth: number;
  imageHeight: number;
  /** Top-left draw origin of the image inside the frame. Always satisfies
   *  0 <= offset <= frame - image on both axes (image fully inside). */
  offsetX: number;
  offsetY: number;
  /** Effective (sanitized + clamped) zoom and pan. */
  zoom: number;
  panX: number;
  panY: number;
}

/** Longest edge (width or height) a fit-mode output frame may have. Matches
 *  the shared upload ceiling so the downstream compressor is a no-op on size. */
export const FIT_MAX_LONG_EDGE = 1920;

/** Neutral letterbox background for aspect-mismatch padding. */
export const FIT_BACKGROUND = "#f4f4f5";

/** Smallest image scale the fit editor offers (zoomed fully out). */
export const FIT_MIN_ZOOM = 0.5;

function sanitizeZoom(zoom: number | undefined): number {
  if (!Number.isFinite(zoom as number) || (zoom as number) <= 0) return 1;
  return Math.min(1, zoom as number);
}

/**
 * Computes where the full source image lands inside the output frame.
 * Pure function — every source pixel is always inside the returned rect.
 */
export function computeContainLayout(input: ContainLayoutInput): ContainLayout {
  const { srcWidth, srcHeight, frameAspect } = input;
  if (!(srcWidth > 0) || !(srcHeight > 0)) {
    throw new Error("computeContainLayout: source dimensions must be positive.");
  }
  if (!(frameAspect > 0) || !Number.isFinite(frameAspect)) {
    throw new Error("computeContainLayout: frame aspect ratio must be positive.");
  }

  const zoom = sanitizeZoom(input.zoom);
  const maxLongEdge =
    input.maxLongEdge && input.maxLongEdge > 0 ? input.maxLongEdge : FIT_MAX_LONG_EDGE;

  // Smallest frame of the requested aspect that contains the source.
  const baseFrameWidth = Math.max(srcWidth, srcHeight * frameAspect);
  const baseFrameHeight = baseFrameWidth / frameAspect;

  // Cap the long edge; never upscale.
  const longEdge = Math.max(baseFrameWidth, baseFrameHeight);
  const k = Math.min(1, maxLongEdge / longEdge);
  const frameWidth = Math.max(1, Math.round(baseFrameWidth * k));
  const frameHeight = Math.max(1, Math.round(baseFrameHeight * k));

  const imageWidth = Math.max(1, Math.round(srcWidth * k * zoom));
  const imageHeight = Math.max(1, Math.round(srcHeight * k * zoom));

  // Slack on each side; zero when the image exactly fills the frame.
  const slackX = Math.max(0, (frameWidth - imageWidth) / 2);
  const slackY = Math.max(0, (frameHeight - imageHeight) / 2);
  const panX = Math.min(slackX, Math.max(-slackX, input.panX ?? 0));
  const panY = Math.min(slackY, Math.max(-slackY, input.panY ?? 0));

  return {
    frameWidth,
    frameHeight,
    imageWidth,
    imageHeight,
    offsetX: (frameWidth - imageWidth) / 2 + panX,
    offsetY: (frameHeight - imageHeight) / 2 + panY,
    zoom,
    panX,
    panY,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

export interface ContainedImageOptions {
  frameAspect: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  maxLongEdge?: number;
  background?: string;
  mimeType?: string;
  quality?: number;
}

/**
 * Renders the COMPLETE source image into a banner-aspect frame (contain,
 * never cover) and returns it as a Blob. Same canvas pattern as
 * getCroppedImg; the only behavioral difference is full preservation.
 */
export async function getContainedImg(
  imageSrc: string,
  options: ContainedImageOptions
): Promise<Blob> {
  const {
    frameAspect,
    zoom,
    panX,
    panY,
    maxLongEdge,
    background = FIT_BACKGROUND,
    mimeType = "image/jpeg",
    quality = 0.92,
  } = options;

  const image = await loadImage(imageSrc);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
    throw new Error("Could not read image dimensions.");
  }

  const layout = computeContainLayout({
    srcWidth: naturalWidth,
    srcHeight: naturalHeight,
    frameAspect,
    zoom,
    panX,
    panY,
    maxLongEdge,
  });

  const canvas = document.createElement("canvas");
  canvas.width = layout.frameWidth;
  canvas.height = layout.frameHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get canvas context.");
  }

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, layout.frameWidth, layout.frameHeight);
  ctx.drawImage(
    image,
    0,
    0,
    naturalWidth,
    naturalHeight,
    layout.offsetX,
    layout.offsetY,
    layout.imageWidth,
    layout.imageHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty — could not produce the banner image."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}
