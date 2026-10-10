"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DotTideColor = "cobalt" | "sea" | "ember" | "ink";

export type DotTideProps = {
  /** The content on top of the field: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The distance between dots, px, 6 to 64. @default 16 */
  spacing?: number;
  /** How fast the tide runs, 0 (slack water) to 2. @default 0.6 */
  speed?: number;
  /** The dots' colour: a named one, or any CSS colour. @default "cobalt" */
  color?: DotTideColor | (string & {});
  /** The largest dot, as a share of a cell, 0.2 to 1. @default 0.72 */
  size?: number;
  /** How far the tide swings the dots between a fine point and full size, 0 to 1. @default 0.7 */
  swell?: number;
  /** Which way the tide runs, degrees anticlockwise from rightward. @default 24 */
  angle?: number;
  /** How far the colour turns in hue from trough to crest, 0 to 1. @default 0.5 */
  shift?: number;
  /** How fast a press's wave runs out through the field, px per second. @default 720 */
  waveSpeed?: number;
  /** The pointer and keyboard focus raise the tide, and a press sends a wave. @default true */
  interactive?: boolean;
  /** How high the tide rises under the hand, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the rise under the hand reaches, px. @default 140 */
  radius?: number;
  /** Stop the tide; waves and the hand still move the dots. @default false */
  paused?: boolean;
  /** Seeds where the tide starts, so two fields never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) raising the tide. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus sends a wave, with where it started in px from the box's top left. */
  onWave?: (x: number, y: number) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const COLORS: Record<DotTideColor, string> = {
  cobalt: "var(--accent-bright)",
  sea: "var(--signal)",
  ember: "oklch(from var(--danger) l calc(c * 0.85) calc(h + 18))",
  ink: "var(--foreground)",
};

/** Colour tones from trough to crest, mixed by the browser. */
const TONES = 9;
const STEP = 1 / 120;
/** The hand's mound follows on glide and comes and goes on drift. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/**
 * Each dot rides its own recoil spring: the passing ring kicks it, so it
 * pops, overshoots back twice and settles, and the ring leaves a ringing
 * wake behind it.
 */
const RECOIL = springs.recoil;
const KICK = 30;
const MAX_RINGS = 6;
/** The three tidal waves: wavelength px, turn off `angle` in degrees, share, pace. */
const WAVES = [
  { length: 520, turn: 0, share: 0.5, pace: 1 },
  { length: 340, turn: 35, share: 0.3, pace: 0.8 },
  { length: 900, turn: -20, share: 0.2, pace: 0.4 },
] as const;
/** The tide's crest speed at speed 1, px/s. */
const TIDE = 60;
/** The composed moment the reduced-motion field is drawn at, s. */
const STILL_TIME = 7.3;
/** A tint fades with this time constant, s; a still press's tint, faster. */
const TINT_FADE = 0.5;
const STILL_FADE = 0.3;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string) => {
    if (!ctx) return "rgb(0, 0, 0)";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
  };
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  spacing: number;
  speed: number;
  paintKey: string;
  size: number;
  swell: number;
  angle: number;
  waveSpeed: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onWave: (x: number, y: number) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  wave: (x: number, y: number, amp: number) => void;
  dispose: () => void;
};

type Field = {
  n: number;
  sp: number;
  x: Float32Array;
  y: Float32Array;
  /** Each dot's spring: displacement and velocity, in shares of full size. */
  e: Float32Array;
  v: Float32Array;
  tint: Float32Array;
  tone: Uint8Array;
  radius: Float32Array;
};

type Ring = { x: number; y: number; age: number; amp: number; live: boolean };

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  const read = rgbReader();
  const size = { w: 0, h: 0, dpr: 1 };
  const sim = { t: 0, springing: false };
  let tones: string[] = [];
  let field: Field | null = null;
  const rings: Ring[] = Array.from({ length: MAX_RINGS }, () => ({
    x: 0,
    y: 0,
    age: 0,
    amp: 0,
    live: false,
  }));
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** The grid is centred on the box: a dot sits at its middle, margins match. */
  const lay = (c: Config) => {
    const sp = clamp(c.spacing, 6, 64);
    const kx = Math.max(0, Math.floor((size.w / 2 - sp / 2) / sp));
    const ky = Math.max(0, Math.floor((size.h / 2 - sp / 2) / sp));
    const cols = kx * 2 + 1;
    const rows = ky * 2 + 1;
    const n = cols * rows;
    const f: Field = {
      n,
      sp,
      x: new Float32Array(n),
      y: new Float32Array(n),
      e: new Float32Array(n),
      v: new Float32Array(n),
      tint: new Float32Array(n),
      tone: new Uint8Array(n),
      radius: new Float32Array(n),
    };
    for (let r = 0; r < rows; r += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = r * cols + col;
        f.x[i] = size.w / 2 + (col - kx) * sp;
        f.y[i] = size.h / 2 + (r - ky) * sp;
      }
    }
    field = f;
    sim.springing = false;
  };

  const settleHand = (c: Config, dt: number) => {
    const target = hand.present && c.interactive ? 1 : 0;
    if (!c.motionSafe) {
      // Reduced motion: the mound lands where the hand is.
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
      hand.amount = target;
      hand.amountV = 0;
      return false;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (target - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount = clamp(hand.amount + hand.amountV * h, 0, 1.2);
    }
    const moving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!moving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const arriving =
      Math.abs(target - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = target;
      hand.amountV = 0;
    }
    return moving || arriving;
  };

  /** Rings run out; each dot a ring's front crosses gets kicked. */
  const runRings = (c: Config, dt: number) => {
    const f = field;
    if (!f) return false;
    const reachMax = Math.hypot(size.w, size.h) + f.sp;
    const pace = clamp(c.waveSpeed, 60, 4000);
    let any = false;
    for (const ring of rings) {
      if (!ring.live) continue;
      const before = ring.age * pace;
      ring.age += dt;
      const after = ring.age * pace;
      for (let i = 0; i < f.n; i += 1) {
        const d = Math.hypot((f.x[i] ?? 0) - ring.x, (f.y[i] ?? 0) - ring.y);
        if (d <= before || d > after) continue;
        const fall = ring.amp / Math.sqrt(1 + d / 320);
        f.v[i] = (f.v[i] ?? 0) + KICK * fall;
        f.tint[i] = Math.max(f.tint[i] ?? 0, fall);
      }
      if (after > reachMax) ring.live = false;
      else any = true;
    }
    return any;
  };

  /** Steps every dot's recoil spring and fades the tints; true while any moves. */
  const settleDots = (dt: number, still: boolean) => {
    const f = field;
    if (!f) return false;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const fade = Math.exp(-dt / (still ? STILL_FADE : TINT_FADE));
    const floor = still ? 0.04 : 0.01;
    let moving = false;
    for (let i = 0; i < f.n; i += 1) {
      let e = f.e[i] ?? 0;
      let v = f.v[i] ?? 0;
      const tint = (f.tint[i] ?? 0) * fade;
      f.tint[i] = tint < floor ? 0 : tint;
      if (tint >= floor) moving = true;
      if (e === 0 && v === 0) continue;
      for (let s = 0; s < steps; s += 1) {
        v += ((-RECOIL.stiffness * e - RECOIL.damping * v) / RECOIL.mass) * h;
        e += v * h;
      }
      if (Math.abs(e) < 0.002 && Math.abs(v) < 0.02) {
        e = 0;
        v = 0;
      } else moving = true;
      f.e[i] = e;
      f.v[i] = v;
    }
    return moving;
  };

  /** Every dot's size and tone now, from the tide, the hand and its spring. */
  const shape = (c: Config) => {
    const f = field;
    if (!f) return;
    const base = (f.sp * clamp(c.size, 0.2, 1)) / 2;
    const swell = clamp(c.swell, 0, 1);
    const a = (clamp(c.angle, -360, 360) * Math.PI) / 180;
    const t = sim.t;
    const w0 = WAVES[0];
    const w1 = WAVES[1];
    const w2 = WAVES[2];
    const dir = (turn: number) => {
      const r = a + (turn * Math.PI) / 180;
      return [Math.cos(r), -Math.sin(r)] as const;
    };
    const [c0, s0] = dir(w0.turn);
    const [c1, s1] = dir(w1.turn);
    const [c2, s2] = dir(w2.turn);
    const k0 = (Math.PI * 2) / w0.length;
    const k1 = (Math.PI * 2) / w1.length;
    const k2 = (Math.PI * 2) / w2.length;
    const o0 = k0 * TIDE * w0.pace * t;
    const o1 = k1 * TIDE * w1.pace * t;
    const o2 = k2 * TIDE * w2.pace * t;
    const lift = clamp(c.pointerStrength, 0, 1) * hand.amount * 0.6;
    const r2 = Math.pow(clamp(c.radius, 20, 800), 2);
    for (let i = 0; i < f.n; i += 1) {
      const x = f.x[i] ?? 0;
      const y = f.y[i] ?? 0;
      let tide =
        0.5 +
        0.5 *
          (w0.share * Math.sin(k0 * (x * c0 + y * s0) - o0) +
            w1.share * Math.sin(k1 * (x * c1 + y * s1) - o1) +
            w2.share * Math.sin(k2 * (x * c2 + y * s2) - o2)) *
          1.6;
      if (lift > 0) {
        const dx = x - hand.px;
        const dy = y - hand.py;
        tide += lift * Math.exp(-(dx * dx + dy * dy) / r2);
      }
      const e = f.e[i] ?? 0;
      const share = clamp(0.55 + (tide - 0.5) * swell + e * 0.9, 0.06, 1.3);
      f.radius[i] = base * share;
      const tone = clamp(
        tide + (f.tint[i] ?? 0) * 0.7 + Math.max(0, e) * 0.5,
        0,
        1,
      );
      f.tone[i] = Math.round(tone * (TONES - 1));
    }
  };

  const draw = () => {
    const c = cfg;
    const f = field;
    if (!c || !f || !ctx || !visible.current || size.w < 1) return;
    shape(c);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    // One fill per tone: the browser mixed the tones, the dots only pick one.
    for (let k = 0; k < TONES; k += 1) {
      ctx.fillStyle = tones[k] ?? "rgb(0, 0, 0)";
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < f.n; i += 1) {
        if (f.tone[i] !== k) continue;
        const r = f.radius[i] ?? 0;
        const x = f.x[i] ?? 0;
        const y = f.y[i] ?? 0;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        any = true;
      }
      if (any) ctx.fill();
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const calm = () =>
    !sim.springing &&
    !rings.some((r) => r.live) &&
    hand.px === hand.x &&
    hand.py === hand.y &&
    (hand.amount === 0 || hand.amount === 1);

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !field) {
      last = 0;
      return;
    }
    // The tide alone draws thirty frames a second; a wave or the hand gets
    // every frame.
    if (calm() && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const tiding = c.motionSafe && !c.paused && clamp(c.speed, 0, 2) > 0;
    if (tiding) sim.t += dt * clamp(c.speed, 0, 2);
    const handMoving = settleHand(c, dt);
    const ringing = c.motionSafe ? runRings(c, dt) : false;
    sim.springing = settleDots(dt, !c.motionSafe);
    draw();
    if (tiding || handMoving || ringing || sim.springing) {
      frame = window.requestAnimationFrame(tick);
    } else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !field)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const out: string[] = [];
    for (let k = 0; k < TONES; k += 1) {
      const el = kids[k];
      out.push(read(el ? getComputedStyle(el).color : "rgb(0, 0, 0)"));
    }
    tones = out;
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    if (size.w === w && size.h === h && size.dpr === dpr && field) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    lay(c);
    draw();
    kick();
  };

  const startAt = (c: Config) => {
    // The seed picks where in the tide the field starts; reduced motion
    // holds a composed moment.
    sim.t = c.motionSafe ? lcg(c.seed * 41 + 9)() * 60 : STILL_TIME;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        startAt(next);
        readColours();
        resize();
        return;
      }
      if (was.seed !== next.seed || was.motionSafe !== next.motionSafe) {
        startAt(next);
        for (const ring of rings) ring.live = false;
      }
      if (was.paintKey !== next.paintKey) readColours();
      if (was.spacing !== next.spacing && size.w > 0) lay(next);
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    handTo(x, y, source) {
      if (!hand.present || hand.amount < 0.01) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      kick();
    },
    wave(x, y, amp) {
      const c = cfg;
      const f = field;
      if (!c || !f || !c.interactive) return;
      c.onWave(Math.round(x), Math.round(y));
      if (!c.motionSafe) {
        // Nothing travels: the dots round the press take the crest's tint
        // where they stand and fade back.
        const reach = clamp(c.radius, 20, 800) * 1.2;
        for (let i = 0; i < f.n; i += 1) {
          const d = Math.hypot((f.x[i] ?? 0) - x, (f.y[i] ?? 0) - y);
          if (d < reach) {
            f.tint[i] = Math.max(f.tint[i] ?? 0, (1 - d / reach) * amp);
          }
        }
        sim.springing = true;
        kick();
        return;
      }
      let ring = rings.find((r) => !r.live);
      if (!ring) {
        // All running: the oldest gives way.
        ring = rings.reduce((a, b) => (b.age > a.age ? b : a));
      }
      ring.x = x;
      ring.y = y;
      ring.age = 0;
      ring.amp = amp;
      ring.live = true;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background that is a regular dot grid, centred in the box, with a slow
 * tide running through it and the content on top in its own layer. Three
 * long travelling waves sum into a height that raises and lowers every dot
 * between a fine point and most of a cell, and the colour shifts along the
 * wave — troughs washed into the page, crests in the full colour turned a
 * little in hue.
 *
 * The tide rises gently under the hand, the mound's place following on
 * glide and its presence on drift. A press sends a fast circular wave
 * through the field: every dot rides its own recoil spring, so the ring
 * kicks each dot it crosses up, it overshoots back twice and settles, and
 * the ring leaves a ringing, brightened wake. Keyboard focus on a control
 * inside raises the tide there and sends a softer wave from it. Canvas 2D,
 * nine fills a frame, thirty frames a second while only the tide runs; only
 * on screen in a visible page. Under reduced motion the tide is still at a
 * composed moment, the mound lands under the hand, and a press tints the
 * dots round it without anything travelling.
 */
export function DotTide({
  children,
  spacing = 16,
  speed = 0.6,
  color = "cobalt",
  size = 0.72,
  swell = 0.7,
  angle = 24,
  shift = 0.5,
  waveSpeed = 720,
  interactive = true,
  pointerStrength = 0.6,
  radius = 140,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onWave,
  className,
}: DotTideProps) {
  const motionSafe = useMotionSafe();
  const ink = Object.prototype.hasOwnProperty.call(COLORS, color)
    ? COLORS[color as DotTideColor]
    : String(color);
  const turn = Math.round(clamp(shift, 0, 1) * 36);
  const paints = React.useMemo(() => {
    const trough = `color-mix(in oklab, ${ink} 26%, var(--background))`;
    const crest = `oklch(from ${ink} l c calc(h + ${turn}))`;
    return Array.from({ length: TONES }, (_, k) => {
      const share = Math.round((k / (TONES - 1)) * 1000) / 10;
      return `color-mix(in oklab, ${crest} ${share}%, ${trough})`;
    });
  }, [ink, turn]);
  const paintKey = paints.join("|");
  const sp = clamp(spacing, 6, 64);
  const restDot =
    Math.round(((sp * clamp(size, 0.2, 1)) / 2) * 0.55 * 100) / 100;
  const restEdge = Math.round((restDot + 0.6) * 100) / 100;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onWave });

  const config: Config = {
    spacing,
    speed,
    paintKey,
    size,
    swell,
    angle,
    waveSpeed,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onWave: (x, y) => report.current.onWave?.(x, y),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onWave };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) {
      engine.current?.wave(at.x, at.y, 1);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside raises the tide there and sends a
  // softer wave from it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.wave(at.x, at.y, 0.6);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways drag carries the rise on touch; an upright one scrolls.
        "group/dot-tide relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, var(--background) 97%, ${ink})`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {/*
       * The designed still for the server render and the first paint: the
       * same centred grid at rest, every dot at mid size in a mid tone.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/dot-tide:opacity-0"
        style={{
          backgroundImage: `radial-gradient(circle, ${paints[4]} 0 ${restDot}px, transparent ${restEdge}px)`,
          backgroundSize: `${sp}px ${sp}px`,
          backgroundPosition: "center",
        }}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}
