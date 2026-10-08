"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED_ASSET_EXTENSIONS,
  assetExtensionOf,
  formatFileSize,
  sniffAssetBytes,
  validateAssetRequest,
} from "@/lib/digital-products";

export type ProductAssetRow = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  position: number;
  is_preview: boolean;
  version: string;
  created_at: string;
};

const MAX_HEAD_BYTES = 64 * 1024;

async function readHead(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, MAX_HEAD_BYTES);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Owner-facing digital asset manager: upload (signed-URL flow with a
 * client-side magic-byte preflight), list, reorder, preview-flag, version,
 * delete. All persistence goes through the service-role API routes —
 * product_assets has no client INSERT/UPDATE/DELETE RLS policies.
 */
export default function AssetManager({ productId }: { productId: string }) {
  const [assets, setAssets] = useState<ProductAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingVersion, setEditingVersion] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${productId}/assets`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not load assets.");
      }
      const data = await res.json();
      setAssets(data.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assets.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadOne(file: File) {
    const key = `${file.name}-${file.size}`;
    setUploading((prev) => [...prev, key]);
    try {
      // 1. Client-side gates: extension + size, then magic-byte preflight.
      const check = validateAssetRequest(file.name, file.size);
      if (!check.valid || !check.ext) throw new Error(check.error);
      const head = await readHead(file);
      const sniff = sniffAssetBytes(head, check.ext);
      if (!sniff.valid) throw new Error(sniff.error || "File failed validation.");

      // 2. Mint a scoped signed upload URL (server builds the path).
      const urlRes = await fetch(`/api/products/${productId}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSizeBytes: file.size, mimeType: file.type || undefined }),
      });
      const urlData = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok) throw new Error(urlData.error || "Could not prepare upload.");

      // 3. PUT the bytes straight to private storage (no app server in path).
      const putRes = await fetch(urlData.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": urlData.contentType || file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed. Please retry.");

      // 4. Server verifies the stored object, then inserts the asset row.
      const confirmRes = await fetch(`/api/products/${productId}/assets/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: urlData.assetId,
          path: urlData.path,
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: urlData.contentType || file.type || undefined,
        }),
      });
      const confirmData = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) throw new Error(confirmData.error || "Could not attach file.");

      setAssets((prev) => [...prev, confirmData.asset].sort((a, b) => a.position - b.position));
      setNotice(`"${file.name}" uploaded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not upload "${file.name}".`);
    } finally {
      setUploading((prev) => prev.filter((k) => k !== key));
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    setNotice("");
    for (const file of Array.from(files)) {
      await uploadOne(file);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function persist(list: ProductAssetRow[]) {
    const res = await fetch(`/api/products/${productId}/assets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assets: list.map((a, i) => ({ id: a.id, position: i })),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not save order.");
    }
    setAssets(list.map((a, i) => ({ ...a, position: i })));
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...assets];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setError("");
    try {
      await persist(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder.");
      load();
    }
  }

  async function togglePreview(asset: ProductAssetRow) {
    setError("");
    try {
      const res = await fetch(`/api/products/${productId}/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets: [{ id: asset.id, is_preview: !asset.is_preview }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not update asset.");
      }
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, is_preview: !a.is_preview } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update asset.");
    }
  }

  async function saveVersion(asset: ProductAssetRow) {
    const version = (editingVersion[asset.id] ?? asset.version).trim() || "1.0";
    if (version.length > 20) {
      setError("Version cannot exceed 20 characters.");
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/products/${productId}/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: [{ id: asset.id, version }] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not update version.");
      }
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, version } : a)));
      setEditingVersion((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update version.");
    }
  }

  async function remove(asset: ProductAssetRow) {
    if (!window.confirm(`Remove "${asset.file_name}" from this product? Buyers lose access to this file.`)) {
      return;
    }
    setError("");
    try {
      const res = await fetch(
        `/api/products/${productId}/assets?assetId=${asset.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not remove asset.");
      }
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      setNotice(`"${asset.file_name}" removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove asset.");
    }
  }

  return (
    <div className="space-y-4 border-t border-zinc-200 pt-6">
      <div className="flex items-center justify-between border-b border-slate-50 pb-2">
        <h2 className="text-lg font-bold text-slate-900">Digital Files</h2>
        <span className="text-xs font-bold text-zinc-400">{assets.length} file(s)</span>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm font-semibold text-emerald-800">
          {notice}
        </div>
      )}

      <div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ALLOWED_ASSET_EXTENSIONS.join(",")}
          onChange={(e) => handleFiles(e.target.files)}
          className="block w-full text-sm font-semibold text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-600 file:px-4 file:py-2.5 file:text-sm file:font-black file:text-white hover:file:bg-orange-700 file:transition file:cursor-pointer"
        />
        <p className="text-xs text-slate-400 mt-1">
          PDF, EPUB, MOBI, ZIP, XLSX, CSV, DOCX, PPTX, MP3, MP4, PNG, JPG, WEBP — up to 200MB each.
          Files stay private until a buyer pays.
        </p>
        {uploading.length > 0 && (
          <p className="mt-2 text-xs font-bold text-orange-600">
            Uploading {uploading.length} file(s)…
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm font-semibold text-slate-400">Loading files…</p>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
          <p className="text-sm font-bold text-zinc-500">No files yet. Upload your first deliverable above.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
          {assets.map((a, i) => (
            <li key={a.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">{a.file_name}</span>
                  {a.is_preview && (
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">
                      Preview
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs font-semibold text-slate-400">
                  {assetExtensionOf(a.file_name).replace(".", "").toUpperCase() || a.mime_type} ·{" "}
                  {formatFileSize(a.file_size_bytes)} · v{a.version}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={editingVersion[a.id] ?? a.version}
                    onChange={(e) =>
                      setEditingVersion((prev) => ({ ...prev, [a.id]: e.target.value }))
                    }
                    maxLength={20}
                    placeholder="Version"
                    aria-label={`Version for ${a.file_name}`}
                    className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold outline-none focus:border-orange-500"
                  />
                  {(editingVersion[a.id] ?? a.version) !== a.version && (
                    <button
                      type="button"
                      onClick={() => saveVersion(a)}
                      className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-700"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === assets.length - 1}
                  aria-label="Move down"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => togglePreview(a)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {a.is_preview ? "Unmark preview" : "Mark preview"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
