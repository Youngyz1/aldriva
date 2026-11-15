"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StaffMemberRow, StaffStatus } from "@/lib/actions/staff-members";

const STATUS_LABEL: Record<StaffStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

const STATUS_BADGE_VARIANT: Record<StaffStatus, "emerald" | "amber" | "neutral"> = {
  active: "emerald",
  suspended: "amber",
  deactivated: "neutral",
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  seasonal: "Seasonal",
  volunteer: "Volunteer",
};

type Branch = { id: string; label: string };

export default function StaffClient({
  businessId,
  branches,
  initialStaff,
  initialError,
}: {
  businessId: string;
  branches: Branch[];
  initialStaff: StaffMemberRow[];
  initialError: string | null;
}) {
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialStaff.filter((s) => {
      if (branchFilter === "unassigned" && s.branch_id) return false;
      if (branchFilter !== "all" && branchFilter !== "unassigned" && s.branch_id !== branchFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q) ||
        s.role_names.some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [initialStaff, search, branchFilter, statusFilter]);

  if (initialError) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-black">Staff</h1>
        </header>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{initialError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-business-id={businessId}>
      <header>
        <h1 className="text-xl font-black">Staff</h1>
        <p className="text-sm text-zinc-500">Team members for this business, their roles, branch and status.</p>
      </header>

      {initialStaff.length === 0 ? (
        <p className="text-sm text-zinc-500">No staff yet.</p>
      ) : (
        <>
          <section className="space-y-3">
            <Input placeholder="Search by name, phone, email or role" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Filter by branch">
                <option value="all">All branches</option>
                <option value="unassigned">No branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="deactivated">Deactivated</option>
              </Select>
            </div>
          </section>

          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">No staff match your filters.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => {
                const branchLabel = s.branch_label ?? "No branch";
                return (
                  <Card key={s.id}>
                    <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-zinc-900">{s.full_name}</p>
                          <Badge variant={STATUS_BADGE_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {s.role_names.length > 0 ? (
                            s.role_names.map((r) => (
                              <Badge key={r} variant="outline">{r}</Badge>
                            ))
                          ) : (
                            <span className="text-xs text-zinc-400">No role assigned</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500">
                          {branchLabel} · {EMPLOYMENT_LABEL[s.employment_type] ?? s.employment_type}
                          {s.phone ? ` · ${s.phone}` : ""}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
