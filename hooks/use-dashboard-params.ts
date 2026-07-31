"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function useDashboardParams() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "25");
  const search = searchParams.get("search") ?? "";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      if (!("page" in updates) && Object.keys(updates).some((k) => k !== "page")) {
        params.set("page", "1");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const getParam = useCallback(
    (key: string, fallback = "all") => searchParams.get(key) ?? fallback,
    [searchParams]
  );

  const buildQueryString = useCallback(
    (extra: Record<string, string | undefined> = {}) => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      if (search) params.set("search", search);
      for (const [key, value] of Object.entries(extra)) {
        if (value && value !== "all") params.set(key, value);
      }
      return params.toString();
    },
    [page, perPage, search]
  );

  return { page, perPage, search, updateParams, getParam, buildQueryString, searchParams };
}
