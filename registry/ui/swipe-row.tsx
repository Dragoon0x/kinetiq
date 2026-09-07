"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SwipeAction = {
  id: string;
  label: string;
  /** One of the built-in glyph names; anything else draws the label alone. */
  icon: string;
  tone?: "neutral" | "danger";
  onSelect: () => void;
};

export type SwipeRowProps = {
  ref?: React.Ref<HTMLLIElement>;
  /** Revealed by dragging right. The first one is what an overswipe runs. */
  leading?: SwipeAction[];
  /** Revealed by dragging left. The first one is what an overswipe runs. */
  trailing?: SwipeAction[];
  /** Fraction of the row's width that arms the first action. */
  threshold?: number;
  children: React.ReactNode;
  /** Names the menu button that carries the same actions to the keyboard. */
  menuLabel?: string;
  className?: string;
};

type Side = "leading" | "trailing" | null;
type Drag = { x: number; y: number; base: number; claimed: boolean };

const NO_ACTIONS: SwipeAction[] = [];

/** Every action is this wide, so the open stop is a design constant rather than
 *  a measurement — one less thing to be wrong on the first gesture. */
const ACTION_WIDTH = 64;

/** Past the open stop the row still moves, at a third of the pointer's travel,
 *  so the overswipe is felt as effort rather than as free travel. */
const RESISTANCE = 0.34;

/** Horizontal travel that claims the gesture. Below it a press is still a
 *  press and a vertical drag still belongs to whatever scrolls behind. */
const CLAIM = 4;

const ICONS: Record<string, string> = {
  archive: "M2.5 3.5h11v3h-11z M4 6.5v6h8v-6 M6.5 9h3",
  trash: "M3.5 4.5h9 M6.5 4.5V3h3v1.5 M5 4.5l.5 8.5h5l.5-8.5",
  flag: "M4.5 13.5V2.5 M4.5 3h7l-1.5 2.5L11.5 8h-7",
  mail: "M2.5 4h11v8h-11z M2.5 4.5l5.5 4 5.5-4",
  check: "M3.5 8.5l3 3 6-6",
  clock: "M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z M8 5.5v3l2 1.5",
};

/** Arrow keys walk the menu; Home and End jump. */
const MENU_STEP: Record<string, (at: number, count: number) => number> = {
  ArrowDown: (at) => at + 1,
  ArrowUp: (at) => at - 1,
  Home: () => 0,
  End: (_at, count) => count - 1,
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function ActionGlyph({ name }: { name: string }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

/**
 * The slab of actions parked on one side. It is aria-hidden and out of the tab
 * order on purpose: the same actions are in the row's menu, and a second copy
 * would make every row cost three tab stops instead of one.
 */
function ActionPane({
  actions,
  side,
  armed,
  motionSafe,
  onRun,
}: {
  actions: SwipeAction[];
  side: "leading" | "trailing";
  armed: boolean;
  motionSafe: boolean;
  onRun: (action: SwipeAction) => void;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-y-0 flex",
        side === "leading" ? "left-0" : "right-0",
      )}
    >
      {actions.map((action, at) => (
        <button
          key={action.id}
          type="button"
          tabIndex={-1}
          onClick={() => onRun(action)}
          style={{ width: ACTION_WIDTH }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 px-2 text-[10px] font-medium outline-none",
            action.tone === "danger"
              ? "bg-destructive text-destructive-foreground"
              : "bg-surface-2 text-ink-2",
          )}
        >
          <motion.span
            className="flex flex-col items-center gap-1"
            animate={{ scale: armed && at === 0 && motionSafe ? 1.16 : 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          >
            <ActionGlyph name={action.icon} />
            <span className="max-w-full truncate">{action.label}</span>
          </motion.span>
        </button>
      ))}
    </div>
  );
}

/**
 * A list row with its actions parked underneath. Dragging moves the row 1:1
 * with the pointer until it passes the open stop, after which it resists — the
 * row can still be pulled to the overswipe threshold, but you feel the extra
 * travel you are asking for. Cross that threshold and the first action arms: it
 * grows on `flick`, because arming is an acknowledgement and must land before
 * the finger lifts. Release settles on `snap`; releasing while armed runs it.
 *
 * The pointer is claimed only after 4px of horizontal travel and the gesture
 * stands down when the travel is vertical, so a tap stays a tap and the list
 * still scrolls under the thumb. Every action is also in the row's menu, where
 * Arrow keys move, Home and End jump and Escape closes and returns focus — the
 * swipe is a shortcut, never the only way in. Under reduced motion the row
 * reveals and closes without springs.
 */
export function SwipeRow({
  ref,
  leading = NO_ACTIONS,
  trailing = NO_ACTIONS,
  threshold = 0.6,
  children,
  menuLabel = "Row actions",
  className,
}: SwipeRowProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const menuId = `${baseId}-menu`;
  const buttonId = `${baseId}-button`;

  const rootRef = React.useRef<HTMLLIElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const x = useMotionValue(0);
  const settleRef = React.useRef<{ stop: () => void } | null>(null);

  const [rowWidth, setRowWidth] = React.useState(0);
  const [armed, setArmed] = React.useState<Side>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const openRef = React.useRef<Side>(null);
  const armedRef = React.useRef<Side>(null);
  const drag = React.useRef<Drag | null>(null);
  // A drag ends in a click on the surface; without this the click that finished
  // the swipe would close the row it just opened.
  const swallowClick = React.useRef(false);

  const leadCount = leading.length;
  const trailCount = trailing.length;
  const openLead = leadCount * ACTION_WIDTH;
  const openTrail = trailCount * ACTION_WIDTH;
  // Before the observer has spoken there is no width to measure an overswipe
  // against, so nothing can arm — a sweep at mount must not fire an action.
  const arm = rowWidth > 0 ? rowWidth * threshold : Number.POSITIVE_INFINITY;

  // ResizeObserver fires once on observe, so the row's width is known before
  // the first gesture without measuring during render.
  React.useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setRowWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => () => settleRef.current?.stop(), []);

  const moveTo = React.useCallback(
    (side: Side, to: number) => {
      openRef.current = side;
      armedRef.current = null;
      setArmed(null);
      settleRef.current?.stop();
      settleRef.current = null;
      if (!motionSafe) {
        x.set(to);
        return;
      }
      settleRef.current = animate(x, to, springs.snap);
    },
    [motionSafe, x],
  );

  const close = React.useCallback(() => moveTo(null, 0), [moveTo]);

  // An open row, and an open menu, stand down when the next press lands
  // anywhere else on the page.
  React.useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const node = rootRef.current;
      const target = event.target;
      if (!node || !(target instanceof Node) || node.contains(target)) return;
      setMenuOpen(false);
      if (openRef.current !== null) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [close]);

  // Focus lands on the first item once the menu is up; a menu you have to hunt
  // for with the pointer is not a keyboard path.
  React.useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => itemRefs.current[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menuOpen]);

  const run = (action: SwipeAction) => {
    close();
    action.onSelect();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || menuOpen || rowWidth === 0) return;
    if (leadCount === 0 && trailCount === 0) return;
    settleRef.current?.stop();
    settleRef.current = null;
    swallowClick.current = false;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      base: x.get(),
      claimed: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.claimed) {
      if (Math.abs(dx) < CLAIM && Math.abs(dy) < CLAIM) return;
      // A vertical gesture belongs to the list, not to the row.
      if (Math.abs(dy) >= Math.abs(dx)) {
        drag.current = null;
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic pointer may have nothing to capture; the drag still runs.
      }
      state.claimed = true;
      swallowClick.current = true;
    }

    let next = state.base + dx;
    if (next > openLead) next = openLead + (next - openLead) * RESISTANCE;
    if (next < -openTrail) next = -openTrail + (next + openTrail) * RESISTANCE;
    next = clamp(next, -rowWidth, rowWidth);
    x.set(next);

    const side: Side =
      next > arm && leadCount > 0
        ? "leading"
        : next < -arm && trailCount > 0
          ? "trailing"
          : null;
    if (armedRef.current !== side) {
      armedRef.current = side;
      setArmed(side);
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (state.claimed && event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!state.claimed) return;

    const side = armedRef.current;
    const action = side === "leading" ? leading[0] : trailing[0];
    if (side && action) {
      run(action);
      return;
    }

    const at = x.get();
    if (openLead > 0 && at > openLead / 2) moveTo("leading", openLead);
    else if (openTrail > 0 && at < -openTrail / 2)
      moveTo("trailing", -openTrail);
    else moveTo(null, 0);
  };

  const onSurfaceClick = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (openRef.current !== null) close();
  };

  const menuActions = [...leading, ...trailing];

  const onMenuKeyDown = (event: React.KeyboardEvent, at: number) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
      return;
    }
    const step = MENU_STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const to = clamp(step(at, menuActions.length), 0, menuActions.length - 1);
    itemRefs.current[to]?.focus();
  };

  const menuTransition = motionSafe
    ? {
        ...springs.snap,
        opacity: { duration: durations.fast, ease: easings.enter },
      }
    : { duration: durations.fast };

  return (
    <li
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn("relative bg-surface-1", className)}
    >
      <div ref={boxRef} className="relative overflow-hidden">
        {leadCount > 0 ? (
          <ActionPane
            actions={leading}
            side="leading"
            armed={armed === "leading"}
            motionSafe={motionSafe}
            onRun={run}
          />
        ) : null}
        {trailCount > 0 ? (
          <ActionPane
            actions={trailing}
            side="trailing"
            armed={armed === "trailing"}
            motionSafe={motionSafe}
            onRun={run}
          />
        ) : null}

        <motion.div
          style={{ x }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onSurfaceClick}
          className="relative flex touch-pan-y items-center gap-2 bg-surface-1 px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">{children}</div>

          <button
            ref={menuButtonRef}
            id={buttonId}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            aria-label={menuLabel}
            onClick={() => setMenuOpen((wasOpen) => !wasOpen)}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-2 text-ink-3 outline-none hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <circle cx="8" cy="3.5" r="1.25" fill="currentColor" />
              <circle cx="8" cy="8" r="1.25" fill="currentColor" />
              <circle cx="8" cy="12.5" r="1.25" fill="currentColor" />
            </svg>
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            initial={
              motionSafe
                ? { opacity: 0, y: -distances.nudge, scale: 0.98 }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={menuTransition}
            id={menuId}
            role="menu"
            aria-labelledby={buttonId}
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-2 z-30 mt-1 flex w-40 flex-col rounded-2 border border-hairline bg-popover p-1 shadow-raised"
          >
            {menuActions.map((action, at) => (
              <button
                key={action.id}
                ref={(node) => {
                  itemRefs.current[at] = node;
                }}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  menuButtonRef.current?.focus();
                  run(action);
                }}
                onKeyDown={(event) => onMenuKeyDown(event, at)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-1 px-2 text-left text-sm outline-none hover:bg-accent",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  action.tone === "danger" ? "text-danger" : "text-foreground",
                )}
              >
                <ActionGlyph name={action.icon} />
                <span className="min-w-0 truncate">{action.label}</span>
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
