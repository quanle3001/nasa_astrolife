import { cn } from "@/lib/utils";

interface BorderBeamProps { className?: string; duration?: number; delay?: number }

/** Adapted from Magic UI's MIT-licensed Border Beam component. */
export function BorderBeam({ className, duration = 10, delay = 0 }: BorderBeamProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("border-beam pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={{ "--beam-duration": `${duration}s`, "--beam-delay": `${delay}s` } as React.CSSProperties}
    />
  );
}
