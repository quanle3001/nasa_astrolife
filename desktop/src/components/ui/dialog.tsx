import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-space-black/80 backdrop-blur-md data-[state=open]:animate-[fade-in_.2s_ease-out]" />
      <DialogPrimitive.Content
        className={cn("fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(1040px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-3xl border border-space-border bg-space-bg/95 p-5 shadow-[0_40px_120px_rgba(0,0,0,.7)] outline-none", className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-white/10 bg-black/30 text-space-silver transition hover:border-space-cyan/40 hover:text-white" aria-label="Close preview">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
