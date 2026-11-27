"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  linkWorkerToStaff,
  listLinkableWorkers,
  unlinkWorkerFromStaff,
  type LinkableWorkerRow,
  type LinkedWorkerRow,
} from "@/lib/actions/staff-worker-links";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

// Same dynamic-key escape the other staff panels use.
function translateByCode(t: (key: any) => string, code: string, fallback: string): string {
  try {
    return t(code as any);
  } catch {
    return fallback;
  }
}

export default function StaffWorkerLinksPanel({
  businessId,
  staffMemberId,
  staffStatus,
  initialLinks,
  canLink,
  onLinksChange,
}: {
  businessId: string;
  staffMemberId: string;
  staffStatus: "active" | "suspended" | "deactivated";
  initialLinks: LinkedWorkerRow[];
  canLink: boolean;
  onLinksChange?: (links: LinkedWorkerRow[]) => void;
}) {
  const t = useTranslations("Workforce");
  const [links, setLinks] = useState<LinkedWorkerRow[]>(initialLinks);
  const [linkable, setLinkable] = useState<LinkableWorkerRow[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const pickerAllowed = canLink && staffStatus === "active";

  const loadLinkable = useCallback(async () => {
    const res = await listLinkableWorkers(businessId);
    if (res.success) {
      setLinkable(res.data);
    } else {
      setError(translateByCode(t, res.code, res.error));
    }
  }, [businessId, t]);

  useEffect(() => {
    if (pickerAllowed) void loadLinkable();
  }, [pickerAllowed, loadLinkable]);

  async function handleLink() {
    if (!selectedWorkerId) return;
    setError(null);
    setLinking(true);
    const res = await linkWorkerToStaff(businessId, staffMemberId, selectedWorkerId);
    setLinking(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    const nextAfterLink = [...links, res.data];
    setLinks(nextAfterLink);
    onLinksChange?.(nextAfterLink);
    setLinkable((prev) => prev.filter((w) => w.id !== res.data.worker_id));
    setSelectedWorkerId("");
  }

  async function handleUnlink(link: LinkedWorkerRow) {
    setError(null);
    setRowBusy(link.link_id);
    const res = await unlinkWorkerFromStaff(businessId, staffMemberId, link.worker_id);
    setRowBusy(null);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    const nextAfterUnlink = links.filter((l) => l.link_id !== link.link_id);
    setLinks(nextAfterUnlink);
    onLinksChange?.(nextAfterUnlink);
    if (pickerAllowed) void loadLinkable();
  }

  const roleLabel = (role: "cook" | "courier") => (role === "cook" ? t("wlRoleCook") : t("wlRoleCourier"));

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-500">{t("wlTitle")}</h3>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {links.length === 0 ? (
        <p className="text-xs text-zinc-400">{t("wlEmpty")}</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div key={link.link_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 p-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate text-sm text-zinc-900">{link.full_name}</span>
                <Badge variant="outline">{roleLabel(link.role)}</Badge>
                <Badge variant={link.is_active ? "emerald" : "neutral"}>
                  {link.is_active ? t("wlStateActive") : t("wlStateOff")}
                </Badge>
              </div>
              {canLink && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rowBusy === link.link_id}
                  onClick={() => handleUnlink(link)}
                >
                  {t("wlUnlink")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canLink && staffStatus !== "active" && (
        <p className="text-xs text-zinc-500">{t("wlStaffNotActiveNote")}</p>
      )}

      {pickerAllowed && linkable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="min-w-0 flex-1 pr-8"
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            aria-label={t("wlPickPlaceholder")}
          >
            <option value="">{t("wlPickPlaceholder")}</option>
            {linkable.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name} ({roleLabel(w.role)})
              </option>
            ))}
          </Select>
          <Button type="button" variant="outline" size="sm" disabled={!selectedWorkerId || linking} onClick={handleLink}>
            {t("wlLink")}
          </Button>
        </div>
      )}
    </div>
  );
}
