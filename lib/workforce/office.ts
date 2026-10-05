/**
 * lib/workforce/office.ts — Stage 19: 3D office view-model (visualization ONLY).
 *
 * HARD RULE: this module is another VIEW of stored workforce state. It never
 * starts, approves, edits or mutates anything: pure functions, no I/O, no
 * clients, no service-role. Animation (in the scene component) reflects
 * STORED state only — never invented activity.
 *
 * Rooms come from the registry `department` field: a new registry agent gets
 * a desk automatically with zero code mapping and no hardcoded agent names.
 */

import type { CommandCenterRaw } from './command-center';

export type AgentPresence = 'idle' | 'busy' | 'awaiting' | 'neutral';

export interface OfficeAgentSnapshot {
  id: string;
  name: string;
  department: string;
  statusLabel: string;
  presence: AgentPresence;
  currentTaskTitle: string | null;
  lastActivityAt: string | null;
}

export interface OfficeSnapshot {
  agents: OfficeAgentSnapshot[];
  openIncidents: number;
  pendingApprovals: number;
  /**
   * Worst open-incident severity (s1..s4) or null when none is known.
   * Drives the annex lamp tone: s1/s2 red, anything lower (or unknown)
   * amber. Shared rule with the shell tree (see lib/workforce/tree.ts):
   * severity decides the tone, run linkage decides attribution.
   */
  worstIncidentSeverity: string | null;
}

export interface OfficeDesk {
  agentId: string;
  x: number;
  z: number;
  pose: 'seated' | 'working';
  marker: 'none' | 'awaiting' | 'neutral';
  /** Highest point of this desk column (marker tip or label top). */
  topY: number;
  /** Animation driven by stored presence only (see animationFor). */
  animation: 'breathe' | 'typing' | 'stand' | 'none';
}

export interface OfficeRoom {
  department: string;
  /** Grid cell origin (top-left of the room floor). */
  originX: number;
  originZ: number;
  /** Floor width (from desk count). */
  width: number;
  desks: OfficeDesk[];
  alertLight: boolean;
  /**
   * Annex lamp tone from the shared severity rule: 'red' while any open
   * incident is s1/s2, 'amber' while open incidents are lower severity
   * (or severity unknown), null when the lamp is off.
   */
  alertTone: 'red' | 'amber' | null;
  /** In-room approval spot for awaiting figures; null when unused. */
  approvalSpot: { x: number; z: number } | null;
}

export interface OfficeScene {
  rooms: OfficeRoom[];
}

const NON_TERMINAL_TASK = new Set(['queued', 'running', 'awaiting_approval']);
const TITLE_CAP = 80;
const SEVERITY_RANK = ['s1', 's2', 's3', 's4'];

/** Worst severity across incidents, or null when none is known. */
function worstSeverity(incidents: Array<{ severity?: string }>): string | null {
  for (const s of SEVERITY_RANK) {
    if (incidents.some((i) => i.severity === s)) return s;
  }
  return null;
}

function presenceFor(
  statuses: string[],
  approvalIds: Array<string | null | undefined>,
  decidedApprovalIds: readonly string[]
): AgentPresence | 'stale' {
  for (let i = 0; i < statuses.length; i++) {
    const s = statuses[i];
    if (s === 'awaiting_approval') {
      const aid = approvalIds[i];
      if (aid && decidedApprovalIds.includes(aid)) return 'stale';
    }
  }
  if (statuses.includes('awaiting_approval')) return 'awaiting';
  if (statuses.includes('running')) return 'busy';
  if (statuses.some((s) => s !== 'completed' && s !== 'failed' && s !== 'cancelled' && s !== 'idle')) {
    return 'neutral';
  }
  return 'idle';
}

/**
 * Minimal JSON snapshot: ids, names, roles, status labels and counts only.
 * Task titles trimmed to 80 chars. No prompts, tool args, evidence, tokens,
 * or tenant data (tenant_id never selected into the snapshot).
 */
export function buildOfficeSnapshot(raw: CommandCenterRaw): OfficeSnapshot {
  const decided = raw.decidedApprovalIds ?? [];
  const runsByAgent = new Map<string, typeof raw.runs>();
  for (const r of raw.runs) {
    const list = runsByAgent.get(r.agent_id) ?? [];
    list.push(r);
    runsByAgent.set(r.agent_id, list);
  }
  const tasksByAgent = new Map<string, typeof raw.tasks>();
  for (const t of raw.tasks) {
    const list = tasksByAgent.get(t.agent_id) ?? [];
    list.push(t);
    tasksByAgent.set(t.agent_id, list);
  }
  const agents: OfficeAgentSnapshot[] = raw.agents.map((a) => {
    const runs = runsByAgent.get(a.id) ?? [];
    const presenceRaw = presenceFor(
      runs.map((r) => r.status),
      runs.map((r) => r.approval_id),
      decided
    );
    const presence: AgentPresence = presenceRaw === 'stale' ? 'neutral' : presenceRaw;
    const current = (tasksByAgent.get(a.id) ?? []).find((t) => NON_TERMINAL_TASK.has(t.status)) ?? null;
    const newest = runs[0] ?? null;
    return {
      id: a.id,
      name: a.display_name || a.name,
      // Null/empty departments share one deterministic cell (never dropped).
      department: (a.department || '').trim() || 'unassigned',
      statusLabel: a.status,
      presence,
      currentTaskTitle: current ? current.title.slice(0, TITLE_CAP) : null,
      lastActivityAt: newest ? (newest.completed_at ?? newest.created_at) : null,
    };
  });
  return {
    agents,
    openIncidents: raw.incidents.length,
    pendingApprovals: raw.approvals.length,
    worstIncidentSeverity: worstSeverity(raw.incidents),
  };
}

export const DESK_GAP = 3;
export const ROOM_DEPTH = 7;
export const WALL_HEIGHT = 1.2;
export const CELL_PAD = 4;
/** Label sprite half-extents (for fit bounds). */
export const LABEL_HALF_W = 1.7;
export const LABEL_TOP = 4.0;
export const LAMP_TOP = 3.0;
export const MARKER_TOP = 2.6;
export const FLOOR_LABEL_HALF_W = 2.1;
export const FLOOR_LABEL_TOP = 1.4;

/**
 * Pure animation mapping from stored presence. No random wandering, no
 * simulated work: unknown states get no animation at all.
 */
export function animationFor(presence: AgentPresence): 'breathe' | 'typing' | 'stand' | 'none' {
  if (presence === 'busy') return 'typing';
  if (presence === 'awaiting') return 'stand';
  if (presence === 'idle') return 'breathe';
  return 'none';
}

/**
 * Snapshot -> deterministic grid scene model. Rooms are grid cells keyed by
 * sorted department string (cols = ceil(sqrt(n))); a new registry
 * department — or the shared 'unassigned' cell — appears automatically.
 * The reliability annex exists only while open incidents are stored.
 */
export function buildOfficeScene(snapshot: OfficeSnapshot): OfficeScene {
  const byDept = new Map<string, OfficeAgentSnapshot[]>();
  for (const a of [...snapshot.agents].sort((x, y) => x.id.localeCompare(y.id))) {
    const list = byDept.get(a.department) ?? [];
    list.push(a);
    byDept.set(a.department, list);
  }
  const departments = [...byDept.keys()].sort();
  if (snapshot.openIncidents > 0 && !byDept.has('reliability')) {
    departments.push('reliability');
    byDept.set('reliability', []);
  }
  const widths = departments.map((d) => Math.max((byDept.get(d) ?? []).length * DESK_GAP, 6));
  const cellW = Math.max(...widths, 6) + CELL_PAD;
  const cellD = ROOM_DEPTH + CELL_PAD;
  const cols = Math.max(1, Math.ceil(Math.sqrt(departments.length)));
  // Shared severity rule: the annex lamp burns red while any open incident
  // is s1/s2, amber while open incidents are lower severity or unknown.
  const lampTone: 'red' | 'amber' =
    snapshot.worstIncidentSeverity === 's1' || snapshot.worstIncidentSeverity === 's2' ? 'red' : 'amber';
  const rooms: OfficeRoom[] = departments.map((department, ri) => {
    const members = byDept.get(department) ?? [];
    const width = widths[ri];
    const originX = (ri % cols) * cellW;
    const originZ = Math.floor(ri / cols) * cellD;
    const hasAwaiting = members.some((a) => a.presence === 'awaiting');
    const lit = snapshot.openIncidents > 0 && department === 'reliability';
    return {
      department,
      originX,
      originZ,
      width,
      desks: members.map((a, i) => {
        const marker = a.presence === 'awaiting' ? ('awaiting' as const) : a.presence === 'neutral' ? ('neutral' as const) : ('none' as const);
        return {
          agentId: a.id,
          x: originX + i * DESK_GAP,
          z: originZ,
          pose: a.presence === 'busy' ? ('working' as const) : ('seated' as const),
          marker,
          topY: marker !== 'none' ? MARKER_TOP : LABEL_TOP,
          animation: animationFor(a.presence),
        };
      }),
      alertLight: lit,
      alertTone: lit ? lampTone : null,
      approvalSpot: hasAwaiting ? { x: originX + width - 1, z: originZ - 2 } : null,
    };
  });
  return { rooms };
}

/** Floor rect for a room: [minX, maxX] with the 3-unit approach margin. */
export function roomFloor(department: string, originX: number, originZ: number, width: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  void department;
  return { minX: originX - 3, maxX: originX + width, minZ: originZ - ROOM_DEPTH / 2, maxZ: originZ + ROOM_DEPTH / 2 };
}

export interface SceneBounds {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
}

/**
 * Every geometry corner the camera must contain: floor rects, wall tops,
 * desk-column tops (marker/label), lamp tops, and label half-widths.
 */
export function sceneBounds(scene: OfficeScene): SceneBounds {
  let minX = Infinity, maxX = -Infinity, maxY = 1.2, minZ = Infinity, maxZ = -Infinity;
  for (const room of scene.rooms) {
    const f = roomFloor(room.department, room.originX, room.originZ, room.width);
    minX = Math.min(minX, f.minX);
    maxX = Math.max(maxX, f.maxX);
    minZ = Math.min(minZ, f.minZ);
    maxZ = Math.max(maxZ, f.maxZ);
    for (const d of room.desks) {
      minX = Math.min(minX, d.x - LABEL_HALF_W);
      maxX = Math.max(maxX, d.x + LABEL_HALF_W);
      maxY = Math.max(maxY, d.topY);
    }
    if (room.alertLight) maxY = Math.max(maxY, LAMP_TOP);
    if (room.approvalSpot) {
      minX = Math.min(minX, room.approvalSpot.x - 1);
      maxX = Math.max(maxX, room.approvalSpot.x + 1);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -4; maxX = 4; minZ = -4; maxZ = 4;
  }
  return { minX, maxX, minY: 0, maxY, minZ, maxZ };
}

/** Eight corners of the bounds box (legacy coarse fit; prefer sceneSamplePoints). */
export function boundsCorners(b: SceneBounds): Array<{ x: number; y: number; z: number }> {
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (const x of [b.minX, b.maxX]) {
    for (const y of [b.minY, b.maxY]) {
      for (const z of [b.minZ, b.maxZ]) {
        pts.push({ x, y, z });
      }
    }
  }
  return pts;
}

/**
 * Exact fit distance. Corners are given in camera space with the camera AT
 * the target (d = 0): moving out along +z by d keeps a corner visible iff
 * d >= vz + margin*|vx|/(tan*aspect) and d >= vz + margin*|vy|/tan.
 * Returns the minimum d fitting every corner.
 */
export function fitDistance(
  vs: Array<{ x: number; y: number; z: number }>,
  tanHalfFov: number,
  aspect: number,
  margin = 1.1
): number {
  let d = 0.1;
  for (const v of vs) {
    d = Math.max(d, v.z + (margin * Math.abs(v.x)) / (tanHalfFov * aspect));
    d = Math.max(d, v.z + (margin * Math.abs(v.y)) / tanHalfFov);
  }
  return d;
}

/** Mesh budget mirror of the scene component (one mesh ≈ one draw call). */
export function describeRoomMeshes(room: OfficeRoom): { meshes: number; labels: number } {
  const n = room.desks.length;
  // floor(1) + floor department label(1) + back/side/front walls with door
  // gap(5) + plant pot+leaves(2) + sofa seat/back/2 arms when 2+ desks(4)
  // + per desk (desk, chair seat, chair back, monitor, body, head, 2 arms,
  // label = 9) + marker post+cone when flagged(2) + lamp when lit(1).
  const markers = room.desks.filter((d) => d.marker !== 'none').length;
  return {
    meshes: 9 + (n >= 2 ? 4 : 0) + n * 9 + markers * 2 + (room.alertLight ? 1 : 0),
    labels: n + 1,
  };
}

/**
 * Actual geometry sample points for frustum fitting — floor corners and
 * wall tops per room, desk-column tops, label boxes, lamp tops, approval
 * spots. Unlike the bounds-box corners, every point sits on (or at the
 * edge of) visible geometry, so fitting them fills the frame instead of
 * fitting empty box corners.
 */
export function sceneSamplePoints(scene: OfficeScene): Array<{ x: number; y: number; z: number }> {
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (const room of scene.rooms) {
    const f = roomFloor(room.department, room.originX, room.originZ, room.width);
    for (const x of [f.minX, f.maxX]) {
      for (const z of [f.minZ, f.maxZ]) {
        pts.push({ x, y: 0, z });
        pts.push({ x, y: WALL_HEIGHT, z });
      }
    }
    // Floor department label box.
    const fx = (f.minX + f.maxX) / 2;
    const fz = f.maxZ - 0.7;
    pts.push({ x: fx - FLOOR_LABEL_HALF_W, y: FLOOR_LABEL_TOP, z: fz });
    pts.push({ x: fx + FLOOR_LABEL_HALF_W, y: FLOOR_LABEL_TOP, z: fz });
    for (const d of room.desks) {
      pts.push({ x: d.x - LABEL_HALF_W, y: d.topY, z: d.z });
      pts.push({ x: d.x + LABEL_HALF_W, y: d.topY, z: d.z });
    }
    if (room.alertLight) {
      pts.push({ x: (f.minX + f.maxX) / 2, y: LAMP_TOP, z: f.minZ + 1.1 });
    }
    if (room.approvalSpot) {
      pts.push({ x: room.approvalSpot.x, y: 0, z: room.approvalSpot.z });
      pts.push({ x: room.approvalSpot.x, y: 2.2, z: room.approvalSpot.z });
    }
  }
  if (pts.length === 0) {
    pts.push({ x: -4, y: 0, z: -4 }, { x: 4, y: 0, z: 4 });
  }
  return pts;
}

/**
 * Orbit/pick interaction helpers (pure, no three import): drag-to-rotate
 * must never count as a click, the camera must never go below the floor,
 * and snapshot refits must not yank a user-moved camera.
 */

/** Pointer-up within this many px of pointer-down counts as a tap/click. */
export const CLICK_DRAG_THRESHOLD_PX = 6;

/** True when pointer-up is close enough to pointer-down to count as a pick. */
export function isClickNotDrag(
  downX: number,
  downY: number,
  upX: number,
  upY: number,
  thresholdPx: number = CLICK_DRAG_THRESHOLD_PX
): boolean {
  const dx = upX - downX;
  const dy = upY - downY;
  return Math.hypot(dx, dy) <= thresholdPx;
}

/** Orbit clamp factors relative to the exact-fit distance. */
export const ORBIT_MIN_DISTANCE_FACTOR = 0.4;
export const ORBIT_MAX_DISTANCE_FACTOR = 2.5;
/** Just above horizontal: the camera stays above the floor. */
export const ORBIT_MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;
export const ORBIT_MIN_POLAR_ANGLE = 0.12;

export interface OrbitBounds {
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
}

/** Zoom/polar limits derived from the exact-fit distance. */
export function orbitBounds(fittedDistance: number): OrbitBounds {
  return {
    minDistance: fittedDistance * ORBIT_MIN_DISTANCE_FACTOR,
    maxDistance: fittedDistance * ORBIT_MAX_DISTANCE_FACTOR,
    minPolarAngle: ORBIT_MIN_POLAR_ANGLE,
    maxPolarAngle: ORBIT_MAX_POLAR_ANGLE,
  };
}

/** Clamp a dolly distance into the fitted zoom range. */
export function clampOrbitDistance(distance: number, fittedDistance: number): number {
  const b = orbitBounds(fittedDistance);
  return Math.min(b.maxDistance, Math.max(b.minDistance, distance));
}

/** Clamp a polar angle so the camera never drops below the floor. */
export function clampOrbitPolarAngle(polarAngle: number): number {
  return Math.min(ORBIT_MAX_POLAR_ANGLE, Math.max(ORBIT_MIN_POLAR_ANGLE, polarAngle));
}

/**
 * Refit policy: the exact-fit solver sets the initial view and answers an
 * explicit reset; a snapshot refit applies only while the user has never
 * moved the camera — never yanking a user-moved view.
 */
export function shouldApplyFitView(opts: {
  firstLoad: boolean;
  resetRequested: boolean;
  userMoved: boolean;
}): boolean {
  if (opts.firstLoad || opts.resetRequested) return true;
  return !opts.userMoved;
}
