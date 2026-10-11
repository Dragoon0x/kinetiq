"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GateRingsFinish = "brass" | "steel" | "copper" | "smoke";

export type GateRingsProps = {
  /** How many nested rings, 3 to 7. @default 5 */
  ringCount?: number;
  /** The rings' metal. @default "brass" */
  finish?: GateRingsFinish;
  /** How hard a flick or Space throws the rings and how long they coast, 0 to 1. @default 0.6 */
  spin?: number;
  /** The rings swung flat into one halo (controlled). */
  aligned?: boolean;
  /** Start as a flat halo. @default false */
  defaultAligned?: boolean;
  /** Fires from the click, key or drag that swung the rings flat or out of it. */
  onAlignedChange?: (aligned: boolean) => void;
  /** Fires when the beam starts or stops getting through, with how many gaps are in line. */
  onBeamChange?: (through: boolean, inLine: number) => void;
  /** The beam's direction from the core, degrees clockwise from the right. @default 0 */
  beamAngle?: number;
  /** The cut in each ring, degrees, 10 to 60. @default 26 */
  gap?: number;
  /** How far the rings stand tilted at rest, degrees, 0 to 80. @default 62 */
  tilt?: number;
  /** The core's light and the beam, any CSS colour (its hue is used, at a fixed brightness). @default "var(--warn)" */
  light?: string;
  /** The rings' thickness, px. @default fitted to the box */
  thickness?: number;
  /** Hold the rings where they are. @default false */
  paused?: boolean;
  /** Seeds the rest tilts and the way a throw shares out. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** A detent click as each ring's gap locks into line, after a visitor's action. @default false */
  sound?: boolean;
  /** The control's accessible name. @default "Gate rings" */
  label?: string;
  /** No spinning or swinging. @default false */
  disabled?: boolean;
  /** Sizes the piece; it fills its parent by default (h-full w-full). */
  className?: string;
};

const MAX_RINGS = 7;
const SEGMENTS = 96;
const TAU = Math.PI * 2;
/** The rest tilts, as shares of `tilt`: the outer ring faces you, the rest stand at gimbal angles. */
const PATTERN = [0, 1, -0.68, 0.84, -0.42, 0.62, -0.24];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** An angle folded into (-π, π]. */
const wrap = (a: number) => a - TAU * Math.round(a / TAU);

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Each finish: the token whose hue it takes, a turn of that hue, its chroma and its range of lightness. */
const FINISH: Record<
  GateRingsFinish,
  { token: string; turn: number; chroma: number; lo: number; hi: number }
> = {
  brass: { token: "--warn", turn: -6, chroma: 0.1, lo: 0.3, hi: 0.95 },
  copper: { token: "--danger", turn: 22, chroma: 0.11, lo: 0.28, hi: 0.93 },
  steel: { token: "--accent", turn: 0, chroma: 0.014, lo: 0.3, hi: 0.97 },
  smoke: { token: "--accent", turn: 0, chroma: 0.03, lo: 0.14, hi: 0.86 },
};

const FALLBACK_HUE: Record<string, number> = {
  "--warn": 80,
  "--danger": 25,
  "--accent": 262,
};

/** The hue of a computed CSS colour, in degrees: read from oklch(), or converted from sRGB. */
function hueOf(css: string): number | null {
  const ok = /oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)/.exec(css);
  if (ok?.[1]) return Number(ok[1]);
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css);
  if (!rgb?.[1] || !rgb[2] || !rgb[3]) return null;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(Number(rgb[1]));
  const g = lin(Number(rgb[2]));
  const b = lin(Number(rgb[3]));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}

type Ring = {
  alpha: number;
  wAlpha: number;
  phi: number;
  wPhi: number;
  rest: number;
  locked: boolean;
};

type Mode = "free" | "halo" | "gyro";

type Engine = {
  /** Swing to the halo, or back to the gyroscope. */
  swing: (toHalo: boolean, byVisitor: boolean) => void;
  /** A drag takes hold: the rings stop and follow the hand. */
  grab: () => void;
  /** The hand moves: tumble (in radii) and axle turn (in radians). */
  turn: (tumble: number, axle: number) => void;
  /** A throw, in radii and radians per second. */
  kick: (vx: number, vTurn: number, byVisitor: boolean) => void;
  /** A seeded throw, for Space. */
  spinUp: (byVisitor: boolean) => void;
  /** Escape: a spin settles at once on the glide spring. Reports whether it did. */
  brake: () => boolean;
};

/** The pose of the static frame: every axle on the beam, every ring at its rest tilt. */
const restTilts = (n: number, tilt: number, seed: number) =>
  Array.from({ length: n }, (_, i) => {
    const base = PATTERN[i % PATTERN.length] ?? 0;
    const jitter = (hash(seed, i, 3) - 0.5) * 0.14;
    return (
      ((clamp(tilt, 0, 80) * Math.PI) / 180) * base + (i === 0 ? 0 : jitter)
    );
  });

/** A ring as the server draws it: the ellipse a tilted circle projects to, cut at its axle's end. */
function staticArc(R: number, phi: number, beta: number, gapHalf: number) {
  const ry = Math.max(0.5, Math.abs(R * Math.cos(phi)));
  const pt = (u: number) => {
    const x = R * Math.cos(u);
    const y = ry * Math.sin(u);
    return [
      r2(100 + x * Math.cos(beta) - y * Math.sin(beta)),
      r2(100 + x * Math.sin(beta) + y * Math.cos(beta)),
    ] as const;
  };
  const a = pt(gapHalf);
  const b = pt(TAU - gapHalf);
  const rot = r2((beta * 180) / Math.PI);
  return `M ${a[0]} ${a[1]} A ${r2(R)} ${r2(ry)} ${rot} 1 1 ${b[0]} ${b[1]}`;
}

/**
 * A small gyroscope of nested polished rings around a glowing core, drawn
 * in Canvas 2D with real 3D. Every ring tumbles about its own axle — a
 * diameter whose direction can itself turn — and is cut with one gap at the
 * axle's end, so when the axles line up on the beam line the gaps sit one
 * behind another and the core's light passes clean out through them, whatever
 * the rings' tilts. Each segment is lit as a tube, so a glint runs round a
 * ring as it tumbles.
 *
 * A drag grabs it: horizontal travel tumbles the rings 1:1, circling the
 * centre turns their axles, and the release throws each ring its own share,
 * so they drift apart. They coast on friction (`spin`); as they slow, a field
 * draws each axle back to the beam line and each tilt to its rest, the light
 * flickering through as gaps sweep past and steadying as each one locks with
 * a detent. A click or Enter swings them flat — every tilt to zero on the
 * springs.snap constants, outer ring first in a cascade — into one concentric
 * halo, and back again. Space spins them, Escape brakes a spin. Under reduced
 * motion every change is a new still pose at once, and the beam still shows
 * whenever the gaps are in line.
 */
export function GateRings({
  ringCount = 5,
  finish = "brass",
  spin = 0.6,
  aligned,
  defaultAligned = false,
  onAlignedChange,
  onBeamChange,
  beamAngle = 0,
  gap = 26,
  tilt = 62,
  light = "var(--warn)",
  thickness,
  paused = false,
  seed = 1,
  dpr = 2,
  sound = false,
  label = "Gate rings",
  disabled = false,
  className,
}: GateRingsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const glowId = `${uid}-glow`;
  const beamId = `${uid}-beam`;
  const n = Math.round(clamp(ringCount, 3, MAX_RINGS));
  const beta = (beamAngle * Math.PI) / 180;
  const gapHalf = (clamp(gap, 10, 60) * Math.PI) / 360;

  const controlled = aligned !== undefined;
  const [own, setOwn] = React.useState(defaultAligned);
  const isAligned = controlled ? aligned : own;
  const [painted, setPainted] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const shownAligned = React.useRef(isAligned);
  const grip = React.useRef({
    angle: 0,
    turn: 0,
    centre: { x: 0, y: 0 },
    tracker: createVelocityTracker(90),
  });
  const rests = React.useMemo(() => restTilts(n, tilt, seed), [n, tilt, seed]);

  /** The simulation's controls, owned by the drawing effect. */
  const engine = React.useRef<Engine | null>(null);
  const latest = React.useRef({
    onBeamChange,
    spin,
    motionSafe,
    audio,
    gapHalf,
    beta,
    seed,
    n,
  });
  React.useEffect(() => {
    latest.current = {
      onBeamChange,
      spin,
      motionSafe,
      audio,
      gapHalf,
      beta,
      seed,
      n,
    };
  });

  /**
   * Reports a new halo state. A click or Enter also swings the rings; a drag
   * or Space that breaks the halo throws them instead, so it marks the state
   * as already shown and nothing swings underneath the throw.
   */
  const setAligned = (next: boolean, swingIt = true) => {
    if (next === isAligned) return;
    if (!swingIt) shownAligned.current = next;
    if (!controlled) setOwn(next);
    onAlignedChange?.(next);
    setSaid((v) => ({
      n: v.n + 1,
      text: next
        ? "Rings swung flat into a halo."
        : "Rings back on their gimbals.",
    }));
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => {
      const box = rootRef.current?.getBoundingClientRect();
      const centre = box
        ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
        : { x: point.x, y: point.y };
      const g = grip.current;
      g.centre = centre;
      g.angle = Math.atan2(point.y - centre.y, point.x - centre.x);
      g.turn = 0;
      g.tracker.reset();
      g.tracker.push(0, 0, performance.now());
      engine.current?.grab();
      if (isAligned) setAligned(false, false);
    },
    onMove: ({ point, delta }) => {
      const g = grip.current;
      const rmax = Math.max(24, (rootRef.current?.clientHeight ?? 200) / 2);
      const a = Math.atan2(point.y - g.centre.y, point.x - g.centre.x);
      const turn = wrap(a - g.angle);
      g.angle = a;
      g.turn += turn;
      g.tracker.push((point.x - g.centre.x) / rmax, g.turn, performance.now());
      engine.current?.turn(delta.x / rmax, turn);
    },
    onEnd: () => {
      const v = grip.current.tracker.velocity();
      engine.current?.kick(v.x, v.y, true);
    },
    onCancel: () => engine.current?.kick(0, 0, false),
    onTap: () => {
      if (!disabled) setAligned(!isAligned);
    },
  });

  // The halo, from a click, Enter or the host: the same swing.
  React.useEffect(() => {
    if (shownAligned.current === isAligned) return;
    shownAligned.current = isAligned;
    engine.current?.swing(isAligned, true);
  }, [isAligned]);

  // The rings, their physics and their drawing: one canvas and one loop
  // that runs only while something moves, on screen, in a visible tab.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const probe = probeRef.current;
    if (!canvas || !root || !probe) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const spec = FINISH[finish] ?? FINISH.brass;
    probe.style.color = `var(${spec.token})`;
    const hue =
      (hueOf(getComputedStyle(probe).color) ?? FALLBACK_HUE[spec.token] ?? 80) +
      spec.turn;
    probe.style.color = light;
    const lightHue = (hueOf(getComputedStyle(probe).color) ?? 80).toFixed(1);

    // 64 tones from shadow to glint, made once per finish.
    const palette: string[] = [];
    for (let k = 0; k < 64; k += 1) {
      const t = k / 63;
      const l = lerp(spec.lo, spec.hi, t);
      const c = spec.chroma * (1 - Math.pow(t, 3) * 0.75);
      palette.push(`oklch(${l.toFixed(3)} ${c.toFixed(3)} ${hue.toFixed(1)})`);
    }
    const beamCore = `oklch(0.9 0.12 ${lightHue})`;
    const beamClear = `oklch(0.84 0.13 ${lightHue} / 0)`;
    const beamHalf = `oklch(0.84 0.13 ${lightHue} / 0.55)`;

    const state = {
      rings: rests.map<Ring>((rest) => ({
        alpha: latest.current.beta,
        wAlpha: 0,
        phi: shownAligned.current ? 0 : rest,
        wPhi: 0,
        rest,
        locked: true,
      })),
      mode: (shownAligned.current ? "halo" : "gyro") as Mode,
      clock: 10,
      byVisitor: false,
      settled: true,
      through: true,
      inLine: rests.length,
      kicks: 0,
    };

    const count = rests.length * SEGMENTS;
    const X0 = new Float32Array(count);
    const Y0 = new Float32Array(count);
    const X1 = new Float32Array(count);
    const Y1 = new Float32Array(count);
    const Z = new Float32Array(count);
    const W = new Float32Array(count);
    const S = new Uint8Array(count);
    const order = new Uint16Array(count);
    const byDepth = (a: number, b: number) => (Z[a] ?? 0) - (Z[b] ?? 0);

    // The light, from the upper left and toward you; and the half vector
    // between it and the eye, for the glint.
    const LX = -0.5 / 0.987;
    const LY = -0.62 / 0.987;
    const LZ = 0.6 / 0.987;
    const hm = Math.hypot(LX, LY, LZ + 1);
    const HX = LX / hm;
    const HY = LY / hm;
    const HZ = (LZ + 1) / hm;

    let w = 0;
    let h = 0;
    let scale = 1;
    let coreGrad: CanvasGradient | null = null;
    let beamGrad: CanvasGradient | null = null;
    let flareGrad: CanvasGradient | null = null;
    let raf = 0;
    let last = 0;
    let inView = true;
    let first = true;

    const geometry = () => {
      const half = Math.min(w, h) / 2;
      const tw = thickness ?? clamp(half * 0.075, 3, 10);
      return { rmax: Math.max(10, half - tw - 8), tw };
    };

    const resize = () => {
      const box = root.getBoundingClientRect();
      w = Math.max(1, Math.round(box.width));
      h = Math.max(1, Math.round(box.height));
      scale = Math.min(clamp(dpr, 0.5, 2), window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const cx = w / 2;
      const cy = h / 2;
      const b = latest.current.beta;
      const { rmax } = geometry();
      coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rmax * 0.2);
      coreGrad.addColorStop(0, `oklch(0.99 0.02 ${lightHue})`);
      coreGrad.addColorStop(0.35, beamCore);
      coreGrad.addColorStop(1, beamClear);
      const reach = Math.hypot(w, h);
      beamGrad = ctx.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(b) * reach,
        cy + Math.sin(b) * reach,
      );
      beamGrad.addColorStop(0, beamCore);
      beamGrad.addColorStop(0.5, beamHalf);
      beamGrad.addColorStop(1, beamClear);
      const fx = cx + Math.cos(b) * rmax;
      const fy = cy + Math.sin(b) * rmax;
      flareGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, rmax * 0.3);
      flareGrad.addColorStop(0, beamHalf);
      flareGrad.addColorStop(1, beamClear);
    };

    const report = (through: boolean, inLine: number) => {
      if (through === state.through && inLine === state.inLine) return;
      const changed = through !== state.through;
      state.through = through;
      state.inLine = inLine;
      latest.current.onBeamChange?.(through, inLine);
      if (changed && through && state.byVisitor) {
        setSaid((v) => ({
          n: v.n + 1,
          text: `The beam passes through all ${state.rings.length} rings.`,
        }));
      }
    };

    /** Where a ring's tilt is heading in the current mode: the nearest equivalent. */
    const tiltTarget = (r: Ring, mode: Mode) =>
      mode === "halo"
        ? Math.round(r.phi / Math.PI) * Math.PI
        : r.rest + Math.round((r.phi - r.rest) / Math.PI) * Math.PI;

    /** One step of the rings' physics, dt in seconds. */
    const step = (dt: number) => {
      const L0 = latest.current;
      const b = L0.beta;
      const decay = Math.exp(-dt * lerp(1.7, 0.32, clamp(L0.spin, 0, 1)));
      const rings = state.rings;
      state.clock += dt;
      let moving = false;
      for (let i = 0; i < rings.length; i += 1) {
        const r = rings[i];
        if (!r) continue;
        // The beam line's nearest equivalent to where the axle is now.
        const aT = r.alpha - wrap(r.alpha - b);
        const pT = tiltTarget(r, state.mode);
        if (state.mode === "free") {
          r.wAlpha *= decay;
          r.wPhi *= decay;
          // As a ring slows, a field takes hold: the axle is drawn to the
          // beam line and the tilt to its rest, so the gaps drift into line.
          const speed = Math.abs(r.wAlpha) + Math.abs(r.wPhi) * 0.35;
          const field = smooth(5, 1.2, speed);
          r.wAlpha +=
            (-26 * field * Math.sin(r.alpha - b) - 5 * field * r.wAlpha) * dt;
          r.wPhi +=
            (-9 * field * Math.sin(2 * (r.phi - r.rest)) - 4 * field * r.wPhi) *
            dt;
        } else {
          const delay = state.mode === "halo" ? i * cascade(rings.length) : 0;
          if (state.clock >= delay) {
            const sp = state.mode === "halo" ? springs.snap : springs.glide;
            const k = sp.stiffness / sp.mass;
            const c = sp.damping / sp.mass;
            r.wAlpha += (-k * (r.alpha - aT) - c * r.wAlpha) * dt;
            r.wPhi += (-k * (r.phi - pT) - c * r.wPhi) * dt;
          }
        }
        r.alpha += r.wAlpha * dt;
        r.phi += r.wPhi * dt;
        const off = Math.abs(wrap(r.alpha - b));
        if (!r.locked && off < 0.02 && Math.abs(r.wAlpha) < 0.4) {
          r.locked = true;
          const active =
            typeof navigator === "undefined" ||
            !navigator.userActivation ||
            navigator.userActivation.hasBeenActive;
          if (state.byVisitor && L0.motionSafe && active) {
            L0.audio.play("detent", { pitch: r2(0.92 + i * 0.1), gain: 0.55 });
          }
        } else if (r.locked && off > 0.16) {
          r.locked = false;
        }
        if (
          Math.abs(r.wAlpha) > 0.01 ||
          Math.abs(r.wPhi) > 0.01 ||
          off > 0.002 ||
          Math.abs(r.phi - pT) > 0.002
        ) {
          moving = true;
        }
      }
      if (moving) return;
      for (const r of rings) {
        r.phi = tiltTarget(r, state.mode);
        r.alpha = r.alpha - wrap(r.alpha - b);
        r.wAlpha = 0;
        r.wPhi = 0;
        r.locked = true;
      }
      state.settled = true;
      if (state.mode === "free") state.mode = "gyro";
    };

    /** The core, then the beam and its flare, at depth zero among the segments. */
    const shine = (cx: number, cy: number, rmax: number, through: number) => {
      const L0 = latest.current;
      if (coreGrad) {
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, rmax * 0.2, 0, TAU);
        ctx.fill();
      }
      if (through <= 0.002 || !beamGrad) return;
      const beamW = Math.max(2, L0.gapHalf * 2 * rmax * 0.34 * 0.45);
      const reach = Math.hypot(w, h);
      ctx.strokeStyle = beamGrad;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(L0.beta) * reach,
        cy + Math.sin(L0.beta) * reach,
      );
      ctx.globalAlpha = through * 0.35;
      ctx.lineWidth = beamW * 2.6;
      ctx.stroke();
      ctx.globalAlpha = through * 0.95;
      ctx.lineWidth = beamW;
      ctx.stroke();
      if (flareGrad) {
        ctx.globalAlpha = through * 0.8;
        ctx.fillStyle = flareGrad;
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(L0.beta) * rmax,
          cy + Math.sin(L0.beta) * rmax,
          rmax * 0.3,
          0,
          TAU,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
    };

    const draw = () => {
      const L0 = latest.current;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const { rmax, tw } = geometry();
      const f = rmax * 5;
      const rings = state.rings;
      const last1 = Math.max(1, rings.length - 1);
      const span = TAU - 2 * L0.gapHalf;
      let m = 0;
      let inLine = 0;
      let through = 1;
      for (let i = 0; i < rings.length; i += 1) {
        const r = rings[i];
        if (!r) continue;
        const R = rmax * (1 - (i * (1 - 0.34)) / last1);
        const width = tw * (1 - (0.25 * i) / last1);
        const ca = Math.cos(r.alpha);
        const sa = Math.sin(r.alpha);
        const cp = Math.cos(r.phi);
        const sp = Math.sin(r.phi);
        // a = (ca, sa, 0) is the axle; b = (bx, by, bz) the in-plane
        // perpendicular, tumbled about the axle by phi.
        const bx = -sa * cp;
        const by = ca * cp;
        const bz = sp;
        const t = smooth(
          L0.gapHalf * 0.9,
          L0.gapHalf * 0.3,
          Math.abs(wrap(r.alpha - L0.beta)),
        );
        through *= t;
        if (t > 0.5) inLine += 1;
        let px = 0;
        let py = 0;
        let pz = 0;
        for (let j = 0; j <= SEGMENTS; j += 1) {
          const u = L0.gapHalf + (span * j) / SEGMENTS;
          const cu = Math.cos(u);
          const su = Math.sin(u);
          const x = R * (cu * ca + su * bx);
          const y = R * (cu * sa + su * by);
          const z = R * su * bz;
          if (j > 0) {
            const k0 = f / (f - pz);
            const k1 = f / (f - z);
            const zm = (z + pz) / 2;
            X0[m] = cx + px * k0;
            Y0[m] = cy + py * k0;
            X1[m] = cx + x * k1;
            Y1[m] = cy + y * k1;
            Z[m] = zm;
            W[m] = width * ((k0 + k1) / 2);
            // A polished tube: diffuse from how far the light reaches across
            // its section, a glint where the section can face the half
            // vector — both read from the tangent, so the glint runs round
            // the ring as it tumbles.
            const um = u - span / SEGMENTS / 2;
            const tx = -Math.sin(um) * ca + Math.cos(um) * bx;
            const ty = -Math.sin(um) * sa + Math.cos(um) * by;
            const tz = Math.cos(um) * bz;
            const tl = tx * LX + ty * LY + tz * LZ;
            const th = tx * HX + ty * HY + tz * HZ;
            const diffuse = Math.sqrt(Math.max(0, 1 - tl * tl));
            const glint = Math.pow(Math.max(0, 1 - th * th), 28);
            const facing = 0.82 + 0.18 * Math.abs(cp) + 0.08 * (zm / R);
            const lit = clamp(
              (0.12 + 0.6 * Math.pow(diffuse, 1.6)) * facing + glint * 0.55,
              0,
              1,
            );
            S[m] = Math.round(lit * 63);
            order[m] = m;
            m += 1;
          }
          px = x;
          py = y;
          pz = z;
        }
      }
      order.sort(byDepth);
      let shone = false;
      ctx.lineCap = "round";
      for (let q = 0; q < m; q += 1) {
        const idx = order[q] ?? 0;
        if (!shone && (Z[idx] ?? 0) >= 0) {
          shine(cx, cy, rmax, through);
          shone = true;
        }
        ctx.strokeStyle = palette[S[idx] ?? 0] ?? "transparent";
        ctx.lineWidth = W[idx] ?? 1;
        ctx.beginPath();
        ctx.moveTo(X0[idx] ?? 0, Y0[idx] ?? 0);
        ctx.lineTo(X1[idx] ?? 0, Y1[idx] ?? 0);
        ctx.stroke();
      }
      if (!shone) shine(cx, cy, rmax, through);
      report(through > 0.5, inLine);
      if (first) {
        first = false;
        // The canvas has a frame of its own: the server's still steps aside.
        window.requestAnimationFrame(() => setPainted(true));
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!inView || document.hidden) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!paused && !state.settled) {
        // Fixed sub-steps keep the stiff halo springs stable at any frame rate.
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        for (let k = 0; k < steps; k += 1) step(dt / steps);
      }
      draw();
      if (!state.settled && !paused) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (raf !== 0 || !inView || document.hidden || paused) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const redraw = () => {
      if (raf === 0) draw();
    };

    engine.current = {
      swing: (toHalo, byVisitor) => {
        state.mode = toHalo ? "halo" : "gyro";
        state.clock = 0;
        state.byVisitor = byVisitor;
        for (const r of state.rings) r.locked = false;
        if (!latest.current.motionSafe) {
          for (const r of state.rings) {
            r.alpha = latest.current.beta;
            r.phi = toHalo ? 0 : r.rest;
            r.wAlpha = 0;
            r.wPhi = 0;
            r.locked = true;
          }
          state.settled = true;
          redraw();
          return;
        }
        state.settled = false;
        wake();
      },
      grab: () => {
        state.mode = "free";
        state.byVisitor = true;
        state.settled = true;
        for (const r of state.rings) {
          r.wAlpha = 0;
          r.wPhi = 0;
          r.locked = false;
        }
      },
      turn: (tumble, axle) => {
        state.rings.forEach((r, i) => {
          const share = 1 - i * 0.09;
          r.phi += tumble * (i % 2 === 0 ? 1 : -1) * share;
          r.alpha += axle * share * (i % 2 === 0 ? 1 : -0.7);
        });
        redraw();
      },
      kick: (vx, vTurn, byVisitor) => {
        const L0 = latest.current;
        state.mode = "free";
        state.byVisitor = byVisitor;
        state.clock = 0;
        state.kicks += 1;
        const k = state.kicks;
        if (!L0.motionSafe) {
          // Reduced motion: a new still pose, every axle back on the beam.
          state.rings.forEach((r, i) => {
            r.alpha = L0.beta;
            r.phi = r.rest + (hash(L0.seed, i, 50 + k) - 0.5) * 1.6;
            r.wAlpha = 0;
            r.wPhi = 0;
            r.locked = true;
          });
          state.settled = true;
          redraw();
          return;
        }
        const power = lerp(0.55, 1.5, clamp(L0.spin, 0, 1));
        state.rings.forEach((r, i) => {
          const share = 1 - i * 0.09;
          const jitter = 0.75 + hash(L0.seed, i, 20 + k) * 0.5;
          r.wPhi += vx * (i % 2 === 0 ? 1 : -1) * share * jitter * power;
          r.wAlpha +=
            (vTurn * share * (i % 2 === 0 ? 1 : -0.7) +
              (hash(L0.seed, i, 40 + k) - 0.5) *
                Math.min(6, Math.abs(vx) * 0.5)) *
            power;
          r.locked = false;
        });
        state.settled = false;
        wake();
      },
      spinUp: (byVisitor) => {
        const L0 = latest.current;
        const k = state.kicks + 1;
        const sign = hash(L0.seed, k, 9) > 0.5 ? 1 : -1;
        const turn = hash(L0.seed, k, 13) > 0.5 ? 1 : -1;
        engine.current?.kick(
          sign * (6 + hash(L0.seed, k, 11) * 4),
          turn * (4 + hash(L0.seed, k, 15) * 4),
          byVisitor,
        );
      },
      brake: () => {
        if (state.settled || state.mode !== "free") return false;
        state.mode = "gyro";
        state.clock = 0;
        wake();
        return true;
      },
    };

    resize();
    draw();

    const ro = new ResizeObserver(() => {
      resize();
      redraw();
    });
    ro.observe(root);
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView && !state.settled) wake();
    });
    io.observe(root);
    const onVisibility = () => {
      if (!document.hidden && !state.settled) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      engine.current = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [finish, light, thickness, dpr, paused, rests, beta]);

  /* --------------------------------- render ------------------------------ */

  // The server's frame, and the first paint's: the rest pose as ellipses.
  const spec = FINISH[finish] ?? FINISH.brass;
  const staticStroke = `oklch(from var(${spec.token}) 0.62 ${spec.chroma} calc(h + ${spec.turn}))`;
  const staticHighlight = `oklch(from var(${spec.token}) 0.88 ${r2(spec.chroma * 0.6)} calc(h + ${spec.turn}))`;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate h-full w-full overflow-clip [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <span ref={probeRef} aria-hidden className="hidden" />
      {painted ? null : (
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMid meet"
          overflow="visible"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <defs>
            <radialGradient id={glowId}>
              <stop offset="0" stopColor={`oklch(from ${light} 0.99 0.02 h)`} />
              <stop
                offset="0.4"
                stopColor={`oklch(from ${light} 0.9 0.12 h)`}
              />
              <stop
                offset="1"
                stopColor={`oklch(from ${light} 0.84 0.13 h)`}
                stopOpacity="0"
              />
            </radialGradient>
            <linearGradient id={beamId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={`oklch(from ${light} 0.9 0.12 h)`} />
              <stop
                offset="1"
                stopColor={`oklch(from ${light} 0.84 0.13 h)`}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="17" fill={`url(#${glowId})`} />
          <rect
            x="100"
            y="97.6"
            width="1000"
            height="4.8"
            fill={`url(#${beamId})`}
            transform={`rotate(${r2(beamAngle)} 100 100)`}
          />
          {rests.map((rest, i) => {
            const R = 84 * (1 - (i * (1 - 0.34)) / Math.max(1, n - 1));
            const d = staticArc(R, isAligned ? 0 : rest, beta, gapHalf);
            return (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke={staticStroke}
                  strokeWidth={r2(6.4 * (1 - (0.25 * i) / Math.max(1, n - 1)))}
                  strokeLinecap="round"
                />
                <path
                  d={d}
                  fill="none"
                  stroke={staticHighlight}
                  strokeOpacity="0.5"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>
      )}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        role="switch"
        tabIndex={disabled ? -1 : 0}
        aria-checked={isAligned}
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter") {
            event.preventDefault();
            setAligned(!isAligned);
          } else if (event.key === " ") {
            event.preventDefault();
            if (isAligned) setAligned(false, false);
            engine.current?.spinUp(true);
          } else if (event.key === "Escape") {
            if (engine.current?.brake()) event.preventDefault();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " ") event.preventDefault();
        }}
        {...drag}
        className={cn(
          "absolute inset-0 touch-none rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      />
      <p id={hintId} className="sr-only">
        Enter swings the rings flat into a halo or back; Space spins them and
        Escape brakes them. Drag to spin them by hand.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
