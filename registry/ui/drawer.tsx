"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";
import { X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const emptySubscribe = () => () => {};

/** SSR-safe mount check (client snapshot true, server snapshot false). */
const useMounted = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

const SIZES = { sm: 288, md: 360, lg: 440 } as const;

type DrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  side: "left" | "right";
  size: keyof typeof SIZES;
  dismissible: boolean;
  portal: boolean;
  titleId: string;
  descriptionId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

function useDrawerContext(part: string): DrawerContextValue {
  const context = React.useContext(DrawerContext);
  if (!context) throw new Error(`${part} must be used within <Drawer>`);
  return context;
}

export type DrawerProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which edge the panel lives on. */
  side?: "left" | "right";
  size?: keyof typeof SIZES;
  /** Escape, backdrop click, and edge-drag dismissal. */
  dismissible?: boolean;
  /** Portal to body (locks scroll); false contains it in a relative parent. */
  portal?: boolean;
  children: React.ReactNode;
};

/**
 * A side panel on rails: slides in on `glide`, and the panel itself is
 * draggable toward its edge — release past 40% of its width (or a hard
 * flick) lets it leave with the momentum it already has. The backdrop's
 * opacity is bound to the drag, so dismissal fades exactly as far as
 * you've pulled.
 */
export function Drawer({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  side = "right",
  size = "md",
  dismissible = true,
  portal = true,
  children,
}: DrawerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
      if (!next) {
        // Restore focus after the exit begins so the trigger is visible.
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    },
    [controlledOpen, onOpenChange],
  );

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      side,
      size,
      dismissible,
      portal,
      titleId,
      descriptionId,
      triggerRef,
    }),
    [open, setOpen, side, size, dismissible, portal, titleId, descriptionId],
  );

  return (
    <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>
  );
}

export function DrawerTrigger({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  const { setOpen, triggerRef } = useDrawerContext("DrawerTrigger");
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(true)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

export function DrawerTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { titleId } = useDrawerContext("DrawerTitle");
  return (
    <h2 id={titleId} className={cn("text-base font-semibold", className)}>
      {children}
    </h2>
  );
}

export function DrawerDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { descriptionId } = useDrawerContext("DrawerDescription");
  return (
    <p
      id={descriptionId}
      className={cn("text-muted-foreground text-sm", className)}
    >
      {children}
    </p>
  );
}

export function DrawerClose({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  const { setOpen } = useDrawerContext("DrawerClose");
  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className={className}
      {...props}
    >
      {children ?? <X aria-hidden className="size-4" />}
    </button>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DrawerContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const {
    open,
    setOpen,
    side,
    size,
    dismissible,
    portal,
    titleId,
    descriptionId,
  } = useDrawerContext("DrawerContent");
  const motionSafe = useMotionSafe();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const width = SIZES[size];

  const dragX = useMotionValue(0);
  // Pulling toward the edge fades the backdrop exactly as far as you've pulled.
  const dragProgress = useTransform(
    dragX,
    side === "right" ? [0, width] : [0, -width],
    [1, 0],
  );

  // Scroll lock (portal mode only) + Escape + focus management.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        setOpen(false);
      }
      if (event.key === "Tab" && panel) {
        const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (!firstEl || !lastEl) return;
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    let previousOverflow: string | undefined;
    if (portal) {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (portal && previousOverflow !== undefined) {
        document.documentElement.style.overflow = previousOverflow;
      }
      previous?.focus?.();
    };
  }, [open, dismissible, portal, setOpen]);

  const closeFromDrag = (_: unknown, info: PanInfo) => {
    const toward = side === "right" ? 1 : -1;
    const power = (info.offset.x + info.velocity.x * 0.2) * toward;
    if (dismissible && power > width * 0.4) {
      setOpen(false);
    }
  };

  const content = (
    <AnimatePresence>
      {open ? (
        <div
          className={cn(
            portal ? "fixed inset-0 z-50" : "absolute inset-0 z-10",
          )}
        >
          <motion.div
            aria-hidden
            onClick={() => dismissible && setOpen(false)}
            style={{ opacity: dragProgress }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            drag={dismissible ? "x" : false}
            dragConstraints={
              side === "right" ? { left: 0 } : { right: 0 }
            }
            dragElastic={0.05}
            style={{ x: dragX, width }}
            onDragEnd={closeFromDrag}
            initial={
              motionSafe
                ? { x: side === "right" ? width : -width }
                : { opacity: 0 }
            }
            animate={motionSafe ? { x: 0 } : { opacity: 1, x: 0 }}
            exit={
              motionSafe
                ? {
                    x: side === "right" ? width : -width,
                    transition: exitFor(durations.base),
                  }
                : { opacity: 0, transition: { duration: durations.fast } }
            }
            transition={springs.glide}
            className={cn(
              "bg-card border-border absolute top-0 bottom-0 flex max-w-full flex-col gap-3 border p-5 shadow-lg outline-none",
              side === "right" ? "right-0 rounded-l-4" : "left-0 rounded-r-4",
              className,
            )}
          >
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );

  if (portal) {
    if (!mounted) return null;
    return createPortal(content, document.body);
  }
  return content;
}
