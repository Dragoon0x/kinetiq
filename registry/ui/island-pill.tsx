"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type IslandPillTone = "info" | "success" | "warn" | "danger";

export type IslandPillNotice = {
  id: string;
  title: string;
  body?: string;
  /** Colours its dot and glow; danger is announced assertively. @default "info" */
  tone?: IslandPillTone;
};

export type IslandPillState = "timer" | "upload" | "call";

export type IslandPillAction =
  "pause" | "resume" | "lap" | "stop" | "cancel" | "decline" | "answer" | "end";

export type IslandPillTimer = {
  /** What is being timed, e.g. "Tempo run". */
  label: string;
  /** Seconds on the clock. The host advances it. */
  seconds: number;
  paused?: boolean;
};

export type IslandPillUpload = {
  /** The file going up. */
  name: string;
  /** 0 to 1. */
  progress: number;
  paused?: boolean;
};

export type IslandPillCall = {
  caller: string;
  /** A second line, e.g. "Mobile" or "On call · 0:42". */
  detail?: string;
  /** Answered: the call offers End instead of Decline and Answer. */
  connected?: boolean;
};

export type IslandPillProps = {
  /** Notices waiting in the island, oldest first. A new one arrives as a banner. */
  notices: IslandPillNotice[];
  /** A notice was dismissed from the open card: its ×, or Delete. */
  onDismiss?: (id: string) => void;
  /** The live activity the island carries. Changing it morphs the island. @default "timer" */
  state?: IslandPillState;
  timer?: IslandPillTimer;
  upload?: IslandPillUpload;
  call?: IslandPillCall;
  /** An action chosen from the open card or the quick actions. */
  onAction?: (action: IslandPillAction) => void;
  /**
   * Open as the full card. A new value opens or closes the island the way a
   * tap does; taps, outside presses and Escape change it too and report
   * through `onExpandChange`. @default false
   */
  expand?: boolean;
  onExpandChange?: (open: boolean) => void;
  /** How stiff the liquid is, 200 to 600: slow and wobbly, or quick and firm. @default 380 */
  stiffness?: number;
  /** The halo in the live activity's colour, 0 to 1. @default 0.5 */
  glow?: number;
  /** The island's accessible name. @default "Live activity" */
  label?: string;
  /** The screen the island floats over. */
  children?: React.ReactNode;
  /** Play the morphs and the actions. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Vars = React.CSSProperties & Record<`--${string}`, string>;

/** The island's own colours: pigments at fixed lightness, the same in both themes. */
const PALETTE: Vars = {
  "--island": "oklch(from var(--ink-3) 0.15 0.012 h)",
  "--island-ink": "oklch(from var(--ink) 0.97 0.004 h)",
  "--island-ink-2": "oklch(from var(--ink) 0.72 0.01 h)",
  "--island-well": "oklch(from var(--ink-3) 0.24 0.014 h)",
  "--island-timer": "oklch(from var(--warn) 0.82 0.15 h)",
  "--island-upload": "oklch(from var(--accent-bright) 0.74 0.15 h)",
  "--island-call": "oklch(from var(--success) 0.78 0.17 h)",
  "--island-danger": "oklch(from var(--danger) 0.68 0.2 h)",
};

const STATE_COLOR: Record<IslandPillState, string> = {
  timer: "var(--island-timer)",
  upload: "var(--island-upload)",
  call: "var(--island-call)",
};

const TONE_COLOR: Record<IslandPillTone, string> = {
  info: "var(--island-upload)",
  success: "var(--island-call)",
  warn: "var(--island-timer)",
  danger: "var(--island-danger)",
};

/** The island hangs this far below the top, in a slot this tall. */
const TOP = 10;
const STRIP = 56;
/** Room kept at each side of the widest shapes. */
const EDGE = 12;
const REST: Record<IslandPillState, { w: number; h: number }> = {
  timer: { w: 148, h: 36 },
  upload: { w: 188, h: 36 },
  call: { w: 240, h: 44 },
};
const BANNER = { w: 360, h: 60, r: 22 };
const OPEN = { w: 420, r: 24 };
/** A guess at the open card's height until it has been measured. */
const OPEN_GUESS = 176;
/** Quick-action droplets: radius, spacing, and the gap under the pill. */
const DROP_R = 19;
const DROP_STEP = 50;
const DROP_GAP = 16;
/** The count droplet fused to the pill's right end. */
const BADGE_R = 9;
const HOLD_MS = 450;
const BANNER_FOR = 4500;
/** A ringing call swells this much, twice every period. */
const BREATH = 6;
const BREATH_EVERY = 1400;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * The neck between two circles, as a closed path: the classic metaball
 * bridge, its handles shortening as the circles part, gone once they are
 * `reach` radii apart. Drawn in the same fill as both circles, it reads as
 * one liquid body that pinches and lets go.
 */
function bridge(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2_: number,
  reach = 1.35,
): string {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d < 0.5 || d > (r1 + r2_) * reach || d <= Math.abs(r1 - r2_)) return "";
  const dir = Math.atan2(y2 - y1, x2 - x1);
  const overlap = d < r1 + r2_;
  const u1 = overlap
    ? Math.acos(clamp((r1 * r1 + d * d - r2_ * r2_) / (2 * r1 * d), -1, 1))
    : 0;
  const u2 = overlap
    ? Math.acos(clamp((r2_ * r2_ + d * d - r1 * r1) / (2 * r2_ * d), -1, 1))
    : 0;
  const spread = 0.5;
  const most = Math.acos(clamp((r1 - r2_) / d, -1, 1));
  const a1 = dir + u1 + (most - u1) * spread;
  const b1 = dir - u1 - (most - u1) * spread;
  const a2 = dir + Math.PI - u2 - (Math.PI - u2 - most) * spread;
  const b2 = dir - Math.PI + u2 + (Math.PI - u2 - most) * spread;
  const at = (x: number, y: number, r: number, a: number) =>
    [x + r * Math.cos(a), y + r * Math.sin(a)] as const;
  const p1a = at(x1, y1, r1, a1);
  const p1b = at(x1, y1, r1, b1);
  const p2a = at(x2, y2, r2_, a2);
  const p2b = at(x2, y2, r2_, b2);
  const handle =
    Math.min(
      spread * 2.4,
      Math.hypot(p1a[0] - p2a[0], p1a[1] - p2a[1]) / (r1 + r2_),
    ) * Math.min(1, (d * 2) / (r1 + r2_));
  const hd = (p: readonly [number, number], r: number, a: number) =>
    [p[0] + r * handle * Math.cos(a), p[1] + r * handle * Math.sin(a)] as const;
  const h1 = hd(p1a, r1, a1 - Math.PI / 2);
  const h2 = hd(p2a, r2_, a2 + Math.PI / 2);
  const h3 = hd(p2b, r2_, b2 - Math.PI / 2);
  const h4 = hd(p1b, r1, b1 + Math.PI / 2);
  const f = (p: readonly [number, number]) => `${r2(p[0])} ${r2(p[1])}`;
  // The ends close across each circle's chord; the circles cover them.
  return `M ${f(p1a)} C ${f(h1)} ${f(h2)} ${f(p2a)} L ${f(p2b)} C ${f(h3)} ${f(h4)} ${f(p1b)} Z`;
}

/** The pill's nearest end circle to a point: a capsule is a row of circles. */
const nearestEnd = (w: number, h: number, x: number) => {
  const r = h / 2;
  const reach = Math.max(0, w / 2 - r);
  return { x: clamp(x, -reach, reach), y: r, r };
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const clockOf = (seconds: number) => {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
};
const minutesOf = (seconds: number) => {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return m === 1 ? "1 minute" : `${m} minutes`;
};
const percentOf = (p: number) => Math.round(clamp(p, 0, 1) * 100);
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
const sentence = (title: string, body?: string) => {
  const t = title.trim();
  if (!body?.trim()) return t;
  return `${t}${/[.!?]$/.test(t) ? " " : ". "}${body.trim()}`;
};
const noticesText = (n: number) => (n === 1 ? "1 notice" : `${n} notices`);

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverVisible = () => false;

/* ------------------------------------------------------------------ *
 * Icons: 16px, drawn in currentColor.
 * ------------------------------------------------------------------ */

function Icon({ name }: { name: IslandPillAction | "shrink" | "dismiss" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    "aria-hidden": true,
    className: "size-4 shrink-0",
  } as const;
  const handset =
    "M4.6 2.5h1.8l1 3-1.4 1c.7 1.5 1.9 2.7 3.4 3.4l1-1.4 3 1v1.8c0 1.1-.9 2-2 2C7 13.1 2.9 9 2.6 4.5c0-1.1.9-2 2-2Z";
  switch (name) {
    case "pause":
      return (
        <svg {...common} fill="currentColor">
          <rect x={4} y={3} width={2.8} height={10} rx={0.8} />
          <rect x={9.2} y={3} width={2.8} height={10} rx={0.8} />
        </svg>
      );
    case "resume":
      return (
        <svg {...common} fill="currentColor">
          <path d="M5 3.2 12.6 8 5 12.8Z" />
        </svg>
      );
    case "lap":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 13.5V2.5M4 3h7.5L10 5.8l1.5 2.7H4" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common} fill="currentColor">
          <rect x={3.5} y={3.5} width={9} height={9} rx={1.5} />
        </svg>
      );
    case "cancel":
    case "dismiss":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      );
    case "answer":
      return (
        <svg {...common} fill="currentColor">
          <path d={handset} />
        </svg>
      );
    case "decline":
    case "end":
      return (
        <svg {...common} fill="currentColor">
          <g transform="rotate(135 8 8)">
            <path d={handset} />
          </g>
        </svg>
      );
    case "shrink":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 10l4-4 4 4" />
        </svg>
      );
  }
}

type ActionDef = {
  id: IslandPillAction;
  label: string;
  /** "go" is the green answer, "stop" the red ones. */
  tone?: "go" | "stop";
};

function actionsFor(
  state: IslandPillState,
  timer: IslandPillTimer,
  upload: IslandPillUpload,
  call: IslandPillCall,
): ActionDef[] {
  if (state === "timer") {
    return [
      timer.paused
        ? { id: "resume", label: "Resume" }
        : { id: "pause", label: "Pause" },
      { id: "lap", label: "Lap" },
      { id: "stop", label: "Stop", tone: "stop" },
    ];
  }
  if (state === "upload") {
    return [
      upload.paused
        ? { id: "resume", label: "Resume" }
        : { id: "pause", label: "Pause" },
      { id: "cancel", label: "Cancel", tone: "stop" },
    ];
  }
  return call.connected
    ? [{ id: "end", label: "End", tone: "stop" }]
    : [
        { id: "decline", label: "Decline", tone: "stop" },
        { id: "answer", label: "Answer", tone: "go" },
      ];
}

const toneOfAction = (tone?: ActionDef["tone"]) =>
  tone === "go"
    ? "var(--island-call)"
    : tone === "stop"
      ? "var(--island-danger)"
      : "var(--island-ink)";

/** A ring that fills: the timer's sweep of the minute, the upload's progress. */
function Ring({
  value,
  color,
  size,
  children,
}: {
  value: number;
  color: string;
  size: number;
  children?: React.ReactNode;
}) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, color }}
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx={10}
          cy={10}
          r={8}
          fill="none"
          strokeWidth={2.2}
          style={{ stroke: "var(--island-well)" }}
        />
        <circle
          cx={10}
          cy={10}
          r={8}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={r2(1 - clamp(value, 0, 1))}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      {children}
    </span>
  );
}

function Disc({ name, size }: { name: string; size: number }) {
  const turn = (hash(name) % 12) * 30;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium"
      style={{
        width: size,
        height: size,
        background: `oklch(from var(--accent-bright) 0.7 0.1 calc(h + ${turn}))`,
        color: "var(--island)",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * A quick action, budded off the pill as a droplet.
 * ------------------------------------------------------------------ */

type DropletProps = {
  action: ActionDef;
  index: number;
  count: number;
  pillW: MotionValue<number>;
  pillH: MotionValue<number>;
  motionSafe: boolean;
  active: boolean;
  chosen: React.RefObject<IslandPillAction | null>;
  bind: (id: IslandPillAction, node: HTMLButtonElement | null) => void;
  onChoose: (id: IslandPillAction) => void;
  onHover: (index: number) => void;
  onBud: (index: number) => void;
};

function Droplet({
  action,
  index,
  count,
  pillW,
  pillH,
  motionSafe,
  active,
  chosen,
  bind,
  onChoose,
  onHover,
  onBud,
}: DropletProps) {
  const [isPresent, safeToRemove] = usePresence();
  const home = (index - (count - 1) / 2) * DROP_STEP;
  const dx = useMotionValue(r2(home * 0.25));
  const dy = useMotionValue(18);
  const dr = useMotionValue(motionSafe ? 3 : DROP_R);
  const fade = useMotionValue(motionSafe ? 1 : 0);
  const latest = React.useRef({ motionSafe, onBud, home });
  React.useEffect(() => {
    latest.current = { motionSafe, onBud, home };
  });

  const neck = useTransform(
    [pillW, pillH, dx, dy, dr] as MotionValue<number>[],
    ([w = 0, h = 0, x = 0, y = 0, r = 0]: number[]) => {
      if (r < 1) return "";
      const end = nearestEnd(w, h, x);
      return bridge(end.x, end.y, end.r, x, y, r);
    },
  );
  const bx = useTransform(dx, (v) => r2(v - DROP_R));
  const by = useTransform(dy, (v) => r2(v - DROP_R));
  const scale = useTransform(dr, (r) => r2(clamp(r / DROP_R, 0, 1.4)));

  // Budding: from inside the pill, down and out on snap, a cascade beat
  // after the one before it. A re-run starts it clean from inside.
  React.useEffect(() => {
    if (!isPresent) return;
    const { motionSafe: safe, home: x } = latest.current;
    const h = pillH.get();
    const y = r2(h + DROP_GAP + DROP_R);
    if (!safe) {
      dx.set(x);
      dy.set(y);
      dr.set(DROP_R);
      const a = animate(fade, 1, {
        duration: durations.base,
        ease: easings.enter,
      });
      return () => a.stop();
    }
    dx.set(r2(x * 0.25));
    dy.set(r2(h / 2));
    dr.set(3);
    fade.set(1);
    const delay = index * cascade(count);
    const runs = [
      animate(dx, x, { ...springs.snap, delay }),
      animate(dy, y, { ...springs.snap, delay }),
      animate(dr, DROP_R, { ...springs.snap, delay }),
    ];
    const bud = window.setTimeout(
      () => latest.current.onBud(index),
      Math.round(delay * 1000),
    );
    return () => {
      window.clearTimeout(bud);
      for (const a of runs) a.stop();
    };
    // Budding happens once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  // Leaving: the chosen one pops, the rest are drawn back in along their
  // necks. Either way it finishes, then it is removed.
  React.useEffect(() => {
    if (isPresent) return;
    let live = true;
    const done = () => {
      if (live) safeToRemove?.();
    };
    const safe = latest.current.motionSafe;
    let runs: AnimationPlaybackControls[];
    if (!safe) {
      runs = [
        animate(fade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: done,
        }),
      ];
    } else if (chosen.current === action.id) {
      runs = [
        animate(dr, DROP_R * 1.3, { ...exitFor(durations.fast) }),
        animate(fade, 0, { ...exitFor(durations.fast), onComplete: done }),
      ];
    } else {
      const h = pillH.get();
      runs = [
        animate(dx, r2(latest.current.home * 0.25), springs.glide),
        animate(dy, r2(h / 2), springs.glide),
        animate(dr, 2, { ...springs.glide, onComplete: done }),
      ];
    }
    return () => {
      live = false;
      for (const a of runs) a.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  return (
    <>
      <svg
        aria-hidden
        width={1}
        height={1}
        className="pointer-events-none absolute top-0 left-1/2 overflow-visible"
      >
        {motionSafe ? (
          <motion.path d={neck} style={{ fill: "var(--island)" }} />
        ) : null}
        <motion.circle
          cx={dx}
          cy={dy}
          r={dr}
          style={{ fill: "var(--island)", opacity: fade }}
        />
      </svg>
      <motion.button
        ref={(node) => bind(action.id, node)}
        type="button"
        role="menuitem"
        tabIndex={active ? 0 : -1}
        aria-label={action.label}
        disabled={!isPresent}
        onClick={() => onChoose(action.id)}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") onHover(index);
        }}
        className={cn(
          "pointer-events-auto absolute top-0 left-1/2 flex items-center justify-center rounded-full outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "cursor-pointer",
        )}
        style={{
          width: DROP_R * 2,
          height: DROP_R * 2,
          x: bx,
          y: by,
          scale,
          opacity: fade,
          color: toneOfAction(action.tone),
          // Lifts a droplet off whatever screen it hangs over.
          boxShadow:
            "0 6px 14px -4px color-mix(in oklab, var(--island) 55%, transparent)",
        }}
      >
        <Icon name={action.id} />
      </motion.button>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The island
 * ------------------------------------------------------------------ */

type Mode = "rest" | "banner" | "open";
type FocusGoal = "card" | "pill" | "menu" | null;

type Api = {
  closeQuick: (focusPill: boolean) => void;
  setOpenTo: (next: boolean, focus?: FocusGoal) => void;
  endHold: () => void;
  openQuick: (focusFirst: boolean) => void;
};

/**
 * A black island at the top edge of a screen that carries the one live
 * thing — a timer, an upload, a call — and is where notices arrive. It is
 * one liquid object: its width, height and corner radius each ride their own
 * spring (the width leads, the height follows, the radius lags), and while
 * the width is travelling fast the body thins and stretches, the way a drop
 * does, so every change of shape reads as liquid finding a new form.
 *
 * A notice grows it into a banner for a few seconds; a tap grows it into a
 * full card with the activity's actions and the notices, each dismissible;
 * a tap outside, Escape or Shrink brings it back. A long press, Shift+F10 or
 * the menu key buds the activity's actions off the bottom of the pill as
 * droplets, each joined to the island by a neck that pinches and lets go.
 *
 * Under reduced motion the shape changes on a short tween with no squash, the
 * droplets fade in place and the call does not breathe; the banner, the
 * progress and the clock still show, because they are information.
 */
export function IslandPill({
  notices,
  onDismiss,
  state = "timer",
  timer,
  upload,
  call,
  onAction,
  expand = false,
  onExpandChange,
  stiffness = 380,
  glow = 0.5,
  label = "Live activity",
  children,
  sound = false,
  disabled = false,
  className,
}: IslandPillProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const titleId = `${uid}-title`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverVisible,
  );
  const k = clamp(stiffness, 200, 600);
  const g = clamp(glow, 0, 1);
  const kind: IslandPillState = REST[state] ? state : "timer";
  const timerData: IslandPillTimer = timer ?? { label: "Timer", seconds: 0 };
  const uploadData: IslandPillUpload = upload ?? {
    name: "Upload",
    progress: 0,
  };
  const callData: IslandPillCall = call ?? { caller: "Unknown caller" };
  const actions = actionsFor(kind, timerData, uploadData, callData);
  const count = notices.length;

  // --- open, following `expand` when it changes ----------------------------
  const [open, setOpen] = React.useState(expand);
  const [lastExpand, setLastExpand] = React.useState(expand);
  const [quick, setQuick] = React.useState(false);
  const [banner, setBanner] = React.useState<string | null>(null);
  if (expand !== lastExpand) {
    setLastExpand(expand);
    setOpen(expand);
    if (expand) {
      setQuick(false);
      setBanner(null);
    }
  }

  // --- arrivals --------------------------------------------------------------
  const idsKey = notices.map((n) => n.id).join("\u0001");
  const [seen, setSeen] = React.useState({
    key: idsKey,
    ids: notices.map((n) => n.id),
  });
  const [flare, setFlare] = React.useState(0);
  const [polite, setPolite] = React.useState({ n: 0, text: "" });
  const [urgent, setUrgent] = React.useState({ n: 0, text: "" });
  if (seen.key !== idsKey) {
    const fresh = notices.filter((n) => !seen.ids.includes(n.id));
    setSeen({ key: idsKey, ids: notices.map((n) => n.id) });
    const newest = fresh[fresh.length - 1];
    if (newest) {
      if (!open && !quick) setBanner(newest.id);
      setFlare((f) => f + 1);
      const said = `${newest.tone === "danger" ? "Urgent notice" : "New notice"}: ${sentence(newest.title, newest.body)}`;
      if (newest.tone === "danger")
        setUrgent((u) => ({ n: u.n + 1, text: said }));
      else setPolite((p) => ({ n: p.n + 1, text: said }));
    }
  }
  const bannerNotice = banner
    ? notices.find((n) => n.id === banner)
    : undefined;
  const mode: Mode = open ? "open" : bannerNotice ? "banner" : "rest";

  // --- measured sizes -------------------------------------------------------
  const [rootW, setRootW] = React.useState(0);
  const [screenH, setScreenH] = React.useState(0);
  const [openH, setOpenH] = React.useState(OPEN_GUESS);
  const [onScreen, setOnScreen] = React.useState(true);
  const cap = rootW > 0 ? Math.max(120, rootW - EDGE * 2) : Infinity;
  const rest = REST[kind];
  const target =
    mode === "open"
      ? { w: Math.min(OPEN.w, cap), h: openH, r: OPEN.r }
      : mode === "banner"
        ? { w: Math.min(BANNER.w, cap), h: BANNER.h, r: BANNER.r }
        : { w: Math.min(rest.w, cap), h: rest.h, r: rest.h / 2 };
  const extent =
    mode === "rest" && quick ? rest.h + DROP_GAP + DROP_R * 2 : target.h;
  const spacerTo = Math.max(0, r2(TOP + extent + 8 - (STRIP + screenH)));

  // --- motion values ---------------------------------------------------------
  const width = useMotionValue(target.w === Infinity ? rest.w : target.w);
  const height = useMotionValue(target.h);
  const radius = useMotionValue(target.r);
  const breath = useMotionValue(0);
  const inhale = useMotionValue(0);
  const flash = useMotionValue(0);
  const badge = useMotionValue(count > 0 && mode === "rest" ? 1 : 0);
  const spacer = useMotionValue(spacerTo);
  const shownW = useTransform(
    [width, breath] as MotionValue<number>[],
    ([w, b]) => r2((w as number) + (b as number)),
  );
  const velocity = useVelocity(width);
  const stretch = useTransform(velocity, (v) =>
    motionSafe ? r2(Math.min(0.07, Math.abs(v) / 3200)) : 0,
  );
  const fillScaleX = useTransform(
    [stretch, inhale] as MotionValue<number>[],
    ([s, i]) => r2(1 + (s as number) * 0.3 - (i as number) * 0.03),
  );
  const fillScaleY = useTransform(
    [stretch, inhale] as MotionValue<number>[],
    ([s, i]) => r2(1 - (s as number) - (i as number) * 0.03),
  );
  const badgeCx = useTransform(shownW, (w) => r2(w / 2 + 4));
  const badgePath = useTransform(
    [shownW, height, badge] as MotionValue<number>[],
    ([w = 0, h = 0, b = 0]: number[]) => {
      const r = BADGE_R * b;
      if (r < 1) return "";
      const cx = w / 2 + 4;
      const cy = 5;
      const end = nearestEnd(w, h, cx);
      return bridge(end.x, end.y, end.r, cx, cy, r, 1.2);
    },
  );
  const badgeR = useTransform(badge, (b) => r2(BADGE_R * clamp(b, 0, 1.4)));
  const badgeTextX = useTransform(shownW, (w) => r2(w / 2 + 4 - BADGE_R));
  const badgeScale = useTransform(badge, (b) => r2(clamp(b, 0, 1.4)));

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const runAnim = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // The shape: three springs from one stiffness, each its own rate and
  // damping, so the island never moves as a rigid box.
  React.useEffect(() => {
    const w = target.w === Infinity ? rest.w : target.w;
    if (!motionSafe) {
      const tween = { duration: durations.fast, ease: easings.enter };
      runAnim("w", animate(width, w, tween));
      runAnim("h", animate(height, target.h, tween));
      runAnim("r", animate(radius, target.r, tween));
      return;
    }
    runAnim("w", animate(width, w, spring(k, 0.62)));
    runAnim("h", animate(height, target.h, spring(k * 0.8, 0.72)));
    runAnim("r", animate(radius, target.r, spring(k * 0.55, 0.9)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.w, target.h, target.r, k, motionSafe]);

  React.useEffect(() => {
    // A bare set would lose to a spring still running from before the
    // switch; jump stops it.
    if (!motionSafe) {
      anims.current.get("spacer")?.stop();
      spacer.jump(spacerTo);
    } else runAnim("spacer", animate(spacer, spacerTo, springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacerTo, motionSafe]);

  // The count droplet: out when something waits at rest, swelling on each
  // new count.
  const showBadge = count > 0 && mode === "rest" && !quick;
  const badgeWas = React.useRef({ show: showBadge, count });
  React.useEffect(() => {
    const was = badgeWas.current;
    badgeWas.current = { show: showBadge, count };
    if (!showBadge) {
      runAnim(
        "badge",
        animate(badge, 0, { duration: durations.fast, ease: easings.exit }),
      );
      return;
    }
    if (!motionSafe) {
      runAnim("badge", animate(badge, 1, { duration: durations.fast }));
      return;
    }
    // Nothing new (a mount, a re-run): it only makes sure it is out.
    if (was.show && was.count === count) {
      if (badge.get() < 0.99) runAnim("badge", animate(badge, 1, springs.snap));
      return;
    }
    badge.set(r2(Math.max(badge.get(), 0.6) * 1.25));
    runAnim("badge", animate(badge, 1, springs.recoil));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBadge, count, motionSafe]);

  // An arrival flares the halo once.
  React.useEffect(() => {
    if (flare === 0) return;
    runAnim(
      "flash",
      animate(flash, [flash.get(), 1, 0], {
        duration: 1.1,
        times: [0, 0.14, 1],
        ease: easings.linear,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flare]);

  // A ringing call breathes — only on screen, in a visible page, with
  // motion allowed.
  const breathe =
    motionSafe &&
    onScreen &&
    !hidden &&
    kind === "call" &&
    !callData.connected &&
    mode === "rest" &&
    !quick;
  React.useEffect(() => {
    if (!breathe) {
      runAnim(
        "breath",
        animate(breath, 0, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    let up = false;
    const beat = () => {
      up = !up;
      runAnim("breath", animate(breath, up ? BREATH : 0, springs.drift));
    };
    beat();
    const timer = window.setInterval(beat, BREATH_EVERY / 2);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breathe]);

  // The banner stays a while, longer while it is pointed at or focused, and
  // not at all in a hidden page's clock.
  const [hover, setHover] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  React.useEffect(() => {
    if (!banner || hover || focusWithin || hidden) return;
    const t = window.setTimeout(() => setBanner(null), BANNER_FOR);
    return () => window.clearTimeout(t);
  }, [banner, hover, focusWithin, hidden]);

  // --- nodes and focus --------------------------------------------------------
  const islandRef = React.useRef<HTMLDivElement | null>(null);
  const pillRef = React.useRef<HTMLButtonElement | null>(null);
  const drops = React.useRef(new Map<IslandPillAction, HTMLButtonElement>());
  const rows = React.useRef(new Map<string, HTMLLIElement>());
  const chosen = React.useRef<IslandPillAction | null>(null);
  const focusGoal = React.useRef<FocusGoal>(null);
  const hold = React.useRef<{
    id: number;
    x: number;
    y: number;
    timer: number;
    fired: boolean;
  } | null>(null);
  const suppressClick = React.useRef(false);
  const detach = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);
  const [pillNode, setPillNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [cardNode, setCardNode] = React.useState<HTMLDivElement | null>(null);
  const [activeDrop, setActiveDrop] = React.useState(0);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);

  const bindPill = React.useCallback((node: HTMLButtonElement | null) => {
    pillRef.current = node;
    setPillNode(node);
  }, []);
  const bindDrop = React.useCallback(
    (id: IslandPillAction, node: HTMLButtonElement | null) => {
      if (node) drops.current.set(id, node);
      else drops.current.delete(id);
    },
    [],
  );

  // Focus that must move across a swap goes to the node when it arrives.
  React.useEffect(() => {
    if (focusGoal.current !== "pill" || !pillNode) return;
    focusGoal.current = null;
    pillNode.focus({ preventScroll: true });
  }, [pillNode]);
  React.useEffect(() => {
    if (focusGoal.current !== "card" || !cardNode) return;
    focusGoal.current = null;
    const first = cardNode.querySelector<HTMLElement>("[data-first]");
    (first ?? cardNode).focus({ preventScroll: true });
  }, [cardNode]);

  // The open card's height, measured on the node when it arrives.
  const bindCard = React.useCallback((node: HTMLDivElement | null) => {
    setCardNode(node);
    if (!node) return;
    const measure = () => setOpenH(Math.max(60, Math.ceil(node.offsetHeight)));
    measure();
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => setRootW(node.clientWidth));
    sizer.observe(node);
    setRootW(node.clientWidth);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindScreen = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setScreenH(Math.ceil(node.offsetHeight));
    measure();
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const pan = () => {
    const rect = islandRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  // --- changes ------------------------------------------------------------
  const setOpenTo = (next: boolean, focus: FocusGoal = null) => {
    if (disabled && next) return;
    if (next === open) return;
    const hadFocus = islandRef.current?.contains(document.activeElement);
    focusGoal.current = hadFocus || focus ? (next ? "card" : "pill") : null;
    setOpen(next);
    setQuick(false);
    setBanner(null);
    audio.play("pop", { pitch: next ? 1.2 : 0.85, gain: 0.5, pan: pan() });
    onExpandChange?.(next);
  };

  const openQuick = (focusFirst: boolean) => {
    if (disabled || open || quick) return;
    chosen.current = null;
    setBanner(null);
    setActiveDrop(0);
    focusGoal.current = focusFirst ? "menu" : null;
    setQuick(true);
  };

  const closeQuick = (focusPill: boolean) => {
    if (!quick) return;
    setQuick(false);
    if (focusPill) pillRef.current?.focus({ preventScroll: true });
  };

  const choose = (id: IslandPillAction) => {
    const action = actions.find((a) => a.id === id);
    if (!action || disabled) return;
    chosen.current = id;
    audio.play("click", { gain: 0.55, pan: pan() });
    setPolite((p) => ({ n: p.n + 1, text: `${action.label}.` }));
    onAction?.(id);
  };

  const chooseQuick = (id: IslandPillAction) => {
    choose(id);
    closeQuick(true);
  };

  const dismiss = (id: string) => {
    if (disabled) return;
    const index = notices.findIndex((n) => n.id === id);
    const neighbour = notices[index + 1] ?? notices[index - 1];
    const gone = notices[index];
    audio.play("click", { pitch: 0.8, gain: 0.45, pan: pan() });
    if (gone) {
      setPolite((p) => ({
        n: p.n + 1,
        text: `Dismissed: ${gone.title}. ${noticesText(count - 1)} left.`,
      }));
    }
    if (neighbour) {
      setActiveRow(neighbour.id);
      rows.current.get(neighbour.id)?.focus({ preventScroll: true });
    } else {
      cardNode
        ?.querySelector<HTMLElement>("[data-first]")
        ?.focus({ preventScroll: true });
    }
    onDismiss?.(id);
  };

  const endHold = () => {
    const h = hold.current;
    hold.current = null;
    detach.current?.();
    detach.current = null;
    if (h) window.clearTimeout(h.timer);
    runAnim(
      "inhale",
      animate(inhale, 0, motionSafe ? springs.flick : { duration: 0 }),
    );
  };

  React.useEffect(() => {
    api.current = { closeQuick, setOpenTo, endHold, openQuick };
  });

  // Quick actions that arrive by keyboard take focus on the first droplet.
  React.useEffect(() => {
    if (!quick || focusGoal.current !== "menu") return;
    focusGoal.current = null;
    const first = actions[0];
    const node = first ? drops.current.get(first.id) : undefined;
    node?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);

  // A press anywhere outside the island shrinks it and folds the droplets.
  React.useEffect(() => {
    if (!open && !quick) return;
    const onDown = (event: PointerEvent) => {
      const island = islandRef.current;
      if (!island) return;
      if (event.target instanceof Node && island.contains(event.target)) return;
      api.current?.closeQuick(false);
      api.current?.setOpenTo(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, quick]);

  // Anything that takes the page away ends a hold.
  React.useEffect(() => {
    const interrupted = () => api.current?.endHold();
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (!disabled) return;
    api.current?.endHold();
    api.current?.closeQuick(false);
    api.current?.setOpenTo(false);
  }, [disabled]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      detach.current?.();
      detach.current = null;
      if (hold.current) window.clearTimeout(hold.current.timer);
      hold.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
      inhale.set(0);
      breath.set(0);
    };
  }, [inhale, breath]);

  // --- the pill's press: a tap opens, a long press buds the actions ---------
  const onPillPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || open) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClick.current = false;
    endHold();
    const pointerId = event.pointerId;
    hold.current = {
      id: pointerId,
      x: event.clientX,
      y: event.clientY,
      fired: false,
      timer: window.setTimeout(() => {
        const h = hold.current;
        if (!h || h.id !== pointerId) return;
        h.fired = true;
        // The release that follows is not a tap.
        suppressClick.current = true;
        api.current?.openQuick(false);
      }, HOLD_MS),
    };
    if (!quick) {
      runAnim(
        "inhale",
        animate(inhale, motionSafe ? 1 : 0, {
          duration: HOLD_MS / 1000,
          ease: easings.linear,
        }),
      );
    }
    const move = (e: PointerEvent) => {
      const h = hold.current;
      if (!h || e.pointerId !== pointerId || h.fired) return;
      const slop = e.pointerType === "mouse" ? 4 : 9;
      if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > slop) {
        api.current?.endHold();
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointerId) api.current?.endHold();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    detach.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  };

  const onPillKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      if (quick) closeQuick(true);
      else openQuick(true);
      return;
    }
    if (event.key === "Escape" && (quick || mode === "banner")) {
      // Handled here, where focus is; the stage must not also see it.
      event.preventDefault();
      if (quick) closeQuick(true);
      else setBanner(null);
      return;
    }
    if (quick && (event.key === "ArrowDown" || event.key === "ArrowRight")) {
      event.preventDefault();
      const first = actions[0];
      if (first) drops.current.get(first.id)?.focus({ preventScroll: true });
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = actions.length;
    if (n === 0) return;
    const move = (to: number) => {
      const i = ((to % n) + n) % n;
      setActiveDrop(i);
      const a = actions[i];
      if (a) drops.current.get(a.id)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(activeDrop + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(activeDrop - 1);
        return;
      case "Home":
        event.preventDefault();
        move(0);
        return;
      case "End":
        event.preventDefault();
        move(n - 1);
        return;
      case "Escape":
      case "Tab":
        event.preventDefault();
        closeQuick(true);
        return;
    }
  };

  const onCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Handled where focus is, inside the card.
      event.preventDefault();
      event.stopPropagation();
      setOpenTo(false, "pill");
    }
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    id: string,
  ) => {
    const index = notices.findIndex((n) => n.id === id);
    const go = (to: number) => {
      const target = notices[clamp(to, 0, notices.length - 1)];
      if (!target) return;
      setActiveRow(target.id);
      rows.current.get(target.id)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "Delete":
      case "Backspace":
        event.preventDefault();
        dismiss(id);
        return;
      case "ArrowDown":
        event.preventDefault();
        go(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(index - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(notices.length - 1);
        return;
    }
  };

  // --- what the island says ---------------------------------------------------
  const pct = percentOf(uploadData.progress);
  const stateColor = STATE_COLOR[kind];
  const glowColor =
    mode === "banner" && bannerNotice
      ? TONE_COLOR[bannerNotice.tone ?? "info"]
      : stateColor;
  const halo =
    g > 0
      ? `0 0 ${r2(6 + 16 * g)}px ${r2(1 + 3 * g)}px color-mix(in oklab, ${glowColor} ${Math.round(16 + 44 * g)}%, transparent)`
      : "none";
  const flareHalo =
    g > 0
      ? `0 0 ${r2(14 + 18 * g)}px ${r2(3 + 5 * g)}px color-mix(in oklab, ${glowColor} ${Math.round(40 + 45 * g)}%, transparent)`
      : "none";

  const liveName =
    kind === "timer"
      ? `${timerData.label}, ${minutesOf(timerData.seconds)}, ${timerData.paused ? "paused" : "running"}`
      : kind === "upload"
        ? `${uploadData.name}, ${uploadData.paused ? "paused" : "uploading"}, ${Math.floor(pct / 10) * 10}%`
        : `${callData.caller}, ${callData.connected ? "on call" : "incoming call"}`;
  const pillName =
    mode === "banner" && bannerNotice
      ? `New notice: ${sentence(bannerNotice.title, bannerNotice.body)}. ${liveName}.`
      : `${liveName}.${count > 0 ? ` ${noticesText(count)}.` : ""}`;

  const cardTitle =
    kind === "timer"
      ? timerData.label
      : kind === "upload"
        ? uploadData.name
        : callData.caller;
  const cardSub =
    kind === "timer"
      ? timerData.paused
        ? "Paused"
        : "Running"
      : kind === "upload"
        ? uploadData.paused
          ? "Paused"
          : pct >= 100
            ? "Uploaded"
            : "Uploading"
        : (callData.detail ??
          (callData.connected ? "On call" : "Incoming call"));

  const glyph = (size: number) =>
    kind === "timer" ? (
      <Ring
        value={(timerData.seconds % 60) / 60}
        color={stateColor}
        size={size}
      >
        {timerData.paused ? (
          <span className="flex gap-[2px]" aria-hidden>
            <span className="h-[7px] w-[2px] rounded-full bg-current" />
            <span className="h-[7px] w-[2px] rounded-full bg-current" />
          </span>
        ) : null}
      </Ring>
    ) : kind === "upload" ? (
      <Ring value={uploadData.progress} color={stateColor} size={size}>
        <svg
          aria-hidden
          viewBox="0 0 10 10"
          className="size-[45%]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8.5V1.8M2.2 4.4 5 1.6l2.8 2.8" />
        </svg>
      </Ring>
    ) : (
      <Disc name={callData.caller} size={size} />
    );

  const contentMotion = motionSafe
    ? {
        initial: { opacity: 0, y: -distances.nudge },
        animate: {
          opacity: 1,
          y: 0,
          transition: { ...springs.snap, delay: 0.06 },
        },
        exit: { opacity: 0, transition: exitFor(durations.fast) },
      }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: durations.fast } },
        exit: { opacity: 0, transition: { duration: durations.fast } },
      };

  const fadeOnly = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: durations.fast } },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
  };

  const restContent = (
    <div className="flex h-full items-center gap-2.5 px-3">
      {kind === "timer" ? (
        <>
          {glyph(20)}
          <span
            className="ml-auto font-mono text-[15px] leading-none tabular-nums"
            style={{ color: stateColor }}
          >
            {clockOf(timerData.seconds)}
          </span>
        </>
      ) : kind === "upload" ? (
        <>
          {glyph(20)}
          <span className="min-w-0 flex-1 truncate text-left text-xs text-(--island-ink-2)">
            {uploadData.name}
          </span>
          <span
            className="font-mono text-[13px] leading-none tabular-nums"
            style={{ color: stateColor }}
          >
            {pct}%
          </span>
        </>
      ) : (
        <>
          <span className="-ml-1.5">{glyph(30)}</span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13px] leading-tight font-medium text-(--island-ink)">
              {callData.caller}
            </span>
            <span className="block truncate text-[11px] leading-tight text-(--island-ink-2)">
              {callData.detail ??
                (callData.connected ? "On call" : "Incoming call")}
            </span>
          </span>
          <span
            className="-mr-1.5 flex size-[30px] shrink-0 items-center justify-center rounded-full"
            style={{
              background: callData.connected
                ? "var(--island-danger)"
                : "var(--island-call)",
              color: "var(--island)",
            }}
          >
            <Icon name={callData.connected ? "end" : "answer"} />
          </span>
        </>
      )}
    </div>
  );

  const bannerContent = bannerNotice ? (
    <div className="flex h-full items-center gap-3 px-4">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: TONE_COLOR[bannerNotice.tone ?? "info"] }}
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] leading-snug font-medium text-(--island-ink)">
          {bannerNotice.title}
        </span>
        {bannerNotice.body ? (
          <span className="block truncate text-xs leading-snug text-(--island-ink-2)">
            {bannerNotice.body}
          </span>
        ) : null}
      </span>
      {count > 1 ? (
        <span className="shrink-0 font-mono text-[10px] text-(--island-ink-2) tabular-nums">
          +{count - 1}
        </span>
      ) : null}
    </div>
  ) : null;

  const openContent = (
    <div
      ref={bindCard}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onCardKeyDown}
      className="flex flex-col gap-2.5 p-3.5 outline-none"
    >
      <div className="flex items-center gap-3">
        {glyph(kind === "call" ? 32 : 28)}
        <div className="min-w-0 flex-1">
          <p
            id={titleId}
            className="truncate text-[13px] leading-tight font-medium text-(--island-ink)"
          >
            {cardTitle}
          </p>
          <p className="truncate text-[11px] leading-tight text-(--island-ink-2)">
            {cardSub}
          </p>
        </div>
        {kind === "call" ? null : (
          <span
            className="font-mono text-lg leading-none tabular-nums"
            style={{ color: stateColor }}
          >
            {kind === "timer" ? clockOf(timerData.seconds) : `${pct}%`}
          </span>
        )}
        <button
          type="button"
          aria-label="Shrink"
          aria-expanded
          onClick={() => setOpenTo(false, "pill")}
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-(--island-well) text-(--island-ink-2) transition-colors outline-none hover:text-(--island-ink)",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <Icon name="shrink" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <button
            key={a.id}
            type="button"
            data-first={i === 0 ? "" : undefined}
            disabled={disabled}
            onClick={() => choose(a.id)}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full bg-(--island-well) px-3 text-xs font-medium transition-[filter] outline-none hover:brightness-125",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
            style={{ color: toneOfAction(a.tone) }}
          >
            <Icon name={a.id} />
            {a.label}
          </button>
        ))}
      </div>
      {count > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-(--island-ink-2) uppercase">
            {noticesText(count)}
          </p>
          <ol
            aria-label="Notices"
            className="flex max-h-[64px] flex-col gap-0.5 overflow-y-auto overscroll-contain"
          >
            <AnimatePresence initial={false}>
              {notices.map((n, i) => {
                const rovingId = activeRow ?? notices[0]?.id;
                return (
                  <motion.li
                    key={n.id}
                    ref={(node: HTMLLIElement | null) => {
                      if (node) rows.current.set(n.id, node);
                      else rows.current.delete(n.id);
                    }}
                    tabIndex={
                      n.id === rovingId ||
                      (i === 0 && !notices.some((m) => m.id === rovingId))
                        ? 0
                        : -1
                    }
                    aria-label={sentence(n.title, n.body)}
                    aria-keyshortcuts="Delete"
                    onKeyDown={(event) => onRowKeyDown(event, n.id)}
                    onFocus={() => setActiveRow(n.id)}
                    initial={
                      motionSafe ? { opacity: 0, height: 0 } : { opacity: 0 }
                    }
                    animate={{ opacity: 1, height: 30 }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe ? springs.glide : { duration: durations.fast }
                    }
                    className={cn(
                      "flex shrink-0 items-center gap-2 overflow-clip rounded-2 pr-0.5 pl-2 outline-none",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: TONE_COLOR[n.tone ?? "info"] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      <span className="font-medium text-(--island-ink)">
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="text-(--island-ink-2)">
                          {" "}
                          · {n.body}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Dismiss ${n.title}`}
                      onClick={() => dismiss(n.id)}
                      className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--island-ink-2) outline-none hover:bg-(--island-well) hover:text-(--island-ink)"
                    >
                      <span className="scale-75">
                        <Icon name="dismiss" />
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </div>
      ) : null}
    </div>
  );

  const contentWidth = target.w === Infinity ? rest.w : target.w;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate w-full overflow-clip",
        disabled && "opacity-50",
        className,
      )}
      style={PALETTE}
    >
      <div aria-hidden style={{ height: STRIP }} />
      <div ref={bindScreen}>{children}</div>
      <motion.div aria-hidden style={{ height: spacer }} />

      <div
        ref={islandRef}
        role="region"
        aria-label={label}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setFocusWithin(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFocusWithin(false);
        }}
        className="absolute left-1/2 z-10 -translate-x-1/2 select-none [-webkit-touch-callout:none]"
        style={{ top: TOP }}
      >
        <motion.div className="relative" style={{ width: shownW, height }}>
          {/* The liquid: the halo, the arrival's flare, and the body. */}
          <motion.div
            aria-hidden
            className="absolute inset-0 transition-shadow duration-300"
            style={{
              borderRadius: radius,
              scaleX: fillScaleX,
              scaleY: fillScaleY,
              background: "var(--island)",
              boxShadow: halo,
            }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              borderRadius: radius,
              boxShadow: flareHalo,
              opacity: flash,
            }}
          />

          {/* The count droplet, fused to the right end. */}
          <svg
            aria-hidden
            width={1}
            height={1}
            className="pointer-events-none absolute top-0 left-1/2 overflow-visible"
          >
            {motionSafe ? (
              <motion.path d={badgePath} style={{ fill: "var(--island)" }} />
            ) : null}
            <motion.circle
              cx={badgeCx}
              cy={5}
              r={badgeR}
              style={{ fill: "var(--island)" }}
            />
          </svg>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-[-4px] left-1/2 flex items-center justify-center font-mono text-[10px] leading-none font-medium text-(--island-ink) tabular-nums"
            style={{
              x: badgeTextX,
              width: BADGE_R * 2,
              height: BADGE_R * 2,
              scale: badgeScale,
              opacity: badgeScale,
            }}
          >
            {Math.min(99, count)}
          </motion.span>

          {/* What the island shows, clipped by its own shape. */}
          <motion.div
            className="absolute inset-0 overflow-clip"
            style={{ borderRadius: radius }}
          >
            <AnimatePresence initial={false}>
              {mode === "open" ? (
                <motion.div
                  key="open"
                  className="absolute top-0 left-1/2 -translate-x-1/2"
                  style={{ width: contentWidth }}
                  {...contentMotion}
                >
                  {openContent}
                </motion.div>
              ) : (
                <motion.div
                  key="pill"
                  className="absolute inset-0"
                  {...fadeOnly}
                >
                  {/* One button through rest, banner and every state, so
                      focus on it survives the content changing inside. */}
                  <button
                    ref={bindPill}
                    type="button"
                    disabled={disabled}
                    aria-label={pillName}
                    aria-expanded={false}
                    aria-describedby={hintId}
                    onPointerDown={onPillPointerDown}
                    onKeyDown={onPillKeyDown}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      if (quick) {
                        closeQuick(true);
                        return;
                      }
                      setOpenTo(true);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (hold.current && !hold.current.fired) return;
                      if (!hold.current) openQuick(false);
                    }}
                    className={cn(
                      "relative block size-full touch-manipulation rounded-[inherit] outline-none",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      "enabled:cursor-pointer disabled:cursor-not-allowed",
                    )}
                  >
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={`${mode}-${kind}-${banner ?? ""}`}
                        className="absolute top-0 left-1/2 block -translate-x-1/2"
                        style={{ width: contentWidth, height: target.h }}
                        {...contentMotion}
                      >
                        {mode === "banner" ? bannerContent : restContent}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Quick actions, budded off the bottom as droplets. */}
          <div
            role={quick ? "menu" : undefined}
            aria-label={quick ? `${cardTitle} actions` : undefined}
            aria-orientation={quick ? "horizontal" : undefined}
            onKeyDown={onMenuKeyDown}
            className="pointer-events-none absolute inset-x-0 top-0"
          >
            <AnimatePresence>
              {quick
                ? actions.map((a, i) => (
                    <Droplet
                      key={a.id}
                      action={a}
                      index={i}
                      count={actions.length}
                      pillW={shownW}
                      pillH={height}
                      motionSafe={motionSafe}
                      active={i === activeDrop}
                      chosen={chosen}
                      bind={bindDrop}
                      onChoose={chooseQuick}
                      onHover={setActiveDrop}
                      onBud={(index) =>
                        audio.play("pop", {
                          pitch: r2(1 + index * 0.12),
                          gain: 0.45,
                          pan: pan(),
                        })
                      }
                    />
                  ))
                : null}
            </AnimatePresence>
          </div>
        </motion.div>

        <p id={hintId} className="sr-only">
          Press to open. Press and hold, or press Shift+F10, for quick actions.
        </p>
      </div>

      <p role="status" className="sr-only">
        <span key={polite.n}>{polite.text}</span>
      </p>
      <p role="alert" className="sr-only">
        <span key={urgent.n}>{urgent.text}</span>
      </p>
    </div>
  );
}
