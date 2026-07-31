"use client";

import { useCallback, useState } from "react";

export function useDashboardExport() {
  const [exporting, setExporting] = useState(false);

  const exportCsv = useCallback(async (url: string, filename: string) => {
    setExporting(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Export failed.");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      return true;
    } catch {
      return false;
    } finally {
      setExporting(false);
    }
  }, []);

  return { exporting, exportCsv };
}
