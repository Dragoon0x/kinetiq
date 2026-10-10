"use client";

import * as React from "react";

import { Check, ChevronsUpDown } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RailSelectOption = {
  value: string;
  /** What the option says, and what the trigger shows once chosen. */
  label: string;
  /** A quiet note at the row's end: a latency, a count. */
  hint?: string;
  disabled?: boolean;
};

export type RailSelectSize = "sm" | "md" | "lg";

export type RailSelectProps = {
  options: RailSelectOption[];
  /** Controlled: the chosen option's value. */
  value?: string | null;
  /** Initial choice when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click or key that chose an option. */
  onValueChange?: (value: string) => void;
  /** Controlled: whether the list is open. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or outside click that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** What is being chosen: the field's caption and the list's name. */
  label: string;
  /** Keep the caption for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The trigger's text before anything is chosen. @default "Choose" */
  placeholder?: string;
  /** How far the highlight stretches toward the next option before its tail catches up, 0 to 1. @default 0.5 */
  stretch?: number;
  /** How quick the highlight's ride is, 0 to 1: a slow, heavy car to a quick, light one. @default 0.5 */
  speed?: number;
  /** The trigger's and the list's width, in px (never wider than their container). @default 240 */
  width?: number;
  /** Which way the list opens. @default "bottom" */
  side?: "bottom" | "top";
  /** The highlight's car, its wash and the chosen node. Any CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** The rail and its nodes. Any CSS colour. @default "var(--hairline-strong)" */
  railColor?: string;
  /** Submits the value with a form, under this name. */
  name?: string;
  /** @default "md" */
  size?: RailSelectSize;
  /** Play a tick as the highlight moves, pitched by its place, and a lower one on a choice. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Dims = { trigger: number; row: number; text: string; icon: number };

const SIZES: Record<RailSelectSize, Dims> = {
  sm: { trigger: 32, row: 28, text: "text-xs", icon: 14 },
  md: { trigger: 36, row: 32, text: "text-sm", icon: 16 },
  lg: { trigger: 40, row: 36, text: "text-sm", icon: 16 },
};

/** The rail's centre, from the list's inner left edge. */
const RAIL_X = 13;
const TYPE_AHEAD_MS = 500;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/**
 * A select whose highlight rides a rail. The open list has a rail down its
 * left side with a node for each option, like a line on a transit map, and
 * the highlight is one shape — a wash across the row and a car on the rail —
 * whose top and bottom edges are separate springs. Moving to another option
 * sends the leading edge on a stiff spring and the trailing edge on a
 * softer, later one, so the shape stretches toward its next stop before its
 * tail catches up; a long jump stretches further. Choosing rolls the
 * trigger's value to the new label, away in the direction the list moved, on
 * springs.snap.
 *
 * It is an APG select-only combobox: focus stays on the trigger while arrows,
 * Home and End, Page keys and type-ahead move the highlight; Enter, Space
 * and Tab choose; Escape closes. Under reduced motion the highlight jumps,
 * the list fades and the value cross-fades.
 */
export function RailSelect({
  options,
  value,
  defaultValue = null,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  label,
  hideLabel = false,
  placeholder = "Choose",
  stretch = 0.5,
  speed = 0.5,
  width = 240,
  side = "bottom",
  color = "var(--accent-bright)",
  railColor = "var(--hairline-strong)",
  name,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: RailSelectProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const d = SIZES[size] ?? SIZES.md;
  const n = options.length;

  const [ownValue, setOwnValue] = React.useState<string | null>(defaultValue);
  const chosen = value === undefined ? ownValue : value;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = (open ?? ownOpen) && !disabled;
  const selectedIndex = options.findIndex((o) => o.value === chosen);
  const [active, setActive] = React.useState(Math.max(0, selectedIndex));
  const [prevChosen, setPrevChosen] = React.useState(selectedIndex);

  const top = useMotionValue(Math.max(0, selectedIndex) * d.row);
  const bottom = useMotionValue((Math.max(0, selectedIndex) + 1) * d.row);
  const glow = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const buffer = React.useRef({ text: "", timer: 0 });
  /** Where the highlight is heading, so a quick second move starts from there. */
  const heading = React.useRef(Math.max(0, selectedIndex));
  const latest = React.useRef<{ setOpen: (next: boolean) => void }>({
    setOpen: () => {},
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const enabled = (i: number) => !!options[i] && !options[i]?.disabled;

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  /** Sends the highlight to option `i`: the leading edge first. */
  const ride = (i: number, jump = false) => {
    const to = Math.max(0, Math.min(n - 1, i));
    const from = heading.current;
    heading.current = to;
    const T = to * d.row;
    const B = T + d.row;
    if (jump || !motionSafe || from === to) {
      anims.current.get("top")?.stop();
      anims.current.get("bottom")?.stop();
      top.jump(T);
      bottom.jump(B);
      return;
    }
    const k = lerp(260, 900, clamp01(speed));
    const lead = spring(k, 0.86);
    const trail = {
      ...spring(k * lerp(1, 0.22, clamp01(stretch)), 0.98),
      delay: clamp01(stretch) * 0.05,
    };
    const down = to > from;
    run(
      "top",
      animate(top, T, {
        ...(down ? trail : lead),
        velocity: top.getVelocity(),
      }),
    );
    run(
      "bottom",
      animate(bottom, B, {
        ...(down ? lead : trail),
        velocity: bottom.getVelocity(),
      }),
    );
  };

  const highlight = (i: number, quiet = false) => {
    if (!enabled(i) || i === active) return;
    setActive(i);
    ride(i);
    if (!quiet) {
      audio.play("tick", {
        pitch: Number((1.3 - (0.45 * i) / Math.max(1, n - 1)).toFixed(3)),
        gain: 0.4,
      });
    }
  };

  const firstEnabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < n; i += step) if (enabled(i)) return i;
    return -1;
  };

  const openAt = (i: number) => {
    const at = enabled(i) ? i : firstEnabled(0, 1);
    if (at < 0) return;
    setActive(at);
    ride(at, true);
    setOpen(true);
  };

  const choose = (i: number) => {
    const option = options[i];
    if (!option || option.disabled) return;
    audio.play("tick", { pitch: 0.8, gain: 0.55 });
    if (option.value !== chosen) {
      setPrevChosen(selectedIndex);
      if (value === undefined) setOwnValue(option.value);
      onValueChange?.(option.value);
    }
    setOpen(false);
  };

  /** Type-ahead: the next option starting with what was typed. */
  const seek = (key: string) => {
    const b = buffer.current;
    window.clearTimeout(b.timer);
    b.text += key.toLowerCase();
    b.timer = window.setTimeout(() => {
      b.text = "";
    }, TYPE_AHEAD_MS);
    // One letter pressed again cycles through the options it starts.
    const same = b.text.split("").every((c) => c === b.text[0]);
    const query = same ? (b.text[0] ?? "") : b.text;
    const start = isOpen ? active + (same || b.text.length === 1 ? 1 : 0) : 0;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const o = options[i];
      if (o && !o.disabled && o.label.toLowerCase().startsWith(query)) {
        return i;
      }
    }
    return -1;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const key = event.key;
    const printable =
      key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!isOpen) {
      if (
        key === "Enter" ||
        key === " " ||
        key === "ArrowDown" ||
        key === "ArrowUp"
      ) {
        event.preventDefault();
        openAt(
          selectedIndex >= 0
            ? selectedIndex
            : key === "ArrowUp"
              ? firstEnabled(n - 1, -1)
              : 0,
        );
        return;
      }
      if (key === "Home" || key === "End") {
        event.preventDefault();
        openAt(key === "Home" ? firstEnabled(0, 1) : firstEnabled(n - 1, -1));
        return;
      }
      if (printable && key !== " ") {
        const i = seek(key);
        if (i >= 0) openAt(i);
      }
      return;
    }
    switch (key) {
      case "ArrowDown": {
        event.preventDefault();
        const i = firstEnabled(active + 1, 1);
        if (i >= 0) highlight(i);
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        const i = firstEnabled(active - 1, -1);
        if (i >= 0) highlight(i);
        return;
      }
      case "Home":
        event.preventDefault();
        highlight(firstEnabled(0, 1));
        return;
      case "End":
        event.preventDefault();
        highlight(firstEnabled(n - 1, -1));
        return;
      case "PageDown": {
        event.preventDefault();
        const i = firstEnabled(Math.min(n - 1, active + 5), -1);
        if (i >= 0) highlight(i);
        return;
      }
      case "PageUp": {
        event.preventDefault();
        const i = firstEnabled(Math.max(0, active - 5), 1);
        if (i >= 0) highlight(i);
        return;
      }
      case "Enter":
        event.preventDefault();
        choose(active);
        return;
      case " ":
        event.preventDefault();
        if (buffer.current.text) {
          const i = seek(" ");
          if (i >= 0) highlight(i);
        } else {
          choose(active);
        }
        return;
      case "Escape":
        // Handled where focus is, so the stage around it never sees it.
        event.preventDefault();
        setOpen(false);
        return;
      case "Tab":
        choose(active);
        return;
    }
    if (printable) {
      event.preventDefault();
      const i = seek(key);
      if (i >= 0) highlight(i);
    }
  };

  React.useEffect(() => {
    latest.current = { setOpen };
  });

  // A press anywhere else closes the list.
  React.useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target))
        return;
      latest.current.setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [isOpen]);

  // Opened from outside (a controlled host): the highlight starts on the choice.
  const wasOpen = React.useRef(isOpen);
  React.useEffect(() => {
    if (wasOpen.current === isOpen) return;
    wasOpen.current = isOpen;
    if (isOpen) {
      run(
        "glow",
        animate(glow, 1, { duration: durations.fast, ease: easings.enter }),
      );
    } else {
      run(
        "glow",
        animate(glow, 0, { duration: durations.fast, ease: easings.exit }),
      );
    }
    // Answers the open state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  React.useEffect(() => {
    const running = anims.current;
    const b = buffer.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      window.clearTimeout(b.timer);
    };
  }, []);

  // The leading edge may overshoot its stop; the shape is held to the rail's
  // length so it never spills past the first or last row.
  const end = n * d.row;
  const shapeTop = useTransform(
    top,
    (t) => Math.round(Math.min(end, Math.max(0, t)) * 100) / 100,
  );
  const span = useTransform(
    [top, bottom] as MotionValue<number>[],
    ([t = 0, b = 0]: number[]) =>
      Math.max(0, Math.round((Math.min(end, b) - Math.max(0, t)) * 100) / 100),
  );
  const carY = useTransform(shapeTop, (t) => Math.round((t + 6) * 100) / 100);
  const carHeight = useTransform(span, (h) =>
    Math.max(4, Math.round((h - 12) * 100) / 100),
  );

  const shownIndex = selectedIndex;
  const list = (
    <motion.div
      id={listId}
      role="listbox"
      aria-labelledby={labelId}
      tabIndex={-1}
      initial={false}
      animate={
        isOpen
          ? { opacity: 1, y: 0, visibility: "visible" as const }
          : {
              opacity: 0,
              y: side === "top" ? 4 : -4,
              transitionEnd: { visibility: "hidden" as const },
            }
      }
      transition={
        !motionSafe
          ? { duration: durations.fast }
          : isOpen
            ? { ...springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast, ease: easings.exit }
      }
      onPointerDown={(event) => event.preventDefault()}
      className={cn(
        "absolute right-0 left-0 z-50 rounded-3 border border-hairline-strong bg-popover p-1 shadow-raised outline-none",
        side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        !isOpen && "pointer-events-none",
      )}
    >
      <div className="relative" style={{ height: n * d.row }}>
        {/* The rail, drawn down from the first stop to the last. */}
        <motion.span
          aria-hidden
          className="absolute w-0.5 origin-top rounded-full"
          initial={false}
          animate={{ scaleY: isOpen ? 1 : 0 }}
          transition={
            !motionSafe
              ? { duration: 0 }
              : isOpen
                ? springs.glide
                : { duration: durations.fast, ease: easings.exit }
          }
          style={{
            left: RAIL_X - 1,
            top: d.row / 2,
            height: Math.max(0, (n - 1) * d.row),
            background: railColor,
          }}
        />
        <motion.span
          aria-hidden
          className="absolute right-0 left-0 rounded-2"
          style={{
            y: shapeTop,
            height: span,
            top: 0,
            opacity: glow,
            background: `color-mix(in oklab, ${color} 13%, transparent)`,
          }}
        />
        <motion.span
          aria-hidden
          className="absolute w-1.5 rounded-full"
          style={{
            left: RAIL_X - 3,
            top: 0,
            y: carY,
            height: carHeight,
            opacity: glow,
            background: color,
          }}
        />
        {options.map((o, i) => {
          const selected = i === selectedIndex;
          const isActive = i === active;
          return (
            <div
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={selected}
              aria-disabled={o.disabled || undefined}
              onPointerMove={() => {
                if (!o.disabled) highlight(i);
              }}
              onClick={() => choose(i)}
              className={cn(
                "relative flex items-center gap-2 pr-2.5 select-none",
                o.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                d.text,
              )}
              style={{ height: d.row, paddingLeft: RAIL_X * 2 }}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute size-1.5 rounded-full border transition-colors duration-200",
                )}
                style={{
                  left: RAIL_X - 3,
                  top: d.row / 2 - 3,
                  borderColor: selected ? color : railColor,
                  background: selected ? color : "var(--popover)",
                }}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate transition-colors duration-150",
                  isActive || selected ? "text-foreground" : "text-ink-2",
                )}
                title={o.label}
              >
                {o.label}
              </span>
              {o.hint ? (
                <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                  {o.hint}
                </span>
              ) : null}
              <Check
                aria-hidden
                className={cn("size-3.5 shrink-0", !selected && "invisible")}
                style={{ color }}
              />
            </div>
          );
        })}
      </div>
    </motion.div>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative inline-flex max-w-full flex-col gap-1.5",
        className,
      )}
      style={{ width }}
    >
      <span
        id={labelId}
        className={cn("text-xs text-ink-3", hideLabel && "sr-only")}
      >
        {label}
      </span>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-labelledby={`${labelId} ${uid}-value`}
          aria-activedescendant={
            isOpen && active >= 0 ? optionId(active) : undefined
          }
          disabled={disabled}
          onClick={() => {
            if (isOpen) setOpen(false);
            else openAt(selectedIndex >= 0 ? selectedIndex : 0);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "flex w-full items-center gap-2 rounded-2 border border-input bg-card pr-2.5 pl-3 text-left transition-colors outline-none",
            "hover:border-hairline-strong hover:bg-surface-1",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50",
            isOpen && "border-hairline-strong",
            d.text,
          )}
          style={{ height: d.trigger }}
        >
          <span id={`${uid}-value`} className="sr-only">
            {selectedIndex >= 0 ? options[selectedIndex]?.label : placeholder}
          </span>
          {/* Every label in one cell: the longest reserves the width, and
              the chosen one rolls in from the side the list moved. */}
          <span
            aria-hidden
            className="grid min-w-0 flex-1 overflow-clip"
            style={{ lineHeight: "1.25rem" }}
          >
            {[
              { label: placeholder, i: -1 },
              ...options.map((o, i) => ({ label: o.label, i })),
            ].map(({ label: text, i }) => {
              const current = i === shownIndex;
              const above = i < shownIndex;
              const leaving = i === prevChosen && !current;
              return (
                <motion.span
                  key={i}
                  className={cn(
                    "col-start-1 row-start-1 truncate",
                    i === -1 ? "text-ink-3" : "text-foreground",
                  )}
                  initial={false}
                  animate={{
                    y: current ? "0%" : above ? "-100%" : "100%",
                    opacity: current ? 1 : 0,
                  }}
                  transition={
                    !motionSafe
                      ? { duration: durations.fast }
                      : current
                        ? springs.snap
                        : leaving
                          ? { duration: durations.base, ease: easings.exit }
                          : { duration: 0 }
                  }
                >
                  {text}
                </motion.span>
              );
            })}
          </span>
          <motion.span
            aria-hidden
            className="flex shrink-0 text-ink-3"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <ChevronsUpDown style={{ width: d.icon, height: d.icon }} />
          </motion.span>
        </button>
        {list}
      </div>
      {name ? <input type="hidden" name={name} value={chosen ?? ""} /> : null}
    </div>
  );
}
