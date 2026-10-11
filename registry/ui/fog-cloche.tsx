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
import { cn } from "@/registry/lib/utils";

export type FogClocheProps = {
  /** Whether the glass is lifted (controlled). */
  lifted?: boolean;
  /** Lift the glass from the start when uncontrolled. @default false */
  defaultLifted?: boolean;
  /** Fires from the press or key that lifted or lowered the glass, with the new state. */
  onLiftedChange?: (lifted: boolean) => void;
  /** How much fog the glass holds, 0 (a few wisps) to 1 (thick). @default 0.6 */
  density?: number;
  /** How fast the fog turns under the glass, 0 (still) to 1 (a slow whirl). @default 0.5 */
  swirl?: number;
  /** How far the fog runs across the floor when it spills, 0 (it pools at the base) to 1 (to the edges). @default 0.6 */
  spill?: number;
  /** How strong the light from above is, 0 to 1. @default 0.7 */
  light?: number;
  /** The fog's colour, any CSS colour. @default a pale cool white */
  fogColor?: string;
  /** How long the fog takes to gather again under the lowered glass, in ms. @default 2600 */
  gather?: number;
  /** Lower the glass by itself this many ms after it is lifted; 0 never. @default 0 */
  autoLower?: number;
  /** Freeze the fog. @default false */
  paused?: boolean;
  /** Seeds the fog and the moss. @default 5 */
  seed?: number;
  /** The glass's accessible name, completed with "lift" or "lower". @default "Cloche" */
  label?: string;
  /** No lifting or lowering. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the vitrine; give it a height. @default "h-52 w-full" */
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const pigment = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DEFAULT_FOG = pigment("--accent", 0.95, 0.014);

/* The scene, in a 200 × 200 frame bottom-centred in the box. */
const CX = 100;
const RIM = 176;
const APEX = 58;
const BASE_R = 76;
const TABLE = 187;
const DOME_H = RIM - APEX;
const LIFT = 36;

/** Inner half-width of the glass at height y. */
const innerR = (y: number) => {
  const t = clamp((RIM - y) / (DOME_H - 4), 0, 1);
  return 58 * Math.sqrt(Math.max(0, 1 - t * t));
};

const MOUND = "M 46 176 C 48 162 70 150 100 149 C 130 150 152 162 154 176 Z";

/** Height of the moss mound's top at x, for placing tufts on it. */
const moundTop = (x: number) => {
  const t = clamp((x - 46) / 108, 0, 1);
  return (
    RIM - Math.sin(t * Math.PI) * 26 * (0.75 + 0.25 * Math.sin(t * Math.PI))
  );
};

/** The moss cushion's tufts: small, seeded, lit from above, rounded for the server. */
function mossTufts(seed: number) {
  const rnd = lcg(seed * 53 + 7);
  const out: { x: number; y: number; r: number; tone: number }[] = [];
  for (let i = 0; i < 90; i += 1) {
    const x = 48 + rnd() * 104;
    const top = moundTop(x);
    // Most tufts sit on the crown, a few lower on the flanks.
    const y = top + Math.pow(rnd(), 2) * (RIM - top) * 0.9 + 1.5;
    const height = (RIM - y) / 26;
    out.push({
      x: r1(x),
      y: r1(y),
      r: r1(1.6 + rnd() * 2.4),
      tone: height > 0.55 && rnd() > 0.35 ? 2 : rnd() > 0.5 ? 1 : 0,
    });
  }
  return out.sort((a, b) => a.y - b.y);
}

/* ----------------------------------- fog ----------------------------------- */

const POOL = 200;

type Puff = {
  alive: boolean;
  /** 0 under the glass, 1 spilling over the base, 2 running on the floor. */
  mode: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  r0: number;
  y0: number;
  th: number;
  size: number;
  a: number;
  delay: number;
  salt: number;
};

type FogConfig = {
  density: number;
  swirl: number;
  spill: number;
  light: number;
  gather: number;
  paused: boolean;
  motionSafe: boolean;
  dpr: number;
  seed: number;
  fogKey: string;
};

type Fog = {
  configure: (cfg: FogConfig) => void;
  setLifted: (on: boolean) => void;
  stir: (x: number, y: number) => void;
  readColour: () => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

/**
 * The fog: soft puffs from one cached sprite. Under the glass each circles
 * the vertical axis (its angle gives x and a depth that scales and dims
 * it), rising in the middle and sinking at the sides, held inside the dome.
 * Lifted, they roll out from the bottom first, over the base and along the
 * floor to both sides, slowing, spreading and thinning to nothing; lowered,
 * new fog breathes up out of the moss until the dome is full again.
 */
function createFog(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carrier: HTMLElement,
  startLifted: boolean,
): Fog {
  const ctx = canvas.getContext("2d");
  const sprite = document.createElement("canvas");
  const pool: Puff[] = Array.from({ length: POOL }, () => ({
    alive: false,
    mode: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 0,
    r0: 0,
    y0: 0,
    th: 0,
    size: 0,
    a: 0,
    delay: 0,
    salt: 0,
  }));
  let cfg: FogConfig | null = null;
  let rnd = lcg(5);
  let lifted = startLifted;
  let liftedAt = 0;
  let clock = 0;
  let emitDebt = 0;
  let rmFade = 1;
  let w = 0;
  let h = 0;
  let ratio = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let frame = 0;
  let last = 0;
  let visible = false;
  let disposed = false;
  let pointer: { x: number; y: number; t: number } | null = null;

  const full = () => Math.round(40 + 140 * clamp(cfg?.density ?? 0.6, 0, 1));

  const paintSprite = () => {
    const S = 96;
    sprite.width = S;
    sprite.height = S;
    const g = sprite.getContext("2d");
    if (!g) return;
    const colour = getComputedStyle(carrier).color;
    g.clearRect(0, 0, S, S);
    // A wisp, not a disc: three offset soft blobs.
    const blobs: [number, number, number, number][] = [
      [0.5, 0.52, 0.46, 1],
      [0.38, 0.44, 0.3, 0.55],
      [0.62, 0.58, 0.28, 0.5],
    ];
    for (const [x, y, r, a] of blobs) {
      const grad = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
      grad.addColorStop(0, colour);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.globalAlpha = a;
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    }
    g.globalAlpha = 1;
  };

  const spawnInside = (p: Puff, settled: boolean) => {
    p.alive = true;
    p.mode = 0;
    p.salt = rnd();
    p.th = rnd() * Math.PI * 2;
    p.y0 = lerp(RIM - 12, APEX + 34, Math.pow(rnd(), 1.5));
    p.r0 = innerR(p.y0) * (0.4 + 0.55 * Math.sqrt(rnd()));
    p.size = 26 + rnd() * 22;
    p.vx = 0;
    p.vy = 0;
    p.delay = 0;
    if (settled) {
      p.y = p.y0;
      p.r = p.r0;
      p.a = 1;
    } else {
      // Breathing up out of the moss: small, low, faint, and rising.
      p.y = RIM - 10 - rnd() * 8;
      p.r = innerR(p.y) * rnd() * 0.7;
      p.a = 0;
    }
    p.x = CX + p.r * Math.cos(p.th);
  };

  const fill = () => {
    rnd = lcg((cfg?.seed ?? 5) * 7 + 3);
    for (const p of pool) p.alive = false;
    if (lifted) return;
    const n = full();
    for (let i = 0; i < n && i < POOL; i += 1) {
      const p = pool[i];
      if (p) spawnInside(p, true);
    }
  };

  const spillDistance = () => {
    const half = w / 2 / Math.max(0.01, scale);
    const reach = 0.25 + 0.75 * clamp(cfg?.spill ?? 0.6, 0, 1);
    return BASE_R + (half - BASE_R) * reach;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    const sw = clamp(c.swirl, 0, 1);
    const sp = clamp(c.spill, 0, 1);
    const reach = spillDistance();
    let inside = 0;
    for (const p of pool) {
      if (!p.alive) continue;
      if (p.mode === 0) {
        inside += 1;
        if (lifted && clock - liftedAt >= p.delay) {
          // Out it rolls: away from the axis, downward, lowest first.
          p.mode = 1;
          p.vx =
            Math.sign(p.x - CX || p.salt - 0.5) *
            (14 + p.salt * 14) *
            (0.6 + sp);
          p.vy = 6;
          continue;
        }
        const R = Math.max(4, innerR(p.y));
        const w0 = (0.18 + 1.05 * sw) * (0.7 + 0.5 * (1 - p.r / R));
        p.th += w0 * dt;
        p.r +=
          (p.r0 - p.r) * dt * 0.6 +
          Math.sin(clock * 0.7 + p.salt * 9) * 2.4 * sw * dt;
        // Convection: up the middle, down the sides.
        const lift = (0.45 - p.r / R) * 16 * (0.25 + sw);
        const ty = p.y0 - lift * 0.8 + Math.sin(clock * 0.5 + p.salt * 6) * 4;
        p.y += (ty - p.y) * dt * 0.5;
        p.y = clamp(p.y, APEX + 14, RIM - 5);
        p.r = clamp(p.r, 0, Math.max(0, innerR(p.y) - p.size * 0.22));
        if (p.a < 1) p.a = Math.min(1, p.a + dt / 1.1);
        p.x = CX + p.r * Math.cos(p.th);
      } else {
        // Spilling and running: fog is heavy, so it sinks, then spreads.
        p.vy += 48 * dt;
        p.vy *= Math.exp(-2.2 * dt);
        const onBase = Math.abs(p.x - CX) < BASE_R - 2;
        const ground = onBase ? RIM - 3 : TABLE - 2;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > ground) {
          p.y = ground;
          p.vy = 0;
          if (!onBase) p.mode = 2;
        }
        if (onBase) p.vx += Math.sign(p.vx) * 10 * dt;
        if (p.mode === 2) {
          p.vx *= Math.exp(-lerp(1.4, 0.45, sp) * dt);
          p.size += 14 * dt;
          p.y += Math.sin(clock * 1.3 + p.salt * 7) * 2 * dt;
        }
        const far = Math.abs(p.x - CX);
        const fadeRate = 1 / lerp(1.6, 4.2, sp) + (far > reach ? 1.6 : 0);
        p.a -= dt * (p.mode === 2 ? fadeRate : 0.08);
        if (pointer && clock - pointer.t < 0.25) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 900) {
            const k = (1 - d2 / 900) * 60 * dt;
            p.vx += Math.sign(dx || 1) * k * 4;
            p.y -= k * 0.4;
          }
        }
        if (p.a <= 0 || far > reach + 60) p.alive = false;
      }
    }
    // Lowered: new fog breathes up out of the moss until the dome is full.
    if (!lifted && clock - liftedAt > 0.35) {
      const n = full();
      emitDebt += (n / Math.max(0.3, c.gather / 1000)) * dt;
      while (emitDebt >= 1 && inside < n) {
        emitDebt -= 1;
        const p = pool.find((q) => !q.alive);
        if (!p) break;
        spawnInside(p, false);
        inside += 1;
      }
      if (inside >= n) emitDebt = 0;
    }
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || w < 1) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const base = (0.16 + 0.2 * clamp(c.density, 0, 1)) * rmFade;
    const lit = clamp(c.light, 0, 1);
    for (const p of pool) {
      if (!p.alive || p.a <= 0) continue;
      const depth = p.mode === 0 ? Math.sin(p.th) : 0;
      const size = p.size * (1 + 0.14 * depth) * scale;
      // On the floor fog lies low: wide and flat.
      const sx = p.mode === 2 ? 2.3 : p.mode === 1 ? 1.3 : 1;
      const sy = p.mode === 2 ? 0.55 : p.mode === 1 ? 0.8 : 1;
      // Fog near the top catches the light from above.
      const glow = 0.75 + 0.5 * lit * clamp((RIM - p.y) / DOME_H, 0, 1);
      ctx.globalAlpha = clamp(p.a * base * (0.8 + 0.2 * depth) * glow, 0, 1);
      ctx.drawImage(
        sprite,
        ox + p.x * scale - (size * sx) / 2,
        oy + p.y * scale - (size * sy) / 2 - (p.mode === 2 ? size * 0.12 : 0),
        size * sx,
        size * sy,
      );
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const alive = () => pool.some((p) => p.alive);

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c || c.paused) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let more = true;
    if (c.motionSafe) {
      step(dt);
      more = !lifted || alive();
    } else {
      // Reduced motion: no swirl. Lifted, the still cloud fades out; lowered,
      // it fades back in over the gather time.
      const target = lifted ? 0 : 1;
      const span = lifted ? 0.6 : Math.max(0.3, c.gather / 1000);
      rmFade += Math.sign(target - rmFade) * (dt / span);
      rmFade = clamp(rmFade, 0, 1);
      more = rmFade !== target;
      if (!more && lifted) for (const p of pool) p.alive = false;
    }
    draw();
    if (more) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden || cfg?.paused) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 1 || nh < 1) return;
    w = nw;
    h = nh;
    ratio = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    // The same fit as the scene's SVG: a square, bottom-centred, meet.
    const side = Math.min(w, h);
    scale = side / 200;
    ox = (w - side) / 2;
    oy = h - side;
    draw();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        paintSprite();
        fill();
        resize();
        kick();
        return;
      }
      if (was.fogKey !== next.fogKey) paintSprite();
      if (was.seed !== next.seed || was.density !== next.density) {
        if (!lifted) fill();
      }
      if (was.motionSafe !== next.motionSafe) {
        rmFade = 1;
        if (lifted && !next.motionSafe) for (const p of pool) p.alive = false;
        if (!lifted && !next.motionSafe) fill();
      }
      if (was.dpr !== next.dpr) resize();
      draw();
      kick();
    },
    setLifted(on) {
      if (on === lifted) return;
      lifted = on;
      liftedAt = clock;
      if (cfg && !cfg.motionSafe) {
        if (!on) fill();
        rmFade = on ? 1 : 0;
      } else if (on) {
        // Lowest first: each puff's turn to roll out comes with its height.
        for (const p of pool) {
          if (p.alive && p.mode === 0) {
            p.delay = ((RIM - p.y) / DOME_H) * 0.7 + p.salt * 0.12;
          }
        }
      }
      kick();
    },
    stir(x, y) {
      if (!lifted || w < 1) return;
      pointer = { x: (x - ox) / scale, y: (y - oy) / scale, t: clock };
      kick();
    },
    readColour() {
      paintSprite();
      draw();
    },
    resize,
    setVisible(on) {
      visible = on;
      if (on) {
        draw();
        kick();
      }
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component -------------------------------- */

const GLASS = "oklch(0.98 0.01 230)";

type DomeProps = {
  y: MotionValue<number> | number;
  rotate: MotionValue<number> | number;
  opacity?: MotionValue<number> | number;
};

/** The glass: a bell with a rim, a knob and two long highlights. */
function Dome({ y, rotate, opacity = 1 }: DomeProps) {
  return (
    <motion.g style={{ y, rotate, opacity, originX: 0.5, originY: 1 }}>
      <path
        d="M 40 176 C 40 122 50 62 100 60 C 150 62 160 122 160 176 Z"
        fill={GLASS}
        fillOpacity={0.07}
        stroke={GLASS}
        strokeOpacity={0.32}
        strokeWidth={1.1}
      />
      <path
        d="M 54 162 C 52 124 60 90 78 72"
        fill="none"
        stroke={GLASS}
        strokeOpacity={0.5}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <path
        d="M 60 120 C 61 104 64 92 70 84"
        fill="none"
        stroke={GLASS}
        strokeOpacity={0.8}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <path
        d="M 148 152 C 150 126 146 100 134 84"
        fill="none"
        stroke={GLASS}
        strokeOpacity={0.18}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <ellipse
        cx={100}
        cy={176}
        rx={60}
        ry={5}
        fill="none"
        stroke={GLASS}
        strokeOpacity={0.36}
        strokeWidth={1.4}
      />
      <rect
        x={97}
        y={50}
        width={6}
        height={11}
        rx={2}
        fill={GLASS}
        fillOpacity={0.3}
      />
      <circle
        cx={100}
        cy={48}
        r={6.5}
        fill={GLASS}
        fillOpacity={0.34}
        stroke={GLASS}
        strokeOpacity={0.5}
        strokeWidth={0.8}
      />
      <circle cx={98} cy={46} r={1.8} fill={GLASS} fillOpacity={0.85} />
    </motion.g>
  );
}

/**
 * A glass cloche on a turned wooden base over a cushion of moss, in a small
 * vitrine lit from above, with fog slowly swirling under the glass. Press it
 * (or Enter or Space) and the glass lifts on the snap spring, tipping a
 * little; the fog rolls out from under the rim, lowest first, over the base
 * and across the floor to both sides, slowing, spreading and thinning away.
 * Press again and the glass comes down on the glide spring, settles with a
 * small recoil rock, and new fog breathes up out of the moss until the dome
 * is full again.
 *
 * The fog is a Canvas 2D field of soft puffs from one cached sprite; the
 * vitrine, base, moss and glass are SVG. The glass is a real toggle button
 * with `aria-pressed`. Under reduced motion the glass cross-fades between
 * down and up, the fog is a still cloud that fades out when lifted and back
 * in when lowered.
 */
export function FogCloche({
  lifted,
  defaultLifted = false,
  onLiftedChange,
  density = 0.6,
  swirl = 0.5,
  spill = 0.6,
  light = 0.7,
  fogColor = DEFAULT_FOG,
  gather = 2600,
  autoLower = 0,
  paused = false,
  seed = 5,
  label = "Cloche",
  disabled = false,
  dpr = 2,
  className,
}: FogClocheProps) {
  const motionSafe = useMotionSafe();
  const stillId = `fog-cloche-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [own, setOwn] = React.useState(defaultLifted);
  const isUp = lifted ?? own;

  const lift = useMotionValue(isUp ? 1 : 0);
  const hover = useMotionValue(0);
  const rock = useMotionValue(0);
  const domeY = useTransform(
    [lift, hover] as MotionValue<number>[],
    ([l, hv]) => r2(-(l as number) * LIFT - (hv as number) * 3),
  );
  const domeRotate = useTransform(
    [lift, rock] as MotionValue<number>[],
    ([l, k]) => r2(-(l as number) * 4 + (k as number)),
  );
  // Reduced motion: two glasses, down and up, cross-faded.
  const downOpacity = useTransform(lift, (l) => r2(1 - l));
  const upOpacity = useTransform(lift, (l) => r2(l));

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seenUp, setSeenUp] = React.useState(isUp);
  if (seenUp !== isUp) {
    setSeenUp(isUp);
    setSaid((x) => ({
      n: x.n + 1,
      text: isUp
        ? "Cloche lifted, the fog spills out."
        : "Cloche lowered, fog gathering.",
    }));
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const fog = React.useRef<Fog | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const shown = React.useRef(isUp);
  const startUp = React.useRef(isUp);

  const config: FogConfig = {
    density,
    swirl,
    spill,
    light,
    gather,
    paused,
    motionSafe,
    dpr,
    seed,
    fogKey: fogColor,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    fog.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !carrier) return;
    const f = createFog(root, canvas, carrier, startUp.current);
    fog.current = f;
    f.configure(latest.current);
    f.setLifted(shown.current);
    const sizer = new ResizeObserver(() => f.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      f.setVisible(Boolean(entry?.isIntersecting));
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) f.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      f.dispose();
      if (fog.current === f) fog.current = null;
    };
  }, []);

  /** Moves the glass to its new place: snap up, glide down and a recoil rock. */
  const move = React.useCallback(
    (up: boolean) => {
      for (const c of running.current) c.stop();
      fog.current?.setLifted(up);
      if (!motionSafe) {
        running.current = [
          animate(lift, up ? 1 : 0, {
            duration: durations.base,
            ease: easings.move,
          }),
        ];
        return;
      }
      if (up) {
        running.current = [animate(lift, 1, springs.snap)];
        return;
      }
      running.current = [
        animate(lift, 0, {
          ...springs.glide,
          onComplete: () => {
            rock.jump(0.9);
            running.current = [animate(rock, 0, springs.recoil)];
          },
        }),
      ];
    },
    [lift, motionSafe, rock],
  );

  // Every change of state — a press, a key, the host — moves the glass.
  React.useEffect(() => {
    if (shown.current === isUp) return;
    shown.current = isUp;
    move(isUp);
  }, [isUp, move]);

  // Reduced motion snaps an in-flight glass to where it belongs.
  React.useEffect(() => {
    if (motionSafe) return;
    for (const c of running.current) c.stop();
    lift.jump(shown.current ? 1 : 0);
    rock.jump(0);
  }, [motionSafe, lift, rock]);

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
    },
    [],
  );

  const toggle = () => {
    if (disabled) return;
    const next = !isUp;
    if (lifted === undefined) setOwn(next);
    onLiftedChange?.(next);
  };

  // Lower by itself after a while, if asked to. The host's callback is read
  // when the time comes, so a re-render never restarts the wait.
  const host = React.useRef({ lifted, onLiftedChange });
  React.useEffect(() => {
    host.current = { lifted, onLiftedChange };
  });
  React.useEffect(() => {
    if (!isUp || autoLower <= 0 || disabled) return;
    const t = window.setTimeout(() => {
      const H = host.current;
      if (H.lifted === undefined) setOwn(false);
      H.onLiftedChange?.(false);
    }, autoLower);
    return () => window.clearTimeout(t);
  }, [isUp, autoLower, disabled]);

  const lit = clamp(light, 0, 1);
  const tufts = React.useMemo(() => mossTufts(seed), [seed]);
  const mossTones = [
    pigment("--success", 0.32, 0.07, 8),
    pigment("--success", 0.42, 0.09, 2),
    pigment("--success", 0.55, 0.11, -12),
  ];
  const wood = pigment("--warn", 0.46, 0.06, -20);
  const woodDark = pigment("--warn", 0.32, 0.05, -24);
  const woodLight = pigment("--warn", 0.58, 0.06, -18);
  const room = pigment("--accent", 0.22, 0.03);
  const roomDeep = pigment("--accent", 0.15, 0.025);
  const table = pigment("--warn", 0.27, 0.025, -20);
  const warmLight = pigment("--warn", 0.96, 0.03);

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/fog-cloche [container-type:size] relative isolate h-52 w-full overflow-clip rounded-3 select-none",
        className,
      )}
      style={{
        backgroundImage: `radial-gradient(70% 90% at 50% 0%, color-mix(in oklab, ${warmLight} ${Math.round(8 + 16 * lit)}%, transparent), transparent 70%), linear-gradient(to bottom, ${room}, ${roomDeep})`,
      }}
    >
      {/* The table the base stands on, its front edge catching the light. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          top: `calc(100% - min(100cqh, 100cqw) * ${r2((200 - TABLE) / 200)})`,
          backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${warmLight} ${Math.round(6 + 10 * lit)}%, ${table}) 0 1px, ${table} 1px, color-mix(in oklab, ${table} 70%, black))`,
        }}
      />
      {/* The light from above: a soft cone onto the glass. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: r2(0.25 + 0.75 * lit),
          backgroundImage: `conic-gradient(from 180deg at 50% -12%, transparent 160deg, color-mix(in oklab, ${warmLight} 9%, transparent) 172deg, color-mix(in oklab, ${warmLight} 13%, transparent) 180deg, color-mix(in oklab, ${warmLight} 9%, transparent) 188deg, transparent 200deg)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0">
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMax meet"
          className="absolute inset-0 size-full"
        >
          <defs>
            <radialGradient id={stillId}>
              <stop offset="0" stopColor={fogColor} stopOpacity={0.5} />
              <stop offset="1" stopColor={fogColor} stopOpacity={0} />
            </radialGradient>
          </defs>
          {/* The base: a turned disc with its side in shadow. */}
          <path
            d={`M ${CX - BASE_R} ${RIM} L ${CX - BASE_R} ${RIM + 9} A ${BASE_R} 11 0 0 0 ${CX + BASE_R} ${RIM + 9} L ${CX + BASE_R} ${RIM} Z`}
            fill={woodDark}
          />
          <ellipse cx={CX} cy={RIM} rx={BASE_R} ry={11} fill={wood} />
          <ellipse
            cx={CX}
            cy={RIM}
            rx={BASE_R - 6}
            ry={8}
            fill="none"
            stroke={woodLight}
            strokeOpacity={0.5}
            strokeWidth={0.8}
          />
          {/* The moss cushion: a mound, and its tufts lit from above. */}
          <path d={MOUND} fill={mossTones[0]} />
          {tufts.map((t, i) => (
            <circle
              key={i}
              cx={t.x}
              cy={t.y}
              r={t.r}
              fill={mossTones[t.tone] ?? mossTones[0]}
            />
          ))}
          {/* The server's still fog, until the live fog is drawn. */}
          <g className="transition-opacity duration-500 group-data-live/fog-cloche:opacity-0">
            {isUp ? null : (
              <>
                <ellipse
                  cx={CX}
                  cy={150}
                  rx={56}
                  ry={26}
                  fill={`url(#${stillId})`}
                />
                <ellipse
                  cx={86}
                  cy={128}
                  rx={36}
                  ry={22}
                  fill={`url(#${stillId})`}
                />
                <ellipse
                  cx={118}
                  cy={112}
                  rx={30}
                  ry={20}
                  fill={`url(#${stillId})`}
                />
              </>
            )}
          </g>
        </svg>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMax meet"
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        {motionSafe ? (
          <Dome y={domeY} rotate={domeRotate} />
        ) : (
          <>
            <Dome y={0} rotate={0} opacity={downOpacity} />
            <Dome y={-LIFT} rotate={-4} opacity={upOpacity} />
          </>
        )}
      </svg>
      <button
        type="button"
        aria-pressed={isUp}
        aria-label={`${label}: ${isUp ? "lower the glass" : "lift the glass"}`}
        disabled={disabled}
        onClick={toggle}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || !motionSafe || disabled) return;
          animate(hover, 1, springs.flick);
        }}
        onPointerLeave={() => {
          animate(hover, 0, springs.flick);
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const r = event.currentTarget.getBoundingClientRect();
          fog.current?.stir(event.clientX - r.left, event.clientY - r.top);
        }}
        className={cn(
          "absolute inset-0 rounded-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      />
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => fog.current?.readColour()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: fogColor }}
      />
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
