"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ConsentCategory = {
  id: string;
  label: string;
  blurb: string;
  /** Locked categories are always granted and cannot be switched off. */
  locked?: boolean;
};

export type ConsentSlabProps = {
  /** Consent categories, drawn in order; lock the ones the product cannot run without. */
  categories: ConsentCategory[];
  /** Fires with every granted id, locked categories included. */
  onDecision: (granted: string[]) => void;
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** Room the slab's own chrome needs; the rest of the frame is the panel's. */
const CHROME = 180;
/** Panel height used until the frame has been measured. */
const PANEL_FALLBACK = 112;
/** How long the stamp is legible before the slab sinks. */
const STAMP_MS = 720;

/**
 * It rises once; the choices unfold. The slab is a large surface, so it comes up
 * on `glide`, and Customise measures its own panel with a ResizeObserver and
 * animates to that exact height — never a reserved box waiting to be filled.
 * A decision stamps into the button row and the slab sinks on the exit ease,
 * leaving a Preferences chip to bring it back. Accepting anything optional
 * lands the stamp on `recoil`; refusing everything lands it on `snap`, because
 * declining is not an occasion to celebrate.
 *
 * A labelled region rather than a dialog: it never traps focus or blocks the
 * page behind it. Each category is a `switch` with `aria-checked`, driven by
 * Enter or Space, and a locked category reports itself checked and disabled.
 * Under reduced motion the slab fades in and out and the panel unfolds
 * instantly, since the choices themselves are information.
 *
 * Fills the nearest positioned ancestor, so give the surface it sits on
 * `position: relative`.
 */
export function ConsentSlab({
  categories,
  onDecision,
  open: controlledOpen,
  defaultOpen = true,
  onOpenChange,
  className,
}: ConsentSlabProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const panelId = `${baseId}-panel`;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const [expanded, setExpanded] = React.useState(false);
  const [allowed, setAllowed] = React.useState<string[]>([]);
  const [stamp, setStamp] = React.useState<string | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);
  const [frameHeight, setFrameHeight] = React.useState(0);

  const optional = categories.filter((category) => !category.locked);
  const lockedIds = categories
    .filter((category) => category.locked)
    .map((category) => category.id);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  // What the frame can spare decides how far the panel may unfold; past that it
  // scrolls, so the decision buttons are never pushed out of the frame.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setFrameHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Height comes from the panel's own measurement, taken in the observer's
  // callback — the effect body never sets state, and nothing reserves space.
  React.useEffect(() => {
    if (!open) return;
    const node = contentRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      setContentHeight(
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  // The stamp is a beat, not a screen: it holds long enough to read, then the
  // slab leaves. Closing early tears the timer down with it.
  React.useEffect(() => {
    if (stamp === null) return;
    const timer = window.setTimeout(() => {
      setStamp(null);
      setOpen(false);
    }, STAMP_MS);
    return () => window.clearTimeout(timer);
  }, [stamp, setOpen]);

  const decide = (optionalIds: string[]) => {
    setAllowed(optionalIds);
    const count = optionalIds.length;
    setStamp(
      count === 0
        ? "Necessary only"
        : count === optional.length
          ? "All accepted"
          : `${count} of ${optional.length} allowed`,
    );
    onDecision([...lockedIds, ...optionalIds]);
  };

  const toggle = (id: string) => {
    setAllowed((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };

  const celebrate = stamp !== null && stamp !== "Necessary only";
  const panelCap =
    frameHeight > 0 ? Math.max(72, frameHeight - CHROME) : PANEL_FALLBACK;
  const panelHeight = expanded ? Math.min(contentHeight, panelCap) : 0;
  const fold = motionSafe
    ? { duration: durations.base, ease: easings.enter }
    : { duration: 0 };

  const actionButton = cn(
    "flex h-9 flex-1 items-center justify-center rounded-2 text-xs font-medium outline-none transition-colors",
    "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
  );

  return (
    <div
      ref={rootRef}
      className={cn("pointer-events-none absolute inset-0 z-20", className)}
    >
      <AnimatePresence>
        {!open ? (
          <motion.button
            key="chip"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, delay: durations.fast }}
            className={cn(
              "pointer-events-auto absolute bottom-3 left-3 flex h-8 items-center gap-2 rounded-full border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground shadow-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                allowed.length > 0 ? "bg-success" : "bg-ink-3",
              )}
            />
            Preferences
          </motion.button>
        ) : null}

        {open ? (
          <motion.section
            key="slab"
            aria-labelledby={titleId}
            initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
            animate={motionSafe ? { y: "0%" } : { opacity: 1 }}
            exit={
              motionSafe
                ? { y: "100%", transition: exitFor(durations.slow) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
            className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-full flex-col gap-2.5 overflow-y-auto rounded-t-4 border-t border-hairline-strong bg-popover p-3 text-popover-foreground shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-sm font-semibold">
                Your data choices
              </h2>
              <p className="text-xs leading-relaxed text-ink-2">
                This site keeps what it needs to run. Everything else is yours
                to allow or refuse.
              </p>
            </div>

            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded((value) => !value)}
              className={cn(
                "flex h-8 w-full items-center justify-between gap-2 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              Customise
              <motion.span
                aria-hidden
                className="flex"
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
                </svg>
              </motion.span>
            </button>

            <motion.div
              id={panelId}
              initial={false}
              animate={{ height: panelHeight }}
              transition={expanded ? fold : { ...fold, ease: easings.exit }}
              className="overflow-hidden"
            >
              {/* Folded away, the switches leave the tab order entirely — a
                  control nobody can see is not one Tab should reach. */}
              <div inert={!expanded} className="h-full overflow-y-auto">
                <div ref={contentRef} className="flex flex-col gap-2 pb-3">
                  {categories.map((category) => {
                    const on = category.locked || allowed.includes(category.id);
                    const labelId = `${baseId}-${category.id}-label`;
                    const blurbId = `${baseId}-${category.id}-blurb`;
                    return (
                      <div
                        key={category.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span
                            id={labelId}
                            className="block text-xs font-medium"
                          >
                            {category.label}
                          </span>
                          <span
                            id={blurbId}
                            className="block text-[11px] leading-snug text-ink-3"
                          >
                            {category.blurb}
                          </span>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-disabled={category.locked || undefined}
                          aria-labelledby={labelId}
                          aria-describedby={blurbId}
                          onClick={() => {
                            if (!category.locked) toggle(category.id);
                          }}
                          className={cn(
                            "relative flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors outline-none",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            on ? "bg-primary" : "bg-hairline-strong",
                            category.locked && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <motion.span
                            aria-hidden
                            className="block size-4 rounded-full bg-background shadow-sm"
                            animate={{ x: on ? 16 : 0 }}
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => decide(allowed)}
                    className={cn(
                      actionButton,
                      "w-full border border-hairline-strong bg-surface-2 text-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    Save choices
                  </button>
                </div>
              </div>
            </motion.div>

            <div className="relative h-9">
              <AnimatePresence initial={false}>
                {stamp === null ? (
                  <motion.div
                    key="choices"
                    className="absolute inset-0 flex items-stretch gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.blink) }}
                    transition={{ duration: durations.fast }}
                  >
                    <button
                      type="button"
                      onClick={() => decide([])}
                      className={cn(
                        actionButton,
                        "border border-hairline-strong bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      Reject all
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        decide(optional.map((category) => category.id))
                      }
                      className={cn(
                        actionButton,
                        "bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                    >
                      Accept all
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="stamp"
                    className={cn(
                      "absolute inset-0 flex items-center justify-center gap-2 rounded-2 border border-hairline-strong bg-surface-2 text-xs font-medium",
                      celebrate ? "text-success" : "text-ink-2",
                    )}
                    initial={
                      motionSafe
                        ? { scale: celebrate ? 1.16 : 1.06, opacity: 0 }
                        : { scale: 1, opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            ...(celebrate ? springs.recoil : springs.snap),
                            opacity: { duration: durations.blink },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="size-3.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3.75 8.5 6.5 11.25 12.25 4.75" />
                    </svg>
                    {stamp}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <span role="status" className="sr-only">
              {stamp ?? ""}
            </span>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
