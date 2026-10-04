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
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildOfficeScene, type OfficeSnapshot } from "@/lib/workforce/office";

const POSE_COLOR = {
  seated: 0x71717a,
  working: 0xf59e0b,
};

const VIEW_DIR = new THREE.Vector3(14, 11, 14).normalize();
const FOV_DEG = 45;
const FRAME_MARGIN = 4;

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
    canvas.style.height = "420px";
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
    const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 400);
    // Fixed angle (VIEW_DIR); distance fitted to the room bounds below.

    // Raised ambient + key/fill directionals so figures read on the floor.
    scene3.add(new THREE.AmbientLight(0xffffff, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(8, 12, 6);
    scene3.add(sun);
    const fill = new THREE.DirectionalLight(0xdde4ff, 0.45);
    fill.position.set(-8, 6, -6);
    scene3.add(fill);

    const scene = buildOfficeScene(snapshot);
    const animated: Array<{ obj: THREE.Object3D; baseY: number; phase: number; kind: "bob" | "pulse" }> = [];
    const clickTargets: THREE.Mesh[] = [];
    const labelTextures: THREE.Texture[] = [];

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
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
      );
      sprite.scale.set(2.6, 0.65, 1);
      sprite.renderOrder = 10;
      return sprite;
    };

    let minX = Infinity;
    let maxX = -Infinity;
    scene.rooms.forEach((room, ri) => {
      const width = Math.max(room.desks.length * 3, 6);
      const cx = ri * 12 + (width - 3) / 2;
      minX = Math.min(minX, cx - (width + 3) / 2);
      maxX = Math.max(maxX, cx + (width + 3) / 2);
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(width + 3, 0.1, 7),
        new THREE.MeshStandardMaterial({ color: 0x27272a })
      );
      floor.position.set(cx, -0.05, 0);
      scene3.add(floor);
      for (const d of room.desks) {
        const desk = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.0, 1.0),
          new THREE.MeshStandardMaterial({ color: 0x52525b })
        );
        desk.position.set(d.x, 0.5, d.z + 1.2);
        desk.userData.agentId = d.agentId;
        scene3.add(desk);
        clickTargets.push(desk);
        const bodyY = d.pose === "working" ? 0.75 : 0.5;
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.42, 0.8, 4, 12),
          new THREE.MeshStandardMaterial({ color: POSE_COLOR[d.pose] })
        );
        body.position.set(d.x, bodyY + 0.65, d.z);
        body.userData.agentId = d.agentId;
        scene3.add(body);
        clickTargets.push(body);
        if (d.pose === "working") animated.push({ obj: body, baseY: body.position.y, phase: d.x, kind: "bob" });
        const agent = snapshot.agents.find((a) => a.id === d.agentId);
        const label = makeLabel(agent ? agent.name : d.agentId.slice(0, 8));
        label.position.set(d.x, bodyY + 0.65 + 1.35, d.z);
        scene3.add(label);
        if (d.marker !== "none") {
          const awaiting = d.marker === "awaiting";
          const marker = new THREE.Mesh(
            new THREE.ConeGeometry(0.3, 0.6, 4),
            new THREE.MeshStandardMaterial({
              color: awaiting ? 0xf97316 : 0xa1a1aa,
              emissive: awaiting ? 0xc2410c : 0x000000,
              emissiveIntensity: awaiting ? 0.9 : 0,
            })
          );
          marker.position.set(d.x, bodyY + 0.65 + 2.1, d.z);
          marker.userData.agentId = d.agentId;
          scene3.add(marker);
          clickTargets.push(marker);
        }
      }
      if (room.alertLight) {
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 1.2 })
        );
        lamp.position.set(cx, 2.6, -2.4);
        scene3.add(lamp);
        animated.push({ obj: lamp, baseY: 2.6, phase: 0, kind: "pulse" });
      }
    });
    if (!Number.isFinite(minX)) {
      minX = -4;
      maxX = 4;
    }

    // Fit every room in frame at any container size, keeping the fixed
    // viewing angle: distance covers the horizontal span (aspect-aware) and
    // the scene height, whichever is larger.
    const fitCamera = () => {
      const w = container.clientWidth || 1;
      const h = 420;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.aspect = aspect;
      const halfFovTan = Math.tan(THREE.MathUtils.degToRad(FOV_DEG / 2));
      const needHalfW = (maxX - minX) / 2 + FRAME_MARGIN;
      const needHalfH = 5 + FRAME_MARGIN / 2;
      const dist = Math.max(needHalfW / (halfFovTan * aspect), needHalfH / halfFovTan);
      const target = new THREE.Vector3((minX + maxX) / 2, 1, 0);
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
          if (a.kind === "bob") a.obj.position.y = a.baseY + Math.sin(t * 2 + a.phase) * 0.08;
          else {
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
      scene3.traverse((obj) => {
        const mesh = obj as unknown as {
          geometry?: { dispose(): void };
          material?: { dispose(): void } | { dispose(): void }[];
        };
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      for (const tex of labelTextures) tex.dispose();
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
