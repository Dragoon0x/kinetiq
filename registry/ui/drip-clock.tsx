"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DripClockTone = "ink" | "jade" | "copper" | "night";

export type DripClockProps = {
  /** What sets the drops: `"clock"` lands one on every second of the wall clock; `"slow"` (40 a minute), `"fast"` (120 a minute) or a number of drops a minute follow this prop instead. @default "clock" */
  tempo?: "clock" | "slow" | "fast" | number;
  /** How quickly a ring loses its light, 0 (lively water: rings reach the lip bright and run back in) to 1 (still, heavy water). @default 0.45 */
  damping?: number;
  /** The basin's stone and the rings' light, as pigments that read the same in both themes; also the drop's pitch. @default "ink" */
  tone?: DripClockTone;
  /** Play a plip when your own drop lands. The clock's drops are always silent. @default false */
  sound?: boolean;
  /** How fast a ring runs outward, in px a second at a 94 px basin, 40 to 300. @default 110 */
  ringSpeed?: number;
  /** Show the sixty ticks on the lip that the rings light. @default true */
  ticks?: boolean;
  /** The basin's colour, overriding the tone. */
  basinColor?: string;
  /** The rings' colour, overriding the tone. */
  ringColor?: string;
  /** A click (or Enter at the aim) adds a drop of your own. @default true */
  interactive?: boolean;
  /** Stop the drops; rings already in the water run out. @default false */
  paused?: boolean;
  /** Names the clock for assistive technology. @default "Water clock" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a ring reaches the lip and lights its tick, with the second it counts, 0 to 59. */
  onTick?: (second: number) => void;
  /** Fires when the sixtieth tick lights and the minute rolls over. */
  onMinute?: () => void;
  /** Fires when your drop lands, with its place in px from the basin's centre. */
  onDrop?: (x: number, y: number) => void;
  /** Shows the clock keeping time but takes no drops. @default false */
  disabled?: boolean;
  /** Sizes the box; the basin is the largest circle that fits. @default "size-56" */
  className?: string;
};

const TONES: Record<
  DripClockTone,
  { basin: string; ring: string; pitch: number }
> = {
  ink: {
    basin: "oklch(from var(--accent) 0.2 0.025 h)",
    ring: "oklch(from var(--accent) 0.93 0.02 h)",
    pitch: 1,
  },
  jade: {
    basin: "oklch(from var(--signal) 0.24 0.045 h)",
    ring: "oklch(from var(--signal) 0.9 0.08 h)",
    pitch: 1.19,
  },
  copper: {
    basin: "oklch(from var(--warn) 0.24 0.04 h)",
    ring: "oklch(from var(--warn) 0.88 0.09 h)",
    pitch: 0.84,
  },
  night: {
    basin: "oklch(from var(--accent) 0.24 0.09 h)",
    ring: "oklch(from var(--accent-bright) 0.86 0.09 h)",
    pitch: 0.94,
  },
};

const MAX_RINGS = 24;
const MAX_DROPS = 8;
/** How long a drop is seen falling before it lands, in seconds. */
const FALL = 0.22;
/** A basin's radius at which `ringSpeed` is measured. */
const REF_RADIUS = 94;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const perMinute = (tempo: DripClockProps["tempo"]) =>
  tempo === "slow"
    ? 40
    : tempo === "fast"
      ? 120
      : typeof tempo === "number"
        ? clamp(tempo, 6, 240)
        : 60;

type Rings = {
  x: Float32Array;
  y: Float32Array;
  born: Float32Array;
  amp: Float32Array;
  /** 0 empty, 1 the clock's (centred, reflects, lights a tick), 2 a visitor's. */
  kind: Uint8Array;
  tick: Int8Array;
  lit: Uint8Array;
};

type Drops = {
  x: Float32Array;
  y: Float32Array;
  land: Float32Array;
  /** 0 empty, 1 the clock's, 2 a visitor's, 3 a minute drop. */
  kind: Uint8Array;
  tick: Int8Array;
  pan: Float32Array;
};

type Geo = {
  w: number;
  h: number;
  cx: number;
  cy: number;
  R: number;
  dpr: number;
};

type Pal = {
  basin: string;
  ring: string;
  lip: string;
  dim: string;
  rgbRing: [number, number, number];
  shade: CanvasGradient | null;
  gleam: CanvasGradient | null;
  light: CanvasGradient | null;
};

type Api = {
  rebuild: () => void;
  readColours: () => void;
  draw: () => void;
  kick: () => void;
  tick: (now: number) => void;
  schedule: () => void;
  catchUp: () => void;
};

/**
 * A minimal water clock seen from above, in Canvas 2D: a round, dark basin
 * of still water with a thin lip carrying sixty hairline ticks. A drop falls
 * into the centre every second — a bright point shrinking as it falls, its
 * shadow sliding in to meet it — and on landing flicks a small crown of spray
 * and sends ONE thin ring outward, a lit crest over a dark trough, lit from
 * the upper left. When a ring reaches the lip it lights that second's tick,
 * so the ticks fill round the rim as the minute goes; in lively water a
 * fainter reflection runs back in and meets at the centre. At the sixtieth
 * the lit ticks drain round the rim in one cascade and the next drop, the
 * minute's, lands with a double ring.
 *
 * A click drops a drop of your own where you click; its ring crosses the
 * clock's and is lost at the lip. Only your drops sound. The basin is a real
 * button: arrow keys move an aim within the water, Enter or Space drops at it,
 * Escape hides it. Under reduced motion no ring travels: each drop shows a
 * still ring that fades, the ticks still light each second and still drain
 * at the minute, and your drops show where they land.
 */
export function DripClock({
  tempo = "clock",
  damping = 0.45,
  tone = "ink",
  sound = false,
  ringSpeed = 110,
  ticks = true,
  basinColor,
  ringColor,
  interactive = true,
  paused = false,
  label = "Water clock",
  dpr = 2,
  onTick,
  onMinute,
  onDrop,
  disabled = false,
  className,
}: DripClockProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const palette = TONES[tone] ?? TONES.ink;
  const basinPaint = basinColor ?? palette.basin;
  const ringPaint = ringColor ?? palette.ring;
  const k = {
    clock: tempo === "clock",
    period: 60 / perMinute(tempo),
    damping: clamp01(damping),
    speed: clamp(ringSpeed, 40, 300),
    ticks,
    pitch: palette.pitch,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };
  const paints = [basinPaint, ringPaint];
  const paintKey = paints.join("|");

  const [seconds, setSeconds] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const geo = React.useRef<Geo | null>(null);
  const pal = React.useRef<Pal | null>(null);
  const rings = React.useRef<Rings>({
    x: new Float32Array(MAX_RINGS),
    y: new Float32Array(MAX_RINGS),
    born: new Float32Array(MAX_RINGS),
    amp: new Float32Array(MAX_RINGS),
    kind: new Uint8Array(MAX_RINGS),
    tick: new Int8Array(MAX_RINGS),
    lit: new Uint8Array(MAX_RINGS),
  });
  const drops = React.useRef<Drops>({
    x: new Float32Array(MAX_DROPS),
    y: new Float32Array(MAX_DROPS),
    land: new Float32Array(MAX_DROPS),
    kind: new Uint8Array(MAX_DROPS),
    tick: new Int8Array(MAX_DROPS),
    pan: new Float32Array(MAX_DROPS),
  });
  /** Each tick's light (0–1), where it is heading, and the time it was struck. */
  const tickLight = React.useRef({
    now: new Float32Array(60),
    goal: new Float32Array(60),
    flash: new Float32Array(60),
    /** When each tick starts toward its goal, for cascades. */
    at: new Float32Array(60),
  });
  const clock = React.useRef({
    t: 0,
    last: 0,
    /** The count the next drop will make, 0 to 59. */
    next: 0,
    timer: 0,
    started: false,
  });
  const aim = React.useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    show: 0,
    on: false,
  });
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({
    onTick,
    onMinute,
    onDrop,
    audio,
    pitch: k.pitch,
  });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const readColours = () => {
    const carriers = carriersRef.current;
    const g = geo.current;
    const canvas = canvasRef.current;
    if (!carriers || !g || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const css = (i: number) => {
      const span = carriers.children[i];
      return span ? getComputedStyle(span).color : "rgb(40, 40, 48)";
    };
    const basin = css(0);
    const ring = css(1);
    // The ring colour as bytes, for the light that falls round the lip.
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const p = probe.getContext("2d", { willReadFrequently: true });
    let rgb: [number, number, number] = [235, 235, 240];
    if (p) {
      p.fillStyle = ring;
      p.fillRect(0, 0, 1, 1);
      const d = p.getImageData(0, 0, 1, 1).data;
      rgb = [d[0] ?? 235, d[1] ?? 235, d[2] ?? 240];
    }
    const { cx, cy, R } = g;
    // Water seen from above: darker toward the lip, with the reflection of
    // a bright sky to the upper left lying on it.
    const shade = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    shade.addColorStop(0, "rgb(255 255 255 / 0.05)");
    shade.addColorStop(0.75, "rgb(0 0 0 / 0)");
    shade.addColorStop(1, "rgb(0 0 0 / 0.32)");
    const gleam = ctx.createRadialGradient(
      cx - R * 0.42,
      cy - R * 0.48,
      0,
      cx - R * 0.42,
      cy - R * 0.48,
      R * 0.62,
    );
    gleam.addColorStop(0, `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / 0.13)`);
    gleam.addColorStop(1, `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / 0)`);
    // Every centred ring shares one light: bright on the upper left, dim on
    // the lower right, as the crest catches the sky.
    let light: CanvasGradient | null = null;
    if (typeof ctx.createConicGradient === "function") {
      light = ctx.createConicGradient(-Math.PI * 0.25, cx, cy);
      const c = (a: number) => `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${a})`;
      light.addColorStop(0, c(0.55));
      light.addColorStop(0.25, c(0.3));
      light.addColorStop(0.5, c(0.55));
      light.addColorStop(0.75, c(1));
      light.addColorStop(1, c(0.55));
    }
    pal.current = {
      basin,
      ring,
      lip: `color-mix(in oklab, ${basin} 86%, white)`,
      dim: `color-mix(in oklab, ${basin} 52%, white)`,
      rgbRing: rgb,
      shade,
      gleam,
      light,
    };
  };

  const rebuild = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 24 || h < 24) return;
    const scale = Math.min(window.devicePixelRatio || 1, k.dpr);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const R = Math.max(10, Math.min(w, h) / 2 - 10);
    geo.current = { w, h, cx: w / 2, cy: h / 2, R, dpr: scale };
    // The button is the basin and its lip, wherever the box puts them.
    const button = buttonRef.current;
    if (button) {
      // Just inside the lip's edge, so the focus ring hugs the stone and
      // stays within the box.
      const side = Math.round(R * 2 + 12);
      button.style.inset = "auto";
      button.style.left = `${Math.round(w / 2 - side / 2)}px`;
      button.style.top = `${Math.round(h / 2 - side / 2)}px`;
      button.style.width = `${side}px`;
      button.style.height = `${side}px`;
    }
    readColours();
    draw();
  };

  /** How far a ring has run and how bright it is at sim time t. */
  const ringAt = (i: number, t: number) => {
    const g = geo.current;
    const r = rings.current;
    if (!g) return { rad: 0, a: 0, back: 0 };
    const age = t - r.born[i]!;
    const v = (k.speed * g.R) / REF_RADIUS;
    const decay = 0.4 + 3.2 * k.damping;
    const fade = Math.exp(-decay * age) * r.amp[i]!;
    if (!k.motionSafe) {
      // Reduced motion: no travel; a still ring at mid-radius fades out.
      const life = clamp01(1 - age / (durations.slow * 2));
      return {
        rad: g.R * (r.kind[i] === 2 ? 0.2 : 0.55),
        a: life * r.amp[i]!,
        back: 0,
      };
    }
    const rad = v * age;
    const spread = 1 / Math.sqrt(1 + rad / 24);
    if (r.kind[i] === 1 && rad > g.R) {
      // The lip throws a centred ring back in, weaker, to meet at the centre.
      const back = 2 * g.R - rad;
      return {
        rad: Math.max(0, back),
        a: fade * spread * (1 - k.damping) * 0.8,
        back: 1,
      };
    }
    return { rad, a: fade * spread, back: 0 };
  };

  const draw = () => {
    const g = geo.current;
    const p = pal.current;
    const canvas = canvasRef.current;
    if (!g || !p || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const t = clock.current.t;
    const { cx, cy, R } = g;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    // The lip: a ring of the same stone, a shade paler than the water, so
    // its ticks read on it in either theme.
    ctx.beginPath();
    ctx.arc(cx, cy, R + 8, 0, TAU);
    ctx.fillStyle = p.lip;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.dim;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = p.basin;
    ctx.fill();
    if (p.shade) {
      ctx.fillStyle = p.shade;
      ctx.fill();
    }
    if (p.gleam) {
      ctx.fillStyle = p.gleam;
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const r = rings.current;
    for (let i = 0; i < MAX_RINGS; i += 1) {
      if (r.kind[i] === 0) continue;
      const { rad, a } = ringAt(i, t);
      if (a < 0.004 || rad <= 0.5) continue;
      const x = cx + r.x[i]!;
      const y = cy + r.y[i]!;
      ctx.globalAlpha = Math.min(1, a * 1.25);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = r.kind[i] === 1 && p.light ? p.light : p.ring;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.stroke();
    }
    // The trough under each crest, a shade darker than the water.
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgb(0 0 0)";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < MAX_RINGS; i += 1) {
      if (r.kind[i] === 0) continue;
      const { rad, a, back } = ringAt(i, t);
      if (a < 0.01 || rad <= 3) continue;
      ctx.globalAlpha = Math.min(0.5, a * 0.45);
      ctx.beginPath();
      ctx.arc(cx + r.x[i]!, cy + r.y[i]!, rad + (back ? 2.2 : -2.2), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // Drops in flight, and the crown each leaves for a moment.
    const d = drops.current;
    for (let i = 0; i < MAX_DROPS; i += 1) {
      if (d.kind[i] === 0) continue;
      const until = d.land[i]! - t;
      const x = cx + d.x[i]!;
      const y = cy + d.y[i]!;
      if (until > 0 && k.motionSafe) {
        const p01 = clamp01(1 - until / FALL);
        const off = 7 * (1 - p01);
        ctx.globalAlpha = 0.28 * p01;
        ctx.fillStyle = "rgb(0 0 0)";
        ctx.beginPath();
        ctx.arc(x + off, y + off * 0.8, 1.8, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.ring;
        ctx.beginPath();
        ctx.arc(x, y, 3.4 - 1.6 * p01, 0, TAU);
        ctx.fill();
      } else if (until <= 0 && until > -0.24 && k.motionSafe) {
        const q = clamp01(-until / 0.24);
        ctx.globalAlpha = 0.85 * (1 - q);
        ctx.fillStyle = p.ring;
        for (let j = 0; j < 6; j += 1) {
          const a = (j / 6) * TAU + 0.4;
          const rr = 3 + 9 * Math.sqrt(q);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.9, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    // Sixty ticks on the lip; the ones the rings have reached are lit.
    if (k.ticks) {
      const tl = tickLight.current;
      for (let i = 0; i < 60; i += 1) {
        const a = -Math.PI / 2 + (i / 60) * TAU;
        const long = i % 5 === 0;
        const r0 = R + 1.5;
        const r1 = R + (long ? 7.5 : 5.5);
        const lit = tl.now[i]!;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.lineWidth = long ? 1.4 : 1;
        ctx.strokeStyle = p.dim;
        ctx.globalAlpha = 0.6 * (1 - lit);
        ctx.beginPath();
        ctx.moveTo(cx + c * r0, cy + s * r0);
        ctx.lineTo(cx + c * r1, cy + s * r1);
        ctx.stroke();
        if (lit > 0.01) {
          ctx.strokeStyle = p.ring;
          ctx.globalAlpha = lit;
          ctx.beginPath();
          ctx.moveTo(cx + c * r0, cy + s * r0);
          ctx.lineTo(cx + c * r1, cy + s * r1);
          ctx.stroke();
        }
        const f = tl.flash[i]!;
        if (f > 0.01) {
          ctx.globalAlpha = f * 0.6;
          ctx.fillStyle = p.ring;
          ctx.beginPath();
          ctx.arc(
            cx + c * (R - 1),
            cy + s * (R - 1),
            2.2 + 2 * (1 - f),
            0,
            TAU,
          );
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    // The keyboard's aim: a thin ring with a cross, on snap.
    const am = aim.current;
    if (am.show > 0.01) {
      ctx.globalAlpha = am.show * 0.85;
      ctx.strokeStyle = p.ring;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx + am.x, cy + am.y, 7, 0, TAU);
      ctx.moveTo(cx + am.x - 3, cy + am.y);
      ctx.lineTo(cx + am.x + 3, cy + am.y);
      ctx.moveTo(cx + am.x, cy + am.y - 3);
      ctx.lineTo(cx + am.x, cy + am.y + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  const freeRing = () => {
    const r = rings.current;
    let pick = 0;
    let oldest = Infinity;
    for (let i = 0; i < MAX_RINGS; i += 1) {
      if (r.kind[i] === 0) return i;
      if (r.born[i]! < oldest) {
        oldest = r.born[i]!;
        pick = i;
      }
    }
    return pick;
  };

  const addRing = (
    x: number,
    y: number,
    amp: number,
    kind: 1 | 2,
    tick: number,
    at: number,
  ) => {
    const r = rings.current;
    const i = freeRing();
    r.x[i] = x;
    r.y[i] = y;
    r.born[i] = at;
    r.amp[i] = amp;
    r.kind[i] = kind;
    r.tick[i] = tick;
    r.lit[i] = 0;
  };

  /** A drop on its way: it lands FALL seconds from now (at once when reduced). */
  const addDrop = (
    x: number,
    y: number,
    kind: 1 | 2 | 3,
    tick: number,
    pan: number,
  ) => {
    const d = drops.current;
    let i = 0;
    let oldest = Infinity;
    for (let j = 0; j < MAX_DROPS; j += 1) {
      if (d.kind[j] === 0) {
        i = j;
        oldest = -Infinity;
        break;
      }
      if (d.land[j]! < oldest) {
        oldest = d.land[j]!;
        i = j;
      }
    }
    d.x[i] = x;
    d.y[i] = y;
    d.land[i] = clock.current.t + (k.motionSafe ? FALL : 0);
    d.kind[i] = kind;
    d.tick[i] = tick;
    d.pan[i] = pan;
  };

  /** A tick lights; at the sixtieth the rim drains in one cascade. */
  const light = (second: number) => {
    const tl = tickLight.current;
    const t = clock.current.t;
    tl.goal[second] = 1;
    tl.at[second] = t;
    tl.flash[second] = k.motionSafe ? 1 : 0;
    setSeconds(second + 1 >= 60 ? 60 : second + 1);
    report.current.onTick?.(second);
    if (second === 59) {
      const step = cascade(60);
      for (let i = 0; i < 60; i += 1) {
        tl.goal[i] = 0;
        tl.at[i] = t + 0.4 + i * step * 0.5;
      }
      report.current.onMinute?.();
      setSaid((v) => ({ n: v.n + 1, text: "Minute complete." }));
    }
  };

  /** Steps the drops, the rings' arrivals, the ticks and the aim. */
  const advance = (dt: number): boolean => {
    const c = clock.current;
    c.t += dt;
    const t = c.t;
    const g = geo.current;
    let busy = false;
    const d = drops.current;
    for (let i = 0; i < MAX_DROPS; i += 1) {
      if (d.kind[i] === 0) continue;
      if (t >= d.land[i]! && d.land[i]! > t - dt - 1e-6) {
        const kind = d.kind[i]!;
        if (kind === 2) {
          addRing(d.x[i]!, d.y[i]!, 0.9, 2, -1, d.land[i]!);
          const rp = report.current;
          rp.audio.play("plip", {
            pitch:
              rp.pitch *
              (0.94 +
                0.12 * clamp01(1 - Math.hypot(d.x[i]!, d.y[i]!) / (g?.R ?? 1))),
            pan: d.pan[i]!,
            gain: 0.5,
          });
          rp.onDrop?.(Math.round(d.x[i]!), Math.round(d.y[i]!));
        } else {
          addRing(0, 0, kind === 3 ? 1.25 : 1, 1, d.tick[i]!, d.land[i]!);
          // The minute's drop sends a second ring close behind the first.
          if (kind === 3) addRing(0, 0, 0.7, 1, -1, d.land[i]! + 0.12);
        }
      }
      if (t > d.land[i]! + 0.3) d.kind[i] = 0;
      else busy = true;
    }
    const r = rings.current;
    for (let i = 0; i < MAX_RINGS; i += 1) {
      if (r.kind[i] === 0 || t < r.born[i]!) {
        if (r.kind[i] !== 0) busy = true;
        continue;
      }
      const { rad, a, back } = ringAt(i, t);
      if (r.kind[i] === 1 && r.tick[i]! >= 0 && !r.lit[i]) {
        const reached =
          !k.motionSafe || (g ? rad >= g.R - 0.5 || back === 1 : true);
        if (reached) {
          r.lit[i] = 1;
          light(r.tick[i]!);
        }
      }
      if (
        a < 0.004 &&
        (back === 1 || r.kind[i] === 2 || !k.motionSafe || (g && rad > g.R * 2))
      ) {
        r.kind[i] = 0;
      } else busy = true;
    }
    const tl = tickLight.current;
    const rate = dt / durations.fast;
    for (let i = 0; i < 60; i += 1) {
      if (t >= tl.at[i]!) {
        const goal = tl.goal[i]!;
        const now = tl.now[i]!;
        if (now !== goal) {
          tl.now[i] =
            goal > now
              ? Math.min(goal, now + rate)
              : Math.max(goal, now - rate);
          busy = true;
        }
      } else busy = true;
      if (tl.flash[i]! > 0) {
        tl.flash[i] = Math.max(0, tl.flash[i]! - dt / 0.4);
        busy = true;
      }
    }
    const am = aim.current;
    const sp = springs.snap;
    if (k.motionSafe) {
      am.vx +=
        ((-sp.stiffness * (am.x - am.tx) - sp.damping * am.vx) / sp.mass) * dt;
      am.vy +=
        ((-sp.stiffness * (am.y - am.ty) - sp.damping * am.vy) / sp.mass) * dt;
      am.x += am.vx * dt;
      am.y += am.vy * dt;
      if (Math.abs(am.x - am.tx) + Math.abs(am.y - am.ty) > 0.05) busy = true;
    } else {
      am.x = am.tx;
      am.y = am.ty;
    }
    const want = am.on ? 1 : 0;
    if (am.show !== want) {
      am.show =
        want > am.show
          ? Math.min(1, am.show + dt / durations.fast)
          : Math.max(0, am.show - dt / durations.fast);
      busy = true;
    }
    return busy;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const c = clock.current;
    if (!visible.current || document.hidden) {
      c.last = 0;
      return;
    }
    const dt = c.last ? Math.min(0.05, (now - c.last) / 1000) : 1 / 60;
    c.last = now;
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else c.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /**
   * The clock's own drops: one timer at a time, re-aimed at each drop. On
   * the wall clock each drop lands on the second; the drop is seen falling
   * just before it.
   */
  const schedule = () => {
    const c = clock.current;
    window.clearTimeout(c.timer);
    c.timer = 0;
    if (k.paused || !visible.current || document.hidden) return;
    const lead = k.motionSafe ? FALL : 0;
    let wait: number;
    if (k.clock) {
      const ms = Date.now();
      const nextSecond = Math.ceil((ms + lead * 1000 + 30) / 1000) * 1000;
      wait = nextSecond - ms - lead * 1000;
      c.next = new Date(nextSecond).getSeconds();
    } else {
      wait = k.period * 1000;
    }
    c.timer = window.setTimeout(
      () => {
        c.timer = 0;
        const second = c.next;
        addDrop(0, 0, second === 0 ? 3 : 1, second, 0);
        if (!k.clock) c.next = (c.next + 1) % 60;
        kick();
        api.current?.schedule();
      },
      Math.max(16, wait),
    );
  };

  /** On start and on return: the ticks already gone this minute fill in a cascade. */
  const catchUp = () => {
    const c = clock.current;
    const tl = tickLight.current;
    if (k.clock) {
      const s = new Date().getSeconds();
      c.next = s;
      const step = cascade(Math.max(1, s));
      for (let i = 0; i < 60; i += 1) {
        tl.goal[i] = i < s ? 1 : 0;
        tl.at[i] = c.t + (k.motionSafe ? i * step : 0);
        if (!k.motionSafe) tl.now[i] = tl.goal[i]!;
      }
      setSeconds(s);
      // The host hears the reading the lip shows, not a minute from zero.
      if (s > 0) report.current.onTick?.(s - 1);
    }
    c.started = true;
  };

  React.useLayoutEffect(() => {
    api.current = { rebuild, readColours, draw, kick, tick, schedule, catchUp };
    report.current = { onTick, onMinute, onDrop, audio, pitch: k.pitch };
  });

  React.useEffect(() => {
    api.current?.rebuild();
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    // The tempo, a pause or the motion setting: re-aim the next drop.
    api.current?.catchUp();
    api.current?.schedule();
    api.current?.kick();
    const c = clock.current;
    return () => {
      window.clearTimeout(c.timer);
      c.timer = 0;
    };
  }, [k.clock, k.period, paused, motionSafe]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.damping, k.speed, k.ticks]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(clock.current.timer);
        clock.current.timer = 0;
        return;
      }
      api.current?.catchUp();
      api.current?.schedule();
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.rebuild());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const was = visible.current;
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) {
        window.clearTimeout(clock.current.timer);
        clock.current.timer = 0;
        return;
      }
      if (!was) api.current?.schedule();
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** A drop of the visitor's own, at (x, y) from the basin's centre. */
  const dropAt = (x: number, y: number, clientX: number | null) => {
    const g = geo.current;
    if (!k.enabled || !g) return;
    const reach = g.R - 6;
    const d = Math.hypot(x, y);
    const fx = d > reach ? (x / d) * reach : x;
    const fy = d > reach ? (y / d) * reach : y;
    const root = rootRef.current;
    const pan =
      clientX !== null && root
        ? panFrom(clientX, root)
        : clamp(fx / Math.max(1, g.R), -1, 1) * 0.6;
    addDrop(fx, fy, 2, -1, pan);
    setSaid((v) => ({ n: v.n + 1, text: "Drop added." }));
    kick();
  };

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const g = geo.current;
    if (!g) return;
    if (event.detail === 0) {
      // Enter, Space or assistive technology: a drop at the aim.
      const am = aim.current;
      dropAt(am.on ? am.tx : 0, am.on ? am.ty : 0, null);
      return;
    }
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return;
    dropAt(
      event.clientX - r.left - root.clientLeft - g.cx,
      event.clientY - r.top - root.clientTop - g.cy,
      event.clientX,
    );
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const g = geo.current;
    if (!k.enabled || !g) return;
    const by = event.shiftKey ? 24 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    const am = aim.current;
    if (move) {
      event.preventDefault();
      let tx = am.tx + move[0];
      let ty = am.ty + move[1];
      const d = Math.hypot(tx, ty);
      const reach = g.R - 10;
      if (d > reach) {
        tx = (tx / d) * reach;
        ty = (ty / d) * reach;
      }
      am.tx = tx;
      am.ty = ty;
      am.on = true;
      kick();
      return;
    }
    if (event.key === "Escape" && am.on) {
      event.preventDefault();
      am.on = false;
      kick();
    }
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/drip-clock relative isolate size-56 overflow-clip",
        className,
      )}
    >
      <ClockStill basin={basinPaint} ring={ringPaint} ticks={ticks} />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
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
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label}, add a drop`}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onBlur={() => {
          aim.current.on = false;
          kick();
        }}
        className={cn(
          "absolute inset-1.5 touch-manipulation rounded-full outline-none",
          k.enabled ? "cursor-pointer" : "cursor-default",
          "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        Arrow keys move the aim on the water; Enter or Space drops a drop there;
        Escape hides the aim.
      </p>
      <p role="timer" className="sr-only">
        {seconds === 1 ? "1 second" : `${seconds} seconds`}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render and the first paint: the basin,
 * its lip and ticks, a few rings already out, and the light on the water.
 */
function ClockStill({
  basin,
  ring,
  ticks,
}: {
  basin: string;
  ring: string;
  ticks: boolean;
}) {
  const marks = React.useMemo(() => {
    let lit = "";
    let rest = "";
    for (let i = 0; i < 60; i += 1) {
      const a = -Math.PI / 2 + (i / 60) * TAU;
      const r0 = 0.94 + 0.015;
      const r1 = 0.94 + (i % 5 === 0 ? 0.075 : 0.055);
      const seg = `M${r3(Math.cos(a) * r0)} ${r3(Math.sin(a) * r0)}L${r3(Math.cos(a) * r1)} ${r3(Math.sin(a) * r1)}`;
      if (i < 15) lit += seg;
      else rest += seg;
    }
    return { lit, rest };
  }, []);
  return (
    <svg
      aria-hidden
      viewBox="-1.04 -1.04 2.08 2.08"
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/drip-clock:opacity-0"
    >
      <circle
        r={1.017}
        style={{ fill: `color-mix(in oklab, ${basin} 86%, white)` }}
      />
      <circle r={0.94} style={{ fill: basin }} />
      <g fill="none" style={{ stroke: ring }} strokeWidth={0.012}>
        <circle r={0.18} opacity={0.75} />
        <circle r={0.46} opacity={0.4} />
        <circle r={0.74} opacity={0.18} />
      </g>
      {ticks ? (
        <g fill="none" strokeWidth={0.012}>
          <path
            d={marks.rest}
            style={{ stroke: `color-mix(in oklab, ${basin} 52%, white)` }}
            opacity={0.6}
          />
          <path d={marks.lit} style={{ stroke: ring }} />
        </g>
      ) : null}
    </svg>
  );
}
