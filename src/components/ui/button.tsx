"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border border-transparent bg-clip-padding text-xs/relaxed font-medium focus-visible:ring-[2px] aria-invalid:ring-[2px] [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border dark:bg-input/30 hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40 dark:hover:bg-destructive/30",
        "destructive-solid":
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 focus-visible:border-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Touch-sized (>=44px) at the base breakpoint, compact from sm: up for
      // fine pointers only.
      size: {
        default:
          "h-11 gap-1.5 px-3 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 sm:pointer-fine:h-7 sm:pointer-fine:gap-1 sm:pointer-fine:px-2 sm:pointer-fine:text-xs/relaxed sm:pointer-fine:has-data-[icon=inline-end]:pr-1.5 sm:pointer-fine:has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-4 sm:pointer-fine:[&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-8 gap-1 rounded-sm px-2 text-2xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 sm:pointer-fine:h-5 [&_svg:not([class*='size-'])]:size-3 sm:pointer-fine:[&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-9 gap-1 px-2.5 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 sm:pointer-fine:h-6 sm:pointer-fine:px-2 sm:pointer-fine:text-xs/relaxed [&_svg:not([class*='size-'])]:size-3.5 sm:pointer-fine:[&_svg:not([class*='size-'])]:size-3",
        lg: "h-11 gap-1.5 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 sm:pointer-fine:h-8 sm:pointer-fine:px-2.5 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-11 sm:pointer-fine:size-7 [&_svg:not([class*='size-'])]:size-4 sm:pointer-fine:[&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs":
          "size-8 rounded-sm sm:pointer-fine:size-5 [&_svg:not([class*='size-'])]:size-3 sm:pointer-fine:[&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm":
          "size-10 sm:pointer-fine:size-6 [&_svg:not([class*='size-'])]:size-4 sm:pointer-fine:[&_svg:not([class*='size-'])]:size-3",
        "icon-lg":
          "size-11 sm:pointer-fine:size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
