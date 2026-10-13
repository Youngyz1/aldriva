"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { MenuItemOptionGroup, MenuItemOption } from "@/lib/menu-pricing";
import { MAX_OPTION_GROUPS, MAX_OPTIONS_PER_GROUP } from "@/lib/menu-pricing";

interface OptionGroupsEditorProps {
  groups: MenuItemOptionGroup[];
  onChange: (groups: MenuItemOptionGroup[]) => void;
}

export function OptionGroupsEditor({ groups, onChange }: OptionGroupsEditorProps) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    groups.length > 0 ? groups[0].id : null
  );

  function addGroup() {
    if (groups.length >= MAX_OPTION_GROUPS) return;
    const newId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newGroup: MenuItemOptionGroup = {
      id: newId,
      name: "",
      required: false,
      min: 0,
      max: 1,
      options: [],
    };
    onChange([...groups, newGroup]);
    setExpandedGroupId(newId);
  }

  function removeGroup(index: number) {
    const updated = groups.filter((_, i) => i !== index);
    onChange(updated);
  }

  function updateGroup(index: number, patch: Partial<MenuItemOptionGroup>) {
    const updated = [...groups];
    const current = updated[index];
    const next: MenuItemOptionGroup = { ...current, ...patch };

    // Auto-adjust min and max invariants
    const optionsCount = next.options.length;
    if (next.required && next.min < 1 && optionsCount > 0) {
      next.min = 1;
    }
    if (next.min > optionsCount) {
      next.min = optionsCount;
    }
    if (next.max < next.min) {
      next.max = next.min;
    }
    if (next.max > optionsCount && optionsCount > 0) {
      next.max = optionsCount;
    }

    updated[index] = next;
    onChange(updated);
  }

  function addOption(groupIndex: number) {
    const group = groups[groupIndex];
    if (group.options.length >= MAX_OPTIONS_PER_GROUP) return;

    const optId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newOption: MenuItemOption = {
      id: optId,
      name: "",
      price_delta: 0,
    };
    const newOptions = [...group.options, newOption];
    updateGroup(groupIndex, {
      options: newOptions,
      max: Math.max(group.max, 1),
    });
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    const group = groups[groupIndex];
    const updatedOptions = group.options.filter((_, i) => i !== optionIndex);
    const newCount = updatedOptions.length;
    const newMin = Math.min(group.min, newCount);
    const newMax = Math.min(Math.max(group.max, newMin), Math.max(1, newCount));

    updateGroup(groupIndex, {
      options: updatedOptions,
      min: newMin,
      max: newMax,
    });
  }

  function updateOption(
    groupIndex: number,
    optionIndex: number,
    patch: Partial<MenuItemOption>
  ) {
    const group = groups[groupIndex];
    const updatedOptions = [...group.options];
    updatedOptions[optionIndex] = { ...updatedOptions[optionIndex], ...patch };
    updateGroup(groupIndex, { options: updatedOptions });
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold text-zinc-900">
            Option Groups ({groups.length}/{MAX_OPTION_GROUPS})
          </Label>
          <p className="text-xs text-zinc-500">
            Choices like sides, cooking temp, or toppings (e.g. burger build).
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addGroup}
          disabled={groups.length >= MAX_OPTION_GROUPS}
          className="gap-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Add Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400">
          No option groups configured yet. Click &ldquo;Add Group&rdquo; to add customized choices.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group, groupIndex) => {
            const isExpanded = expandedGroupId === group.id;
            return (
              <div
                key={group.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 sm:px-4">
                  <button
                    type="button"
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-zinc-800"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                    )}
                    <span className="truncate">
                      {group.name ? group.name : `Untitled Group #${groupIndex + 1}`}
                    </span>
                    <span className="shrink-0 rounded-full bg-zinc-200/70 px-1.5 py-0.5 text-[10px] text-zinc-600">
                      {group.required ? "Required" : "Optional"} • {group.options.length} opt
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeGroup(groupIndex)}
                    className="h-7 w-7 text-zinc-400 hover:text-red-600"
                    aria-label="Remove group"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Body */}
                {isExpanded && (
                  <div className="space-y-4 p-3 sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Group Name *</Label>
                        <Input
                          value={group.name}
                          onChange={(e) => updateGroup(groupIndex, { name: e.target.value })}
                          placeholder="e.g. Choose Your Bun"
                          maxLength={80}
                          required
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="flex items-end gap-3 pb-1">
                        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                          <Switch
                            checked={group.required}
                            onCheckedChange={(checked) =>
                              updateGroup(groupIndex, {
                                required: checked,
                                min: checked ? Math.max(1, group.min) : group.min,
                              })
                            }
                          />
                          Required choice
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Min Select</Label>
                        <Input
                          type="number"
                          min={group.required ? 1 : 0}
                          max={group.options.length}
                          value={group.min}
                          onChange={(e) =>
                            updateGroup(groupIndex, { min: Math.max(0, parseInt(e.target.value) || 0) })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Select</Label>
                        <Input
                          type="number"
                          min={Math.max(1, group.min)}
                          max={Math.max(1, group.options.length)}
                          value={group.max}
                          onChange={(e) =>
                            updateGroup(groupIndex, { max: Math.max(1, parseInt(e.target.value) || 1) })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Options list */}
                    <div className="space-y-2 border-t border-zinc-100 pt-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-zinc-700">
                          Choices ({group.options.length}/{MAX_OPTIONS_PER_GROUP})
                        </Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addOption(groupIndex)}
                          disabled={group.options.length >= MAX_OPTIONS_PER_GROUP}
                          className="h-7 gap-1 text-[11px]"
                        >
                          <Plus className="h-3 w-3" /> Add Choice
                        </Button>
                      </div>

                      {group.options.length === 0 ? (
                        <p className="rounded border border-dashed border-zinc-200 py-2 text-center text-[11px] text-zinc-400">
                          No choices yet. Click &ldquo;Add Choice&rdquo; to add options.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {group.options.map((opt, optIndex) => (
                            <div
                              key={opt.id}
                              className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50/70 p-2"
                            >
                              <div className="min-w-0 flex-1">
                                <Input
                                  value={opt.name}
                                  onChange={(e) =>
                                    updateOption(groupIndex, optIndex, { name: e.target.value })
                                  }
                                  placeholder="Choice name (e.g. Brioche Bun)"
                                  maxLength={80}
                                  required
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="w-24 shrink-0">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={-10000}
                                  max={10000}
                                  value={opt.price_delta}
                                  onChange={(e) =>
                                    updateOption(groupIndex, optIndex, {
                                      price_delta: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  placeholder="+/- Price"
                                  className="h-7 text-xs"
                                />
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeOption(groupIndex, optIndex)}
                                className="h-7 w-7 shrink-0 text-zinc-400 hover:text-red-600"
                                aria-label="Remove choice"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
