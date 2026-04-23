import * as React from "react"

import { cn } from "@/lib/utils"

type DrawerProps = React.ComponentProps<"div"> & {
  open: boolean
  onClose?: () => void
  dismissible?: boolean
}

function Drawer({
  open,
  onClose,
  dismissible = true,
  className,
  children,
  onKeyDown,
  ...props
}: DrawerProps) {
  if (!open) {
    return null
  }

  return (
    <div
      data-slot="drawer"
      data-dismissible={dismissible}
      className={cn("flex h-full min-h-0 flex-col", className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (dismissible && event.key === "Escape") {
          onClose?.();
        }
      }}
      {...props}
    >
      {children}
    </div>
  )
}

type DrawerContentProps = React.ComponentProps<"div"> & {
  hideHandle?: boolean
}

function DrawerContent({ className, hideHandle = false, children, ...props }: DrawerContentProps) {
  return (
    <div
      data-slot="drawer-content"
      role="dialog"
      aria-modal="false"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border border-border bg-background shadow-lg outline-none",
        "rounded-xl",
        className,
      )}
      {...props}
    >
      {hideHandle ? null : (
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
      )}
      {children}
    </div>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("relative flex flex-col gap-2 px-4 pt-4 sm:px-6", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="drawer-title"
      className={cn("font-heading text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

export { Drawer, DrawerContent, DrawerHeader, DrawerTitle }
