"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type JiggleModeTone =
  "cobalt" | "signal" | "success" | "warn" | "danger" | "ink";
export type JiggleModeBadge = "remove" | "check";

export type JiggleModeItem = {
  id: string;
  /** Shown under the tile, and the tile's accessible name. */
  label: string;
  /** An icon, drawn at 20px in the tone's colour. Defaults to the label's initial. */
  glyph?: React.ReactNode;
  /** The tile is a wash of this colour, its glyph the colour itself. @default "ink" */
  tone?: JiggleModeTone;
};

export type JiggleModeProps = {
  /** Every tile that can appear. */
  items: JiggleModeItem[];
  /** Controlled: the ids shown, in order. */
  value?: string[];
  /** Initial order when uncontrolled. @default every item, in order */
  defaultValue?: string[];
  /** Fires with the new order after a drop, a removal, Done in check mode, or Undo. */
  onValueChange?: (ids: string[]) => void;
  /** Controlled: whether the grid is in edit mode. */
  editing?: boolean;
  /** @default false */
  defaultEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** A tile pressed outside edit mode. */
  onOpen?: (id: string) => void;
  /** The grid's accessible name. @default "Shortcuts" */
  label?: string;
  /** Tiles per row, 2 to 6. @default 4 */
  columns?: number;
  /** How far each tile rocks in edit mode, in degrees. @default 2 */
  wiggle?: number;
  /** How fast it rocks, in cycles per second. @default 3.5 */
  frequency?: number;
  /** Remove a tile at once, or mark tiles and remove them on Done. @default "remove" */
  badge?: JiggleModeBadge;
  /** How long a hold takes to enter edit mode, in ms. @default 500 */
  delay?: number;
  /** Play the wobble, ticks and pops. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const CELL_W = 60;
const CELL_H = 62;
const GAP_X = 8;
const GAP_Y = 10;
/** Room round the grid so a corner badge (and a wiggle) never leaves the box. */
const INSET = 12;
const PITCH_X = CELL_W + GAP_X;
const PITCH_Y = CELL_H + GAP_Y;

const TONES: Record<JiggleModeTone, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  ink: "var(--ink-2)",
};

// A sine, in four quarter-swings: fastest through upright, easing into each
// extreme, as a rocking thing does.
const OUT_SINE = "cubic-bezier(0.61, 1, 0.88, 1)";
const IN_SINE = "cubic-bezier(0.12, 0, 0.39, 0)";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const slotOf = (index: number, cols: number) => ({
  x: INSET + (index % cols) * PITCH_X,
  y: INSET + Math.floor(index / cols) * PITCH_Y,
});
const rowsOf = (n: number, cols: number) => Math.max(1, Math.ceil(n / cols));
const widthOf = (cols: number) =>
  INSET * 2 + cols * CELL_W + (cols - 1) * GAP_X;
const heightOf = (n: number, cols: number) => {
  const rows = rowsOf(n, cols);
  return INSET * 2 + rows * CELL_H + (rows - 1) * GAP_Y;
};

/** FNV-1a, unsigned: a tile's own phase and period, the same on every load. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

const moveItem = (list: string[], from: number, to: number) => {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
};

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => b[i] === id);

const left = (n: number) => (n === 1 ? "1 left" : `${n} left`);

/** The face's current angle, read off whatever is rotating it right now. */
function angleOf(el: HTMLElement): number {
  if (typeof DOMMatrixReadOnly === "undefined") return 0;
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try {
    const m = new DOMMatrixReadOnly(t);
    return r2((Math.atan2(m.b, m.a) * 180) / Math.PI);
  } catch {
    return 0;
  }
}

type TileProps = {
  item: JiggleModeItem;
  index: number;
  cols: number;
  rows: number;
  editing: boolean;
  dragging: boolean;
  carried: boolean;
  marked: boolean;
  badge: JiggleModeBadge;
  focusable: boolean;
  ready: number;
  /** Mounted by Undo: it scales back in rather than just appearing. */
  enter: boolean;
  /** Bumped when the grid reflows to a new width: tiles take their new slot at once. */
  jump: number;
  wiggle: number;
  frequency: number;
  delay: number;
  hintId: string;
  motionSafe: boolean;
  disabled: boolean;
  setButton: (id: string, node: HTMLButtonElement | null) => void;
  onFocus: (id: string) => void;
  onHoldComplete: (id: string) => void;
  onOpen: (id: string) => void;
  onBadge: (id: string) => void;
  onKey: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => number;
  onDragCancel: (id: string) => void;
};

function Tile(props: TileProps) {
  const {
    item,
    index,
    cols,
    rows,
    editing,
    dragging,
    carried,
    marked,
    badge,
    motionSafe,
    disabled,
  } = props;
  const home = slotOf(index, cols);
  const x = useMotionValue(home.x);
  const y = useMotionValue(home.y);
  const press = useMotionValue(0);
  const lift = useMotionValue(0);
  const rotate = useMotionValue(0);
  // The tile's own arrival and departure live in motion values rather than
  // an `initial` prop: an element with `initial` snaps every value it holds,
  // x and y included, back to its first render whenever it is re-mounted, and
  // React's development checks re-mount a tile each time a drop moves it.
  const fade = useMotionValue(props.enter ? 0 : 1);
  const grow = useMotionValue(props.enter && motionSafe ? 0.6 : 1);

  const faceRef = React.useRef<HTMLDivElement | null>(null);
  const aimed = React.useRef(home);
  const travel = React.useRef<AnimationPlaybackControls[]>([]);
  const pressRun = React.useRef<AnimationPlaybackControls | null>(null);
  const liftRun = React.useRef<AnimationPlaybackControls | null>(null);
  const settleRun = React.useRef<AnimationPlaybackControls | null>(null);
  const rocking = React.useRef<Animation | null>(null);
  const warm = React.useRef(false);
  const hold = React.useRef<{ timer: number; entered: boolean } | null>(null);
  const dragActive = React.useRef(false);
  const origin = React.useRef({ x: 0, y: 0 });

  const latest = React.useRef(props);
  React.useEffect(() => {
    latest.current = props;
  });

  React.useEffect(() => {
    if (!latest.current.enter) return;
    const arrive = [
      animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      latest.current.motionSafe ? animate(grow, 1, springs.snap) : null,
    ];
    return () => {
      for (const a of arrive) a?.stop();
    };
  }, [fade, grow]);

  const glideTo = (to: { x: number; y: number }, vx = 0, vy = 0) => {
    aimed.current = to;
    for (const c of travel.current) c.stop();
    if (!latest.current.motionSafe) {
      travel.current = [];
      x.set(to.x);
      y.set(to.y);
      return;
    }
    travel.current = [
      animate(x, to.x, { ...springs.glide, velocity: vx }),
      animate(y, to.y, { ...springs.glide, velocity: vy }),
    ];
  };

  const liftTo = (to: number) => {
    liftRun.current?.stop();
    liftRun.current = latest.current.motionSafe
      ? animate(lift, to, to > 0 ? springs.flick : springs.snap)
      : null;
    if (!latest.current.motionSafe) lift.set(0);
  };

  // A new slot is glided to, unless the finger has the tile. A reflow to a
  // new width is not a move the reader made, so it lands at once.
  const lastJump = React.useRef(props.jump);
  React.useEffect(() => {
    if (dragging) return;
    const to = slotOf(index, cols);
    if (lastJump.current !== props.jump) {
      lastJump.current = props.jump;
      for (const c of travel.current) c.stop();
      travel.current = [];
      x.set(to.x);
      y.set(to.y);
      aimed.current = to;
      return;
    }
    if (aimed.current.x === to.x && aimed.current.y === to.y) return;
    glideTo(to);
    // glideTo reads the latest props and only the slot decides when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, cols, dragging, props.jump]);

  React.useEffect(() => {
    if (dragActive.current) return;
    liftTo(carried ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carried]);

  // The wiggle runs on the compositor (Web Animations on the face alone), so
  // edit mode costs nothing per frame in script and nothing off-screen. It
  // starts from upright, after this tile's place in the ripple, and a tile
  // that stops eases from wherever it is back to 0 on the snap spring.
  const wiggling = editing && motionSafe && !dragging && !carried;
  React.useEffect(() => {
    const el = faceRef.current;
    if (!el) return;
    if (!wiggling) {
      if (!editing) warm.current = false;
      const running = rocking.current;
      if (running) {
        const angle = angleOf(el);
        el.style.transform = `rotate(${angle}deg)`;
        rotate.set(angle);
        running.cancel();
        rocking.current = null;
      }
      // Also picks up a settle that a re-mount stopped halfway.
      if (rotate.get() !== 0) {
        settleRun.current?.stop();
        settleRun.current = animate(rotate, 0, springs.snap);
      }
      return;
    }
    if (typeof el.animate !== "function") return;
    rocking.current?.cancel();
    settleRun.current?.stop();
    rotate.set(0);
    const h = hash(item.id);
    const a = r2(Math.min(8, Math.max(0, props.wiggle)));
    const hz = Math.min(8, Math.max(0.5, props.frequency));
    const period = Math.round(
      (1000 / hz) * (1 + ((h % 1000) / 1000 - 0.5) * 0.14),
    );
    const side = h & 1 ? 1 : -1;
    const start = warm.current ? 0 : Math.round(latest.current.ready * 1000);
    warm.current = true;
    rocking.current = el.animate(
      [
        { transform: "rotate(0deg)", easing: OUT_SINE },
        { transform: `rotate(${side * a}deg)`, easing: IN_SINE },
        { transform: "rotate(0deg)", easing: OUT_SINE },
        { transform: `rotate(${-side * a}deg)`, easing: IN_SINE },
        { transform: "rotate(0deg)" },
      ],
      { duration: period, delay: start, iterations: Infinity },
    );
  }, [wiggling, editing, props.wiggle, props.frequency, item.id, rotate]);

  const endHold = (): "none" | "tap" | "entered" => {
    const h = hold.current;
    if (!h) return "none";
    hold.current = null;
    window.clearTimeout(h.timer);
    if (!h.entered) {
      pressRun.current?.stop();
      pressRun.current = animate(
        press,
        0,
        latest.current.motionSafe ? springs.snap : { duration: durations.fast },
      );
    }
    return h.entered ? "entered" : "tap";
  };

  const startHold = () => {
    const now = latest.current;
    if (now.disabled || now.editing || hold.current) return;
    const ms = Math.max(100, now.delay);
    pressRun.current?.stop();
    pressRun.current = animate(press, 1, {
      duration: r3(ms / 1000),
      ease: "linear",
    });
    const timer = window.setTimeout(() => {
      const h = hold.current;
      if (!h) return;
      h.entered = true;
      // The held tile pops back up with one overshoot as the rest get ready.
      pressRun.current?.stop();
      pressRun.current = animate(
        press,
        0,
        latest.current.motionSafe ? springs.snap : { duration: durations.fast },
      );
      latest.current.onHoldComplete(item.id);
    }, ms);
    hold.current = { timer, entered: false };
  };

  // A hold never outlives the page's attention.
  React.useEffect(() => {
    const abandon = () => {
      endHold();
    };
    const onVisibility = () => {
      if (document.hidden) abandon();
    };
    window.addEventListener("blur", abandon);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", abandon);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effects can be torn down and re-run without the tile going anywhere
  // (React's development checks do it whenever a drop moves a tile in the
  // list). Whatever that interrupts is left where the re-run will finish it:
  // the slot is marked unreached so the glide resumes, and a press that was
  // springing back is sent home again.
  React.useEffect(() => {
    if (!hold.current && press.get() !== 0) {
      pressRun.current = animate(
        press,
        0,
        latest.current.motionSafe ? springs.snap : { duration: durations.fast },
      );
    }
    return () => {
      for (const c of travel.current) c.stop();
      travel.current = [];
      aimed.current = { x: x.get(), y: y.get() };
      pressRun.current?.stop();
      liftRun.current?.stop();
      settleRun.current?.stop();
      rocking.current?.cancel();
      rocking.current = null;
      if (hold.current) window.clearTimeout(hold.current.timer);
      hold.current = null;
    };
  }, [press, x, y]);

  const drag = useDrag({
    // Before edit mode a finger may wander a little and still be a hold;
    // in edit mode a tile moves as soon as it is clearly dragged.
    threshold: editing ? 4 : 10,
    disabled,
    onStart: () => {
      if (!editing) {
        endHold();
        return;
      }
      endHold();
      dragActive.current = true;
      for (const c of travel.current) c.stop();
      travel.current = [];
      origin.current = { x: x.get(), y: y.get() };
      liftTo(1);
      props.onDragStart(item.id);
    },
    onMove: ({ offset }) => {
      if (!dragActive.current) return;
      const maxX = INSET + (cols - 1) * PITCH_X;
      const maxY = INSET + (rows - 1) * PITCH_Y;
      const nx = rubberClamp(origin.current.x + offset.x, INSET, maxX, INSET);
      const ny = rubberClamp(origin.current.y + offset.y, INSET, maxY, INSET);
      x.set(r2(nx));
      y.set(r2(ny));
      props.onDragMove(item.id, nx, ny);
    },
    onEnd: ({ velocity }) => {
      if (!dragActive.current) return;
      dragActive.current = false;
      // A flick lands in the slot it was heading for, not the one under the
      // finger; the tile carries its throw into the glide.
      const final = props.onDragEnd(
        item.id,
        project(x.get(), velocity.x, 0.99),
        project(y.get(), velocity.y, 0.99),
      );
      glideTo(slotOf(final, cols), velocity.x, velocity.y);
      liftTo(0);
    },
    onCancel: () => {
      if (!dragActive.current) {
        endHold();
        return;
      }
      dragActive.current = false;
      props.onDragCancel(item.id);
      glideTo(aimed.current);
      liftTo(0);
    },
    onTap: () => {
      const how = endHold();
      if (how === "entered") return;
      if (editing) {
        if (badge === "check") props.onBadge(item.id);
        return;
      }
      props.onOpen(item.id);
    },
  });

  const scale = useTransform([press, lift], ([p, l]) =>
    motionSafe ? r3(1 + 0.08 * (l as number) - 0.07 * (p as number)) : 1,
  );
  const shade = useTransform(press, (p) => (motionSafe ? 0 : r3(p * 0.3)));
  const tone = TONES[item.tone ?? "ink"] ?? TONES.ink;

  return (
    <motion.li
      className="absolute top-0 left-0"
      style={{
        x,
        y,
        width: CELL_W,
        height: CELL_H,
        zIndex: dragging || carried ? 2 : 1,
        opacity: fade,
        scale: grow,
      }}
      exit="gone"
      variants={{
        gone: (delays: Record<string, number> | undefined) => ({
          opacity: 0,
          scale: motionSafe ? 0.6 : 1,
          transition: {
            ...exitFor(durations.base),
            delay: delays?.[item.id] ?? 0,
          },
        }),
      }}
    >
      <motion.div
        className="relative size-full"
        style={{ scale }}
        animate={{ opacity: marked ? 0.4 : 1 }}
        transition={{ duration: durations.base, ease: easings.enter }}
      >
        <motion.div
          ref={faceRef}
          className="relative size-full"
          style={{ rotate }}
        >
          <button
            ref={(node) => props.setButton(item.id, node)}
            type="button"
            tabIndex={props.focusable ? 0 : -1}
            aria-label={item.label}
            aria-describedby={props.hintId}
            disabled={disabled}
            onFocus={() => props.onFocus(item.id)}
            onPointerDown={(event) => {
              drag.onPointerDown(event);
              if (event.pointerType === "mouse" && event.button !== 0) return;
              if (!editing) startHold();
            }}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={(event) => {
              drag.onPointerCancel(event);
              endHold();
            }}
            onLostPointerCapture={drag.onLostPointerCapture}
            onKeyDown={(event) => {
              if (!editing && (event.key === " " || event.key === "Enter")) {
                // The key is the hold: a quick press opens, a long one edits.
                event.preventDefault();
                if (!event.repeat) startHold();
                return;
              }
              props.onKey(item.id, event);
            }}
            onKeyUp={(event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              if (endHold() === "tap") props.onOpen(item.id);
            }}
            onBlur={() => {
              endHold();
            }}
            onClick={(event) => {
              // Assistive technology activates with no key to hold.
              if (event.detail !== 0 || editing) return;
              props.onOpen(item.id);
            }}
            className={cn(
              "flex size-full cursor-pointer flex-col items-center gap-1 rounded-3 outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50",
              editing ? "touch-none" : "touch-pan-y",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "relative flex size-11 shrink-0 items-center justify-center rounded-3 border border-hairline [&>svg]:size-5",
                carried && "outline-2 outline-offset-2 outline-cobalt-bright",
                editing &&
                  !motionSafe &&
                  !carried &&
                  "outline-1 outline-offset-2 outline-ink-3 outline-dashed",
              )}
              style={{
                background: `color-mix(in oklab, ${tone} 16%, var(--bg-1))`,
                color: tone,
              }}
            >
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-3"
                style={{
                  opacity: lift,
                  boxShadow:
                    "0 10px 18px -8px color-mix(in oklab, black 45%, transparent)",
                }}
              />
              {item.glyph ?? (
                <span className="text-base font-semibold">
                  {item.label.charAt(0).toUpperCase()}
                </span>
              )}
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-3 bg-foreground"
                style={{ opacity: shade }}
              />
            </span>
            <span
              className="w-full truncate text-center text-[11px] leading-[14px] text-ink-2"
              title={item.label}
            >
              {item.label}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {editing ? (
              <Badge
                key="badge"
                kind={badge}
                name={item.label}
                marked={marked}
                ready={props.ready}
                motionSafe={motionSafe}
                disabled={disabled}
                onPress={() => props.onBadge(item.id)}
              />
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.li>
  );
}

/**
 * A tile's corner badge. Its pop-in is driven from motion values for the
 * same reason as the tile's own arrival: it moves with the tile.
 */
function Badge({
  kind,
  name,
  marked,
  ready,
  motionSafe,
  disabled,
  onPress,
}: {
  kind: JiggleModeBadge;
  name: string;
  marked: boolean;
  ready: number;
  motionSafe: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const shown = useMotionValue(0);
  const size = useMotionValue(motionSafe ? 0 : 1);
  React.useEffect(() => {
    const arrive = [
      animate(shown, 1, { duration: durations.fast, delay: ready }),
      motionSafe ? animate(size, 1, { ...springs.snap, delay: ready }) : null,
    ];
    if (!motionSafe) size.set(1);
    return () => {
      for (const a of arrive) a?.stop();
    };
  }, [motionSafe, ready, shown, size]);

  return (
    <motion.button
      type="button"
      tabIndex={-1}
      aria-label={kind === "remove" ? `Remove ${name}` : `Keep ${name}`}
      aria-pressed={kind === "check" ? !marked : undefined}
      disabled={disabled}
      onClick={onPress}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "absolute -top-2.5 flex size-6 cursor-pointer touch-manipulation items-center justify-center rounded-full outline-none",
        kind === "remove" ? "-left-0.5" : "-right-0.5",
      )}
      style={{ scale: size, opacity: shown }}
      exit={{
        scale: motionSafe ? 0.5 : 1,
        opacity: 0,
        transition: exitFor(durations.fast),
      }}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-[18px] items-center justify-center rounded-full border-2 border-surface-1 transition-colors",
          kind === "remove"
            ? "bg-ink-2 text-surface-1"
            : marked
              ? "bg-surface-2 text-transparent"
              : "bg-cobalt-bright text-primary-foreground",
        )}
      >
        <svg viewBox="0 0 10 10" className="size-2.5" fill="none">
          {kind === "remove" ? (
            <path
              d="M2.5 5 H7.5"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M2.4 5.2 L4.2 7 L7.6 3.2"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>
    </motion.button>
  );
}

type Carry = { id: string; from: string[] };

/**
 * A grid of shortcut tiles with an edit mode you enter by holding one. A
 * held tile sinks for `delay` ms, pops back up with one overshoot, and edit
 * mode spreads outward from it: tile by tile, in order of distance, each
 * starts to rock out of phase with its neighbours (its own period and
 * direction, from a hash of its id) and gains a badge. In edit mode a tile
 * drags 1:1, lifts, rubber-bands past the edges, parts the others on the
 * glide spring as it crosses slots with a tick, and a flick lands in the
 * slot it was heading for. A remove badge takes a tile away at once with a
 * pop; a check badge marks it, and Done takes the marked ones away. Undo
 * brings the last removal back. Done or Escape settles every tile from
 * wherever it was in its swing back to upright.
 *
 * Tiles are buttons with one tab stop and arrow keys between them. A quick
 * Space or Enter opens a tile; held for `delay`, it enters edit mode. In
 * edit mode Space picks a tile up, arrows move it, Space drops it and Escape
 * puts it back; Delete does the badge's job. Under reduced motion nothing
 * rocks or glides: badges fade in, tiles gain a dashed ring, moves are
 * immediate, and every sound and announcement is unchanged.
 */
export function JiggleMode({
  items,
  value,
  defaultValue,
  onValueChange,
  editing,
  defaultEditing = false,
  onEditingChange,
  onOpen,
  label = "Shortcuts",
  columns = 4,
  wiggle = 2,
  frequency = 3.5,
  badge = "remove",
  delay = 500,
  sound = false,
  disabled = false,
  className,
}: JiggleModeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const wanted = Math.round(Math.min(6, Math.max(2, columns)));
  // `columns` is the most the grid shows; a narrower container gets fewer,
  // measured, so the grid never runs past its own box. It grows back when
  // the room comes back.
  const [fit, setFit] = React.useState<{ cols: number; jump: number }>({
    cols: wanted,
    jump: 0,
  });
  const cols = Math.min(wanted, fit.cols);

  const byId = React.useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const [ownOrder, setOwnOrder] = React.useState<string[]>(
    () => defaultValue ?? items.map((item) => item.id),
  );
  const rawOrder = value ?? ownOrder;
  const order = React.useMemo(
    () =>
      rawOrder.filter((id, i) => byId.has(id) && rawOrder.indexOf(id) === i),
    [rawOrder, byId],
  );
  const [ownEditing, setOwnEditing] = React.useState(defaultEditing);
  const isEditing = (editing ?? ownEditing) && !disabled;

  const [working, setWorking] = React.useState<string[] | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [carry, setCarry] = React.useState<Carry | null>(null);
  const [marked, setMarked] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [history, setHistory] = React.useState<
    { id: string; index: number }[][]
  >([]);
  const [ripple, setRipple] = React.useState<Record<string, number>>({});
  const [exitDelays, setExitDelays] = React.useState<Record<string, number>>(
    {},
  );
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ text: "", n: 0 });
  const [entering, setEntering] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const workingRef = React.useRef<string[] | null>(null);
  const refocus = React.useRef<string | null>(null);
  const timers = React.useRef<number[]>([]);

  const positions = working ?? order;
  const count = order.length;
  const rows = rowsOf(count, cols);
  const width = widthOf(cols);
  const tabStop =
    focusId && order.includes(focusId) ? focusId : (order[0] ?? null);

  const height = useMotionValue(heightOf(count, cols));
  const heightJump = React.useRef(fit.jump);
  React.useEffect(() => {
    const target = heightOf(count, cols);
    if (!motionSafe || heightJump.current !== fit.jump) {
      heightJump.current = fit.jump;
      height.set(target);
      return;
    }
    const run = animate(height, target, springs.glide);
    return () => run.stop();
  }, [count, cols, motionSafe, height, fit.jump]);

  // Measured before paint, so a narrow host never sees the wide grid.
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const room = root.clientWidth;
      if (room <= 0) return;
      const next = Math.max(
        2,
        Math.min(wanted, Math.floor((room - INSET * 2 + GAP_X) / PITCH_X)),
      );
      setFit((prev) =>
        prev.cols === next ? prev : { cols: next, jump: prev.jump + 1 },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [wanted]);

  React.useEffect(() => {
    const owned = timers.current;
    return () => {
      for (const t of owned) window.clearTimeout(t);
      owned.length = 0;
    };
  }, []);

  // Focus that has to land on a tile after a swap lands once it is there.
  React.useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    const node = buttons.current.get(id);
    if (!node) return;
    refocus.current = null;
    if (document.activeElement !== node) node.focus();
  });

  const announce = (text: string) => setSaid((s) => ({ text, n: s.n + 1 }));
  const nameOf = (id: string) => byId.get(id)?.label ?? "Tile";
  const hasFocus = () =>
    !!rootRef.current &&
    rootRef.current.contains(
      typeof document === "undefined" ? null : document.activeElement,
    );
  const panOf = (id: string) => {
    const rect = buttons.current.get(id)?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const commitOrder = (next: string[]) => {
    if (value === undefined) setOwnOrder(next);
    onValueChange?.(next);
  };
  const setEdit = (next: boolean) => {
    if (editing === undefined) setOwnEditing(next);
    onEditingChange?.(next);
  };

  const setWorkingOrder = (next: string[] | null) => {
    workingRef.current = next;
    setWorking(next);
  };

  const slotAt = (px: number, py: number, n: number) => {
    const r = rowsOf(n, cols);
    const col = Math.min(
      cols - 1,
      Math.max(0, Math.round((px - INSET) / PITCH_X)),
    );
    const row = Math.min(
      r - 1,
      Math.max(0, Math.round((py - INSET) / PITCH_Y)),
    );
    return Math.max(0, Math.min(n - 1, row * cols + col));
  };

  const tick = (index: number, n: number, pan: number) =>
    audio.play("tick", {
      pitch: r3(0.9 + (n > 1 ? index / (n - 1) : 0) * 0.5),
      gain: 0.4,
      pan,
    });

  const enterFromHold = (id: string) => {
    if (isEditing || disabled) return;
    const from = Math.max(0, order.indexOf(id));
    const step = cascade(order.length);
    const next: Record<string, number> = {};
    order.forEach((other, i) => {
      const dc = (i % cols) - (from % cols);
      const dr = Math.floor(i / cols) - Math.floor(from / cols);
      next[other] = r3(Math.hypot(dc, dr) * step);
    });
    setRipple(next);
    setMarked(new Set());
    audio.play("twang", { pitch: 1.6, gain: 0.35, pan: panOf(id) });
    setEdit(true);
    announce(
      badge === "remove"
        ? `Editing ${label}. Drag a tile or press Space to move it, Delete to remove it, Escape when done.`
        : `Editing ${label}. Drag a tile or press Space to move it, Delete to mark it for removal, Escape when done.`,
    );
  };

  const remove = (id: string) => {
    const index = order.indexOf(id);
    if (index < 0) return;
    const next = order.filter((other) => other !== id);
    audio.play("pop", { gain: 0.5, pan: panOf(id) });
    setExitDelays({ [id]: 0 });
    setHistory((h) => [...h.slice(-19), [{ id, index }]]);
    const neighbour = next[Math.min(index, next.length - 1)] ?? null;
    if (hasFocus()) refocus.current = neighbour;
    if (focusId === id) setFocusId(neighbour);
    commitOrder(next);
    announce(`${nameOf(id)} removed, ${left(next.length)}.`);
  };

  const toggleMark = (id: string) => {
    const going = !marked.has(id);
    const next = new Set(marked);
    if (going) next.add(id);
    else next.delete(id);
    setMarked(next);
    audio.play("tick", {
      pitch: going ? 0.8 : 1.2,
      gain: 0.35,
      pan: panOf(id),
    });
    announce(
      going ? `${nameOf(id)} will be removed on Done.` : `${nameOf(id)} kept.`,
    );
  };

  const onBadge = (id: string) => {
    if (!isEditing || disabled) return;
    if (badge === "remove") remove(id);
    else toggleMark(id);
  };

  const finish = () => {
    if (!isEditing) return;
    const focused = hasFocus();
    const base = workingRef.current ?? order;
    setWorkingOrder(null);
    setCarry(null);
    setDragId(null);
    let next = base;
    let removed = 0;
    if (badge === "check" && marked.size > 0) {
      const gone = base.filter((id) => marked.has(id));
      const step = cascade(gone.length);
      const delays: Record<string, number> = {};
      gone.forEach((id, k) => {
        delays[id] = r3(k * step);
        const pan = panOf(id);
        const pitch = r3(1 + k * 0.05);
        if (k === 0) {
          audio.play("pop", { gain: 0.5, pan, pitch });
          return;
        }
        const t = window.setTimeout(
          () => audio.play("pop", { gain: 0.5, pan, pitch }),
          Math.round(k * step * 1000),
        );
        timers.current.push(t);
      });
      setExitDelays(delays);
      setHistory((h) => [
        ...h.slice(-19),
        gone.map((id) => ({ id, index: base.indexOf(id) })),
      ]);
      next = base.filter((id) => !marked.has(id));
      removed = gone.length;
    }
    if (!same(next, order)) commitOrder(next);
    setMarked(new Set());
    setRipple({});
    audio.play("tick", { pitch: 0.75, gain: 0.35 });
    setEdit(false);
    const target =
      tabStop && next.includes(tabStop) ? tabStop : (next[0] ?? null);
    if (target !== tabStop) setFocusId(target);
    if (focused) refocus.current = target;
    announce(
      removed > 0
        ? `Done. ${removed} removed, ${left(next.length)}.`
        : "Done editing.",
    );
  };

  const undo = () => {
    const batch = history[history.length - 1];
    if (!batch) return;
    const next = order.slice();
    const back: string[] = [];
    for (const entry of [...batch].sort((a, b) => a.index - b.index)) {
      if (!byId.has(entry.id) || next.includes(entry.id)) continue;
      next.splice(Math.min(entry.index, next.length), 0, entry.id);
      back.push(entry.id);
    }
    setHistory((h) => h.slice(0, -1));
    if (back.length === 0) return;
    setEntering(new Set(back));
    audio.play("pop", { pitch: 1.3, gain: 0.4 });
    if (hasFocus() && history.length === 1) refocus.current = back[0] ?? null;
    commitOrder(next);
    announce(
      `${back.map(nameOf).join(", ")} restored, ${next.length} ${next.length === 1 ? "tile" : "tiles"}.`,
    );
  };

  const pickUp = (id: string) => {
    const list = order.slice();
    setCarry({ id, from: list });
    setWorkingOrder(list);
    const i = list.indexOf(id);
    tick(i, list.length, panOf(id));
    announce(
      `${nameOf(id)} picked up, ${i + 1} of ${list.length}. Arrows move it, Space drops it, Escape puts it back.`,
    );
  };

  const moveCarry = (id: string, to: number) => {
    const list = workingRef.current ?? order;
    const from = list.indexOf(id);
    if (from < 0 || to === from) return;
    const next = moveItem(list, from, to);
    setWorkingOrder(next);
    tick(to, next.length, panOf(id));
    announce(`${nameOf(id)}, ${to + 1} of ${next.length}.`);
  };

  const drop = () => {
    if (!carry) return;
    const list = workingRef.current ?? order;
    const i = list.indexOf(carry.id);
    setCarry(null);
    setWorkingOrder(null);
    refocus.current = carry.id;
    if (!same(list, order)) commitOrder(list);
    audio.play("tick", { pitch: 0.8, gain: 0.4, pan: panOf(carry.id) });
    announce(`${nameOf(carry.id)} dropped, ${i + 1} of ${list.length}.`);
  };

  const cancelCarry = () => {
    if (!carry) return;
    const i = order.indexOf(carry.id);
    setCarry(null);
    setWorkingOrder(null);
    announce(`${nameOf(carry.id)} put back, ${i + 1} of ${order.length}.`);
  };

  const focusTile = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    buttons.current.get(id)?.focus();
  };

  const onKey = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const list = workingRef.current ?? order;
    const i = list.indexOf(id);
    const n = list.length;
    if (i < 0) return;
    const row = Math.floor(i / cols);
    let to: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
        to = i - 1;
        break;
      case "ArrowRight":
        to = i + 1;
        break;
      case "ArrowUp":
        to = row > 0 ? i - cols : -1;
        break;
      case "ArrowDown":
        to = row < rowsOf(n, cols) - 1 ? Math.min(n - 1, i + cols) : -1;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
    }
    if (to !== null) {
      event.preventDefault();
      if (to < 0 || to >= n || dragId) return;
      if (carry?.id === id) moveCarry(id, to);
      else focusTile(list[to]);
      return;
    }
    if (!isEditing) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat || dragId) return;
      if (carry?.id === id) drop();
      else if (!carry) pickUp(id);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (!carry) onBadge(id);
    }
  };

  const onDragStart = (id: string) => {
    if (carry) cancelCarry();
    setDragId(id);
    setWorkingOrder(order.slice());
  };

  const onDragMove = (id: string, px: number, py: number) => {
    const list = workingRef.current ?? order;
    const from = list.indexOf(id);
    if (from < 0) return;
    const to = slotAt(px, py, list.length);
    if (to === from) return;
    const next = moveItem(list, from, to);
    setWorkingOrder(next);
    tick(to, next.length, panOf(id));
  };

  const onDragEnd = (id: string, px: number, py: number) => {
    const list = workingRef.current ?? order;
    const from = list.indexOf(id);
    const to = from < 0 ? from : slotAt(px, py, list.length);
    const next = from >= 0 && to !== from ? moveItem(list, from, to) : list;
    setWorkingOrder(null);
    setDragId(null);
    const final = Math.max(0, next.indexOf(id));
    if (!same(next, order)) {
      commitOrder(next);
      if (to !== from) tick(final, next.length, panOf(id));
      announce(`${nameOf(id)} moved, ${final + 1} of ${next.length}.`);
    }
    return final;
  };

  const onDragCancel = () => {
    setWorkingOrder(null);
    setDragId(null);
  };

  const hint = isEditing
    ? badge === "remove"
      ? "Editing. Space picks a tile up to move it, Delete removes it, Escape finishes."
      : "Editing. Space picks a tile up to move it, Delete marks it for removal, Escape finishes."
    : "Press to open. Hold for a moment, with a finger or with Space, to edit.";

  const caption = carry
    ? `Moving ${nameOf(carry.id)}`
    : isEditing
      ? badge === "check"
        ? marked.size > 0
          ? `${marked.size} to remove on Done`
          : "Drag to move · uncheck to remove"
        : "Drag to move · − to remove"
      : count === 0
        ? "Nothing left to show"
        : "Hold a tile to edit";

  return (
    <div
      ref={rootRef}
      className={cn("flex w-full flex-col gap-2", className)}
      style={{ maxWidth: widthOf(wanted) }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (carry) {
          event.preventDefault();
          cancelCarry();
          return;
        }
        if (isEditing) {
          event.preventDefault();
          finish();
        }
      }}
    >
      <motion.div
        className="relative self-center overflow-clip"
        style={{ width, height }}
      >
        <ul
          role="list"
          aria-label={label}
          className="absolute inset-0 select-none [-webkit-touch-callout:none]"
          onContextMenu={(event) => event.preventDefault()}
        >
          <AnimatePresence initial={false} custom={exitDelays}>
            {order.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              return (
                <Tile
                  key={id}
                  item={item}
                  index={Math.max(0, positions.indexOf(id))}
                  cols={cols}
                  rows={rows}
                  editing={isEditing}
                  dragging={dragId === id}
                  carried={carry?.id === id}
                  marked={isEditing && badge === "check" && marked.has(id)}
                  badge={badge}
                  focusable={tabStop === id}
                  ready={ripple[id] ?? 0}
                  enter={entering.has(id)}
                  jump={fit.jump}
                  wiggle={wiggle}
                  frequency={frequency}
                  delay={delay}
                  hintId={hintId}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  setButton={(key, node) => {
                    if (node) buttons.current.set(key, node);
                    else buttons.current.delete(key);
                  }}
                  onFocus={setFocusId}
                  onHoldComplete={enterFromHold}
                  onOpen={(key) => {
                    if (!disabled) onOpen?.(key);
                  }}
                  onBadge={onBadge}
                  onKey={onKey}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  onDragCancel={onDragCancel}
                />
              );
            })}
          </AnimatePresence>
        </ul>
        {count === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">
            No tiles
          </p>
        ) : null}
      </motion.div>

      <div className="flex h-8 items-center gap-2 px-3">
        <p
          className="min-w-0 flex-1 truncate text-xs text-ink-3"
          title={caption}
        >
          {caption}
        </p>
        {history.length > 0 ? (
          <button
            type="button"
            onClick={undo}
            disabled={disabled}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-2 px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50"
          >
            Undo
          </button>
        ) : null}
        <AnimatePresence initial={false}>
          {isEditing ? (
            <motion.button
              key="done"
              type="button"
              onClick={finish}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.9 : 1,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              Done
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <p id={hintId} className="sr-only">
        {hint}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
