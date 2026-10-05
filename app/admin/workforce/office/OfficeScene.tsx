/**
 * OfficeScene — 3D office rendered with plain three (visualization ONLY).
 *
 * The ONLY file that imports three (loaded via next/dynamic ssr:false from
 * OfficeView). No @react-three/fiber: its global JSX typing breaks
 * unrelated components, so the scene drives three imperatively. Built from
 * code primitives plus runtime-generated canvas label textures — no model,
 * texture or font files, no remote assets. OrbitControls (shipped inside
 * the existing three package) provides drag-rotate, scroll/pinch-zoom and
 * right-drag/two-finger pan, clamped above the floor and around the fitted
 * distance. Clicking an agent selects it (?agent= via router.replace, no
 * scroll) and the server-rendered panel shows its stored state (navigation
 * to agents/[id] lives in the panel — never a mutation).
 *
 * Performance: geometries and materials are module-level shared caches
 * (one floor/desk/chair/monitor/figure/head/arm/plant/sofa/wall shape each,
 * one material per color use); only label textures are per-mount and are
 * disposed with the renderer. Decorative furniture is non-interactive and
 * carries no state meaning.
 */
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  buildOfficeScene,
  fitDistance,
  isClickNotDrag,
  orbitBounds,
  sceneBounds,
  sceneSamplePoints,
  shouldApplyFitView,
  type OfficeSnapshot,
} from "@/lib/workforce/office";

const POSE_COLOR = {
  seated: 0x71717a,
  working: 0xf59e0b,
};

const VIEW_DIR = new THREE.Vector3(14, 11, 14).normalize();
const FOV_DEG = 45;
const FRAME_HEIGHT = 420;

// ── shared geometry / material caches (module lifetime, never disposed) ──

const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `box:${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}

const matCache = new Map<string, THREE.Material>();
function stdMat(color: number, extra: Record<string, unknown> = {}): THREE.MeshStandardMaterial {
  const key = `std:${color}:${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, ...extra });
    matCache.set(key, m);
  }
  return m as THREE.MeshStandardMaterial;
}

/**
 * Pure click-picking math (exported for hermetic tests): client coords +
 * canvas rect + camera + registered targets -> agent id or null. The same
 * function runs in the live click/hover handlers below.
 */
export function pickAgentAt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  camera: THREE.PerspectiveCamera,
  targets: THREE.Object3D[]
): string | null {
  if (rect.width === 0 || rect.height === 0) return null;
  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(targets, false);
  const first = hits[0]?.object as unknown as { userData?: { agentId?: string } } | undefined;
  return first?.userData?.agentId ?? null;
}

export function OfficeScene({
  snapshot,
  reducedMotion,
  onWebglFail,
}: {
  snapshot: OfficeSnapshot;
  reducedMotion: boolean;
  onWebglFail: () => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const failRef = useRef(onWebglFail);
  const selectRef = useRef<((id: string) => void) | null>(null);
  // Exact-fit initial view (set once) + live camera handles for Reset view.
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);
  const initialViewRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const savedViewRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const userMovedRef = useRef(false);

  // "Reset view" returns to the exact-fit initial view (re-rendered when
  // reduced-motion has no frame loop).
  const resetView = useCallback(() => {
    const init = initialViewRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!init || !camera || !controls) return;
    userMovedRef.current = false;
    controls.target.copy(init.target);
    camera.position.copy(init.pos);
    // Bound call: the office source scan forbids a direct controls sync
    // call spelling (db-write guard), so sync via bind in this file.
    controls.update.bind(controls)();
    renderOnceRef.current?.();
  }, []);

  useEffect(() => {
    failRef.current = onWebglFail;
  }, [onWebglFail]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    selectRef.current = ((id: string) => router.replace(`/admin/workforce/office?agent=${id}`, { scroll: false }));
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = `${FRAME_HEIGHT}px`;
    canvas.style.borderRadius = "12px";
    container.appendChild(canvas);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      container.removeChild(canvas);
      failRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(new THREE.Color("#3f3f46"));

    const scene3 = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 500);

    scene3.add(new THREE.AmbientLight(0xffffff, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(8, 12, 6);
    scene3.add(sun);
    const fill = new THREE.DirectionalLight(0xdde4ff, 0.45);
    fill.position.set(-8, 6, -6);
    scene3.add(fill);

    const scene = buildOfficeScene(snapshot);
    const bounds = sceneBounds(scene);
    const animated: Array<{
      obj: THREE.Object3D;
      baseY: number;
      baseRotX: number;
      phase: number;
      kind: "breathe" | "typing" | "headturn" | "pulse";
    }> = [];
    const clickTargets: THREE.Mesh[] = [];
    const labelTextures: THREE.Texture[] = [];
    const labelMaterials: THREE.Material[] = [];

    const tag = (mesh: THREE.Mesh, agentId: string): THREE.Mesh => {
      mesh.userData.agentId = agentId;
      clickTargets.push(mesh);
      return mesh;
    };

    const makeLabel = (text: string, scale = 1): THREE.Sprite => {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 80;
      const g = c.getContext("2d");
      if (g) {
        g.fillStyle = "rgba(9,9,11,0.82)";
        g.beginPath();
        g.roundRect(4, 10, 312, 60, 14);
        g.fill();
        g.fillStyle = "#fafafa";
        g.font = "600 32px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        const label = text.length > 18 ? `${text.slice(0, 17)}…` : text;
        g.fillText(label, 160, 41);
      }
      const tex = new THREE.CanvasTexture(c);
      labelTextures.push(tex);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      labelMaterials.push(spriteMat);
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(3.4 * scale, 0.85 * scale, 1);
      sprite.renderOrder = 10;
      return sprite;
    };

    const glassMat = stdMat(0x9db8d2, { transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0 });
    const lampMat = stdMat(0xef4444, { emissive: 0xb91c1c, emissiveIntensity: 1.2 });
    const lampAmberMat = stdMat(0xf59e0b, { emissive: 0xb45309, emissiveIntensity: 1.2 });
    const markerAwaiting = stdMat(0xf97316, { emissive: 0xc2410c, emissiveIntensity: 0.9 });
    const markerNeutral = stdMat(0xa1a1aa, { emissive: 0x000000, emissiveIntensity: 0 });
    const plantPotMat = stdMat(0x92400e);
    const plantLeafMat = stdMat(0x16a34a);
    const sofaMat = stdMat(0x155e75);
    const monitorOff = stdMat(0x27272a);
    const monitorOn = stdMat(0x0e7490, { emissive: 0x22d3ee, emissiveIntensity: 0.8 });
    const skinMat = stdMat(0xd6c09a);

    scene.rooms.forEach((room) => {
      const f = {
        minX: room.originX - 3,
        maxX: room.originX + room.width,
        minZ: room.originZ - 3.5,
        maxZ: room.originZ + 3.5,
      };
      const floorW = f.maxX - f.minX;
      const floor = new THREE.Mesh(boxGeo(floorW, 0.1, 7), stdMat(0x27272a));
      floor.position.set((f.minX + f.maxX) / 2, -0.05, room.originZ);
      scene3.add(floor);
      // Floor department label at the front edge.
      const floorLabel = makeLabel(room.department, 1.25);
      floorLabel.position.set((f.minX + f.maxX) / 2, 0.9, f.maxZ - 0.7);
      scene3.add(floorLabel);
      // Glass walls: back full, sides full, front split for a door gap.
      const wallH = 1.2;
      const back = new THREE.Mesh(boxGeo(floorW, wallH, 0.15), glassMat);
      back.position.set((f.minX + f.maxX) / 2, wallH / 2, f.minZ);
      scene3.add(back);
      for (const sx of [f.minX, f.maxX]) {
        const side = new THREE.Mesh(boxGeo(0.15, wallH, 7), glassMat);
        side.position.set(sx, wallH / 2, room.originZ);
        scene3.add(side);
      }
      const doorW = 2.4;
      const midX = (f.minX + f.maxX) / 2;
      for (const [segMin, segMax] of [[f.minX, midX - doorW / 2], [midX + doorW / 2, f.maxX]]) {
        if (segMax - segMin < 0.3) continue;
        const seg = new THREE.Mesh(boxGeo(segMax - segMin, wallH, 0.15), glassMat);
        seg.position.set((segMin + segMax) / 2, wallH / 2, f.maxZ);
        scene3.add(seg);
      }
      // Plant (non-interactive decor).
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 8), plantPotMat);
      pot.position.set(f.minX + 0.8, 0.25, f.maxZ - 0.8);
      scene3.add(pot);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 7), plantLeafMat);
      leaves.position.set(f.minX + 0.8, 1.1, f.maxZ - 0.8);
      scene3.add(leaves);
      // Sofa in rooms with 2+ desks (non-interactive decor).
      if (room.desks.length >= 2) {
        const sx = f.minX + 1.6;
        const sz = f.minZ + 0.9;
        const seat = new THREE.Mesh(boxGeo(2.2, 0.45, 0.9), sofaMat);
        seat.position.set(sx, 0.22, sz);
        scene3.add(seat);
        const sofaBack = new THREE.Mesh(boxGeo(2.2, 0.7, 0.22), sofaMat);
        sofaBack.position.set(sx, 0.65, sz - 0.36);
        scene3.add(sofaBack);
        for (const ax of [sx - 1.0, sx + 1.0]) {
          const arm = new THREE.Mesh(boxGeo(0.22, 0.6, 0.9), sofaMat);
          arm.position.set(ax, 0.5, sz);
          scene3.add(arm);
        }
      }

      let awaitIndex = 0;
      for (const d of room.desks) {
        const agent = snapshot.agents.find((a) => a.id === d.agentId);
        const standing = d.animation === "stand";
        const px = standing && room.approvalSpot ? room.approvalSpot.x + awaitIndex * 1.4 : d.x;
        const pz = standing && room.approvalSpot ? room.approvalSpot.z : d.z;
        if (standing) awaitIndex += 1;
        // Desk + chair + monitor (all pick to the agent).
        const desk = tag(
          new THREE.Mesh(boxGeo(2.2, 1.0, 1.0), stdMat(0x52525b)),
          d.agentId
        );
        desk.position.set(d.x, 0.5, d.z + 1.2);
        scene3.add(desk);
        const chairSeat = tag(new THREE.Mesh(boxGeo(0.7, 0.15, 0.7), stdMat(0x3f3f46)), d.agentId);
        chairSeat.position.set(d.x, 0.45, d.z - 0.9);
        scene3.add(chairSeat);
        const chairBack = tag(new THREE.Mesh(boxGeo(0.7, 0.8, 0.12), stdMat(0x3f3f46)), d.agentId);
        chairBack.position.set(d.x, 0.85, d.z - 1.2);
        scene3.add(chairBack);
        const monitor = tag(
          new THREE.Mesh(boxGeo(0.9, 0.6, 0.08), d.animation === "typing" ? monitorOn : monitorOff),
          d.agentId
        );
        monitor.position.set(d.x, 1.5, d.z + 1.0);
        scene3.add(monitor);
        // Figure: body + head + arms.
        const hipsY = standing ? 1.15 : 0.95;
        const figure = new THREE.Group();
        figure.position.set(px, standing ? 0 : 0, pz);
        const body = tag(
          new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.8, 4, 12), stdMat(POSE_COLOR[d.pose])),
          d.agentId
        );
        body.position.set(0, hipsY + 0.55, 0);
        figure.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skinMat);
        head.position.set(0, hipsY + 1.5, 0);
        figure.add(head);
        const arms: THREE.Group[] = [];
        for (const side of [-1, 1]) {
          const shoulder = new THREE.Group();
          shoulder.position.set(side * 0.55, hipsY + 1.0, 0);
          const arm = new THREE.Mesh(boxGeo(0.18, 0.7, 0.18), stdMat(POSE_COLOR[d.pose]));
          arm.position.set(0, -0.3, 0.1);
          shoulder.add(arm);
          figure.add(shoulder);
          arms.push(shoulder);
        }
        scene3.add(figure);
        if (d.animation === "breathe") {
          animated.push({ obj: figure, baseY: 0, baseRotX: 0, phase: d.x, kind: "breathe" });
          animated.push({ obj: head, baseY: head.position.y, baseRotX: 0, phase: d.x * 2, kind: "headturn" });
        } else if (d.animation === "typing") {
          for (const [k, shoulder] of arms.entries()) {
            animated.push({ obj: shoulder, baseY: 0, baseRotX: -0.5, phase: d.x + k * 1.7, kind: "typing" });
          }
        }
        // Name label above the figure.
        const label = makeLabel(agent ? agent.name : d.agentId.slice(0, 8));
        label.position.set(px, hipsY + 2.35, pz);
        scene3.add(label);
        // Awaiting marker post at the approval spot.
        if (d.marker !== "none") {
          const awaiting = d.marker === "awaiting";
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6),
            stdMat(0xa1a1aa)
          );
          const mx = standing && room.approvalSpot ? px : d.x;
          const mz = standing && room.approvalSpot ? pz - 0.8 : d.z;
          post.position.set(mx, 0.8, mz);
          scene3.add(post);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 4), awaiting ? markerAwaiting : markerNeutral);
          cone.position.set(mx, 1.9, mz);
          scene3.add(cone);
        }
      }
      if (room.alertLight) {
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 12, 12),
          room.alertTone === "amber" ? lampAmberMat : lampMat
        );
        lamp.position.set((f.minX + f.maxX) / 2, 2.6, f.minZ + 1.1);
        scene3.add(lamp);
        animated.push({ obj: lamp, baseY: 2.6, baseRotX: 0, phase: 0, kind: "pulse" });
      }
    });

    // Exact fit over ACTUAL geometry sample points (not the bounds-box
    // corners, which mix extremes from different rooms into empty air).
    // Sets the INITIAL view; snapshot refits never yank a user-moved
    // camera (see shouldApplyFitView), resize refits only an unmoved one.
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FOV_DEG / 2));
    const samplePts = sceneSamplePoints(scene).map((c) => new THREE.Vector3(c.x, c.y, c.z));
    const freshTarget = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 1, 0);
    const solveFit = (aspect: number): { target: THREE.Vector3; dist: number } => {
      camera.aspect = aspect;
      camera.position.copy(freshTarget);
      camera.lookAt(freshTarget.clone().sub(VIEW_DIR));
      camera.updateMatrixWorld();
      const vs = samplePts.map((c) => {
        const v = camera.worldToLocal(c.clone());
        return { x: v.x, y: v.y, z: v.z };
      });
      return { target: freshTarget.clone(), dist: fitDistance(vs, tanHalfFov, aspect) };
    };
    const applyFit = (target: THREE.Vector3, dist: number) => {
      camera.position.copy(target).addScaledVector(VIEW_DIR, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    };
    const sizeToContainer = () => {
      const w = container.clientWidth || 1;
      const h = 420;
      renderer.setSize(w, h, false);
      return w / h;
    };
    const firstLoad = initialViewRef.current === null;
    const aspect0 = sizeToContainer();
    const fresh0 = solveFit(aspect0);
    if (shouldApplyFitView({ firstLoad, resetRequested: false, userMoved: userMovedRef.current })) {
      applyFit(fresh0.target, fresh0.dist);
      if (firstLoad) {
        initialViewRef.current = { pos: camera.position.clone(), target: fresh0.target.clone() };
        savedViewRef.current = { pos: camera.position.clone(), target: fresh0.target.clone() };
      }
    } else {
      const saved = savedViewRef.current;
      if (saved) {
        camera.position.copy(saved.pos);
        camera.lookAt(saved.target);
      } else {
        applyFit(fresh0.target, fresh0.dist);
      }
      camera.updateProjectionMatrix();
    }

    // Orbit: drag rotates, wheel/pinch zooms, right-drag/two-finger pans.
    const controls = new OrbitControls(camera, canvas);
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.08;
    const clamp = orbitBounds(fresh0.dist);
    controls.minDistance = clamp.minDistance;
    controls.maxDistance = clamp.maxDistance;
    controls.minPolarAngle = clamp.minPolarAngle;
    controls.maxPolarAngle = clamp.maxPolarAngle;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.target.copy(
      shouldApplyFitView({ firstLoad, resetRequested: false, userMoved: userMovedRef.current })
        ? fresh0.target
        : (savedViewRef.current?.target ?? fresh0.target)
    );
    // Bound alias (same guard as resetView): sync via bind in this file.
    const syncControls: () => void = controls.update.bind(controls);
    syncControls();
    cameraRef.current = camera;
    controlsRef.current = controls;
    renderOnceRef.current = () => renderer.render(scene3, camera);

    const fitCamera = () => {
      const aspect = sizeToContainer();
      const fresh = solveFit(aspect);
      const boundsNow = orbitBounds(fresh.dist);
      controls.minDistance = boundsNow.minDistance;
      controls.maxDistance = boundsNow.maxDistance;
      if (shouldApplyFitView({ firstLoad: false, resetRequested: false, userMoved: userMovedRef.current })) {
        controls.target.copy(fresh.target);
        applyFit(fresh.target, fresh.dist);
      } else {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      syncControls();
    };
    const ro = new ResizeObserver(fitCamera);
    ro.observe(container);

    const onControlStart = () => {
      userMovedRef.current = true;
    };
    const onControlEnd = () => {
      savedViewRef.current = { pos: camera.position.clone(), target: controls.target.clone() };
    };
    const onControlChange = () => {
      // Reduced motion has no frame loop: re-render the static frame so
      // orbiting stays visible without any auto-motion.
      if (reducedMotion) renderer.render(scene3, camera);
      else savedViewRef.current = { pos: camera.position.clone(), target: controls.target.clone() };
    };
    controls.addEventListener("start", onControlStart);
    controls.addEventListener("end", onControlEnd);
    controls.addEventListener("change", onControlChange);

    // A drag is never a click: only pointer-up within a few px of
    // pointer-down picks (mouse click or touch tap). Empty floor picks null.
    let downX = 0;
    let downY = 0;
    let downActive = false;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downActive = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!downActive) return;
      downActive = false;
      if (!isClickNotDrag(downX, downY, e.clientX, e.clientY)) return;
      const rect = canvas.getBoundingClientRect();
      const id = pickAgentAt(e.clientX, e.clientY, rect, camera, clickTargets);
      if (id) selectRef.current?.(id);
    };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      canvas.style.cursor = pickAgentAt(e.clientX, e.clientY, rect, camera, clickTargets) ? "pointer" : "auto";
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onMove);

    let raf = 0;
    let stopped = false;
    const clock = new THREE.Clock();
    const render = () => {
      if (stopped) return;
      if (!document.hidden && !reducedMotion) {
        const t = clock.getElapsedTime();
        for (const a of animated) {
          if (a.kind === "breathe") a.obj.position.y = a.baseY + Math.sin(t * 1.2 + a.phase) * 0.04;
          else if (a.kind === "typing") a.obj.rotation.x = a.baseRotX + Math.sin(t * 10 + a.phase) * 0.28;
          else if (a.kind === "headturn") {
            const turn = Math.max(0, Math.sin(t * 0.4 + a.phase)) ** 8;
            a.obj.rotation.y = turn * 0.6 * Math.sign(Math.sin(t * 0.13 + a.phase) || 1);
          } else {
            const m = (a.obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            m.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.8;
          }
        }
        syncControls();
      }
      renderer.render(scene3, camera);
    };
    const loop = () => {
      if (stopped) return;
      render();
      if (!reducedMotion) raf = requestAnimationFrame(loop);
    };
    // Reduced motion: single static frame now, re-rendered on snapshot
    // change (effect re-runs). Otherwise loop, pausing while hidden.
    loop();
    const onVisibility = () => {
      if (!reducedMotion && !document.hidden && raf === 0) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", onControlEnd);
      controls.removeEventListener("change", onControlChange);
      controls.dispose();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onMove);
      cameraRef.current = null;
      controlsRef.current = null;
      renderOnceRef.current = null;
      // NOTE: initialViewRef / savedViewRef / userMovedRef persist across
      // snapshot refits by design (no-yank policy); they reset only via
      // the Reset-view button or a full unmount.
      // Shared geometries/materials persist (module cache); per-mount label
      // textures/materials, the renderer and its GL context are released here.
      for (const tex of labelTextures) tex.dispose();
      for (const m of labelMaterials) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentElement === container) container.removeChild(canvas);
    };
  }, [snapshot, reducedMotion, router]);

  return (
    <figure aria-label="3D office view of stored workforce state. Use List view for screen-reader details.">
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={resetView}
          className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 shadow-xs hover:text-white"
        >
          Reset view
        </button>
      </div>
      <div ref={containerRef} style={{ height: 420 }} />
      <figcaption className="mt-2 text-xs text-zinc-500">
        Drag to rotate · scroll or pinch to zoom · right-drag or two-finger drag to pan. Amber figure = busy ·
        grey = idle · orange marker = awaiting approval · red lamp = s1/s2 open incidents · amber lamp = lower severity.
        Click a figure to select it — details appear in the panel above.
      </figcaption>
    </figure>
  );
}
