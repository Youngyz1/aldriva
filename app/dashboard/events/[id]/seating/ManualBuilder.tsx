"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Users,
  Star,
  Accessibility,
  Eye,
  Check,
  AlertCircle,
  Loader2,
  Sliders,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Layers,
} from "lucide-react";
import {
  SeatGeometry,
  VenueObject,
  SectionDefinition,
  TicketTypeSummary,
  SeatingPlanConfig,
  SeatingSectionConfig,
  CanonicalSeatingPlanResult,
  CanonicalGeneratedSeat,
  validateSeatingPlanConfig,
  generateCanonicalSeatingPlan,
  checkLayoutProtection,
  combineSeatingForSave,
  parseCountInput,
} from "@/lib/seating";

export interface ManualSectionFormItem {
  id: string; // Unique client React key
  name: string;
  mode: "rows" | "tables";
  ticketTypeId: string;
  defaultPrice: number | "";
  isVip: boolean;
  isAccessible: boolean;
  // Rows parameters
  rowCount: number | "";
  seatsPerRow: number | "";
  rowLabelPrefix: string;
  startSeatNumber: number | "";
  // Tables parameters
  tableCount: number | "";
  seatsPerTable: number | "";
  tableShape: "round" | "rect";
  tableNamePrefix: string;
  startTableNumber: number | "";
}

interface ManualBuilderProps {
  eventId: string;
  layoutId: string;
  canvasWidth?: number;
  canvasHeight?: number;
  initialSeats: SeatGeometry[];
  venueObjects: VenueObject[];
  sections?: SectionDefinition[];
  ticketTypes: TicketTypeSummary[];
  /**
   * AI-generated sections to pre-populate the form.
   * When provided, the parent must also change the `key` prop to force a remount
   * so this initializer is guaranteed to re-run (not stale from a previous render).
   */
  aiSections?: ManualSectionFormItem[];
  /**
   * Human-readable source of aiSections (e.g. "AI Seating Assistant").
   * When present alongside aiSections, a review reminder is shown until save.
   * Phase 6E unified-workspace handoff cue; purely presentational.
   */
  appliedSource?: string | null;
  /**
   * Phase 6E: notifies the unified workspace when this builder holds
   * unsaved changes, so tab switches can be guarded. Optional; when
   * omitted the builder behaves exactly as before.
   */
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: (savedSeats: SeatGeometry[], savedVenueObjects?: VenueObject[]) => Promise<void> | void;
  onToast: (type: "success" | "error", message: string) => void;
  onSwitchToVisual?: () => void;
  onSwitchToRoster?: () => void;
}

function createDefaultRowSection(index: number = 1): ManualSectionFormItem {
  return {
    id: `sec-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: index === 1 ? "Main Floor" : `Section ${index}`,
    mode: "rows",
    ticketTypeId: "",
    defaultPrice: "",
    isVip: false,
    isAccessible: false,
    rowCount: 5,
    seatsPerRow: 10,
    rowLabelPrefix: "",
    startSeatNumber: 1,
    tableCount: 4,
    seatsPerTable: 8,
    tableShape: "round",
    tableNamePrefix: "Table",
    startTableNumber: 1,
  };
}

function createDefaultTableSection(index: number = 1): ManualSectionFormItem {
  return {
    id: `sec-table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: index === 1 ? "Banquet Hall" : `Tables Section ${index}`,
    mode: "tables",
    ticketTypeId: "",
    defaultPrice: "",
    isVip: false,
    isAccessible: false,
    rowCount: 4,
    seatsPerRow: 10,
    rowLabelPrefix: "",
    startSeatNumber: 1,
    tableCount: 6,
    seatsPerTable: 8,
    tableShape: "round",
    tableNamePrefix: "Table",
    startTableNumber: 1,
  };
}

export default function ManualBuilder({
  eventId,
  layoutId,
  canvasWidth = 1200,
  canvasHeight = 800,
  initialSeats,
  venueObjects,
  sections: initialSections = [],
  ticketTypes,
  aiSections,
  appliedSource = null,
  onDirtyChange,
  onSaved,
  onToast,
  onSwitchToVisual,
  onSwitchToRoster,
}: ManualBuilderProps) {
  // Save mode: default to append if existing seats exist
  const [saveMode, setSaveMode] = useState<"append" | "replace">(
    initialSeats.length > 0 ? "append" : "replace"
  );

  // Sections configuration form state.
  // When aiSections is provided (parent uses key= remount to guarantee freshness),
  // initialise directly from the AI proposal. Otherwise fall back to a single default section.
  const [sections, setSections] = useState<ManualSectionFormItem[]>(
    aiSections && aiSections.length > 0
      ? aiSections
      : [initialSeats.length === 0 ? createDefaultRowSection(1) : createDefaultTableSection(1)]
  );

  // --- Phase 6E: unsaved-change tracking -------------------------------------
  // Snapshot of the last-saved (or initial) configuration. Any deviation in
  // sections or save mode marks the builder dirty. An applied-but-unsaved AI
  // proposal also counts as dirty so the workspace guards against losing it.
  const snapshotKey = (secs: ManualSectionFormItem[], mode: "append" | "replace") =>
    JSON.stringify({ mode, secs });
  const snapshotRef = useRef<string | null>(null);
  const appliedUnsavedRef = useRef((aiSections?.length ?? 0) > 0);
  const [isDirty, setIsDirty] = useState<boolean>((aiSections?.length ?? 0) > 0);
  useEffect(() => {
    if (snapshotRef.current === null) {
      snapshotRef.current = snapshotKey(sections, saveMode);
    }
    const dirty =
      appliedUnsavedRef.current ||
      snapshotKey(sections, saveMode) !== snapshotRef.current;
    setIsDirty((prev) => (prev === dirty ? prev : dirty));
  }, [sections, saveMode]);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Collapsed sections tracker
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Preview tab
  const [previewTab, setPreviewTab] = useState<"metrics" | "grid" | "list">("metrics");

  // Status & processing
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  // Layout protection analysis
  const protection = useMemo(() => {
    return checkLayoutProtection(initialSeats, saveMode);
  }, [initialSeats, saveMode]);

  // Convert form state into Canonical SeatingPlanConfig
  const planConfig: SeatingPlanConfig = useMemo(() => {
    const secConfigs: SeatingSectionConfig[] = sections.map((sec) => {
      const isRowMode = sec.mode === "rows";
      return {
        name: sec.name.trim(),
        mode: sec.mode,
        ticketTypeId: sec.ticketTypeId || undefined,
        defaultPrice: sec.defaultPrice !== "" ? Number(sec.defaultPrice) : undefined,
        isVip: sec.isVip,
        isAccessible: sec.isAccessible,
        ...(isRowMode
          ? {
              rowCount: sec.rowCount !== "" ? Number(sec.rowCount) : 0,
              seatsPerRow: sec.seatsPerRow !== "" ? Number(sec.seatsPerRow) : 0,
              rowLabelPrefix: sec.rowLabelPrefix.trim() || undefined,
              startSeatNumber:
                sec.startSeatNumber !== "" ? Number(sec.startSeatNumber) : undefined,
            }
          : {
              tableCount: sec.tableCount !== "" ? Number(sec.tableCount) : 0,
              seatsPerTable: sec.seatsPerTable !== "" ? Number(sec.seatsPerTable) : 0,
              tableShape: sec.tableShape,
              tableNamePrefix: sec.tableNamePrefix.trim() || undefined,
              startTableNumber:
                sec.startTableNumber !== "" ? Number(sec.startTableNumber) : undefined,
            }),
      };
    });

    return {
      eventId,
      layoutId,
      sections: secConfigs,
      existingSeats: saveMode === "append" ? initialSeats : [],
      existingVenueObjects: saveMode === "append" ? venueObjects : [],
    };
  }, [eventId, layoutId, sections, saveMode, initialSeats, venueObjects]);

  // Compute Canonical Seating Plan preview dynamically
  const canonicalResult: CanonicalSeatingPlanResult | null = useMemo(() => {
    const validation = validateSeatingPlanConfig(planConfig);
    if (!validation.valid) {
      return null;
    }
    try {
      return generateCanonicalSeatingPlan(planConfig);
    } catch {
      return null;
    }
  }, [planConfig]);

  // Generate / Validate action
  const handleValidateAndPreview = useCallback(() => {
    const validation = validateSeatingPlanConfig(planConfig);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      setIsGenerated(false);
      onToast("error", "Please fix configuration errors to preview.");
      return;
    }

    try {
      generateCanonicalSeatingPlan(planConfig);
      setValidationErrors([]);
      setIsGenerated(true);
      onToast("success", "Seating layout generated successfully for preview.");
    } catch (err: any) {
      setValidationErrors([err.message || "Failed to generate seating layout."]);
      setIsGenerated(false);
      onToast("error", err.message || "Failed to generate preview.");
    }
  }, [planConfig, onToast]);

  // Section Form Handlers
  const handleAddSection = (mode: "rows" | "tables") => {
    const nextIndex = sections.length + 1;
    const newSec =
      mode === "rows"
        ? createDefaultRowSection(nextIndex)
        : createDefaultTableSection(nextIndex);
    setSections((prev) => [...prev, newSec]);
    setIsGenerated(false);
  };

  const handleRemoveSection = (id: string) => {
    if (sections.length <= 1) {
      onToast("error", "At least one section is required.");
      return;
    }
    setSections((prev) => prev.filter((s) => s.id !== id));
    setIsGenerated(false);
  };

  const handleUpdateSection = (
    id: string,
    updates: Partial<ManualSectionFormItem>
  ) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
    setIsGenerated(false);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Save handler: persist using the Phase 6A pipeline
  const handleSaveSeatingPlan = async () => {
    const validation = validateSeatingPlanConfig(planConfig);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      onToast("error", "Please correct configuration errors before saving.");
      return;
    }

    if (!protection.canReplace) {
      onToast("error", protection.warningMessage || "Cannot replace layout.");
      return;
    }

    setIsSaving(true);
    try {
      const result = generateCanonicalSeatingPlan(planConfig);

      const combined = combineSeatingForSave({
        saveMode,
        existingSeats: initialSeats,
        existingVenueObjects: venueObjects,
        existingSections: initialSections,
        generatedSeats: result.seats,
        generatedVenueObjects: result.venueObjects,
        generatedSections: result.sections,
      });

      // Compute dynamic canvas dimensions to ensure all seats are visible
      const maxX = Math.max(
        canvasWidth,
        ...combined.seats.map((s) => s.x + s.width + 80),
        ...combined.venueObjects.map((o) => o.x + o.width + 80)
      );
      const maxY = Math.max(
        canvasHeight,
        ...combined.seats.map((s) => s.y + s.height + 80),
        ...combined.venueObjects.map((o) => o.y + o.height + 80)
      );

      const res = await fetch(`/api/events/${eventId}/seating`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save_layout",
          layoutId,
          canvas_width: Math.round(maxX),
          canvas_height: Math.round(maxY),
          sections: combined.sections,
          venue_objects: combined.venueObjects,
          seats: combined.seats,
          deleteIds: combined.deleteIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save seating layout.");
      }

      const savedSeats = Array.isArray(data.savedSeats)
        ? (data.savedSeats as SeatGeometry[])
        : (combined.seats as SeatGeometry[]);

      onToast("success", "Seating layout saved successfully via Canonical Engine.");
      await onSaved(savedSeats, combined.venueObjects);
      // Phase 6E: saved state becomes the new clean baseline.
      appliedUnsavedRef.current = false;
      snapshotRef.current = snapshotKey(sections, saveMode);
      setIsGenerated(false);
      setValidationErrors([]);
    } catch (err: any) {
      onToast("error", err.message || "Failed to save layout.");
    } finally {
      setIsSaving(false);
    }
  };

  // Summary counts
  const displaySummary = useMemo(() => {
    if (canonicalResult) {
      const generatedCount = canonicalResult.summary.totalSeats;
      const baseSeats = saveMode === "append" ? initialSeats.length : 0;
      return {
        total: baseSeats + generatedCount,
        newSeats: generatedCount,
        vip: canonicalResult.summary.vipSeats + (saveMode === "append" ? initialSeats.filter(s => s.is_vip).length : 0),
        accessible: canonicalResult.summary.accessibleSeats + (saveMode === "append" ? initialSeats.filter(s => s.is_accessible).length : 0),
        regular: (baseSeats + generatedCount) - (canonicalResult.summary.vipSeats + (saveMode === "append" ? initialSeats.filter(s => s.is_vip).length : 0)),
        tables: canonicalResult.summary.tableCount + (saveMode === "append" ? venueObjects.filter(o => o.type === "table").length : 0),
        sections: canonicalResult.summary.sectionCount,
      };
    }
    return {
      total: initialSeats.length,
      newSeats: 0,
      vip: initialSeats.filter((s) => s.is_vip).length,
      accessible: initialSeats.filter((s) => s.is_accessible).length,
      regular: initialSeats.filter((s) => !s.is_vip).length,
      tables: venueObjects.filter((o) => o.type === "table").length,
      sections: sections.length,
    };
  }, [canonicalResult, saveMode, initialSeats, venueObjects, sections.length]);

  return (
    <div className="space-y-6">
      {/* Phase 6E: explicit AI → Manual handoff cue. Shows while the applied
          proposal (or edits) remain unsaved. Nothing is persisted until Save. */}
      {appliedSource && isDirty && (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <Sparkles size={13} className="shrink-0 text-violet-500" />
          <span>
            <span className="font-black text-zinc-700">{appliedSource} plan applied.</span>{" "}
            Review the sections below, check the preview, then save — nothing is
            persisted until you save.
          </span>
        </p>
      )}
      {/* Top Banner & Strategy Selector */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-violet-600" />
            <h2 className="text-base font-black text-zinc-900">
              Manual Seating Builder
            </h2>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              Canonical Engine
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Define structured seating sections, auditorium rows, and banquet tables with instant preview.
          </p>
        </div>

        {/* Append vs. Replace Mode Pill Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
            <button
              type="button"
              onClick={() => setSaveMode("append")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                saveMode === "append"
                  ? "bg-white text-violet-700 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Append ({initialSeats.length} existing)
            </button>
            <button
              type="button"
              onClick={() => setSaveMode("replace")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                saveMode === "replace"
                  ? "bg-white text-violet-700 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Replace Layout
            </button>
          </div>

          <button
            type="button"
            onClick={handleValidateAndPreview}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-black text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
          >
            <Eye size={14} className="text-zinc-500" />
            Preview
          </button>

          <button
            type="button"
            onClick={handleSaveSeatingPlan}
            disabled={isSaving || !protection.canReplace}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black text-white shadow-xs transition-all ${
              !protection.canReplace
                ? "cursor-not-allowed bg-zinc-300"
                : "bg-violet-600 hover:bg-violet-700 active:scale-[0.98]"
            }`}
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Save Seating Plan
          </button>
        </div>
      </div>

      {/* Protected Seats Warning (Sold / Assigned) */}
      {!protection.canReplace && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900">
          <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Replace Mode Disabled</p>
            <p>
              {protection.warningMessage} Please switch to{" "}
              <strong>Append</strong> mode to preserve attendee ticket assignments, or unassign guests first.
            </p>
          </div>
        </div>
      )}

      {/* Validation Errors Alert Banner */}
      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900">
          <div className="flex items-center gap-2 font-bold mb-2">
            <AlertCircle size={16} className="text-red-600" />
            <span>Configuration Errors ({validationErrors.length})</span>
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Live Metrics Summary Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-zinc-500">Total Seats</p>
          <p className="mt-1 text-2xl font-black text-zinc-900">
            {displaySummary.total}
          </p>
          {saveMode === "append" && displaySummary.newSeats > 0 && (
            <p className="text-[10px] font-semibold text-emerald-600">
              +{displaySummary.newSeats} new
            </p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-zinc-500">Regular Seats</p>
          <p className="mt-1 text-2xl font-black text-zinc-700">
            {displaySummary.regular}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-zinc-500">VIP Seats</p>
          <p className="mt-1 text-2xl font-black text-amber-600">
            {displaySummary.vip}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-zinc-500">Accessible</p>
          <p className="mt-1 text-2xl font-black text-sky-600">
            {displaySummary.accessible}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-zinc-500">Banquet Tables</p>
          <p className="mt-1 text-2xl font-black text-violet-600">
            {displaySummary.tables}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-zinc-500">Sections</p>
          <p className="mt-1 text-2xl font-black text-zinc-900">
            {displaySummary.sections}
          </p>
        </div>
      </div>

      {/* Main Builder Grid: Left Config Sections + Right Live Preview */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column: Form Sections List (7 cols) */}
        <div className="space-y-4 xl:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-zinc-900">
              Seating Sections ({sections.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddSection("rows")}
                className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
              >
                <Plus size={13} />
                + Row Section
              </button>
              <button
                type="button"
                onClick={() => handleAddSection("tables")}
                className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
              >
                <Plus size={13} />
                + Table Section
              </button>
            </div>
          </div>

          {sections.map((section, idx) => {
            const isCollapsed = collapsedSections.has(section.id);
            const isRowMode = section.mode === "rows";

            return (
              <div
                key={section.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs"
              >
                {/* Section Header Bar */}
                <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-black text-zinc-700">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={section.name}
                      onChange={(e) =>
                        handleUpdateSection(section.id, { name: e.target.value })
                      }
                      placeholder="Section Name (e.g. Orchestra, VIP Tables)"
                      className="border-b border-transparent bg-transparent text-sm font-black text-zinc-900 focus:border-violet-500 focus:outline-none"
                    />
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        isRowMode
                          ? "bg-blue-50 text-blue-700"
                          : "bg-purple-50 text-purple-700"
                      }`}
                    >
                      {isRowMode ? "Auditorium Rows" : "Banquet Tables"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(section.id)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                      title={isCollapsed ? "Expand Section" : "Collapse Section"}
                    >
                      {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(section.id)}
                      disabled={sections.length <= 1}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      title="Remove Section"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Section Body */}
                {!isCollapsed && (
                  <div className="space-y-4 p-4 text-xs">
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-500">Layout Type:</span>
                      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateSection(section.id, { mode: "rows" })
                          }
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                            isRowMode
                              ? "bg-white text-zinc-900 shadow-xs"
                              : "text-zinc-500 hover:text-zinc-800"
                          }`}
                        >
                          Rows & Seats
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateSection(section.id, { mode: "tables" })
                          }
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                            !isRowMode
                              ? "bg-white text-zinc-900 shadow-xs"
                              : "text-zinc-500 hover:text-zinc-800"
                          }`}
                        >
                          Banquet Tables
                        </button>
                      </div>
                    </div>

                    {/* Mode Specific Inputs */}
                    {isRowMode ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Number of Rows
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={section.rowCount}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                rowCount: parseCountInput(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Seats per Row
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={section.seatsPerRow}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                seatsPerRow: parseCountInput(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Row Prefix (optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. R, A"
                            value={section.rowLabelPrefix}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                rowLabelPrefix: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Start Seat #
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={section.startSeatNumber}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                startSeatNumber: parseCountInput(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Number of Tables
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={section.tableCount}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                tableCount: parseCountInput(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Seats per Table
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={section.seatsPerTable}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                seatsPerTable: parseCountInput(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Table Shape
                          </label>
                          <select
                            value={section.tableShape}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                tableShape: e.target.value as "round" | "rect",
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          >
                            <option value="round">Round Table</option>
                            <option value="rect">Rectangular</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Table Name Prefix
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Table, VIP"
                            value={section.tableNamePrefix}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                tableNamePrefix: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Common Options: Ticket Tier, Price, VIP, Accessibility */}
                    <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Ticket Tier
                        </label>
                        <select
                          value={section.ticketTypeId}
                          onChange={(e) =>
                            handleUpdateSection(section.id, {
                              ticketTypeId: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                        >
                          <option value="">Default / Unassigned</option>
                          {ticketTypes.map((tt) => (
                            <option key={tt.id} value={tt.id}>
                              {tt.name} (${tt.price})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Price Override ($)
                        </label>
                        <input
                          type="number"
                          placeholder="Optional"
                          min="0"
                          step="0.01"
                          value={section.defaultPrice}
                          onChange={(e) =>
                            handleUpdateSection(section.id, {
                              defaultPrice: parseCountInput(e.target.value),
                            })
                          }
                          className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-violet-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-4 pt-4">
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-zinc-700">
                          <input
                            type="checkbox"
                            checked={section.isVip}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                isVip: e.target.checked,
                              })
                            }
                            className="rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                          />
                          <Star size={13} className="text-amber-500" />
                          VIP
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-zinc-700">
                          <input
                            type="checkbox"
                            checked={section.isAccessible}
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                isAccessible: e.target.checked,
                              })
                            }
                            className="rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                          />
                          <Accessibility size={13} className="text-sky-500" />
                          Accessible
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Interactive Live Preview (5 cols) */}
        <div className="space-y-4 xl:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-zinc-900">
              Generated Layout Preview
            </h3>
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                type="button"
                onClick={() => setPreviewTab("metrics")}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  previewTab === "metrics"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("grid")}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  previewTab === "grid"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Mini Map
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("list")}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  previewTab === "list"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Seat List
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
            {canonicalResult ? (
              <div>
                {previewTab === "metrics" && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 text-xs">
                      <p className="font-bold text-zinc-800 mb-2">
                        Plan Architecture Breakdown
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-zinc-600">
                        <div>
                          Generated Seats:{" "}
                          <strong className="text-zinc-900">
                            {canonicalResult.seats.length}
                          </strong>
                        </div>
                        <div>
                          Venue Objects:{" "}
                          <strong className="text-zinc-900">
                            {canonicalResult.venueObjects.length}
                          </strong>
                        </div>
                        <div>
                          VIP Seats:{" "}
                          <strong className="text-amber-600">
                            {canonicalResult.summary.vipSeats}
                          </strong>
                        </div>
                        <div>
                          Accessible Seats:{" "}
                          <strong className="text-sky-600">
                            {canonicalResult.summary.accessibleSeats}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Section Breakdown cards */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-zinc-500">
                        Configured Sections ({canonicalResult.sections.length})
                      </p>
                      {canonicalResult.sections.map((sec, i) => {
                        const secSeats = canonicalResult.seats.filter(
                          (s) => s.section === sec.name
                        );
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs"
                          >
                            <span className="font-bold text-zinc-900">
                              {sec.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-500">
                                {secSeats.length} seats
                              </span>
                              {sec.rows && (
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                                  {sec.rows} rows × {sec.seatsPerRow}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {previewTab === "grid" && (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-500">
                      Topological rendering of canonical seat coordinates.
                    </p>
                    <div className="relative h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-900/5 p-4 flex items-center justify-center">
                      <svg
                        viewBox="0 0 1000 600"
                        className="h-full w-full max-h-56"
                      >
                        {/* Render generated venue objects / tables */}
                        {canonicalResult.venueObjects.map((obj) => (
                          <rect
                            key={obj.id}
                            x={obj.x * 0.7}
                            y={obj.y * 0.7}
                            width={obj.width * 0.7}
                            height={obj.height * 0.7}
                            rx={obj.table_shape === "round" ? obj.width * 0.35 : 4}
                            fill="#8b5cf6"
                            fillOpacity="0.2"
                            stroke="#7c3aed"
                            strokeWidth="1.5"
                          />
                        ))}
                        {/* Render generated seats */}
                        {canonicalResult.seats.map((seat, i) => (
                          <circle
                            key={i}
                            cx={(seat.x + seat.width / 2) * 0.7}
                            cy={(seat.y + seat.height / 2) * 0.7}
                            r={seat.is_vip ? 5 : 4}
                            fill={
                              seat.is_vip
                                ? "#f59e0b"
                                : seat.is_accessible
                                ? "#0284c7"
                                : "#4b5563"
                            }
                          />
                        ))}
                      </svg>
                    </div>
                  </div>
                )}

                {previewTab === "list" && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">
                      First 30 generated seats:
                    </p>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100 text-xs">
                      {canonicalResult.seats.slice(0, 30).map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-1.5"
                        >
                          <span className="font-semibold text-zinc-800">
                            {s.section} · Row {s.row_label} · Seat {s.seat_number}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {s.table_number && (
                              <span className="rounded bg-purple-50 text-purple-700 px-1 py-0.5 font-bold">
                                T{s.table_number}
                              </span>
                            )}
                            {s.is_vip && (
                              <span className="rounded bg-amber-50 text-amber-700 px-1 py-0.5 font-bold">
                                VIP
                              </span>
                            )}
                            {s.is_accessible && (
                              <span className="rounded bg-sky-50 text-sky-700 px-1 py-0.5 font-bold">
                                Accessible
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {canonicalResult.seats.length > 30 && (
                        <div className="p-2 text-center text-xs text-zinc-400">
                          + {canonicalResult.seats.length - 30} more seats
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-400">
                <LayoutGrid size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">
                  Configure sections to view live layout preview.
                </p>
              </div>
            )}
          </div>

          {/* Quick Switch to Other Views */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
            <span className="text-zinc-600 font-medium">
              Want to adjust positions visually on SVG?
            </span>
            {onSwitchToVisual && (
              <button
                type="button"
                onClick={onSwitchToVisual}
                className="flex items-center gap-1 font-bold text-violet-700 hover:text-violet-900"
              >
                Open SVG Canvas
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
