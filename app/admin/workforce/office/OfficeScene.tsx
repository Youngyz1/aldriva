/**
 * OfficeScene — 3D office rendered with plain three (visualization ONLY).
 *
 * The ONLY file that imports three (loaded via next/dynamic ssr:false from
 * OfficeView). No @react-three/fiber: its global JSX typing breaks
 * unrelated components, so the scene drives three imperatively. Built from
 * code primitives — no model, texture or font files, no remote assets.
 * Fixed camera, no orbit controls. Clicking an agent opens its existing
 * detail page (navigation only — never a mutation).
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
    renderer.setClearColor(new THREE.Color("#09090b"));

    const scene3 = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(14, 11, 14);
    camera.lookAt(6, 0, 0);

    scene3.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(8, 12, 6);
    scene3.add(sun);

    const scene = buildOfficeScene(snapshot);
    const animated: Array<{ obj: THREE.Object3D; baseY: number; phase: number; kind: "bob" | "pulse" }> = [];
    const clickTargets: THREE.Mesh[] = [];

    scene.rooms.forEach((room, ri) => {
      const width = Math.max(room.desks.length * 3, 6);
      const cx = ri * 12 + (width - 3) / 2;
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(width + 3, 0.1, 7),
        new THREE.MeshStandardMaterial({ color: 0x27272a })
      );
      floor.position.set(cx, -0.05, 0);
      scene3.add(floor);
      for (const d of room.desks) {
        const desk = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.8, 0.8),
          new THREE.MeshStandardMaterial({ color: 0x3f3f46 })
        );
        desk.position.set(d.x, 0.4, d.z + 0.9);
        scene3.add(desk);
        const bodyY = d.pose === "working" ? 0.55 : 0.35;
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.28, 0.5, 4, 12),
          new THREE.MeshStandardMaterial({ color: POSE_COLOR[d.pose] })
        );
        body.position.set(d.x, bodyY + 0.45, d.z);
        body.userData.agentId = d.agentId;
        scene3.add(body);
        clickTargets.push(body);
        if (d.pose === "working") animated.push({ obj: body, baseY: body.position.y, phase: d.x, kind: "bob" });
        if (d.marker !== "none") {
          const awaiting = d.marker === "awaiting";
          const marker = new THREE.Mesh(
            new THREE.ConeGeometry(0.22, 0.45, 4),
            new THREE.MeshStandardMaterial({
              color: awaiting ? 0xf97316 : 0xa1a1aa,
              emissive: awaiting ? 0xc2410c : 0x000000,
              emissiveIntensity: awaiting ? 0.9 : 0,
            })
          );
          marker.position.set(d.x, bodyY + 0.45 + 1.05, d.z);
          scene3.add(marker);
        }
      }
      if (room.alertLight) {
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 1.2 })
        );
        lamp.position.set(cx, 2.2, -2.4);
        scene3.add(lamp);
        animated.push({ obj: lamp, baseY: 2.2, phase: 0, kind: "pulse" });
      }
    });

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickTargets, false);
      const first = hits[0]?.object as unknown as { userData?: { agentId?: string } } | undefined;
      return first?.userData?.agentId ?? null;
    };
    const onClick = (e: MouseEvent) => {
      const id = pick(e.clientX, e.clientY);
      if (id) pushRef.current?.(`/admin/workforce/agents/${id}`);
    };
    const onMove = (e: MouseEvent) => {
      canvas.style.cursor = pick(e.clientX, e.clientY) ? "pointer" : "auto";
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
          if (a.kind === "bob") a.obj.position.y = a.baseY + Math.sin(t * 2 + a.phase) * 0.06;
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
