"use client";

import * as React from "react";

import { createPortal } from "react-dom";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

/** Hydration-safe "is the DOM available" check for portal rendering. */
const emptySubscribe = () => () => {};
const useIsMounted = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

type MorphDialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  layoutId: string;
  titleId: string;
  descriptionId: string;
  size: keyof typeof SIZE_CLASSES;
  sheet: boolean;
  dismissible: boolean;
  portal: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

const MorphDialogContext = React.createContext<MorphDialogContextValue | null>(
  null,
);

function useMorphDialogContext(component: string): MorphDialogContextValue {
  const context = React.useContext(MorphDialogContext);
  if (!context) {
    throw new Error(`<${component}> must be used within <MorphDialog>.`);
  }
  return context;
}

export type MorphDialogProps = {
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Panel width preset. Ignored by the sheet variant, which spans full width. */
  size?: keyof typeof SIZE_CLASSES;
  /** Pins the panel to the bottom edge as a full-width sheet. */
  sheet?: boolean;
  /** When false, Escape and backdrop clicks no longer close the dialog. */
  dismissible?: boolean;
  /**
   * Render the overlay into `document.body`. Set false to contain the dialog
   * inside the nearest `position: relative` ancestor (previews, embedded
   * stages); body scroll locking is skipped in that mode.
   */
  portal?: boolean;
  children: React.ReactNode;
};

/**
 * The trigger becomes the dialog. Trigger and panel share a `layoutId`, so
 * opening FLIP-morphs the trigger's rect into the dialog panel on `glide`
 * while the backdrop tweens in; closing reverses the morph back into the
 * trigger. Under reduced motion the morph is dropped for a plain fade.
 * Focus is trapped in the panel and restored to the trigger on close.
 */
export function MorphDialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  size = "md",
  sheet = false,
  dismissible = true,
  portal = true,
  children,
}: MorphDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const id = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const context = React.useMemo<MorphDialogContextValue>(
    () => ({
      open,
      setOpen,
      layoutId: `morph-${id}`,
      titleId: `morph-title-${id}`,
      descriptionId: `morph-description-${id}`,
      size,
      sheet,
      dismissible,
      portal,
      triggerRef,
    }),
    [open, setOpen, id, size, sheet, dismissible, portal],
  );

  return (
    <MorphDialogContext.Provider value={context}>
      {children}
    </MorphDialogContext.Provider>
  );
}

export type MorphDialogTriggerProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * The morph source: a card-like button that opens the dialog. While the
 * dialog is open, motion hands its surface off to the panel via the shared
 * `layoutId`, so the trigger appears to physically become the dialog.
 */
export function MorphDialogTrigger({
  children,
  className,
}: MorphDialogTriggerProps) {
  const {
    open,
    setOpen,
    layoutId,
    triggerRef,
  } = useMorphDialogContext("MorphDialogTrigger");
  const motionSafe = useMotionSafe();

  return (
    <motion.button
      ref={triggerRef}
      type="button"
      layoutId={motionSafe ? layoutId : undefined}
      transition={springs.glide}
      style={motionSafe ? { borderRadius: 10 } : undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className={cn(
        "border-border bg-card text-card-foreground hover:bg-accent flex cursor-pointer flex-col items-start gap-1 rounded-3 border p-4 text-left",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

export type MorphDialogContentProps = {
  /** Dialog heading, rendered as an `h2` and wired to `aria-labelledby`. */
  title: string;
  /** Supporting copy under the title, wired to `aria-describedby`. */
  description?: string;
  children?: React.ReactNode;
  className?: string;
};

/**
 * The dialog panel — the morph target. Mounts with the trigger's `layoutId`
 * so the surface glides from the trigger rect into place; interior content
 * fades in on a tween and out at 0.6× on close.
 */
export function MorphDialogContent({
  title,
  description,
  children,
  className,
}: MorphDialogContentProps) {
  const {
    open,
    setOpen,
    layoutId,
    titleId,
    descriptionId,
    size,
    sheet,
    dismissible,
    portal,
    triggerRef,
  } = useMorphDialogContext("MorphDialogContent");
  const motionSafe = useMotionSafe();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const mounted = useIsMounted();

  // Move focus into the panel once it exists.
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Escape closes when dismissible.
  React.useEffect(() => {
    if (!open || !dismissible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dismissible, setOpen]);

  // Body scroll lock — skipped in contained (non-portal) mode.
  React.useEffect(() => {
    if (!open || !portal) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open, portal]);

  // Focus trap: Tab and Shift+Tab cycle within the panel.
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

  const overlay = (
    <AnimatePresence
      onExitComplete={() => triggerRef.current?.focus({ preventScroll: true })}
    >
      {open && (
        <div
          className={cn(
            "inset-0 z-50 flex",
            portal ? "fixed" : "absolute",
            sheet ? "items-end" : "items-center justify-center p-4",
          )}
        >
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: motionSafe
                ? exitFor(durations.base)
                : { duration: durations.fast },
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: durations.fast }
            }
            onClick={dismissible ? () => setOpen(false) : undefined}
            className={cn(
              "inset-0 bg-black/50 backdrop-blur-sm",
              portal ? "fixed" : "absolute",
            )}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            onKeyDown={trapFocus}
            layoutId={motionSafe ? layoutId : undefined}
            initial={motionSafe ? undefined : { opacity: 0 }}
            animate={motionSafe ? undefined : { opacity: 1 }}
            exit={motionSafe ? undefined : { opacity: 0 }}
            transition={motionSafe ? springs.glide : { duration: durations.fast }}
            style={
              motionSafe
                ? { borderRadius: sheet ? "16px 16px 0 0" : 16 }
                : undefined
            }
            className={cn(
              "border-border bg-popover text-popover-foreground relative z-10 flex max-h-full w-full flex-col overflow-hidden border shadow-lg",
              sheet ? "rounded-t-4" : cn("rounded-4", SIZE_CLASSES[size]),
              className,
            )}
          >
            <motion.div
              initial={motionSafe ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={
                motionSafe
                  ? { opacity: 0, transition: exitFor(durations.base) }
                  : undefined
              }
              transition={{ duration: durations.base, ease: easings.enter }}
              className="flex min-h-0 flex-col overflow-y-auto p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 id={titleId} className="text-base leading-tight font-semibold">
                  {title}
                </h2>
                {dismissible && (
                  <button
                    type="button"
                    aria-label="Close dialog"
                    onClick={() => setOpen(false)}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground -mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-2"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              {description && (
                <p
                  id={descriptionId}
                  className="text-muted-foreground mt-1 text-sm"
                >
                  {description}
                </p>
              )}
              {children}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (!portal) return overlay;
  if (!mounted) return null;
  return createPortal(overlay, document.body);
}
