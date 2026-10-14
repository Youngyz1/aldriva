"use client"

import * as React from "react"

/**
 * VENUE SEAT PICKER 3D
 *
 * Attendee-facing seat selection for events. Renders rows of seats, round and
 * rectangular tables with chairs, raised stages and general-admission zones on a
 * single canvas, with a smooth 2D <-> 3D morph.
 *
 * - Zero dependencies beyond React and Tailwind. Light/dark aware.
 * - Canvas painter's-algorithm renderer: handles several thousand seats.
 * - Click / tap seats to select. Sold and reserved seats are locked.
 * - Orbit (drag), pan (right-drag / shift-drag / 2D drag), pinch zoom, +/- buttons,
 *   Ctrl/Cmd + wheel zoom, double-click to reset.
 * - Keyboard: arrows move between seats, Enter/Space selects, +/- zoom, Esc clears.
 * - Live availability: pass a fresh `venue` (memoized) when seat statuses change and
 *   any selected seat that was taken is dropped with a notice.
 *
 * Coordinates are in your builder's units (x right, y down; the stage is usually at
 * the smaller y). Every x/y is the CENTER of the object.
 */

// #region Types
export type SeatStatus = "available" | "reserved" | "sold"
export type SeatCategory = "standard" | "vip" | "accessible"
export type ViewMode = "2d" | "3d"

export interface VenueSeat {
  id: string
  x: number
  y: number
  /** Shown in the tooltip, e.g. "Row C · Seat 7" or "Gold 1 · Seat 3" */
  label: string
  /** Shown inside the seat when zoomed in. Defaults to `label`. */
  number?: string | number
  status: SeatStatus
  /**
   * Overrides the status word in the tooltip (e.g. "Held for a guest").
   * Display-only: selection gating still uses `status`.
   */
  statusLabel?: string
  category?: SeatCategory
  price?: number
  tableId?: string
}

export interface VenueTable {
  id: string
  x: number
  y: number
  label: string
  /** Physical chair count (organizer's table capacity). Shown in the table tooltip. */
  capacity?: number
  /** Round table when provided */
  radius?: number
  /** Rectangular table when `radius` is omitted */
  width?: number
  height?: number
}

export interface VenueStage {
  id?: string
  x: number
  y: number
  width: number
  height: number
  label?: string
  /** Visual height in 3D. Defaults to a platform height. */
  elevation?: number
}

export interface VenueGaZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  price?: number
  capacity: number
  available: number
  /**
   * Read-only zone: renders the label only, with no quantity stepper and no
   * GA cart line. The attendee adapter always sets this until the P4 GA
   * sales-counter migration exists (there is no decrement source today).
   */
  readOnly?: boolean
}

export interface VenueLabel {
  x: number
  y: number
  text: string
}

export interface VenuePlan {
  seats: VenueSeat[]
  tables?: VenueTable[]
  stages?: VenueStage[]
  gaZones?: VenueGaZone[]
  labels?: VenueLabel[]
}

export interface GaSelection {
  zoneId: string
  label: string
  quantity: number
  unitPrice: number
}

export interface SeatOrder {
  seats: VenueSeat[]
  ga: GaSelection[]
  total: number
}

export interface VenueSeatPicker3DProps {
  /** Your saved venue plan. Memoize it: a new object triggers a rebuild. */
  venue?: VenuePlan
  /**
   * Render built-in sample data when `venue` is omitted. Default false.
   * Production must always pass a real plan (or not mount the picker and
   * use the tickets-only flow) — never rely on the sample venue.
   */
  demo?: boolean
  title?: React.ReactNode
  /** ISO 4217 code used for prices. Default "USD" (use "XOF" for CFA francs). */
  currency?: string
  locale?: string
  /** Max seats one person can hold at once. Default 8. */
  maxSeats?: number
  /** Seat radius in venue units. Default 9. */
  seatRadius?: number
  /** Controlled selection (seat ids). */
  selectedIds?: string[]
  defaultSelectedIds?: string[]
  onSelectionChange?: (seats: VenueSeat[]) => void
  onCheckout?: (order: SeatOrder) => void
  view?: ViewMode
  defaultView?: ViewMode
  onViewChange?: (view: ViewMode) => void
  /** Zoom with the plain mouse wheel (otherwise Ctrl/Cmd + wheel). Default false. */
  scrollZoom?: boolean
  showCart?: boolean
  className?: string
}
// #endregion

// #region Math
type RGB = [number, number, number]
type Palette = Record<string, RGB>

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (x: number) => {
  const t = clamp(x, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const rgb = (c: RGB, k = 1) =>
  `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`
const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

const YAW_MAX = (75 * Math.PI) / 180
const ELEV_DEFAULT = (42 * Math.PI) / 180
const ELEV_MIN = (18 * Math.PI) / 180
const ELEV_MAX = (86 * Math.PI) / 180

interface Cam {
  cs: number
  sn: number
  se: number
  ce: number
}
const camera = (e: number, yaw: number, elev: number): Cam => {
  const y = yaw * e
  const el = lerp(Math.PI / 2, elev, e)
  return { cs: Math.cos(y), sn: Math.sin(y), se: Math.sin(el), ce: Math.cos(el) }
}
const project = (c: Cam, x: number, y: number, z: number): [number, number] => [
  x * c.cs - y * c.sn,
  (x * c.sn + y * c.cs) * c.se - z * c.ce,
]

const inEllipse = (px: number, py: number, cx: number, cy: number, rx: number, ry: number) => {
  const dx = (px - cx) / Math.max(rx, 0.5)
  const dy = (py - cy) / Math.max(ry, 0.5)
  return dx * dx + dy * dy <= 1
}
const inPoly = (q: number[], x: number, y: number) => {
  let sign = 0
  for (let k = 0; k < 4; k++) {
    const ax = q[k * 2]
    const ay = q[k * 2 + 1]
    const bx = q[((k + 1) % 4) * 2]
    const by = q[((k + 1) % 4) * 2 + 1]
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    if (Math.abs(cross) < 1e-9) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return sign !== 0
}
// #endregion

// #region Palette
const PALETTE: Record<"light" | "dark", Palette> = {
  light: {
    floor: [247, 248, 252],
    floorEdge: [203, 213, 225],
    text: [30, 41, 59],
    muted: [100, 116, 139],
    avail: [99, 102, 241],
    vip: [245, 158, 11],
    acc: [13, 148, 136],
    selected: [16, 185, 129],
    reserved: [148, 163, 184],
    sold: [214, 220, 229],
    hover: [15, 23, 42],
    tableTop: [224, 231, 255],
    tableLine: [99, 102, 241],
    stageTop: [51, 65, 85],
    stageText: [255, 255, 255],
    ga: [99, 102, 241],
  },
  dark: {
    floor: [24, 24, 27],
    floorEdge: [63, 63, 70],
    text: [228, 228, 231],
    muted: [161, 161, 170],
    avail: [129, 140, 248],
    vip: [251, 191, 36],
    acc: [45, 212, 191],
    selected: [52, 211, 153],
    reserved: [113, 113, 122],
    sold: [48, 48, 54],
    hover: [255, 255, 255],
    tableTop: [49, 46, 129],
    tableLine: [165, 180, 252],
    stageTop: [82, 82, 91],
    stageText: [250, 250, 250],
    ga: [129, 140, 248],
  },
}

type LegendKey = "standard" | "vip" | "accessible" | "selected" | "reserved" | "sold"
const LEGEND: { key: LegendKey; label: string; color: string }[] = [
  { key: "standard", label: "Standard", color: "avail" },
  { key: "vip", label: "VIP", color: "vip" },
  { key: "accessible", label: "Accessible", color: "acc" },
  { key: "selected", label: "Your seats", color: "selected" },
  { key: "reserved", label: "Reserved", color: "reserved" },
  { key: "sold", label: "Sold", color: "sold" },
]
const CATEGORY_NAME: Record<SeatCategory, string> = {
  standard: "Standard",
  vip: "VIP",
  accessible: "Accessible",
}
// #endregion

// #region Sample data (mirrors a 100-seat block + 5 round tables of 5)
const mulberry = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createSampleVenue(): VenuePlan {
  const rnd = mulberry(7)
  const seats: VenueSeat[] = []
  const tables: VenueTable[] = []
  const rows = "ABCDEFGHIJ"
  const gap = 28
  const x0 = 375 - (9 * gap) / 2
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const roll = rnd()
      const vip = r < 2
      seats.push({
        id: `blk-${r}-${c}`,
        x: x0 + c * gap,
        y: 150 + r * gap,
        label: `Row ${rows[r]} · Seat ${c + 1}`,
        number: c + 1,
        status: roll < 0.18 ? "sold" : roll < 0.24 ? "reserved" : "available",
        category: r === 9 && (c === 0 || c === 9) ? "accessible" : vip ? "vip" : "standard",
        price: vip ? 50 : 25,
      })
    }
  }
  for (let i = 0; i < 5; i++) {
    const cx = 95 + i * 140
    const cy = 500
    const id = `gold-${i + 1}`
    tables.push({ id, x: cx, y: cy, radius: 34, label: `Gold ${i + 1}` })
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2
      const roll = rnd()
      seats.push({
        id: `${id}-${k}`,
        x: cx + Math.cos(a) * 54,
        y: cy + Math.sin(a) * 54,
        label: `Gold ${i + 1} · Seat ${k + 1}`,
        number: k + 1,
        status: roll < 0.2 ? "sold" : "available",
        category: "vip",
        price: 80,
        tableId: id,
      })
    }
  }
  return {
    seats,
    tables,
    stages: [{ x: 375, y: 55, width: 460, height: 80, label: "Stage" }],
    labels: [{ x: 375, y: 430, text: "Dinner tables" }],
  }
}
// #endregion

// Empty plan used when no venue is passed and demo mode is off.
// Stable reference so the rebuild memo does not churn.
const EMPTY_VENUE: VenuePlan = { seats: [] }

// #region Icons
const Icon = ({ d, children }: { d?: string; children?: React.ReactNode }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {d ? <path d={d} /> : children}
  </svg>
)
const GridIcon = () => (
  <Icon>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </Icon>
)
const CubeIcon = () => (
  <Icon>
    <path d="M8 1.5 14 4.7v6.6L8 14.5 2 11.3V4.7Z" />
    <path d="M2 4.7 8 8l6-3.3M8 8v6.5" />
  </Icon>
)
// #endregion

// #region Engine item
interface Item {
  kind: 0 | 1 | 2 // seat | round table | box (stage, ga zone, rect table)
  sub: 0 | 1 | 2 // box type: stage | ga | rect table
  id: string
  x: number
  y: number
  r: number
  hw: number
  hd: number
  h: number
  label: string
  seat: VenueSeat | null
  ref: number
  hov: number
  sel: number
  dep: number
  vis: boolean
  sx: number
  sy: number
  sy2: number
  rx: number
  ry: number
  quad: number[]
}
// #endregion

export function VenueSeatPicker3D({
  venue: venueProp,
  demo = false,
  title = "Pick your seats",
  currency = "USD",
  locale,
  maxSeats = 8,
  seatRadius = 9,
  selectedIds: controlledIds,
  defaultSelectedIds = [],
  onSelectionChange,
  onCheckout,
  view: controlledView,
  defaultView = "3d",
  onViewChange,
  scrollZoom = false,
  showCart = true,
  className = "",
}: VenueSeatPicker3DProps) {
  // Empty plan: with no venue and no demo flag the picker renders nothing
  // selectable. Production uses the tickets-only flow instead of mounting.
  const venue = React.useMemo(
    () => venueProp ?? (demo ? createSampleVenue() : EMPTY_VENUE),
    [venueProp, demo]
  )
  const seatById = React.useMemo(() => new Map(venue.seats.map((s) => [s.id, s])), [venue])

  const [internalView, setInternalView] = React.useState<ViewMode>(defaultView)
  const view = controlledView ?? internalView
  const setView = (v: ViewMode) => {
    if (controlledView === undefined) setInternalView(v)
    onViewChange?.(v)
  }

  const [internalIds, setInternalIds] = React.useState<string[]>(defaultSelectedIds)
  const selectedIds = controlledIds ?? internalIds
  const [ga, setGa] = React.useState<Record<string, number>>({})
  const [filter, setFilter] = React.useState<LegendKey | null>(null)
  const [isDark, setIsDark] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const [announce, setAnnounce] = React.useState("")

  const fmt = React.useMemo(() => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency })
    } catch {
      return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" })
    }
  }, [locale, currency])

  const setSelection = (ids: string[]) => {
    if (controlledIds === undefined) setInternalIds(ids)
    onSelectionChange?.(ids.map((id) => seatById.get(id)).filter((s): s is VenueSeat => !!s))
  }

  const toggleSeat = (id: string) => {
    const seat = seatById.get(id)
    if (!seat) return
    if (selectedIds.includes(id)) {
      setSelection(selectedIds.filter((x) => x !== id))
      setNotice("")
      setAnnounce(`${seat.label} removed`)
      return
    }
    if (seat.status !== "available") {
      setAnnounce(`${seat.label} is ${seat.status}`)
      return
    }
    if (selectedIds.length >= maxSeats) {
      setNotice(`You can hold up to ${maxSeats} seats per order.`)
      return
    }
    setNotice("")
    setSelection([...selectedIds, id])
    setAnnounce(`${seat.label} selected`)
  }

  // Drop selected seats that someone else just took.
  React.useEffect(() => {
    const gone = selectedIds.filter((id) => seatById.get(id)?.status !== "available")
    if (!gone.length) return
    setSelection(selectedIds.filter((id) => !gone.includes(id)))
    setNotice(gone.length === 1 ? "A seat you picked was just taken and was removed." : "Some seats you picked were just taken and were removed.")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatById])

  // Theme detection (Tailwind `.dark`, data-theme, or system).
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const read = () => {
      const d = document.documentElement
      if (d.classList.contains("dark") || d.getAttribute("data-theme") === "dark") return setIsDark(true)
      if (d.classList.contains("light") || d.getAttribute("data-theme") === "light") return setIsDark(false)
      setIsDark(mq.matches)
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] })
    mq.addEventListener("change", read)
    return () => {
      mo.disconnect()
      mq.removeEventListener("change", read)
    }
  }, [])

  const P = PALETTE[isDark ? "dark" : "light"]

  // DOM refs
  const stageRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const tipBRef = React.useRef<HTMLElement>(null)
  const tipSRef = React.useRef<HTMLSpanElement>(null)

  const cfg = React.useRef({
    venue,
    seatRadius,
    selected: new Set<string>(selectedIds),
    filter: filter as LegendKey | null,
    dark: isDark,
    target: view === "3d" ? 1 : 0,
    fmt,
    toggle: toggleSeat,
  })
  // ORDERING: keep this effect declared above the engine and kick() effects — effects run in declaration order.
  // Sync mutable engine config after commit — never during render
  // (react-hooks/refs). This effect is declared before the engine effect,
  // so on mount it runs first; it re-runs after every render (no dep array)
  // while the rebuild/kick effects below only run on their own dep changes.
  // The engine reads cfg.current from event handlers and the rAF loop,
  // which always run post-commit, so a post-commit sync is observably
  // identical with no render-time ref access. useEffect (not layout) is
  // SSR-safe: on the server it simply never runs and the ref initializer
  // above already holds the correct first-render values.
  React.useEffect(() => {
    cfg.current = {
      venue,
      seatRadius,
      selected: new Set<string>(selectedIds),
      filter,
      dark: isDark,
      target: view === "3d" ? 1 : 0,
      fmt,
      toggle: toggleSeat,
    }
  })

  const engine = React.useRef<{ kick: () => void; rebuild: () => void; zoomBy: (f: number) => void; reset: () => void } | null>(null)

  // #region Canvas engine
  React.useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const tip = tipRef.current
    const tipB = tipBRef.current
    const tipS = tipSRef.current
    if (!stage || !canvas || !tip || !tipB || !tipS) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)")
    let reduced = reduceMq.matches

    let W = 0
    let H = 0
    let dpr = 1
    let t = reduced ? cfg.current.target : 0
    let yaw = 0
    let elev = ELEV_DEFAULT
    let yawGoal = 0
    let elevGoal = ELEV_DEFAULT
    let zoom = 1
    let panX = 0
    let panY = 0
    let fAmt = 0
    let raf = 0
    let last = 0
    let inView = true

    let items: Item[] = []
    let order: number[] = []
    let tableSeats = new Map<string, VenueSeat[]>()
    let labels: VenueLabel[] = []
    let floorHW = 100
    let floorHD = 100
    let maxZ = 10
    let lastSn = NaN
    let lastCs = NaN

    let hovered = -1
    let pinned = -1
    let kb = -1
    let focused = false
    let activeIdx = -1
    let lastTip = ""
    let tipW = 0

    const build = () => {
      const v = cfg.current.venue
      const R = cfg.current.seatRadius
      const prev = new Map<string, { hov: number; sel: number }>()
      for (const it of items) if (it.kind === 0) prev.set(it.id, { hov: it.hov, sel: it.sel })

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const grow = (x0: number, y0: number, x1: number, y1: number) => {
        if (x0 < minX) minX = x0
        if (y0 < minY) minY = y0
        if (x1 > maxX) maxX = x1
        if (y1 > maxY) maxY = y1
      }
      const mk = (p: Partial<Item> & Pick<Item, "kind" | "x" | "y" | "h" | "id">): Item => ({
        sub: 0, r: 0, hw: 0, hd: 0, label: "", seat: null, ref: 0, hov: 0, sel: 0, dep: 0,
        vis: false, sx: 0, sy: 0, sy2: 0, rx: 0, ry: 0, quad: [],
        ...p,
      })
      const list: Item[] = []

      ;(v.stages ?? []).forEach((s, i) => {
        grow(s.x - s.width / 2, s.y - s.height / 2, s.x + s.width / 2, s.y + s.height / 2)
        list.push(mk({ kind: 2, sub: 0, id: s.id ?? `stage-${i}`, x: s.x, y: s.y, hw: s.width / 2, hd: s.height / 2, h: s.elevation ?? R * 2.2, label: s.label ?? "Stage", ref: i }))
      })
      ;(v.gaZones ?? []).forEach((z, i) => {
        grow(z.x - z.width / 2, z.y - z.height / 2, z.x + z.width / 2, z.y + z.height / 2)
        list.push(mk({ kind: 2, sub: 1, id: z.id, x: z.x, y: z.y, hw: z.width / 2, hd: z.height / 2, h: 0.8, label: z.label, ref: i }))
      })
      ;(v.tables ?? []).forEach((tb, i) => {
        if (tb.radius) {
          grow(tb.x - tb.radius, tb.y - tb.radius, tb.x + tb.radius, tb.y + tb.radius)
          list.push(mk({ kind: 1, id: tb.id, x: tb.x, y: tb.y, r: tb.radius, h: R * 1.1, label: tb.label, ref: i }))
        } else {
          const w = tb.width ?? R * 6
          const d = tb.height ?? R * 3
          grow(tb.x - w / 2, tb.y - d / 2, tb.x + w / 2, tb.y + d / 2)
          list.push(mk({ kind: 2, sub: 2, id: tb.id, x: tb.x, y: tb.y, hw: w / 2, hd: d / 2, h: R * 1.1, label: tb.label, ref: i }))
        }
      })
      const ts = new Map<string, VenueSeat[]>()
      v.seats.forEach((s, i) => {
        grow(s.x - R, s.y - R, s.x + R, s.y + R)
        const it = mk({ kind: 0, id: s.id, x: s.x, y: s.y, r: R, h: R * 0.85, label: s.label, seat: s, ref: i })
        const old = prev.get(s.id)
        if (old) {
          it.hov = old.hov
          it.sel = old.sel
        }
        list.push(it)
        if (s.tableId) {
          const arr = ts.get(s.tableId) ?? []
          arr.push(s)
          ts.set(s.tableId, arr)
        }
      })

      if (!isFinite(minX)) {
        minX = 0
        minY = 0
        maxX = 100
        maxY = 100
      }
      const cx0 = (minX + maxX) / 2
      const cy0 = (minY + maxY) / 2
      const margin = R * 3
      floorHW = (maxX - minX) / 2 + margin
      floorHD = (maxY - minY) / 2 + margin
      let mz = 4
      for (const it of list) {
        it.x -= cx0
        it.y -= cy0
        if (it.h > mz) mz = it.h
      }
      maxZ = mz + 4
      labels = (v.labels ?? []).map((l) => ({ ...l, x: l.x - cx0, y: l.y - cy0 }))
      items = list
      order = list.map((_, i) => i)
      tableSeats = ts
      lastSn = NaN
      hovered = -1
      pinned = -1
      kb = -1
      activeIdx = -1
      tip.style.opacity = "0"
    }

    const extents = (cam: Cam) => {
      let minx = Infinity
      let maxx = -Infinity
      let miny = Infinity
      let maxy = -Infinity
      for (const sx of [-floorHW, floorHW]) {
        for (const sy of [-floorHD, floorHD]) {
          for (const z of [0, maxZ]) {
            const p = project(cam, sx, sy, z)
            if (p[0] < minx) minx = p[0]
            if (p[0] > maxx) maxx = p[0]
            if (p[1] < miny) miny = p[1]
            if (p[1] > maxy) maxy = p[1]
          }
        }
      }
      return { minx, maxx, miny, maxy }
    }

    // Shared transform state for hit-testing and zoom anchoring
    let fit = 1

    const seatKey = (s: VenueSeat, sel: boolean): LegendKey =>
      sel ? "selected" : s.status !== "available" ? s.status : (s.category ?? "standard")

    const statusText = (s: VenueSeat) =>
      cfg.current.selected.has(s.id)
        ? "Selected"
        : (s.statusLabel ?? (s.status[0].toUpperCase() + s.status.slice(1)))

    const draw = () => {
      if (!W || !H) return
      const P2 = PALETTE[cfg.current.dark ? "dark" : "light"]
      const selected = cfg.current.selected
      const filterKey = cfg.current.filter
      const e = ease(t)
      const cam = camera(e, yaw, elev)
      const bx = extents(camera(e, 0, elev))
      const pad = 14
      fit = Math.min((W - pad * 2) / Math.max(1e-6, bx.maxx - bx.minx), (H - pad * 2) / Math.max(1e-6, bx.maxy - bx.miny))
      const s = fit * zoom
      const ccx = (bx.minx + bx.maxx) / 2
      const ccy = (bx.miny + bx.maxy) / 2
      const ox = W / 2 + panX - ccx * s
      const oy = H / 2 + panY - ccy * s
      const { cs, sn, se, ce } = cam
      const px = (x: number, y: number) => ox + (x * cs - y * sn) * s
      const py = (x: number, y: number, z: number) => oy + ((x * sn + y * cs) * se - z * ce) * s

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      if (sn !== lastSn || cs !== lastCs) {
        lastSn = sn
        lastCs = cs
        for (const it of items) it.dep = it.x * sn + it.y * cs
        order.sort((a, b) => items[a].dep - items[b].dep)
      }

      // Floor
      ctx.beginPath()
      const fc: [number, number][] = [[-floorHW, -floorHD], [floorHW, -floorHD], [floorHW, floorHD], [-floorHW, floorHD]]
      fc.forEach(([fx, fy], k) => (k ? ctx.lineTo(px(fx, fy), py(fx, fy, 0)) : ctx.moveTo(px(fx, fy), py(fx, fy, 0))))
      ctx.closePath()
      ctx.fillStyle = rgb(P2.floor)
      ctx.fill()
      ctx.strokeStyle = rgb(P2.floorEdge)
      ctx.lineWidth = 1
      ctx.stroke()

      const fontFamily = getComputedStyle(stage).fontFamily || "sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (const l of labels) {
        ctx.font = `500 ${clamp(11 * (s / 1.4) * 0.5, 9, 14)}px ${fontFamily}`
        ctx.fillStyle = rgb(P2.muted)
        ctx.fillText(l.text, px(l.x, l.y), py(l.x, l.y, 0))
      }

      const filterGoal = fAmt
      const seatBase = (seat: VenueSeat): RGB =>
        seat.status === "sold" ? P2.sold : seat.status === "reserved" ? P2.reserved : seat.category === "vip" ? P2.vip : seat.category === "accessible" ? P2.acc : P2.avail

      const roundBody = (cx: number, yTop: number, yBot: number, rx: number, ry: number, side: string, top: string) => {
        if (yBot - yTop > 0.5) {
          ctx.beginPath()
          ctx.moveTo(cx - rx, yTop)
          ctx.lineTo(cx - rx, yBot)
          ctx.ellipse(cx, yBot, rx, ry, 0, Math.PI, 0, true)
          ctx.lineTo(cx + rx, yTop)
          ctx.closePath()
          ctx.fillStyle = side
          ctx.fill()
        }
        ctx.beginPath()
        ctx.ellipse(cx, yTop, rx, ry, 0, 0, Math.PI * 2)
        ctx.fillStyle = top
        ctx.fill()
      }

      for (let q = 0; q < order.length; q++) {
        const it = items[order[q]]
        const idx = order[q]

        if (it.kind === 0) {
          const seat = it.seat as VenueSeat
          const isSel = selected.has(seat.id)
          let base = seatBase(seat)
          if (it.sel > 0.002) base = mix(base, P2.selected, it.sel)
          if (filterGoal > 0.002 && filterKey && seatKey(seat, isSel) !== filterKey) base = mix(base, P2.floor, 0.8 * filterGoal)
          if (it.hov > 0.002) base = mix(base, P2.hover, 0.22 * it.hov)

          const lift = it.hov * 1.2 + it.sel * 2.2
          const zt = it.h + lift
          const cxp = px(it.x, it.y)
          const yTop = py(it.x, it.y, zt)
          const yBot = py(it.x, it.y, 0)
          const rx = it.r * s
          const ry = it.r * se * s
          it.vis = true
          it.sx = cxp
          it.sy = yTop
          it.sy2 = yBot
          it.rx = rx
          it.ry = ry
          if (cxp < -rx * 2 || cxp > W + rx * 2 || yBot < -ry * 2 || yTop > H + ry * 2) {
            it.vis = false
            continue
          }
          if (rx < 1.8) {
            ctx.fillStyle = rgb(base)
            ctx.fillRect(cxp - rx, yTop - Math.max(ry, 0.8), rx * 2, Math.max(ry * 2, 1.6) + (yBot - yTop))
            continue
          }
          roundBody(cxp, yTop, yBot, rx, ry, rgb(base, 0.72), rgb(base))

          const ring = it.hov > 0.02 || it.sel > 0.5 || (focused && idx === kb)
          if (ring) {
            ctx.beginPath()
            ctx.ellipse(cxp, yTop, rx, ry, 0, 0, Math.PI * 2)
            ctx.strokeStyle = rgba(P2.hover, clamp(0.35 + it.hov * 0.6, 0, 1))
            ctx.lineWidth = focused && idx === kb ? 2.4 : 1.6
            ctx.stroke()
          }
          if (rx >= 7 && !(filterGoal > 0.3 && filterKey && seatKey(seat, isSel) !== filterKey)) {
            ctx.font = `600 ${Math.min(11, rx * 0.95)}px ${fontFamily}`
            if (seat.status === "sold") {
              ctx.fillStyle = rgb(P2.muted)
              ctx.fillText("×", cxp, yTop)
            } else {
              ctx.fillStyle = "#fff"
              ctx.fillText(String(seat.number ?? seat.label), cxp, yTop + 0.5)
            }
          }
          continue
        }

        if (it.kind === 1) {
          const lift = 0
          const zt = it.h + lift
          const cxp = px(it.x, it.y)
          const yTop = py(it.x, it.y, zt)
          const yBot = py(it.x, it.y, 0)
          const rx = it.r * s
          const ry = it.r * se * s
          it.vis = true
          it.sx = cxp
          it.sy = yTop
          it.sy2 = yBot
          it.rx = rx
          it.ry = ry
          if (cxp < -rx || cxp > W + rx || yBot < -ry || yTop > H + ry) {
            it.vis = false
            continue
          }
          const top = mix(P2.tableTop, P2.floor, 0.1)
          roundBody(cxp, yTop, yBot, rx, ry, rgb(mix(top, P2.tableLine, 0.35)), rgb(top))
          ctx.beginPath()
          ctx.ellipse(cxp, yTop, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2)
          ctx.setLineDash([4, 3])
          ctx.strokeStyle = rgba(P2.tableLine, 0.8)
          ctx.lineWidth = 1.2
          ctx.stroke()
          ctx.setLineDash([])
          // Tap feedback: ring the table while its info tooltip is pinned.
          if (idx === activeIdx) {
            ctx.beginPath()
            ctx.ellipse(cxp, yTop, rx + 3, ry + 3, 0, 0, Math.PI * 2)
            ctx.strokeStyle = rgba(P2.hover, 0.7)
            ctx.lineWidth = 2
            ctx.stroke()
          }
          if (rx >= 16) {
            ctx.font = `600 ${clamp(rx * 0.26, 9, 14)}px ${fontFamily}`
            ctx.fillStyle = rgb(P2.tableLine)
            ctx.fillText(it.label, cxp, yTop)
          }
          continue
        }

        // Boxes: stage, GA zone, rectangular table
        const zt = it.h
        const hw = it.hw
        const hd = it.hd
        const cr: [number, number][] = [[it.x - hw, it.y - hd], [it.x + hw, it.y - hd], [it.x + hw, it.y + hd], [it.x - hw, it.y + hd]]
        const topC: RGB = it.sub === 0 ? P2.stageTop : it.sub === 1 ? mix(P2.floor, P2.ga, 0.16) : mix(P2.tableTop, P2.floor, 0.1)
        it.quad.length = 8
        for (let j = 0; j < 4; j++) {
          it.quad[j * 2] = px(cr[j][0], cr[j][1])
          it.quad[j * 2 + 1] = py(cr[j][0], cr[j][1], zt)
        }
        it.vis = true
        if (it.sub !== 1 && zt * ce * s > 0.35) {
          for (let j = 0; j < 4; j++) {
            const jn = (j + 1) & 3
            const dx = cr[jn][0] - cr[j][0]
            const dy = cr[jn][1] - cr[j][1]
            const len = Math.hypot(dx, dy) || 1
            const nx = dy / len
            const ny = -dx / len
            if (nx * sn + ny * cs <= 0.02) continue
            const shade = clamp(0.78 - 0.18 * (nx * cs - ny * sn), 0.5, 0.95)
            ctx.beginPath()
            ctx.moveTo(px(cr[j][0], cr[j][1]), py(cr[j][0], cr[j][1], 0))
            ctx.lineTo(px(cr[jn][0], cr[jn][1]), py(cr[jn][0], cr[jn][1], 0))
            ctx.lineTo(it.quad[jn * 2], it.quad[jn * 2 + 1])
            ctx.lineTo(it.quad[j * 2], it.quad[j * 2 + 1])
            ctx.closePath()
            ctx.fillStyle = rgb(topC, shade)
            ctx.fill()
          }
        }
        ctx.beginPath()
        ctx.moveTo(it.quad[0], it.quad[1])
        for (let j = 1; j < 4; j++) ctx.lineTo(it.quad[j * 2], it.quad[j * 2 + 1])
        ctx.closePath()
        ctx.fillStyle = rgb(topC)
        ctx.fill()
        if (it.sub !== 0) {
          ctx.setLineDash(it.sub === 1 ? [5, 4] : [])
          ctx.strokeStyle = rgba(it.sub === 1 ? P2.ga : P2.tableLine, 0.8)
          ctx.lineWidth = 1.2
          ctx.stroke()
          ctx.setLineDash([])
        }
        const ccxp = (it.quad[0] + it.quad[2] + it.quad[4] + it.quad[6]) / 4
        const ccyp = (it.quad[1] + it.quad[3] + it.quad[5] + it.quad[7]) / 4
        it.sx = ccxp
        it.sy = Math.min(it.quad[1], it.quad[3], it.quad[5], it.quad[7])
        if (s * hw > 22) {
          ctx.font = `600 ${clamp(s * 6, 10, 16)}px ${fontFamily}`
          ctx.fillStyle = it.sub === 0 ? rgb(P2.stageText) : rgb(it.sub === 1 ? P2.ga : P2.tableLine)
          let text = it.label
          if (it.sub === 1) {
            const z = cfg.current.venue.gaZones?.[it.ref]
            if (z) text = `${z.label} · ${z.available} left`
          }
          ctx.fillText(text, ccxp, ccyp)
        }
      }

      // Tooltip
      if (activeIdx >= 0 && activeIdx < items.length && items[activeIdx].vis) {
        const it = items[activeIdx]
        let titleText = it.label
        let detail = ""
        const f = cfg.current.fmt
        if (it.kind === 0 && it.seat) {
          const sd = it.seat
          detail = [CATEGORY_NAME[sd.category ?? "standard"], sd.price != null ? f.format(sd.price) : "", statusText(sd)].filter(Boolean).join(" · ")
        } else if (it.kind === 1 || it.sub === 2) {
          const list = tableSeats.get(it.id) ?? []
          const cap = cfg.current.venue.tables?.[it.ref]?.capacity ?? list.length
          const avail = list.filter((x) => x.status === "available").length
          detail = list.length ? `${cap} seats · ${avail} available` : "Table"
        } else if (it.sub === 1) {
          const z = cfg.current.venue.gaZones?.[it.ref]
          if (z) detail = [z.price != null ? f.format(z.price) : "", `${z.available} of ${z.capacity} left`].filter(Boolean).join(" · ")
          titleText = z?.label ?? it.label
        }
        const key = `${titleText}|${detail}`
        if (key !== lastTip) {
          lastTip = key
          tipB.textContent = titleText
          tipS.textContent = detail
          tipW = tip.offsetWidth
        }
        const tx = it.sx
        const ty = it.kind === 2 ? it.sy : it.sy - it.ry
        const half = tipW / 2
        const cx = clamp(tx, half + 4, Math.max(half + 4, W - half - 4))
        tip.style.transform = `translate(${(cx - half).toFixed(1)}px,${(ty - 10).toFixed(1)}px) translateY(-100%)`
        tip.style.setProperty("--arrow", `${(tx - cx + half).toFixed(1)}px`)
      }
    }

    const refreshActive = () => {
      const next = hovered >= 0 ? hovered : kb >= 0 && focused ? kb : pinned
      if (next === activeIdx) return
      activeIdx = next
      lastTip = ""
      tip.style.opacity = next >= 0 ? "1" : "0"
      tip.setAttribute("aria-hidden", next >= 0 ? "false" : "true")
      kick()
    }

    const tick = (now: number) => {
      raf = 0
      if (!inView) return
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      let moving = false

      const target = cfg.current.target
      if (t !== target) {
        const step = reduced ? 1 : (dt * 1000) / 1100
        t = target > t ? Math.min(target, t + step) : Math.max(target, t - step)
        moving = true
      }
      const ko = reduced ? 1 : 1 - Math.exp(-dt * 12)
      yaw += (yawGoal - yaw) * ko
      elev += (elevGoal - elev) * ko
      if (Math.abs(yawGoal - yaw) > 1e-4 || Math.abs(elevGoal - elev) > 1e-4) moving = true
      else {
        yaw = yawGoal
        elev = elevGoal
      }

      const fGoal = cfg.current.filter ? 1 : 0
      if (fAmt !== fGoal) {
        const kf = reduced ? 1 : 1 - Math.exp(-dt * 10)
        fAmt = Math.abs(fGoal - fAmt) < 0.003 ? fGoal : fAmt + (fGoal - fAmt) * kf
        moving = true
      }

      const kv = reduced ? 1 : 1 - Math.exp(-dt * 14)
      const selected = cfg.current.selected
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind !== 0 || !it.seat) continue
        const hg = i === activeIdx ? 1 : 0
        if (it.hov !== hg) {
          it.hov = Math.abs(hg - it.hov) < 0.004 ? hg : it.hov + (hg - it.hov) * kv
          moving = true
        }
        const sg = selected.has(it.seat.id) ? 1 : 0
        if (it.sel !== sg) {
          it.sel = Math.abs(sg - it.sel) < 0.004 ? sg : it.sel + (sg - it.sel) * kv
          moving = true
        }
      }

      draw()
      if (moving) raf = requestAnimationFrame(tick)
    }

    const kick = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }

    const relayout = () => {
      const w = Math.round(stage.clientWidth)
      if (!w) return
      const vh = window.innerHeight || 800
      const h = clamp(Math.round(w * 0.66), 340, Math.max(340, Math.min(Math.round(vh * 0.72), 640)))
      W = w
      H = h
      dpr = Math.min(2, window.devicePixelRatio || 1)
      stage.style.height = `${h}px`
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      draw()
    }

    const hitTest = (mx: number, my: number) => {
      for (let q = order.length - 1; q >= 0; q--) {
        const i = order[q]
        const it = items[i]
        if (!it.vis) continue
        if (it.kind === 2) {
          if (it.sub !== 0 && inPoly(it.quad, mx, my)) return i
          continue
        }
        const ex = Math.max(it.rx * 1.12, 3)
        const ey = Math.max(it.ry * 1.12, 2)
        if (inEllipse(mx, my, it.sx, it.sy, ex, ey)) return i
        if (it.sy2 > it.sy) {
          if (Math.abs(mx - it.sx) <= ex && my >= it.sy && my <= it.sy2) return i
          if (inEllipse(mx, my, it.sx, it.sy2, ex, ey)) return i
        }
      }
      return -1
    }

    const local = (ev: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect()
      return [ev.clientX - r.left, ev.clientY - r.top] as const
    }

    const zoomAt = (nz: number, ax: number, ay: number) => {
      const z2 = clamp(nz, 0.5, 8)
      const k = z2 / zoom
      panX = ax - W / 2 - (ax - W / 2 - panX) * k
      panY = ay - H / 2 - (ay - H / 2 - panY) * k
      zoom = z2
      const lim = (v: number) => clamp(v, -W * 0.7 * zoom, W * 0.7 * zoom)
      panX = lim(panX)
      panY = clamp(panY, -H * 0.7 * zoom, H * 0.7 * zoom)
      kick()
    }

    const pointers = new Map<number, { x: number; y: number }>()
    let drag: { x: number; y: number; yaw: number; elev: number; panX: number; panY: number; moved: boolean; mode: "orbit" | "pan" } | null = null
    let pinch: { d: number; zoom: number } | null = null

    const onDown = (ev: PointerEvent) => {
      const [x, y] = local(ev)
      pointers.set(ev.pointerId, { x, y })
      try {
        canvas.setPointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values())
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom }
        drag = null
        return
      }
      if (ev.pointerType === "mouse" && ev.button !== 0 && ev.button !== 2) return
      const is3d = cfg.current.target === 1
      const panMode = !is3d || ev.shiftKey || ev.button === 2
      drag = { x: ev.clientX, y: ev.clientY, yaw: yawGoal, elev: elevGoal, panX, panY, moved: false, mode: panMode ? "pan" : "orbit" }
    }

    const onMove = (ev: PointerEvent) => {
      const [x, y] = local(ev)
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x, y })
      if (pinch && pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values())
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
        zoomAt(pinch.zoom * (d / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2)
        return
      }
      if (drag) {
        const dx = ev.clientX - drag.x
        const dy = ev.clientY - drag.y
        if (drag.moved || Math.hypot(dx, dy) > 5) {
          drag.moved = true
          if (drag.mode === "orbit") {
            yawGoal = clamp(drag.yaw + dx * 0.006, -YAW_MAX, YAW_MAX)
            elevGoal = clamp(drag.elev + dy * 0.005, ELEV_MIN, ELEV_MAX)
          } else {
            panX = clamp(drag.panX + dx, -W * 0.7 * zoom, W * 0.7 * zoom)
            panY = clamp(drag.panY + dy, -H * 0.7 * zoom, H * 0.7 * zoom)
          }
          canvas.style.cursor = "grabbing"
          hovered = -1
          refreshActive()
          kick()
          return
        }
      }
      if (ev.pointerType !== "mouse") return
      const i = hitTest(x, y)
      if (i !== hovered) {
        hovered = i
        refreshActive()
      }
      const seatHit = i >= 0 && items[i].kind === 0
      const tableHit = i >= 0 && (items[i].kind === 1 || items[i].sub === 2)
      canvas.style.cursor = seatHit ? (items[i].seat?.status === "available" || cfg.current.selected.has(items[i].id) ? "pointer" : "not-allowed") : tableHit ? "pointer" : "grab"
    }

    const onUp = (ev: PointerEvent) => {
      pointers.delete(ev.pointerId)
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId)
      if (pinch) {
        if (pointers.size < 2) pinch = null
        drag = null
        return
      }
      if (!drag) return
      const wasMoved = drag.moved
      drag = null
      canvas.style.cursor = "grab"
      if (wasMoved) return
      const [x, y] = local(ev)
      const i = hitTest(x, y)
      if (i >= 0 && items[i].kind === 0 && items[i].seat) {
        cfg.current.toggle(items[i].seat!.id)
        if (ev.pointerType !== "mouse") pinned = i
        else pinned = -1
      } else {
        pinned = i >= 0 ? i : -1
      }
      if (ev.pointerType !== "mouse") hovered = -1
      refreshActive()
      kick()
    }

    const onCancel = (ev: PointerEvent) => {
      pointers.delete(ev.pointerId)
      drag = null
      pinch = null
    }
    const onLeave = () => {
      if (drag) return
      hovered = -1
      refreshActive()
    }
    const reset = () => {
      yawGoal = 0
      elevGoal = ELEV_DEFAULT
      zoom = 1
      panX = 0
      panY = 0
      kick()
    }
    const onWheel = (ev: WheelEvent) => {
      if (!(scrollZoom || ev.ctrlKey || ev.metaKey)) return
      ev.preventDefault()
      const [x, y] = local(ev)
      zoomAt(zoom * Math.exp(-ev.deltaY * 0.0015), x, y)
    }

    const kbMove = (dx: number, dy: number) => {
      const cur = kb >= 0 ? items[kb] : null
      let best = -1
      let bestScore = Infinity
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind !== 0 || i === kb) continue
        if (!cur) {
          best = i
          break
        }
        const vx = it.x - cur.x
        const vy = it.y - cur.y
        const along = vx * dx + vy * dy
        if (along <= 0.1) continue
        const perp = Math.abs(vx * dy - vy * dx)
        const score = along + perp * 2
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      }
      return best
    }

    const onKey = (ev: KeyboardEvent) => {
      const k = ev.key
      if (k === "+" || k === "=") {
        ev.preventDefault()
        zoomAt(zoom * 1.25, W / 2, H / 2)
        return
      }
      if (k === "-" || k === "_") {
        ev.preventDefault()
        zoomAt(zoom / 1.25, W / 2, H / 2)
        return
      }
      if (k === "Escape") {
        kb = -1
        pinned = -1
        hovered = -1
        refreshActive()
        return
      }
      if ((k === "Enter" || k === " ") && kb >= 0 && items[kb]?.seat) {
        ev.preventDefault()
        cfg.current.toggle(items[kb].seat!.id)
        return
      }
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (!dir[k]) return
      ev.preventDefault()
      const next = kbMove(dir[k][0], dir[k][1])
      if (next >= 0) {
        kb = next
        hovered = -1
        refreshActive()
        const sd = items[next].seat
        canvas.dispatchEvent(new CustomEvent("seatfocus", { detail: sd ? `${sd.label}, ${sd.status}` : "" }))
      }
    }
    const onFocus = () => {
      focused = true
      refreshActive()
      kick()
    }
    const onBlur = () => {
      focused = false
      kb = -1
      refreshActive()
      kick()
    }
    const onSeatFocus = (ev: Event) => setAnnounce((ev as CustomEvent<string>).detail)
    const onCtx = (ev: Event) => ev.preventDefault()

    build()
    relayout()
    kick()

    const ro = new ResizeObserver(() => {
      if (Math.round(stage.clientWidth) !== W) relayout()
    })
    ro.observe(stage)
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((en) => en.isIntersecting)
      if (inView) kick()
    })
    io.observe(stage)
    const onReduce = () => {
      reduced = reduceMq.matches
      kick()
    }
    reduceMq.addEventListener("change", onReduce)

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onCancel)
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("dblclick", reset)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("keydown", onKey)
    canvas.addEventListener("focus", onFocus)
    canvas.addEventListener("blur", onBlur)
    canvas.addEventListener("seatfocus", onSeatFocus)
    canvas.addEventListener("contextmenu", onCtx)

    engine.current = {
      kick,
      rebuild: () => {
        build()
        relayout()
        kick()
      },
      zoomBy: (f: number) => zoomAt(zoom * f, W / 2, H / 2),
      reset,
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      reduceMq.removeEventListener("change", onReduce)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onCancel)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("dblclick", reset)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("keydown", onKey)
      canvas.removeEventListener("focus", onFocus)
      canvas.removeEventListener("blur", onBlur)
      canvas.removeEventListener("seatfocus", onSeatFocus)
      canvas.removeEventListener("contextmenu", onCtx)
      engine.current = null
    }
  }, [scrollZoom])
  // #endregion

  React.useEffect(() => {
    engine.current?.rebuild()
  }, [venue, seatRadius])

  React.useEffect(() => {
    engine.current?.kick()
  }, [view, selectedIds, filter, isDark])

  // Cart
  const selectedSeats = selectedIds.map((id) => seatById.get(id)).filter((s): s is VenueSeat => !!s)
  const gaLines: GaSelection[] = (venue.gaZones ?? [])
    .filter((z) => (ga[z.id] ?? 0) > 0)
    .map((z) => ({ zoneId: z.id, label: z.label, quantity: ga[z.id], unitPrice: z.price ?? 0 }))
  const total = selectedSeats.reduce((n, s) => n + (s.price ?? 0), 0) + gaLines.reduce((n, g) => n + g.quantity * g.unitPrice, 0)
  const hasOrder = selectedSeats.length > 0 || gaLines.length > 0
  const is3d = view === "3d"
  const swatch = (k: string) => rgb(P[k])

  const btn =
    "grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-neutral-200 bg-white/90 text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-200 dark:hover:bg-neutral-800"

  return (
    <section
      className={
        "flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 sm:p-6 " +
        className
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-base font-semibold tracking-tight sm:text-lg">{title}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {is3d ? "Drag to rotate, pinch or use +/− to zoom, tap a seat to select it." : "Drag to move around, pinch or use +/− to zoom, tap a seat to select it."}
          </p>
        </div>
        <div role="group" aria-label="Map view" className="relative inline-flex rounded-lg border border-neutral-200 bg-neutral-100/60 p-0.5 dark:border-neutral-800 dark:bg-neutral-900/60">
          <span
            aria-hidden="true"
            className="absolute bottom-0.5 left-0.5 top-0.5 w-8 rounded-md bg-white shadow-sm transition-transform duration-300 dark:bg-neutral-800"
            style={{ transform: is3d ? "translateX(100%)" : "translateX(0)" }}
          />
          {(["2d", "3d"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={v === "2d" ? "Flat plan view" : "3D venue view"}
              title={v === "2d" ? "Flat plan view" : "3D venue view"}
              onClick={() => setView(v)}
              className={`relative z-10 grid h-7 w-8 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 transition-colors ${
                view === v ? "text-neutral-950 dark:text-neutral-100" : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {v === "2d" ? <GridIcon /> : <CubeIcon />}
            </button>
          ))}
        </div>
      </header>

      <div className={showCart ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]" : ""}>
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <div ref={stageRef} className="relative w-full overflow-hidden" style={{ height: 380 }}>
              <canvas
                ref={canvasRef}
                tabIndex={0}
                role="img"
                aria-label={`Venue seating map with ${venue.seats.length} seats. Use arrow keys to move between seats, Enter to select, plus and minus to zoom.`}
                className="absolute left-0 top-0 block outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                style={{ maxWidth: "none", touchAction: "none", cursor: "grab" }}
              />
              <div className="absolute right-2 top-2 z-20 flex flex-col gap-1.5">
                <button type="button" className={btn} aria-label="Zoom in" onClick={() => engine.current?.zoomBy(1.3)}>
                  <Icon d="M8 3v10M3 8h10" />
                </button>
                <button type="button" className={btn} aria-label="Zoom out" onClick={() => engine.current?.zoomBy(1 / 1.3)}>
                  <Icon d="M3 8h10" />
                </button>
                <button type="button" className={btn} aria-label="Reset view" onClick={() => engine.current?.reset()}>
                  <Icon>
                    <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" />
                    <path d="M2.5 2.5v3h3" />
                  </Icon>
                </button>
              </div>
              <div
                ref={tipRef}
                role="tooltip"
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 z-30 whitespace-nowrap rounded-lg bg-neutral-900/95 px-3 py-1.5 text-xs text-white shadow-xl transition-opacity duration-150 motion-reduce:transition-none dark:bg-neutral-100/95 dark:text-neutral-900"
                style={{ opacity: 0 }}
              >
                <strong ref={tipBRef} className="block font-semibold" />
                <span ref={tipSRef} className="block text-[11px] opacity-80" />
                <span
                  aria-hidden="true"
                  className="absolute top-full h-0 w-0"
                  style={{
                    left: "var(--arrow, 50%)",
                    marginLeft: -5,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "5px solid currentColor",
                    color: isDark ? "rgba(245,245,245,.95)" : "rgba(23,23,23,.95)",
                  }}
                />
              </div>
            </div>
          </div>

          <div role="group" aria-label="Highlight seat types" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400">
            {LEGEND.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={filter === l.key}
                onClick={() => setFilter((cur) => (cur === l.key ? null : l.key))}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent p-1 transition-opacity hover:text-neutral-900 dark:hover:text-neutral-100 ${
                  filter && filter !== l.key ? "opacity-45" : ""
                }`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: swatch(l.color), boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {showCart && (
          <aside className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" aria-label="Your order">
            <div className="flex items-baseline justify-between">
              <h4 className="m-0 text-sm font-semibold">Your seats</h4>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {selectedSeats.length} of {maxSeats}
              </span>
            </div>

            {notice && (
              <p role="status" className="m-0 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                {notice}
              </p>
            )}

            {!hasOrder && <p className="m-0 text-sm text-neutral-500 dark:text-neutral-400">Select a seat on the map to start your order.</p>}

            {selectedSeats.length > 0 && (
              <ul className="m-0 flex max-h-56 list-none flex-col gap-1.5 overflow-y-auto p-0">
                {selectedSeats.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{s.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-neutral-600 dark:text-neutral-300">{s.price != null ? fmt.format(s.price) : ""}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${s.label}`}
                        onClick={() => toggleSeat(s.id)}
                        className="grid h-5 w-5 cursor-pointer place-items-center rounded border-0 bg-transparent p-0 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                      >
                        <Icon d="M4 4l8 8M12 4l-8 8" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {(venue.gaZones ?? []).length > 0 && (
              <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                {(venue.gaZones ?? []).map((z) => {
                  const q = ga[z.id] ?? 0
                  return (
                    <div key={z.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{z.label}</span>
                        {!z.readOnly && (
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                            {z.price != null ? `${fmt.format(z.price)} · ` : ""}
                            {z.available} left
                          </span>
                        )}
                      </span>
                      {!z.readOnly && (
                        <span className="flex items-center gap-1.5">
                          <button type="button" aria-label={`Fewer ${z.label} tickets`} disabled={q === 0} onClick={() => setGa((g) => ({ ...g, [z.id]: Math.max(0, q - 1) }))} className={btn + " disabled:opacity-40"}>
                            <Icon d="M3 8h10" />
                          </button>
                          <span className="w-5 text-center tabular-nums">{q}</span>
                          <button type="button" aria-label={`More ${z.label} tickets`} disabled={q >= z.available} onClick={() => setGa((g) => ({ ...g, [z.id]: Math.min(z.available, q + 1) }))} className={btn + " disabled:opacity-40"}>
                            <Icon d="M8 3v10M3 8h10" />
                          </button>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-1 flex items-baseline justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <span className="text-sm text-neutral-600 dark:text-neutral-300">Total</span>
              <span className="text-lg font-semibold tabular-nums">{fmt.format(total)}</span>
            </div>

            <button
              type="button"
              disabled={!hasOrder}
              onClick={() => onCheckout?.({ seats: selectedSeats, ga: gaLines, total })}
              className="h-10 cursor-pointer rounded-lg border-0 bg-neutral-900 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              Continue to checkout
            </button>
            {hasOrder && (
              <button
                type="button"
                onClick={() => {
                  setSelection([])
                  setGa({})
                  setNotice("")
                }}
                className="cursor-pointer border-0 bg-transparent p-0 text-xs text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
              >
                Clear selection
              </button>
            )}
          </aside>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  )
}

export default VenueSeatPicker3D