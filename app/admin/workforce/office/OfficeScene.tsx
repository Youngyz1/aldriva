/**
 * OfficeScene — lazy-loaded 3D office (visualization ONLY).
 *
 * The ONLY file that imports three / @react-three/fiber (loaded via
 * next/dynamic ssr:false from OfficeView). Built from code primitives —
 * no model, texture or font files, no remote assets, no workers.
 * Fixed camera, no orbit controls. Clicking an agent opens its existing
 * detail page (navigation only — never a mutation).
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { buildOfficeScene, type OfficeDesk, type OfficeRoom, type OfficeSnapshot } from "@/lib/workforce/office";

const POSE_COLOR: Record<string, string> = {
  seated: "#71717a",
  working: "#f59e0b",
};

function AgentFigure({ desk, agentId, reducedMotion }: { desk: OfficeDesk; agentId: string; reducedMotion: boolean }) {
  const router = useRouter();
  const group = useRef<any>(null);
  useFrame((state) => {
    if (reducedMotion || desk.pose !== "working" || !group.current) return;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 2 + desk.x) * 0.06;
  });
  return (
    <group position={[desk.x, 0, desk.z]}>
      {/* desk */}
      <mesh position={[0, 0.4, 0.9]}>
        <boxGeometry args={[1.6, 0.8, 0.8]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      {/* agent body */}
      <group ref={group} position={[0, desk.pose === "working" ? 0.55 : 0.35, 0]}>
        <mesh
          position={[0, 0.45, 0]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            router.push(`/admin/workforce/agents/${agentId}`);
          }}
          onPointerOver={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
          }}
        >
          <capsuleGeometry args={[0.28, 0.5, 4, 12]} />
          <meshStandardMaterial color={POSE_COLOR[desk.pose]} />
        </mesh>
        {desk.marker !== "none" && (
          <mesh position={[0, 1.5, 0]}>
            <coneGeometry args={[0.22, 0.45, 4]} />
            <meshStandardMaterial
              color={desk.marker === "awaiting" ? "#f97316" : "#a1a1aa"}
              emissive={desk.marker === "awaiting" ? "#c2410c" : "#000000"}
              emissiveIntensity={desk.marker === "awaiting" ? 0.9 : 0}
            />
          </mesh>
        )}
      </group>
    </group>
  );
}

function AlertLight({ x, z, reducedMotion }: { x: number; z: number; reducedMotion: boolean }) {
  const light = useRef<any>(null);
  useFrame((state) => {
    if (reducedMotion || !light.current) return;
    const m = light.current.material as any;
    m.emissiveIntensity = 1.2 + Math.sin(state.clock.elapsedTime * 3) * 0.8;
  });
  return (
    <mesh ref={light} position={[x, 2.2, z]}>
      <sphereGeometry args={[0.25, 12, 12]} />
      <meshStandardMaterial color="#ef4444" emissive="#b91c1c" emissiveIntensity={1.2} />
    </mesh>
  );
}

function Room({ room, roomIndex, reducedMotion }: { room: OfficeRoom; roomIndex: number; reducedMotion: boolean }) {
  const width = Math.max(room.desks.length * 3, 6);
  const cx = roomIndex * 12 + (width - 3) / 2;
  return (
    <group>
      <mesh position={[cx, -0.05, 0]}>
        <boxGeometry args={[width + 3, 0.1, 7]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
      {room.desks.map((d) => (
        <AgentFigure key={d.agentId} desk={d} agentId={d.agentId} reducedMotion={reducedMotion} />
      ))}
      {room.alertLight && <AlertLight x={cx} z={-2.4} reducedMotion={reducedMotion} />}
    </group>
  );
}

/** Dispose every geometry/material plus the renderer on unmount. */
function Disposer() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    return () => {
      gl.scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        const mat = obj.material as any;
        if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose());
        else if (mat) mat.dispose();
      });
      gl.dispose();
    };
  }, [gl]);
  return null;
}

export function OfficeScene({
  snapshot,
  reducedMotion,
}: {
  snapshot: OfficeSnapshot;
  reducedMotion: boolean;
}) {
  const scene = buildOfficeScene(snapshot);
  return (
    <figure aria-label="3D office view of stored workforce state. Use List view for screen-reader details.">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [14, 11, 14], fov: 45 }}
        frameloop={reducedMotion ? "never" : "always"}
        style={{ height: 420, background: "#09090b", borderRadius: 12 }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[8, 12, 6]} intensity={1.1} />
        <color attach="background" args={[new THREE.Color("#09090b")]} />
        {scene.rooms.map((room, i) => (
          <Room key={room.department} room={room} roomIndex={i} reducedMotion={reducedMotion} />
        ))}
        <Disposer />
      </Canvas>
      <figcaption className="mt-2 text-xs text-zinc-500">
        Amber figure = busy · grey = idle · orange marker = awaiting approval · red light = open incidents. Click a figure to open that agent.
      </figcaption>
    </figure>
  );
}
