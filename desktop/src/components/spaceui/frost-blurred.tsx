/**
 * FrostBlurred — adapted from Space UI (https://github.com/usespaceui/ui,
 * src/registry/components/spaceui/frost-blurred). MIT License, Copyright (c) 2026 Space UI.
 *
 * Stacked, masked backdrop-filter layers that progressively frost one edge of
 * a media surface. AstroLife uses it so mission captions stay legible without
 * darkening the whole NASA photograph. Adaptation: tint uses the AstroLife
 * space-black token instead of shadcn's --background.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export type FrostBlurredSide = "top" | "bottom" | "left" | "right";

export interface FrostBlurredProps extends React.HTMLAttributes<HTMLDivElement> {
  layers?: number;
  strength?: number;
  height?: string | number;
  side?: FrostBlurredSide;
  /** 0–1 amount of space-black blended in at the frosted edge. */
  tint?: number;
  opacity?: number;
}

const DEFAULT_BLUR_STEPS = [0.084, 0.125, 0.214, 0.386, 0.664, 0.986, 1.15];
const DIRECTION: Record<FrostBlurredSide, string> = { top: "to top", bottom: "to bottom", left: "to left", right: "to right" };

function gradualMask(index: number, count: number, side: FrostBlurredSide) {
  const step = 100 / count;
  const start = (index * step).toFixed(2);
  const peak1 = ((index + 1) * step).toFixed(2);
  const peak2 = ((index + 2) * step).toFixed(2);
  const end = ((index + 3) * step).toFixed(2);
  const dir = DIRECTION[side];
  if (index === count - 1) return `linear-gradient(${dir}, transparent ${start}%, black 100%, black 100%)`;
  if (index === count - 2) return `linear-gradient(${dir}, transparent ${start}%, black ${peak1}%, black 100%, transparent 100%)`;
  return `linear-gradient(${dir}, transparent ${start}%, black ${peak1}%, black ${peak2}%, transparent ${end}%)`;
}

export function FrostBlurred({ layers = 7, strength = 1, height = "62%", side = "bottom", tint = 0, opacity = 0.9, className, style, ...props }: FrostBlurredProps) {
  const count = Math.max(1, Math.round(layers));
  const dim = typeof height === "number" ? `${height}px` : height;
  const horizontal = side === "left" || side === "right";
  const blurs = React.useMemo(() => {
    if (count === DEFAULT_BLUR_STEPS.length) return DEFAULT_BLUR_STEPS.map((value) => value * strength);
    const min = 0.084, max = 1.15;
    return Array.from({ length: count }, (_, i) => min * Math.pow(max / min, count === 1 ? 1 : i / (count - 1)) * strength);
  }, [count, strength]);
  const position: React.CSSProperties = horizontal
    ? { width: dim, top: 0, bottom: 0, [side]: 0 }
    : { height: dim, left: 0, right: 0, [side]: 0 };

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute z-10 select-none overflow-hidden", className)} style={{ ...position, ...style }} {...props}>
      <div className="relative size-full">
        {blurs.map((blur, index) => {
          const mask = gradualMask(index, count, side);
          return (
            <div key={index} className="absolute inset-0" style={{ zIndex: index + 1, backdropFilter: `blur(${blur.toFixed(3)}rem)`, WebkitBackdropFilter: `blur(${blur.toFixed(3)}rem)`, maskImage: mask, WebkitMaskImage: mask, opacity }} />
          );
        })}
        {tint > 0 && (
          <div className="absolute inset-0" style={{ zIndex: count + 1, background: `linear-gradient(${DIRECTION[side]}, transparent 0%, color-mix(in oklab, var(--color-space-black) ${Math.round(tint * 100)}%, transparent) 100%)` }} />
        )}
      </div>
    </div>
  );
}
