"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getCroppedImg } from "@/lib/getCroppedImg";
import { uploadImage, UploadImageError } from "@/lib/uploadImage";
import { ALLOWED_IMAGE_TYPES } from "@/lib/imageCompression";
import { getImageDimensions } from "@/lib/image-dimensions";

export interface ImageUploadWithCropProps {
  /** Current image URL, shown in the trigger/preview before a new one is picked. */
  value?: string | null;
  /**
   * width / height, e.g. 16 / 9 or 1. Omit for a free-form crop frame that
   * follows the selected image's own natural aspect ratio (no forced reshape) —
   * used for illustrative/body-content images that don't belong in one fixed frame.
   */
  aspectRatio?: number;
  cropShape?: "rect" | "round";
  /** Tailwind classes controlling the preview box's size/shape (e.g. "h-28 w-28 rounded-full"). */
  previewClassName?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Adds capture="environment" so mobile browsers offer the device camera alongside the photo library. */
  allowCamera?: boolean;
  /**
   * Reject the source file before opening the crop modal if it's smaller than
   * this. Cropping only reframes pixels — it can't fix a genuinely low-res
   * source, so this guards against a blurry result once stretched to the
   * target display size.
   */
  minWidth?: number;
  minHeight?: number;
  /**
   * Skip rendering the built-in preview box + button. Use with a ref and call
   * `.open()` from your own trigger (e.g. a toolbar icon button) — the hidden
   * file input and crop modal still render and work as normal.
   */
  hideTrigger?: boolean;

  /** Upload mode: component uploads the cropped image itself via the shared pipeline. */
  bucket?: string;
  folder?: string;
  upsert?: boolean;
  onUploaded?: (url: string) => void;

  /** Defer-upload mode: caller receives the cropped File (and an object-URL preview) and handles upload itself. */
  onCropped?: (file: File, previewUrl: string) => void;

  onError?: (message: string) => void;
  onRemove?: () => void;
}

export interface ImageUploadWithCropHandle {
  open: () => void;
}

function fileNameForCrop(original: File) {
  const dot = original.name.lastIndexOf(".");
  const base = dot > 0 ? original.name.slice(0, dot) : original.name;
  return `${base}-cropped.jpg`;
}

function ImageUploadWithCrop(
  {
    value,
    aspectRatio,
    cropShape = "rect",
    previewClassName = "h-32 w-full rounded-xl",
    label = "Upload photo",
    hint,
    disabled,
    allowCamera = true,
    minWidth,
    minHeight,
    hideTrigger = false,
    bucket,
    folder,
    upsert,
    onUploaded,
    onCropped,
    onError,
    onRemove,
  }: ImageUploadWithCropProps,
  ref: React.ForwardedRef<ImageUploadWithCropHandle>
) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    open: () => fileInputRef.current?.click(),
  }));

  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [effectiveAspect, setEffectiveAspect] = useState<number>(aspectRatio ?? 1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [checkingDimensions, setCheckingDimensions] = useState(false);
  const [error, setError] = useState("");

  const selectedImageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    selectedImageUrlRef.current = selectedImageUrl;
  }, [selectedImageUrl]);

  useEffect(() => {
    return () => {
      if (selectedImageUrlRef.current) URL.revokeObjectURL(selectedImageUrlRef.current);
    };
  }, []);

  function reportError(message: string) {
    setError(message);
    if (onError) onError(message);
    else alert(message);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError("");

    if (minWidth || minHeight) {
      setCheckingDimensions(true);
      try {
        const { width, height } = await getImageDimensions(file);
        if ((minWidth && width < minWidth) || (minHeight && height < minHeight)) {
          reportError(
            `This image is too small (${width}x${height}px). Use at least ${minWidth ?? 0}x${minHeight ?? 0}px so it doesn't blur once cropped and displayed.`
          );
          setCheckingDimensions(false);
          return;
        }
      } catch {
        // Couldn't read dimensions — let it through rather than block upload.
      }
      setCheckingDimensions(false);
    }

    if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setSelectedImageUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setEffectiveAspect(aspectRatio ?? 1);
    setCropModalOpen(true);
  }

  function handleMediaLoaded(mediaSize: { naturalWidth: number; naturalHeight: number }) {
    if (aspectRatio) return; // fixed ratio already set
    if (mediaSize.naturalWidth > 0 && mediaSize.naturalHeight > 0) {
      setEffectiveAspect(mediaSize.naturalWidth / mediaSize.naturalHeight);
    }
  }

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixelsResult: Area) => {
    setCroppedAreaPixels(croppedAreaPixelsResult);
  }, []);

  function closeCropModal() {
    setCropModalOpen(false);
    if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
    setSelectedImageUrl(null);
    setSelectedFile(null);
    setCroppedAreaPixels(null);
  }

  async function confirmCrop() {
    if (!selectedImageUrl || !selectedFile || !croppedAreaPixels) return;

    setUploading(true);
    setError("");

    try {
      const blob = await getCroppedImg(selectedImageUrl, croppedAreaPixels, "image/jpeg", 0.92);
      const croppedFile = new File([blob], fileNameForCrop(selectedFile), { type: "image/jpeg" });
      const croppedPreviewUrl = URL.createObjectURL(blob);

      if (onCropped) {
        onCropped(croppedFile, croppedPreviewUrl);
        setCropModalOpen(false);
        setSelectedImageUrl(null);
        setSelectedFile(null);
        setCroppedAreaPixels(null);
        setUploading(false);
        return;
      }

      if (!bucket || !folder) {
        throw new Error(
          "ImageUploadWithCrop: pass either onCropped, or both bucket and folder for it to upload for you."
        );
      }

      const url = await uploadImage(croppedFile, bucket, folder, { upsert });
      URL.revokeObjectURL(croppedPreviewUrl);
      onUploaded?.(url);
      setCropModalOpen(false);
      setSelectedImageUrl(null);
      setSelectedFile(null);
      setCroppedAreaPixels(null);
    } catch (err) {
      const message =
        err instanceof UploadImageError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not process this image.";
      reportError(message);
    } finally {
      setUploading(false);
    }
  }

  const previewSrc = value || null;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        capture={allowCamera ? "environment" : undefined}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {!hideTrigger && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            className={cn(
              "relative shrink-0 overflow-hidden border border-zinc-200 bg-zinc-50",
              previewClassName
            )}
          >
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-300">
                <Upload className="h-6 w-6" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled || uploading || checkingDimensions}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                {(uploading || checkingDimensions) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploading ? "Uploading..." : checkingDimensions ? "Checking..." : label}
              </button>
              {previewSrc && onRemove && (
                <button
                  type="button"
                  disabled={disabled || uploading}
                  onClick={onRemove}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
            {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          </div>
        </div>
      )}

      <Dialog
        open={cropModalOpen}
        onOpenChange={(open) => {
          if (!open && !uploading) closeCropModal();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Position your photo</DialogTitle>
          </DialogHeader>

          <div className="relative h-80 w-full overflow-hidden rounded-xl bg-zinc-900">
            {selectedImageUrl && (
              <Cropper
                image={selectedImageUrl}
                crop={crop}
                zoom={zoom}
                aspect={effectiveAspect}
                cropShape={cropShape}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onMediaLoaded={handleMediaLoaded}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-orange-600"
            />
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <DialogFooter>
            <button
              type="button"
              onClick={closeCropModal}
              disabled={uploading}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmCrop}
              disabled={uploading || !croppedAreaPixels}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-700 disabled:opacity-50"
            >
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? "Saving..." : "Use this photo"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default forwardRef(ImageUploadWithCrop);
