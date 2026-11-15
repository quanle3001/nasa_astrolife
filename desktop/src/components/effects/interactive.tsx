import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { useCalmMotion } from "@/lib/motion-preference";
import { cn } from "@/lib/utils";

/**
 * Cursor-reactive building blocks for the guided flow. They are original
 * AstroLife components written with Motion (already a dependency): a pointer
 * spotlight, a tilting card, a magnetic wrapper and a particle field that
 * yields to the cursor. Each one does nothing under "Pause motion" or the OS
 * reduced-motion setting, and none of them carries information.
 */

/** Writes the pointer position into CSS variables; styling lives in `.pointer-glow`. */
function trackPointer(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
}

/** A surface with a soft light that follows the cursor. No React re-render per move. */
export function PointerGlow({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pointer-glow", className)} onPointerMove={trackPointer} {...props}>{children}</div>;
}

/** Surfaces that light up under the cursor; the matching styles are in the "Motion" section of styles.css. */
const SPOT_SELECTOR = ".glass-panel:not(.pointer-glow), .hazard-card, .question-card, .action-item, .measure-option, .radlab-instrument, .plan-summary, .collect-note, .measure-choice";

/**
 * One listener for the whole window: moves a soft light with the cursor and
 * tells the surface under the cursor where the cursor is. It writes styles
 * directly, at most once per frame, and never re-renders React.
 */
export function CursorAura() {
  const calm = useCalmMotion();
  const aura = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (calm) return undefined;
    let frame = 0;
    let latest: globalThis.PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const event = latest;
      if (!event) return;
      if (aura.current) {
        aura.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
        aura.current.classList.add("is-active");
      }
      const surface = event.target instanceof Element ? event.target.closest<HTMLElement>(SPOT_SELECTOR) : null;
      if (surface) {
        const rect = surface.getBoundingClientRect();
        surface.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
        surface.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
      }
    };
    const move = (event: globalThis.PointerEvent) => { latest = event; if (!frame) frame = requestAnimationFrame(apply); };
    const leave = () => aura.current?.classList.remove("is-active");
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [calm]);
  return calm ? null : <div ref={aura} className="cursor-aura" aria-hidden="true" />;
}

/** A card that leans a few degrees toward the cursor and springs back. */
export function TiltCard({ className, children, maxTilt = 5, style }: {
  className?: string; children: ReactNode; maxTilt?: number; style?: CSSProperties;
}) {
  const calm = useCalmMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-maxTilt, maxTilt]), spring);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [maxTilt, -maxTilt]), spring);
  if (calm) return <div className={cn("pointer-glow", className)} style={style} onPointerMove={trackPointer}>{children}</div>;
  return (
    <motion.div
      className={cn("pointer-glow tilt-card", className)}
      style={{ ...style, rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(event) => {
        trackPointer(event);
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left) / rect.width - 0.5);
        y.set((event.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >{children}</motion.div>
  );
}

/** Pulls its child a few pixels toward the cursor while the cursor is over it. */
export function Magnetic({ children, strength = 0.28, className }: { children: ReactNode; strength?: number; className?: string }) {
  const calm = useCalmMotion();
  const spring = { stiffness: 260, damping: 18, mass: 0.5 };
  const x = useSpring(useMotionValue(0), spring);
  const y = useSpring(useMotionValue(0), spring);
  if (calm) return <span className={cn("inline-flex", className)}>{children}</span>;
  return (
    <motion.span
      className={cn("inline-flex", className)}
      style={{ x, y }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((event.clientY - (rect.top + rect.height / 2)) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >{children}</motion.span>
  );
}

interface Particle { homeX: number; homeY: number; x: number; y: number; vx: number; vy: number; size: number; alpha: number }

/**
 * Decorative particle field drawn on a 2D canvas. Particles drift around a home
 * position, move away from the cursor and ease back. It uses Canvas 2D rather
 * than WebGL so it never competes with the app's single 3D scene, and it stops
 * its animation loop entirely while motion is paused or the tab is hidden.
 */
export function ParticleField({ className, density = 0.00011, color = "159, 220, 245" }: { className?: string; density?: number; color?: string }) {
  const calm = useCalmMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext?.("2d");
    if (!canvas || !context) return undefined;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    const pointer = { x: -9999, y: -9999 };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        context.fillStyle = `rgba(${color}, ${particle.alpha})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
    };
    const layout = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(260, Math.round(width * height * density));
      particles = Array.from({ length: count }, () => {
        const homeX = Math.random() * width;
        const homeY = Math.random() * height;
        return { homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, size: 0.6 + Math.random() * 1.6, alpha: 0.25 + Math.random() * 0.55 };
      });
      draw();
    };
    const step = (time: number) => {
      frame = requestAnimationFrame(step);
      for (const particle of particles) {
        // Gentle drift around home, a push away from the cursor, and friction.
        const driftX = Math.cos(time / 2600 + particle.homeY * 0.02) * 6;
        const driftY = Math.sin(time / 3100 + particle.homeX * 0.02) * 6;
        particle.vx += (particle.homeX + driftX - particle.x) * 0.012;
        particle.vy += (particle.homeY + driftY - particle.y) * 0.012;
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 130 && distance > 0.01) {
          const push = ((130 - distance) / 130) * 1.6;
          particle.vx += (dx / distance) * push;
          particle.vy += (dy / distance) * push;
        }
        particle.vx *= 0.9;
        particle.vy *= 0.9;
        particle.x += particle.vx;
        particle.y += particle.vy;
      }
      draw();
    };
    const move = (event: globalThis.PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };
    const leave = () => { pointer.x = -9999; pointer.y = -9999; };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!calm && !document.hidden) frame = requestAnimationFrame(step);
    };

    layout();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(layout);
    resize?.observe(canvas);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [calm, color, density]);

  return <canvas ref={canvasRef} className={cn("particle-field", className)} aria-hidden="true" />;
}
