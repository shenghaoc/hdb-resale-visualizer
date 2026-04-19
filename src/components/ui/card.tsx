import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { size?: "default" | "sm" }
>(({ className, size = "default", ...props }, ref) => (
    <div
      data-size={size}
      data-slot="card"
      className={cn(
        "group/card flex flex-col gap-8 overflow-hidden bg-card py-8 text-sm text-card-foreground shadow-sm ring-1 ring-foreground/5 data-[size=sm]:gap-5 data-[size=sm]:py-5",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1.5 px-8 has-[>[data-slot=card-action]]:grid-cols-[1fr_auto] has-[>[data-slot=card-description]]:grid-rows-[auto_auto] group-data-[size=sm]/card:px-5",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      ref={ref}
      {...props}
    />
  ),
);
CardAction.displayName = "CardAction";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      data-slot="card-title"
      className={cn("font-heading text-lg font-semibold uppercase tracking-wider", className)}
      ref={ref}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      ref={ref}
      {...props}
    />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-content"
      className={cn("px-8 group-data-[size=sm]/card:px-5", className)}
      ref={ref}
      {...props}
    />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-8 group-data-[size=sm]/card:px-5", className)}
      ref={ref}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
