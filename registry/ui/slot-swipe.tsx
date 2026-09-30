"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlotSwipeItem = {
  id: string;
  /** Who it is from. */
  from: string;
  subject: string;
  /** A short time or date shown at the end of the row. */
  time?: string;
};

export type SlotSwipeSide = "right" | "left";
export type SlotSwipeAction = "archive" | "snooze";

export type SlotSwipeProps = {
  /** Every row that can appear. */
  items: SlotSwipeItem[];
  /** Controlled: the ids still in the inbox, in order. */
  value?: string[];
  /** Starting ids when uncontrolled. @default every item, in order */
  defaultValue?: string[];
  /** Fires from the swipe, key or Undo that changed the list, with the ids left. */
  onValueChange?: (ids: string[]) => void;
  /** Fires with what happened to a row: into the slot (archive) or the drawer (snooze). */
  onAction?: (id: string, action: SlotSwipeAction) => void;
  /** A row pressed without a swipe, or Enter on it. */
  onOpen?: (id: string) => void;
  /** The list's name. @default "Inbox" */
  label?: string;
  /** The hour the drawer's clock lands on, 0 to 23. @default 9 */
  snoozeHour?: number;
  /** How far a row must go (or be thrown), as a share of its lane, 0.2 to 0.6. @default 0.35 */
  threshold?: number;
  /** Which end the slot is on; the drawer takes the other. @default "right" */
  side?: SlotSwipeSide;
  /** How much a row squeezes to fit the slot or the drawer, 0 to 1. @default 0.5 */
  squash?: number;
  /** An Undo button in the header after each swipe. @default true */
  undo?: boolean;
  /** Shown when nothing is left. @default "Inbox zero" */
  empty?: React.ReactNode;
  /** The thwup, the clock's ratchet and the drawer's clack. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** A row's height, and the gap under it that goes with it when it leaves. */
const ROW = 60;
const GAP = 6;
const LANE = ROW + GAP;
/** The room at each end of a lane: the slot on one side, the drawer on the other. */
const GUTTER = 12;
/** The slit's centre, from the lane's edge: rows are clipped here. */
const SLIT = 6;
const DRAWER_REST = 10;
const DRAWER_OPEN = 58;
const HOLE = "color-mix(in oklab, var(--bg-0) 30%, black)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const hourText = (h: number) => `${h}:00`;

type Destiny = SlotSwipeAction | null;

type RowProps = {
  item: SlotSwipeItem;
  travel: MotionValue<number>;
  /** +1 when the slot is on the right. */
  slotSign: 1 | -1;
  threshold: number;
  squash: number;
  snoozeHour: number;
  /** Mounted by Undo: it comes back out of where it went. */
  enter: Destiny;
  /** Changes on every commit, so a row the host kept can see it was kept. */
  tick: number;
  focusable: boolean;
  hintId: string;
  motionSafe: boolean;
  disabled: boolean;
  audio: TactileSound;
  setButton: (id: string, node: HTMLButtonElement | null) => void;
  onFocus: (id: string) => void;
  onCommit: (id: string, action: SlotSwipeAction) => void;
  onOpen: (id: string) => void;
  onKeyMove: (id: string, key: string) => void;
};

function Row(props: RowProps) {
  const { item, travel, slotSign: S, threshold, squash, motionSafe } = props;
  const [isPresent, safeToRemove] = usePresence();

  const x = useMotionValue(0);
  const gate = useMotionValue(1);
  const drawerGate = useMotionValue(1);
  const minute = useMotionValue(0);
  const hour = useMotionValue(0);
  const fade = useMotionValue(props.enter && !motionSafe ? 0 : 1);
  const height = useMotionValue(props.enter ? 0 : LANE);

  const laneRef = React.useRef<HTMLLIElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const destiny = React.useRef<Destiny>(null);
  // Wholly inside the slot or the drawer.
  const sealed = React.useRef(false);
  // The swallow has finished what the eye follows: the slot has shut, or the
  // clock has spun and the drawer is shutting. The lane may close after it.
  const settled = React.useRef(false);
  const onSettled = React.useRef<(() => void) | null>(null);
  const spun = React.useRef(false);
  const dragging = React.useRef(false);
  const from = React.useRef(0);
  const detach = React.useRef<(() => void) | null>(null);
  // Only a swipe, a key or Undo is heard.
  const audible = React.useRef(false);
  const [grabbing, setGrabbing] = React.useState(false);
  // Committed rows take no more gestures or keys: a reading of the ref above
  // that rendering is allowed to see.
  const [committed, setCommitted] = React.useState<Destiny>(null);

  const latest = React.useRef(props);
  React.useEffect(() => {
    latest.current = props;
  });

  const halt = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
  };
  const run = (c: AnimationPlaybackControls) => {
    runs.current.push(c);
    return c;
  };

  const pan = () => {
    const r = laneRef.current?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2 + x.get(), null) : 0;
  };

  /** How far the row must go to be wholly inside the slot or the drawer. */
  const fullIn = (kind: SlotSwipeAction) =>
    kind === "archive"
      ? travel.get() + GUTTER - SLIT
      : travel.get() + GUTTER - DRAWER_OPEN;
  const inside = (kind: SlotSwipeAction) =>
    (kind === "archive" ? S : -S) * (fullIn(kind) + 4);

  const settle = () => {
    settled.current = true;
    const next = onSettled.current;
    onSettled.current = null;
    next?.();
  };

  /** Runs the row into the slot or the drawer, from wherever it is. */
  const sendTo = (kind: SlotSwipeAction, velocity: number) => {
    const now = latest.current;
    destiny.current = kind;
    setCommitted(kind);
    audible.current = true;
    halt();
    if (kind === "archive") {
      now.audio.play("paper", { pitch: 1.1, gain: 0.4, pan: pan() });
    } else {
      now.audio.play("swish", { pitch: 0.9, gain: 0.35, pan: pan() });
    }
    if (!now.motionSafe) {
      seal(kind);
      return;
    }
    run(animate(x, inside(kind), { ...springs.snap, velocity }));
  };

  /** Wholly inside: the slot shuts on it, or the clock spins and the drawer shuts. */
  const seal = (kind: SlotSwipeAction) => {
    if (sealed.current) return;
    sealed.current = true;
    const now = latest.current;
    if (kind === "snooze") {
      spin();
      return;
    }
    // The thwup: a low swallow under a soft knock, as the lips close.
    now.audio.play("blup", { pitch: 0.6, gain: 0.65, pan: pan() });
    now.audio.play("thud", { pitch: 1.5, gain: 0.35, pan: pan() });
    if (now.motionSafe) {
      fade.set(0);
      run(animate(gate, 0, springs.recoil));
    } else {
      run(animate(fade, 0, { duration: durations.fast }));
    }
    settle();
  };

  const spin = () => {
    const now = latest.current;
    spun.current = true;
    const m0 = minute.get();
    const h0 = hour.get();
    const mT = Math.ceil(m0 / 360) * 360 + 720;
    const want = ((((now.snoozeHour % 12) * 30) % 360) + 360) % 360;
    const hT = h0 + ((want - (h0 % 360) + 720) % 360 || 360);
    const shut = () => {
      latest.current.audio.play("clack", { pitch: 0.9, gain: 0.5, pan: pan() });
      if (latest.current.motionSafe) {
        run(animate(drawerGate, 0, springs.snap));
      }
      settle();
    };
    if (!now.motionSafe) {
      minute.set(mT);
      hour.set(hT);
      run(animate(fade, 0, { duration: durations.fast }));
      shut();
      return;
    }
    // Inside the drawer now; the clip would show it again as the drawer shuts.
    fade.set(0);
    // Two turns and onto the hour, fast at first and settling: a ratchet
    // that slows as it lands.
    const spinFor = { duration: 0.8, ease: easings.enter };
    run(animate(hour, hT, spinFor));
    run(animate(minute, mT, { ...spinFor, onComplete: shut }));
  };

  /** Back out to rest: a short swipe let go, a row the host kept, or Undo. */
  const comeBack = (velocity = 0) => {
    halt();
    destiny.current = null;
    setCommitted(null);
    sealed.current = false;
    settled.current = false;
    spun.current = false;
    if (!latest.current.motionSafe) {
      x.set(0);
      gate.set(1);
      drawerGate.set(1);
      height.set(LANE);
      run(animate(fade, 1, { duration: durations.fast }));
      return;
    }
    fade.set(1);
    gate.set(1);
    run(animate(drawerGate, 1, springs.snap));
    run(animate(x, 0, { ...springs.snap, velocity }));
    run(animate(height, LANE, springs.glide));
  };

  // Everything the lane draws is read off the row's position, so a key, a
  // throw and a finger draw — and sound — the same. The minute hand winds
  // with a pull toward the drawer until the drawer spins it for itself.
  React.useEffect(() => {
    let armed = 0;
    let lastMark = Math.floor(minute.get() / 30);
    const offX = x.on("change", (v) => {
      const now = latest.current;
      const line = now.threshold * travel.get();
      const toSlot = v * now.slotSign;
      if (!spun.current && toSlot <= 0) {
        const turns = clamp(-toSlot / Math.max(1, line), 0, 3);
        minute.set(r2(turns * 360));
        hour.set(r2(turns * 30));
      }
      const side = Math.abs(toSlot) >= line ? Math.sign(toSlot) : 0;
      if (side !== armed) {
        armed = side;
        if (audible.current && !sealed.current) {
          now.audio.play("detent", {
            pitch: side !== 0 ? 1.15 : 0.9,
            gain: side !== 0 ? 0.45 : 0.3,
            pan: pan(),
          });
        }
      }
      const kind = destiny.current;
      if (kind && Math.abs(v) >= fullIn(kind)) seal(kind);
    });
    const offMinute = minute.on("change", (m) => {
      const mark = Math.floor(m / 30);
      if (mark === lastMark) return;
      lastMark = mark;
      if (!audible.current) return;
      latest.current.audio.play("tick", {
        pitch: 1.6,
        gain: 0.22,
        pan: pan(),
      });
    });
    return () => {
      offX();
      offMinute();
    };
    // The handlers read the latest props through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, minute, hour, travel]);

  // Undo mounts it inside wherever it went, then it comes back out.
  React.useLayoutEffect(() => {
    const kind = latest.current.enter;
    if (!kind) return;
    audible.current = true;
    x.set(r2(inside(kind)));
    if (kind === "snooze") {
      minute.set(360);
      hour.set(30);
    }
    comeBack();
    return halt;
    // Mount only: a row arrives once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A row the host kept after a swipe comes back out of the slot.
  React.useLayoutEffect(() => {
    if (isPresent && destiny.current) comeBack();
    // Only a new commit asks the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tick]);

  // Leaving: finish going in (from wherever a re-run finds it), then the
  // lane closes and the rows below rise into it. Put back while leaving, it
  // comes back out instead.
  React.useEffect(() => {
    if (isPresent) {
      if (destiny.current || height.get() < LANE - 0.5) comeBack();
      return;
    }
    let live = true;
    const kind = destiny.current;
    const close = () => {
      if (!live) return;
      const done = () => {
        if (live) safeToRemove?.();
      };
      if (!latest.current.motionSafe) {
        // Seen to go, then gone: the fade finishes before the lane shuts.
        run(
          animate(fade, 0, {
            duration: durations.fast,
            onComplete: () => {
              height.set(0);
              done();
            },
          }),
        );
        return;
      }
      run(
        animate(height, 0, {
          ...exitFor(durations.base),
          delay: kind === "snooze" ? 0.1 : 0.14,
          onComplete: done,
        }),
      );
    };
    if (!kind) {
      // Taken away by the host, not by a swipe: it fades and the lane closes.
      run(animate(fade, 0, { duration: durations.fast, onComplete: close }));
    } else if (settled.current) {
      close();
    } else {
      onSettled.current = close;
      if (!sealed.current) {
        if (latest.current.motionSafe)
          run(animate(x, inside(kind), springs.snap));
        else seal(kind);
      } else if (kind === "snooze" && !minute.isAnimating()) {
        spin();
      }
    }
    return () => {
      live = false;
      onSettled.current = null;
      halt();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  React.useEffect(
    () => () => {
      detach.current?.();
      detach.current = null;
    },
    [],
  );

  const leaving = !isPresent || committed !== null;

  const endDrag = () => {
    dragging.current = false;
    detach.current?.();
    detach.current = null;
    setGrabbing(false);
  };

  const drag = useDrag({
    axis: "x",
    disabled: props.disabled || leaving,
    onStart: () => {
      halt();
      dragging.current = true;
      audible.current = true;
      from.current = x.get();
      setGrabbing(true);
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cancel();
      };
      document.addEventListener("keydown", onKey);
      detach.current = () => document.removeEventListener("keydown", onKey);
    },
    onMove: ({ offset }) => {
      if (!dragging.current) return;
      const tv = travel.get();
      x.set(r2(rubberClamp(from.current + offset.x, -tv, tv, ROW)));
    },
    onEnd: ({ velocity }) => {
      if (!dragging.current) return;
      endDrag();
      const line = threshold * travel.get();
      // A throw commits to where it would come to rest, not where it let go.
      const landing = project(x.get(), velocity.x, 0.99) * S;
      if (landing >= line) commit("archive", velocity.x);
      else if (-landing >= line) commit("snooze", velocity.x);
      else if (motionSafe) {
        run(animate(x, 0, { ...springs.snap, velocity: velocity.x }));
      } else {
        x.set(0);
      }
    },
    onCancel: () => cancel(),
    onTap: () => {
      if (!leaving) props.onOpen(item.id);
    },
  });

  function cancel() {
    if (!dragging.current) return;
    endDrag();
    if (motionSafe) run(animate(x, 0, springs.snap));
    else x.set(0);
  }

  function commit(kind: SlotSwipeAction, velocity: number) {
    if (destiny.current || !isPresent) return;
    sendTo(kind, velocity);
    props.onCommit(item.id, kind);
  }

  // The drawing, all from `x`.
  const reach = (v: number, tv: number, sign: 1 | -1) =>
    clamp01((v * sign) / Math.max(1, threshold * tv));
  const depth = useTransform([x, travel], ([v, tv]) =>
    clamp01(Math.abs(v as number) / Math.max(1, tv as number)),
  );
  const scaleY = useTransform(depth, (k) =>
    r3(1 - clamp01(squash) * 0.6 * k * (2 - k)),
  );
  const scaleX = useTransform(depth, (k) => r3(1 + clamp01(squash) * 0.08 * k));
  const originX = useTransform(x, (v) => (v >= 0 ? 1 : 0));
  const slotOpen = useTransform([x, travel, gate], ([v, tv, g]) =>
    r3(reach(v as number, tv as number, S) * (g as number)),
  );
  const drawerOpen = useTransform([x, travel, drawerGate], ([v, tv, g]) =>
    r3(reach(v as number, tv as number, S === 1 ? -1 : 1) * (g as number)),
  );
  const slit = useTransform([slotOpen, scaleY], ([o, sy]) =>
    r2(6 + (Math.min(ROW - 10, ROW * (sy as number) + 2) - 6) * (o as number)),
  );
  const frame = useTransform(slit, (h) => r2(h + 8));
  const slotLit = useTransform([x, travel, gate], ([v, tv, g]) => {
    const line = threshold * (tv as number);
    const lit = clamp01(((v as number) * S - line) / 14 + 1) * (g as number);
    return `color-mix(in oklab, var(--accent-bright) ${Math.round(lit * 100)}%, var(--hairline-strong))`;
  });
  const drawerWidth = useTransform(drawerOpen, (o) =>
    r2(lerp(DRAWER_REST, DRAWER_OPEN, o)),
  );
  const drawerLit = useTransform([x, travel, drawerGate], ([v, tv, g]) => {
    const line = threshold * (tv as number);
    const lit = clamp01((-(v as number) * S - line) / 14 + 1) * (g as number);
    return `color-mix(in oklab, var(--warn) ${Math.round(lit * 100)}%, var(--ink-3))`;
  });
  const clockOpacity = useTransform(drawerWidth, (w) =>
    r2(clamp01((w - 30) / 20)),
  );
  const clip = useTransform(drawerWidth, (w) =>
    S === 1
      ? `inset(0px ${SLIT}px 0px ${w}px)`
      : `inset(0px ${w}px 0px ${SLIT}px)`,
  );

  const slotSide = S === 1 ? "right" : "left";
  const drawerSide = S === 1 ? "left" : "right";

  return (
    <motion.li
      ref={laneRef}
      inert={!isPresent}
      aria-hidden={!isPresent || undefined}
      className="relative overflow-clip"
      style={{ height }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{ height: ROW }}
      >
        {/* The slot: a frame round a dark slit that opens to meet the row. */}
        <motion.span
          className="absolute top-1/2 w-2.5 rounded-full border bg-surface-2"
          style={{
            [slotSide]: 1,
            height: frame,
            y: "-50%",
            borderColor: slotLit,
          }}
        />
        <motion.span
          className="absolute top-1/2 w-1 rounded-full"
          style={{ [slotSide]: 4, height: slit, y: "-50%", background: HOLE }}
        />
        {/* The drawer, with a clock inside that winds as it is pulled. */}
        <motion.div
          className={cn(
            "absolute inset-y-1.5 overflow-clip border border-hairline-strong bg-surface-2",
            S === 1 ? "rounded-r-2 border-l-0" : "rounded-l-2 border-r-0",
          )}
          style={{ [drawerSide]: 0, width: drawerWidth }}
        >
          <motion.svg
            viewBox="0 0 28 28"
            className="absolute top-1/2 size-7"
            style={{
              [slotSide]: 8,
              y: "-50%",
              opacity: clockOpacity,
              color: drawerLit,
            }}
          >
            <circle
              cx={14}
              cy={14}
              r={12}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
            />
            <motion.g style={{ rotate: hour, originX: 0.5, originY: 0.5 }}>
              <circle cx={14} cy={14} r={12} fill="none" />
              <line
                x1={14}
                y1={14}
                x2={14}
                y2={8.5}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </motion.g>
            <motion.g style={{ rotate: minute, originX: 0.5, originY: 0.5 }}>
              <circle cx={14} cy={14} r={12} fill="none" />
              <line
                x1={14}
                y1={14}
                x2={14}
                y2={5}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </motion.g>
            <circle cx={14} cy={14} r={1.6} fill="currentColor" />
          </motion.svg>
          <motion.span
            className={cn(
              "absolute inset-y-0 w-0.5",
              S === 1 ? "right-0" : "left-0",
            )}
            style={{ background: drawerLit }}
          />
        </motion.div>
      </div>

      <motion.div
        className="absolute inset-x-0 top-0"
        style={{ height: ROW, clipPath: clip }}
      >
        <motion.div
          {...drag}
          onLostPointerCapture={(event) => {
            // A touch is implicitly captured by what it lands on inside the
            // row; when the drag takes the capture, that loss bubbles here.
            if (event.target === event.currentTarget) {
              drag.onLostPointerCapture(event);
            }
          }}
          className={cn(
            "absolute inset-y-0 touch-pan-y select-none",
            props.disabled
              ? "cursor-not-allowed"
              : grabbing
                ? "cursor-grabbing"
                : "cursor-grab",
          )}
          style={{
            left: GUTTER,
            right: GUTTER,
            x,
            scaleX,
            scaleY,
            originX,
            originY: 0.5,
            opacity: fade,
          }}
        >
          <button
            ref={(node) => props.setButton(item.id, node)}
            type="button"
            tabIndex={props.focusable && !leaving ? 0 : -1}
            aria-label={`${item.from}: ${item.subject}`}
            aria-describedby={props.hintId}
            aria-keyshortcuts="Delete S"
            disabled={props.disabled}
            onFocus={() => props.onFocus(item.id)}
            onKeyDown={(event) => {
              if (leaving) return;
              const key = event.key;
              if (key === "Delete" || key === "Backspace") {
                event.preventDefault();
                if (!event.repeat) commit("archive", 0);
                return;
              }
              if (
                (key === "s" || key === "S") &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey
              ) {
                event.preventDefault();
                if (!event.repeat) commit("snooze", 0);
                return;
              }
              if (
                key === "ArrowUp" ||
                key === "ArrowDown" ||
                key === "Home" ||
                key === "End"
              ) {
                event.preventDefault();
                props.onKeyMove(item.id, key);
              }
            }}
            onClick={(event) => {
              // Pointer presses arrive through the drag's tap; a click with
              // no pointer behind it is Enter, Space or assistive technology.
              if (event.detail === 0 && !leaving) props.onOpen(item.id);
            }}
            className={cn(
              "flex size-full items-center gap-3 rounded-2 border border-hairline bg-card px-3 text-left outline-none",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-xs font-medium text-cobalt-bright"
            >
              {item.from.charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-xs leading-4 font-medium text-ink-2"
                  title={item.from}
                >
                  {item.from}
                </span>
                {item.time ? (
                  <span className="shrink-0 font-mono text-[10px] leading-4 text-ink-3">
                    {item.time}
                  </span>
                ) : null}
              </span>
              <span
                className="truncate text-sm leading-5 text-foreground"
                title={item.subject}
              >
                {item.subject}
              </span>
            </span>
          </button>
        </motion.div>
      </motion.div>
    </motion.li>
  );
}

type Last = { id: string; action: SlotSwipeAction; index: number };
type Said = { text: string; id: string; gone: boolean };

/**
 * An inbox whose rows sit between a mail slot and a drawer. Swipe a row
 * toward the slot and the slit opens to meet it; the row feeds in edgewise —
 * clipped at the slit and squashed thinner the deeper it goes — and past the
 * threshold the slot swallows it whole and snaps shut on the recoil spring
 * with a thwup. Swipe it toward the drawer and the drawer slides out with a
 * clock whose hands wind as you pull, ticking; past the threshold the row
 * drops in, the clock spins round to the snooze hour and the drawer shuts. A
 * short swipe springs back; a throw commits to where it would come to rest.
 *
 * Every drawing in a lane is read off the row's one position, so Delete
 * (the slot) and S (the drawer) draw and sound exactly like a swipe. Rows
 * are buttons in a list with one tab stop; Up and Down move between them and
 * focus goes to the next row as one leaves. Undo brings the last row back
 * out of wherever it went. Under reduced motion the row still follows the
 * finger, but it fades out in place when it commits, the clock's hands jump,
 * and every sound and announcement is unchanged.
 */
export function SlotSwipe({
  items,
  value,
  defaultValue,
  onValueChange,
  onAction,
  onOpen,
  label = "Inbox",
  snoozeHour = 9,
  threshold = 0.35,
  side = "right",
  squash = 0.5,
  undo = true,
  empty = "Inbox zero",
  sound = false,
  disabled = false,
  className,
}: SlotSwipeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const hour = Math.round(
    clamp(Number.isFinite(snoozeHour) ? snoozeHour : 9, 0, 23),
  );
  const line = clamp(Number.isFinite(threshold) ? threshold : 0.35, 0.1, 0.9);

  const byId = React.useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const [own, setOwn] = React.useState<string[]>(
    () => defaultValue ?? items.map((item) => item.id),
  );
  const raw = value ?? own;
  const order = React.useMemo(
    () => raw.filter((id, i) => byId.has(id) && raw.indexOf(id) === i),
    [raw, byId],
  );

  const [last, setLast] = React.useState<Last | null>(null);
  const [returning, setReturning] = React.useState<{
    id: string;
    action: SlotSwipeAction;
  } | null>(null);
  const [tick, setTick] = React.useState(0);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Said | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const undoRef = React.useRef<HTMLButtonElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const refocus = React.useRef<string | null>(null);
  const travel = useMotionValue(320);

  // Every lane is as wide as the list; the row's travel is that less its ends.
  const [listNode, setListNode] = React.useState<HTMLUListElement | null>(null);
  React.useEffect(() => {
    if (!listNode) return;
    const measure = () =>
      travel.set(Math.max(80, listNode.clientWidth - 2 * GUTTER));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(listNode);
    return () => observer.disconnect();
  }, [listNode, travel]);

  // Focus that has to land somewhere new lands once it is there.
  React.useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    const node =
      target === "undo"
        ? undoRef.current
        : target === "list"
          ? rootRef.current
          : buttons.current.get(target);
    if (!node) return;
    refocus.current = null;
    node.focus({ preventScroll: true });
  });

  const tabStop =
    focusId && order.includes(focusId) ? focusId : (order[0] ?? null);
  const hasFocus = () =>
    !!rootRef.current &&
    rootRef.current.contains(
      typeof document === "undefined" ? null : document.activeElement,
    );

  const onCommit = (id: string, action: SlotSwipeAction) => {
    const index = order.indexOf(id);
    if (index < 0) return;
    const next = order.filter((other) => other !== id);
    const item = byId.get(id);
    const name = item ? `${item.from}: ${item.subject}` : "Message";
    const neighbour = next[index] ?? next[index - 1] ?? null;
    if (hasFocus()) {
      if (neighbour) {
        setFocusId(neighbour);
        buttons.current.get(neighbour)?.focus({ preventScroll: true });
      } else {
        refocus.current = undo ? "undo" : "list";
      }
    }
    setTick((t) => t + 1);
    setLast({ id, action, index });
    setReturning(null);
    setSaid({
      text:
        action === "archive"
          ? `Archived ${stop(name)}`
          : `Snoozed ${name} until ${hourText(hour)}.`,
      id,
      gone: true,
    });
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    onAction?.(id, action);
  };

  const undoLast = () => {
    if (!last || disabled || order.includes(last.id)) return;
    const next = order.filter((id) => id !== last.id);
    next.splice(Math.min(last.index, next.length), 0, last.id);
    const item = byId.get(last.id);
    audio.play("swish", { pitch: 1.2, gain: 0.35 });
    setReturning({ id: last.id, action: last.action });
    setLast(null);
    setTick((t) => t + 1);
    setFocusId(last.id);
    if (hasFocus()) refocus.current = last.id;
    setSaid({
      text: `${item ? `${item.from}: ${item.subject}` : "Message"} is back.`,
      id: last.id,
      gone: false,
    });
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const onKeyMove = (id: string, key: string) => {
    const i = order.indexOf(id);
    if (i < 0) return;
    const to =
      key === "ArrowUp"
        ? i - 1
        : key === "ArrowDown"
          ? i + 1
          : key === "Home"
            ? 0
            : order.length - 1;
    const target = order[clamp(to, 0, order.length - 1)];
    if (!target) return;
    setFocusId(target);
    buttons.current.get(target)?.focus();
  };

  // Undo only while the row it would bring back is still gone.
  const pending = last && !order.includes(last.id) ? last : null;
  const saidNow =
    said && order.includes(said.id) !== said.gone ? said.text : "";
  const S: 1 | -1 = side === "left" ? -1 : 1;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <div className="flex h-8 items-center gap-2 px-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[10px] leading-4 text-ink-2 tabular-nums">
          {order.length}
        </span>
        <span className="min-w-0 flex-1" />
        {undo && pending ? (
          <>
            <span className="truncate text-xs text-ink-3">
              {pending.action === "archive"
                ? "Archived"
                : `Snoozed to ${hourText(hour)}`}
            </span>
            <button
              ref={undoRef}
              type="button"
              onClick={undoLast}
              disabled={disabled}
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-2 px-2.5 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50"
            >
              Undo
            </button>
          </>
        ) : null}
      </div>
      <ul
        ref={setListNode}
        role="list"
        aria-label={label}
        className="flex flex-col"
      >
        <AnimatePresence initial={false}>
          {order.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <Row
                key={id}
                item={item}
                travel={travel}
                slotSign={S}
                threshold={line}
                squash={squash}
                snoozeHour={hour}
                enter={returning?.id === id ? returning.action : null}
                tick={tick}
                focusable={tabStop === id}
                hintId={hintId}
                motionSafe={motionSafe}
                disabled={disabled}
                audio={audio}
                setButton={(key, node) => {
                  if (node) buttons.current.set(key, node);
                  else buttons.current.delete(key);
                }}
                onFocus={setFocusId}
                onCommit={onCommit}
                onOpen={(key) => {
                  if (!disabled) onOpen?.(key);
                }}
                onKeyMove={onKeyMove}
              />
            );
          })}
        </AnimatePresence>
      </ul>
      <AnimatePresence initial={false}>
        {order.length === 0 ? (
          <motion.div
            key="empty"
            className="flex h-12 items-center justify-center text-sm text-ink-3"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: {
                duration: durations.base,
                ease: easings.enter,
                delay: motionSafe ? 0.3 : 0,
              },
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            {empty}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <p id={hintId} className="sr-only">
        Swipe toward the slot or press Delete to archive. Swipe toward the
        drawer or press S to snooze until {hourText(hour)}.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {saidNow}
      </p>
    </div>
  );
}
