import { PointMaterial, Points } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import * as random from "maath/random";
import { Suspense, useMemo, useRef } from "react";
import type { Points as ThreePoints } from "three";

export function StarField({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<ThreePoints>(null);
  const sphere = useMemo(() => random.inSphere(new Float32Array(2400), { radius: 1.25 }), []);
  useFrame((_state, delta) => {
    if (ref.current && !reducedMotion) {
      ref.current.rotation.x -= delta / 15;
      ref.current.rotation.y -= delta / 22;
    }
  });
  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={sphere as Float32Array} stride={3} frustumCulled>
        <PointMaterial transparent color="#d9f7ff" size={0.0024} sizeAttenuation depthWrite={false} opacity={0.8} />
      </Points>
    </group>
  );
}

/** Adapted from Space Portfolio's MIT-licensed StarsCanvas for Vite. */
export function StarBackground({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[1]" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 1] }} dpr={[1, 1.35]} frameloop={reducedMotion ? "demand" : "always"}>
        <Suspense fallback={null}><StarField reducedMotion={reducedMotion} /></Suspense>
      </Canvas>
    </div>
  );
}
