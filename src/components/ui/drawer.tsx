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
  ...props
}: DrawerProps) {
  if (!open) {
    return null
  }

  return (
    <div
      data-slot="drawer"
      className={cn("fixed inset-0 z-50 pointer-events-none", className)}
      {...props}
    >
      {dismissible ? (
        <button
          type="button"
          aria-label="Close drawer"
          className="absolute inset-0 bg-background/30"
          onClick={onClose}
        />
      ) : null}
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
      aria-modal="true"
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-0 flex max-h-dvh flex-col border border-border bg-background shadow-lg outline-none",
        "rounded-t-xl lg:inset-x-auto lg:left-4 lg:top-4 lg:bottom-4 lg:w-[32rem] lg:rounded-xl",
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
