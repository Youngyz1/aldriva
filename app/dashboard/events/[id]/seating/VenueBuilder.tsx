"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  LayoutDashboard,
  Plus,
  Move,
  RotateCw,
  Copy,
  Trash2,
  Save,
  Check,
  AlertCircle,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Star,
  StarOff,
  Accessibility,
  Eye,
  EyeOff,
  Grid,
  Table as TableIcon,
  Layers,
  Type,
  Maximize2,
  Users,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";
import {
  SeatGeometry,
  VenueObject,
  SectionDefinition,
  TicketTypeSummary,
  generateSectionSeatsGrid,
  generateTableSeats,
} from "@/lib/seating";

interface Props {
  eventId: string;
  layout: {
    id: string;
    name: string;
    canvas_width?: number;
    canvas_height?: number;
    version?: number;
    is_published?: boolean;
    published_at?: string | null;
    sections?: unknown[];
    venue_objects?: unknown[];
  };
  initialSeats: SeatGeometry[];
  ticketTypes: TicketTypeSummary[];
  invitations: {
    id: string;
    guest_name: string;
    guest_title: string | null;
    organization: string | null;
    invitation_status: string;
    rsvp_status: string;
    current_seat_id: string | null;
  }[];
  onRefresh: () => Promise<void>;
  onToast: (type: "success" | "error", message: string) => void;
}

export default function VenueBuilder({
  eventId,
  layout,
  initialSeats,
  ticketTypes,
  invitations,
  onRefresh,
  onToast,
}: Props) {
  const [seats, setSeats] = useState<SeatGeometry[]>(initialSeats);
  const [venueObjects, setVenueObjects] = useState<VenueObject[]>(
    (layout.venue_objects as unknown as VenueObject[]) || []
  );
  const [sections, setSections] = useState<SectionDefinition[]>(
    (layout.sections as unknown as SectionDefinition[]) || []
  );
  const [canvasWidth, setCanvasWidth] = useState(layout.canvas_width || 1200);
  const [canvasHeight, setCanvasHeight] = useState(layout.canvas_height || 800);
  const [isPublished, setIsPublished] = useState(layout.is_published ?? true);

  // Selection state
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Canvas viewport state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);

  // Modal tools
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);

  // Drag interaction state
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialSeatPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const initialObjectPosition = useRef<{ x: number; y: number } | null>(null);
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Keep local state in sync when initialSeats prop changes
  useEffect(() => {
    setSeats(initialSeats);
  }, [initialSeats]);

  // Prevent parent page scrolling & handle external mouse wheel + trackpad panning/zooming
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheelNative = (e: WheelEvent) => {
      // Prevent parent window/page from scrolling when pointer is over the canvas
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        // Zoom on Ctrl/Cmd + Wheel or pinch
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        setScale((s) => Math.min(2.5, Math.max(0.4, Number((s + delta).toFixed(2)))));
      } else {
        // Pan on normal wheel / trackpad scroll
        let dx = e.deltaX;
        let dy = e.deltaY;

        // Line-based mouse wheel delta normalization (Windows standard mouse wheel)
        if (e.deltaMode === 1) {
          dx *= 24;
          dy *= 24;
        } else if (e.deltaMode === 2) {
          dx *= 400;
          dy *= 400;
        }

        // Shift + Wheel on some systems generates deltaY instead of deltaX
        if (e.shiftKey && dx === 0 && dy !== 0) {
          dx = dy;
          dy = 0;
        }

        setPan((p) => ({
          x: p.x - dx,
          y: p.y - dy,
        }));
      }
    };

    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheelNative);
    };
  }, []);

  // Track single selected seat or object
  const singleSelectedSeat = useMemo(() => {
    if (selectedSeatIds.size === 1) {
      const id = Array.from(selectedSeatIds)[0];
      return seats.find((s) => s.id === id) || null;
    }
    return null;
  }, [selectedSeatIds, seats]);

  const singleSelectedObject = useMemo(() => {
    if (selectedObjectId) {
      return venueObjects.find((o) => o.id === selectedObjectId) || null;
    }
    return null;
  }, [selectedObjectId, venueObjects]);

  const shouldShowInspector =
    isInspectorOpen &&
    Boolean(singleSelectedSeat || selectedSeatIds.size > 1 || singleSelectedObject);

  // Derived statistics
  const stats = useMemo(() => {
    const total = seats.length;
    const sold = seats.filter((s) => s.status === "sold").length;
    const reserved = seats.filter((s) => s.status === "reserved").length;
    const guestAssigned = seats.filter((s) => !!s.assigned_invitation_id).length;
    const vip = seats.filter((s) => s.is_vip).length;
    const accessible = seats.filter((s) => s.is_accessible).length;
    const available = seats.filter(
      (s) => s.status === "available" && !s.assigned_invitation_id
    ).length;
    return { total, sold, reserved, guestAssigned, vip, accessible, available };
  }, [seats]);

  // ── SAVE LAYOUT ──────────────────────────────────────────────────────────
  const handleSaveLayout = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/seating`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save_layout",
          layoutId: layout.id,
          canvas_width: canvasWidth,
          canvas_height: canvasHeight,
          sections,
          venue_objects: venueObjects,
          seats,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save layout.");
      }

      setHasUnsavedChanges(false);
      onToast("success", "Venue layout saved successfully.");
      await onRefresh();
    } catch (err: any) {
      onToast("error", err.message || "Failed to save layout.");
    } finally {
      setIsSaving(false);
    }
  }, [
    eventId,
    layout.id,
    canvasWidth,
    canvasHeight,
    sections,
    venueObjects,
    seats,
    onToast,
    onRefresh,
  ]);

  // ── PUBLISH / DRAFT TOGGLE ───────────────────────────────────────────────
  const handleTogglePublish = async () => {
    try {
      const nextState = !isPublished;
      const res = await fetch(`/api/events/${eventId}/seating`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "publish_layout",
          is_published: nextState,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update publish state.");

      setIsPublished(nextState);
      onToast(
        "success",
        nextState
          ? "Layout published! Now visible to customers."
          : "Layout set to Draft mode."
      );
    } catch (err: any) {
      onToast("error", err.message || "Operation failed.");
    }
  };

  // ── MOUSE / DRAG INTERACTIONS ────────────────────────────────────────────

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If user clicked inside the properties inspector overlay, do not interfere
    if ((e.target as HTMLElement).closest(".properties-inspector-overlay")) {
      return;
    }

    const target = e.target as SVGElement;
    const seatId = target.getAttribute("data-seat-id");
    const objId = target.getAttribute("data-object-id");

    if (seatId) {
      // Seat Clicked -> select only (do NOT open inspector on single click)
      setSelectedObjectId(null);
      if (e.shiftKey) {
        const next = new Set(selectedSeatIds);
        if (next.has(seatId)) next.delete(seatId);
        else next.add(seatId);
        setSelectedSeatIds(next);
      } else {
        if (!selectedSeatIds.has(seatId)) {
          setSelectedSeatIds(new Set([seatId]));
        }
      }

      // Prepare Dragging for selected seats
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      const map = new Map<string, { x: number; y: number }>();
      seats.forEach((s) => {
        if (selectedSeatIds.has(s.id) || s.id === seatId) {
          map.set(s.id, { x: s.x, y: s.y });
        }
      });
      initialSeatPositions.current = map;
      return;
    }

    if (objId) {
      // Object Clicked -> select only (do NOT open inspector on single click)
      setSelectedSeatIds(new Set());
      setSelectedObjectId(objId);
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      const obj = venueObjects.find((o) => o.id === objId);
      if (obj) {
        initialObjectPosition.current = { x: obj.x, y: obj.y };
      }
      return;
    }

    // Clicked on empty canvas background -> clear selection, close inspector & start pan
    if (!e.shiftKey) {
      setSelectedSeatIds(new Set());
      setSelectedObjectId(null);
      setIsInspectorOpen(false);
    }
    isPanning.current = true;
    lastPan.current = { x: e.clientX, y: e.clientY };
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    // If double clicked inside the inspector overlay, ignore
    if ((e.target as HTMLElement).closest(".properties-inspector-overlay")) {
      return;
    }

    const target = e.target as SVGElement;
    const seatId = target.getAttribute("data-seat-id");
    const objId = target.getAttribute("data-object-id");

    if (seatId) {
      setSelectedObjectId(null);
      setSelectedSeatIds(new Set([seatId]));
      setIsInspectorOpen(true);
      return;
    }

    if (objId) {
      setSelectedSeatIds(new Set());
      setSelectedObjectId(objId);
      setIsInspectorOpen(true);
      return;
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) {
      setPan((p) => ({
        x: p.x + (e.clientX - lastPan.current.x),
        y: p.y + (e.clientY - lastPan.current.y),
      }));
      lastPan.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDragging.current) return;

    const dx = (e.clientX - dragStart.current.x) / scale;
    const dy = (e.clientY - dragStart.current.y) / scale;

    const snap = (val: number) => (snapToGrid ? Math.round(val / 10) * 10 : Math.round(val));

    if (selectedSeatIds.size > 0 && initialSeatPositions.current.size > 0) {
      setSeats((prevSeats) =>
        prevSeats.map((s) => {
          const init = initialSeatPositions.current.get(s.id);
          if (init) {
            return {
              ...s,
              x: Math.max(0, snap(init.x + dx)),
              y: Math.max(0, snap(init.y + dy)),
            };
          }
          return s;
        })
      );
      setHasUnsavedChanges(true);
    } else if (selectedObjectId && initialObjectPosition.current) {
      const init = initialObjectPosition.current;
      setVenueObjects((prevObjs) =>
        prevObjs.map((o) => {
          if (o.id === selectedObjectId) {
            return {
              ...o,
              x: Math.max(0, snap(init.x + dx)),
              y: Math.max(0, snap(init.y + dy)),
            };
          }
          return o;
        })
      );
      setHasUnsavedChanges(true);
    }
  };

  const handleCanvasMouseUp = () => {
    isDragging.current = false;
    isPanning.current = false;
  };

  // ── QUICK OBJECT GENERATORS ──────────────────────────────────────────────

  const handleAddStage = () => {
    const newStage: VenueObject = {
      id: `stage-${Date.now()}`,
      type: "stage",
      name: "Main Stage",
      label: "STAGE / PERFORMANCE AREA",
      x: canvasWidth / 2 - 200,
      y: 40,
      width: 400,
      height: 70,
      rotation: 0,
      color: "#18181b",
    };
    setVenueObjects((prev) => [...prev, newStage]);
    setSelectedObjectId(newStage.id);
    setSelectedSeatIds(new Set());
    setHasUnsavedChanges(true);
    onToast("success", "Stage added to canvas.");
  };

  const handleAddGA = () => {
    const newGA: VenueObject = {
      id: `ga-${Date.now()}`,
      type: "ga_area",
      name: "General Admission Zone",
      label: "Standing / GA Zone",
      x: 80,
      y: 130,
      width: 260,
      height: 120,
      capacity: 100,
      color: "#10b981",
    };
    setVenueObjects((prev) => [...prev, newGA]);
    setSelectedObjectId(newGA.id);
    setSelectedSeatIds(new Set());
    setHasUnsavedChanges(true);
    onToast("success", "General Admission zone added.");
  };

  const handleAddLabel = () => {
    const newLabel: VenueObject = {
      id: `label-${Date.now()}`,
      type: "label",
      name: "Section Label",
      label: "VIP Floor Area",
      x: 100,
      y: 100,
      width: 140,
      height: 30,
      color: "#475569",
    };
    setVenueObjects((prev) => [...prev, newLabel]);
    setSelectedObjectId(newLabel.id);
    setSelectedSeatIds(new Set());
    setHasUnsavedChanges(true);
    onToast("success", "Text label added.");
  };

  // ── SECTION / ROW MODAL FORM STATE ───────────────────────────────────────
  const [sectionForm, setSectionForm] = useState({
    name: "Section A",
    rows: 4,
    seatsPerRow: 10,
    startX: 100,
    startY: 180,
    defaultPrice: "",
    ticketTypeId: "",
    isVip: false,
    isAccessible: false,
  });

  const handleGenerateSection = () => {
    const generated = generateSectionSeatsGrid({
      eventId,
      layoutId: layout.id,
      sectionName: sectionForm.name || "General",
      rowsCount: Number(sectionForm.rows) || 1,
      seatsPerRow: Number(sectionForm.seatsPerRow) || 1,
      startX: Number(sectionForm.startX) || 80,
      startY: Number(sectionForm.startY) || 150,
      defaultPrice: sectionForm.defaultPrice ? parseFloat(sectionForm.defaultPrice) : null,
      ticketTypeId: sectionForm.ticketTypeId || null,
      isVip: sectionForm.isVip,
      isAccessible: sectionForm.isAccessible,
    });

    const newSeats: SeatGeometry[] = generated.map((s, idx) => ({
      ...s,
      id: `new-${Date.now()}-${idx}`,
    }));

    setSeats((prev) => [...prev, ...newSeats]);

    // Add or update section in sections list
    if (!sections.some((sec) => sec.name === sectionForm.name)) {
      setSections((prev) => [
        ...prev,
        {
          name: sectionForm.name,
          default_price: sectionForm.defaultPrice ? parseFloat(sectionForm.defaultPrice) : null,
          ticket_type_id: sectionForm.ticketTypeId || null,
        },
      ]);
    }

    setShowSectionModal(false);
    setHasUnsavedChanges(true);
    onToast("success", `Generated ${newSeats.length} seats for ${sectionForm.name}.`);
  };

  // ── TABLE MODAL FORM STATE ───────────────────────────────────────────────
  const [tableForm, setTableForm] = useState({
    tableNumber: "1",
    tableName: "VIP Table",
    capacity: 8,
    shape: "round" as "round" | "rect",
    startX: 200,
    startY: 200,
    isVip: true,
    priceOverride: "",
  });

  const handleGenerateTable = () => {
    const generated = generateTableSeats({
      eventId,
      layoutId: layout.id,
      tableNumber: tableForm.tableNumber,
      tableName: tableForm.tableName,
      tableCapacity: Number(tableForm.capacity) || 6,
      tableX: Number(tableForm.startX) || 150,
      tableY: Number(tableForm.startY) || 150,
      tableShape: tableForm.shape,
      isVip: tableForm.isVip,
      priceOverride: tableForm.priceOverride ? parseFloat(tableForm.priceOverride) : null,
    });

    const newSeats: SeatGeometry[] = generated.map((s, idx) => ({
      ...s,
      id: `new-table-${Date.now()}-${idx}`,
    }));

    // Add table visual shape object
    const tableObject: VenueObject = {
      id: `table-shape-${Date.now()}`,
      type: "table",
      name: `Table ${tableForm.tableNumber}`,
      label: tableForm.tableName || `Table ${tableForm.tableNumber}`,
      table_number: tableForm.tableNumber,
      table_name: tableForm.tableName,
      table_capacity: Number(tableForm.capacity) || 6,
      table_shape: tableForm.shape,
      x: Number(tableForm.startX) || 150,
      y: Number(tableForm.startY) || 150,
      width: tableForm.shape === "round" ? 100 : 130,
      height: 100,
    };

    setVenueObjects((prev) => [...prev, tableObject]);
    setSeats((prev) => [...prev, ...newSeats]);
    setShowTableModal(false);
    setHasUnsavedChanges(true);
    onToast("success", `Created Table ${tableForm.tableNumber} with ${newSeats.length} seats.`);
  };

  // ── SELECTION MUTATIONS (DUPLICATE, DELETE, VIP, ROTATE) ──────────────────

  const handleDeleteSelected = () => {
    if (selectedSeatIds.size > 0) {
      // Check if any selected seat is sold or assigned
      const protectedSeats = seats.filter(
        (s) => selectedSeatIds.has(s.id) && (s.status === "sold" || s.assigned_invitation_id)
      );

      if (protectedSeats.length > 0) {
        onToast("error", "Cannot delete seats that are already sold or assigned to guests.");
        return;
      }

      setSeats((prev) => prev.filter((s) => !selectedSeatIds.has(s.id)));
      setSelectedSeatIds(new Set());
      setIsInspectorOpen(false);
      setHasUnsavedChanges(true);
      onToast("success", "Selected seats removed.");
    } else if (selectedObjectId) {
      setVenueObjects((prev) => prev.filter((o) => o.id !== selectedObjectId));
      setSelectedObjectId(null);
      setIsInspectorOpen(false);
      setHasUnsavedChanges(true);
      onToast("success", "Object removed.");
    }
  };

  const handleDuplicateSelected = () => {
    if (selectedSeatIds.size > 0) {
      const duplicates: SeatGeometry[] = [];
      seats.forEach((s) => {
        if (selectedSeatIds.has(s.id)) {
          duplicates.push({
            ...s,
            id: `dup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            x: s.x + 30,
            y: s.y + 30,
            status: "available",
            assigned_invitation_id: null,
            ticket_id: null,
          });
        }
      });
      setSeats((prev) => [...prev, ...duplicates]);
      setSelectedSeatIds(new Set(duplicates.map((d) => d.id)));
      setHasUnsavedChanges(true);
      onToast("success", `Duplicated ${duplicates.length} seats.`);
    }
  };

  const handleRotateSelected = () => {
    if (selectedSeatIds.size > 0) {
      setSeats((prev) =>
        prev.map((s) => {
          if (selectedSeatIds.has(s.id)) {
            return { ...s, rotation: ((s.rotation || 0) + 45) % 360 };
          }
          return s;
        })
      );
      setHasUnsavedChanges(true);
    } else if (selectedObjectId) {
      setVenueObjects((prev) =>
        prev.map((o) => {
          if (o.id === selectedObjectId) {
            return { ...o, rotation: ((o.rotation || 0) + 45) % 360 };
          }
          return o;
        })
      );
      setHasUnsavedChanges(true);
    }
  };

  const handleCloseInspector = () => {
    setIsInspectorOpen(false);
  };

  return (
    <div className="space-y-3 select-none">
      {/* ── UNIFIED FLAT WORKSPACE CONTAINER ────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
        {/* ── TOP UNIFIED TOOLBAR (Fixed Height, No Wrap to prevent shaking) ──── */}
        <div className="flex h-14 min-h-[56px] items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 overflow-x-auto">
          {/* Left tools palette */}
          <div className="flex flex-nowrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSectionModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-700 transition-all shadow-2xs shrink-0"
            >
              <Grid size={13} />
              Add Section & Rows
            </button>
            <button
              type="button"
              onClick={() => setShowTableModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
            >
              <TableIcon size={13} />
              Add Table
            </button>
            <button
              type="button"
              onClick={handleAddStage}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
            >
              <Layers size={13} />
              Add Stage
            </button>
            <button
              type="button"
              onClick={handleAddGA}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
            >
              <Users size={13} />
              Add GA Zone
            </button>
            <button
              type="button"
              onClick={handleAddLabel}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
            >
              <Type size={13} />
              Add Label
            </button>

            {/* Selection quick actions */}
            {(selectedSeatIds.size > 0 || selectedObjectId) && (
              <div className="ml-2 flex items-center gap-1 border-l border-zinc-200 pl-2 shrink-0">
                <span className="mr-1 rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                  {selectedSeatIds.size > 0
                    ? `${selectedSeatIds.size} seat${selectedSeatIds.size > 1 ? "s" : ""}`
                    : "Object"}
                </span>
                <button
                  type="button"
                  onClick={handleRotateSelected}
                  title="Rotate 45°"
                  className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
                >
                  <RotateCw size={13} />
                </button>
                {selectedSeatIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDuplicateSelected}
                    title="Duplicate"
                    className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
                  >
                    <Copy size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  title="Delete"
                  className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Right action controls */}
          <div className="flex flex-nowrap items-center gap-2 shrink-0">
            {/* Viewport controls */}
            <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.2).toFixed(2))))}
                title="Zoom In"
                className="rounded-lg p-1 text-zinc-600 hover:bg-white hover:shadow-2xs"
              >
                <ZoomIn size={13} />
              </button>
              <span className="px-1 text-[11px] font-bold text-zinc-600 min-w-[38px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.2).toFixed(2))))}
                title="Zoom Out"
                className="rounded-lg p-1 text-zinc-600 hover:bg-white hover:shadow-2xs"
              >
                <ZoomOut size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setScale(1);
                  setPan({ x: 0, y: 0 });
                }}
                title="Reset View"
                className="rounded-lg p-1 text-zinc-600 hover:bg-white hover:shadow-2xs"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {/* Snap toggle */}
            <button
              type="button"
              onClick={() => setSnapToGrid((s) => !s)}
              className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${
                snapToGrid
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-zinc-200 bg-white text-zinc-400"
              }`}
            >
              Snap
            </button>

            {/* Publish / Draft toggle */}
            <button
              type="button"
              onClick={handleTogglePublish}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all ${
                isPublished
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              {isPublished ? <Eye size={13} /> : <EyeOff size={13} />}
              {isPublished ? "Published" : "Draft"}
            </button>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveLayout}
              disabled={isSaving}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-black text-white transition-all shadow-xs ${
                hasUnsavedChanges
                  ? "bg-emerald-600 hover:bg-emerald-700 animate-pulse"
                  : "bg-zinc-900 hover:bg-zinc-800"
              }`}
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {hasUnsavedChanges ? "Save Changes *" : "Saved"}
            </button>
          </div>
        </div>

        {/* ── STATS SUMMARY STRIP ────────────────────────────────────────── */}
        <div className="flex h-9 items-center gap-4 border-b border-zinc-100 bg-zinc-50/70 px-4 text-xs font-medium text-zinc-600 overflow-x-auto whitespace-nowrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-zinc-900">{stats.total}</span>
            <span className="text-zinc-400">Total Seats</span>
          </div>
          <span className="text-zinc-300">·</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-emerald-700">{stats.available}</span>
            <span className="text-zinc-400">Available</span>
          </div>
          <span className="text-zinc-300">·</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-amber-700">{stats.reserved}</span>
            <span className="text-zinc-400">Reserved</span>
          </div>
          <span className="text-zinc-300">·</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-zinc-500">{stats.sold}</span>
            <span className="text-zinc-400">Sold</span>
          </div>
          <span className="text-zinc-300">·</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-violet-700">{stats.guestAssigned}</span>
            <span className="text-zinc-400">Guest Assigned</span>
          </div>
          <span className="text-zinc-300">·</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-amber-500">{stats.vip}</span>
            <span className="text-zinc-400">VIP</span>
          </div>
          <span className="text-zinc-300">·</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-blue-600">{stats.accessible}</span>
            <span className="text-zinc-400">Accessible</span>
          </div>
          <div className="ml-auto text-[11px] text-zinc-400 shrink-0">
            Double-click object for Inspector · Drag to pan · Scroll to pan / Ctrl+Scroll to zoom
          </div>
        </div>

        {/* ── WORKSPACE BODY: FULL-WIDTH INTERNAL SCROLLING/PANNING VIEWPORT ── */}
        <div className="relative w-full min-h-[640px] h-[calc(100vh-250px)] overflow-hidden">
          {/* Primary Plain SVG Canvas Viewport */}
          <div
            ref={canvasRef}
            className="relative h-full w-full overflow-hidden bg-zinc-100/80 cursor-crosshair select-none overscroll-contain touch-none"
            style={{ overscrollBehavior: "contain", touchAction: "none" }}
            onMouseDown={handleCanvasMouseDown}
            onDoubleClick={handleCanvasDoubleClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            <svg
              width={canvasWidth}
              height={canvasHeight}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: "0 0",
                display: "block",
              }}
              className="drop-shadow-sm will-change-transform"
            >
              {/* Grid Background Pattern */}
              <defs>
                <pattern id="builder-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
                </pattern>
              </defs>

              {/* Explicit Canvas Surface Background */}
              <rect
                width={canvasWidth}
                height={canvasHeight}
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                rx="4"
              />
              <rect
                width={canvasWidth}
                height={canvasHeight}
                fill="url(#builder-grid)"
                rx="4"
              />

              {/* 1. Render Non-Seat Objects (Stages, Tables, GA, Labels) */}
              {venueObjects.map((obj) => {
                const isSelected = selectedObjectId === obj.id;

                if (obj.type === "stage") {
                  return (
                    <g
                      key={obj.id}
                      data-object-id={obj.id}
                      transform={`rotate(${obj.rotation || 0}, ${obj.x + obj.width / 2}, ${obj.y + obj.height / 2})`}
                      className="cursor-move"
                    >
                      <rect
                        data-object-id={obj.id}
                        x={obj.x}
                        y={obj.y}
                        width={obj.width}
                        height={obj.height}
                        rx={12}
                        fill="#18181b"
                        stroke={isSelected ? "#ea580c" : "#27272a"}
                        strokeWidth={isSelected ? 3 : 2}
                      />
                      <text
                        data-object-id={obj.id}
                        x={obj.x + obj.width / 2}
                        y={obj.y + obj.height / 2 + 5}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={14}
                        fontWeight="bold"
                        letterSpacing="1.5"
                        pointerEvents="none"
                      >
                        {obj.label || obj.name}
                      </text>
                    </g>
                  );
                }

                if (obj.type === "table") {
                  const isRound = obj.table_shape !== "rect";
                  const centerX = obj.x + obj.width / 2;
                  const centerY = obj.y + obj.height / 2;
                  const radius = Math.min(obj.width, obj.height) / 2;

                  return (
                    <g key={obj.id} data-object-id={obj.id} className="cursor-move">
                      {isRound ? (
                        <circle
                          data-object-id={obj.id}
                          cx={centerX}
                          cy={centerY}
                          r={radius}
                          fill="#e0e7ff"
                          stroke={isSelected ? "#ea580c" : "#818cf8"}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray="4 2"
                        />
                      ) : (
                        <rect
                          data-object-id={obj.id}
                          x={obj.x}
                          y={obj.y}
                          width={obj.width}
                          height={obj.height}
                          rx={8}
                          fill="#e0e7ff"
                          stroke={isSelected ? "#ea580c" : "#818cf8"}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                      )}
                      <text
                        data-object-id={obj.id}
                        x={centerX}
                        y={centerY + 4}
                        textAnchor="middle"
                        fill="#4338ca"
                        fontSize={12}
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {obj.table_name || `Table ${obj.table_number || ""}`}
                      </text>
                    </g>
                  );
                }

                if (obj.type === "ga_area") {
                  return (
                    <g key={obj.id} data-object-id={obj.id} className="cursor-move">
                      <rect
                        data-object-id={obj.id}
                        x={obj.x}
                        y={obj.y}
                        width={obj.width}
                        height={obj.height}
                        rx={10}
                        fill="#ecfdf5"
                        stroke={isSelected ? "#ea580c" : "#10b981"}
                        strokeWidth={isSelected ? 3 : 1.5}
                        strokeDasharray="6 3"
                      />
                      <text
                        data-object-id={obj.id}
                        x={obj.x + 12}
                        y={obj.y + 22}
                        fill="#047857"
                        fontSize={13}
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {obj.label || obj.name}
                      </text>
                      {obj.capacity && (
                        <text
                          data-object-id={obj.id}
                          x={obj.x + 12}
                          y={obj.y + 38}
                          fill="#059669"
                          fontSize={11}
                          pointerEvents="none"
                        >
                          Capacity: {obj.capacity}
                        </text>
                      )}
                    </g>
                  );
                }

                // Default label / text
                return (
                  <text
                    key={obj.id}
                    data-object-id={obj.id}
                    x={obj.x}
                    y={obj.y}
                    fill={obj.color || "#475569"}
                    fontSize={14}
                    fontWeight="bold"
                    className="cursor-move"
                  >
                    {obj.label || obj.name}
                  </text>
                );
              })}

              {/* 2. Render Physical Seats */}
              {seats.map((seat) => {
                const isSelected = selectedSeatIds.has(seat.id);
                const isSold = seat.status === "sold";
                const isAssigned = !!seat.assigned_invitation_id;
                const isReserved = seat.status === "reserved";
                const isUnavailable = seat.status === "unavailable";

                let fill = "#6366f1"; // default available (indigo)
                if (isSold) fill = "#9ca3af";
                else if (isAssigned) fill = "#8b5cf6"; // violet
                else if (isReserved) fill = "#f59e0b"; // amber
                else if (isUnavailable) fill = "#ef4444"; // red

                const radius = (seat.width || 26) / 2 - 1;
                const centerX = seat.x + radius + 1;
                const centerY = seat.y + radius + 1;

                return (
                  <g
                    key={seat.id}
                    data-seat-id={seat.id}
                    transform={seat.rotation ? `rotate(${seat.rotation}, ${centerX}, ${centerY})` : undefined}
                    className="cursor-move"
                  >
                    {/* Selection halo if selected */}
                    {isSelected && (
                      <circle
                        cx={centerX}
                        cy={centerY}
                        r={radius + 3}
                        fill="none"
                        stroke="#ea580c"
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    )}

                    <circle
                      data-seat-id={seat.id}
                      cx={centerX}
                      cy={centerY}
                      r={radius}
                      fill={fill}
                      stroke={isSelected ? "#ea580c" : "#ffffff"}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      style={{
                        opacity: isSold ? 0.5 : isUnavailable ? 0.4 : 1,
                      }}
                    />

                    {/* VIP Star overlay */}
                    {seat.is_vip && (
                      <circle
                        cx={centerX + radius * 0.55}
                        cy={centerY - radius * 0.55}
                        r={4.5}
                        fill="#f59e0b"
                        stroke="#ffffff"
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                    )}

                    {/* Accessible overlay */}
                    {seat.is_accessible && (
                      <circle
                        cx={centerX - radius * 0.55}
                        cy={centerY - radius * 0.55}
                        r={4.5}
                        fill="#3b82f6"
                        stroke="#ffffff"
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                    )}

                    {/* Seat Number */}
                    <text
                      data-seat-id={seat.id}
                      x={centerX}
                      y={centerY + 3}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={radius > 11 ? 9 : 8}
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {seat.seat_number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* ── PROPERTIES INSPECTOR: FLOATING OVERLAY PANEL (Double-click only) ── */}
          {shouldShowInspector && (
            <div
              className="properties-inspector-overlay absolute top-3 right-3 bottom-3 z-30 w-84 max-w-[calc(100%-24px)] rounded-2xl border border-zinc-200/90 bg-white/95 backdrop-blur-md shadow-2xl p-4 overflow-y-auto space-y-4 animate-in fade-in slide-in-from-right-3 duration-150"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Close button */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Properties Inspector
                </p>
                <button
                  type="button"
                  onClick={handleCloseInspector}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
                  title="Close Inspector"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Case A: Single Seat Selected */}
              {singleSelectedSeat && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="font-black text-zinc-900">
                      {singleSelectedSeat.table_number
                        ? `Table ${singleSelectedSeat.table_number}, Seat ${singleSelectedSeat.seat_number}`
                        : `${singleSelectedSeat.section}, Row ${singleSelectedSeat.row_label}, Seat ${singleSelectedSeat.seat_number}`}
                    </p>
                    <p className="text-[11px] font-bold text-zinc-500">ID: {singleSelectedSeat.id.slice(0, 8)}...</p>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-400">Status</label>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-xs font-black ${
                          singleSelectedSeat.status === "sold"
                            ? "bg-zinc-100 text-zinc-600 border-zinc-300"
                            : singleSelectedSeat.assigned_invitation_id
                            ? "bg-violet-50 text-violet-700 border-violet-200"
                            : singleSelectedSeat.status === "reserved"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {singleSelectedSeat.status.toUpperCase()}
                      </span>
                      {singleSelectedSeat.status !== "sold" && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = singleSelectedSeat.status === "unavailable" ? "available" : "unavailable";
                            setSeats((prev) =>
                              prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, status: next } : s))
                            );
                            setHasUnsavedChanges(true);
                          }}
                          className="text-xs font-bold text-zinc-500 underline"
                        >
                          Toggle Unavailable
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Toggles: VIP & Accessible */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSeats((prev) =>
                          prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, is_vip: !s.is_vip } : s))
                        );
                        setHasUnsavedChanges(true);
                      }}
                      className={`flex items-center justify-center gap-1 rounded-xl border p-2 text-xs font-black transition-all ${
                        singleSelectedSeat.is_vip
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600"
                      }`}
                    >
                      <Star size={12} className={singleSelectedSeat.is_vip ? "fill-amber-400" : ""} />
                      VIP Seat
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSeats((prev) =>
                          prev.map((s) =>
                            s.id === singleSelectedSeat.id ? { ...s, is_accessible: !s.is_accessible } : s
                          )
                        );
                        setHasUnsavedChanges(true);
                      }}
                      className={`flex items-center justify-center gap-1 rounded-xl border p-2 text-xs font-black transition-all ${
                        singleSelectedSeat.is_accessible
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600"
                      }`}
                    >
                      <Accessibility size={12} />
                      Accessible
                    </button>
                  </div>

                  {/* Section, Row, Seat Number */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">Section</label>
                      <input
                        type="text"
                        value={singleSelectedSeat.section}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSeats((prev) =>
                            prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, section: val } : s))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">Row</label>
                      <input
                        type="text"
                        value={singleSelectedSeat.row_label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSeats((prev) =>
                            prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, row_label: val } : s))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">Seat #</label>
                      <input
                        type="number"
                        value={singleSelectedSeat.seat_number}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setSeats((prev) =>
                            prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, seat_number: val } : s))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                  </div>

                  {/* Price Override */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-400">
                      Custom Price Override ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Default price applies"
                      value={singleSelectedSeat.price_override ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        setSeats((prev) =>
                          prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, price_override: val } : s))
                        );
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full rounded-xl border border-zinc-200 p-2 text-xs font-bold"
                    />
                  </div>

                  {/* Position coordinates */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">X (px)</label>
                      <input
                        type="number"
                        value={singleSelectedSeat.x}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setSeats((prev) =>
                            prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, x: val } : s))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">Y (px)</label>
                      <input
                        type="number"
                        value={singleSelectedSeat.y}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setSeats((prev) =>
                            prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, y: val } : s))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">Rotation</label>
                      <input
                        type="number"
                        value={singleSelectedSeat.rotation || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setSeats((prev) =>
                            prev.map((s) => (s.id === singleSelectedSeat.id ? { ...s, rotation: val } : s))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Case B: Multiple Seats Selected */}
              {selectedSeatIds.size > 1 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                    <p className="font-black text-violet-900">{selectedSeatIds.size} Seats Selected</p>
                    <p className="text-xs text-violet-700">Bulk edit properties across selected seats.</p>
                  </div>

                  {/* Bulk VIP Toggle */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSeats((prev) =>
                          prev.map((s) => (selectedSeatIds.has(s.id) ? { ...s, is_vip: true } : s))
                        );
                        setHasUnsavedChanges(true);
                        onToast("success", "Marked selected as VIP.");
                      }}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors"
                    >
                      Mark VIP
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSeats((prev) =>
                          prev.map((s) => (selectedSeatIds.has(s.id) ? { ...s, is_vip: false } : s))
                        );
                        setHasUnsavedChanges(true);
                        onToast("success", "Removed VIP from selected.");
                      }}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
                    >
                      Remove VIP
                    </button>
                  </div>
                </div>
              )}

              {/* Case C: Non-Seat Venue Object Selected */}
              {singleSelectedObject && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="font-black text-zinc-900">{singleSelectedObject.name}</p>
                    <p className="text-xs font-bold text-zinc-500 uppercase">{singleSelectedObject.type}</p>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-400">Display Label</label>
                    <input
                      type="text"
                      value={singleSelectedObject.label || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVenueObjects((prev) =>
                          prev.map((o) => (o.id === singleSelectedObject.id ? { ...o, label: val } : o))
                        );
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full rounded-xl border border-zinc-200 p-2 text-xs font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">Width (px)</label>
                      <input
                        type="number"
                        value={singleSelectedObject.width}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 10;
                          setVenueObjects((prev) =>
                            prev.map((o) => (o.id === singleSelectedObject.id ? { ...o, width: val } : o))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400">Height (px)</label>
                      <input
                        type="number"
                        value={singleSelectedObject.height}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 10;
                          setVenueObjects((prev) =>
                            prev.map((o) => (o.id === singleSelectedObject.id ? { ...o, height: val } : o))
                          );
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full rounded-lg border border-zinc-200 p-1.5 text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: ADD SECTION & ROWS ──────────────────────────────────────── */}
      {showSectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-zinc-900">Add Section & Seat Rows</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-600">Section Name</label>
                <input
                  type="text"
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-600">Number of Rows</label>
                  <input
                    type="number"
                    min={1}
                    max={26}
                    value={sectionForm.rows}
                    onChange={(e) => setSectionForm((f) => ({ ...f, rows: parseInt(e.target.value, 10) }))}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-600">Seats Per Row</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={sectionForm.seatsPerRow}
                    onChange={(e) => setSectionForm((f) => ({ ...f, seatsPerRow: parseInt(e.target.value, 10) }))}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-600">Default Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Optional"
                    value={sectionForm.defaultPrice}
                    onChange={(e) => setSectionForm((f) => ({ ...f, defaultPrice: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-600">Ticket Category</label>
                  <select
                    value={sectionForm.ticketTypeId}
                    onChange={(e) => setSectionForm((f) => ({ ...f, ticketTypeId: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                  >
                    <option value="">Default / None</option>
                    {ticketTypes.map((tt) => (
                      <option key={tt.id} value={tt.id}>
                        {tt.name} (${tt.price})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={sectionForm.isVip}
                    onChange={(e) => setSectionForm((f) => ({ ...f, isVip: e.target.checked }))}
                    className="rounded-sm"
                  />
                  Mark as VIP Section
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSectionModal(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-black text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateSection}
                className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700"
              >
                Generate Seats
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD TABLE ──────────────────────────────────────────────── */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-zinc-900">Add Banquet / Dining Table</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-600">Table Number</label>
                  <input
                    type="text"
                    value={tableForm.tableNumber}
                    onChange={(e) => setTableForm((f) => ({ ...f, tableNumber: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-600">Seat Capacity</label>
                  <input
                    type="number"
                    min={2}
                    max={24}
                    value={tableForm.capacity}
                    onChange={(e) => setTableForm((f) => ({ ...f, capacity: parseInt(e.target.value, 10) }))}
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-600">Table Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Sponsors Table"
                  value={tableForm.tableName}
                  onChange={(e) => setTableForm((f) => ({ ...f, tableName: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-600">Table Shape</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTableForm((f) => ({ ...f, shape: "round" }))}
                    className={`rounded-xl border p-2 text-xs font-black ${
                      tableForm.shape === "round"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-zinc-200 text-zinc-600"
                    }`}
                  >
                    Round Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableForm((f) => ({ ...f, shape: "rect" }))}
                    className={`rounded-xl border p-2 text-xs font-black ${
                      tableForm.shape === "rect"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-zinc-200 text-zinc-600"
                    }`}
                  >
                    Rectangular Table
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-black text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateTable}
                className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700"
              >
                Create Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
