"use client";

import * as React from "react";

import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Hydration-safe "is the DOM available" check for portal rendering. */
const emptySubscribe = () => () => {};
const useIsMounted = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

/** Mirrors registry/ui/caliper-slider.tsx — avoids the "useLayoutEffect does
 * nothing on the server" warning while still measuring the flight before the
 * browser's first paint (a plain useEffect runs after paint, which would
 * flash the natural, centred dialog for a frame before it jumped to sit over
 * the trigger). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Moves focus to the first focusable descendant of `root`, or `root` itself
 * when it has none. Module-level so effects can call it without widening
 * their dependency array. */
const focusFirst = (root: HTMLElement | null) => {
  if (!root) return;
  const first = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  (first ?? root).focus({ preventScroll: true });
};

/** Card-face chrome shared by the resting trigger and the flyer's front
 * face, so the two read as literally the same surface at rest. */
const CARD_CLASSES =
  "border-hairline-strong bg-surface-1 shadow-raised flex flex-col gap-1 overflow-hidden rounded-3 border p-4 text-left";

/** Dialog panel width — height is whatever the content naturally needs. */
const SURFACE_WIDTH_CLASS = "w-[26rem] max-w-[92vw]";

/** The one authored tween driving x/y/scale/rotateY together. */
const FLIGHT_S = 0.55;

type Phase = "closed" | "opening" | "open" | "closing";

type FlightDelta = { dx: number; dy: number; sx: number; sy: number };

/** Center-to-center offset and per-axis scale to go from `to`'s box to
 * `from`'s box — the FLIP inversion shared by the open and close flights. */
const flightDelta = (from: DOMRect, to: DOMRect): FlightDelta => ({
  dx: from.left + from.width / 2 - (to.left + to.width / 2),
  dy: from.top + from.height / 2 - (to.top + to.height / 2),
  sx: from.width / to.width,
  sy: from.height / to.height,
});

export type TurnModalProps = {
  /** The card face at rest. */
  front: React.ReactNode;
  /** The dialog face. */
  children: React.ReactNode;
  /** Dialog accessible name. */
  title: string;
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Rendered card footprint at rest. */
  className?: string;
};

/**
 * A card that becomes a dialog by turning: the trigger's rect is measured on
 * click, and that rect, the viewport centre, and a 0→180° Y rotation are
 * driven together as one authored tween — translation, scale, and the flip
 * never run as separate stages, so the back face swings into view mid-flight
 * rather than after the card has already arrived. Where MorphDialog hands
 * its trigger's surface to the panel through a shared layoutId and settles
 * with a spring, TurnModal shares no layout: it flies a real fixed-position
 * clone over a shrink-proof placeholder and turns it, so the motion always
 * reads as one solid object rotating through space, not a surface morphing
 * shape. Close is the exact same path reversed — flip, travel, and scale run
 * back toward the freshly re-measured trigger rect together — and since the
 * trigger and every dismiss control are gated until a flight lands, a close
 * requested mid-open is deferred rather than retargeted mid-air, so nothing
 * ever strands. Focus moves into the dialog once the flight settles and is
 * trapped there; Escape and a backdrop click close it, and the trigger
 * regains focus once the return flight lands.
 * Reduced motion: no flight and no flip — the dialog appears centred with a
 * short opacity fade, while focus, the trap, and Escape all behave the same.
 */
export function TurnModal({
  front,
  children,
  title,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
}: TurnModalProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  const reactId = React.useId();
  const titleId = `turn-modal-title-${reactId}`;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const initialOpen = controlledOpen ?? defaultOpen;
  const [phase, setPhaseState] = React.useState<Phase>(
    initialOpen ? "open" : "closed",
  );
  const phaseRef = React.useRef<Phase>(phase);
  const setPhase = React.useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  /** A close requested while still "opening" — honored the instant the open
   * flight lands, so a fast close never fights the in-flight tween. */
  const pendingCloseRef = React.useRef(false);

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const cardRectRef = React.useRef<DOMRect | null>(null);

  const mounted = useIsMounted();

  // Identity = landed/open. Seeded straight to the settled back-face angle
  // when the dialog starts out already open (no trigger rect to fly from).
  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);
  const scaleX = useMotionValue<number>(1);
  const scaleY = useMotionValue<number>(1);
  const rotateY = useMotionValue<number>(initialOpen ? 180 : 0);

  const controlsRef = React.useRef<Set<ReturnType<typeof animate>>>(new Set());
  const track = (control: ReturnType<typeof animate>) => {
    const set = controlsRef.current;
    set.add(control);
    const drop = () => set.delete(control);
    control.then(drop, drop);
    return control;
  };
  const seize = () => {
    controlsRef.current.forEach((control) => control.stop());
    controlsRef.current.clear();
  };
  React.useEffect(() => () => seize(), []);

  // Already open on the very first render (defaultOpen or a controlled
  // initial `open`): trap focus immediately, same as any other landed open.
  // Keyed on `mounted` rather than run-once, since the panel only exists in
  // the DOM once the portal itself has mounted.
  React.useEffect(() => {
    if (mounted && phaseRef.current === "open") focusFirst(panelRef.current);
  }, [mounted]);

  const finishOpen = () => {
    setPhase("open");
    focusFirst(panelRef.current);
    if (pendingCloseRef.current) {
      pendingCloseRef.current = false;
      setPhase(motionSafeRef.current ? "closing" : "closed");
    }
  };

  const handleExitComplete = () => {
    triggerRef.current?.focus({ preventScroll: true });
  };

  const handleTriggerClick = () => {
    if (phaseRef.current !== "closed") return;
    // Measured here, in the click handler — never during render.
    cardRectRef.current = triggerRef.current?.getBoundingClientRect() ?? null;
    setOpen(true);
  };

  /** Escape, backdrop click, and the close button all funnel through here.
   * Gated to a fully landed dialog — the chosen fix for "must not strand":
   * requests that arrive mid-flight are deferred, never used to retarget an
   * animation already in the air. */
  const requestClose = () => {
    if (phaseRef.current !== "open") return;
    setOpen(false);
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // The resolved `open` prop is the single source of truth for direction;
  // internal requests (trigger click, Escape, backdrop, close button) only
  // ever flip it via setOpen, then this effect drives the phase machine —
  // so a controlled parent toggling `open` directly is handled identically.
  React.useEffect(() => {
    if (open) {
      if (phaseRef.current !== "closed") return;
      setPhase("opening");
    } else {
      if (phaseRef.current === "closed" || phaseRef.current === "closing") {
        return;
      }
      if (phaseRef.current === "opening") {
        pendingCloseRef.current = true;
        return;
      }
      setPhase(motionSafeRef.current ? "closing" : "closed");
    }
  }, [open, setPhase]);

  // The flight itself: FLIP-invert on entry to "opening" (jump the surface
  // to sit exactly over the trigger, then tween back to identity + 180°),
  // and the mirror image on "closing" (tween from identity toward the
  // freshly re-measured trigger rect). x, y, scaleX, scaleY, and rotateY are
  // each driven by their own animate() call sharing one duration and
  // easing — the house idiom for "one authored tween" across several motion
  // values — so they move as a single continuous motion, never in stages.
  useIsomorphicLayoutEffect(() => {
    if (!motionSafe) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const transition = { duration: FLIGHT_S, ease: easings.move };

    if (phase === "opening") {
      pendingCloseRef.current = false;
      const cardRect =
        cardRectRef.current ??
        triggerRef.current?.getBoundingClientRect() ??
        null;
      cardRectRef.current = null;
      if (!cardRect) {
        // No trigger to fly from (defensive only — the trigger stays
        // mounted, just hidden, for exactly this reason). Land in place.
        x.jump(0);
        y.jump(0);
        scaleX.jump(1);
        scaleY.jump(1);
        rotateY.jump(180);
        finishOpen();
        return;
      }
      const naturalRect = surface.getBoundingClientRect();
      const { dx, dy, sx, sy } = flightDelta(cardRect, naturalRect);

      x.jump(dx);
      y.jump(dy);
      scaleX.jump(sx);
      scaleY.jump(sy);
      rotateY.jump(0);

      seize();
      track(animate(x, 0, transition));
      track(animate(y, 0, transition));
      track(animate(scaleX, 1, transition));
      track(animate(scaleY, 1, transition));
      track(animate(rotateY, 180, { ...transition, onComplete: finishOpen }));
    } else if (phase === "closing") {
      const cardRect = triggerRef.current?.getBoundingClientRect() ?? null;
      if (!cardRect) {
        setPhase("closed");
        return;
      }
      const naturalRect = surface.getBoundingClientRect();
      const { dx, dy, sx, sy } = flightDelta(cardRect, naturalRect);

      seize();
      track(animate(x, dx, transition));
      track(animate(y, dy, transition));
      track(animate(scaleX, sx, transition));
      track(animate(scaleY, sy, transition));
      track(
        animate(rotateY, 0, {
          ...transition,
          onComplete: () => setPhase("closed"),
        }),
      );
    }
  }, [motionSafe, phase]);

  // Latest-ref mirrors: these effects are keyed on phase, not on the
  // functions they call, so they read the current closure through a ref.
  const finishOpenRef = React.useRef(finishOpen);
  const requestCloseRef = React.useRef(requestClose);
  React.useEffect(() => {
    finishOpenRef.current = finishOpen;
    requestCloseRef.current = requestClose;
  });

  // Reduced motion has no flight to land: a short opacity fade stands in,
  // and this timer marks the moment it settles. Self-contained (created and
  // cleared by this one effect), so a plain local timer id is enough — no
  // ref needed, unlike a timer read or cleared from elsewhere.
  React.useEffect(() => {
    if (motionSafe || phase !== "opening") return;
    const timer = window.setTimeout(
      () => finishOpenRef.current(),
      durations.fast * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [motionSafe, phase]);

  const active = phase !== "closed";

  React.useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [active]);

  const overlay = (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {phase !== "closed" && (
        <div
          key="turn-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={motionSafe ? { perspective: perspectives.base } : undefined}
        >
          <motion.div
            aria-hidden
            className="fixed inset-0"
            style={{
              background: "color-mix(in oklab, var(--ink) 40%, transparent)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            onClick={requestClose}
          />

          {motionSafe ? (
            <motion.div
              ref={surfaceRef}
              className={cn(SURFACE_WIDTH_CLASS, "relative z-10")}
              style={{
                x,
                y,
                scaleX,
                scaleY,
                rotateY,
                transformStyle: "preserve-3d",
                willChange: "transform",
              }}
            >
              <div
                aria-hidden
                className={cn(
                  CARD_CLASSES,
                  "absolute inset-0 h-full w-full",
                  className,
                )}
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                {front}
              </div>
              <div
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <DialogPanel
                  panelRef={panelRef}
                  titleId={titleId}
                  title={title}
                  onClose={requestClose}
                  onKeyDown={trapFocus}
                >
                  {children}
                </DialogPanel>
              </div>
            </motion.div>
          ) : (
            <motion.div
              className={cn(SURFACE_WIDTH_CLASS, "relative z-10")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              <DialogPanel
                panelRef={panelRef}
                titleId={titleId}
                title={title}
                onClose={requestClose}
                onKeyDown={trapFocus}
              >
                {children}
              </DialogPanel>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        inert={phase !== "closed" ? true : undefined}
        onClick={handleTriggerClick}
        style={{ visibility: phase === "closed" ? "visible" : "hidden" }}
        className={cn(
          CARD_CLASSES,
          "cursor-pointer outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
          className,
        )}
      >
        {front}
      </button>
      {mounted ? createPortal(overlay, document.body) : null}
    </>
  );
}

type DialogPanelProps = {
  panelRef: React.RefObject<HTMLDivElement | null>;
  titleId: string;
  title: string;
  onClose: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
};

/** The dialog face — a real child component (never a called helper) so its
 * ref and keydown handler stay off the render path. Shared verbatim by the
 * motion-safe back face and the reduced-motion fallback. */
function DialogPanel({
  panelRef,
  titleId,
  title,
  onClose,
  onKeyDown,
  children,
}: DialogPanelProps) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex max-h-[85vh] flex-col overflow-hidden rounded-4 border border-hairline-strong bg-surface-0 shadow-raised"
    >
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
        <h2
          id={titleId}
          className="text-base leading-tight font-semibold text-ink"
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-ink",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  );
}
