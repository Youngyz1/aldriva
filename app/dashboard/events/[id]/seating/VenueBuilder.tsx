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
  MoreHorizontal,
  ListChecks,
  PanelRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import AdminDrawer from "@/components/admin/AdminDrawer";
import {
  SeatGeometry,
  VenueObject,
  SectionDefinition,
  TicketTypeSummary,
  generateSectionSeatsGrid,
  generateTableSeats,
  generateCanonicalSeatingPlan,
  parseCountInput,
  isPersistedSeatId,
  checkLayoutProtection,
  nextRowStartIndex,
  sectionBottomEdge,
  nextTableNumber,
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
  /**
   * Phase 6E: notifies the unified workspace when the canvas holds unsaved
   * changes so tab switches can be guarded. Optional; mirrors the existing
   * hasUnsavedChanges state without changing save behavior.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function VenueBuilder({
  eventId,
  layout,
  initialSeats,
  ticketTypes,
  invitations,
  onRefresh,
  onToast,
  onDirtyChange,
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
  // Touch multi-select mode: mirrors Shift+click for touchscreens where no
  // Shift key exists. Additive only; mouse behavior unchanged.
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Phase 6E: surface the existing dirty flag to the unified workspace.
  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

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

  // ── Touch gesture tracking (Stage 2) ─────────────────────────────────────
  // Movement below TAP_SLOP_PX never starts a drag/pan (finger jitter guard).
  // Two concurrent contacts switch to pinch-zoom + midpoint pan.
  const TAP_SLOP_PX = 6;
  const activePointers = useRef(
    new Map<number, { x: number; y: number; target: "seat" | "object" | "empty" }>()
  );
  const gestureActive = useRef(false);
  const pinch = useRef<null | {
    startDist: number;
    startMidX: number;
    startMidY: number;
    startScale: number;
    startPan: { x: number; y: number };
  }>(null);

  // Keep local state and persisted ID index in sync when initialSeats prop changes
  useEffect(() => {
    setSeats(initialSeats);
    lastSavedIdsRef.current = new Set(
      initialSeats.map((s) => s.id).filter(isPersistedSeatId)
    );
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
  // Tracks the ids the server last persisted, so seats removed on the canvas
  // can be reported as deleteIds (full-layout sync). Initialized from the
  // loaded layout and refreshed from every successful save response.
  const lastSavedIdsRef = useRef<Set<string>>(
    new Set(initialSeats.map((s) => s.id))
  );

  // ── RESET LAYOUT ───────────────────────────────────────────────────────────
  // Clears the workspace back to an empty layout in local state only.
  // Sold/assigned seats are protected: they stay, so the existing save path
  // never receives them as deletes (the server would 409 them anyway).
  // Nothing is destroyed until the organizer explicitly saves.
  const handleResetLayout = useCallback(() => {
    if (seats.length === 0 && venueObjects.length === 0) return;
    const protection = checkLayoutProtection(seats, "replace");
    const keptIds = new Set(protection.protectedSeats.map((s) => s.id));
    const message = [
      "Reset layout?",
      "",
      `This clears ${seats.length - keptIds.size} seat(s)${
        venueObjects.length && keptIds.size === 0 ? ` and ${venueObjects.length} venue object(s)` : ""
      } from the workspace and returns it to an empty layout.`,
      ...(keptIds.size > 0
        ? ["", `${keptIds.size} sold/assigned seat(s) are protected and will be kept.`]
        : []),
      "",
      "Nothing is deleted until you save.",
    ].join("\n");
    if (!window.confirm(message)) return;
    setSeats((prev) => prev.filter((s) => keptIds.has(s.id)));
    if (keptIds.size === 0) {
      setVenueObjects([]);
      setSections([]);
    }
    setSelectedSeatIds(new Set());
    setSelectedObjectId(null);
    setIsInspectorOpen(false);
    setHasUnsavedChanges(true);
    onToast(
      "success",
      keptIds.size > 0
        ? `Workspace cleared. ${keptIds.size} protected seat(s) kept — save to apply.`
        : "Workspace cleared. Save to apply the empty layout."
    );
  }, [seats, venueObjects.length, onToast]);

  const handleSaveLayout = useCallback(async () => {
    setIsSaving(true);
    try {
      const currentIds = new Set(seats.map((s) => s.id));
      const deleteIds = [...lastSavedIdsRef.current].filter(
        (id) => isPersistedSeatId(id) && !currentIds.has(id)
      );
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
          deleteIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save layout.");
      }

      // Adopt database truth: drops client temp ids, so the next save sends
      // updates for these rows instead of re-inserting them as duplicates.
      if (Array.isArray(data.savedSeats)) {
        const fresh = data.savedSeats as SeatGeometry[];
        setSeats(fresh);
        lastSavedIdsRef.current = new Set(fresh.map((s) => s.id));
        setSelectedSeatIds(new Set());
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

  // ── POINTER / DRAG INTERACTIONS ──────────────────────────────────────────
  // Stage 1 mobile treatment: mouse handlers migrated 1:1 to Pointer Events so
  // mouse, touch and pen share one code path. No behavior change for mouse:
  // e.clientX/clientY/shiftKey/target are identical; onPointerLeave matches
  // onMouseLeave semantics; onPointerCancel is additive safety (touch
  // interruptions) and never fires for mouse. Double-click stays onDoubleClick.

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    // If user clicked inside the properties inspector overlay, do not interfere
    if ((e.target as HTMLElement).closest(".properties-inspector-overlay")) {
      return;
    }

    const target = e.target as SVGElement;
    const directSeatId = target.getAttribute("data-seat-id");
    const objId = target.getAttribute("data-object-id");

    // Touch forgiveness: finger taps are imprecise, so a touch/pen contact
    // that lands on empty canvas near a seat resolves to that seat (taps
    // select and drags grab instead of missing). Mouse keeps exact
    // hit-testing, so desktop behavior is unchanged.
    let seatId: string | null = directSeatId;
    if (!seatId && !objId && e.pointerType !== "mouse") {
      seatId = nearestSeatToPoint(e.clientX, e.clientY);
    }

    // Track every contact point so a second finger can start pinch-zoom.
    activePointers.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      target: seatId ? "seat" : objId ? "object" : "empty",
    });
    gestureActive.current = false;

    // Second concurrent pointer => pinch-zoom + midpoint pan. Any in-progress
    // seat drag or canvas pan is suppressed for the pinch duration.
    if (activePointers.current.size === 2) {
      const pts = [...activePointers.current.values()];
      pinch.current = {
        startDist:
          Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        startMidX: (pts[0].x + pts[1].x) / 2,
        startMidY: (pts[0].y + pts[1].y) / 2,
        startScale: scale,
        startPan: { ...pan },
      };
      isDragging.current = false;
      isPanning.current = false;
      return;
    }
    if (activePointers.current.size > 2) return; // ignore 3rd+ finger

    if (seatId) {
      // Seat Clicked -> select only (do NOT open inspector on single click)
      setSelectedObjectId(null);
      if (e.shiftKey || multiSelectMode) {
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
    if (!e.shiftKey && !multiSelectMode) {
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

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    const tracked = activePointers.current.get(e.pointerId);
    if (tracked) {
      tracked.x = e.clientX;
      tracked.y = e.clientY;
    }

    // Pinch-zoom + midpoint pan takes precedence while two contacts are down.
    // This path is touch-only; the wheel handler never fires for touch input,
    // so zoom can never double-apply.
    if (pinch.current && activePointers.current.size >= 2) {
      const pts = [...activePointers.current.values()].slice(0, 2);
      const dist =
        Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const p = pinch.current;
      setScale(
        Math.min(
          2.5,
          Math.max(0.4, Number((p.startScale * (dist / p.startDist)).toFixed(2)))
        )
      );
      setPan({
        x: p.startPan.x + (midX - p.startMidX),
        y: p.startPan.y + (midY - p.startMidY),
      });
      return;
    }

    if (isPanning.current) {
      // Tap-slop: ignore sub-threshold jitter so taps never dirty the layout.
      // lastPan still holds the down-origin until the slop passes.
      if (!gestureActive.current) {
        if (
          Math.hypot(
            e.clientX - lastPan.current.x,
            e.clientY - lastPan.current.y
          ) < TAP_SLOP_PX
        ) {
          return;
        }
        gestureActive.current = true;
      }
      // Capture deltas into locals BEFORE setPan: the updater below may run
      // deferred (pointermove is a continuous event), at which point
      // lastPan.current has already been overwritten — reading the ref inside
      // the updater silently drops fast-pan distance (pre-existing race).
      const dx = e.clientX - lastPan.current.x;
      const dy = e.clientY - lastPan.current.y;
      lastPan.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({
        x: p.x + dx,
        y: p.y + dy,
      }));
      return;
    }

    if (!isDragging.current) return;

    // Tap-slop gate for seat/object drags (dragStart is the down-origin).
    if (!gestureActive.current) {
      if (
        Math.hypot(
          e.clientX - dragStart.current.x,
          e.clientY - dragStart.current.y
        ) < TAP_SLOP_PX
      ) {
        return;
      }
      gestureActive.current = true;
    }

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

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    // Pinch ending with one finger still down: reset origins so the remaining
    // contact cannot jump content. Pan resumes only if that contact started
    // on empty canvas; a seat/object drag always requires lift + re-touch.
    if (pinch.current) {
      if (activePointers.current.size === 1) {
        const [, pt] = [...activePointers.current.entries()][0];
        lastPan.current = { x: pt.x, y: pt.y };
        dragStart.current = { x: pt.x, y: pt.y };
        isPanning.current = pt.target === "empty";
        isDragging.current = false;
        gestureActive.current = false;
      } else {
        isDragging.current = false;
        isPanning.current = false;
        gestureActive.current = false;
      }
      if (activePointers.current.size < 2) pinch.current = null;
      return;
    }
    isDragging.current = false;
    isPanning.current = false;
    gestureActive.current = false;
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
  // rows / seatsPerRow are `number | ""`: clearing a number input yields "",
  // and storing NaN (parseInt("") === NaN) would feed NaN into the input's
  // `value` prop on the next render. Generation uses `Number(...) || <default>`
  // so "" safely falls back there; the input renders empty while editing.
  const [sectionForm, setSectionForm] = useState<{
    name: string;
    rows: number | "";
    seatsPerRow: number | "";
    startX: number;
    startY: number;
    defaultPrice: string;
    ticketTypeId: string;
    isVip: boolean;
    isAccessible: boolean;
  }>({
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
    const sectionName = sectionForm.name || "General";
    // Append semantics: continue row labels (and vertical origin) past the
    // rows this section already has on the canvas. Regenerating from row A
    // would collide with persisted rows under the seats uniqueness
    // constraint and fail the next save with a duplicate error.
    const sectionSeats = seats.filter((s) => s.section === sectionName);
    const startRowIndex = nextRowStartIndex(sectionSeats, sectionName);
    const bottom = sectionBottomEdge(sectionSeats);
    const planResult = generateCanonicalSeatingPlan({
      eventId,
      layoutId: layout.id,
      sections: [
        {
          name: sectionName,
          mode: "rows",
          rowCount: Number(sectionForm.rows) || 1,
          seatsPerRow: Number(sectionForm.seatsPerRow) || 1,
          startX: Number(sectionForm.startX) || 80,
          startY: bottom === null ? Number(sectionForm.startY) || 150 : bottom + 12,
          startRowIndex,
          defaultPrice: sectionForm.defaultPrice ? parseFloat(sectionForm.defaultPrice) : null,
          ticketTypeId: sectionForm.ticketTypeId || null,
          isVip: sectionForm.isVip,
          isAccessible: sectionForm.isAccessible,
        },
      ],
    });

    const newSeats: SeatGeometry[] = planResult.seats.map((s, idx) => ({
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
  // capacity is `number | ""` for the same reason as sectionForm.rows above:
  // an emptied number input must never put NaN into state.
  const [tableForm, setTableForm] = useState<{
    tableNumber: string;
    tableName: string;
    capacity: number | "";
    shape: "round" | "rect";
    startX: number;
    startY: number;
    isVip: boolean;
    priceOverride: string;
  }>({
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
    const planResult = generateCanonicalSeatingPlan({
      eventId,
      layoutId: layout.id,
      sections: [
        {
          name: `Table ${tableForm.tableNumber}`,
          mode: "tables",
          tableCount: 1,
          seatsPerTable: Number(tableForm.capacity) || 6,
          tableShape: tableForm.shape,
          startTableNumber: parseInt(tableForm.tableNumber, 10) || 1,
          tableNamePrefix: tableForm.tableName || undefined,
          startX: Number(tableForm.startX) || 150,
          startY: Number(tableForm.startY) || 150,
          isVip: tableForm.isVip,
          defaultPrice: tableForm.priceOverride ? parseFloat(tableForm.priceOverride) : null,
        },
      ],
    });

    const newSeats: SeatGeometry[] = planResult.seats.map((s, idx) => ({
      ...s,
      id: `new-table-${Date.now()}-${idx}`,
    }));

    // Add table visual shape object
    const tableObject: VenueObject = planResult.venueObjects[0] || {
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

  // Max canvas-px distance from a touch/pen contact to a seat center for
  // touch forgiveness (about half a seat pitch at 1:1).
  const TOUCH_SEAT_REACH = 24;

  // Nearest seat center to a client point, or null when nothing is in reach.
  const nearestSeatToPoint = (
    clientX: number,
    clientY: number
  ): string | null => {
    const svg = canvasRef.current?.querySelector("svg");
    if (!svg || scale === 0) return null;
    const r = svg.getBoundingClientRect();
    const cx = (clientX - r.left) / scale;
    const cy = (clientY - r.top) / scale;
    let best: string | null = null;
    let bestD = TOUCH_SEAT_REACH;
    seats.forEach((s) => {
      const d = Math.hypot(
        s.x + (s.width || 26) / 2 - cx,
        s.y + (s.height || 26) / 2 - cy
      );
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    });
    return best;
  };

  // Fit the whole content bounds into view. Read-only w.r.t. layout data;
  // only sets view scale/pan. Used for narrow-screen initial framing and the
  // mobile "Fit to bounds" menu action.
  const fitViewToContent = () => {
    const el = canvasRef.current;
    if (!el) return;
    const pad = 24;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    seats.forEach((s) => {
      const w = s.width || 26;
      const h = s.height || 26;
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + w);
      maxY = Math.max(maxY, s.y + h);
    });
    venueObjects.forEach((o) => {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.width);
      maxY = Math.max(maxY, o.y + o.height);
    });
    if (!isFinite(minX)) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const bw = Math.max(maxX - minX + pad * 2, 100);
    const bh = Math.max(maxY - minY + pad * 2, 100);
    const sc = Math.min(
      1.5,
      Math.max(0.25, Math.min(el.clientWidth / bw, el.clientHeight / bh))
    );
    const nextScale = Number(sc.toFixed(2));
    setScale(nextScale);
    setPan({
      x: (el.clientWidth - bw * nextScale) / 2 - (minX - pad) * nextScale,
      y: (el.clientHeight - bh * nextScale) / 2 - (minY - pad) * nextScale,
    });
  };

  // Narrow screens start fitted so labels/content are reachable, not cut off.
  // Desktop keeps the legacy 1:1 top-left framing untouched.
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current) return;
    didInitialFit.current = true;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      fitViewToContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inspector body shared verbatim by the desktop floating overlay and the
  // mobile drawer (Stage 2). Moved as-is; both hosts render the same JSX.
  const renderInspectorBody = () => (
    <>
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
    </>
  );

  // Subtitle for the mobile drawer header.
  const inspectorSubtitle =
    singleSelectedSeat
      ? singleSelectedSeat.table_number
        ? `Table ${singleSelectedSeat.table_number}, Seat ${singleSelectedSeat.seat_number}`
        : `${singleSelectedSeat.section}, Row ${singleSelectedSeat.row_label}, Seat ${singleSelectedSeat.seat_number}`
      : selectedSeatIds.size > 1
        ? `${selectedSeatIds.size} seats selected`
        : singleSelectedObject
          ? singleSelectedObject.name
          : "";

  return (
    <div className="space-y-3 select-none pb-20 md:pb-0">
      {/* ── UNIFIED FLAT WORKSPACE CONTAINER ──────────────────────────────────
          Open workspace: no decorative card. The toolbar keeps its divider,
          the canvas keeps its functional pan/zoom surface. */}
      <div className="flex flex-col overflow-hidden">
        {/* ── TOP UNIFIED TOOLBAR (Fixed Height, No Wrap to prevent shaking) ──── */}
        {/* Below md the labels collapse to icons (labels move to Tooltips);
            secondary actions collapse into the More menu. Desktop unchanged. */}
        <TooltipProvider delayDuration={200}>
        <div className="flex h-14 min-h-[56px] items-center justify-between gap-2 md:gap-3 border-b border-zinc-200 bg-white px-2 md:px-4 overflow-x-auto">
          {/* Left tools palette */}
          <div className="flex flex-nowrap items-center gap-1 md:gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowSectionModal(true)}
                  aria-label="Add Section & Rows"
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-2 py-2 md:px-3 md:py-1.5 text-xs font-black text-white hover:bg-violet-700 transition-all shadow-2xs shrink-0"
                >
                  <Grid size={13} />
                  <span className="hidden md:inline">Add Section & Rows</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Section & Rows</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    // Refresh the default to the next free table number so a new
                    // table doesn't regenerate Table-1 seat keys (which would
                    // collide under the seats uniqueness constraint on save).
                    // The input stays editable for explicit numbering.
                    setTableForm((f) => ({ ...f, tableNumber: nextTableNumber(seats, venueObjects) }));
                    setShowTableModal(true);
                  }}
                  aria-label="Add Table"
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 md:px-3 md:py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
                >
                  <TableIcon size={13} />
                  <span className="hidden md:inline">Add Table</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Table</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleAddStage}
                  aria-label="Add Stage"
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 md:px-3 md:py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
                >
                  <Layers size={13} />
                  <span className="hidden md:inline">Add Stage</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Stage</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleAddGA}
                  aria-label="Add GA Zone"
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 md:px-3 md:py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
                >
                  <Users size={13} />
                  <span className="hidden md:inline">Add GA Zone</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add GA Zone</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleAddLabel}
                  aria-label="Add Label"
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 md:px-3 md:py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
                >
                  <Type size={13} />
                  <span className="hidden md:inline">Add Label</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Label</TooltipContent>
            </Tooltip>

            {/* Selection quick actions */}
            {(selectedSeatIds.size > 0 || selectedObjectId) && (
              <div className="ml-2 flex items-center gap-1 border-l border-zinc-200 pl-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsInspectorOpen(true)}
                  title="Open Inspector"
                  aria-label="Open Inspector"
                  className="mr-1 rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800 cursor-pointer hover:bg-violet-200 transition-colors"
                >
                  {selectedSeatIds.size > 0
                    ? `${selectedSeatIds.size} seat${selectedSeatIds.size > 1 ? "s" : ""}`
                    : "Object"}
                </button>
                <button
                  type="button"
                  onClick={handleRotateSelected}
                  title="Rotate 45°"
                  className="rounded-lg border border-zinc-200 bg-white p-2 md:p-1.5 text-zinc-600 hover:bg-zinc-50 max-md:hidden"
                >
                  <RotateCw size={13} />
                </button>
                {selectedSeatIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDuplicateSelected}
                    title="Duplicate"
                    className="rounded-lg border border-zinc-200 bg-white p-2 md:p-1.5 text-zinc-600 hover:bg-zinc-50 max-md:hidden"
                  >
                    <Copy size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  title="Delete"
                  className="rounded-lg border border-red-200 bg-red-50 p-2 md:p-1.5 text-red-600 hover:bg-red-100 max-md:hidden"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Right action controls */}
          <div className="flex flex-nowrap items-center gap-1.5 md:gap-2 shrink-0">
            {/* Viewport controls (desktop only; mobile uses pinch + More menu) */}
            <div className="hidden md:flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
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
              aria-pressed={snapToGrid}
              className={`rounded-xl border px-2 md:px-2.5 py-2 md:py-1.5 text-xs font-bold transition-all ${
                snapToGrid
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-zinc-200 bg-white text-zinc-400"
              }`}
            >
              Snap
            </button>

            {/* Multi-select mode toggle (touch equivalent of Shift+click) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setMultiSelectMode((m) => !m)}
                  aria-label="Multi-select mode"
                  aria-pressed={multiSelectMode}
                  className={`rounded-xl border p-2 md:p-2 transition-all ${
                    multiSelectMode
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-zinc-200 bg-white text-zinc-400"
                  }`}
                >
                  <ListChecks size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Multi-select mode</TooltipContent>
            </Tooltip>

            {/* More overflow menu (below md): selection actions when present,
                view actions, and Reset. Radix closes on outside press; the
                press still reaches the canvas so gestures are never swallowed. */}
            <div className="md:hidden shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More actions"
                    className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-zinc-700"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  {(selectedSeatIds.size > 0 || selectedObjectId) && (
                    <>
                      <DropdownMenuItem onSelect={() => setIsInspectorOpen(true)} className="py-2.5">
                        <PanelRight size={15} className="mr-2" />
                        Open Inspector
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={handleRotateSelected} className="py-2.5">
                        <RotateCw size={15} className="mr-2" />
                        Rotate 45°
                      </DropdownMenuItem>
                      {selectedSeatIds.size > 0 && (
                        <DropdownMenuItem onSelect={handleDuplicateSelected} className="py-2.5">
                          <Copy size={15} className="mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={handleDeleteSelected} className="py-2.5 text-red-600 focus:text-red-700">
                        <Trash2 size={15} className="mr-2" />
                        Delete
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onSelect={() => setScale((s) => Math.min(2.5, Number((s + 0.2).toFixed(2))))}
                    className="py-2.5"
                  >
                    <ZoomIn size={15} className="mr-2" />
                    Zoom In
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setScale((s) => Math.max(0.4, Number((s - 0.2).toFixed(2))))}
                    className="py-2.5"
                  >
                    <ZoomOut size={15} className="mr-2" />
                    Zoom Out
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setScale(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="py-2.5"
                  >
                    <RotateCcw size={15} className="mr-2" />
                    Reset View
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={fitViewToContent} className="py-2.5">
                    <Maximize2 size={15} className="mr-2" />
                    Fit to bounds
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={handleResetLayout}
                    disabled={isSaving || (seats.length === 0 && venueObjects.length === 0)}
                    className="py-2.5 text-red-600 focus:text-red-700"
                  >
                    <Trash2 size={15} className="mr-2" />
                    Reset layout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Publish / Draft toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleTogglePublish}
                  aria-label={isPublished ? "Published (tap to unpublish)" : "Draft (tap to publish)"}
                  className={`flex items-center gap-1.5 rounded-xl border px-2 py-2 md:px-3 md:py-1.5 text-xs font-black transition-all ${
                    isPublished
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  {isPublished ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span className="hidden md:inline">{isPublished ? "Published" : "Draft"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isPublished ? "Published (tap to unpublish)" : "Draft (tap to publish)"}
              </TooltipContent>
            </Tooltip>

            {/* Reset Layout (desktop only; mobile uses the More menu) */}
            <button
              type="button"
              onClick={handleResetLayout}
              disabled={isSaving || (seats.length === 0 && venueObjects.length === 0)}
              title="Reset layout"
              aria-label="Reset layout"
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 max-md:hidden"
            >
              <Trash2 size={13} />
              Reset
            </button>

            {/* Save Button (always visible; short label below md) */}
            <button
              type="button"
              onClick={handleSaveLayout}
              disabled={isSaving}
              aria-label="Save layout"
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 md:px-4 md:py-1.5 text-xs font-black text-white transition-all shadow-xs ${
                hasUnsavedChanges
                  ? "bg-emerald-600 hover:bg-emerald-700 animate-pulse"
                  : "bg-zinc-900 hover:bg-zinc-800"
              }`}
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span className="md:hidden">{hasUnsavedChanges ? "Save" : "Saved"}</span>
              <span className="hidden md:inline">{hasUnsavedChanges ? "Save Changes *" : "Saved"}</span>
            </button>
          </div>
        </div>
        </TooltipProvider>

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
          <div className="ml-auto text-[11px] text-zinc-400 shrink-0 hidden md:block">
            Double-click object for Inspector · Drag to pan · Scroll to pan / Ctrl+Scroll to zoom
          </div>
        </div>

        {/* ── WORKSPACE BODY: FULL-WIDTH INTERNAL SCROLLING/PANNING VIEWPORT ── */}
        {/* Below md the min-height relaxes (no forced page scroll) and the
            pane gets an explicit rounded border so the touch-no-scroll canvas
            region reads as its own bounded surface, never a stuck page. */}
        <div className="relative w-full min-h-[420px] md:min-h-[640px] h-[calc(100vh-250px)] overflow-hidden max-md:rounded-2xl max-md:border max-md:border-zinc-300">
          {/* Save lock: blocks canvas/inspector edits while a save is in
              flight, so the post-save server-truth adoption below can never
              discard mid-save edits. Above the inspector (z-30), below the
              modals (z-50). */}
          {isSaving && (
            <div className="absolute inset-0 z-40 cursor-wait bg-white/20" aria-hidden />
          )}
          {/* Primary Plain SVG Canvas Viewport */}
          <div
            ref={canvasRef}
            className="relative h-full w-full overflow-hidden bg-zinc-100/80 cursor-crosshair select-none overscroll-contain touch-none"
            style={{ overscrollBehavior: "contain", touchAction: "none" }}
            onPointerDown={handleCanvasPointerDown}
            onDoubleClick={handleCanvasDoubleClick}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
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

            {/* Mobile gesture hint (below md): decorative only, never intercepts
                gestures (pointer-events-none). Replaces the desktop stats hint. */}
            <div className="md:hidden pointer-events-none absolute bottom-2 left-2 z-20 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-500 shadow-xs border border-zinc-200/60 backdrop-blur-xs">
              Drag seats to move · Pinch to zoom
            </div>
          </div>

          {/* ── PROPERTIES INSPECTOR: FLOATING OVERLAY PANEL (Double-click only) ── */}
          {shouldShowInspector && (
            <div
              className="properties-inspector-overlay absolute top-3 right-3 bottom-3 z-30 w-84 max-w-[calc(100%-24px)] rounded-2xl border border-zinc-200/90 bg-white/95 backdrop-blur-md shadow-2xl p-4 overflow-y-auto space-y-4 animate-in fade-in slide-in-from-right-3 duration-150 max-md:hidden"
              onPointerDown={(e) => e.stopPropagation()}
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

              {/* Inspector body shared by the desktop overlay and the mobile drawer */}
              {renderInspectorBody()}
              {/* Cases A/B/C live in renderInspectorBody above */}
            </div>
          )}

          {/* ── Mobile inspector drawer (below md): same body, slide-over with
              scroll-lock + Esc + scrim close, large close targets. The Done
              action lives at the end of the scrollable body (not the fixed
              footer slot): touch taps on the footer-slot button intermittently
              failed to dispatch after drawer-content re-renders, while
              body/hosted buttons dispatch reliably. ── */}
          {shouldShowInspector && (
            <div className="md:hidden">
              <AdminDrawer
                open={isInspectorOpen}
                onClose={handleCloseInspector}
                title="Properties Inspector"
                subtitle={inspectorSubtitle}
                width="md"
              >
                {renderInspectorBody()}
                <button
                  type="button"
                  onClick={handleCloseInspector}
                  className="mt-4 w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-black text-white transition-colors"
                >
                  Done
                </button>
              </AdminDrawer>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile bottom save bar (below md): mirrors the design-tab pattern
          so Save + dirty state stay thumb-reachable. Same handler/state.
          z-40 paints above the dashboard shell's own mobile bottom nav
          (same footprint, earlier in DOM); modals/toast/drawer are z-50.
          Rendered only while dirty or selecting so the dashboard nav stays
          usable the rest of the time. ── */}
      {(hasUnsavedChanges || selectedSeatIds.size > 0 || selectedObjectId) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-md p-3 shadow-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-zinc-900">
                {hasUnsavedChanges ? "Unsaved changes" : "All saved"}
                {selectedSeatIds.size > 0 &&
                  ` · ${selectedSeatIds.size} seat${selectedSeatIds.size > 1 ? "s" : ""} selected`}
                {selectedObjectId && " · Object selected"}
              </p>
              <p className="text-[11px] font-semibold text-zinc-500">
                {isPublished ? "Published" : "Draft"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveLayout}
              disabled={isSaving}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black text-white transition-all shadow-md shrink-0 ${
                hasUnsavedChanges
                  ? "bg-emerald-600"
                  : "bg-zinc-900 disabled:opacity-100"
              }`}
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save
            </button>
          </div>
        </div>
      )}

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
                    onChange={(e) => setSectionForm((f) => ({ ...f, rows: parseCountInput(e.target.value) }))}
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
                    onChange={(e) => setSectionForm((f) => ({ ...f, seatsPerRow: parseCountInput(e.target.value) }))}
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
                disabled={isSaving}
                className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50"
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
                    onChange={(e) => setTableForm((f) => ({ ...f, capacity: parseCountInput(e.target.value) }))}
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
