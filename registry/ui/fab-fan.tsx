"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FabFanAction = {
  id: string;
  label: string;
  /** Key into the built-in icon set; an unknown name draws a dot. */
  icon: string;
  onSelect: () => void;
};

export type FabFanProps = {
  /** Up to five actions; anything past the fifth is dropped so the arc stays legible. */
  actions: FabFanAction[];
  /** Corner the button sits in, and the direction the arc sweeps. */
  placement?: "bottom-right" | "bottom-left";
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accessible name for the trigger. */
  label?: string;
  className?: string;
};

/** Stroked 16×16 marks, subpaths and all — the fan carries its own icon set
 *  rather than pulling in a package. */
const ICONS: Record<string, string> = {
  transfer: "M3.5 6h9 M10 3.5 12.5 6 10 8.5 M12.5 10h-9 M6 7.5 3.5 10 6 12.5",
  request: "M8 3v6.5 M5.25 6.75 8 9.5l2.75-2.75 M3.5 12.5h9",
  split:
    "M2.5 8h3l2.5-4h5 M11 2.5 13.5 4 11 5.5 M5.5 8 8 12h5 M11 10.5 13.5 12 11 13.5",
  note: "M4 2.75h8v10.5H4z M6.25 6h3.5 M6.25 8.75h2.5",
  scan: "M3 6V4.5A1.5 1.5 0 0 1 4.5 3H6 M10 3h1.5A1.5 1.5 0 0 1 13 4.5V6 M13 10v1.5a1.5 1.5 0 0 1-1.5 1.5H10 M6 13H4.5A1.5 1.5 0 0 1 3 11.5V10 M3 8h10",
  dot: "M8 8h.01",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MAX_ACTIONS = 5;
/**
 * Arc radius and item size in px. Five 36px items across a quarter arc sit
 * 44px apart at this radius — the smallest sweep that keeps them from touching
 * — and the widest reach still reads inside a 342px column.
 */
const RADIUS = 112;
const ITEM = 36;
/** Distance from an item's centre to the near edge of its label. */
const LABEL_ANCHOR = ITEM / 2 + 8;

function Glyph({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name] ?? ICONS.dot} />
    </svg>
  );
}

/**
 * Where item `index` sits on the quarter arc, measured from the trigger's
 * centre, plus the outward unit vector at that point — the direction its label
 * is pushed so it clears the neighbouring actions.
 */
function offsetFor(index: number, count: number, inward: number) {
  const t = count > 1 ? index / (count - 1) : 0.5;
  const angle = (t * Math.PI) / 2;
  const ux = inward * Math.sin(angle);
  const uy = -Math.cos(angle);
  return { dx: RADIUS * ux, dy: RADIUS * uy, ux, uy };
}

/**
 * One button fans into five. The plus turns 45° into a cross on `snap` — a
 * switch, so one crisp overshoot — while the actions travel a quarter arc and
 * land on `recoil`, whose ζ0.53 gives each the two small bounces of something
 * arriving. The label of whichever action the pointer or the keyboard is on
 * slides in beside it from `distances.step`. Folding runs the cascade
 * backwards on the exit ease, because exits accelerate away.
 *
 * The trigger is a `menu` button with `aria-expanded`; while open focus is
 * trapped over the trigger and the focused action, Up/Down (and Left/Right,
 * mapped to the arc's direction) walk the list, Home and End jump, Enter and
 * Space select, and Escape folds the fan and returns focus to the trigger.
 * Under reduced motion nothing travels: the actions appear at their stops.
 *
 * Fills the nearest positioned ancestor, so give the surface it sits on
 * `position: relative`.
 */
export function FabFan({
  actions,
  placement = "bottom-right",
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  label = "Actions",
  className,
}: FabFanProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const menuId = `${baseId}-menu`;

  const items = actions.slice(0, MAX_ACTIONS);
  const inward = placement === "bottom-right" ? -1 : 1;
  const stagger = cascade(items.length);

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const [active, setActive] = React.useState(0);
  const [hovered, setHovered] = React.useState<string | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const fabRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  // The fan is opened from the trigger, so the first action takes focus once
  // it has mounted — a frame later, never during the effect body.
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => itemRefs.current[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const openFan = () => {
    setActive(0);
    setOpen(true);
  };

  const closeFan = (returnFocus: boolean) => {
    setHovered(null);
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => fabRef.current?.focus());
  };

  const moveTo = (index: number) => {
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    setActive(wrapped);
    itemRefs.current[wrapped]?.focus();
  };

  const choose = (action: FabFanAction) => {
    closeFan(true);
    action.onSelect();
  };

  const handleItemKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    action: FabFanAction,
  ) => {
    // Left and Right follow the arc rather than the list: for a right-hand fan
    // the actions run leftwards, so Left is "further along".
    const along = placement === "bottom-right" ? "ArrowLeft" : "ArrowRight";
    const back = placement === "bottom-right" ? "ArrowRight" : "ArrowLeft";
    const stops: Record<string, number> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      [along]: index + 1,
      [back]: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const stop = stops[event.key];
    if (stop !== undefined) {
      event.preventDefault();
      moveTo(stop);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(action);
    }
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeFan(true);
      return;
    }
    if (event.key !== "Tab") return;
    const root = rootRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((node) => node.tabIndex >= 0);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      onKeyDown={handleRootKeyDown}
      className={cn("pointer-events-none absolute inset-0 z-20", className)}
    >
      <AnimatePresence>
        {open ? (
          <motion.button
            key="scrim"
            type="button"
            tabIndex={-1}
            aria-label="Close actions"
            onClick={() => closeFan(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
            className="pointer-events-auto absolute inset-0 cursor-default bg-background/55"
          />
        ) : null}
      </AnimatePresence>

      <div
        className={cn(
          "absolute size-14",
          placement === "bottom-right" ? "right-4 bottom-4" : "bottom-4 left-4",
        )}
      >
        <AnimatePresence>
          {open ? (
            <motion.div
              key="menu"
              id={menuId}
              role="menu"
              aria-label={label}
              className="pointer-events-none absolute inset-0"
            >
              {items.map((action, index) => {
                const { dx, dy, ux, uy } = offsetFor(
                  index,
                  items.length,
                  inward,
                );
                const rest = { x: dx - ITEM / 2, y: dy - ITEM / 2, scale: 1 };
                const folded = { x: -ITEM / 2, y: -ITEM / 2, scale: 0.6 };
                const delay = index * stagger;
                const foldDelay = (items.length - 1 - index) * stagger;
                const foldBack = {
                  ...exitFor(durations.base),
                  delay: foldDelay,
                };
                const land = motionSafe
                  ? {
                      ...springs.recoil,
                      delay,
                      opacity: { duration: durations.fast, delay },
                    }
                  : { duration: durations.fast };
                const slide = motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast };
                const showLabel = hovered === action.id || active === index;
                return (
                  <motion.div
                    key={action.id}
                    className="absolute"
                    style={{ left: "50%", top: "50%" }}
                    initial={{
                      ...(motionSafe ? folded : rest),
                      opacity: 0,
                    }}
                    animate={{ ...rest, opacity: 1 }}
                    exit={
                      motionSafe
                        ? { ...folded, opacity: 0, transition: foldBack }
                        : { opacity: 0, transition: exitFor(durations.fast) }
                    }
                    transition={land}
                  >
                    {/* One label at a time, pushed radially outward. Five
                        horizontal pills cannot share a quarter arc without
                        colliding — its vertical pitch near the top is under
                        10px — so the label rides whichever action the pointer
                        or the keyboard is on, clear of its neighbours. */}
                    {showLabel ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute"
                        style={{
                          left: ITEM / 2 + ux * LABEL_ANCHOR,
                          top: ITEM / 2 + uy * LABEL_ANCHOR,
                        }}
                      >
                        <motion.div
                          initial={{
                            x: motionSafe ? -ux * distances.step : 0,
                            y: motionSafe ? -uy * distances.step : 0,
                            opacity: 0,
                          }}
                          animate={{ x: 0, y: 0, opacity: 1 }}
                          transition={slide}
                        >
                          {/* The pill's own transform hangs it off the anchor
                              by its outward edge; motion owns the wrapper's. */}
                          <span
                            style={{
                              transform: `translate(calc(-50% + ${ux * 50}%), calc(-50% + ${uy * 50}%))`,
                            }}
                            className="block max-w-32 truncate rounded-full border border-hairline-strong bg-popover px-2.5 py-1 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-sm"
                          >
                            {action.label}
                          </span>
                        </motion.div>
                      </div>
                    ) : null}

                    <motion.button
                      ref={(node) => {
                        itemRefs.current[index] = node;
                      }}
                      type="button"
                      role="menuitem"
                      aria-label={action.label}
                      tabIndex={index === active ? 0 : -1}
                      title={action.label}
                      onFocus={() => setActive(index)}
                      onPointerEnter={() => setHovered(action.id)}
                      onPointerLeave={() =>
                        setHovered((current) =>
                          current === action.id ? null : current,
                        )
                      }
                      onClick={() => choose(action)}
                      onKeyDown={(event) =>
                        handleItemKeyDown(event, index, action)
                      }
                      whileTap={motionSafe ? { scale: 0.92 } : undefined}
                      transition={springs.flick}
                      className={cn(
                        "pointer-events-auto flex size-9 items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground shadow-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      )}
                    >
                      <Glyph name={action.icon} />
                    </motion.button>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          ref={fabRef}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => (open ? closeFan(false) : openFan())}
          onKeyDown={(event) => {
            if (open) return;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              openFan();
            }
          }}
          whileTap={motionSafe ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "pointer-events-auto absolute inset-0 z-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <motion.span
            aria-hidden
            className="flex"
            animate={{ rotate: open ? 45 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M8 3.25v9.5" />
              <path d="M3.25 8h9.5" />
            </svg>
          </motion.span>
        </motion.button>
      </div>
    </div>
  );
}
