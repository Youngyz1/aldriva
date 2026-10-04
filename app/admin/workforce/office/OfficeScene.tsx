/**
 * OfficeScene — 3D office rendered with plain three (visualization ONLY).
 *
 * The ONLY file that imports three (loaded via next/dynamic ssr:false from
 * OfficeView). No @react-three/fiber: its global JSX typing breaks
 * unrelated components, so the scene drives three imperatively. Built from
 * code primitives plus runtime-generated canvas label textures — no model,
 * texture or font files, no remote assets. Fixed camera angle, no orbit
 * controls. Clicking an agent opens its existing detail page (navigation
 * only — never a mutation).
 *
 * Performance: geometries and materials are module-level shared caches
 * (one floor/desk/chair/monitor/figure/head/arm/plant/sofa/wall shape each,
 * one material per color use); only label textures are per-mount and are
 * disposed with the renderer. Decorative furniture is non-interactive and
 * carries no state meaning.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  buildOfficeScene,
  boundsCorners,
  fitDistance,
  sceneBounds,
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
  const pushRef = useRef<((url: string) => void) | null>(null);

  useEffect(() => {
    failRef.current = onWebglFail;
  }, [onWebglFail]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    pushRef.current = ((url: string) => router.push(url));
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

    const makeLabel = (text: string): THREE.Sprite => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 64;
      const g = c.getContext("2d");
      if (g) {
        g.fillStyle = "rgba(9,9,11,0.82)";
        g.beginPath();
        g.roundRect(4, 8, 248, 48, 12);
        g.fill();
        g.fillStyle = "#fafafa";
        g.font = "600 26px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        const label = text.length > 18 ? `${text.slice(0, 17)}…` : text;
        g.fillText(label, 128, 33);
      }
      const tex = new THREE.CanvasTexture(c);
      labelTextures.push(tex);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      labelMaterials.push(spriteMat);
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(2.6, 0.65, 1);
      sprite.renderOrder = 10;
      return sprite;
    };

    const glassMat = stdMat(0x9db8d2, { transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0 });
    const lampMat = stdMat(0xef4444, { emissive: 0xb91c1c, emissiveIntensity: 1.2 });
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
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), lampMat);
        lamp.position.set((f.minX + f.maxX) / 2, 2.6, f.minZ + 1.1);
        scene3.add(lamp);
        animated.push({ obj: lamp, baseY: 2.6, baseRotX: 0, phase: 0, kind: "pulse" });
      }
    });

    // Exact fit: every geometry corner inside the frustum. Corners are
    // expressed in camera space with the camera AT the target, then the
    // minimum distance along the fixed view direction is solved in closed
    // form (see fitDistance). Refit on resize and snapshot change.
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FOV_DEG / 2));
    const corners = boundsCorners(bounds).map((c) => new THREE.Vector3(c.x, c.y, c.z));
    const fitCamera = () => {
      const w = container.clientWidth || 1;
      const h = 420;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.aspect = aspect;
      const target = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 1, 0);
      camera.position.copy(target);
      camera.lookAt(target.clone().sub(VIEW_DIR));
      camera.updateMatrixWorld();
      const vs = corners.map((c) => {
        const v = camera.worldToLocal(c.clone());
        return { x: v.x, y: v.y, z: v.z };
      });
      const dist = fitDistance(vs, tanHalfFov, aspect);
      camera.position.copy(target).addScaledVector(VIEW_DIR, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    };
    fitCamera();
    const ro = new ResizeObserver(fitCamera);
    ro.observe(container);

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const id = pickAgentAt(e.clientX, e.clientY, rect, camera, clickTargets);
      if (id) pushRef.current?.(`/admin/workforce/agents/${id}`);
    };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      canvas.style.cursor = pickAgentAt(e.clientX, e.clientY, rect, camera, clickTargets) ? "pointer" : "auto";
    };
    canvas.addEventListener("click", onClick);
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
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("pointermove", onMove);
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
      <div ref={containerRef} style={{ height: 420 }} />
      <figcaption className="mt-2 text-xs text-zinc-500">
        Amber figure = busy · grey = idle · orange marker = awaiting approval · red light = open incidents. Click a figure to open that agent.
      </figcaption>
    </figure>
  );
}
