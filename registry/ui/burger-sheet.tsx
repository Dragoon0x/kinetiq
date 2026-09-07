"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BurgerSheetItem = {
  label: string;
  href: string;
};

export type BurgerSheetProps = {
  /** Links in the sheet, top to bottom. */
  items: BurgerSheetItem[];
  /** Which edge the sheet enters from. */
  side?: "left" | "right";
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state for uncontrolled usage. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The scrolling frame the sheet covers; its scroll locks while open. */
  container?: React.RefObject<HTMLElement | null>;
  /** Heading inside the sheet; also names the dialog. */
  title?: string;
  /** Names the menu button. */
  label?: string;
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Half the gap between the bars: the distance each outer bar travels to meet
 *  the middle and become one stroke of the cross. */
const BAR_TRAVEL = 4;

/**
 * A menu button that turns into its own close button. The middle bar fades
 * while the outer two travel to the centre and rotate on `snap` — the same
 * spring the sheet's links land on, so the cross and the panel read as one
 * gesture rather than two animations that happen to overlap. The sheet itself
 * is a large surface, so it arrives on `glide` and its links cascade in behind
 * it, tightened by `cascade()` to stay inside the 600ms budget. It leaves on
 * the exit ease, never a spring.
 *
 * A real dialog while it is open: focus moves to the panel and is trapped
 * there, Escape closes and returns focus to the button, and the frame passed as
 * `container` stops scrolling underneath. Under reduced motion the sheet fades
 * in place and the bars swap to the cross.
 */
export function BurgerSheet({
  items,
  side = "left",
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  container,
  title = "Menu",
  label = "Menu",
  className,
}: BurgerSheetProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const sheetId = `${baseId}-sheet`;
  const titleId = `${baseId}-title`;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLElement | null>(null);

  const setOpen = (next: boolean) => {
    if (next === open) return;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next) {
      // Returning focus after the exit has begun keeps the button on screen
      // when it is restored, instead of stealing focus mid-transition.
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  // Focus lands on the panel's first control once it exists, not on the button
  // that opened it — the sheet is what the reader was taken to.
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }, [open]);

  // The frame is what stops scrolling, not the document: this sheet lives
  // inside a card, and locking the page would be a lie about its scope.
  React.useEffect(() => {
    const frame = container?.current;
    if (!open || !frame) return;
    const previous = frame.style.getPropertyValue("overflow");
    frame.style.setProperty("overflow", "hidden");
    return () => {
      if (previous) frame.style.setProperty("overflow", previous);
      else frame.style.removeProperty("overflow");
    };
  }, [open, container]);

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (!first || !last) return;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (active === last || !panel.contains(active))
    ) {
      event.preventDefault();
      first.focus();
    }
  };

  const away = side === "left" ? "-100%" : "100%";
  const step = cascade(items.length);
  const barTransition = motionSafe ? springs.snap : { duration: 0 };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? sheetId : undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          "relative z-50 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-2 text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        <span aria-hidden className="relative block size-4">
          <motion.span
            className="absolute inset-x-0 top-[3px] block h-0.5 rounded-full bg-current"
            animate={{ y: open ? BAR_TRAVEL : 0, rotate: open ? 45 : 0 }}
            transition={barTransition}
          />
          <motion.span
            className="absolute inset-x-0 top-1/2 block h-0.5 -translate-y-1/2 rounded-full bg-current"
            animate={{ opacity: open ? 0 : 1 }}
            transition={{ duration: durations.fast, ease: easings.move }}
          />
          <motion.span
            className="absolute inset-x-0 bottom-[3px] block h-0.5 rounded-full bg-current"
            animate={{ y: open ? -BAR_TRAVEL : 0, rotate: open ? -45 : 0 }}
            transition={barTransition}
          />
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="scrim"
            aria-hidden
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="absolute inset-0 z-30 bg-background/70"
          />
        ) : null}

        {open ? (
          <motion.aside
            key="panel"
            ref={panelRef}
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handlePanelKeyDown}
            initial={motionSafe ? { x: away } : { opacity: 0 }}
            animate={motionSafe ? { x: 0 } : { opacity: 1 }}
            exit={
              motionSafe
                ? { x: away, transition: exitFor(durations.base) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.fast, ease: easings.enter }
            }
            className={cn(
              "absolute inset-y-0 z-40 flex w-[78%] max-w-64 flex-col bg-popover text-popover-foreground outline-none",
              side === "left"
                ? "left-0 border-r border-hairline"
                : "right-0 border-l border-hairline",
            )}
          >
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
              <h2 id={titleId} className="truncate text-sm font-semibold">
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-2 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M4 4 L12 12 M12 4 L4 12" />
                </svg>
              </button>
            </div>

            <nav aria-label={title} className="min-h-0 flex-1 overflow-y-auto">
              <ul className="flex flex-col p-2">
                {items.map((item, index) => (
                  <motion.li
                    key={item.href + item.label}
                    initial={
                      motionSafe
                        ? { opacity: 0, x: side === "left" ? -8 : 8 }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                      delay: motionSafe ? index * step : 0,
                    }}
                  >
                    <a
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex h-10 items-center rounded-2 px-3 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                    </a>
                  </motion.li>
                ))}
              </ul>
            </nav>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
