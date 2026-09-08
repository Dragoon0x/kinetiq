"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WatchHolding = {
  id: string;
  /** Ticker, printed in mono. */
  symbol: string;
  /** Full name, printed under the ticker. */
  name: string;
  price: number;
  /** Move on the day, in percent. Negative is a loss. */
  percent: number;
};

export type WatchDragProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The watchlist, in its natural order. */
  holdings: WatchHolding[];
  /** Controlled order, as ids. Unknown ids are ignored, missing ones appended. */
  order?: string[];
  /** Initial order for uncontrolled usage. */
  defaultOrder?: string[];
  /** Fires from the drop or the key that committed a move. */
  onOrderChange?: (order: string[]) => void;
  /** Formats every price. */
  format?: (value: number) => string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same price, which is a
 * hydration mismatch on every row.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/** Travel before a press becomes a drag, so a plain tap on the grip still lands. */
const DRAG_SLOP = 4;
/** Rows share one height, so the row under the pointer is never ambiguous. */
const ROW_H = 48;
const ROW_GAP = 6;
const PITCH = ROW_H + ROW_GAP;

/** Capture throws on a synthetic pointer id; the drag works without it. */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // No live pointer to capture — the drag continues unconfined.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

const clampIndex = (value: number, last: number) =>
  Math.min(Math.max(value, 0), Math.max(last, 0));

const moveId = (list: string[], from: number, to: number): string[] => {
  if (from === to) return list;
  const next = list.slice();
  const [held] = next.splice(from, 1);
  if (held === undefined) return list;
  next.splice(to, 0, held);
  return next;
};

/** Keeps a caller's order usable: unknown ids drop out, missing ones append. */
const reconcile = (ids: string[], holdings: WatchHolding[]): string[] => {
  const known = new Set(holdings.map((holding) => holding.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const holding of holdings) {
    if (!seen.has(holding.id)) out.push(holding.id);
  }
  return out;
};

/**
 * A watchlist you rank yourself. Each row carries one interactive part — the
 * grip on the left — so Tab walks ranks rather than every readout. Pressing the
 * grip and moving lifts that row on `flick`, quick enough to read as the grab
 * itself, after which it tracks the pointer 1:1 with no easing, because direct
 * manipulation must never lag the finger. The rows it passes make room with
 * FLIP on `glide`, a dashed slot marks the place it will take, and letting go
 * settles it there on `glide` too — the same 450ms the rest of the list used to
 * open the gap, so the row joins the layout rather than landing on top of it.
 * The landed row washes cobalt once and the wash leaves on the exit ease,
 * because an exit never springs.
 *
 * The pointer is captured only after 4px of travel and inside `try`/`catch`
 * both ways: capturing on pointerdown swallows the click a tap is made of, and
 * a synthetic sweep through the stage has no live pointer to capture. A second
 * pointer cannot steal a drag already under way.
 *
 * The keyboard does the whole gesture — Space lifts, Up and Down move, Home and
 * End reach the ends, Space drops, Escape restores — and every step is announced
 * by name and position. Under reduced motion nothing travels: the list reorders
 * live as the pointer crosses each row, because the order is the information.
 */
export function WatchDrag({
  ref,
  holdings,
  order,
  defaultOrder,
  onOrderChange,
  format = defaultFormat,
  label,
  className,
  "aria-label": ariaLabel,
}: WatchDragProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    () => defaultOrder ?? holdings.map((holding) => holding.id),
  );
  const isControlled = order !== undefined;
  const committed = React.useMemo(
    () => reconcile(isControlled ? order : uncontrolled, holdings),
    [isControlled, order, uncontrolled, holdings],
  );

  const byId = React.useMemo(() => {
    const map = new Map<string, WatchHolding>();
    for (const holding of holdings) map.set(holding.id, holding);
    return map;
  }, [holdings]);

  const [drag, setDrag] = React.useState<{
    id: string;
    dy: number;
    from: number;
    to: number;
  } | null>(null);
  /** A keyboard lift holds the order it started from, so Escape can restore it. */
  const [lifted, setLifted] = React.useState<{
    id: string;
    restore: string[];
  } | null>(null);
  const [landed, setLanded] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const gripRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const grab = React.useRef<{
    id: string;
    pointerId: number;
    startY: number;
    from: number;
    engaged: boolean;
  } | null>(null);

  const last = committed.length - 1;
  /** What the list shows right now: the committed order plus any live drag. */
  const shown = drag ? moveId(committed, drag.from, drag.to) : committed;
  const heldId = drag?.id ?? lifted?.id ?? null;
  const tabbableId = focusedId ?? shown[0] ?? null;

  const say = (id: string, verb: string, index: number) => {
    const holding = byId.get(id);
    if (!holding) return;
    setAnnouncement(
      `${holding.symbol} ${verb} position ${index + 1} of ${committed.length}.`,
    );
  };

  const commit = (next: string[], changed: boolean) => {
    if (!isControlled) setUncontrolled(next);
    // Reported from the handler, after the state that caused it — a parent
    // callback fired inside an updater runs during another component's render.
    if (changed) onOrderChange?.(next);
  };

  const focusGrip = (index: number) => {
    gripRefs.current[clampIndex(index, last)]?.focus();
  };

  const lift = (id: string, index: number) => {
    setLifted({ id, restore: committed });
    say(id, "lifted at", index);
  };

  const moveLifted = (from: number, to: number) => {
    const target = clampIndex(to, last);
    const id = shown[from];
    if (!id || target === from) return;
    commit(moveId(committed, from, target), true);
    say(id, "moved to", target);
  };

  // Each keyboard step has already committed and reported, so the drop only
  // releases the row — reporting again here would double every move.
  const drop = (id: string, index: number) => {
    setLifted(null);
    setLanded((current) => ({ id, seq: (current?.seq ?? 0) + 1 }));
    say(id, "dropped at", index);
  };

  const cancel = (id: string) => {
    const restore = lifted?.restore;
    setLifted(null);
    if (!restore) return;
    commit(restore, true);
    const holding = byId.get(id);
    setAnnouncement(
      `Move cancelled. ${holding?.symbol ?? "Row"} back at position ${
        restore.indexOf(id) + 1
      } of ${restore.length}.`,
    );
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
    index: number,
  ) => {
    const held = lifted?.id === id;
    switch (event.key) {
      case " ":
      case "Enter":
        // A button fires click on Space keyup and scrolls the page meanwhile;
        // taking the key here keeps the lift from doing both.
        event.preventDefault();
        if (held) drop(id, index);
        else lift(id, index);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (held) moveLifted(index, index - 1);
        else focusGrip(index - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        if (held) moveLifted(index, index + 1);
        else focusGrip(index + 1);
        break;
      case "Home":
        event.preventDefault();
        if (held) moveLifted(index, 0);
        else focusGrip(0);
        break;
      case "End":
        event.preventDefault();
        if (held) moveLifted(index, last);
        else focusGrip(last);
        break;
      case "Escape":
        if (!held) break;
        event.preventDefault();
        cancel(id);
        break;
      default:
        break;
    }
  };

  const startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    // A second finger must not steal a drag already under way.
    if (event.button !== 0 || lifted || grab.current?.engaged) return;
    const id = shown[index];
    if (!id) return;
    grab.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      from: index,
      engaged: false,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const grip = grab.current;
    if (!grip || grip.pointerId !== event.pointerId) return;
    const dy = event.clientY - grip.startY;
    if (!grip.engaged) {
      if (Math.abs(dy) <= DRAG_SLOP) return;
      grip.engaged = true;
      capturePointer(event.currentTarget, event.pointerId);
    }
    setDrag({
      id: grip.id,
      dy,
      from: grip.from,
      to: clampIndex(grip.from + Math.round(dy / PITCH), last),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const grip = grab.current;
    releasePointer(event.currentTarget, event.pointerId);
    grab.current = null;
    setDrag(null);
    if (!grip?.engaged) return;
    const to = clampIndex(
      grip.from + Math.round((event.clientY - grip.startY) / PITCH),
      last,
    );
    setLanded((current) => ({ id: grip.id, seq: (current?.seq ?? 0) + 1 }));
    commit(moveId(committed, grip.from, to), to !== grip.from);
    say(grip.id, "dropped at", to);
  };

  const cancelDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    grab.current = null;
    setDrag(null);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Drag to rank
        </span>
      </div>

      <p id={hintId} className="sr-only">
        Press Space to lift the row, Up and Down to move it, Space to drop it,
        Escape to put it back.
      </p>

      <ol
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-col"
        style={{ gap: ROW_GAP }}
      >
        {shown.map((id, index) => {
          const holding = byId.get(id);
          if (!holding) return null;
          const isHeld = heldId === id;
          const dragging = drag?.id === id;
          const up = holding.percent > 0;
          const down = holding.percent < 0;
          // The row's slot has already moved to `to`; the offset walks it back
          // to the pointer, so the two changes cancel and the row reads as
          // continuous while the rows around it re-flow.
          const offset =
            dragging && motionSafe
              ? drag.dy - (drag.to - drag.from) * PITCH
              : 0;

          return (
            <motion.li
              key={id}
              layout={motionSafe && !dragging ? "position" : false}
              transition={springs.glide}
              className={cn("relative", isHeld && "z-10")}
              style={{ height: ROW_H }}
            >
              {/* The slot the row will drop into. It is only drawn while the
                  row itself has travelled away from it, so it never doubles
                  the row's own outline. */}
              {dragging && motionSafe ? (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-2 border border-dashed border-cobalt-bright/50 bg-cobalt-wash/40"
                />
              ) : null}

              <motion.div
                animate={{ y: offset, scale: isHeld && motionSafe ? 1.015 : 1 }}
                transition={{
                  // Tracking is 1:1 while the pointer is down; the settle is
                  // the only part with physics, and it glides in with the gap.
                  y: dragging ? { duration: 0 } : springs.glide,
                  scale: motionSafe ? springs.flick : { duration: 0 },
                }}
                className={cn(
                  "relative flex h-full w-full items-center gap-2 rounded-2 border px-2 transition-[background-color,border-color,box-shadow]",
                  isHeld
                    ? "border-cobalt-bright bg-surface-0 shadow-raised"
                    : "border-hairline bg-surface-1 hover:border-hairline-strong",
                )}
              >
                {landed?.id === id ? (
                  <motion.span
                    key={landed.seq}
                    aria-hidden
                    // Rounded on the wash itself rather than clipped by the
                    // row: an overflow-hidden row would eat the grip's focus
                    // ring, and a focus ring you cannot see is not one.
                    className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  />
                ) : null}

                <button
                  ref={(node) => {
                    gripRefs.current[index] = node;
                  }}
                  type="button"
                  aria-pressed={lifted?.id === id}
                  aria-describedby={hintId}
                  aria-label={`Reorder ${holding.symbol}, position ${
                    index + 1
                  } of ${committed.length}`}
                  tabIndex={id === tabbableId ? 0 : -1}
                  onFocus={() => setFocusedId(id)}
                  onBlur={() => {
                    // Focus leaving mid-lift drops the row where it stands
                    // rather than stranding the list in a held state.
                    if (lifted?.id === id) drop(id, index);
                  }}
                  onKeyDown={(event) => handleKeyDown(event, id, index)}
                  onPointerDown={(event) => startDrag(event, index)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onLostPointerCapture={cancelDrag}
                  style={{ touchAction: "none" }}
                  className={cn(
                    "relative flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isHeld
                      ? "cursor-grabbing text-cobalt-bright"
                      : "cursor-grab text-ink-3 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="size-4 shrink-0"
                    fill="currentColor"
                  >
                    <circle cx="6" cy="4" r="1.15" />
                    <circle cx="10" cy="4" r="1.15" />
                    <circle cx="6" cy="8" r="1.15" />
                    <circle cx="10" cy="8" r="1.15" />
                    <circle cx="6" cy="12" r="1.15" />
                    <circle cx="10" cy="12" r="1.15" />
                  </svg>
                </button>

                <span
                  aria-hidden
                  className="relative w-4 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums"
                >
                  {index + 1}
                </span>

                <span className="relative flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-[13px] leading-tight font-medium">
                    {holding.symbol}
                  </span>
                  <span
                    title={holding.name}
                    className="truncate text-[11px] leading-tight text-ink-3"
                  >
                    {holding.name}
                  </span>
                </span>

                <span className="relative flex w-16 shrink-0 flex-col items-end">
                  <span className="font-mono text-[12px] leading-tight tabular-nums">
                    {format(holding.price)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "font-mono text-[11px] leading-tight font-medium tabular-nums",
                      up ? "text-success" : down ? "text-danger" : "text-ink-3",
                    )}
                  >
                    {holding.percent >= 0 ? "+" : "-"}
                    {Math.abs(holding.percent).toFixed(1)}%
                  </span>
                  <span className="sr-only">
                    {up ? "up" : down ? "down" : "unchanged,"}{" "}
                    {Math.abs(holding.percent).toFixed(1)} percent
                  </span>
                </span>
              </motion.div>
            </motion.li>
          );
        })}
      </ol>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
