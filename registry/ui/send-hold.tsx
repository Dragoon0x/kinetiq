"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SendOption = {
  id: string;
  label: string;
  /** Mono aside on the row's right — when, or where, it goes. */
  hint?: string;
  /** The word that lands beside the button after a pick. @default label */
  stamp?: string;
};

export type SendHoldProps = {
  /** The button. */
  ref?: React.Ref<HTMLButtonElement>;
  /** The plan's choices; the first is what a tap does. */
  options?: SendOption[];
  /** Milliseconds of hold before the panel unfolds. @default 320 */
  holdDelay?: number;
  /** Fires from a tap (the first option), a release on an option, or Enter in the panel. */
  onPick?: (option: SendOption) => void;
  /** Nothing to send: the button is inert and the panel never opens. */
  disabled?: boolean;
  /** The button's accessible name. @default "Send" */
  label?: string;
  className?: string;
};

const DEFAULT_OPTIONS: SendOption[] = [
  { id: "now", label: "Send now", stamp: "Sent" },
  { id: "schedule", label: "Schedule", hint: "later", stamp: "Scheduled" },
  { id: "task", label: "Send as task", hint: "background", stamp: "Queued" },
];

/** How long a stamp stays legible before it fades. */
const STAMP_MS = 1200;
/** Travel before the pointer is captured, so a plain click is never swallowed. */
const DRAG_PX = 4;

const RING = {
  cx: 18,
  cy: 18,
  r: 16.5,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
} as const;

type By = "pointer" | "key";
type Pointer = { id: number; x: number; y: number; captured: boolean };

/**
 * A send button with a plan behind it. A tap sends now; holding past
 * `holdDelay` fills a hairline ring linearly, then unfolds a panel whose
 * options rise from `distances.step` on `snap` in a `cascade` stagger,
 * nearest the button first. Dragging over an option moves one `layoutId`
 * pill between rows on `snap` and releasing picks it; releasing elsewhere
 * folds the panel on the exit ease with nothing sent. A pick lands a stamp
 * beside the button on `recoil` that fades after a beat.
 *
 * The pointer is captured only after four pixels of travel, in a try/catch,
 * so a plain click is never swallowed. Space or Enter taps, holding either
 * opens the panel with focus on the first item, ArrowUp opens it directly;
 * in the menu the arrows move, Home and End jump, Enter picks, Escape closes
 * and returns focus. The stamp is announced on a pick, never while the ring
 * fills. Under reduced motion the ring still fills, the panel fades in
 * place, the pill swaps rows and the stamp fades without bounce. The panel
 * opens up and to the left: a composer's right end gives it room.
 */
export function SendHold({
  ref,
  options = DEFAULT_OPTIONS,
  holdDelay = 320,
  onPick,
  disabled = false,
  label = "Send",
  className,
}: SendHoldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const menuId = `${baseId}-menu`;
  const hintId = `${baseId}-hint`;
  const pillId = `${baseId}-pill`;

  // Which input opened the panel decides where focus lives: a key carries it
  // into the rows, a held pointer keeps it on the button.
  const [panel, setPanel] = React.useState<By | null>(null);
  const open = panel !== null;
  const [active, setActive] = React.useState(0);
  const [holding, setHolding] = React.useState(false);
  const [stamp, setStamp] = React.useState<{
    key: number;
    text: string;
  } | null>(null);
  const [announce, setAnnounce] = React.useState("");

  // The hold's progress is a motion value, not state: the ring follows it
  // without a render per frame, and the panel opens from its completion.
  const progress = useMotionValue(0);
  const ringOffset = useTransform(progress, (v) => 1 - v);
  const holdRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const pointerRef = React.useRef<Pointer | null>(null);
  const keyHeldRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const setButtonNode = (node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const settleRing = (how: "spring" | "instant") => {
    holdRef.current?.stop();
    holdRef.current =
      how === "spring"
        ? animate(progress, 0, {
            duration: durations.fast,
            onComplete: () => {
              holdRef.current = null;
            },
          })
        : null;
    if (how === "instant") progress.set(0);
    setHolding(false);
  };
  const closePanel = (returnFocus: boolean) => {
    setPanel(null);
    settleRing("instant");
    if (returnFocus) buttonRef.current?.focus();
  };
  const pick = (option: SendOption) => {
    closePanel(true);
    const text = option.stamp ?? option.label;
    setStamp((prev) => ({ key: (prev?.key ?? 0) + 1, text }));
    setAnnounce(text);
    onPick?.(option);
  };
  const tap = () => {
    const first = options[0];
    if (first) pick(first);
  };
  const beginHold = (by: By) => {
    if (disabled || open) return;
    holdRef.current?.stop();
    setHolding(true);
    holdRef.current = animate(progress, 1, {
      // Progress is information, not flourish: it fills under reduced motion.
      duration: holdDelay / 1000,
      ease: easings.linear,
      onComplete: () => {
        holdRef.current = null;
        setActive(0);
        setPanel(by);
      },
    });
  };

  // A hidden tab or a press outside undoes everything, without a pick.
  const cancelRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    cancelRef.current = () => {
      pointerRef.current = null;
      keyHeldRef.current = false;
      settleRing("instant");
      setPanel(null);
    };
  });
  React.useEffect(() => {
    if (!holding && !open) return;
    const onVisibility = () => {
      if (document.hidden) cancelRef.current();
    };
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target))
        cancelRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [holding, open]);

  React.useEffect(() => {
    if (panel !== "key") return;
    document.getElementById(`${baseId}-item-${active}`)?.focus();
  }, [panel, active, baseId]);

  React.useEffect(() => {
    if (!stamp) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setStamp(null), STAMP_MS);
    };
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [stamp]);

  React.useEffect(() => () => holdRef.current?.stop(), []);

  const optionAt = (x: number, y: number): number | null => {
    const row = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-send-option]");
    if (!row || !panelRef.current?.contains(row)) return null;
    const index = Number(row.dataset.sendOption);
    return options[index] ? index : null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled || open) return;
    const { pointerId: id, clientX: x, clientY: y } = event;
    pointerRef.current = { id, x, y, captured: false };
    beginHold("pointer");
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const travel = Math.hypot(
      event.clientX - pointer.x,
      event.clientY - pointer.y,
    );
    if (!pointer.captured && travel > DRAG_PX) {
      try {
        event.currentTarget.setPointerCapture(pointer.id);
      } catch {
        // A synthetic pointer has no capture to give; the drag still reads.
      }
      pointer.captured = true;
    }
    if (open) {
      const hit = optionAt(event.clientX, event.clientY);
      if (hit !== null && hit !== active) setActive(hit);
    }
  };
  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointerRef.current = null;
    if (pointer.captured) {
      try {
        event.currentTarget.releasePointerCapture(pointer.id);
      } catch {
        // Already released; nothing to undo.
      }
    }
    suppressClickRef.current = true;
    if (open) {
      const hit = optionAt(event.clientX, event.clientY);
      const option = hit === null ? undefined : options[hit];
      if (option) pick(option);
      else closePanel(true);
    } else if (holding) {
      settleRing("spring");
      tap();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowUp" && !open) {
      event.preventDefault();
      setActive(0);
      setPanel("key");
    } else if (event.key === "Escape" && holding) {
      event.preventDefault();
      keyHeldRef.current = false;
      settleRing("spring");
    } else if (event.key === " " || event.key === "Enter") {
      // The browser clicks a button on Enter's keydown and Space's keyup;
      // both are pre-empted so the hold, not the click, decides.
      event.preventDefault();
      if (event.repeat || keyHeldRef.current || open) return;
      keyHeldRef.current = true;
      beginHold("key");
    }
  };
  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key !== " " && event.key !== "Enter") || !keyHeldRef.current)
      return;
    keyHeldRef.current = false;
    if (!open && holding) {
      settleRing("spring");
      tap();
    }
  };
  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowUp: active >= last ? 0 : active + 1,
      ArrowDown: active <= 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      // The key that opened the panel may still be down; its repeats are
      // not a choice.
      if (event.repeat || keyHeldRef.current) return;
      const option = options[active];
      if (option) pick(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePanel(true);
    } else if (event.key === "Tab") {
      closePanel(false);
    }
  };

  const stagger = cascade(options.length);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <span
      ref={rootRef}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && (!next || !rootRef.current?.contains(next)))
          closePanel(false);
      }}
      className={cn("relative inline-flex shrink-0", className)}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label="Send options"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
            // Column-reverse: the first option sits nearest the button.
            className="absolute right-0 bottom-full z-20 mb-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col-reverse gap-0.5 rounded-2 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-raised"
          >
            {options.map((option, index) => {
              const selected = index === active;
              const delay = Number((index * stagger).toFixed(3));
              const itemHintId = `${baseId}-item-hint-${index}`;
              return (
                <motion.div
                  key={option.id}
                  id={`${baseId}-item-${index}`}
                  role="menuitem"
                  tabIndex={-1}
                  aria-describedby={option.hint ? itemHintId : undefined}
                  data-send-option={index}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? { ...springs.snap, delay, opacity: { ...fade, delay } }
                      : fade
                  }
                  onPointerEnter={() => {
                    if (!selected) setActive(index);
                  }}
                  onClick={() => pick(option)}
                  className={cn(
                    "relative flex h-8 cursor-pointer items-center justify-between gap-3 rounded-2 px-2 text-sm outline-none",
                    selected ? "text-foreground" : "text-ink-2",
                  )}
                >
                  {selected ? (
                    <motion.span
                      aria-hidden
                      layoutId={motionSafe ? pillId : undefined}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-2 bg-accent"
                    />
                  ) : null}
                  <span className="relative min-w-0 truncate font-medium">
                    {option.label}
                  </span>
                  {option.hint ? (
                    <span
                      id={itemHintId}
                      className="relative shrink-0 font-mono text-[10px] text-ink-3"
                    >
                      {option.hint}
                    </span>
                  ) : null}
                </motion.div>
              );
            })}
            <div
              aria-hidden
              className="flex h-6 items-center px-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              Send options
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {stamp ? (
          <motion.span
            key={stamp.key}
            aria-hidden
            initial={motionSafe ? { opacity: 0, scale: 1.3 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? { ...springs.recoil, opacity: fade } : fade
            }
            className="pointer-events-none absolute top-1/2 right-full mr-2 -translate-y-1/2 rounded-full border border-hairline-strong bg-popover px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-signal uppercase shadow-raised"
          >
            {stamp.text}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <motion.button
        ref={setButtonNode}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => cancelRef.current()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onClick={() => {
          // Only an assistive activation arrives as a bare click: a tap.
          if (suppressClickRef.current) suppressClickRef.current = false;
          else if (!disabled && !open) tap();
        }}
        initial={false}
        animate={{ scale: motionSafe && holding ? 0.94 : 1 }}
        transition={springs.flick}
        className={cn(
          "relative grid size-9 shrink-0 touch-none place-items-center rounded-full bg-primary text-primary-foreground outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          disabled && "opacity-40",
        )}
      >
        <svg
          viewBox="0 0 36 36"
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full -rotate-90"
        >
          <circle {...RING} strokeOpacity={0.25} />
          <motion.circle
            {...RING}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: ringOffset }}
          />
        </svg>
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative size-4"
        >
          <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
        </svg>
      </motion.button>

      <span id={hintId} className="sr-only">
        Hold for options, or press Up
      </span>
      <span role="status" className="sr-only">
        {announce}
      </span>
    </span>
  );
}
