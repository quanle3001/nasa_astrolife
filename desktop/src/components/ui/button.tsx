import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "btn inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-space-black disabled:pointer-events-none disabled:opacity-45 active:scale-[.98]",
  {
    variants: {
      variant: {
        primary: "btn-primary border-sky-300/40 bg-gradient-to-r from-[#2563eb] to-[#1aa6c2] text-white shadow-[0_8px_24px_rgba(37,99,235,.28)] hover:brightness-110",
        secondary: "border-space-border bg-space-elevated/60 text-space-white hover:border-space-cyan/40 hover:bg-space-elevated",
        ghost: "border-transparent bg-transparent text-space-silver hover:bg-white/[.06] hover:text-white",
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
