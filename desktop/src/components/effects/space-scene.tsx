import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import type { Group } from "three";
import { StarField } from "@/components/effects/star-background";
import type { MissionId } from "@/types/backend";

/**
 * The app's single decorative WebGL scene: the rotating starfield, plus the
 * NASA astronaut model on the welcome and mission screens.
 *
 * The astronaut is decoration only. It carries no health information and is
 * not the anatomy viewer; it leaves the scene before questions, measurements
 * and results are shown. Model: NASA 3D Resources, "Astronaut", by DigitalSpace
 * Corporation (see THIRD_PARTY_NOTICES.md).
 */

const MODEL_URL = "./models/nasa-astronaut.glb";
/** Local Draco decoder, so the model loads without a network connection. */
const DRACO_PATH = "./draco/";
/** The model is about 74 units tall; this brings it to about 2 scene units. */
const MODEL_SCALE = 1 / 37;

export type AstronautVariant = "hero" | "side";
const POSES: Record<AstronautVariant, { position: [number, number, number]; scale: number }> = {
  hero: { position: [1.7, -0.1, -2], scale: 1 },
  // Upper right, beside the page heading and clear of the cards and controls.
  side: { position: [3.7, 1.25, -3.4], scale: 0.5 },
};
/**
 * Coloured lighting per mission. The suit in the NASA model is white, so its
 * colour on screen comes from light: a key light in the mission accent, a rim
 * light from behind and a fill from below.
 */
const MISSION_LIGHTS: Record<MissionId, { key: string; rim: string; fill: string }> = {
  leo: { key: "#7fd4ff", rim: "#2f6bff", fill: "#46d9e8" },
  lunar: { key: "#dfe9ff", rim: "#6f8cff", fill: "#8b7cf6" },
  mars: { key: "#ffb27a", rim: "#ff5a3c", fill: "#c46c3e" },
};

function Astronaut({ variant, pointer, calm }: { variant: AstronautVariant; pointer: MutableRefObject<{ x: number; y: number }>; calm: boolean }) {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH);
  const group = useRef<Group>(null);
  const placed = useRef(false);
  useFrame((state, delta) => {
    const target = group.current;
    if (!target) return;
    const pose = POSES[variant];
    const time = state.clock.elapsedTime;
    // First frame and calm mode jump straight to the pose; otherwise ease toward it.
    const ease = calm || !placed.current ? 1 : 1 - Math.exp(-delta * 4.5);
    placed.current = true;
    const px = calm ? 0 : pointer.current.x;
    const py = calm ? 0 : pointer.current.y;
    const reach = variant === "hero" ? 1 : 0.5;
    const drift = calm ? 0 : Math.sin(time * 0.55) * 0.07;
    // The astronaut floats toward the cursor and turns to face it.
    target.position.x += (pose.position[0] + px * 0.55 * reach - target.position.x) * ease;
    target.position.y += (pose.position[1] + drift - py * 0.4 * reach - target.position.y) * ease;
    target.position.z += (pose.position[2] - target.position.z) * ease;
    target.scale.setScalar(target.scale.x + (pose.scale - target.scale.x) * ease);
    const turn = -0.35 + (calm ? 0 : Math.sin(time * 0.22) * 0.12) + px * 1.15;
    const tilt = 0.05 + (calm ? 0 : Math.sin(time * 0.31) * 0.05) + py * 0.6;
    const roll = 0.08 + (calm ? 0 : Math.sin(time * 0.18) * 0.06) - px * 0.28;
    target.rotation.y += (turn - target.rotation.y) * ease;
    target.rotation.x += (tilt - target.rotation.x) * ease;
    target.rotation.z += (roll - target.rotation.z) * ease;
  });
  return <group ref={group}><primitive object={scene} scale={MODEL_SCALE} /></group>;
}

/** If the model cannot be loaded, the scene simply continues without it. */
class Optional extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function SpaceScene({ reducedMotion, astronaut, mission }: {
  reducedMotion: boolean; astronaut: AstronautVariant | null; mission: MissionId;
}) {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    // The canvas ignores pointer events so the UI stays clickable; track the cursor on the window.
    const move = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[1]" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 1] }} dpr={[1, 1.5]} frameloop={reducedMotion ? "demand" : "always"}>
        <Suspense fallback={null}><StarField reducedMotion={reducedMotion} /></Suspense>
        {astronaut && (
          <Optional>
            <ambientLight intensity={0.3} />
            <directionalLight position={[-3, 4, 4]} intensity={3} color={MISSION_LIGHTS[mission].key} />
            <directionalLight position={[5, 1, -3]} intensity={4.2} color={MISSION_LIGHTS[mission].rim} />
            <directionalLight position={[0.5, -4, 2]} intensity={1.8} color={MISSION_LIGHTS[mission].fill} />
            <Suspense fallback={null}><Astronaut variant={astronaut} pointer={pointer} calm={reducedMotion} /></Suspense>
          </Optional>
        )}
      </Canvas>
    </div>
  );
}
