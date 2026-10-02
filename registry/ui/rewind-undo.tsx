"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type HistoryStep = {
  id: string;
  /** What the step did, in a few words: "Removed column". */
  label: string;
};

export type RewindUndoState = "idle" | "pending" | "success" | "error";

export type RewindUndoSize = "sm" | "md" | "lg";

export type RewindReadoutLabels = {
  /** Before an undone step's name. @default "Undid" */
  undid?: string;
  /** Before a redone step's name. @default "Redid" */
  redid?: string;
  /** Before the step Undo would take next, at rest. @default "Last" */
  last?: string;
  /** At the start of history. @default "Nothing to undo" */
  empty?: string;
  /** Before a step that failed. @default "Failed" */
  failed?: string;
};

export type RewindUndoProps = {
  /** Everything done so far, oldest first: the tape. @default defaultHistory */
  history?: HistoryStep[];
  /** Controlled: how many steps of `history` are applied. */
  index?: number;
  /** How many steps are applied at first. @default history.length */
  defaultIndex?: number;
  /** Each new position, from the press, the hold or the shortcut that moved it. */
  onIndexChange?: (index: number) => void;
  /** Undoes one step. Return a promise and the step waits on it; the signal aborts on Escape. */
  onUndo?: (step: HistoryStep, signal: AbortSignal) => void | Promise<unknown>;
  /** Redoes one step, the same way. */
  onRedo?: (step: HistoryStep, signal: AbortSignal) => void | Promise<unknown>;
  /** Controlled action state. Every move goes through `onStateChange` and waits for this. */
  state?: RewindUndoState;
  /** Each action state, from the press, the answer or the timer that caused it. */
  onStateChange?: (state: RewindUndoState) => void;
  /** Steps one turn of a half-full reel holds; also the reel's spokes. Fewer means bigger turns. @default 6 */
  steps?: number;
  /** Reel weight, 0 to 1: a light reel snaps to each step, a heavy one carries past and settles back. @default 0.5 */
  spool?: number;
  /** How hard a held press speeds up the scrub, 0 to 1: 0 keeps a steady pace, 1 races. @default 0.5 */
  hold?: number;
  /** How long a press is held before it starts to scrub, in ms. @default 380 */
  holdDelay?: number;
  /** Bind ⌘Z / Ctrl+Z to undo and ⇧⌘Z / Ctrl+Y to redo, outside text fields. @default false */
  shortcuts?: boolean;
  /** @default "Undo" */
  undoLabel?: string;
  /** @default "Redo" */
  redoLabel?: string;
  /** The words on the tape between the reels. */
  readoutLabels?: RewindReadoutLabels;
  /** The tape. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long a step's name stays on the tape before it rests, in ms. @default 2200 */
  successHold?: number;
  /** How long a failure holds before it rests, in ms. @default 2600 */
  errorHold?: number;
  /** 32, 40 or 48 px tall. @default "md" */
  size?: RewindUndoSize;
  /** Play a click per step and the reels' whir while a hold scrubs. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** A spreadsheet's morning, oldest first. */
export const defaultHistory: HistoryStep[] = [
  { id: "rename", label: "Renamed sheet" },
  { id: "add-col", label: "Added column" },
  { id: "paste", label: "Pasted 12 cells" },
  { id: "sort", label: "Sorted by revenue" },
  { id: "merge", label: "Merged B2:C2" },
  { id: "remove-col", label: "Removed column" },
  { id: "fill", label: "Filled row amber" },
  { id: "widen", label: "Widened column B" },
  { id: "freeze", label: "Froze header" },
];

type Geometry = {
  h: number;
  pad: number;
  icon: number;
  text: string;
  tag: string;
};

const GEOMETRY: Record<RewindUndoSize, Geometry> = {
  sm: { h: 32, pad: 10, icon: 18, text: "text-xs", tag: "text-[9px]" },
  md: { h: 40, pad: 12, icon: 22, text: "text-[13px]", tag: "text-[10px]" },
  lg: { h: 48, pad: 14, icon: 26, text: "text-sm", tag: "text-[11px]" },
};

/** The reel's drawing box and radii, in its own units. */
const VB = 24;
const C = 12;
const RIM = 10.6;
const HUB = 3.2;
const FULL = 9.4;
/** The radius at which one turn holds exactly `steps` steps. */
const MID = (HUB + FULL) / 2;
const FIRST_INTERVAL = 260;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** Tape is area: a reel's radius goes with the square root of what it holds. */
const radiusFor = (share: number) =>
  Math.sqrt(HUB * HUB + (FULL * FULL - HUB * HUB) * clamp01(share));

/** The reel's spokes and one rivet, turned by `angle` (degrees), rounded. */
function reelPath(angle: number, n: number): string {
  const parts: string[] = [];
  for (let k = 0; k < n; k += 1) {
    const a = ((angle + (k * 360) / n) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    parts.push(
      `M ${r3(C + HUB * c)} ${r3(C + HUB * s)} L ${r3(C + (RIM - 0.9) * c)} ${r3(C + (RIM - 0.9) * s)}`,
    );
  }
  // One rivet between two spokes, so a turn of exactly one spoke still shows.
  const b = ((angle + 180 / n) * Math.PI) / 180;
  const x = r3(C + (RIM - 2.6) * Math.cos(b) - 0.8);
  const y = r3(C + (RIM - 2.6) * Math.sin(b));
  parts.push(`M ${x} ${y} a 0.8 0.8 0 1 0 1.6 0 a 0.8 0.8 0 1 0 -1.6 0`);
  return parts.join(" ");
}

type Dir = -1 | 1;

type Readout = {
  kind: "idle" | "undid" | "redid" | "error";
  label: string;
  dir: Dir;
  /** Waiting on the host: the name is there, faint, and not yet struck. */
  pending: boolean;
  key: number;
};

type Press = {
  dir: Dir;
  timer: number;
  interval: number;
  count: number;
  /** Where the scrub started, for the summary. */
  from: number;
  source: "pointer" | "key";
  /** The press's own step has been taken (a key steps at once). */
  stepped: boolean;
};

type Api = {
  press: (dir: Dir, source: Press["source"]) => void;
  release: (cancelled?: boolean) => void;
  tick: () => void;
  step: (dir: Dir) => boolean;
  requestState: (next: RewindUndoState) => void;
  turn: (from: number, to: number) => void;
};

function Reel({
  angle,
  tape,
  spokes,
  size,
}: {
  angle: MotionValue<number>;
  tape: MotionValue<number>;
  spokes: number;
  size: number;
}) {
  const d = useTransform(angle, (a) => reelPath(a, spokes));
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${VB} ${VB}`}
      className="shrink-0"
      fill="none"
    >
      <motion.circle
        cx={C}
        cy={C}
        r={tape}
        className="fill-(--rewind-tape) stroke-(--rewind-accent)"
        strokeWidth={0.8}
      />
      <motion.path
        d={d}
        strokeWidth={1.1}
        strokeLinecap="round"
        className="stroke-current opacity-70"
      />
      <circle
        cx={C}
        cy={C}
        r={RIM}
        strokeWidth={1.4}
        className="stroke-current"
      />
      <circle
        cx={C}
        cy={C}
        r={HUB - 0.7}
        strokeWidth={1.3}
        className="stroke-current"
      />
    </svg>
  );
}

/**
 * Undo and redo as a tape deck. The Undo button carries a reel that holds
 * the applied history and the Redo button a reel that holds what has been
 * rewound; the tape between them reads out each step. A press rewinds one
 * step: both reels turn the same way on a spring as heavy as `spool` — each
 * by the tape's length over its own radius, so a nearly empty reel spins
 * visibly faster than a full one — and the undone action's name is pulled
 * out of the Undo reel onto the tape, struck through. Holding the press
 * scrubs: steps repeat at an interval that shrinks with `hold`, the reels
 * spin faster and faster, and the names flick past. Redo appears once there
 * is something to redo and works the same way forward.
 *
 * Both are native buttons in a named group: Enter and Space step, and held
 * they scrub exactly as a held pointer does. Escape cancels a step the host
 * is still working on. With `shortcuts`, ⌘Z and ⇧⌘Z (Ctrl+Z, Ctrl+Y) drive
 * it from anywhere outside a text field. Under reduced motion the reels do
 * not turn and nothing slides: the tape swaps and the names cross-fade.
 */
export function RewindUndo({
  history = defaultHistory,
  index,
  defaultIndex,
  onIndexChange,
  onUndo,
  onRedo,
  state,
  onStateChange,
  steps = 6,
  spool = 0.5,
  hold = 0.5,
  holdDelay = 380,
  shortcuts = false,
  undoLabel = "Undo",
  redoLabel = "Redo",
  readoutLabels,
  accent = "var(--accent-bright)",
  successHold = 2200,
  errorHold = 2600,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: RewindUndoProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const len = history.length;
  const spokes = Math.round(Math.min(12, Math.max(3, steps)));
  const weight = clamp01(spool);
  const words = {
    undid: readoutLabels?.undid ?? "Undid",
    redid: readoutLabels?.redid ?? "Redid",
    last: readoutLabels?.last ?? "Last",
    empty: readoutLabels?.empty ?? "Nothing to undo",
    failed: readoutLabels?.failed ?? "Failed",
  };

  const [ownIndex, setOwnIndex] = React.useState(() =>
    Math.min(len, Math.max(0, defaultIndex ?? len)),
  );
  const shownIndex = Math.min(len, Math.max(0, index ?? ownIndex));
  const [ownState, setOwnState] = React.useState<RewindUndoState>("idle");
  const shownState = state ?? ownState;
  const canUndo = shownIndex > 0;
  const canRedo = shownIndex < len;

  const [scrubbing, setScrubbing] = React.useState(false);
  const [waiting, setWaiting] = React.useState<{
    dir: Dir;
    label: string;
  } | null>(null);
  const [readout, setReadout] = React.useState<Readout>({
    kind: "idle",
    label: "",
    dir: -1,
    pending: false,
    key: 0,
  });
  const [said, setSaid] = React.useState("");
  const [compact, setCompact] = React.useState(false);
  const [tapeEl, setTapeEl] = React.useState<HTMLSpanElement | null>(null);
  const [seen, setSeen] = React.useState({ i: shownIndex, s: shownState });

  // The tape and the live region follow what is shown: a step the host takes
  // on its own reads out the same way as a press.
  if (seen.i !== shownIndex || seen.s !== shownState) {
    const was = seen;
    setSeen({ i: shownIndex, s: shownState });
    const key = readout.key + 1;
    if (was.i !== shownIndex) {
      const dir: Dir = shownIndex < was.i ? -1 : 1;
      const crossed = dir < 0 ? history[shownIndex] : history[shownIndex - 1];
      const label = crossed?.label ?? "";
      setReadout({
        kind: dir < 0 ? "undid" : "redid",
        label,
        dir,
        pending: false,
        key,
      });
      if (!scrubbing)
        setSaid(`${dir < 0 ? words.undid : words.redid} ${label}.`);
    } else if (shownState === "pending" && waiting) {
      setReadout({
        kind: waiting.dir < 0 ? "undid" : "redid",
        label: waiting.label,
        dir: waiting.dir,
        pending: true,
        key,
      });
      setSaid(
        `${waiting.dir < 0 ? undoLabel : redoLabel} in progress: ${waiting.label}.`,
      );
    } else if (shownState === "error") {
      const dir = waiting?.dir ?? -1;
      const label = waiting?.label ?? "";
      setReadout({ kind: "error", label, dir, pending: false, key });
      setSaid(
        `${words.failed}: ${label}. Press ${dir < 0 ? undoLabel : redoLabel} to try again.`,
      );
    } else if (shownState === "idle" && was.s !== "idle") {
      setReadout({
        kind: "idle",
        label: "",
        dir: readout.dir,
        pending: false,
        key,
      });
      if (was.s === "pending") setSaid("Cancelled.");
    }
  }

  const angU = useMotionValue(0);
  const angR = useMotionValue(0);
  const tug = useMotionValue(0);
  const tapeU = useMotionValue(r2(radiusFor(len ? shownIndex / len : 0)));
  const tapeR = useMotionValue(
    r2(radiusFor(len ? (len - shownIndex) / len : 0)),
  );
  const holdClock = useMotionValue(0);
  const shownU = useTransform(
    [angU, tug] as MotionValue<number>[],
    ([a = 0, t = 0]: number[]) => a + t,
  );
  const shownR = useTransform(
    [angR, tug] as MotionValue<number>[],
    ([a = 0, t = 0]: number[]) => a + t,
  );

  const undoRef = React.useRef<HTMLButtonElement | null>(null);
  const redoRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);
  const pressRef = React.useRef<Press | null>(null);
  const targets = React.useRef({ u: 0, r: 0 });
  const indexRef = React.useRef(shownIndex);
  const prevIndex = React.useRef(shownIndex);
  const pendingRef = React.useRef(false);
  const controller = React.useRef<AbortController | null>(null);
  const epoch = React.useRef(0);
  const whir = React.useRef<LoopHandle | null>(null);
  const keyDown = React.useRef(false);
  const detach = React.useRef<(() => void) | null>(null);
  const undoText = React.useRef<HTMLSpanElement | null>(null);
  const redoText = React.useRef<HTMLSpanElement | null>(null);
  const freed = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const pan = (dir: Dir) => {
    const rect = (dir < 0 ? undoRef : redoRef).current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const requestState = (next: RewindUndoState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };

  const requestIndex = (next: number) => {
    if (index === undefined) setOwnIndex(next);
    onIndexChange?.(next);
  };

  // A light reel is near the snap spring; a heavy one near recoil's two
  // bounces, slower and carrying past each step before it settles back.
  const reelSpring = spring(lerp(640, 300, weight), lerp(0.83, 0.42, weight));

  /** The reels follow the index: tape length over each reel's own radius. */
  const turn = (from: number, to: number) => {
    if (from === to) return;
    const dir: Dir = to < from ? -1 : 1;
    const tapeLen = (360 / spokes) * MID;
    let du = 0;
    let dr = 0;
    for (let i = from; i !== to; i += dir) {
      const mid = i + dir / 2;
      du += tapeLen / radiusFor(len ? mid / len : 0);
      dr += tapeLen / radiusFor(len ? (len - mid) / len : 0);
    }
    const share = len ? to / len : 0;
    if (!motionSafe) {
      tapeU.set(r2(radiusFor(share)));
      tapeR.set(r2(radiusFor(1 - share)));
      return;
    }
    // Rewinding turns both reels counter-clockwise, as on any deck.
    targets.current.u += dir * du;
    targets.current.r += dir * dr;
    run(
      "angU",
      animate(angU, r2(targets.current.u), {
        ...reelSpring,
        velocity: angU.getVelocity(),
      }),
    );
    run(
      "angR",
      animate(angR, r2(targets.current.r), {
        ...reelSpring,
        velocity: angR.getVelocity(),
      }),
    );
    run("tapeU", animate(tapeU, r2(radiusFor(share)), springs.glide));
    run("tapeR", animate(tapeR, r2(radiusFor(1 - share)), springs.glide));
  };

  /** The end of the tape: the reel knocks against it and stops. */
  const bump = (dir: Dir) => {
    audio.play("click", { pitch: 0.55, gain: 0.45, pan: pan(dir) });
    if (!motionSafe) return;
    const mv = dir < 0 ? angU : angR;
    const base = r2(dir < 0 ? targets.current.u : targets.current.r);
    run(
      dir < 0 ? "angU" : "angR",
      animate(mv, [base, base + dir * 7, base - dir * 3, base], {
        duration: 0.32,
        ease: easings.enter,
      }),
    );
  };

  /** One step; false when there is nothing that way or a step is waiting. */
  const step = (dir: Dir): boolean => {
    if (disabled || pendingRef.current) return false;
    const at = indexRef.current;
    const to = at + dir;
    if (to < 0 || to > len) return false;
    const entry = dir < 0 ? history[at - 1] : history[at];
    if (!entry) return false;
    audio.play("click", {
      pitch: r2(0.8 + 0.6 * (len ? to / len : 0)),
      gain: 0.36,
      pan: pan(dir),
    });
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    epoch.current += 1;
    const token = epoch.current;
    let result: unknown;
    setWaiting({ dir, label: entry.label });
    try {
      result = (dir < 0 ? onUndo : onRedo)?.(entry, ctrl.signal);
    } catch {
      requestState("error");
      return false;
    }
    if (!isThenable(result)) {
      indexRef.current = to;
      requestIndex(to);
      requestState("success");
      return true;
    }
    pendingRef.current = true;
    requestState("pending");
    result.then(
      () => {
        if (epoch.current !== token) return;
        pendingRef.current = false;
        indexRef.current = to;
        requestIndex(to);
        api.current?.requestState("success");
      },
      () => {
        if (epoch.current !== token) return;
        pendingRef.current = false;
        api.current?.requestState("error");
      },
    );
    return true;
  };

  const stopWhir = () => {
    whir.current?.stop();
    whir.current = null;
  };

  /** A held press: steps come faster and faster until it is let go. */
  const tick = () => {
    const p = pressRef.current;
    if (!p) return;
    if (pendingRef.current) {
      p.timer = window.setTimeout(() => api.current?.tick(), 60);
      return;
    }
    const to = indexRef.current + p.dir;
    if (to < 0 || to > len) {
      bump(p.dir);
      release();
      return;
    }
    if (!p.stepped) {
      // A held pointer takes its own step here, as the scrub begins.
      p.stepped = true;
      step(p.dir);
      p.timer = window.setTimeout(() => api.current?.tick(), p.interval);
      return;
    }
    if (p.count === 0) {
      setScrubbing(true);
      if (sound) {
        whir.current = audio.start("whir", {
          pitch: 0.7,
          gain: 0.35,
          pan: pan(p.dir),
        });
      }
    }
    if (step(p.dir)) p.count += 1;
    const decay = lerp(0.97, 0.78, clamp01(hold));
    const floor = lerp(150, 45, clamp01(hold));
    p.interval = Math.max(floor, p.interval * decay);
    whir.current?.set({
      pitch: r2(0.6 + 90 / p.interval),
      gain: r2(Math.min(0.7, 0.3 + 25 / p.interval)),
    });
    p.timer = window.setTimeout(() => api.current?.tick(), p.interval);
  };

  const release = (cancelled = false) => {
    const p = pressRef.current;
    pressRef.current = null;
    detach.current?.();
    detach.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    stopWhir();
    // A tap: the pointer's one step lands on release, so a scroll that
    // merely started on the button (and was cancelled) never undoes.
    if (!p.stepped && !cancelled) step(p.dir);
    if (p.count === 0) return;
    setScrubbing(false);
    // One sentence for the whole scrub, never one per step.
    const moved = Math.abs(indexRef.current - p.from);
    const at = indexRef.current;
    const last = history[at - 1];
    setSaid(
      `${p.dir < 0 ? words.undid : words.redid} ${moved} step${moved === 1 ? "" : "s"}. ${
        last ? `${words.last}: ${last.label}.` : `${words.empty}.`
      }`,
    );
  };

  const press = (dir: Dir, source: Press["source"]) => {
    if (disabled || shownState === "pending") return;
    release(true);
    if (!(dir < 0 ? canUndo : canRedo)) {
      bump(dir);
      return;
    }
    const from = indexRef.current;
    if (source === "key") step(dir);
    pressRef.current = {
      dir,
      source,
      from,
      stepped: source === "key",
      count: 0,
      interval: FIRST_INTERVAL,
      timer: window.setTimeout(() => api.current?.tick(), holdDelay),
    };
  };

  const cancel = () => {
    epoch.current += 1;
    pendingRef.current = false;
    controller.current?.abort();
    controller.current = null;
    requestState("idle");
  };

  React.useEffect(() => {
    indexRef.current = shownIndex;
    pendingRef.current = shownState === "pending";
    api.current = { press, release, tick, step, requestState, turn };
  });

  React.useEffect(() => {
    const was = prevIndex.current;
    if (was === shownIndex) return;
    prevIndex.current = shownIndex;
    api.current?.turn(was, shownIndex);
  }, [shownIndex]);

  // A change of length (new history arrived) puts the tape where it belongs.
  React.useEffect(() => {
    const share = len ? prevIndex.current / len : 0;
    tapeU.set(r2(radiusFor(share)));
    tapeR.set(r2(radiusFor(1 - share)));
  }, [len, tapeU, tapeR]);

  // Too narrow to read the tape, the buttons drop their words (their names
  // stay). The width they give back is remembered, so the switch back waits
  // until there is room for the words again and the two never flicker.
  React.useEffect(() => {
    if (!tapeEl) return;
    const measure = () => {
      const w = tapeEl.clientWidth;
      // What the tape needs: its longest line, but never more than 180px —
      // a very long step name truncates rather than costing the words.
      let need = 0;
      for (const el of tapeEl.querySelectorAll<HTMLElement>("[data-reserve]")) {
        need = Math.max(need, el.scrollWidth);
      }
      const want = Math.min(180, Math.max(76, need));
      setCompact((was) => {
        if (!was) {
          if (w >= want) return false;
          freed.current =
            (undoText.current?.offsetWidth ?? 0) +
            (redoText.current?.offsetWidth ?? 0) +
            g.pad * 1.3;
          return true;
        }
        return w - freed.current < want + 8;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tapeEl);
    return () => observer.disconnect();
  }, [tapeEl, g.pad]);

  // Redo leaving while it has focus hands focus to Undo, never to the page.
  React.useEffect(() => {
    if (canRedo) return;
    if (document.activeElement === redoRef.current) {
      undoRef.current?.focus({ preventScroll: true });
    }
  }, [canRedo]);

  // While the host works on a step, the tape is tensioned: the reels tug.
  const tugging = shownState === "pending" && motionSafe;
  React.useEffect(() => {
    if (!tugging) return;
    const dir = pressRef.current?.dir ?? -1;
    const loop = animate(tug, [0, dir * 6, 0], {
      duration: 0.7,
      ease: easings.move,
      repeat: Infinity,
    });
    const onVisibility = () => {
      if (document.hidden) loop.pause();
      else loop.play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      loop.stop();
      animate(tug, 0, springs.snap);
    };
  }, [tugging, tug]);

  // A step's name holds on the tape, then rests; each new step restarts it.
  const holding = shownState === "success" || shownState === "error";
  const holdMs = shownState === "success" ? successHold : errorHold;
  const readKey = readout.key;
  React.useEffect(() => {
    if (!holding) return;
    holdClock.jump(0);
    const controls = animate(holdClock, 1, {
      duration: Math.max(0, holdMs) / 1000,
      ease: "linear",
      onComplete: () => api.current?.requestState("idle"),
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
  }, [holding, holdMs, holdClock, readKey]);

  // ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Y, outside anything that edits text.
  React.useEffect(() => {
    if (!shortcuts || disabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const redo =
        (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey);
      if (key !== "z" && !redo) return;
      const t = event.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          t.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }
      event.preventDefault();
      const now = api.current;
      if (!now) return;
      if (!now.step(redo ? 1 : -1)) return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, disabled]);

  // Anything that takes the page away lets go of a held press.
  React.useEffect(() => {
    const letGo = () => api.current?.release(true);
    const onVisibility = () => {
      if (document.hidden) letGo();
    };
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const controls of running.values()) controls.stop();
      running.clear();
      const p = pressRef.current;
      if (p) window.clearTimeout(p.timer);
      pressRef.current = null;
      detach.current?.();
      detach.current = null;
      whir.current?.stop();
      whir.current = null;
      epoch.current += 1;
      controller.current?.abort();
    };
  }, []);

  const onPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    dir: Dir,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const id = event.pointerId;
    press(dir, "pointer");
    // The release can land anywhere; it ends the hold wherever it does.
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) api.current?.release(false);
    };
    const cancelled = (e: PointerEvent) => {
      if (e.pointerId === id) api.current?.release(true);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelled);
    detach.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelled);
    };
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    dir: Dir,
  ) => {
    if (event.key === "Escape" && shownState === "pending") {
      // Handled here, where focus is; the page must not also see it.
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    // The key is the press: down steps and arms the scrub, up lets go. The
    // native click it would also make is not another step.
    event.preventDefault();
    keyDown.current = true;
    if (event.repeat) return;
    press(dir, "key");
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (pressRef.current?.source === "key") release();
    window.setTimeout(() => {
      keyDown.current = false;
    }, 0);
  };

  const nextUndo = history[shownIndex - 1];
  const nextRedo = history[shownIndex];
  const line =
    readout.kind === "idle"
      ? nextUndo
        ? { tag: words.last, label: nextUndo.label, tone: "text-ink-3" }
        : { tag: "", label: words.empty, tone: "text-ink-3" }
      : readout.kind === "error"
        ? { tag: words.failed, label: readout.label, tone: "text-danger" }
        : {
            tag: readout.kind === "undid" ? words.undid : words.redid,
            label: readout.label,
            tone: readout.pending ? "text-ink-3" : "text-ink-2",
          };
  const tags = [words.undid, words.redid, words.last, words.failed];
  const fast = scrubbing;
  const lineKey = `${readout.key}:${line.label}`;

  const buttonClass = (enabled: boolean) =>
    cn(
      "relative inline-flex shrink-0 touch-manipulation items-center rounded-3 border border-hairline-strong bg-card font-medium whitespace-nowrap transition-[color,background-color,scale] duration-150 outline-none select-none",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      "active:scale-[0.97] motion-reduce:active:scale-100",
      g.text,
      disabled
        ? "cursor-not-allowed opacity-50"
        : enabled
          ? "cursor-pointer text-foreground hover:bg-surface-2"
          : "cursor-not-allowed text-ink-3",
    );

  return (
    <div
      role="group"
      aria-label="History"
      className={cn(
        "inline-flex max-w-full items-center gap-2 align-middle",
        className,
      )}
      style={
        {
          "--rewind-accent": accent,
          "--rewind-tape": `color-mix(in oklab, ${accent} 42%, transparent)`,
        } as React.CSSProperties
      }
    >
      <button
        ref={undoRef}
        type="button"
        disabled={disabled}
        aria-disabled={!canUndo || undefined}
        aria-label={nextUndo ? `${undoLabel} ${nextUndo.label}` : undoLabel}
        aria-busy={(shownState === "pending" && readout.dir < 0) || undefined}
        onPointerDown={(event) => onPointerDown(event, -1)}
        onKeyDown={(event) => onKeyDown(event, -1)}
        onKeyUp={onKeyUp}
        onClick={(event) => {
          // Pointer presses step on release and keys on key-down; a click
          // with neither behind it (assistive technology) is one step.
          if (event.detail === 0 && !keyDown.current) step(-1);
        }}
        className={buttonClass(canUndo)}
        style={{
          height: g.h,
          paddingInline: compact ? (g.h - 2 - g.icon) / 2 : g.pad,
          gap: r2(g.pad * 0.66),
        }}
      >
        <Reel angle={shownU} tape={tapeU} spokes={spokes} size={g.icon} />
        <span ref={undoText} aria-hidden className={cn(compact && "hidden")}>
          {undoLabel}
        </span>
      </button>

      {/* The tape: the step's name, pulled out of the reel it came from. */}
      <span
        ref={setTapeEl}
        aria-hidden
        className={cn(
          "relative grid min-w-0 flex-1 overflow-clip leading-5 [contain:paint]",
          g.text,
        )}
      >
        {[...history.map((s) => s.label), words.empty].map((text, i) => (
          <span
            key={i}
            data-reserve
            className="invisible col-start-1 row-start-1 flex items-baseline gap-1.5"
          >
            <span className={cn("grid shrink-0 font-mono uppercase", g.tag)}>
              {tags.map((t) => (
                <span key={t} className="col-start-1 row-start-1">
                  {t}
                </span>
              ))}
            </span>
            <span className="whitespace-nowrap">{text}</span>
          </span>
        ))}
        <AnimatePresence initial={false} custom={readout.dir}>
          <motion.span
            key={lineKey}
            custom={readout.dir}
            title={line.label}
            className="col-start-1 row-start-1 flex min-w-0 items-baseline gap-1.5"
            variants={{
              // Scrubbing, names flick past: a short nudge in, and the old
              // one gone at once, so two never overlap mid-slide.
              enter: (dir: Dir) =>
                motionSafe
                  ? {
                      opacity: fast ? 0.5 : 0,
                      x:
                        (dir < 0 ? -1 : 1) *
                        (fast ? distances.nudge : distances.step),
                    }
                  : { opacity: 0, x: 0 },
              shown: {
                opacity: readout.pending ? 0.6 : 1,
                x: 0,
                transition: motionSafe
                  ? fast
                    ? {
                        ...springs.flick,
                        opacity: { duration: durations.blink },
                      }
                    : { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast },
              },
              leave: (dir: Dir) => ({
                opacity: 0,
                x: motionSafe
                  ? dir < 0
                    ? distances.step
                    : -distances.step
                  : 0,
                transition: {
                  duration: fast ? 0 : durations.fast * 0.6,
                  ease: easings.exit,
                },
              }),
            }}
            initial="enter"
            animate="shown"
            exit="leave"
          >
            <span
              className={cn(
                "grid shrink-0 font-mono tracking-[0.06em] uppercase",
                g.tag,
                readout.kind === "error" ? "text-danger" : "text-ink-3",
              )}
            >
              {tags.map((t) => (
                <span
                  key={t}
                  className={cn(
                    "col-start-1 row-start-1",
                    t !== line.tag && "invisible",
                  )}
                >
                  {t}
                </span>
              ))}
            </span>
            <span className={cn("relative min-w-0 truncate", line.tone)}>
              {line.label}
              {readout.kind === "undid" ? (
                <motion.span
                  className="absolute inset-x-0 top-1/2 h-px bg-current"
                  style={{ originX: 0 }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: readout.pending ? 0 : 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: fast ? 0 : 0.08 }
                      : { duration: 0 }
                  }
                />
              ) : null}
            </span>
          </motion.span>
        </AnimatePresence>
      </span>

      <motion.span
        className="shrink-0"
        inert={!canRedo}
        initial={false}
        animate={{
          opacity: canRedo ? 1 : 0,
          x: canRedo || !motionSafe ? 0 : -distances.step,
        }}
        transition={
          motionSafe
            ? { ...springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <button
          ref={redoRef}
          type="button"
          disabled={disabled}
          aria-label={nextRedo ? `${redoLabel} ${nextRedo.label}` : redoLabel}
          aria-busy={(shownState === "pending" && readout.dir > 0) || undefined}
          onPointerDown={(event) => onPointerDown(event, 1)}
          onKeyDown={(event) => onKeyDown(event, 1)}
          onKeyUp={onKeyUp}
          onClick={(event) => {
            if (event.detail === 0 && !keyDown.current) step(1);
          }}
          className={buttonClass(canRedo)}
          style={{
            height: g.h,
            paddingInline: compact ? (g.h - 2 - g.icon) / 2 : g.pad,
            gap: r2(g.pad * 0.66),
          }}
        >
          <span ref={redoText} aria-hidden className={cn(compact && "hidden")}>
            {redoLabel}
          </span>
          <Reel angle={shownR} tape={tapeR} spokes={spokes} size={g.icon} />
        </button>
      </motion.span>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
