"use client";

import * as React from "react";

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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BinLidState = "idle" | "armed" | "pending" | "success" | "error";

export type BinLidSize = "sm" | "md" | "lg";

export type BinLidProps = {
  /** Fires once the undo window runs out. Return a promise and the button shows the deletion pending until it settles. */
  onDelete?: () => void | Promise<unknown>;
  /** The visitor fished it back out, with a press or Escape, before the window ran out. */
  onUndo?: () => void;
  /** Controlled state. Every move the button wants to make goes through `onStateChange` and waits for this. */
  state?: BinLidState;
  /** Each state the button moves to, from the press or the timer that caused it. */
  onStateChange?: (state: BinLidState) => void;
  /** How long the undo window stays open, in ms: the time the ring takes to drain. @default 5000 */
  window?: number;
  /** How high the paper is lobbed into the bin, and how much it tumbles, 0 to 1. @default 0.6 */
  arc?: number;
  /** How much dust the slammed lid pushes out, 0 to 1. 0 slams clean. @default 0.6 */
  puff?: number;
  /** The text at rest. @default "Delete" */
  label?: string;
  /** The text while the undo window is open. @default "Undo" */
  undoLabel?: string;
  /** The text while `onDelete` is settling. @default "Deleting" */
  pendingLabel?: string;
  /** The text once it is gone. @default "Deleted" */
  successLabel?: string;
  /** The text after `onDelete` failed; a press throws it away again. @default "Retry" */
  errorLabel?: string;
  /** What is being thrown away. Joins the accessible name and the spoken sentences. */
  itemName?: string;
  /** How long "Deleted" holds before the button is ready again, in ms. @default 1800 */
  successHold?: number;
  /** How long the error holds before the button rests again, in ms. @default 2600 */
  errorHold?: number;
  /** The bin alone, in a square button that keeps its accessible name. @default false */
  iconOnly?: boolean;
  /** @default "md" */
  size?: BinLidSize;
  /** The destructive colour: text, outline, bin and ring. Any CSS colour. @default "var(--danger)" */
  accent?: string;
  /** Play the paper, the slam and the pop. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Face = "label" | "undo" | "pending" | "success" | "error" | "none";

type Geometry = { h: number; pad: number; slot: number; gap: number };

const GEOMETRY: Record<BinLidSize, Geometry> = {
  sm: { h: 32, pad: 10, slot: 20, gap: 6 },
  md: { h: 40, pad: 12, slot: 24, gap: 8 },
  lg: { h: 48, pad: 16, slot: 28, gap: 10 },
};

const TEXT: Record<BinLidSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/** The effect frame round the button: the lob's apex and the dust live in it. */
const FRAME = 12;
/** Lid angles, in degrees about its hinge (its left end). */
const LID_HOVER = -22;
const LID_OPEN = -72;
/** Sounds answer a press only within its own choreography. */
const BEAT_MS = 900;
const MAX_MOTES = 10;
/** The bin, in its own 24-unit drawing: rim height and the body's walls. */
const RIM = 9.5;
const BODY_LEFT = 5.6;
const BODY_RIGHT = 18.4;
const BODY_BOTTOM = 21.5;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A stable pseudo-random 0–1 from two integers (unsigned, so never negative). */
const hash = (a: number, b: number) =>
  (((Math.imul(a + 3, 73856093) ^ Math.imul(b + 11, 19349663)) >>> 0) % 997) /
  997;

const holdsPaper = (s: BinLidState) =>
  s === "armed" || s === "pending" || s === "success";
const isPill = holdsPaper;
const restFace = (s: BinLidState): Face =>
  s === "idle" ? "label" : s === "armed" ? "undo" : s;

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

/** A sentence that ends once, whatever the words already carry. */
const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/**
 * How high a parabola from (·, y0) to (·, y0 + d) may arch, `lift` being its
 * bulge at the midpoint, before its top passes `margin`: the larger root of
 * (4L − d)² = 16·L·(y0 − margin), from the vertex of y0 + d·t − 4L·t(1 − t).
 */
function maxLift(y0: number, d: number, margin: number): number {
  const a = y0 - margin;
  if (a <= 0) return 0;
  const b = 8 * d + 16 * a;
  const disc = b * b - 64 * d * d;
  if (disc < 0) return 0;
  return (b + Math.sqrt(disc)) / 32;
}

type Flight = { x0: number; y0: number; x1: number; y1: number };

/** One fleck of dust, pushed out of the gap at one end of the lid. */
function Mote({
  index,
  count,
  origin,
  reach,
  scale,
  t,
}: {
  index: number;
  count: number;
  origin: { left: [number, number]; right: [number, number] };
  reach: number;
  scale: number;
  t: MotionValue<number>;
}) {
  const place = useTransform(t, (v) => {
    if (index >= count || v <= 0 || v >= 1) return { x: 0, y: 0, r: 0, o: 0 };
    const side = index % 2 === 0 ? -1 : 1;
    const [ox, oy] = side < 0 ? origin.left : origin.right;
    // Out of the gap and a little up: the air escapes sideways, the dust
    // then drifts on it.
    const lift = 0.12 + 0.95 * hash(index, 1);
    const angle = side < 0 ? Math.PI + lift : -lift;
    const far = reach * (0.55 + 0.45 * hash(index, 2));
    const ease = 1 - (1 - v) * (1 - v);
    return {
      x: r2(ox + Math.cos(angle) * far * ease),
      y: r2(oy + Math.sin(angle) * far * ease - 2.5 * scale * v),
      r: r2(scale * (0.6 + (0.9 + 0.8 * hash(index, 3)) * v)),
      o: r2(0.7 * (1 - v)),
    };
  });
  const cx = useTransform(place, (p) => p.x);
  const cy = useTransform(place, (p) => p.y);
  const r = useTransform(place, (p) => p.r);
  const opacity = useTransform(place, (p) => p.o);
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      style={{
        opacity,
        fill: "color-mix(in oklab, var(--ink-3) 75%, transparent)",
      }}
    />
  );
}

type Api = {
  transition: (from: BinLidState, to: BinLidState) => void;
  settle: () => void;
  slam: (then: Face) => void;
  impact: (then: Face) => void;
  unfold: (then: Face) => void;
  expire: () => void;
  request: (next: BinLidState) => void;
};

/**
 * A delete button that throws the thing away and leaves a window to fish it
 * back out. The bin's lid lifts on its hinge when the pointer or keyboard
 * focus arrives. Pressed, the label folds into a sheet of paper, the lid
 * swings wide, and the paper is lobbed into the bin on a true ballistic arc —
 * x linear in time, y a parabola, so the tween is the physics — tumbling as it
 * goes and vanishing behind the bin's front wall. The lid falls shut under
 * gravity, the bin squashes on impact, and a puff of dust escapes from both
 * ends of the lid.
 *
 * The button then becomes an undo pill: its corners glide round, and a ring
 * round the bin drains over `window`. Undo — a press, or Escape — flies the
 * paper back out the same arc and unfolds it into the label. When the ring
 * empties `onDelete` fires; a promise shows a spinning ring until it settles,
 * and a failure throws the paper back out with a shake. The button keeps one
 * width through every state, and a destructive action never celebrates: the
 * only overshoots are the lid's and the squash's, which are physics.
 *
 * Under reduced motion nothing flies, swings or squashes: the labels
 * cross-fade and the ring still drains, because the window is information.
 */
export function BinLid({
  onDelete,
  onUndo,
  state,
  onStateChange,
  window: undoWindow = 5000,
  arc = 0.6,
  puff = 0.6,
  label = "Delete",
  undoLabel = "Undo",
  pendingLabel = "Deleting",
  successLabel = "Deleted",
  errorLabel = "Retry",
  itemName,
  successHold = 1800,
  errorHold = 2600,
  iconOnly = false,
  size = "md",
  accent = "var(--danger)",
  sound = false,
  disabled = false,
  className,
}: BinLidProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const clipId = `bin-lid-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = `${clipId}-hint`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const k = g.slot / 24;
  const lob = clamp01(arc);
  const dust = clamp01(puff);
  const windowMs = Math.max(500, undoWindow);
  const seconds = Math.round(windowMs / 1000);

  const [own, setOwn] = React.useState<BinLidState>("idle");
  const shown = state ?? own;
  const [face, setFace] = React.useState<Face>(() => restFace(shown));

  // What is spoken is frozen at the change, from the state it changed to.
  const [seen, setSeen] = React.useState(shown);
  const [said, setSaid] = React.useState("");
  if (seen !== shown) {
    setSeen(shown);
    const what = itemName ?? "Item";
    setSaid(
      shown === "armed"
        ? `${what} moved to the bin. ${undoLabel} within ${seconds} ${seconds === 1 ? "second" : "seconds"}.`
        : shown === "idle"
          ? seen === "armed" || seen === "pending"
            ? "Restored."
            : ""
          : shown === "pending"
            ? sentence(pendingLabel)
            : shown === "success"
              ? sentence(successLabel)
              : `Not deleted. Press ${errorLabel} to try again.`,
    );
  }

  const lid = useMotionValue(0);
  const squashX = useMotionValue(1);
  const squashY = useMotionValue(1);
  const flight = useMotionValue(0);
  const paperOn = useMotionValue(0);
  const paperPop = useMotionValue(1);
  const fx0 = useMotionValue(0);
  const fy0 = useMotionValue(0);
  const fx1 = useMotionValue(0);
  const fy1 = useMotionValue(0);
  const motes = useMotionValue(0);
  const drain = useMotionValue(1);
  const radius = useMotionValue(isPill(shown) ? g.h / 2 : 10);
  const shake = useMotionValue(0);
  const holdClock = useMotionValue(0);

  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  const labelRef = React.useRef<HTMLSpanElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);
  const prev = React.useRef(shown);
  const epoch = React.useRef(0);
  const beat = React.useRef(-Infinity);
  const hovered = React.useRef(false);
  const focused = React.useRef(false);
  const flying = React.useRef(false);
  /** After a press, the lid stays shut until the pointer or focus leaves. */
  const quiet = React.useRef(false);

  const slotX = FRAME + (iconOnly ? (g.h - g.slot) / 2 : g.pad);
  const slotY = FRAME + (g.h - g.slot) / 2;
  const paperW = 12 * k;
  const paperH = 15 * k;
  const fold = 3.5 * k;
  const flightSeconds = 0.36 + 0.12 * lob;

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const audible = () => performance.now() - beat.current < BEAT_MS;
  const pan = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + slotX + g.slot / 2, null) : 0;
  };

  const request = (next: BinLidState) => {
    if (state === undefined) setOwn(next);
    onStateChange?.(next);
  };

  const canLift = () =>
    !quiet.current &&
    !flying.current &&
    !disabled &&
    (shown === "idle" || shown === "armed" || shown === "error");

  const restLid = () => {
    const to =
      (hovered.current || focused.current) && canLift() ? LID_HOVER : 0;
    if (!motionSafe) {
      halt("lid");
      lid.set(0);
      return;
    }
    run("lid", animate(lid, to, springs.snap));
  };

  const morph = (pill: boolean) => {
    const to = pill ? g.h / 2 : 10;
    if (!motionSafe) {
      halt("radius");
      radius.set(to);
      return;
    }
    run("radius", animate(radius, to, springs.glide));
  };

  /** Where the paper leaves the label and where it lands in the bin. */
  const aim = (): Flight => {
    const root = rootRef.current?.getBoundingClientRect();
    const text = labelRef.current?.getBoundingClientRect();
    const x1 = slotX + 11 * k;
    const y1 = slotY + 16.5 * k;
    if (!root || !text || iconOnly) {
      return { x0: FRAME + g.h - 2, y0: FRAME + 4, x1, y1 };
    }
    return {
      x0: text.left - root.left + text.width / 2,
      y0: text.top - root.top + text.height / 2,
      x1,
      y1,
    };
  };

  const aimAt = (f: Flight) => {
    fx0.set(r2(f.x0));
    fy0.set(r2(f.y0));
    fx1.set(r2(f.x1));
    fy1.set(r2(f.y1));
  };

  const fling = (then: Face) => {
    halt("flight");
    halt("slam");
    flying.current = true;
    aimAt(aim());
    setFace("none");
    flight.jump(0);
    paperOn.set(1);
    paperPop.jump(0.4);
    run("pop", animate(paperPop, 1, springs.flick));
    run("lid", animate(lid, LID_OPEN, springs.snap));
    if (audible()) {
      audio.play("paper", {
        pitch: r2(1.05 - 0.1 * lob),
        gain: 0.5,
        pan: pan(),
      });
    }
    run(
      "flight",
      animate(flight, 1, {
        duration: flightSeconds,
        delay: 0.08,
        ease: "linear",
        onComplete: () => api.current?.slam(then),
      }),
    );
  };

  const slam = (then: Face) => {
    // A lid falls; it does not spring shut. The overshoot comes after, in the
    // bin it lands on.
    run(
      "lid",
      animate(lid, 0, {
        duration: 0.11,
        ease: easings.exit,
        onComplete: () => api.current?.impact(then),
      }),
    );
  };

  const impact = (then: Face) => {
    flying.current = false;
    paperOn.set(0);
    if (audible()) {
      audio.play("thud", {
        pitch: size === "sm" ? 1.2 : size === "lg" ? 0.85 : 1,
        gain: 0.6,
        pan: pan(),
      });
    }
    squashX.jump(1.06);
    squashY.jump(0.88);
    run("squashX", animate(squashX, 1, springs.snap));
    run("squashY", animate(squashY, 1, springs.snap));
    if (dust > 0) {
      motes.jump(0.001);
      run("motes", animate(motes, 1, { duration: 0.5, ease: "linear" }));
    }
    drain.set(1);
    morph(true);
    setFace(then);
  };

  const retrieve = (then: Face) => {
    halt("slam");
    halt("motes");
    motes.set(0);
    flying.current = true;
    aimAt(aim());
    setFace("none");
    morph(false);
    run("lid", animate(lid, LID_OPEN, springs.snap));
    if (audible()) {
      audio.play("pop", { pitch: r2(0.9 + 0.2 * lob), gain: 0.55, pan: pan() });
    }
    const from = flight.get();
    paperOn.set(1);
    paperPop.set(1);
    // Thrown back up the way it came: the same parabola, run backwards.
    run(
      "flight",
      animate(flight, 0, {
        duration: Math.max(0.12, flightSeconds * from),
        delay: from >= 1 ? 0.06 : 0,
        ease: "linear",
        onComplete: () => api.current?.unfold(then),
      }),
    );
  };

  const unfold = (then: Face) => {
    flying.current = false;
    run(
      "paper",
      animate(paperOn, 0, { duration: durations.fast, ease: easings.exit }),
    );
    setFace(then);
    restLid();
    if (then === "error") {
      run(
        "shake",
        animate(shake, [0, -4, 4, -3, 2, 0], {
          duration: 0.36,
          ease: easings.move,
        }),
      );
    }
  };

  /** Everything at rest for the shown state, at once. */
  const settle = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    flying.current = false;
    lid.set(0);
    squashX.set(1);
    squashY.set(1);
    paperOn.set(0);
    paperPop.set(1);
    motes.set(0);
    shake.set(0);
    flight.set(holdsPaper(shown) ? 1 : 0);
    radius.set(isPill(shown) ? g.h / 2 : 10);
    setFace(restFace(shown));
  };

  const transition = (from: BinLidState, to: BinLidState) => {
    const was = holdsPaper(from);
    const now = holdsPaper(to);
    if (to === "armed") drain.set(1);
    if (!motionSafe) {
      settle();
      return;
    }
    if (!was && now) {
      fling(restFace(to));
      return;
    }
    if (was && !now) {
      // A deleted thing is gone: the button comes back fresh, not with it.
      if (from === "success") {
        flight.set(0);
        morph(false);
        setFace(restFace(to));
        restLid();
        return;
      }
      retrieve(restFace(to));
      return;
    }
    if (!flying.current) setFace(restFace(to));
    morph(isPill(to));
    if (to === "error") {
      run(
        "shake",
        animate(shake, [0, -4, 4, -3, 2, 0], {
          duration: 0.36,
          ease: easings.move,
        }),
      );
    }
  };

  const expire = () => {
    if (shown !== "armed") return;
    epoch.current += 1;
    const token = epoch.current;
    let result: unknown;
    try {
      result = onDelete?.();
    } catch {
      request("error");
      return;
    }
    if (!isThenable(result)) {
      request("success");
      return;
    }
    request("pending");
    result.then(
      () => {
        if (epoch.current === token) api.current?.request("success");
      },
      () => {
        if (epoch.current === token) api.current?.request("error");
      },
    );
  };

  React.useEffect(() => {
    api.current = {
      transition,
      settle,
      slam,
      impact,
      unfold,
      expire,
      request,
    };
  });

  // The visuals follow the shown state, so a host's answer plays the same
  // choreography a press does.
  React.useEffect(() => {
    const from = prev.current;
    if (from === shown) return;
    prev.current = shown;
    api.current?.transition(from, shown);
  }, [shown]);

  // Mounting (or re-mounting under StrictMode) finishes whatever an unmount
  // interrupted rather than freezing it mid-air.
  React.useEffect(() => {
    const running = anims.current;
    api.current?.settle();
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      epoch.current += 1;
    };
  }, []);

  // The undo window: drains while the pill shows, pauses while the page is
  // hidden, and resumes from where it was after any interruption.
  const counting = shown === "armed" && face === "undo";
  React.useEffect(() => {
    if (!counting) return;
    const left = drain.get();
    const controls = animate(drain, 0, {
      duration: (Math.max(0.001, left) * windowMs) / 1000,
      ease: "linear",
      onComplete: () => api.current?.expire(),
    });
    const onVisibility = () => {
      if (document.hidden) controls.pause();
      else controls.play();
    };
    if (document.hidden) controls.pause();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controls.stop();
    };
  }, [counting, windowMs, drain]);

  // Success and error hold, then the button rests; hidden pages hold still.
  const holding = shown === "success" || shown === "error";
  const holdMs = shown === "success" ? successHold : errorHold;
  React.useEffect(() => {
    if (!holding) return;
    holdClock.jump(0);
    const controls = animate(holdClock, 1, {
      duration: Math.max(0, holdMs) / 1000,
      ease: "linear",
      onComplete: () => api.current?.request("idle"),
    });
    const onVisibility = () => {
      if (document.hidden) controls.pause();
      else controls.play();
    };
    if (document.hidden) controls.pause();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controls.stop();
    };
  }, [holding, holdMs, holdClock]);

  const press = () => {
    if (disabled) return;
    beat.current = performance.now();
    quiet.current = true;
    if (shown === "idle" || shown === "error") {
      request("armed");
    } else if (shown === "armed") {
      onUndo?.();
      request("idle");
    }
  };

  const lift = (on: boolean) => {
    if (!motionSafe || flying.current) return;
    run("lid", animate(lid, on && canLift() ? LID_HOVER : 0, springs.snap));
  };

  // Per-frame geometry, all from motion values, all rounded.
  const path = useTransform(
    [flight, fx0, fy0, fx1, fy1] as MotionValue<number>[],
    ([t = 0, x0 = 0, y0 = 0, x1 = 0, y1 = 0]: number[]) => {
      const margin = 0.5 * Math.hypot(paperW, paperH) + 1;
      const d = y1 - y0;
      const want = (10 + 26 * lob) * k;
      const bulge = Math.min(want, maxLift(y0, d, margin));
      return {
        x: r2(lerp(x0, x1, t)),
        y: r2(y0 + d * t - 4 * bulge * t * (1 - t)),
        rot: r2(-360 * lob * t),
      };
    },
  );
  const paperX = useTransform(path, (p) => p.x);
  const paperY = useTransform(path, (p) => p.y);
  const paperRotate = useTransform(path, (p) => p.rot);
  const paperScale = useTransform(
    [flight, paperPop] as MotionValue<number>[],
    ([t = 0, p = 1]: number[]) => r2(p * lerp(1, 0.5, t * t)),
  );
  const ringOffset = useTransform(drain, (v) => r2(1 - clamp01(v)));

  const busy = shown === "pending" || shown === "success";
  const muted = shown === "success";
  const names: Record<Exclude<Face, "none">, string> = {
    label,
    undo: undoLabel,
    pending: pendingLabel,
    success: successLabel,
    error: errorLabel,
  };
  const name =
    shown === "idle"
      ? itemName
        ? `${label} ${itemName}`
        : label
      : names[restFace(shown) as Exclude<Face, "none">];
  const hint =
    shown === "idle"
      ? `Moves it to the bin, with ${seconds} ${seconds === 1 ? "second" : "seconds"} to undo.`
      : shown === "armed"
        ? // In a list of rows, the description says which one comes back.
          sentence(`Press, or Escape, to restore ${itemName ?? "it"}`)
        : shown === "error"
          ? "Press to try again."
          : "";

  const moteOrigin = {
    left: [r2(slotX + 4.5 * k), r2(slotY + 7.5 * k)] as [number, number],
    right: [r2(slotX + 19.5 * k), r2(slotY + 7.5 * k)] as [number, number],
  };
  const moteCount = dust > 0 ? Math.round(2 + 8 * dust) : 0;
  const ringShown = face === "undo" || face === "pending";
  const hiddenBelowRim = `M -9999 -9999 H 9999 V 9999 H -9999 Z M ${r2(slotX + BODY_LEFT * k)} ${r2(slotY + RIM * k)} H ${r2(slotX + BODY_RIGHT * k)} V ${r2(slotY + BODY_BOTTOM * k)} H ${r2(slotX + BODY_LEFT * k)} Z`;

  return (
    <span
      ref={rootRef}
      className={cn(
        "relative inline-flex shrink-0 align-middle select-none",
        className,
      )}
      style={
        {
          padding: FRAME,
          "--bin-lid-accent": accent,
        } as React.CSSProperties
      }
    >
      <motion.button
        type="button"
        disabled={disabled}
        aria-label={name}
        aria-describedby={hint ? hintId : undefined}
        aria-disabled={busy || undefined}
        aria-busy={shown === "pending" || undefined}
        onClick={press}
        onKeyDown={(event) => {
          if (event.key === "Escape" && shown === "armed") {
            // Handled here, where focus is; the page must not also see it.
            event.preventDefault();
            press();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = true;
          lift(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = false;
          quiet.current = focused.current && quiet.current;
          lift(focused.current);
        }}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          focused.current = true;
          lift(true);
        }}
        onBlur={() => {
          focused.current = false;
          quiet.current = false;
          lift(hovered.current);
        }}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center border font-medium whitespace-nowrap transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          TEXT[size],
          muted
            ? "border-hairline-strong bg-transparent text-ink-3"
            : cn(
                "text-(--bin-lid-accent)",
                shown === "error"
                  ? "border-(--bin-lid-accent) bg-[color-mix(in_oklab,var(--bin-lid-accent)_10%,transparent)]"
                  : "border-[color-mix(in_oklab,var(--bin-lid-accent)_38%,transparent)] bg-[color-mix(in_oklab,var(--bin-lid-accent)_7%,transparent)]",
                !busy &&
                  !disabled &&
                  "hover:bg-[color-mix(in_oklab,var(--bin-lid-accent)_13%,transparent)]",
              ),
          disabled
            ? "cursor-not-allowed opacity-50"
            : busy
              ? "cursor-default"
              : "cursor-pointer",
        )}
        style={{
          height: g.h,
          width: iconOnly ? g.h : undefined,
          paddingInline: iconOnly ? 0 : g.pad,
          gap: g.gap,
          borderRadius: radius,
          x: shake,
        }}
      >
        <span
          aria-hidden
          className="shrink-0"
          style={{ width: g.slot, height: g.slot }}
        />
        {iconOnly ? null : (
          <span ref={labelRef} aria-hidden className="grid">
            {(Object.keys(names) as Exclude<Face, "none">[]).map((key) => {
              const on = face === key;
              const folds = key === "label" && motionSafe;
              return (
                <motion.span
                  key={key}
                  className="col-start-1 row-start-1 justify-self-center"
                  initial={false}
                  animate={{
                    opacity: on ? 1 : 0,
                    scale: on || !folds ? 1 : 0.7,
                  }}
                  transition={
                    motionSafe
                      ? {
                          opacity: {
                            duration: on ? durations.base : durations.fast,
                            ease: on ? easings.enter : easings.exit,
                          },
                          scale: on ? springs.snap : { duration: 0.12 },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {names[key]}
                </motion.span>
              );
            })}
          </span>
        )}
      </motion.button>

      <svg
        aria-hidden
        width="100%"
        height="100%"
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden transition-colors",
          muted ? "text-ink-3" : "text-(--bin-lid-accent)",
          disabled && "opacity-50",
        )}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={hiddenBelowRim} clipRule="evenodd" />
          </clipPath>
        </defs>

        <g
          transform={`translate(${r2(slotX)} ${r2(slotY)}) scale(${r2(k)})`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.g
            style={{
              scaleX: squashX,
              scaleY: squashY,
              originX: 0.5,
              originY: 1,
            }}
          >
            <path d="M 6 9.5 H 18 L 16.8 19.6 Q 16.6 21 15.2 21 H 8.8 Q 7.4 21 7.2 19.6 Z" />
            <path d="M 10.2 12.4 V 18 M 13.8 12.4 V 18" strokeWidth={1.3} />
            <motion.g style={{ rotate: lid, originX: 0, originY: 1 }}>
              <path d="M 4.5 7.5 H 19.5" />
              <path d="M 9.6 7.5 V 5.6 Q 9.6 4.6 10.6 4.6 H 13.4 Q 14.4 4.6 14.4 5.6 V 7.5" />
            </motion.g>
          </motion.g>

          <motion.g
            initial={false}
            animate={{ opacity: ringShown ? 1 : 0 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <circle
              cx={12}
              cy={12.75}
              r={11}
              strokeWidth={1.4}
              className="opacity-20"
            />
            {face === "pending" ? (
              <circle
                cx={12}
                cy={12.75}
                r={11}
                strokeWidth={1.4}
                pathLength={1}
                strokeDasharray={motionSafe ? "0.22 0.78" : "0.04 0.04"}
                className={
                  motionSafe
                    ? "origin-center animate-spin [transform-box:fill-box]"
                    : undefined
                }
              />
            ) : (
              // The rotation is a plain attribute on a plain group: motion
              // would turn it into a CSS transform, which cannot read it.
              <g transform="rotate(-90 12 12.75)">
                <motion.circle
                  cx={12}
                  cy={12.75}
                  r={11}
                  strokeWidth={1.4}
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={ringOffset}
                />
              </g>
            )}
          </motion.g>
        </g>

        {motionSafe ? (
          <>
            <g clipPath={`url(#${clipId})`}>
              <motion.g
                style={{
                  x: paperX,
                  y: paperY,
                  rotate: paperRotate,
                  scale: paperScale,
                  opacity: paperOn,
                  originX: 0.5,
                  originY: 0.5,
                }}
              >
                <path
                  d={`M ${r2(-paperW / 2)} ${r2(-paperH / 2)} H ${r2(paperW / 2 - fold)} L ${r2(paperW / 2)} ${r2(-paperH / 2 + fold)} V ${r2(paperH / 2)} H ${r2(-paperW / 2)} Z`}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  style={{ fill: "var(--card)", stroke: "var(--ink-2)" }}
                />
                <path
                  d={`M ${r2(paperW / 2 - fold)} ${r2(-paperH / 2)} V ${r2(-paperH / 2 + fold)} H ${r2(paperW / 2)}`}
                  fill="none"
                  strokeWidth={1}
                  strokeLinejoin="round"
                  style={{ stroke: "var(--ink-2)" }}
                />
                <path
                  d={[0.42, 0.62, 0.82]
                    .map(
                      (f, i) =>
                        `M ${r2(-paperW / 2 + 2 * k)} ${r2(-paperH / 2 + f * paperH)} H ${r2(paperW / 2 - (i === 2 ? 4 : 2) * k)}`,
                    )
                    .join(" ")}
                  fill="none"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  style={{ stroke: "var(--ink-3)" }}
                />
              </motion.g>
            </g>
            {Array.from({ length: MAX_MOTES }, (_, i) => (
              <Mote
                key={i}
                index={i}
                count={moteCount}
                origin={moteOrigin}
                reach={(4 + 12 * dust) * k}
                scale={k * (0.8 + 0.6 * dust)}
                t={motes}
              />
            ))}
          </>
        ) : null}
      </svg>

      {hint ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </span>
  );
}
