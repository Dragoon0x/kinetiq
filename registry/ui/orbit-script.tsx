"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type OrbitScriptElement = "div" | "p" | "span" | "h2" | "h3";
export type OrbitScriptTrigger = "mount" | "inView" | "hover" | "manual";

export type OrbitScriptProps = {
  /** The text set round the ring, read clockwise from the top. */
  text: string;
  /** What sits in the middle of the ring: an icon, a number, a mark. */
  center?: React.ReactNode;
  /** The element that carries the text for assistive technology. @default "div" */
  as?: OrbitScriptElement;
  /** Cruising speed, turns a minute. 0 stands still. @default 3 */
  speed?: number;
  /** Which way the ring turns. @default "cw" */
  direction?: "cw" | "ccw";
  /** The ring's radius, em of the text size. @default 4.5 */
  radius?: number;
  /** Extra tracking between letters along the ring, em. @default 0.22 */
  spacing?: number;
  /** How hard the ring brakes and how soon a flick runs out, 0 (ice) to 1 (felt). @default 0.5 */
  friction?: number;
  /** How far the letter nearest the pointer lifts off the ring, em. @default 0.35 */
  lift?: number;
  /** The lifted letter turns upright to face the reader. @default true */
  face?: boolean;
  /** Rule a hairline orbit under the letters. @default true */
  track?: boolean;
  /** The lifted letter's colour, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Hover brakes, drag spins, keys step. False makes the ring decoration only. @default true */
  interactive?: boolean;
  /** Hold the ring still; it brakes to a stop with friction. @default false */
  paused?: boolean;
  /** When the letters lay themselves onto the ring. @default "inView" */
  trigger?: OrbitScriptTrigger;
  /** Play the entrance once, or each time the ring re-enters view or is hovered. @default true */
  once?: boolean;
  /** Wait before the entrance, ms. @default 0 */
  delay?: number;
  /** With trigger "manual": true plays the entrance, false empties the ring. @default false */
  play?: boolean;
  /** Tick as letters pass the top while the visitor turns the ring. @default false */
  sound?: boolean;
  /** The ring keeps turning but cannot be braked, spun or stepped. */
  disabled?: boolean;
  /** The entrance has finished and the ring is up to speed. */
  onComplete?: () => void;
  /** The letter at the top changed under the visitor's hand or keys: its index. */
  onStep?: (index: number) => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** An angle folded into (-180, 180]. */
const fold = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};

/** How far past the radius the box reaches, em: lifted letters stay inside. */
const RIM = 1.25;
const STEP = 1 / 240;
/** Spool-up time constant back to cruise, s. */
const SPOOL = 0.7;
/** How wide the pointer's reach is along the ring, em. */
const REACH = 1.7;

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/**
 * Advance widths in em before the real font can be measured: close enough
 * that the measured layout, a frame later, moves letters by a hair.
 */
function estimate(ch: string): number {
  if (/\s/.test(ch)) return 0.26;
  if (/[.,:;'!|·•ilI1]/.test(ch)) return 0.3;
  if (/[fjrt()[\]]/.test(ch)) return 0.36;
  if (/[mwMW]/.test(ch)) return 0.86;
  if (/[A-Z0-9]/.test(ch)) return 0.66;
  return 0.54;
}

type Ring = {
  chars: string[];
  /** Each letter's angle round the ring, degrees clockwise from the top. */
  angles: number[];
  /** Indices of letters that are not spaces, in order. */
  stops: number[];
};

function ringOf(
  chars: string[],
  advances: number[],
  radius: number,
  spacing: number,
): Ring {
  const pitch = chars.map((ch, i) => (advances[i] ?? estimate(ch)) + spacing);
  const total = pitch.reduce((a, b) => a + b, 0);
  const room = 2 * Math.PI * radius;
  // Text longer than the ring is set tighter rather than overlapping itself.
  const squeeze = total > room ? room / total : 1;
  let s = 0;
  const angles = pitch.map((p) => {
    const mid = s + p / 2;
    s += p;
    return r3(((mid * squeeze) / radius) * (180 / Math.PI));
  });
  const stops = chars
    .map((ch, i) => (/\s/.test(ch) ? -1 : i))
    .filter((i) => i >= 0);
  return { chars, angles, stops };
}

const transformOf = (angle: number, radius: number, up: number, turn = 0) =>
  `translateX(-50%) rotate(${r3(angle)}deg) translateY(${r3(-(radius + up))}em)${
    turn ? ` rotate(${r3(turn)}deg)` : ""
  }`;

type Spin = {
  theta: number;
  omega: number;
  mode: "free" | "drag" | "seek";
  aim: number;
  /** The ring is held: hovered, focused, or tapped on touch. */
  held: boolean;
  /** The visitor set it going: ticks sound until it is back to cruise. */
  thrown: boolean;
  /** Where the pointer is, polar about the centre: degrees and em; null when away. */
  at: number | null;
  r: number;
  /** Keyboard focus reads the letter at the top. */
  probe: boolean;
  lift: Float64Array;
  liftV: Float64Array;
  turn: Float64Array;
  turnV: Float64Array;
  /** What was last written to each letter, so idle letters cost nothing. */
  drawn: Float64Array;
  /** Entrance clock, s; negative before it starts, Infinity when done. */
  intro: number;
  top: number;
  /** Cruise reached after the entrance: onComplete has fired. */
  arrived: boolean;
};

const spinOf = (n: number): Spin => ({
  theta: 0,
  omega: 0,
  mode: "free",
  aim: 0,
  held: false,
  thrown: false,
  at: null,
  r: 0,
  probe: false,
  lift: new Float64Array(n),
  liftV: new Float64Array(n),
  turn: new Float64Array(n),
  turnV: new Float64Array(n),
  drawn: new Float64Array(n * 3).fill(Number.NaN),
  intro: -1,
  top: 0,
  arrived: false,
});

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  wake: () => void;
  halt: () => void;
  intro: (on: boolean) => void;
  settled: () => void;
};

const NO_WIDTHS: number[] = [];

/**
 * Text set round a ring, the way a badge or a coin carries its legend: each
 * letter stands on the circle at its measured advance, head outward, over a
 * hairline orbit, with an optional mark in the middle. The ring turns at a
 * cruising speed. A pointer over it brakes it to a stop with friction, and
 * the letter nearest the pointer lifts off the ring on its own spring and
 * turns upright to face the reader. Dragging spins it 1:1 about its centre;
 * a flick hands it the throw's angular velocity and it coasts down, by the
 * same friction, back to cruise. On arrival the letters lay themselves onto
 * the ring clockwise from the top while it spools up.
 *
 * The ring is a slider in the tab order: arrow keys step it a letter at a
 * time on the snap spring, so the keyboard reads the legend letter by
 * letter, each arriving at the top lifted and upright; Space pauses the turn.
 * The text itself is read once from an sr-only element. One loop owns the
 * angle and every lifted letter; it runs on screen in a visible page and
 * stops when the ring is braked and still. Under reduced motion the ring
 * stands still, a drag turns it without coasting, keys step instantly, and
 * the nearest letter takes the accent colour instead of lifting.
 */
export function OrbitScript({
  text,
  center,
  as = "div",
  speed = 3,
  direction = "cw",
  radius = 4.5,
  spacing = 0.22,
  friction = 0.5,
  lift = 0.35,
  face = true,
  track = true,
  accent = "var(--accent-bright)",
  interactive = true,
  paused = false,
  trigger = "inView",
  once = true,
  delay = 0,
  play = false,
  sound = false,
  disabled = false,
  onComplete,
  onStep,
  className,
}: OrbitScriptProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const R = clamp(radius, 1.5, 12);
  const box = r3(2 * (R + RIM));

  const chars = React.useMemo(() => graphemes(text), [text]);
  const [advances, setAdvances] = React.useState<{
    key: string;
    widths: number[];
  } | null>(null);
  const measured = advances?.key === text ? advances.widths : NO_WIDTHS;
  const ring = React.useMemo(
    () => ringOf(chars, measured, R, Math.max(0, spacing)),
    [chars, measured, R, spacing],
  );

  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const [shown, setShown] = React.useState(false);
  const [halted, setHalted] = React.useState(false);
  const [reading, setReading] = React.useState({ angle: 0, index: 0 });

  const theta = useMotionValue(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const letters = React.useRef(new Map<number, HTMLSpanElement>());
  const spin = React.useRef<Spin>(spinOf(0));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const timer = React.useRef<number | null>(null);
  const grab = React.useRef({ angle: 0, unwrapped: 0 });
  const tracker = React.useRef(createVelocityTracker());
  const cfg = React.useRef({
    ring,
    R,
    speed,
    direction,
    friction,
    lift,
    face,
    accent,
    motionSafe,
    stopped: paused || halted,
    started,
    audio,
    onComplete,
    onStep,
  });

  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** Which letter stands at the top for a ring angle. */
  const topOf = (angles: number[], stops: number[], th: number) => {
    let best = stops[0] ?? 0;
    let bestD = Infinity;
    for (const i of stops) {
      const d = Math.abs(fold((angles[i] ?? 0) + th));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const tick = (index: number, omega: number) => {
    const c = cfg.current;
    const node = letters.current.get(index);
    c.audio.play("tick", {
      pitch: r3(0.9 + Math.min(0.5, Math.abs(omega) / 1440)),
      gain: 0.35,
      pan: node ? panFrom(node.getBoundingClientRect().left, null) : 0,
    });
  };

  /** Advances the ring by dt seconds; returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const s = spin.current;
    const c = cfg.current;
    const { angles, stops, chars: cs } = c.ring;
    const n = cs.length;
    const safe = c.motionSafe;
    const cruise =
      c.started && safe && !c.stopped
        ? c.speed * 6 * (c.direction === "ccw" ? -1 : 1)
        : 0;
    const goal = s.held ? 0 : cruise;
    const f = clamp01(c.friction);
    // Braking is friction: a constant drag plus a viscous one, so a crawl
    // stops in about half a second and a hard flick coasts for a turn.
    const drag0 = lerp(6, 40, f);
    const viscous = lerp(0.8, 3.2, f);
    let left = dt;
    while (left > 1e-7) {
      const h = Math.min(STEP, left);
      left -= h;
      if (s.mode === "free") {
        const slowing =
          Math.abs(s.omega) > Math.abs(goal) + 1e-6 ||
          Math.sign(s.omega) * Math.sign(goal) < 0;
        if (slowing) {
          const dec = (drag0 + viscous * Math.abs(s.omega)) * h;
          const next =
            s.omega > goal
              ? Math.max(goal, s.omega - dec)
              : Math.min(goal, s.omega + dec);
          s.omega = next;
        } else {
          s.omega += (goal - s.omega) * (1 - Math.exp(-h / SPOOL));
        }
        s.theta += s.omega * h;
      } else if (s.mode === "seek") {
        if (safe) {
          const k = springs.snap.stiffness / springs.snap.mass;
          const cdamp = springs.snap.damping / springs.snap.mass;
          const a = -k * (s.theta - s.aim) - cdamp * s.omega;
          s.omega += a * h;
          s.theta += s.omega * h;
        } else {
          s.theta = s.aim;
          s.omega = 0;
        }
      }
    }
    if (s.mode === "seek") {
      if (Math.abs(s.theta - s.aim) < 0.01 && Math.abs(s.omega) < 0.05) {
        s.theta = s.aim;
        s.omega = 0;
        s.mode = "free";
      }
    }
    // Keep the angle small without a visible jump.
    if (s.mode !== "seek" && Math.abs(s.theta) > 3600) {
      s.theta = fold(s.theta);
    }
    theta.set(r3(s.theta));
    if (s.thrown && Math.abs(s.omega) <= Math.abs(cruise) + 20) {
      s.thrown = false;
    }

    const top = topOf(angles, stops, s.theta);
    if (top !== s.top) {
      s.top = top;
      if (s.mode === "drag" || s.mode === "seek" || s.thrown) {
        tick(top, s.omega);
        c.onStep?.(top);
      }
    }

    // Entrance clock.
    let entering = false;
    if (s.intro >= 0 && s.intro !== Infinity) {
      s.intro += dt;
      entering = true;
    }
    const stagger = Math.min(0.03, 0.7 / Math.max(1, n));
    const fadeIn = 0.18;
    if (entering && s.intro > stagger * n + fadeIn + 0.45) {
      s.intro = Infinity;
      entering = false;
    }

    let busy = s.mode !== "free" || Math.abs(s.omega) > 1e-3 || goal !== 0;
    busy ||= entering;
    const kLift = springs.snap.stiffness / springs.snap.mass;
    const cLift = springs.snap.damping / springs.snap.mass;
    const reachDeg = (REACH / c.R) * (180 / Math.PI);
    for (let i = 0; i < n; i += 1) {
      const node = letters.current.get(i);
      const angle = angles[i] ?? 0;
      // The pointer's (or the keyboard probe's) pull on this letter.
      let pull = 0;
      if (!/\s/.test(cs[i] ?? "")) {
        const at = s.probe ? 0 : s.at;
        if (at !== null) {
          const gate = s.probe ? 1 : clamp01(1 - Math.abs(s.r - c.R) / REACH);
          const d = Math.abs(fold(angle + s.theta - at)) / reachDeg;
          if (d < 1) pull = (1 - d * d) * (1 - d * d) * gate;
        }
      }
      let up = 0;
      let turn = 0;
      let opacity = 1;
      if (s.intro < 0) opacity = 0;
      else if (s.intro !== Infinity) {
        const t0 = i * stagger;
        opacity = clamp01((s.intro - t0) / fadeIn);
      }
      if (safe) {
        let liftGoal = c.lift * pull;
        if (s.intro !== Infinity && s.intro < i * stagger) {
          // Waiting its turn just inside the ring.
          s.lift[i] = -0.6;
          s.liftV[i] = 0;
          liftGoal = -0.6;
        }
        const world = fold(angle + s.theta);
        let l = s.lift[i] ?? 0;
        let lv = s.liftV[i] ?? 0;
        let tr = s.turn[i] ?? 0;
        let tv = s.turnV[i] ?? 0;
        // Upright is the same either way round at the bottom of the ring:
        // turn whichever way is nearer, so a letter never spins a full turn
        // as it crosses the bottom.
        let turnGoal = c.face ? -world * pull : 0;
        const other = turnGoal + (turnGoal > 0 ? -360 : 360) * pull;
        if (Math.abs(other - tr) < Math.abs(turnGoal - tr)) turnGoal = other;
        let sub = dt;
        while (sub > 1e-7) {
          const h = Math.min(STEP, sub);
          sub -= h;
          const a = -kLift * (l - liftGoal) - cLift * lv;
          lv += a * h;
          l += lv * h;
          const b = -kLift * (tr - turnGoal) - cLift * tv;
          tv += b * h;
          tr += tv * h;
        }
        s.lift[i] = l;
        s.liftV[i] = lv;
        s.turn[i] = tr;
        s.turnV[i] = tv;
        if (
          Math.abs(l - liftGoal) > 1e-3 ||
          Math.abs(lv) > 1e-3 ||
          Math.abs(tr - turnGoal) > 0.05 ||
          Math.abs(tv) > 0.05
        ) {
          busy = true;
        }
        up = l;
        turn = tr;
      } else {
        s.lift[i] = 0;
        s.turn[i] = 0;
      }
      if (!node) continue;
      // Only letters that changed are written.
      const tint = Math.round(pull * 100);
      const j = i * 3;
      const ru = r3(up);
      const rt = Math.round(turn * 10) / 10;
      const ro = Math.round(opacity * 100) / 100;
      if (s.drawn[j] !== ru || s.drawn[j + 1] !== rt) {
        s.drawn[j] = ru;
        s.drawn[j + 1] = rt;
        node.style.transform = transformOf(angle, c.R, ru, rt);
      }
      if (s.drawn[j + 2] !== ro * 1000 + tint * 0.001) {
        s.drawn[j + 2] = ro * 1000 + tint * 0.001;
        node.style.opacity = String(ro);
        node.style.color =
          tint > 0
            ? `color-mix(in oklab, ${c.accent} ${tint}%, currentColor)`
            : "";
      }
    }

    if (s.intro === Infinity && !s.arrived && c.started) {
      if (Math.abs(s.omega - cruise) < Math.max(0.5, Math.abs(cruise) * 0.05)) {
        s.arrived = true;
        c.onComplete?.();
      }
    }
    return busy;
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const busy = step(dt);
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    } else {
      api.current?.settled();
    }
  };

  const intro = (on: boolean) => {
    const s = spin.current;
    if (on) {
      s.intro = 0;
      s.arrived = false;
      s.omega = 0;
      s.drawn.fill(Number.NaN);
    } else {
      s.intro = -1;
      s.arrived = false;
      s.drawn.fill(Number.NaN);
    }
    wake();
  };

  /** The ring has come to rest: what stands at the top is the reading. */
  const settledRef = React.useRef(() => {});
  const settled = () => {
    const s = spin.current;
    const angle = Math.round((((-s.theta % 360) + 360) % 360) * 10) / 10;
    setReading((r) =>
      r.angle === angle && r.index === s.top ? r : { angle, index: s.top },
    );
    if (s.intro === Infinity) setShown(true);
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      ring,
      R,
      speed: Math.max(0, speed),
      direction,
      friction,
      lift: Math.max(0, lift),
      face,
      accent,
      motionSafe,
      stopped: paused || halted,
      started,
      audio,
      onComplete,
      onStep,
    };
    frameRef.current = frame;
    settledRef.current = settled;
    live.current = running;
    api.current = { wake, halt, intro, settled: () => settledRef.current() };
  });

  // New text or geometry: every letter is redrawn from scratch.
  React.useLayoutEffect(() => {
    const s = spin.current;
    if (s.lift.length !== ring.chars.length) {
      const next = spinOf(ring.chars.length);
      next.theta = s.theta;
      next.omega = s.omega;
      next.intro = s.intro;
      next.arrived = s.arrived;
      spin.current = next;
    } else {
      s.drawn.fill(Number.NaN);
    }
    api.current?.wake();
  }, [ring]);

  React.useEffect(() => {
    api.current?.intro(started);
  }, [started, entrance.n]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  React.useEffect(() => {
    api.current?.wake();
  }, [speed, direction, paused, halted, motionSafe, lift, face, accent]);

  // The real advances, once the font is in: measured on a canvas in the
  // ring's own computed font, in em.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const style = getComputedStyle(node);
      const size = parseFloat(style.fontSize) || 16;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
      const widths = chars.map((ch) => r3(ctx.measureText(ch).width / size));
      setAdvances((prev) =>
        prev?.key === text && prev.widths.every((w, i) => w === widths[i])
          ? prev
          : { key: text, widths },
      );
    };
    // Fonts load lazily, so `ready` can resolve before this one has begun:
    // every finished load measures again.
    const fonts = document.fonts;
    if (fonts?.ready) void fonts.ready.then(measure);
    else window.setTimeout(measure, 0);
    fonts?.addEventListener?.("loadingdone", measure);
    return () => {
      cancelled = true;
      fonts?.removeEventListener?.("loadingdone", measure);
    };
  }, [chars, text]);

  const begin = React.useCallback((restart: boolean, wait: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, wait);
  }, []);

  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false, delay);
    if (trigger === "manual") {
      if (play) begin(true, delay);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, delay, begin, reset]);

  const seen = React.useRef({ trigger, once, delay, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once, delay };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(false, t.delay);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [begin, reset],
  );

  const bindLetter = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(i, node);
    else letters.current.delete(i);
  };

  /** The pointer in polar form about the ring's centre: degrees and em. */
  const polar = (clientX: number, clientY: number) => {
    const node = rootRef.current;
    if (!node) return { angle: 0, r: 0, em: 16 };
    const rect = node.getBoundingClientRect();
    const em = rect.width / box || 16;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    return {
      angle: (Math.atan2(dx, -dy) * 180) / Math.PI,
      r: Math.hypot(dx, dy) / em,
      em,
    };
  };

  const hover = (clientX: number, clientY: number) => {
    const s = spin.current;
    const p = polar(clientX, clientY);
    s.at = p.angle;
    s.r = p.r;
    s.held = true;
    wake();
  };

  const away = () => {
    const s = spin.current;
    s.at = null;
    s.held = s.probe;
    wake();
  };

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || !interactive,
    onStart: ({ point }) => {
      const s = spin.current;
      const p = polar(point.x, point.y);
      grab.current = { angle: p.angle, unwrapped: s.theta };
      tracker.current.reset();
      tracker.current.push(s.theta, 0, performance.now());
      s.mode = "drag";
      s.omega = 0;
      s.held = true;
      wake();
    },
    onMove: ({ point, event }) => {
      const s = spin.current;
      const p = polar(point.x, point.y);
      // Near the centre the angle is meaningless: hold still there.
      if (p.r < 0.6) return;
      const delta = fold(p.angle - grab.current.angle);
      grab.current.angle = p.angle;
      grab.current.unwrapped += delta;
      s.theta = grab.current.unwrapped;
      s.at = p.angle;
      s.r = p.r;
      tracker.current.push(s.theta, 0, event.timeStamp);
      wake();
    },
    onEnd: ({ event }) => {
      const s = spin.current;
      tracker.current.push(s.theta, 0, event.timeStamp);
      const omega = clamp(tracker.current.velocity().x, -1800, 1800);
      s.mode = "free";
      s.omega = cfg.current.motionSafe ? omega : 0;
      s.thrown = Math.abs(s.omega) > 30;
      // A finger has gone, and so has a mouse let go outside the ring; a
      // mouse still over it keeps holding it.
      const p = polar(event.clientX, event.clientY);
      if (event.pointerType !== "mouse" || p.r > box / 2) {
        s.held = s.probe;
        s.at = null;
      }
      wake();
    },
    onCancel: () => {
      const s = spin.current;
      s.mode = "free";
      s.held = s.probe;
      wake();
    },
    onTap: (event) => {
      if (event.pointerType === "mouse") return;
      // On touch a tap holds the ring and lifts the letter under the finger;
      // a second tap lets it go.
      const s = spin.current;
      if (s.held && !s.probe) {
        s.held = false;
        s.at = null;
      } else {
        hover(event.clientX, event.clientY);
      }
      wake();
    },
  });

  const stepTo = (index: number) => {
    const s = spin.current;
    const angle = ring.angles[index] ?? 0;
    // The nearest equivalent of -angle, so a step never spins the long way.
    const aim = s.theta + fold(-angle - s.theta);
    s.mode = "seek";
    s.aim = aim;
    s.held = true;
    s.probe = true;
    wake();
    const reading = Math.round((((-aim % 360) + 360) % 360) * 10) / 10;
    setReading({ angle: reading, index });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const { stops, angles } = ring;
    if (stops.length === 0) return;
    const s = spin.current;
    const here = topOf(angles, stops, s.mode === "seek" ? s.aim : s.theta);
    const at = Math.max(0, stops.indexOf(here));
    let to: number | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = stops[(at + 1) % stops.length];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = stops[(at - 1 + stops.length) % stops.length];
        break;
      case "PageDown":
      case "PageUp": {
        const quarter = event.key === "PageDown" ? 90 : -90;
        const goal = (angles[here] ?? 0) + quarter;
        to = topOf(angles, stops, -goal);
        break;
      }
      case "Home":
        to = stops[0];
        break;
      case "End":
        to = stops[stops.length - 1];
        break;
      case " ":
        event.preventDefault();
        setHalted((h) => !h);
        return;
      default:
        return;
    }
    event.preventDefault();
    // The ratchet ticks, and the host hears the step, as each letter passes
    // the top on the way.
    if (to !== undefined) stepTo(to);
  };

  const Tag = as;
  const stopped = paused || halted;
  const at = ring.chars[reading.index] ?? "";
  const valueText = /\s/.test(at)
    ? "A space at the top"
    : `“${at}” at the top${stopped ? ", paused" : ""}`;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative inline-block shrink-0 align-middle select-none",
        className,
      )}
      style={{ width: `${box}em`, height: `${box}em` }}
      onPointerEnter={() => {
        if (trigger === "hover") begin(!once, delay);
      }}
    >
      <Tag className="sr-only">{text}</Tag>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {track ? (
          <svg
            viewBox={`0 0 ${box} ${box}`}
            className="absolute inset-0 size-full overflow-visible"
          >
            <circle
              cx={r3(box / 2)}
              cy={r3(box / 2)}
              r={r3(R + 0.04)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              className="stroke-hairline-strong"
              strokeWidth={1}
            />
          </svg>
        ) : null}
        {/* A point at the centre turns, not a box: a turned box's corners
            would reach past the ring's own square. */}
        <motion.div
          className="absolute top-1/2 left-1/2 size-0"
          style={{ rotate: theta }}
        >
          {ring.chars.map((ch, i) => (
            <span
              key={i}
              ref={bindLetter(i)}
              className="absolute bottom-1/2 left-1/2 origin-bottom leading-none whitespace-pre"
              style={{
                transform: transformOf(ring.angles[i] ?? 0, R, 0),
                opacity: shown ? 1 : 0,
              }}
            >
              {ch}
            </span>
          ))}
        </motion.div>
      </div>
      {center !== undefined && center !== null ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {center}
        </div>
      ) : null}
      {interactive ? (
        <>
          <span
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Ring rotation"
            aria-describedby={hintId}
            aria-disabled={disabled || undefined}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={Math.round(reading.angle) % 360}
            aria-valuetext={valueText}
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              if (trigger === "hover") begin(!once, delay);
              // Only keyboard focus reads the top letter; a press that
              // focuses the ring is a hand on it, not a probe.
              if (!event.currentTarget.matches(":focus-visible")) return;
              const s = spin.current;
              s.probe = true;
              s.held = true;
              wake();
            }}
            onBlur={() => {
              const s = spin.current;
              s.probe = false;
              s.held = s.at !== null;
              wake();
            }}
            onPointerDown={drag.onPointerDown}
            onPointerMove={(event) => {
              drag.onPointerMove(event);
              if (disabled || event.pointerType === "touch") return;
              if (spin.current.mode !== "drag") {
                hover(event.clientX, event.clientY);
              }
            }}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={drag.onPointerCancel}
            onLostPointerCapture={drag.onLostPointerCapture}
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              if (spin.current.mode === "drag") return;
              away();
            }}
            className={cn(
              "absolute inset-0 touch-none rounded-full outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing",
            )}
          />
          <span id={hintId} className="sr-only">
            Arrow keys turn the ring a letter at a time, Page Up and Page Down a
            quarter turn, Space pauses or resumes it.
          </span>
        </>
      ) : null}
    </div>
  );
}
