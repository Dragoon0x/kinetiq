"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PrintHoldColour = "cobalt" | "signal" | "amber" | "ink";
export type PrintHoldFeedback = "tick" | "unlock";

export type PrintHoldProps = {
  /** What holding the pad confirms, as a sentence. The pad's accessible name. */
  label: string;
  /** Controlled: whether the hold has been confirmed. */
  confirmed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultConfirmed?: boolean;
  /** Fires from the completed hold with `true`. Set it back to `false` to arm the pad again. */
  onConfirmedChange?: (confirmed: boolean) => void;
  /**
   * Runs when a hold completes, before anything is confirmed. Return (or
   * resolve) `false` to decline the read; the pad shakes and drains. While a
   * promise is pending the lit print waits and the caption says "Checking".
   */
  verify?: () => boolean | void | Promise<boolean | void>;
  /** Seconds a full read takes, 1 to 3. @default 1.6 */
  scan?: number;
  /** How many ridge lines the print has, 6 to 14. @default 10 */
  ridges?: number;
  /** The colour the ridges light in. @default "cobalt" */
  colour?: PrintHoldColour;
  /** What the lit ridges condense into when confirmed. @default "tick" */
  feedback?: PrintHoldFeedback;
  /** Play the hum, chime and buzz. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Phase =
  | "idle"
  | "reading"
  | "checking"
  | "confirmed"
  | "early"
  | "cancelled"
  | "moved"
  | "declined";

type Hold = { via: "pointer" | "key" | "auto"; pan: number };

/** Rendered size of the pad in px; everything inside is drawn on a 100-unit box. */
const PAD = 124;
/** The whorl's core sits a little below centre, where a thumb's does. */
const CORE = { x: 50, y: 54 };
const CENTRE = { x: 50, y: 50 };
/** The radius every ridge condenses onto. */
const RING = 17;
/** Radial distance between turns of the reveal spiral, in box units. */
const PITCH = 15;
/** Pixels the pointer may wander before the read counts as smeared. */
const SLIP = 16;
const TAU = Math.PI * 2;

const COLOURS: Record<PrintHoldColour, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  ink: "var(--ink)",
};

const TICK = "M40.5 50.5 L47 57 L60 43.5";
const SHACKLE = "M44.5 48 V43.5 A5.5 5.5 0 0 1 55.5 43.5 V48";
const BRACKETS = [
  "M7 17 V10.5 Q7 7 10.5 7 H17",
  "M83 7 H89.5 Q93 7 93 10.5 V17",
  "M7 83 V89.5 Q7 93 10.5 93 H17",
  "M93 83 V89.5 Q93 93 89.5 93 H83",
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A small integer hash (unsigned throughout), so the print is the same everywhere. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const rand = (i: number, salt: number) =>
  hash(i * 7919 + salt * 104729) / 0xffffffff;

type Arc = { from: number; to: number };
type Ridge = {
  radius: number;
  wave2: number;
  phase2: number;
  wave3: number;
  phase3: number;
  flat: number;
  arcs: Arc[];
};

/**
 * The print: concentric whorl lines round the core, each an open curve with
 * one or two breaks where a real ridge would end or fork, the outer ones
 * flattening toward the base of the thumb. Deterministic per count.
 */
function buildRidges(count: number): Ridge[] {
  const n = Math.round(Math.min(14, Math.max(6, count)));
  const inner = 3.2;
  const outer = 47;
  const step = (outer - inner) / n;
  const out: Ridge[] = [];
  for (let i = 0; i < n; i += 1) {
    const gap = rand(i, 1) * TAU;
    // The innermost line is a hook, not a ring: that is what reads as a core.
    const size = i === 0 ? 1.9 : 0.34 + rand(i, 2) * 0.4;
    const from = gap + size / 2;
    const to = gap - size / 2 + TAU;
    const arcs: Arc[] = [];
    if (i > 1 && rand(i, 3) > 0.55) {
      const cut = from + (to - from) * (0.35 + rand(i, 4) * 0.3);
      const half = 0.11 + rand(i, 5) * 0.1;
      arcs.push({ from, to: cut - half }, { from: cut + half, to });
    } else {
      arcs.push({ from, to });
    }
    out.push({
      radius: inner + step * (i + 0.6),
      wave2: 0.03 + rand(i, 6) * 0.03,
      phase2: rand(i, 7) * TAU,
      wave3: 0.015 + rand(i, 8) * 0.02,
      phase3: rand(i, 9) * TAU,
      flat: clamp01((i / (n - 1) - 0.5) / 0.5) * 0.3,
      arcs,
    });
  }
  return out;
}

type Pt = readonly [number, number];

/** Catmull-Rom through the samples, written as cubic Béziers. */
function smooth(points: Pt[]): string {
  const first = points[0];
  if (!first) return "";
  const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
  let d = `M${f(first)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i] ?? first;
    const p2 = points[i + 1] ?? p1;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return d;
}

/**
 * Every ridge as one path. `condense` pulls each ridge's radius onto the
 * ring, inner ones first, while its wobble and flattening relax, so at 1
 * the print has become a single bold ring (the breaks of one ridge are
 * covered by the others).
 */
function printPath(ridges: Ridge[], condense: number): string {
  const c = clamp01(condense);
  const cx = lerp(CORE.x, CENTRE.x, c);
  const cy = lerp(CORE.y, CENTRE.y, c);
  const n = ridges.length;
  const parts: string[] = [];
  ridges.forEach((rg, i) => {
    const lag = n > 1 ? (i / (n - 1)) * 0.25 : 0;
    const ci = clamp01((c - lag) / (1 - lag));
    const keep = 1 - ci;
    const radius = lerp(rg.radius, RING, ci);
    const sx = lerp(0.8, 1, ci);
    for (const arc of rg.arcs) {
      const span = arc.to - arc.from;
      const steps = Math.max(2, Math.ceil(span / 0.3));
      const pts: Pt[] = [];
      for (let k = 0; k <= steps; k += 1) {
        const a = arc.from + (span * k) / steps;
        const s = Math.sin(a);
        const wob =
          1 +
          keep *
            (rg.wave2 * Math.sin(2 * a + rg.phase2) +
              rg.wave3 * Math.sin(3 * a + rg.phase3));
        const sy = s > 0 ? 1 - rg.flat * keep * s : 1;
        pts.push([
          cx + radius * wob * sx * Math.cos(a),
          cy + radius * wob * sy * s,
        ]);
      }
      parts.push(smooth(pts));
    }
  });
  return parts.join(" ");
}

/**
 * The reveal: a thick Archimedean spiral from the press point whose arm
 * unwinds with progress. Its pitch equals its stroke, so the lit area has no
 * gaps; at 1 it reaches past the farthest corner. Written as Hermite cubics,
 * one per eighth of a turn, so it stays smooth at any radius.
 */
function spiralPath(cx: number, cy: number, progress: number): string {
  const reach = Math.hypot(Math.max(cx, 100 - cx), Math.max(cy, 100 - cy));
  const total = clamp01(progress) * ((reach + PITCH) / PITCH) * TAU;
  if (total < 0.02) return "";
  const b = PITCH / TAU;
  const turn = -Math.PI / 2;
  const at = (a: number): Pt => [
    cx + b * a * Math.cos(a + turn),
    cy + b * a * Math.sin(a + turn),
  ];
  const slope = (a: number): Pt => [
    b * Math.cos(a + turn) - b * a * Math.sin(a + turn),
    b * Math.sin(a + turn) + b * a * Math.cos(a + turn),
  ];
  const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
  const seg = Math.PI / 4;
  let d = `M${f(at(0))}`;
  for (let a = 0; a < total; a += seg) {
    const e = Math.min(total, a + seg);
    const span = e - a;
    const p0 = at(a);
    const p1 = at(e);
    const s0 = slope(a);
    const s1 = slope(e);
    d += `C${f([p0[0] + (s0[0] * span) / 3, p0[1] + (s0[1] * span) / 3])} ${f([p1[0] - (s1[0] * span) / 3, p1[1] - (s1[1] * span) / 3])} ${f(p1)}`;
  }
  return d;
}

const CAPTIONS: Record<Exclude<Phase, "confirmed">, string> = {
  idle: "Press and hold the pad",
  reading: "Reading — keep holding",
  checking: "Checking",
  early: "Released early — hold until it fills",
  cancelled: "Cancelled",
  moved: "Moved — keep your thumb still",
  declined: "Declined — try again",
};

const captionOf = (phase: Phase, feedback: PrintHoldFeedback) =>
  phase === "confirmed"
    ? feedback === "unlock"
      ? "Unlocked"
      : "Confirmed"
    : CAPTIONS[phase];

const toneOf = (phase: Phase) =>
  phase === "confirmed"
    ? "text-foreground"
    : phase === "moved" || phase === "declined"
      ? "text-danger"
      : phase === "reading" || phase === "checking"
        ? "text-ink-2"
        : "text-ink-3";

/** One reading of the caption. A reading on its way out is hidden from assistive technology. */
function Caption({
  text,
  tone,
  motionSafe,
}: {
  text: string;
  tone: string;
  motionSafe: boolean;
}) {
  const present = useIsPresent();
  return (
    <motion.span
      aria-hidden={present ? undefined : true}
      className={cn("col-start-1 row-start-1 text-center", tone)}
      initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      {text}
    </motion.span>
  );
}

/**
 * A hold-to-confirm pad drawn as a fingerprint. It reads nothing — it asks
 * for a deliberate, steady hold, and the caption under it says in words what
 * is happening. Held, the ridges light in a spiral that unwinds from the
 * press point outward, on a linear read lasting `scan` seconds while a hum
 * rises with it; lifted early, the light drains back into the press point;
 * moved, the read smears, the pad shakes and buzzes and drains. A complete
 * read runs `verify` (if given) and reports `true`, and once the value says
 * confirmed the ridges condense onto one ring on the glide spring and a tick
 * draws inside it, or a padlock springs open.
 *
 * It is a native button: Space or Enter held is the hold, Escape cancels a
 * read, and a click from assistive technology runs a whole read. Under
 * reduced motion the ridges light from the core outward as a widening disc,
 * there is no dip or shake, and the confirmed ring and glyph cross-fade in;
 * the light, the words and the sounds still answer.
 */
export function PrintHold({
  label,
  confirmed,
  defaultConfirmed = false,
  onConfirmedChange,
  verify,
  scan = 1.6,
  ridges = 10,
  colour = "cobalt",
  feedback = "tick",
  sound = false,
  disabled = false,
  className,
}: PrintHoldProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const captionId = React.useId();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `print-hold-mask-${uid}`;
  const clipId = `print-hold-clip-${uid}`;

  const [own, setOwn] = React.useState(defaultConfirmed);
  const isConfirmed = confirmed ?? own;
  const [said, setSaid] = React.useState<{
    phase: Phase;
    text: string;
    n: number;
  }>(() => {
    const phase: Phase = isConfirmed ? "confirmed" : "idle";
    return { phase, text: captionOf(phase, feedback), n: 0 };
  });

  const model = React.useMemo(() => buildRidges(ridges), [ridges]);
  const scanSeconds = Math.min(3, Math.max(1, scan));
  const tint = COLOURS[colour] ?? COLOURS.cobalt;

  const [initial] = React.useState(isConfirmed ? 1 : 0);
  const progress = useMotionValue(initial);
  const condense = useMotionValue(initial);
  const settled = useMotionValue(initial);
  const open = useMotionValue(initial);
  const px = useMotionValue(CORE.x);
  const py = useMotionValue(CORE.y);
  const dip = useMotionValue(0);
  const shake = useMotionValue(0);
  const flash = useMotionValue(0);
  const touchX = useMotionValue(CORE.x);
  const touchY = useMotionValue(CORE.y);
  const touchR = useMotionValue(3);
  const touchO = useMotionValue(0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const hum = React.useRef<LoopHandle | null>(null);
  const humSync = React.useRef<(() => void) | null>(null);
  const holding = React.useRef<Hold | null>(null);
  const pointer = React.useRef<{ id: number; x: number; y: number } | null>(
    null,
  );
  const keyHeld = React.useRef<string | null>(null);
  const phase = React.useRef<Phase>(said.phase);
  const read = React.useRef(0);
  const expecting = React.useRef<{ pan: number } | null>(null);
  const shown = React.useRef(isConfirmed);
  const alive = React.useRef(false);

  const say = (next: Phase) => {
    phase.current = next;
    setSaid((s) => ({
      phase: next,
      text: captionOf(next, feedback),
      n: s.n + 1,
    }));
  };

  const run = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };
  const stop = (key: string) => {
    runs.current.get(key)?.stop();
    runs.current.delete(key);
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  const stopHum = () => {
    humSync.current?.();
    humSync.current = null;
    hum.current?.stop();
    hum.current = null;
  };
  const padPan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  // Whether a press may pick up the draining light where it is: yes after a
  // read that stopped short, no after a reset, whose light is a finished
  // read going out — picking that up would approve on a tap.
  const resumable = React.useRef(true);

  const drain = (resume = true) => {
    resumable.current = resume;
    const p = progress.get();
    run(
      "progress",
      animate(progress, 0, {
        duration: r3(0.2 + 0.35 * p),
        ease: easings.exit,
      }),
    );
  };

  const lift = () => {
    if (motionSafe) run("dip", animate(dip, 0, springs.snap));
    else dip.set(0);
  };

  const begin = (ux: number, uy: number, pan: number, via: Hold["via"]) => {
    if (disabled || isConfirmed || holding.current) return;
    if (phase.current === "checking") return;
    clearTimers();
    stop("shake");
    shake.set(0);
    run("flash", animate(flash, 0, { duration: durations.blink }));
    if (!resumable.current) {
      stop("progress");
      progress.set(0);
      resumable.current = true;
    }
    const p = progress.get();
    // A press that lands while the last read is still draining picks it up
    // where it is, from the same centre, rather than jumping the light.
    if (p < 0.02) {
      px.set(r2(ux));
      py.set(r2(uy));
    }
    holding.current = { via, pan };
    read.current += 1;
    say("reading");
    if (motionSafe) {
      run("dip", animate(dip, 1, springs.flick));
      touchX.set(r2(ux));
      touchY.set(r2(uy));
      run(
        "touchR",
        animate(touchR, [3, 11], {
          duration: durations.slow,
          ease: easings.enter,
        }),
      );
      run(
        "touchO",
        animate(touchO, [0.6, 0], {
          duration: durations.slow,
          ease: easings.enter,
        }),
      );
    }
    stopHum();
    const loop = audio.start("hum", {
      pitch: r3(0.7 + p * 0.9),
      gain: r3(0.45 + p * 0.25),
      pan,
    });
    hum.current = loop;
    humSync.current = progress.on("change", (v) =>
      loop.set({ pitch: r3(0.7 + v * 0.9), gain: r3(0.45 + v * 0.25) }),
    );
    run(
      "progress",
      animate(progress, 1, {
        duration: r3(Math.max(0.05, scanSeconds * (1 - p))),
        ease: "linear",
        onComplete: () => latest.current.complete(),
      }),
    );
  };

  const release = (why: "early" | "cancelled") => {
    if (!holding.current) return;
    holding.current = null;
    stopHum();
    stop("progress");
    say(why);
    lift();
    drain();
  };

  const refuse = (why: "moved" | "declined", pan: number) => {
    holding.current = null;
    expecting.current = null;
    stopHum();
    stop("progress");
    clearTimers();
    say(why);
    // The buzz and the flash are one event; the shake carries it.
    audio.play("buzz", { gain: 0.5, pan });
    run("flash", animate(flash, 1, { duration: durations.blink }));
    lift();
    if (motionSafe) {
      run(
        "shake",
        animate(shake, [0, -6, 5, -4, 2.5, -1, 0], {
          duration: 0.42,
          ease: "easeOut",
        }),
      );
    }
    later(() => {
      run(
        "flash",
        animate(flash, 0, { duration: durations.slow, ease: easings.exit }),
      );
      drain();
    }, 260);
  };

  const accept = (pan: number) => {
    expecting.current = { pan };
    if (confirmed === undefined) {
      setOwn(true);
    } else {
      // Controlled: nothing is confirmed until the host says so. A host that
      // takes it answers at once; one that never does has declined.
      if (phase.current !== "checking") say("checking");
      later(() => {
        if (!expecting.current || latest.current.isConfirmed) return;
        refuse("declined", pan);
      }, 400);
    }
    onConfirmedChange?.(true);
  };

  const complete = () => {
    const hold = holding.current;
    if (!hold) return;
    holding.current = null;
    stopHum();
    lift();
    if (!verify) {
      accept(hold.pan);
      return;
    }
    say("checking");
    const ticket = read.current;
    const settle = (ok: boolean | void) => {
      if (!alive.current || ticket !== read.current) return;
      if (ok === false) latest.current.refuse("declined", hold.pan);
      else latest.current.accept(hold.pan);
    };
    let answer: boolean | void | Promise<boolean | void>;
    try {
      answer = verify();
    } catch {
      refuse("declined", hold.pan);
      return;
    }
    if (answer instanceof Promise) {
      answer.then(settle, () => settle(false));
    } else {
      settle(answer);
    }
  };

  // The value's own changes drive the condense, so a controlled pad shows
  // confirmed only once the host has said so. Only a change a hold asked
  // for is heard; a host resetting the pad does it silently.
  const show = (on: boolean) => {
    const asked = expecting.current;
    expecting.current = null;
    clearTimers();
    if (on) {
      holding.current = null;
      stopHum();
      say("confirmed");
      if (progress.get() < 0.02) {
        px.set(CENTRE.x);
        py.set(CENTRE.y);
      }
      run(
        "progress",
        animate(progress, 1, { duration: durations.base, ease: easings.enter }),
      );
      if (asked) {
        audio.play("chime", {
          pitch: feedback === "unlock" ? r3(semitones(-5)) : 1,
          gain: 0.55,
          pan: asked.pan,
        });
      }
      if (!motionSafe) {
        condense.set(0);
        open.set(1);
        run("settled", animate(settled, 1, { duration: durations.base }));
        return;
      }
      run("condense", animate(condense, 1, springs.glide));
      run(
        "settled",
        animate(settled, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay: 0.16,
        }),
      );
      if (feedback === "unlock") {
        open.set(0);
        later(() => {
          run("open", animate(open, 1, springs.snap));
          if (asked)
            audio.play("click", { pitch: 0.8, gain: 0.5, pan: asked.pan });
        }, 280);
      } else {
        open.set(1);
      }
      return;
    }
    say("idle");
    run(
      "settled",
      animate(settled, 0, { duration: durations.fast, ease: easings.exit }),
    );
    run("open", animate(open, 0, { duration: durations.fast }));
    if (motionSafe) run("condense", animate(condense, 0, springs.glide));
    else condense.set(0);
    drain(false);
  };

  const latest = React.useRef({
    complete,
    accept,
    refuse,
    release,
    show,
    isConfirmed,
    feedback,
    motionSafe,
  });
  React.useEffect(() => {
    latest.current = {
      complete,
      accept,
      refuse,
      release,
      show,
      isConfirmed,
      feedback,
      motionSafe,
    };
  });

  React.useEffect(() => {
    if (shown.current === isConfirmed) return;
    shown.current = isConfirmed;
    latest.current.show(isConfirmed);
  }, [isConfirmed]);

  // A new feedback while confirmed swaps the glyph and says the new word.
  const shownFeedback = React.useRef(feedback);
  React.useEffect(() => {
    if (shownFeedback.current === feedback) return;
    shownFeedback.current = feedback;
    if (phase.current !== "confirmed") return;
    open.set(1);
    setSaid((s) => ({
      phase: "confirmed",
      text: captionOf("confirmed", feedback),
      n: s.n + 1,
    }));
  }, [feedback, open]);

  // A hold never outlives the page's attention: blur and a hidden tab end it.
  React.useEffect(() => {
    const interrupt = () => latest.current.release("cancelled");
    const onVisibility = () => {
      if (document.hidden) interrupt();
    };
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (disabled) latest.current.release("cancelled");
  }, [disabled]);

  React.useEffect(() => {
    alive.current = true;
    // Effects can be torn down and re-run without the pad going anywhere
    // (React's development checks do it). Whatever that cut short is put
    // where the current state rests, so nothing is left halfway.
    const now = latest.current;
    if (phase.current !== "checking") progress.set(now.isConfirmed ? 1 : 0);
    condense.set(now.isConfirmed && now.motionSafe ? 1 : 0);
    settled.set(now.isConfirmed ? 1 : 0);
    open.set(now.isConfirmed ? 1 : 0);
    dip.set(0);
    shake.set(0);
    flash.set(0);
    touchO.set(0);
    const owned = runs.current;
    return () => {
      alive.current = false;
      for (const c of owned.values()) c.stop();
      owned.clear();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      humSync.current?.();
      humSync.current = null;
      hum.current?.stop();
      hum.current = null;
      holding.current = null;
    };
  }, [condense, dip, flash, open, progress, settled, shake, touchO]);

  const printD = useTransform(condense, (c) =>
    printPath(model, motionSafe ? c : 0),
  );
  const reveal = useTransform(
    [progress, px, py] as MotionValue<number>[],
    ([p, x, y]) => spiralPath(x as number, y as number, p as number),
  );
  const disc = useTransform(
    [progress, px, py] as MotionValue<number>[],
    ([p, x, y]) => {
      const reach = Math.hypot(
        Math.max(x as number, 100 - (x as number)),
        Math.max(y as number, 100 - (y as number)),
      );
      return r2(clamp01(p as number) * (reach + 2));
    },
  );
  const lit = useTransform(
    flash,
    (f) =>
      `color-mix(in oklab, var(--danger) ${Math.round(clamp01(f) * 100)}%, ${tint})`,
  );
  const litWidth = useTransform(condense, (c) =>
    r2(1.5 + (motionSafe ? clamp01(c) : 0) * 1.4),
  );
  const dimOpacity = useTransform(
    [condense, settled] as MotionValue<number>[],
    ([c, s]) => r3(1 - clamp01(motionSafe ? (c as number) : (s as number))),
  );
  const litOpacity = useTransform(settled, (s) =>
    motionSafe ? 1 : r3(1 - clamp01(s)),
  );
  const washOpacity = useTransform(condense, (c) =>
    r3(0.14 * (1 - clamp01(c))),
  );
  const glyphOpacity = useTransform(settled, (s) =>
    r3(clamp01(feedback === "tick" && motionSafe ? s * 4 : s)),
  );
  const shackleY = useTransform(open, (o) => r2(-3.5 * o));
  const shackleTurn = useTransform(open, (o) => r2(-22 * o));
  const glassScale = useTransform(dip, (d) => r3(1 - 0.03 * d));

  const lively = said.phase !== "idle";
  const bracket =
    said.phase === "moved" || said.phase === "declined"
      ? "var(--danger)"
      : said.phase === "reading" ||
          said.phase === "checking" ||
          said.phase === "confirmed"
        ? tint
        : "var(--ink-3)";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={captionId}
        aria-disabled={isConfirmed ? true : undefined}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          begin(
            ((event.clientX - rect.left) / rect.width) * 100,
            ((event.clientY - rect.top) / rect.height) * 100,
            panFrom(event.clientX, null),
            "pointer",
          );
        }}
        onPointerMove={(event) => {
          const p = pointer.current;
          if (!p || p.id !== event.pointerId) return;
          if (holding.current?.via !== "pointer") return;
          if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > SLIP) {
            pointer.current = null;
            refuse("moved", panFrom(event.clientX, null));
          }
        }}
        onPointerUp={(event) => {
          if (pointer.current?.id !== event.pointerId) return;
          pointer.current = null;
          if (holding.current?.via === "pointer") release("early");
        }}
        onPointerCancel={(event) => {
          if (pointer.current?.id !== event.pointerId) return;
          pointer.current = null;
          if (holding.current?.via === "pointer") release("cancelled");
        }}
        onPointerLeave={(event) => {
          if (pointer.current?.id !== event.pointerId) return;
          pointer.current = null;
          // Sliding off the glass is the largest slip there is.
          if (holding.current?.via === "pointer") {
            refuse("moved", panFrom(event.clientX, null));
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (!holding.current) return;
            event.preventDefault();
            keyHeld.current = null;
            release("cancelled");
            return;
          }
          if (event.key !== " " && event.key !== "Enter") return;
          // The key is the hold: its own down and up, never a click.
          event.preventDefault();
          if (event.repeat || keyHeld.current) return;
          keyHeld.current = event.key;
          begin(CORE.x, CORE.y, padPan(), "key");
        }}
        onKeyUp={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          if (keyHeld.current !== event.key) return;
          keyHeld.current = null;
          if (holding.current?.via === "key") release("early");
        }}
        onBlur={() => {
          keyHeld.current = null;
          if (holding.current && holding.current.via !== "auto") {
            release("cancelled");
          }
        }}
        onClick={(event) => {
          // Assistive technology activates with no key to hold: the read
          // runs its whole course.
          if (event.detail !== 0 || keyHeld.current || holding.current) return;
          begin(CORE.x, CORE.y, padPan(), "auto");
        }}
        className={cn(
          "relative block shrink-0 cursor-pointer touch-none overflow-clip rounded-4 border border-hairline-strong bg-surface-2 outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-default",
        )}
        style={{
          x: shake,
          width: PAD,
          height: PAD,
          boxShadow:
            "inset 0 1px 3px color-mix(in oklab, black 16%, transparent)",
        }}
      >
        <motion.svg
          aria-hidden
          width={PAD - 2}
          height={PAD - 2}
          viewBox="0 0 100 100"
          className="pointer-events-none block"
          style={{ scale: glassScale }}
        >
          <defs>
            <clipPath id={clipId}>
              <ellipse cx={50} cy={52} rx={33} ry={41} />
            </clipPath>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={100}
              height={100}
            >
              {motionSafe ? (
                <motion.path
                  d={reveal}
                  fill="none"
                  stroke="white"
                  strokeWidth={r2(PITCH * 1.08)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <motion.circle cx={px} cy={py} r={disc} fill="white" />
              )}
            </mask>
          </defs>

          <g
            fill="none"
            strokeLinecap="round"
            strokeWidth={1.4}
            className="transition-[stroke,opacity] duration-150"
            style={{ stroke: bracket, opacity: lively ? 0.9 : 0.5 }}
          >
            {BRACKETS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>

          <g clipPath={`url(#${clipId})`}>
            <motion.path
              d={printD}
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth={1.1}
              strokeLinecap="round"
              style={{ opacity: dimOpacity }}
            />
            <motion.g
              mask={`url(#${maskId})`}
              className={
                said.phase === "checking" && motionSafe
                  ? "animate-pulse"
                  : undefined
              }
              style={{ color: lit, opacity: litOpacity }}
            >
              <motion.rect
                x={0}
                y={0}
                width={100}
                height={100}
                fill="currentColor"
                style={{ opacity: washOpacity }}
              />
              <motion.path
                d={printD}
                fill="none"
                stroke="currentColor"
                strokeWidth={litWidth}
                strokeLinecap="round"
              />
            </motion.g>
          </g>

          <motion.circle
            cx={touchX}
            cy={touchY}
            r={touchR}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={0.8}
            style={{ opacity: touchO }}
          />

          <motion.g style={{ color: lit, opacity: glyphOpacity }}>
            {motionSafe ? null : (
              <circle
                cx={CENTRE.x}
                cy={CENTRE.y}
                r={RING}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.9}
              />
            )}
            {feedback === "tick" ? (
              <motion.path
                d={TICK}
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pathLength: motionSafe ? settled : 1 }}
              />
            ) : (
              <g>
                <motion.path
                  d={SHACKLE}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  style={{
                    y: shackleY,
                    rotate: shackleTurn,
                    originX: 0,
                    originY: 1,
                  }}
                />
                <rect
                  x={41}
                  y={47.5}
                  width={18}
                  height={13.5}
                  rx={2.5}
                  fill="currentColor"
                />
                <circle cx={50} cy={53.2} r={1.7} fill="var(--bg-2)" />
                <rect
                  x={49.3}
                  y={53.4}
                  width={1.4}
                  height={3.6}
                  rx={0.7}
                  fill="var(--bg-2)"
                />
              </g>
            )}
          </motion.g>
        </motion.svg>
      </motion.button>

      <p
        id={captionId}
        role="status"
        className="grid max-w-full text-xs leading-4"
      >
        <AnimatePresence initial={false}>
          <Caption
            key={said.n}
            text={said.text}
            tone={toneOf(said.phase)}
            motionSafe={motionSafe}
          />
        </AnimatePresence>
      </p>
    </div>
  );
}
