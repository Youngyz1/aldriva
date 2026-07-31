import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const DEFAULT_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
] as const;

export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type UploadKind = "image" | "video" | "document";

export type UploadableFile = {
  name: string;
  size: number;
  type: string;
};

export type UploadPublicFileOptions<TFile extends UploadableFile & Blob> = {
  supabase: SupabaseClient;
  bucket: string;
  file: TFile;
  folder: string;
  kind?: UploadKind;
  maxBytes?: number;
  allowedTypes?: readonly string[];
  upsert?: boolean;
};

export type UploadedPublicFile = {
  bucket: string;
  path: string;
  publicUrl: string;
  contentType: string;
  size: number;
};

export function safeFileName(fileName: string) {
  const cleanName = fileName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleanName || "upload";
}

export function buildUploadPath(folder: string, fileName: string) {
  const cleanFolder = folder
    .split("/")
    .map((part) =>
      part
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9.]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean)
    .join("/");

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  const cleanFileName = safeFileName(fileName);

  return [cleanFolder, `${timestamp}-${random}-${cleanFileName}`]
    .filter(Boolean)
    .join("/");
}

export function validateUploadFile(
  file: UploadableFile,
  options: {
    kind?: UploadKind;
    maxBytes?: number;
    allowedTypes?: readonly string[];
  } = {}
) {
  const allowedTypes =
    options.allowedTypes ??
    (options.kind === "video" ? DEFAULT_VIDEO_TYPES : DEFAULT_IMAGE_TYPES);
  const maxBytes =
    options.maxBytes ??
    (options.kind === "video" ? DEFAULT_VIDEO_MAX_BYTES : DEFAULT_IMAGE_MAX_BYTES);

  if (file.size > maxBytes) {
    throw new Error(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`);
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    throw new Error("Unsupported file type.");
  }
}

export async function uploadPublicFile<TFile extends UploadableFile & Blob>({
  supabase,
  bucket,
  file,
  folder,
  kind = "image",
  maxBytes,
  allowedTypes,
  upsert = false,
}: UploadPublicFileOptions<TFile>): Promise<UploadedPublicFile> {
  validateUploadFile(file, { kind, maxBytes, allowedTypes });

  const path = buildUploadPath(folder, file.name);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type,
      upsert,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    bucket,
    path,
    publicUrl: data.publicUrl,
    contentType: file.type,
    size: file.size,
  };
}
