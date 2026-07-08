"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const emptySubscribe = () => () => {};

/** SSR-safe mount check (client snapshot true, server snapshot false). */
const useMounted = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

type SheetApi = {
  snapTo: (index: number) => void;
  currentSnap: () => number;
};

type SheetContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  snapPoints: number[];
  initialSnap: number;
  onSnapChange?: (index: number) => void;
  dismissible: boolean;
  portal: boolean;
  titleId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** Content registers its imperative api; the Handle drives it. */
  registerSheetApi: (api: SheetApi | null) => void;
  getSheetApi: () => SheetApi | null;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext(part: string): SheetContextValue {
  const context = React.useContext(SheetContext);
  if (!context) throw new Error(`${part} must be used within <BottomSheet>`);
  return context;
}

export type BottomSheetProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Ascending fractions of the container height the sheet can rest at. */
  snapPoints?: number[];
  initialSnap?: number;
  onSnapChange?: (index: number) => void;
  dismissible?: boolean;
  /** Portal to body; false contains the sheet in a relative parent. */
  portal?: boolean;
  children: React.ReactNode;
};

/**
 * A draggable sheet with snap points: release projects the gesture
 * (position + velocity × 0.2) and settles on the nearest snap in the
 * direction you were moving — a downward projection past the lowest
 * snap dismisses. The backdrop's opacity is bound to the sheet's travel,
 * live during the drag.
 */
export function BottomSheet({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  snapPoints = [0.4, 0.9],
  initialSnap = 0,
  onSnapChange,
  dismissible = true,
  portal = true,
  children,
}: BottomSheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const sheetApiRef = React.useRef<SheetApi | null>(null);
  const registerSheetApi = React.useCallback((api: SheetApi | null) => {
    sheetApiRef.current = api;
  }, []);
  const getSheetApi = React.useCallback(() => sheetApiRef.current, []);
  const titleId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
      if (!next) requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [controlledOpen, onOpenChange],
  );

  const sorted = React.useMemo(
    () => [...snapPoints].sort((a, b) => a - b),
    [snapPoints],
  );

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      snapPoints: sorted,
      initialSnap: Math.min(initialSnap, sorted.length - 1),
      onSnapChange,
      dismissible,
      portal,
      titleId,
      triggerRef,
      registerSheetApi,
      getSheetApi,
    }),
    [
      open,
      setOpen,
      sorted,
      initialSnap,
      onSnapChange,
      dismissible,
      portal,
      titleId,
      registerSheetApi,
      getSheetApi,
    ],
  );

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

export function BottomSheetTrigger({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  const { setOpen, triggerRef } = useSheetContext("BottomSheetTrigger");
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

export function BottomSheetTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { titleId } = useSheetContext("BottomSheetTitle");
  return (
    <h2 id={titleId} className={cn("text-base font-semibold", className)}>
      {children}
    </h2>
  );
}

/** The grab pill — also the keyboard control for stepping between snaps. */
export function BottomSheetHandle({ className }: { className?: string }) {
  const { snapPoints, getSheetApi } = useSheetContext("BottomSheetHandle");
  const [announcement, setAnnouncement] = React.useState("");

  const step = (delta: number) => {
    const api = getSheetApi();
    if (!api) return;
    const next = Math.min(
      Math.max(api.currentSnap() + delta, 0),
      snapPoints.length - 1,
    );
    api.snapTo(next);
    const fraction = snapPoints[next];
    if (fraction !== undefined) {
      setAnnouncement(`Sheet at ${Math.round(fraction * 100)}%`);
    }
  };

  return (
    <button
      type="button"
      aria-label="Resize sheet"
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          step(1);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          step(-1);
        }
        if (event.key === "Home") {
          event.preventDefault();
          getSheetApi()?.snapTo(0);
        }
        if (event.key === "End") {
          event.preventDefault();
          getSheetApi()?.snapTo(snapPoints.length - 1);
        }
      }}
      className={cn(
        "mx-auto flex h-6 w-full max-w-24 cursor-grab items-center justify-center",
        className,
      )}
    >
      <span aria-hidden className="bg-muted-foreground/40 h-1.5 w-10 rounded-full" />
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </button>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheetContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const {
    open,
    setOpen,
    snapPoints,
    initialSnap,
    onSnapChange,
    dismissible,
    portal,
    titleId,
    registerSheetApi,
  } = useSheetContext("BottomSheetContent");
  const motionSafe = useMotionSafe();
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const snapIndexRef = React.useRef(initialSnap);
  const mounted = useMounted();
  const [containerHeight, setContainerHeight] = React.useState(0);

  const y = useMotionValue(0);

  // Container height: visualViewport when portaled, parent rect otherwise.
  // Initial reads arrive through the observer / a queued frame — state is
  // only ever set from those callbacks.
  React.useEffect(() => {
    if (!open) return;
    const measure = () => {
      if (portal) {
        setContainerHeight(
          window.visualViewport?.height ?? window.innerHeight,
        );
      } else {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (rect) setContainerHeight(rect.height);
      }
    };
    const frame = requestAnimationFrame(measure);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | undefined;
    if (!portal && wrapperRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(wrapperRef.current);
    }
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [open, portal]);

  // y position for a snap fraction: 0 = fully open at container top.
  const yFor = React.useCallback(
    (fraction: number) => containerHeight * (1 - fraction),
    [containerHeight],
  );
  const topSnap = snapPoints[snapPoints.length - 1] ?? 0.9;
  const lowSnap = snapPoints[0] ?? 0.4;
  const yTop = yFor(topSnap);
  const yClosed = containerHeight;

  const backdropOpacity = useTransform(y, [yTop, yClosed], [1, 0]);

  const settleTo = React.useCallback(
    (index: number) => {
      const fraction = snapPoints[index];
      if (fraction === undefined) return;
      snapIndexRef.current = index;
      animate(y, yFor(fraction), motionSafe ? springs.glide : { duration: 0 });
      onSnapChange?.(index);
    },
    [snapPoints, y, yFor, motionSafe, onSnapChange],
  );

  // Expose snap control to the Handle through the provider's registrar.
  React.useEffect(() => {
    registerSheetApi({
      snapTo: settleTo,
      currentSnap: () => snapIndexRef.current,
    });
    return () => registerSheetApi(null);
  }, [settleTo, registerSheetApi]);

  // Enter: rise to the initial snap, once per open, after the first measure.
  const hasEnteredRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      hasEnteredRef.current = false;
      return;
    }
    if (containerHeight === 0 || hasEnteredRef.current) return;
    hasEnteredRef.current = true;
    y.jump(yClosed);
    settleTo(initialSnap);
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
  }, [open, containerHeight, y, yClosed, settleTo, initialSnap]);

  // Escape + focus trap + scroll lock.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) setOpen(false);
      if (event.key === "Tab" && panelRef.current) {
        const focusables = [
          ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ];
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

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const projected = y.get() + info.velocity.y * 0.2;
    // Dismiss when the projection sails past the lowest snap by 15% height.
    if (
      dismissible &&
      projected > yFor(lowSnap) + containerHeight * 0.15
    ) {
      setOpen(false);
      return;
    }
    const movingDown = info.velocity.y > 20;
    const movingUp = info.velocity.y < -20;
    let bestIndex = snapIndexRef.current;
    let bestDistance = Infinity;
    snapPoints.forEach((fraction, index) => {
      const target = yFor(fraction);
      // Direction rule: a downward gesture never picks a higher (more open) snap.
      if (movingDown && target < y.get() - 1) return;
      if (movingUp && target > y.get() + 1) return;
      const distance = Math.abs(projected - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    settleTo(bestIndex);
  };

  const content = (
    <AnimatePresence>
      {open ? (
        <div
          ref={wrapperRef}
          className={cn(
            portal ? "fixed inset-0 z-50" : "absolute inset-0 z-10",
            "overflow-hidden",
          )}
        >
          <motion.div
            aria-hidden
            onClick={() => dismissible && setOpen(false)}
            style={{ opacity: backdropOpacity }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            drag="y"
            dragConstraints={{ top: yTop }}
            dragElastic={0.15}
            dragMomentum={false}
            style={{ y, height: containerHeight || "100%" }}
            onDragEnd={onDragEnd}
            exit={{
              y: yClosed,
              transition: exitFor(durations.slow),
            }}
            className={cn(
              "bg-card border-border absolute inset-x-0 top-0 flex flex-col rounded-t-4 border px-5 pb-5 shadow-lg outline-none",
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
