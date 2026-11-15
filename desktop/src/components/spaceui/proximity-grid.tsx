/**
 * ProximityGrid — adapted from Space UI's Interactive Grid Hero
 * (https://github.com/usespaceui/ui, src/registry/blocks/interactive-grid-hero/
 * interactive-grid-hero-1/proximity-grid.tsx). MIT License, Copyright (c) 2026 Space UI.
 *
 * Cells near the pointer round, inset and brighten. All work happens in Motion
 * values on pointer movement, so an idle grid costs no frames. Adaptations:
 * AstroTip cell color token, radial edge fade, disabled under reduced motion,
 * and no min-height / background so it can sit behind hero media.
 */
import { useCalmMotion } from "@/lib/motion-preference";
import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

interface GridCellProps {
  centerX: number; centerY: number; radius: number; inset: number; maxCornerRadius: number;
  pointerX: MotionValue<number>; pointerY: MotionValue<number>; pointerActive: MotionValue<number>;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const GridCell = React.memo(function GridCell({ centerX, centerY, radius, inset, maxCornerRadius, pointerX, pointerY, pointerActive }: GridCellProps) {
  const influence = useTransform(() => {
    const active = pointerActive.get();
    if (active <= 0) return 0;
    const distance = Math.hypot(pointerX.get() - centerX, pointerY.get() - centerY);
    return distance >= radius ? 0 : smoothstep(1 - distance / radius) * active;
  });
  // Always output a valid inset() to avoid GPU compositing-layer caching bugs (upstream note).
  const clipPath = useTransform(influence, (value) => `inset(${value * inset}% round ${value * maxCornerRadius}px)`);
  const opacity = useTransform(influence, [0, 1], [0.35, 1]);
  return <motion.div className="proximity-cell transform-gpu" style={{ clipPath, opacity }} />;
});

export interface ProximityGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cellSize?: number;
  gap?: number;
  /** Response radius in cell units. */
  proximity?: number;
  inset?: number;
}

export function ProximityGrid({ cellSize = 56, gap = 4, proximity = 3.5, inset = 8, className, children, ...props }: ProximityGridProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = Boolean(useCalmMotion());
  const pointerX = useMotionValue(-1000);
  const pointerY = useMotionValue(-1000);
  const rawActive = useMotionValue(0);
  const smoothActive = useSpring(rawActive, { stiffness: 480, damping: 36, mass: 0.8 });
  const [metrics, setMetrics] = React.useState({ columns: 10, rows: 8, size: cellSize });

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const columns = Math.max(1, Math.ceil((Math.max(1, rect.width) + gap) / (cellSize + gap)));
      const size = Math.max(1, (rect.width - gap * (columns - 1)) / columns);
      const rows = Math.max(1, Math.ceil((Math.max(1, rect.height) + gap) / (size + gap)));
      setMetrics((current) => current.columns === columns && current.rows === rows && Math.abs(current.size - size) < .5 ? current : { columns, rows, size });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [cellSize, gap]);

  const cells = React.useMemo(() => Array.from({ length: metrics.columns * metrics.rows }, (_, index) => {
    const col = index % metrics.columns, row = Math.floor(index / metrics.columns);
    return { id: `${row}-${col}`, centerX: col * (metrics.size + gap) + metrics.size / 2, centerY: row * (metrics.size + gap) + metrics.size / 2 };
  }), [metrics, gap]);

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden select-none", className)}
      onPointerMove={(event) => {
        if (reduced) return;
        const rect = event.currentTarget.getBoundingClientRect();
        pointerX.set(event.clientX - rect.left); pointerY.set(event.clientY - rect.top); rawActive.set(1);
      }}
      onPointerLeave={() => rawActive.set(0)}
      {...props}
    >
      <div className="proximity-grid pointer-events-none absolute inset-0 grid content-start" aria-hidden="true" style={{ gap, gridAutoRows: `${metrics.size}px`, gridTemplateColumns: `repeat(${metrics.columns}, ${metrics.size}px)` }}>
        {cells.map((cell) => (
          <GridCell key={cell.id} centerX={cell.centerX} centerY={cell.centerY} radius={metrics.size * proximity} inset={inset} maxCornerRadius={Math.round(cellSize * .35)} pointerX={pointerX} pointerY={pointerY} pointerActive={reduced ? rawActive : smoothActive} />
        ))}
      </div>
      {children}
    </div>
  );
}
