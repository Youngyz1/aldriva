"use client";

/**
 * components/shared/ImageUploader.tsx
 *
 * Generic shared image uploader for every flow in the app.
 *
 * - `aspect`: "free" (default) shows the FULL original at its natural
 *   aspect ratio — no forced frame, no letterboxing. A number fixes the
 *   crop-frame ratio (avatars, logos).
 * - Default action ("Use photo") keeps the whole image. Cropping, zoom,
 *   and rotation are optional adjustments, never required.
 * - EXIF orientation is baked into the pixels once at selection time, so
 *   the editor, the crop coordinates, and the uploaded file always agree.
 * - Output is resized to `maxLongEdge` (default 1600px, never upscales)
 *   and re-encoded (`outputType`: auto JPEG/WebP default), so phone
 *   photos over 5MB still upload.
 * - Before/after byte sizes are shown; upload errors keep the selection
 *   and offer Retry.
 *
 * Uploads through the shared `uploadImage` pipeline, so server-side URL
 * and path checks keep passing in every flow (bucket + folder scoping
 * is the caller's responsibility).
 *
 * Two modes: immediate (default — needs `bucket` + `folder`, uploads on
 * confirm and reports the public URL via `onUploaded`) and defer
 * (`onCropped` — hands the rendered File + preview URL back so the
 * caller can upload later, e.g. once the storage folder exists).
 * `hideTrigger` + the `open()` handle embed the picker behind a custom
 * trigger such as a toolbar icon button.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { AlertCircle, CheckCircle2, Loader2, RotateCw, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadImage, UploadImageError } from "@/lib/uploadImage";
import { ALLOWED_IMAGE_TYPES } from "@/lib/imageCompression";
import {
  checkMinDimensions,
  computeResizeTarget,
  DEFAULT_MAX_LONG_EDGE_PX,
  exifSwapsDimensions,
  exifToCanvasTransform,
  formatImageBytes,
  orientedDimensions,
  readExifOrientation,
  resolveCropAspect,
  resolveOutputExtension,
  resolveOutputMime,
  isHeicImageFile,
  type OutputTypeOption,
} from "@/lib/image-upload";
import {
  createBoundedTaskQueue,
  INVITATION_GALLERY_UPLOAD_CONCURRENCY,
  selectFilesWithinLimit,
} from "@/lib/invitation-gallery-batch";

export interface ImageUploaderHandle {
  open: () => void;
}

export interface ImageUploaderProps {
  /**
   * Supabase Storage bucket, e.g. "cms-media", "profile-images".
   * Optional only in defer mode (`onCropped`): the caller uploads later.
   */
  bucket?: string;
  /**
   * Path prefix within the bucket, e.g. an event or user id.
   * Optional only in defer mode (`onCropped`).
   */
  folder?: string;
  /**
   * "free" (default) keeps the whole original image; a number fixes the
   * crop-frame ratio (width/height, e.g. 1 for square avatars).
   */
  aspect?: "free" | number;
  /** Long-edge resize ceiling in px (default 1600, never upscales). */
  maxLongEdge?: number;
  /** Output encoding: auto JPEG/WebP (default), or forced jpeg/webp. */
  outputType?: OutputTypeOption;
  /** Current image URL, shown in the trigger/preview before a new one is picked. */
  value?: string | null;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** When set, adds capture="environment" to force the device camera. */
  allowCamera?: boolean;
  /** Overwrite an existing object at the same path instead of erroring. */
  upsert?: boolean;
  /**
   * Hides the built-in trigger row so the caller can open the picker
   * through the `open()` handle (e.g. a toolbar icon button). The
   * full-image editor still appears once a file is selected.
   */
  hideTrigger?: boolean;
  /** Receives the public URL once the upload succeeds. */
  onUploaded?: (url: string) => void;
  onError?: (message: string) => void;
  onRemove?: () => void;
  /**
   * Defer mode: instead of uploading, hand the rendered File plus an
   * object-URL preview back to the caller (which owns the later upload,
   * e.g. create forms that only learn the storage folder on submit).
   * Pass either `onCropped`, or both `bucket` and `folder`.
   */
  onCropped?: (file: File, previewUrl: string) => void;
  /** Confirm button label (default "Use photo"). */
  confirmLabel?: string;
  /** Localized invitation-specific rejection for HEIC/HEIF source files. */
  heicUnsupportedMessage?: string;
  /**
   * Reject the source file when its natural size is below this floor.
   * Cropping only reframes pixels — it can't fix a genuinely low-res
   * source, so this guards against a blurry result once displayed.
   */
  minWidth?: number;
  minHeight?: number;
}

export interface NormalizedImage {
  /** Object URL of the EXIF-corrected, resized working copy. */
  url: string;
  width: number;
  height: number;
  /** Oriented source size before the long-edge resize (for min-size guards). */
  sourceWidth: number;
  sourceHeight: number;
  originalBytes: number;
}

function fileBaseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).replace(/[^\w\-]+/g, "-") || "photo";
}

/**
 * Bakes EXIF orientation into pixels and scales the long edge to
 * `maxLongEdge` (never upscales). Returns a working copy whose pixels
 * match what the editor displays 1:1.
 */
export async function normalizeImageFile(file: File, maxLongEdge: number): Promise<NormalizedImage> {
  const buffer = await file.arrayBuffer();
  const exifOrientation = readExifOrientation(buffer);
  const bitmap = await createImageBitmap(new Blob([buffer], { type: file.type }));
  try {
    const natural = { width: bitmap.width, height: bitmap.height };
    if (natural.width <= 0 || natural.height <= 0) {
      throw new Error("Could not read this image.");
    }
    const oriented = orientedDimensions(natural, exifOrientation);
    const target = computeResizeTarget(oriented, maxLongEdge);
    // drawImage downscales in one step; draw at the final size directly.
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process this image.");
    const { rotateDeg, flip } = exifToCanvasTransform(exifOrientation);
    ctx.save();
    ctx.translate(target.width / 2, target.height / 2);
    ctx.rotate((rotateDeg * Math.PI) / 180);
    ctx.scale(flip === "horizontal" ? -1 : 1, flip === "vertical" ? -1 : 1);
    // Uniform scale from the oriented size to the resize target (aspect is
    // preserved by computeResizeTarget, so either axis gives the same ratio).
    const orientedW = exifSwapsDimensions(exifOrientation) ? natural.height : natural.width;
    const s = target.width / orientedW;
    const dw = natural.width * s;
    const dh = natural.height * s;
    ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) throw new Error("Could not process this image.");
    return {
      url: URL.createObjectURL(blob),
      width: target.width,
      height: target.height,
      sourceWidth: oriented.width,
      sourceHeight: oriented.height,
      originalBytes: file.size,
    };
  } finally {
    bitmap.close();
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image."));
    image.src = url;
  });
}

/**
 * Renders the final upload: optional free/fixed-aspect crop + user
 * rotation applied to the normalized working copy, re-encoded.
 */
export async function renderFinalImage(
  normalizedUrl: string,
  crop: Area | null,
  rotationDeg: number,
  sourceType: string,
  sourceName: string,
  outputType: OutputTypeOption
): Promise<{ file: File; bytes: number }> {
  const image = await loadHtmlImage(normalizedUrl);
  const mime = resolveOutputMime(sourceType, outputType);
  const ext = resolveOutputExtension(sourceType, outputType);
  const rot = ((rotationDeg % 360) + 360) % 360;

  // Rotation bounding box (crop coordinates are in the rotated frame when
  // the cropper handles rotation; react-easy-crop reports pixels against
  // the rotated image, so rotate first, then cut the crop rect).
  const swap = rot === 90 || rot === 270;
  const rotatedW = swap ? image.naturalHeight : image.naturalWidth;
  const rotatedH = swap ? image.naturalWidth : image.naturalHeight;

  const rotated = document.createElement("canvas");
  rotated.width = rotatedW;
  rotated.height = rotatedH;
  const rctx = rotated.getContext("2d");
  if (!rctx) throw new Error("Could not process this image.");
  rctx.save();
  rctx.translate(rotatedW / 2, rotatedH / 2);
  rctx.rotate((rot * Math.PI) / 180);
  rctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  rctx.restore();

  const rect = crop ?? { x: 0, y: 0, width: rotatedW, height: rotatedH };
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(rect.width));
  out.height = Math.max(1, Math.round(rect.height));
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Could not process this image.");
  octx.drawImage(
    rotated,
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
    0,
    0,
    out.width,
    out.height
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, mime, 0.85)
  );
  if (!blob) throw new Error("Could not process this image.");
  return {
    file: new File([blob], `${fileBaseName(sourceName)}-upload.${ext}`, { type: mime }),
    bytes: blob.size,
  };
}

export const ImageUploader = forwardRef<ImageUploaderHandle, ImageUploaderProps>(function ImageUploader(
  {
    bucket,
    folder,
    aspect = "free",
    maxLongEdge = DEFAULT_MAX_LONG_EDGE_PX,
    outputType = "auto",
    value,
    label = "Upload photo",
    hint,
    disabled,
    allowCamera = false,
    upsert,
    hideTrigger = false,
    onUploaded,
    onError,
    onRemove,
    onCropped,
    confirmLabel = "Use photo",
    heicUnsupportedMessage,
    minWidth,
    minHeight,
  }: ImageUploaderProps,
  ref: React.ForwardedRef<ImageUploaderHandle>
) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    open: () => fileInputRef.current?.click(),
  }));

  const [normalized, setNormalized] = useState<NormalizedImage | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState("image/jpeg");
  const [preparing, setPreparing] = useState(false);
  // Optional adjustments (off by default — confirm keeps everything)
  const [adjusting, setAdjusting] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);

  const [uploading, setUploading] = useState(false);
  const [finalBytes, setFinalBytes] = useState<number | null>(null);
  const [error, setError] = useState("");

  const normalizedRef = useRef<NormalizedImage | null>(null);
  useEffect(() => {
    normalizedRef.current = normalized;
  }, [normalized]);
  useEffect(() => {
    return () => {
      if (normalizedRef.current) URL.revokeObjectURL(normalizedRef.current.url);
    };
  }, []);

  function reportError(message: string) {
    setError(message);
    onError?.(message);
  }

  function resetSelection() {
    if (normalized) URL.revokeObjectURL(normalized.url);
    setNormalized(null);
    setSourceName("");
    setAdjusting(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCropPixels(null);
    setFinalBytes(null);
    setError("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (disabled || preparing || uploading) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      reportError(
        isHeicImageFile(file) && heicUnsupportedMessage
          ? heicUnsupportedMessage
          : "Unsupported file type. Please upload a JPEG, PNG, or WebP image."
      );
      return;
    }

    resetSelection();
    setError("");
    setPreparing(true);
    try {
      const image = await normalizeImageFile(file, maxLongEdge);
      const tooSmall =
        (minWidth || minHeight) &&
        checkMinDimensions(image.sourceWidth, image.sourceHeight, minWidth, minHeight);
      if (tooSmall) {
        URL.revokeObjectURL(image.url);
        reportError(tooSmall);
        return;
      }
      setNormalized(image);
      setSourceName(file.name);
      setSourceType(file.type);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Could not read this image.");
    } finally {
      setPreparing(false);
    }
  }

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCropPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!normalized || uploading) return;
    if (!onCropped && (!bucket || !folder)) {
      reportError(
        "ImageUploader: pass either onCropped, or both bucket and folder for it to upload for you."
      );
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { file } = await renderFinalImage(
        normalized.url,
        adjusting ? cropPixels : null,
        adjusting ? rotation : 0,
        sourceType,
        sourceName,
        outputType
      );
      setFinalBytes(file.size);
      if (onCropped) {
        // Defer mode: the caller owns the upload (e.g. the storage
        // folder only exists after submit). Release the working copy,
        // then hand over the rendered file plus a preview URL.
        resetSelection();
        const previewUrl = URL.createObjectURL(file);
        onCropped(file, previewUrl);
        return;
      }
      const url = await uploadImage(file, bucket as string, folder as string, { upsert });
      URL.revokeObjectURL(normalized.url);
      setNormalized(null);
      onUploaded?.(url);
      resetSelection();
    } catch (err) {
      const message =
        err instanceof UploadImageError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not process this image.";
      reportError(`${message} You can retry — your selection is kept.`);
    } finally {
      setUploading(false);
    }
  }

  const busy = preparing || uploading;
  const previewSrc = value || null;
  const frameAspect = normalized
    ? resolveCropAspect({ width: normalized.width, height: normalized.height }, aspect)
    : 1;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={[
          ...ALLOWED_IMAGE_TYPES,
          ...(heicUnsupportedMessage ? [".heic", ".heif", "image/heic", "image/heif"] : []),
        ].join(",")}
        capture={allowCamera ? "environment" : undefined}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Current value + trigger (hidden in toolbar/defer mode — the
          full-image editor below still appears once a file is picked) */}
      {!hideTrigger && (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt="" className="block h-auto w-full max-w-55 max-h-44 object-contain" />
          ) : (
            <div className="flex h-28 w-44 items-center justify-center text-zinc-300">
              <Upload className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {preparing ? "Reading..." : uploading ? "Uploading..." : label}
            </button>
            {previewSrc && onRemove && (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={onRemove}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>
          {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
          {error && !normalized && <p className="text-xs font-semibold text-red-600">{error}</p>}
        </div>
      </div>
      )}

      {/* Full-image editor (natural aspect ratio unless a fixed aspect is set) */}
      {normalized && (
        <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-zinc-800">
              {sourceName || "Selected photo"}
              <span className="ml-2 font-semibold text-zinc-400 tabular-nums">
                {normalized.width}×{normalized.height}
              </span>
            </p>
            <button
              type="button"
              onClick={resetSelection}
              disabled={uploading}
              className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-50"
              aria-label="Discard selection"
            >
              <X size={14} />
            </button>
          </div>

          {adjusting ? (
            <div className="relative h-80 w-full overflow-hidden rounded-xl bg-zinc-900">
              <Cropper
                image={normalized.url}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={frameAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
              />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={normalized.url}
              alt=""
              className="block h-auto w-full rounded-xl bg-zinc-100"
            />
          )}

          {/* Optional adjustments */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAdjusting((v) => !v)}
              disabled={uploading}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50",
                adjusting
                  ? "border-orange-600 bg-orange-50 text-orange-700"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {adjusting ? "Adjusting: on" : aspect === "free" ? "Crop / zoom" : "Reposition"}
            </button>
            {adjusting && (
              <>
                <div className="flex min-w-40 flex-1 items-center gap-2">
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Zoom
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-orange-600"
                    aria-label="Zoom"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  <RotateCw size={13} /> Rotate {rotation}°
                </button>
              </>
            )}
          </div>

          {/* Before / after sizes */}
          <p className="text-[11px] text-zinc-500 tabular-nums">
            Original: {formatImageBytes(normalized.originalBytes)}
            {finalBytes !== null && <> · Ready to upload: {formatImageBytes(finalBytes)}</>}
          </p>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            {error && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={uploading}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={uploading || (adjusting && !cropPixels)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-orange-700 disabled:opacity-50"
            >
              {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {uploading ? "Uploading..." : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export interface ImageUploaderMultipleMessages {
  queued: string;
  processing: string;
  uploading: string;
  complete: string;
  retry: string;
  remove: string;
  unsupportedType: string;
  heicUnsupported: string;
  overflow: (count: number) => string;
}

export interface ImageUploaderMultipleProps {
  bucket: string;
  folder: string;
  maxFiles: number;
  maxLongEdge?: number;
  label: string;
  hint?: string;
  disabled?: boolean;
  messages: ImageUploaderMultipleMessages;
  onUploaded: (url: string) => void;
}

type BatchJobStatus = "queued" | "processing" | "uploading" | "complete" | "error";

interface BatchJob {
  id: string;
  name: string;
  status: BatchJobStatus;
  progress: number;
  error?: string;
  retryable: boolean;
}

/** Gallery batch mode shares the normalizer, renderer, and storage uploader above. */
export function ImageUploaderMultiple({
  bucket,
  folder,
  maxFiles,
  maxLongEdge = DEFAULT_MAX_LONG_EDGE_PX,
  label,
  hint,
  disabled,
  messages,
  onUploaded,
}: ImageUploaderMultipleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(new Map<string, File>());
  const jobsRef = useRef<BatchJob[]>([]);
  const [queue] = useState(() => createBoundedTaskQueue(INVITATION_GALLERY_UPLOAD_CONCURRENCY));
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [overflowMessage, setOverflowMessage] = useState("");

  function commitJobs(update: (current: BatchJob[]) => BatchJob[]) {
    const next = update(jobsRef.current);
    jobsRef.current = next;
    setJobs(next);
  }

  function updateJob(id: string, patch: Partial<BatchJob>) {
    commitJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }

  function enqueueUpload(id: string) {
    const file = filesRef.current.get(id);
    if (!file) return;
    void queue.enqueue(async () => {
      let normalized: NormalizedImage | null = null;
      try {
        updateJob(id, { status: "processing", progress: 20, error: undefined });
        normalized = await normalizeImageFile(file, maxLongEdge);
        const rendered = await renderFinalImage(normalized.url, null, 0, file.type, file.name, "auto");
        updateJob(id, { status: "uploading", progress: 70 });
        const url = await uploadImage(rendered.file, bucket, folder);
        onUploadedRef.current(url);
        filesRef.current.delete(id);
        updateJob(id, { status: "complete", progress: 100, retryable: false });
      } catch (error) {
        const message = error instanceof UploadImageError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not process this image.";
        updateJob(id, { status: "error", error: message, retryable: true });
      } finally {
        if (normalized) URL.revokeObjectURL(normalized.url);
      }
    });
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!selected.length || disabled) return;

    const unsupported = selected.filter(
      (file) => !ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])
    );
    const supported = selected.filter(
      (file) => ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])
    );
    const occupied = jobsRef.current.filter((job) => job.status !== "complete" && job.retryable).length;
    const available = Math.max(0, maxFiles - occupied);
    const { accepted, overflowCount } = selectFilesWithinLimit(supported, available);
    setOverflowMessage(overflowCount > 0 ? messages.overflow(overflowCount) : "");

    const rejectedJobs: BatchJob[] = unsupported.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      status: "error",
      progress: 0,
      error: isHeicImageFile(file) ? messages.heicUnsupported : messages.unsupportedType,
      retryable: false,
    }));
    commitJobs((current) => [...current, ...rejectedJobs]);

    const acceptedJobs: BatchJob[] = accepted.map((file) => {
      const id = `${Date.now()}-${Math.random()}`;
      filesRef.current.set(id, file);
      return { id, name: file.name, status: "queued", progress: 0, retryable: true };
    });
    commitJobs((current) => [...current, ...acceptedJobs]);
    for (const job of acceptedJobs) enqueueUpload(job.id);
  }

  function retry(job: BatchJob) {
    if (!job.retryable) return;
    updateJob(job.id, { status: "queued", progress: 0, error: undefined });
    enqueueUpload(job.id);
  }

  function remove(job: BatchJob) {
    filesRef.current.delete(job.id);
    commitJobs((current) => current.filter((candidate) => candidate.id !== job.id));
  }

  const occupied = jobs.filter((job) => job.status !== "complete" && job.retryable).length;
  const available = Math.max(0, maxFiles - occupied);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={[...ALLOWED_IMAGE_TYPES, ".heic", ".heif", "image/heic", "image/heif"].join(",")}
        onChange={handleFiles}
        className="hidden"
        disabled={disabled || available === 0}
      />
      <button
        type="button"
        disabled={disabled || available === 0}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {label}
      </button>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
      {overflowMessage && <p className="text-xs font-semibold text-amber-700" role="status">{overflowMessage}</p>}
      {jobs.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {jobs.map((job) => {
            const statusText = job.status === "error"
              ? job.error
              : job.status === "queued"
                ? messages.queued
                : job.status === "processing"
                  ? messages.processing
                  : job.status === "uploading"
                    ? messages.uploading
                    : messages.complete;
            return (
              <li key={job.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-semibold text-zinc-800">{job.name}</p>
                    <p className={job.status === "error" ? "mt-0.5 text-[11px] text-red-700" : "mt-0.5 text-[11px] text-zinc-500"}>
                      {statusText}
                    </p>
                  </div>
                  {job.status === "error" && (
                    <div className="flex shrink-0 gap-2">
                      {job.retryable && (
                        <button type="button" onClick={() => retry(job)} className="text-[11px] font-bold text-orange-700 hover:underline">
                          {messages.retry}
                        </button>
                      )}
                      <button type="button" onClick={() => remove(job)} className="text-[11px] font-bold text-zinc-500 hover:underline">
                        {messages.remove}
                      </button>
                    </div>
                  )}
                </div>
                {job.status === "complete" ? (
                  <CheckCircle2 size={14} className="mt-2 text-emerald-600" aria-hidden />
                ) : job.status === "error" ? (
                  <AlertCircle size={14} className="mt-2 text-red-600" aria-hidden />
                ) : (
                  <div
                    role="progressbar"
                    aria-label={`${job.name}: ${statusText}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={job.progress}
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100"
                  >
                    <div className="h-full rounded-full bg-orange-600 transition-[width]" style={{ width: `${job.progress}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
