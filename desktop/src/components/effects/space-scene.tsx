import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import type { Group } from "three";
import { StarField } from "@/components/effects/star-background";
import { useAstronautPresence, type RenderedAstronautPose } from "@/lib/astronaut-presence";
import type { AstronautPose } from "@/lib/transitions";

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

const POSES: Record<RenderedAstronautPose, { position: [number, number, number]; scale: number }> = {
  hero: { position: [1.7, -0.1, -2], scale: 1 },
  // Upper right, fully above the setup cards and clear of their controls.
  // Raised and reduced so its feet stay above the mission cards at the
  // demo window size, including when the cursor pulls it downward.
  side: { position: [3.75, 2.08, -3.4], scale: 0.38 },
  // Leaves toward the same edge as the supporting pose before unmounting.
  hidden: { position: [4.8, 1.7, -4.2], scale: 0.002 },
};
function Astronaut({ pose, pointer, calm }: { pose: RenderedAstronautPose; pointer: MutableRefObject<{ x: number; y: number }>; calm: boolean }) {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH);
  const group = useRef<Group>(null);
  const placed = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const target = group.current;
    if (!target || !calm) return;
    const targetPose = POSES[pose];
    target.position.set(...targetPose.position);
    target.scale.setScalar(targetPose.scale);
    target.rotation.set(0.05, -0.35, 0.08);
    placed.current = true;
    invalidate();
  }, [pose, calm, invalidate]);
  useFrame((state, delta) => {
    const target = group.current;
    if (!target) return;
    const targetPose = POSES[pose];
    const time = state.clock.elapsedTime;
    // First frame and calm mode jump straight to the pose; otherwise ease toward it.
    const ease = calm || !placed.current ? 1 : 1 - Math.exp(-delta * 4.5);
    placed.current = true;
    const visible = pose !== "hidden";
    const px = calm || !visible ? 0 : pointer.current.x;
    const py = calm || !visible ? 0 : pointer.current.y;
    const reach = pose === "hero" ? 1 : pose === "side" ? 0.25 : 0;
    const drift = calm || !visible ? 0 : Math.sin(time * 0.55) * 0.07;
    // The astronaut floats toward the cursor and turns to face it.
    target.position.x += (targetPose.position[0] + px * 0.55 * reach - target.position.x) * ease;
    target.position.y += (targetPose.position[1] + drift - py * 0.4 * reach - target.position.y) * ease;
    target.position.z += (targetPose.position[2] - target.position.z) * ease;
    target.scale.setScalar(target.scale.x + (targetPose.scale - target.scale.x) * ease);
    const turn = -0.35 + (calm ? 0 : Math.sin(time * 0.22) * 0.12) + px * 1.15;
    const tilt = 0.05 + (calm ? 0 : Math.sin(time * 0.31) * 0.05) + py * 0.6;
    const roll = 0.08 + (calm ? 0 : Math.sin(time * 0.18) * 0.06) - px * 0.28;
    target.rotation.y += (turn - target.rotation.y) * ease;
    target.rotation.x += (tilt - target.rotation.x) * ease;
    target.rotation.z += (roll - target.rotation.z) * ease;
  });
  return <group ref={group}><primitive object={scene} scale={MODEL_SCALE} /></group>;
}

function AstronautPresence({ pose, pointer, calm }: {
  pose: AstronautPose | null; pointer: MutableRefObject<{ x: number; y: number }>; calm: boolean;
}) {
  const renderedPose = useAstronautPresence(pose, calm);
  return renderedPose ? <Astronaut pose={renderedPose} pointer={pointer} calm={calm} /> : null;
}

/** If the model cannot be loaded, the scene simply continues without it. */
class Optional extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function SpaceScene({ reducedMotion, astronaut }: {
  reducedMotion: boolean; astronaut: AstronautPose | null;
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
    <div className="pointer-events-none fixed inset-0 z-[2]" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 1] }} dpr={[1, 1.5]} frameloop={reducedMotion ? "demand" : "always"}>
        <Suspense fallback={null}><StarField reducedMotion={reducedMotion} /></Suspense>
        <Optional>
          {/* Neutral studio lighting keeps the suit white while the angled
              key, rim and fill lights reveal the model's original textures,
              seams, folds, helmet and life-support equipment. */}
          <ambientLight intensity={0.08} />
          <hemisphereLight args={["#ffffff", "#0c1424", 0.22]} />
          <directionalLight position={[-4, 5, 4]} intensity={2.9} color="#ffffff" />
          <directionalLight position={[4.5, 2, -3]} intensity={2.1} color="#e3f3f7" />
          <directionalLight position={[1, -3, 3]} intensity={0.45} color="#b8cbd2" />
          <Suspense fallback={null}><AstronautPresence pose={astronaut} pointer={pointer} calm={reducedMotion} /></Suspense>
        </Optional>
      </Canvas>
    </div>
  );
}
