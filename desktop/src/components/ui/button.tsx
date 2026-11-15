import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-45 active:scale-[.98]",
  {
    variants: {
      variant: {
        primary: "border-violet-300/45 bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-[0_0_28px_rgba(112,66,248,.3)] hover:brightness-110",
        secondary: "border-white/12 bg-white/[.055] text-slate-100 hover:border-violet-300/35 hover:bg-violet-400/10",
        ghost: "border-transparent bg-transparent text-slate-300 hover:bg-white/[.06] hover:text-white",
        danger: "border-rose-400/45 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
