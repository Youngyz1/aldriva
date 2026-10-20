"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  assignMenuOptionGroup,
  createMenuOptionGroup,
  reorderMenuItemOptionGroups,
  unassignMenuOptionGroup,
  updateMenuItemOptionGroup,
} from "@/lib/actions/menu-option-groups";
import { validateMenuItemGroupLimits } from "@/lib/menu-option-dashboard";

type Group = { id: string; name: string; kind: "variant" | "addon"; is_active: boolean };
type Option = { id: string; group_id: string; name: string; price: number; is_available: boolean };
type Assignment = { id: string; item_id: string; group_id: string; position: number; hidden_option_ids: string[]; price_overrides: Record<string, number>; updated_at: string };

export function MenuItemOptionsPanel({
  itemId,
  organizerId,
  groups,
  options,
  assignments,
  canEdit,
  onChanged,
}: {
  itemId: string;
  organizerId: string;
  groups: Group[];
  options: Option[];
  assignments: Assignment[];
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const t = useTranslations("MenuOptions");
  const [search, setSearch] = useState("");
  const [inlineName, setInlineName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, Record<string, string>>>({});
  const [draggedAssignmentId, setDraggedAssignmentId] = useState<string | null>(null);
  const assigned = useMemo(() => assignments.filter((row) => row.item_id === itemId).sort((a, b) => a.position - b.position), [assignments, itemId]);
  const assignedIds = new Set(assigned.map((row) => row.group_id));
  const assignedGroups = assigned.map((row) => ({ assignment: row, group: groups.find((group) => group.id === row.group_id) })).filter((row): row is { assignment: Assignment; group: Group } => Boolean(row.group));
  const assignedKinds = assignedGroups.map(({ group }) => group.kind);
  const availableGroups = groups.filter((group) => group.is_active && !assignedIds.has(group.id) && group.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  async function addGroup(group: Group) {
    const limitError = validateMenuItemGroupLimits(assignedKinds, group.kind);
    if (limitError) { setError(limitError); return; }
    setBusy(true); setError("");
    const result = await assignMenuOptionGroup(itemId, group.id, organizerId);
    setBusy(false);
    if (result.success === false) { setError(result.error || "Failed to assign group"); return; }
    onChanged?.();
  }

  async function createAndAssign() {
    if (!inlineName.trim()) return;
    const limitError = validateMenuItemGroupLimits(assignedKinds, "addon");
    if (limitError) { setError(limitError); return; }
    setBusy(true); setError("");
    const created = await createMenuOptionGroup(organizerId, { name: inlineName.trim(), kind: "addon", min_select: 0, max_select: 1, is_required: false });
    if (created.success === false) { setBusy(false); setError(created.error || "Failed to create group"); return; }
    if (!created.data) { setBusy(false); setError("Failed to create group"); return; }
    const attached = await assignMenuOptionGroup(itemId, created.data.id, organizerId);
    setBusy(false);
    if (!attached.success) { setError(attached.error || "Group created but could not be assigned"); return; }
    setInlineName("");
    onChanged?.();
  }

  async function saveAssignment(assignment: Assignment, hidden: string[], overrides: Record<string, number>) {
    setBusy(true); setError("");
    const result = await updateMenuItemOptionGroup(assignment.id, organizerId, {
      hidden_option_ids: hidden,
      price_overrides: overrides,
      position: assignment.position,
      updated_at: assignment.updated_at,
    });
    setBusy(false);
    if (!result.success) { setError(result.error || t("changedReload")); return; }
    onChanged?.();
  }

  async function removeAssignment(assignment: Assignment) {
    setBusy(true); setError("");
    const result = await unassignMenuOptionGroup(assignment.id, organizerId);
    setBusy(false);
    if (!result.success) { setError(result.error || "Failed to remove group"); return; }
    onChanged?.();
  }

  async function moveAssignment(index: number, direction: -1 | 1) {
    const ordered = [...assigned];
    [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]];
    setBusy(true); setError("");
    const result = await reorderMenuItemOptionGroups(itemId, organizerId, ordered.map((row) => ({ id: row.id, updated_at: row.updated_at })));
    setBusy(false);
    if (!result.success) { setError(result.error || t("changedReload")); return; }
    onChanged?.();
  }

  async function dropAssignment(targetId: string) {
    if (!draggedAssignmentId || draggedAssignmentId === targetId) return;
    const ordered = [...assigned];
    const from = ordered.findIndex((row) => row.id === draggedAssignmentId);
    const to = ordered.findIndex((row) => row.id === targetId);
    const [moving] = ordered.splice(from, 1);
    ordered.splice(to, 0, moving);
    setDraggedAssignmentId(null); setBusy(true); setError("");
    const result = await reorderMenuItemOptionGroups(itemId, organizerId, ordered.map((row) => ({ id: row.id, updated_at: row.updated_at })));
    setBusy(false);
    if (result.success === false) { setError(result.error || t("changedReload")); return; }
    onChanged?.();
  }

  return (
    <section className="space-y-4 rounded-xl border p-4" aria-labelledby={`options-heading-${itemId}`}>
      <div>
        <h3 id={`options-heading-${itemId}`} className="font-medium">{t("optionsAndExtras")}</h3>
        <p className="text-sm text-muted-foreground">{t("assignmentLimits")}</p>
      </div>
      {assignedGroups.length ? assignedGroups.map(({ assignment, group }, index) => {
        const groupOptions = options.filter((option) => option.group_id === group.id).sort((a, b) => a.name.localeCompare(b.name));
        const hidden = new Set(assignment.hidden_option_ids || []);
        const overrides = assignment.price_overrides || {};
        return (
          <fieldset key={assignment.id} draggable={canEdit} onDragStart={() => setDraggedAssignmentId(assignment.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropAssignment(assignment.id)} className="space-y-3 rounded-lg border p-3" disabled={!canEdit || busy}>
            <legend className="px-1 font-medium">{group.name} <span className="text-xs text-muted-foreground">{group.kind === "variant" ? t("variant") : t("addon")}</span></legend>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={index === 0} onClick={() => moveAssignment(index, -1)} aria-label={t("moveUp")}>{t("moveUp")}</Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={index === assignedGroups.length - 1} onClick={() => moveAssignment(index, 1)} aria-label={t("moveDown")}>{t("moveDown")}</Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => removeAssignment(assignment)}>{t("unassign")}</Button>
            </div>
            <div className="space-y-2">
              {groupOptions.map((option) => (
                <div key={option.id} className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hidden.has(option.id)}
                      onChange={(event) => {
                        const next = new Set(hidden);
                        if (event.target.checked) next.add(option.id);
                        else next.delete(option.id);
                        void saveAssignment(assignment, [...next], overrides);
                      }}
                    />
                    <span>{t("hideOption")}: {option.name} {!option.is_available && <span className="text-muted-foreground">({t("soldOutToday")})</span>}</span>
                  </label>
                  <span className="text-xs text-muted-foreground">{t("basePrice", { price: Number(option.price).toFixed(2) })}</span>
                  <label className="flex min-h-11 items-center gap-2 text-xs">
                    {t("overridePrice")}
                    <input
                      type="number" min="0" max="999999.99" step="0.01" className="h-10 w-28 rounded-md border bg-background px-2 text-sm"
                      aria-label={`${t("overridePrice")}: ${option.name}`}
                      value={overrideDrafts[assignment.id]?.[option.id] ?? (Object.hasOwn(overrides, option.id) ? String(overrides[option.id]) : "")}
                      onChange={(event) => {
                        setOverrideDrafts((current) => ({ ...current, [assignment.id]: { ...current[assignment.id], [option.id]: event.target.value } }));
                      }}
                      onBlur={(event) => {
                        const next = { ...overrides };
                        if (event.target.value === "") delete next[option.id];
                        else next[option.id] = Number(event.target.value);
                        void saveAssignment(assignment, [...hidden], next);
                      }}
                    />
                  </label>
                </div>
              ))}
              {groupOptions.length === 0 && <p className="text-sm text-muted-foreground">{t("noGroups")}</p>}
            </div>
          </fieldset>
        );
      }) : <p className="text-sm text-muted-foreground">{t("noGroups")}</p>}

      {canEdit && (
        <div className="space-y-3 border-t pt-3">
          <label className="block space-y-1 text-sm">
            <span>{t("addExisting")}</span>
            <input className="h-11 w-full rounded-md border bg-background px-3" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchGroups")} />
          </label>
          <div className="flex flex-wrap gap-2">
            {availableGroups.map((group) => <Button className="min-h-11" key={group.id} type="button" variant="outline" disabled={busy || Boolean(validateMenuItemGroupLimits(assignedKinds, group.kind))} onClick={() => void addGroup(group)}>{group.name} · {group.kind === "variant" ? t("variant") : t("addon")}</Button>)}
            {availableGroups.length === 0 && <span className="text-sm text-muted-foreground">{t("noGroups")}</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="space-y-1 text-sm"><span>{t("createNewGroup")}</span><input className="h-11 w-full rounded-md border bg-background px-3" value={inlineName} onChange={(event) => setInlineName(event.target.value)} maxLength={80} /></label>
            <Button type="button" className="min-h-11 self-end" variant="outline" disabled={busy || !inlineName.trim() || Boolean(validateMenuItemGroupLimits(assignedKinds, "addon"))} onClick={() => void createAndAssign()}>{t("createNewGroup")}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
