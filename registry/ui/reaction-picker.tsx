"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Reactions are drawn marks with a word under them, never typed characters. */
export type PickerGlyph = "spark" | "agree" | "lift" | "watching" | "question";

const GLYPHS: Record<PickerGlyph, string> = {
  spark: "M8 2.6 9.5 6.5 13.4 8 9.5 9.5 8 13.4 6.5 9.5 2.6 8 6.5 6.5Z",
  agree: "m3.6 8.4 2.9 2.9 5.9-6.2",
  lift: "M8 12.8V4.2m0 0 3.2 3.2M8 4.2 4.8 7.4",
  watching:
    "M1.9 8S4.4 4.2 8 4.2 14.1 8 14.1 8 11.6 11.8 8 11.8 1.9 8 1.9 8Zm6.1 0a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0Z",
  question: "M5.9 6a2.1 2.1 0 1 1 2.7 2c-.5.2-.6.6-.6 1v.5M8 12.2v.1",
};

/** Pointer falloff radius (px) and the lift the nearest mark takes. */
const RADIUS = 56;
const LIFT = 8;

export type PickerOption = { id: string; label: string; glyph: PickerGlyph };

const DEFAULT_OPTIONS: PickerOption[] = [
  { id: "spark", label: "Spark", glyph: "spark" },
  { id: "agree", label: "Agree", glyph: "agree" },
  { id: "lift", label: "Lift", glyph: "lift" },
  { id: "watching", label: "Watching", glyph: "watching" },
  { id: "question", label: "Question", glyph: "question" },
];

export type ReactionPickerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who wrote the message. */
  sender: string;
  /** The message body. */
  text: string;
  /** Already formatted, printed beside the sender. */
  time?: string;
  /** The pickable reactions. @default spark / agree / lift / watching / question */
  options?: PickerOption[];
  /** Seeded counts from other people, added to yours in the row. */
  baseCounts?: Record<string, number>;
  /** Controlled list of reaction ids you have added. */
  picked?: string[];
  /** Initial list for uncontrolled usage. @default [] */
  defaultPicked?: string[];
  /** Fires with the whole next list. */
  onPickedChange?: (picked: string[]) => void;
  /** Fires with the reaction picked, before the ghost has landed. */
  onPick?: (id: string) => void;
  /** Controlled picker visibility; hover and focus drive it when uncontrolled. */
  open?: boolean;
  /** @default false */
  defaultOpen?: boolean;
  /** Fires from hover, focus, Escape and a pick. */
  onOpenChange?: (open: boolean) => void;
  /** Names the message region for assistive technology. */
  label: string;
  className?: string;
};

type Flight = {
  nonce: number;
  id: string;
  glyph: PickerGlyph;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

/** Coordinates handed to motion are rounded: raw floats never hydrate cleanly. */
const px = (value: number): number => Number(value.toFixed(3));

/** A box's centre in the frame's own coordinates, offset for the 16px ghost. */
const centreIn = (box: DOMRect, frame: DOMRect) => ({
  x: px(box.left - frame.left + box.width / 2 - 8),
  y: px(box.top - frame.top + box.height / 2 - 8),
});

function Mark({
  glyph,
  className,
}: {
  glyph: PickerGlyph;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", className)}
    >
      <path d={GLYPHS[glyph]} />
    </svg>
  );
}

type ItemProps = {
  option: PickerOption;
  tabbable: boolean;
  picked: boolean;
  motionSafe: boolean;
  pointerX: MotionValue<number>;
  strength: MotionValue<number>;
  onPress: (option: PickerOption, node: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  register: (id: string, node: HTMLButtonElement | null) => void;
};

/**
 * One mark in the bar. Its own centre lives in a motion value fed by a
 * ResizeObserver bound to the node when it arrives, so the falloff is measured
 * rather than assumed and a re-layout never leaves the lift pointing at where
 * the mark used to be.
 */
function PickerItem({
  option,
  tabbable,
  picked,
  motionSafe,
  pointerX,
  strength,
  onPress,
  onKeyDown,
  onFocus,
  register,
}: ItemProps) {
  const [node, setNode] = React.useState<HTMLButtonElement | null>(null);
  const centre = useMotionValue(0);

  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const read = () => centre.set(node.offsetLeft + node.offsetWidth / 2);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, centre]);

  const near = useTransform<number, number>(
    [pointerX, strength, centre],
    (latest) => {
      const x = latest[0] ?? 0;
      const s = latest[1] ?? 0;
      const c = latest[2] ?? 0;
      const fall = Math.max(0, 1 - Math.abs(x - c) / RADIUS);
      return px(fall * fall * s);
    },
  );
  const y = useTransform(near, (value) => px(-LIFT * value));
  const scale = useTransform(near, (value) => px(1 + 0.18 * value));

  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={picked}
      aria-label={
        picked ? `${option.label}, added. Press to remove.` : option.label
      }
      tabIndex={tabbable ? 0 : -1}
      ref={(next) => {
        setNode(next);
        register(option.id, next);
      }}
      onClick={() => onPress(option, node)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={cn(
        "flex h-11 w-9 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2 transition-colors outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        picked
          ? "bg-cobalt-wash text-cobalt-bright"
          : "text-ink-2 hover:bg-accent hover:text-foreground",
      )}
    >
      <motion.span
        aria-hidden
        style={motionSafe ? { y, scale } : undefined}
        className="flex size-4 items-center justify-center"
      >
        <Mark glyph={option.glyph} />
      </motion.span>
      <span aria-hidden className="text-[9px] leading-3">
        {option.label}
      </span>
    </button>
  );
}

/**
 * A picker that comes when you come near. Pointing at the message — or focusing
 * the React control, which is always in the tab order — raises the bar from
 * `distances.step` below on `snap`, and inside it the marks lift toward the
 * pointer: one pointer-x motion value and a falloff over 56px, so the nearest
 * rises 8px and its neighbours take a fraction of that.
 *
 * Picking sends the mark flying to the reaction row. The mark's box and the
 * chip's box are read once, at the press, against the component's own frame,
 * the delta is rounded to three decimals, and a ghost travels it on `glide`
 * while the chip it lands on flashes. The tally commits at the press, not at
 * the landing, so the keyboard and reduced motion get the same instant truth
 * and the live region never waits for an animation to finish.
 */
export function ReactionPicker({
  ref,
  sender,
  text,
  time,
  options = DEFAULT_OPTIONS,
  baseCounts,
  picked,
  defaultPicked = [],
  onPickedChange,
  onPick,
  open,
  defaultOpen = false,
  onOpenChange,
  label,
  className,
}: ReactionPickerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const menuId = `${baseId}-menu`;

  const [uncontrolledPicked, setUncontrolledPicked] =
    React.useState<string[]>(defaultPicked);
  const mine = picked ?? uncontrolledPicked;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;

  const [menuIndex, setMenuIndex] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [landed, setLanded] = React.useState<{
    id: string;
    nonce: number;
  } | null>(null);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const rowRef = React.useRef<HTMLUListElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const chipRefs = React.useRef(new Map<string, HTMLLIElement>());
  const focusFirstRef = React.useRef(false);
  const nonceRef = React.useRef(0);
  const pointerInRef = React.useRef(false);
  const focusInRef = React.useRef(false);
  // A pick hands focus back to the trigger, and that focus would otherwise
  // bubble straight back into "open again". The guard is spent by that event.
  const reopenGuardRef = React.useRef(false);

  const pointerX = useMotionValue(-RADIUS * 4);
  const strength = useMotionValue(0);

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  /** The bar is up while the pointer is on the message or focus is inside it. */
  const sync = () => setOpen(pointerInRef.current || focusInRef.current);

  // The bar mounts a frame after the state change, so the request to enter it
  // by keyboard is held in a ref and spent here — a DOM write, never state.
  React.useEffect(() => {
    if (!isOpen || !focusFirstRef.current) return;
    focusFirstRef.current = false;
    const first = options[0];
    if (first) itemRefs.current.get(first.id)?.focus({ preventScroll: true });
  }, [isOpen, options]);

  const chips = options
    .map((option) => ({
      ...option,
      count:
        (baseCounts?.[option.id] ?? 0) + (mine.includes(option.id) ? 1 : 0),
    }))
    .filter((option) => option.count > 0);
  const total = chips.reduce((sum, chip) => sum + chip.count, 0);

  const press = (option: PickerOption, node: HTMLButtonElement | null) => {
    const had = mine.includes(option.id);
    const next = had
      ? mine.filter((id) => id !== option.id)
      : [...mine, option.id];
    if (picked === undefined) setUncontrolledPicked(next);
    onPickedChange?.(next);
    if (!had) onPick?.(option.id);

    const count = total + (had ? -1 : 1);
    // Frozen at the press: a host editing the counts afterwards cannot make
    // the region read a sentence that has stopped being true.
    setAnnounce(
      had
        ? `${option.label} removed, ${count} reactions`
        : `${option.label} added, ${count} reactions`,
    );

    const frame = frameRef.current;
    // Both boxes are read once, here, in an event — never during a render, and
    // never from a layout that has already moved on.
    const target = chipRefs.current.get(option.id) ?? rowRef.current;
    if (!motionSafe && !had) {
      // Nothing flies, but the arrival is information: the chip still flashes.
      nonceRef.current += 1;
      setLanded({ id: option.id, nonce: nonceRef.current });
    }
    if (motionSafe && !had && node && frame && target) {
      const frameBox = frame.getBoundingClientRect();
      nonceRef.current += 1;
      setFlight({
        nonce: nonceRef.current,
        id: option.id,
        glyph: option.glyph,
        from: centreIn(node.getBoundingClientRect(), frameBox),
        to: centreIn(target.getBoundingClientRect(), frameBox),
      });
    }

    reopenGuardRef.current = true;
    triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  };

  const moveMenu = (index: number) => {
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    const option = options[clamped];
    if (!option) return;
    setMenuIndex(clamped);
    itemRefs.current.get(option.id)?.focus({ preventScroll: true });
  };

  const menuKeys = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveMenu(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveMenu(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveMenu(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveMenu(options.length - 1);
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={(node) => {
        frameRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      role="group"
      aria-label={label}
      className={cn("relative flex w-full flex-col gap-2", className)}
      onPointerEnter={() => {
        pointerInRef.current = true;
        sync();
      }}
      onPointerLeave={() => {
        pointerInRef.current = false;
        sync();
      }}
      onFocus={() => {
        focusInRef.current = true;
        if (reopenGuardRef.current) {
          reopenGuardRef.current = false;
          return;
        }
        sync();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        focusInRef.current = false;
        sync();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }}
    >
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
        <span>{sender}</span>
        {time ? <span className="font-mono tabular-nums">{time}</span> : null}
      </p>

      <div className="relative flex items-end gap-1.5">
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              key="bar"
              id={menuId}
              role="menu"
              aria-label={`Quick reactions on ${sender}'s message`}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step }
                  : { opacity: 0, y: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
              onPointerMove={(event) => {
                if (!motionSafe) return;
                const box = event.currentTarget.getBoundingClientRect();
                pointerX.set(event.clientX - box.left);
              }}
              onPointerEnter={() => {
                if (motionSafe) animate(strength, 1, springs.snap);
              }}
              onPointerLeave={() => {
                if (motionSafe) animate(strength, 0, springs.snap);
              }}
              className="absolute right-0 bottom-full z-10 -mb-2.5 flex max-w-full items-end gap-0.5 overflow-hidden rounded-3 border border-hairline bg-surface-2 p-1 shadow-sm"
            >
              {options.map((option, index) => (
                <PickerItem
                  key={option.id}
                  option={option}
                  tabbable={index === menuIndex}
                  picked={mine.includes(option.id)}
                  motionSafe={motionSafe}
                  pointerX={pointerX}
                  strength={strength}
                  onPress={press}
                  onFocus={() => setMenuIndex(index)}
                  onKeyDown={(event) => menuKeys(event, index)}
                  register={(id, node) => {
                    if (node) itemRefs.current.set(id, node);
                    else itemRefs.current.delete(id);
                  }}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="min-w-0 flex-1 rounded-3 rounded-bl-1 border border-hairline bg-surface-1 px-3 py-1.5 text-sm leading-5 text-foreground">
          {text}
        </p>

        <button
          type="button"
          ref={triggerRef}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          aria-label={`React to ${sender}'s message`}
          onClick={(event) => {
            // detail 0 is a keyboard activation: open into the bar rather than
            // leaving focus behind on the control that opened it.
            if (event.detail === 0 && !isOpen) focusFirstRef.current = true;
            setOpen(!isOpen);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            setOpen(true);
            const first = options[0];
            const item = first ? itemRefs.current.get(first.id) : undefined;
            // Already mounted: enter it now. Not yet: hold the request for the
            // effect that runs the frame the bar arrives in.
            if (item) item.focus({ preventScroll: true });
            else focusFirstRef.current = true;
          }}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isOpen && "bg-accent text-foreground",
          )}
        >
          <Mark glyph="spark" className="size-3.5" />
        </button>
      </div>

      <ul
        ref={rowRef}
        role="list"
        aria-label={`Reactions on ${sender}'s message`}
        className="flex flex-wrap gap-1.5"
      >
        <AnimatePresence initial={false}>
          {chips.map((chip) => (
            <motion.li
              key={chip.id}
              layout={motionSafe}
              ref={(node) => {
                if (node) chipRefs.current.set(chip.id, node);
                else chipRefs.current.delete(chip.id);
              }}
              aria-label={`${chip.label}, ${chip.count}`}
              initial={
                motionSafe ? { opacity: 0, scale: 0.86 } : { opacity: 0 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.8 : 1,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe ? { ...springs.glide, opacity: fade } : fade
              }
              className={cn(
                "relative flex h-6 items-center gap-1 overflow-hidden rounded-full border border-hairline-strong bg-surface-1 px-2 text-ink-2",
                mine.includes(chip.id) &&
                  "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright",
              )}
            >
              {landed?.id === chip.id ? (
                <motion.span
                  key={landed.nonce}
                  aria-hidden
                  initial={{ opacity: 0.45 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                  className="pointer-events-none absolute inset-0 bg-current"
                />
              ) : null}
              <Mark glyph={chip.glyph} className="size-3.5 shrink-0" />
              <span className="font-mono text-[11px] leading-4 tabular-nums">
                {chip.count}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/* The ghost is decoration: the tally already changed at the press. */}
      <AnimatePresence>
        {flight ? (
          <motion.span
            key={flight.nonce}
            aria-hidden
            initial={{
              x: flight.from.x,
              y: flight.from.y,
              scale: 1,
              opacity: 1,
            }}
            animate={{
              x: flight.to.x,
              y: flight.to.y,
              scale: 0.62,
              opacity: 0,
            }}
            transition={{
              ...springs.glide,
              opacity: { duration: durations.base, ease: easings.exit },
            }}
            onAnimationComplete={() => {
              setLanded({ id: flight.id, nonce: flight.nonce });
              setFlight(null);
            }}
            className="pointer-events-none absolute top-0 left-0 z-20 flex size-4 items-center justify-center text-cobalt-bright"
          >
            <Mark glyph={flight.glyph} />
          </motion.span>
        ) : null}
      </AnimatePresence>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
