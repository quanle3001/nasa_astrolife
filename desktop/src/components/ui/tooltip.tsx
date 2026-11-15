import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent(props: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content sideOffset={7} className="z-[70] rounded-md border border-space-border bg-space-elevated px-2.5 py-1.5 text-xs text-slate-200 shadow-xl" {...props} />
    </TooltipPrimitive.Portal>
  );
}
