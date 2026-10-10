"use client";

import * as React from "react";

import { Check, Trash2, X } from "lucide-react";
import {
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

export type FuseConfirmColor = "ember" | "ruby" | "gold" | "cobalt";
export type FuseConfirmSize = "sm" | "md" | "lg";
type Phase = "idle" | "lit" | "fired";

export type FuseConfirmProps = {
  /** What the button does. Its text and accessible name at rest. */
  label: string;
  /** The text while the fuse burns, beside the countdown. @default "Cancel" */
  cancelLabel?: string;
  /** The text once the action has fired. @default "Done" */
  firedLabel?: string;
  /** Controlled: whether the fuse is burning. */
  lit?: boolean;
  /** Light the fuse on mount when uncontrolled. @default false */
  defaultLit?: boolean;
  /** Fires from the press that lit or put out the fuse, and with false when it fires. */
  onLitChange?: (lit: boolean) => void;
  /** Called once, when the spark gets back to the start. */
  onConfirm?: () => void;
  /** Called when a burning fuse is put out. */
  onCancel?: () => void;
  /** How long the fuse burns, in seconds. @default 4 */
  time?: number;
  /** How fierce the spark is, 0 to 1: its glow, rays and smoke. @default 0.6 */
  spark?: number;
  /** The fire's colour: a named pigment or any CSS colour. @default "ember" */
  color?: FuseConfirmColor | (string & {});
  /** Smoke rises from the spark as it burns. @default true */
  smoke?: boolean;
  /** How long the fired state shows before a fresh fuse is laid, in ms; 0 keeps it. @default 2200 */
  resetAfter?: number;
  /** The icon beside the label at rest. @default a bin */
  icon?: React.ReactNode;
  /** The spoken countdown. @default "3 seconds left" */
  remainingText?: (seconds: number) => string;
  /** @default "md" */
  size?: FuseConfirmSize;
  /** A sizzle while it burns and a pop when it fires. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Pigments at a fixed lightness, from the theme's own hues, so the fire is
 * the same on a light page as on a dark one.
 */
const PALETTE: Record<FuseConfirmColor, string> = {
  ember: "oklch(from var(--warn) 0.74 0.17 calc(h - 28))",
  ruby: "oklch(from var(--danger) 0.66 0.2 h)",
  gold: "oklch(from var(--warn) 0.83 0.15 h)",
  cobalt: "oklch(from var(--accent-bright) 0.7 0.16 h)",
};

type Geometry = {
  height: number;
  line: number;
  radius: number;
  wick: number;
  text: string;
  icon: string;
  pad: string;
};

const SIZES: Record<FuseConfirmSize, Geometry> = {
  sm: {
    height: 32,
    line: 16,
    radius: 9,
    wick: 5,
    text: "text-xs",
    icon: "size-3.5",
    pad: "px-3",
  },
  md: {
    height: 40,
    line: 20,
    radius: 11,
    wick: 6,
    text: "text-sm",
    icon: "size-4",
    pad: "px-4",
  },
  lg: {
    height: 48,
    line: 22,
    radius: 13,
    wick: 7,
    text: "text-[15px]",
    icon: "size-[18px]",
    pad: "px-5",
  },
};

/** Room around the button for the wick, the smoke and the burst. */
const FRAME = 12;
const PUFFS = 14;
const STREAKS = 10;
const HOT = 14;
const PUFF_LIFE = 1100;
const BURST_LIFE = 420;
const FLASH_LIFE = 620;
const STAMP_LIFE = 220;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** A stable 0–1 from two integers (unsigned shifts, so never negative). */
const hash = (a: number, b: number) =>
  (((Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663)) >>> 0) % 1000) /
  1000;

const SPRAY = Array.from({ length: STREAKS }, (_, i) => ({
  // Out of the start, away from the button: a fan round the left.
  angle:
    Math.PI + (i / (STREAKS - 1) - 0.5) * 2.8 + (hash(i, 1509) - 0.5) * 0.3,
  reach: 0.65 + 0.55 * hash(i, 77),
}));

type Seg =
  | {
      kind: "line";
      ax: number;
      ay: number;
      bx: number;
      by: number;
      len: number;
    }
  | {
      kind: "arc";
      cx: number;
      cy: number;
      r: number;
      a0: number;
      a1: number;
      len: number;
    };

type Cord = {
  d: string;
  segs: Seg[];
  length: number;
  startX: number;
  startY: number;
};

/**
 * The fuse: a curled wick into the button's left-centre, then once round the
 * edge clockwise and back to the start. Built from lines and arcs so a point
 * at any length along it is exact, and the same length drives the dashes.
 */
function buildCord(w: number, h: number, radius: number, wick: number): Cord {
  const x0 = FRAME + 1;
  const y0 = FRAME + 1;
  const x1 = FRAME + w - 1;
  const y1 = FRAME + h - 1;
  const r = Math.max(1, Math.min(radius - 1, (h - 2) / 2));
  const ym = FRAME + h / 2;
  const q = Math.PI / 2;
  const line = (ax: number, ay: number, bx: number, by: number): Seg => ({
    kind: "line",
    ax,
    ay,
    bx,
    by,
    len: Math.hypot(bx - ax, by - ay),
  });
  const arc = (
    cx: number,
    cy: number,
    rr: number,
    a0: number,
    a1: number,
  ): Seg => ({
    kind: "arc",
    cx,
    cy,
    r: rr,
    a0,
    a1,
    len: rr * Math.abs(a1 - a0),
  });
  const segs: Seg[] = [
    arc(x0 - wick, ym, wick, q, 0),
    line(x0, ym, x0, y0 + r),
    arc(x0 + r, y0 + r, r, 2 * q, 3 * q),
    line(x0 + r, y0, x1 - r, y0),
    arc(x1 - r, y0 + r, r, 3 * q, 4 * q),
    line(x1, y0 + r, x1, y1 - r),
    arc(x1 - r, y1 - r, r, 0, q),
    line(x1 - r, y1, x0 + r, y1),
    arc(x0 + r, y1 - r, r, q, 2 * q),
    line(x0, y1 - r, x0, ym),
  ];
  const f = (v: number) => r2(v);
  let d = `M${f(x0 - wick)} ${f(ym + wick)}`;
  for (const s of segs) {
    if (s.kind === "line") d += `L${f(s.bx)} ${f(s.by)}`;
    else {
      const ex = s.cx + s.r * Math.cos(s.a1);
      const ey = s.cy + s.r * Math.sin(s.a1);
      d += `A${f(s.r)} ${f(s.r)} 0 0 ${s.a1 > s.a0 ? 1 : 0} ${f(ex)} ${f(ey)}`;
    }
  }
  const length = segs.reduce((sum, s) => sum + s.len, 0);
  return { d, segs, length, startX: x0, startY: ym };
}

/** The point at a length along the cord, and which way the cord runs there. */
function pointAt(cord: Cord, at: number) {
  let left = Math.max(0, at);
  for (const s of cord.segs) {
    if (left <= s.len || s === cord.segs[cord.segs.length - 1]) {
      const t = s.len > 0 ? Math.min(1, left / s.len) : 0;
      if (s.kind === "line") {
        const dx = (s.bx - s.ax) / (s.len || 1);
        const dy = (s.by - s.ay) / (s.len || 1);
        return {
          x: s.ax + (s.bx - s.ax) * t,
          y: s.ay + (s.by - s.ay) * t,
          dx,
          dy,
        };
      }
      const a = s.a0 + (s.a1 - s.a0) * t;
      const dir = Math.sign(s.a1 - s.a0);
      return {
        x: s.cx + s.r * Math.cos(a),
        y: s.cy + s.r * Math.sin(a),
        dx: -Math.sin(a) * dir,
        dy: Math.cos(a) * dir,
      };
    }
    left -= s.len;
  }
  return { x: cord.startX, y: cord.startY, dx: 0, dy: -1 };
}

type Burn = {
  phase: Phase;
  /** Milliseconds burned before the current run. */
  elapsed: number;
  /** When the current run started; null while paused (hidden page). */
  since: number | null;
  byUser: boolean;
  litAt: number;
  firedAt: number;
  stampedAt: number;
  stampAt: number;
  /** When a fresh cord began fading in. */
  laidAt: number;
  lastPuff: number;
  nextPuff: number;
  frame: number;
  hover: boolean;
};

type Puff = { born: number; x: number; y: number; seed: number; big: number };

type Nodes = {
  svg: SVGSVGElement | null;
  mask: SVGPathElement | null;
  cord: SVGGElement | null;
  base: SVGPathElement | null;
  twist: SVGPathElement | null;
  ash: SVGPathElement | null;
  hot: SVGPathElement | null;
  flash: SVGPathElement | null;
  spark: SVGGElement | null;
  glow: SVGCircleElement | null;
  rays: SVGPathElement | null;
  core: SVGCircleElement | null;
  burst: SVGPathElement | null;
  puffs: (SVGCircleElement | null)[];
};

function CountWheel({
  count,
  line,
}: {
  count: MotionValue<number>;
  line: number;
}) {
  const y = useTransform(count, (c) =>
    r2(-(((Math.max(0, c) % 10) + 10) % 10) * line),
  );
  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ width: "1ch", height: line }}
    >
      <motion.span
        className="absolute top-0 left-0 flex flex-col"
        style={{ y }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n, i) => (
          <span
            key={i}
            className="block text-center"
            style={{ width: "1ch", height: line, lineHeight: `${line}px` }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A destructive button with an undo window you can see. One press lights the
 * fuse that is its edge: the spark catches at the tip of a little wick, runs
 * onto the edge and burns once round it in `time` seconds, consuming the cord
 * to ash behind it while a thin trail of smoke rises and the face counts the
 * seconds down. When the spark gets back to the start the action fires with a
 * small burst of streaks and a flash along the spent cord — small, because a
 * deletion never celebrates. Pressing again (or Escape) stamps it out: the
 * spark squashes flat under a puff of smoke and the cord is re-laid back to
 * the wick on the glide spring.
 *
 * The burn keeps its own clock. It pauses while the page is hidden, so the
 * action never fires unseen, and keeps time while scrolled away, when the
 * drawing loop sleeps and a timer fires it. It is a native button; a polite
 * live region announces the lighting, the last seconds, and the outcome.
 * Under reduced motion the cord still burns down — its length is the
 * countdown — but without the travelling spark, smoke or burst.
 */
export function FuseConfirm({
  label,
  cancelLabel = "Cancel",
  firedLabel = "Done",
  lit,
  defaultLit = false,
  onLitChange,
  onConfirm,
  onCancel,
  time = 4,
  spark = 0.6,
  color = "ember",
  smoke = true,
  resetAfter = 2200,
  icon,
  remainingText,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: FuseConfirmProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `fuse-mask-${uid}`;
  const glowId = `fuse-glow-${uid}`;
  const smokeId = `fuse-smoke-${uid}`;
  const hintId = `fuse-hint-${uid}`;
  const g = SIZES[size] ?? SIZES.md;
  const seconds = Math.max(0.5, time);
  const fire = PALETTE[color as FuseConfirmColor] ?? color;
  const say =
    remainingText ?? ((s: number) => `${s} second${s === 1 ? "" : "s"} left`);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [ready, setReady] = React.useState(false);
  const [said, setSaid] = React.useState("");
  const [check, setCheck] = React.useState(0);
  const count = useMotionValue(Math.ceil(seconds));
  const relay = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const nodes = React.useRef<Nodes>({
    svg: null,
    mask: null,
    cord: null,
    base: null,
    twist: null,
    ash: null,
    hot: null,
    flash: null,
    spark: null,
    glow: null,
    rays: null,
    core: null,
    burst: null,
    puffs: [],
  });
  const cord = React.useRef<Cord | null>(null);
  const burn = React.useRef<Burn>({
    phase: "idle",
    elapsed: 0,
    since: null,
    byUser: false,
    litAt: 0,
    firedAt: 0,
    stampedAt: 0,
    stampAt: 0,
    laidAt: 0,
    lastPuff: 0,
    nextPuff: 0,
    frame: 0,
    hover: false,
  });
  const puffs = React.useRef<Puff[]>(
    Array.from({ length: PUFFS }, () => ({
      born: -1e9,
      x: 0,
      y: 0,
      seed: 0,
      big: 0,
    })),
  );
  const raf = React.useRef(0);
  const onScreen = React.useRef(true);
  const timers = React.useRef({ fire: 0, second: 0, reset: 0 });
  const sizzle = React.useRef<LoopHandle | null>(null);
  const relayAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const countAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const api = React.useRef<{
    paint: (now: number) => boolean;
    fire: () => void;
    tick: (secs: number) => void;
    pause: () => void;
    resume: () => void;
    light: (byUser: boolean) => void;
    stamp: (byUser: boolean) => void;
    measure: () => void;
    schedule: () => void;
  } | null>(null);

  const duration = seconds * 1000;
  const elapsedAt = (now: number) => {
    const b = burn.current;
    return b.elapsed + (b.since === null ? 0 : now - b.since);
  };

  const kick = () => {
    if (raf.current || !onScreen.current || document.hidden) return;
    const step = (now: number) => {
      raf.current = 0;
      const more = api.current?.paint(now) ?? false;
      if (more && onScreen.current && !document.hidden) {
        raf.current = window.requestAnimationFrame(step);
      }
    };
    raf.current = window.requestAnimationFrame(step);
  };

  const clearTimers = () => {
    window.clearTimeout(timers.current.fire);
    window.clearTimeout(timers.current.second);
  };

  const stopSizzle = () => {
    sizzle.current?.stop();
    sizzle.current = null;
  };

  const panOfButton = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const startSizzle = () => {
    if (sizzle.current || !burn.current.byUser) return;
    sizzle.current = audio.start("sizzle", {
      gain: r2(lerp(0.35, 0.75, spark)),
      pitch: r2(0.85 + 0.3 * spark),
      pan: panOfButton(),
    });
  };

  const showCount = (secs: number, jump: boolean) => {
    countAnim.current?.stop();
    if (jump || !motionSafe) count.jump(secs);
    else countAnim.current = animate(count, secs, springs.snap);
  };

  /** Arms the timers for the next whole second and for the end. */
  const schedule = () => {
    clearTimers();
    const b = burn.current;
    if (b.phase !== "lit" || b.since === null) return;
    const left = duration - elapsedAt(performance.now());
    if (left <= 0) {
      api.current?.fire();
      return;
    }
    timers.current.fire = window.setTimeout(() => api.current?.fire(), left);
    const secs = Math.ceil(left / 1000 - 1e-6);
    if (secs > 1) {
      const until = left - (secs - 1) * 1000;
      timers.current.second = window.setTimeout(
        () => api.current?.tick(secs - 1),
        Math.max(0, until),
      );
    }
  };

  const tickSecond = (secs: number) => {
    showCount(secs, false);
    if (secs <= 3) setSaid(say(secs));
    sizzle.current?.set({
      pitch: r2(0.85 + 0.3 * spark + (1 - secs / seconds) * 0.25),
    });
    schedule();
  };

  const light = (byUser: boolean) => {
    const b = burn.current;
    if (b.phase === "lit") return;
    window.clearTimeout(timers.current.reset);
    relayAnim.current?.stop();
    relay.jump(0);
    const now = performance.now();
    b.phase = "lit";
    b.elapsed = 0;
    b.since = document.hidden ? null : now;
    b.byUser = byUser;
    b.litAt = now;
    b.laidAt = 0;
    b.nextPuff = now;
    setPhase("lit");
    const secs = Math.ceil(seconds);
    showCount(secs, true);
    setSaid(`Fuse lit. ${label} in ${secs} second${secs === 1 ? "" : "s"}.`);
    if (byUser) {
      startSizzle();
      onLitChange?.(true);
    }
    schedule();
    kick();
  };

  const fireNow = () => {
    const b = burn.current;
    if (b.phase !== "lit") return;
    clearTimers();
    b.phase = "fired";
    b.firedAt = performance.now();
    b.since = null;
    setPhase("fired");
    setSaid(`${firedLabel}.`);
    stopSizzle();
    if (b.byUser)
      audio.play("pop", { pitch: 0.8, gain: 0.6, pan: panOfButton() });
    onLitChange?.(false);
    onConfirm?.();
    if (resetAfter > 0) {
      timers.current.reset = window.setTimeout(() => {
        const now = burn.current;
        if (now.phase !== "fired") return;
        now.phase = "idle";
        now.elapsed = 0;
        now.laidAt = performance.now();
        relay.jump(0);
        setPhase("idle");
        kick();
      }, resetAfter);
    }
    kick();
  };

  const stamp = (byUser: boolean) => {
    const b = burn.current;
    if (b.phase !== "lit") return;
    clearTimers();
    const length = cord.current?.length ?? 0;
    const now = performance.now();
    const at = length * clamp01(elapsedAt(now) / duration);
    b.phase = "idle";
    b.since = null;
    b.elapsed = 0;
    b.stampedAt = now;
    b.stampAt = at;
    setPhase("idle");
    setSaid("Put out.");
    stopSizzle();
    if (byUser)
      audio.play("pop", { pitch: 0.45, gain: 0.4, pan: panOfButton() });
    if (motionSafe) {
      // The puff of smoke where the foot came down.
      const spot = cord.current ? pointAt(cord.current, at) : null;
      if (spot) {
        for (let i = 0; i < 5; i += 1) {
          const p = puffs.current[(b.frame + i) % PUFFS];
          if (!p) continue;
          p.born = now - i * 30;
          p.x = spot.x + (i - 2) * 2.2;
          p.y = spot.y;
          p.seed = i * 7 + 3;
          p.big = 1;
        }
      }
      relay.jump(at);
      relayAnim.current?.stop();
      relayAnim.current = animate(relay, 0, { ...springs.glide, delay: 0.12 });
    } else {
      relay.jump(0);
      b.laidAt = now;
    }
    // A host that put it out already knows; only the visitor's press reports.
    if (byUser) {
      onLitChange?.(false);
      onCancel?.();
    }
    kick();
  };

  const pause = () => {
    const b = burn.current;
    clearTimers();
    if (b.since !== null) {
      b.elapsed += performance.now() - b.since;
      b.since = null;
    }
    stopSizzle();
    window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  const resume = () => {
    const b = burn.current;
    if (b.phase === "lit" && b.since === null) {
      b.since = performance.now();
      startSizzle();
      schedule();
    }
    kick();
  };

  const measure = () => {
    const button = buttonRef.current;
    if (!button) return;
    const w = button.offsetWidth;
    const h = button.offsetHeight;
    if (w <= 0 || h <= 0) return;
    const c = buildCord(w, h, g.radius, g.wick);
    cord.current = c;
    const n = nodes.current;
    const total = String(r2(c.length + 20));
    for (const el of [n.mask, n.base, n.twist, n.ash, n.hot, n.flash]) {
      el?.setAttribute("d", c.d);
    }
    n.ash?.setAttribute("stroke-dasharray", `0 ${total}`);
    setReady(true);
  };

  const paint = (now: number) => {
    const c = cord.current;
    const n = nodes.current;
    if (!c || !n.svg) return false;
    const b = burn.current;
    b.frame += 1;
    const L = c.length;
    const total = r2(L + 20);
    let live = false;
    let s = 0;
    if (b.phase === "lit") {
      s = L * clamp01(elapsedAt(now) / duration);
      live = true;
    } else if (b.phase === "fired") s = L;
    else {
      s = relay.get();
      if (relay.isAnimating()) live = true;
    }

    // A fresh cord (after firing, or re-laid under reduced motion) fades in.
    let fresh = 1;
    if (b.phase === "idle" && b.laidAt > 0) {
      fresh = clamp01((now - b.laidAt) / 420);
      if (fresh < 1) live = true;
    }
    n.cord?.setAttribute("opacity", String(r2(fresh)));
    n.mask?.setAttribute(
      "stroke-dasharray",
      `${r2(Math.max(0, L - s))} ${total}`,
    );
    n.mask?.setAttribute("stroke-dashoffset", String(r2(-s)));
    n.ash?.setAttribute("stroke-dasharray", `${r2(s)} ${total}`);
    n.ash?.setAttribute("opacity", s > 0.5 ? "1" : "0");

    const stampedAge = now - b.stampedAt;
    const stamping =
      b.phase === "idle" && stampedAge < STAMP_LIFE && motionSafe;
    const burning = b.phase === "lit";
    const hot = Math.min(HOT, s);
    n.hot?.setAttribute("stroke-dasharray", `${r2(hot)} ${total}`);
    n.hot?.setAttribute("stroke-dashoffset", String(r2(-(s - hot))));
    n.hot?.setAttribute("opacity", burning && hot > 0.5 ? "0.85" : "0");

    // The spark itself.
    const k = clamp01(spark);
    if (burning || stamping || (b.hover && b.phase === "idle" && s < 0.5)) {
      const at = burning ? s : stamping ? b.stampAt : 0;
      const pt = pointAt(c, at);
      n.spark?.setAttribute("transform", `translate(${r2(pt.x)} ${r2(pt.y)})`);
      let glow = 4 + 6 * k;
      let sx = 1;
      let sy = 1;
      let alpha = 1;
      if (burning && motionSafe) {
        const age = now - b.litAt;
        const flare = age < 260 ? 1 + 0.9 * Math.sin((Math.PI * age) / 260) : 1;
        glow *= flare * (0.88 + 0.24 * hash(b.frame, 3));
      } else if (stamping) {
        const t = clamp01(stampedAge / STAMP_LIFE);
        sx = 1 + 0.9 * t;
        sy = Math.max(0.05, 1 - t);
        alpha = 1 - t;
        live = true;
      } else if (!burning) {
        // Hovered: an ember waits at the wick's tip.
        glow = 2.5 + 2 * k;
        alpha = 0.55;
      }
      n.glow?.setAttribute("r", String(r2(glow)));
      n.spark?.setAttribute("opacity", String(r2(alpha)));
      n.glow?.setAttribute("transform", `scale(${r2(sx)} ${r2(sy)})`);
      n.core?.setAttribute("transform", `scale(${r2(sx)} ${r2(sy)})`);
      if (burning && motionSafe) {
        const rays = 2 + Math.round(4 * k);
        let d = "";
        for (let j = 0; j < rays; j += 1) {
          const a = b.frame * 0.9 + j * 2.1 + hash(b.frame, j) * 1.4;
          const len = (1.5 + 5 * k) * (0.35 + 0.65 * hash(j, b.frame));
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          d += `M${r2(cx * 1.6)} ${r2(cy * 1.6)}L${r2(cx * (1.6 + len))} ${r2(cy * (1.6 + len))}`;
        }
        n.rays?.setAttribute("d", d);
      } else n.rays?.setAttribute("d", "");
    } else {
      n.spark?.setAttribute("opacity", "0");
    }

    // Smoke: a thin trail off the burning spark, recycled puffs only.
    if (burning && smoke && motionSafe && now >= b.nextPuff) {
      const pt = pointAt(c, s);
      const p = puffs.current[b.frame % PUFFS];
      if (p) {
        p.born = now;
        p.x = pt.x;
        p.y = pt.y;
        p.seed = b.frame;
        p.big = 0;
      }
      b.nextPuff = now + lerp(120, 60, k);
    }
    puffs.current.forEach((p, i) => {
      const el = n.puffs[i];
      if (!el) return;
      const t = (now - p.born) / (PUFF_LIFE * (p.big ? 1.25 : 1));
      if (t < 0 || t >= 1 || !motionSafe) {
        el.setAttribute("opacity", "0");
        return;
      }
      live = true;
      const ease = 1 - (1 - t) * (1 - t);
      const sway = Math.sin(t * 4 + hash(p.seed, 5) * 6) * (2 + 2 * t);
      el.setAttribute("cx", String(r2(p.x + sway)));
      el.setAttribute("cy", String(r2(p.y - (10 + 4 * p.big) * ease)));
      el.setAttribute(
        "r",
        String(r2((2.2 + (5 + 3 * p.big) * t) * (0.7 + 0.5 * k))),
      );
      el.setAttribute(
        "opacity",
        String(
          r2((p.big ? 0.9 : 0.7) * Math.pow(1 - t, 1.4) * (0.6 + 0.5 * k)),
        ),
      );
    });

    // The finish: a small spray from the start and a flash along the cord.
    const firedAge = now - b.firedAt;
    if (b.phase === "fired" && firedAge < BURST_LIFE && motionSafe) {
      const t = clamp01(firedAge / BURST_LIFE);
      const out = 1 - Math.pow(1 - t, 3);
      let d = "";
      for (const st of SPRAY) {
        const reach = (4 + 13 * out) * st.reach * (0.7 + 0.5 * k);
        const len = 4.5 * (1 - t) * st.reach;
        const cx = Math.cos(st.angle);
        const cy = Math.sin(st.angle);
        d += `M${r2(c.startX + cx * reach)} ${r2(c.startY + cy * reach)}L${r2(c.startX + cx * (reach + len))} ${r2(c.startY + cy * (reach + len))}`;
      }
      n.burst?.setAttribute("d", d);
      n.burst?.setAttribute("opacity", String(r2(1 - t)));
      live = true;
    } else n.burst?.setAttribute("opacity", "0");
    if (b.phase === "fired" && firedAge < FLASH_LIFE) {
      const t = clamp01(firedAge / FLASH_LIFE);
      n.flash?.setAttribute("opacity", String(r2(0.9 * (1 - t) * (1 - t))));
      live = true;
    } else n.flash?.setAttribute("opacity", "0");

    return live;
  };

  React.useEffect(() => {
    api.current = {
      paint,
      fire: fireNow,
      tick: tickSecond,
      pause,
      resume,
      light,
      stamp,
      measure,
      schedule,
    };
  });

  // A new fuse length mid-burn: the timers follow the spark from where it is.
  React.useEffect(() => {
    if (burn.current.phase === "lit") api.current?.schedule();
  }, [seconds]);

  // Geometry, visibility and the page: the burn's clock lives here.
  React.useEffect(() => {
    const root = rootRef.current;
    const button = buttonRef.current;
    if (!root || !button) return;
    const ro = new ResizeObserver(() => {
      api.current?.measure();
      const now = performance.now();
      api.current?.paint(now);
    });
    ro.observe(button);
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen.current = entry?.isIntersecting ?? true;
        if (onScreen.current) api.current?.resume();
      },
      { rootMargin: "40px" },
    );
    io.observe(root);
    const onVisibility = () => {
      if (document.hidden) api.current?.pause();
      else api.current?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    api.current?.resume();
    const t = timers.current;
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current?.pause();
      window.clearTimeout(t.reset);
    };
  }, []);

  React.useEffect(
    () => () => {
      relayAnim.current?.stop();
      countAnim.current?.stop();
    },
    [],
  );

  // What the host says. A press acts at once and reports; a host that
  // refuses gets its own state back on the next check.
  const wanted = lit ?? defaultLit;
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (lit === undefined && seeded.current) return;
    seeded.current = true;
    const b = burn.current;
    if (wanted && b.phase !== "lit") api.current?.light(false);
    if (!wanted && b.phase === "lit") api.current?.stamp(false);
    // `defaultLit` only seeds the first state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit, check]);

  React.useEffect(() => {
    if (disabled && burn.current.phase === "lit") api.current?.stamp(false);
  }, [disabled]);

  const busy = phase === "fired";
  const press = () => {
    if (disabled || busy) return;
    const b = burn.current;
    if (b.phase === "lit") stamp(true);
    else light(true);
    if (lit !== undefined) React.startTransition(() => setCheck((c) => c + 1));
  };

  const line = g.line;
  const faceMotion = (shown: boolean) => ({
    opacity: shown ? 1 : 0,
    y: motionSafe ? (shown ? 0 : distances.nudge) : 0,
  });
  const faceTransition = motionSafe
    ? {
        ...springs.snap,
        opacity: { duration: durations.fast, ease: easings.enter },
      }
    : { duration: durations.fast };

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-flex", className)}
      style={
        { padding: FRAME, ["--fuse" as string]: fire } as React.CSSProperties
      }
    >
      <span id={hintId} className="sr-only">
        Press to light the fuse. Press again, or Escape, to put it out.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-describedby={hintId}
        aria-disabled={busy || undefined}
        disabled={disabled}
        onClick={press}
        onKeyDown={(event) => {
          if (event.key === "Escape" && burn.current.phase === "lit") {
            // Handled here, where focus is; the stage must not also see it.
            event.preventDefault();
            stamp(true);
            if (lit !== undefined)
              React.startTransition(() => setCheck((c) => c + 1));
          }
        }}
        onPointerEnter={() => {
          burn.current.hover = true;
          api.current?.paint(performance.now());
        }}
        onPointerLeave={() => {
          burn.current.hover = false;
          api.current?.paint(performance.now());
        }}
        onFocus={() => {
          burn.current.hover = true;
          api.current?.paint(performance.now());
        }}
        onBlur={() => {
          burn.current.hover = false;
          api.current?.paint(performance.now());
        }}
        whileTap={
          motionSafe && !disabled && !busy ? { scale: 0.97 } : undefined
        }
        transition={springs.flick}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center border-2 font-medium whitespace-nowrap transition-colors outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          g.text,
          g.pad,
          ready ? "border-transparent" : "border-ink-3/45",
          phase === "lit"
            ? "bg-[color-mix(in_oklab,var(--danger)_9%,var(--card))] text-foreground"
            : phase === "fired"
              ? "cursor-default bg-[color-mix(in_oklab,var(--danger)_12%,var(--card))] text-danger"
              : "bg-card text-foreground hover:bg-surface-2",
          disabled
            ? "cursor-not-allowed opacity-50"
            : phase !== "fired" && "cursor-pointer",
        )}
        style={{ height: g.height, borderRadius: g.radius }}
      >
        <span className="grid items-center justify-items-center">
          <motion.span
            aria-hidden={phase !== "idle" || undefined}
            className="col-start-1 row-start-1 inline-flex items-center gap-2"
            initial={false}
            animate={faceMotion(phase === "idle")}
            transition={faceTransition}
          >
            <span
              aria-hidden
              className={cn("inline-flex shrink-0 text-danger", g.icon)}
            >
              {icon ?? <Trash2 className="size-full" />}
            </span>
            {label}
          </motion.span>
          <motion.span
            aria-hidden={phase !== "lit" || undefined}
            className="col-start-1 row-start-1 inline-flex items-center gap-2"
            initial={false}
            animate={faceMotion(phase === "lit")}
            transition={faceTransition}
          >
            <X aria-hidden className={cn("shrink-0 text-ink-2", g.icon)} />
            {cancelLabel}
            <span
              aria-hidden
              className="inline-flex items-center font-mono text-ink-2 tabular-nums"
              style={{ height: line, lineHeight: `${line}px` }}
            >
              {Math.ceil(seconds) >= 10 ? (
                <CountWheelTens count={count} line={line} />
              ) : null}
              <CountWheel count={count} line={line} />s
            </span>
          </motion.span>
          <motion.span
            aria-hidden={phase !== "fired" || undefined}
            className="col-start-1 row-start-1 inline-flex items-center gap-2"
            initial={false}
            animate={faceMotion(phase === "fired")}
            transition={faceTransition}
          >
            <Check aria-hidden className={cn("shrink-0", g.icon)} />
            {firedLabel}
          </motion.span>
        </span>
      </motion.button>

      <svg
        ref={(node) => {
          nodes.current.svg = node;
        }}
        aria-hidden
        className="pointer-events-none absolute inset-0 block size-full overflow-hidden"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <path
              ref={(node) => {
                nodes.current.mask = node;
              }}
              fill="none"
              stroke="white"
              strokeWidth={8}
            />
          </mask>
          <radialGradient id={glowId}>
            <stop
              offset="0"
              style={{ stopColor: "var(--fuse)", stopOpacity: 0.95 }}
            />
            <stop
              offset="0.45"
              style={{ stopColor: "var(--fuse)", stopOpacity: 0.38 }}
            />
            <stop
              offset="1"
              style={{ stopColor: "var(--fuse)", stopOpacity: 0 }}
            />
          </radialGradient>
          {/* Soft-edged puffs without a blur filter: a gradient, not a blur. */}
          <radialGradient id={smokeId}>
            <stop
              offset="0"
              style={{ stopColor: "var(--ink-3)", stopOpacity: 0.65 }}
            />
            <stop
              offset="0.6"
              style={{ stopColor: "var(--ink-3)", stopOpacity: 0.22 }}
            />
            <stop
              offset="1"
              style={{ stopColor: "var(--ink-3)", stopOpacity: 0 }}
            />
          </radialGradient>
        </defs>
        <path
          ref={(node) => {
            nodes.current.ash = node;
          }}
          fill="none"
          strokeWidth={1}
          className="stroke-ink-3/40"
          strokeDasharray="0 1"
        />
        <g
          ref={(node) => {
            nodes.current.cord = node;
          }}
          mask={`url(#${maskId})`}
        >
          <path
            ref={(node) => {
              nodes.current.base = node;
            }}
            fill="none"
            strokeWidth={2}
            className="stroke-ink-3/65"
          />
          <path
            ref={(node) => {
              nodes.current.twist = node;
            }}
            fill="none"
            strokeWidth={1}
            strokeDasharray="1 2.4"
            className="stroke-card/55"
          />
        </g>
        <path
          ref={(node) => {
            nodes.current.hot = node;
          }}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0}
          style={{ stroke: "var(--fuse)" }}
        />
        <path
          ref={(node) => {
            nodes.current.flash = node;
          }}
          fill="none"
          strokeWidth={2.5}
          opacity={0}
          style={{ stroke: "var(--fuse)" }}
        />
        {Array.from({ length: PUFFS }, (_, i) => (
          <circle
            key={i}
            ref={(node) => {
              nodes.current.puffs[i] = node;
            }}
            r={0}
            opacity={0}
            fill={`url(#${smokeId})`}
          />
        ))}
        <path
          ref={(node) => {
            nodes.current.burst = node;
          }}
          fill="none"
          strokeWidth={1.3}
          strokeLinecap="round"
          opacity={0}
          style={{ stroke: "var(--fuse)" }}
        />
        <g
          ref={(node) => {
            nodes.current.spark = node;
          }}
          opacity={0}
        >
          <circle
            ref={(node) => {
              nodes.current.glow = node;
            }}
            r={0}
            fill={`url(#${glowId})`}
          />
          <path
            ref={(node) => {
              nodes.current.rays = node;
            }}
            fill="none"
            strokeWidth={1}
            strokeLinecap="round"
            style={{ stroke: "color-mix(in oklab, var(--fuse) 55%, white)" }}
          />
          <circle
            ref={(node) => {
              nodes.current.core = node;
            }}
            r={1.7}
            style={{ fill: "color-mix(in oklab, var(--fuse) 35%, white)" }}
          />
        </g>
      </svg>
    </div>
  );
}

function CountWheelTens({
  count,
  line,
}: {
  count: MotionValue<number>;
  line: number;
}) {
  const tens = useTransform(count, (c) => Math.floor(Math.max(0, c) / 10));
  const opacity = useTransform(tens, (t) => (t > 0 ? 1 : 0));
  return (
    <motion.span style={{ opacity }} className="inline-flex">
      <CountWheel count={tens} line={line} />
    </motion.span>
  );
}
