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
  const rootRef = React.useRef<HTMLDivElement>(null)
  const onCloseRef = React.useRef(onClose)

  React.useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!open || !dismissible) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current?.()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    rootRef.current?.focus()

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [dismissible, open])

  if (!open) {
    return null
  }

  return (
    <div
      ref={rootRef}
      data-slot="drawer"
      data-dismissible={dismissible}
      tabIndex={-1}
      className={cn("flex h-full min-h-0 flex-col outline-none", className)}
      onKeyDown={onKeyDown}
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
        "rounded-lg",
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
