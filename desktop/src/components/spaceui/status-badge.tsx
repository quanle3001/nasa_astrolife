/**
 * StatusBadge — adapted from Space UI (https://github.com/usespaceui/ui,
 * src/registry/components/spaceui/status-badge). MIT License, Copyright (c) 2026 Space UI.
 *
 * Adaptation for AstroLife: inline mode only, status set reduced to the states
 * the console reports, colors mapped to AstroLife tokens, and the ping
 * animation runs only for a live link and stops under reduced motion.
 */
import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "online" | "offline" | "warning" | "info";

const indicator = cva("relative inline-flex size-2 rounded-full", {
  variants: {
    status: {
      online: "bg-[var(--status-live)]",
      offline: "bg-[#355468]",
      warning: "bg-[var(--status-review)]",
      info: "bg-space-cyan",
    },
  },
});

const ping: Record<StatusTone, string> = {
  online: "bg-[var(--status-live)]",
  offline: "bg-transparent",
  warning: "bg-[var(--status-review)]",
  info: "bg-space-cyan",
};

export interface StatusBadgeProps extends HTMLAttributes<HTMLDivElement> {
  status: StatusTone;
  primaryText: string;
  animated?: boolean;
  /** Hide the text visually (kept for assistive technology). */
  compact?: boolean;
}

export function StatusBadge({ status, primaryText, animated = false, compact = false, className, ...props }: StatusBadgeProps) {
  return (
    <div
      role="status"
      className={cn(
        "status-badge inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold tracking-wide",
        status === "offline" ? "border-white/10 bg-space-black/55 text-space-muted backdrop-blur-md" : "border-space-border bg-space-black/55 text-space-silver backdrop-blur-md",
        className,
      )}
      {...props}
    >
      <span className="relative flex size-2 items-center justify-center" aria-hidden="true">
        {animated && status !== "offline" && <span className={cn("absolute inline-flex size-full rounded-full opacity-70 animate-ping [animation-duration:2.25s] motion-reduce:animate-none", ping[status])} />}
        <span className={indicator({ status })} />
      </span>
      <span className={cn(compact && "sr-only")}>{primaryText}</span>
    </div>
  );
}
