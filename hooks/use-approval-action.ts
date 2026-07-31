"use client";

/**
 * Shared PATCH-call logic for the admin approve/reject actions on Articles,
 * Businesses, and Products — all three call the same shape of endpoint
 * (app/api/admin/{resource}/[id]/route.ts) with the same body shape
 * ({status} or {status: "rejected", rejection_reason}). This hook only
 * owns the fetch/parse/error-shape boilerplate; each panel keeps its own
 * existing working/error/fetchData state, exactly as it already does for
 * Delete/Flag/Unpublish.
 */
export function useApprovalAction(resourceApiPath: string) {
  async function updateStatus(
    id: string,
    body: { status: string; rejection_reason?: string | null }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${resourceApiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error ?? "Failed to update status." };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "An error occurred." };
    }
  }

  return { updateStatus };
}
