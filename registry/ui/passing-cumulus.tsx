"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PassingCumulusState = "idle" | "busy" | "done";

export type PassingCumulusProps = {
  /** What the work is doing: a cloud drifts while busy, thins away when done. @default "busy" */
  state?: PassingCumulusState;
  /** The cloud's size, relative to the field's height, 0.4 to 1.6. @default 1 */
  cloud?: number;
  /** Dot diameter, px, 3 to 12. @default 7 */
  dotSize?: number;
  /** Dot spacing as a multiple of the dot size. @default 2.4 */
  pitch?: number;
  /** How fast the cloud drifts across, as a multiple of its natural pace. @default 1 */
  drift?: number;
  /** How much a shaded dot grows, 0 to 1. @default 0.5 */
  swell?: number;
  /** How much a shaded dot darkens, 0 to 1. @default 0.55 */
  dim?: number;
  /** The dots in sunlight, any CSS colour. @default a warm pigment from --warn */
  sunColor?: string;
  /** The dots in the cloud's shadow, any CSS colour. @default a cool pigment from --accent-bright */
  shadeColor?: string;
  /** What the work is, for the spoken status. @default "Working" */
  label?: string;
  /** What the status says in each state. @default { idle: "Ready.", busy: "<label>…", done: "Done." } */
  labels?: Partial<Record<PassingCumulusState, string>>;
  /** Shapes the clouds. @default 3 */
  seed?: number;
  /** Hold the field as it is. @default false */
  paused?: boolean;
  /** Device-pixel-ratio cap for the canvas, at most 2. @default 2 */
  dpr?: number;
  /** Fires once a state's change has finished drawing (done: the field is fully lit). */
  onSettle?: (state: PassingCumulusState) => void;
  /** Size the field with a height class. @default "h-28" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function lcg(seed: number) {
  let s = (Math.floor(seed * 7919) ^ 0x2545f491) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Puff = {
  /** Offset from the cloud's centre, in cloud radii. */
  dx: number;
  dy: number;
  r: number;
  /** How formed the puff is, 0–1, sprung. */
  k: number;
  kv: number;
  /** When it starts to gather, s after the cloud is born. */
  delay: number;
};

type Cloud = {
  x: number;
  y: number;
  age: number;
  puffs: Puff[];
  thinning: boolean;
};

/** A cumulus from a seed: a flat base of puffs, one or two higher in the middle. */
function makeCloud(seed: number): Puff[] {
  const r = lcg(seed);
  const n = 6;
  const puffs: Puff[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1) - 0.5;
    const high = Math.abs(t) < 0.25 ? 0.45 : 0.1;
    puffs.push({
      dx: t * 1.5 + (r() - 0.5) * 0.18,
      dy: -high * r() + (r() - 0.5) * 0.12,
      r: 0.42 + 0.24 * (1 - Math.abs(t) * 1.4) + r() * 0.08,
      k: 0,
      kv: 0,
      delay: Math.abs(t) * 0.35 + r() * 0.08,
    });
  }
  return puffs;
}

type Colours = {
  sun: string;
  sunHi: string;
  sunLo: string;
  shade: string;
  shadeHi: string;
  shadeLo: string;
};

/** A dot lit from up and to the left, painted once into a sprite. */
function paintDot(size: number, hi: string, base: string, lo: string) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.72, r * 0.62, r * 0.05, r, r, r);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.45, base);
  grad.addColorStop(1, lo);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r * 0.96, 0, Math.PI * 2);
  g.fill();
  return c;
}

/**
 * A loading and thinking indicator: a field of soft round dots, each shaded
 * like a small bead in sunlight, and over it the shadow of a small cumulus.
 * While busy, the cloud gathers — its puffs swelling in one after another on
 * springs.drift's constants — and drifts across; the dots beneath it swell
 * and dim, each easing toward its own shade with a lag, so a soft wake
 * trails behind. When one cloud has crossed, the next gathers. When the
 * state turns done, the cloud thins away and the whole field brightens
 * evenly to full sun.
 *
 * It is a polite status region that says what is happening in words, busy
 * while working; the drawing is hidden from assistive technology. Under
 * reduced motion the cloud does not drift: its shadow rests on the field and
 * breathes by opacity alone, and done still brightens the field.
 */
export function PassingCumulus({
  state = "busy",
  cloud = 1,
  dotSize = 7,
  pitch = 2.4,
  drift = 1,
  swell = 0.5,
  dim = 0.55,
  sunColor = "oklch(from var(--warn) 0.86 0.11 h)",
  shadeColor = "oklch(from var(--accent-bright) 0.56 0.13 h)",
  label = "Working",
  labels,
  seed = 3,
  paused = false,
  dpr = 2,
  onSettle,
  className,
}: PassingCumulusProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);

  const colours: Colours = {
    sun: sunColor,
    sunHi: `color-mix(in oklab, ${sunColor} 45%, white)`,
    sunLo: `color-mix(in oklab, ${sunColor} 78%, black)`,
    shade: shadeColor,
    shadeHi: `color-mix(in oklab, ${shadeColor} 72%, white)`,
    shadeLo: `color-mix(in oklab, ${shadeColor} 70%, black)`,
  };

  const config = {
    state,
    cloud,
    dotSize,
    pitch,
    drift,
    swell,
    dim,
    seed,
    paused,
    dpr,
    motionSafe,
    onSettle,
  };
  const latest = React.useRef(config);

  const sim = React.useRef({
    w: 0,
    h: 0,
    ratio: 1,
    cols: 0,
    rows: 0,
    x0: 0,
    y0: 0,
    step: 0,
    shade: new Float32Array(0),
    light: 0.9,
    lightV: 0,
    cloud: null as Cloud | null,
    born: 0,
    time: 0,
    frame: 0,
    last: 0,
    visible: false,
    sprites: null as {
      sun: HTMLCanvasElement;
      shade: HTMLCanvasElement;
      size: number;
    } | null,
    settledFor: "" as string,
  });

  /* --------------------------------- drawing -------------------------------- */

  const readColours = () => {
    const kids = carriersRef.current?.children;
    const s = sim.current;
    if (!kids) return;
    const css = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(200, 200, 200)";
    };
    const size = Math.max(4, Math.ceil(latest.current.dotSize * 1.7 * s.ratio));
    s.sprites = {
      size,
      sun: paintDot(size, css(1), css(0), css(2)),
      shade: paintDot(size, css(4), css(3), css(5)),
    };
  };

  const layout = () => {
    const el = rootRef.current;
    const canvas = canvasRef.current;
    const s = sim.current;
    if (!el || !canvas) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 1 || h < 1) return;
    const l = latest.current;
    const ratio = Math.min(window.devicePixelRatio || 1, clamp(l.dpr, 0.5, 2));
    s.w = w;
    s.h = h;
    s.ratio = ratio;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const size = clamp(l.dotSize, 3, 12);
    const step = Math.max(size + 2, size * clamp(l.pitch, 1.4, 4));
    // Whole rows and columns, centred, with half a pitch of margin.
    s.cols = Math.max(1, Math.floor((w - step * 0.5) / step));
    s.rows = Math.max(1, Math.floor((h - step * 0.5) / step));
    s.step = step;
    s.x0 = (w - (s.cols - 1) * step) / 2;
    s.y0 = (h - (s.rows - 1) * step) / 2;
    if (s.shade.length !== s.cols * s.rows)
      s.shade = new Float32Array(s.cols * s.rows);
    readColours();
  };

  /** The cloud's shadow at a point, 0–1. */
  const shadowAt = (x: number, y: number, c: Cloud, R: number) => {
    let sum = 0;
    for (const p of c.puffs) {
      if (p.k <= 0.001) continue;
      const pr = p.r * R * p.k;
      const dx = x - (c.x + p.dx * R);
      const dy = y - (c.y + p.dy * R);
      sum += p.k * Math.exp(-(dx * dx + dy * dy) / (pr * pr));
    }
    // A soft shadow: thick in the middle, thinning out at the cloud's edge
    // rather than stopping at it.
    return 1 - Math.exp(-sum * 1.1);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const s = sim.current;
    const g = canvas?.getContext("2d");
    const sp = s.sprites;
    if (!canvas || !g || !sp || s.w < 1) return;
    const l = latest.current;
    g.setTransform(s.ratio, 0, 0, s.ratio, 0, 0);
    g.clearRect(0, 0, s.w, s.h);
    const size = clamp(l.dotSize, 3, 12);
    const sw = clamp01(l.swell);
    const dm = clamp01(l.dim);
    const lift = clamp01((s.light - 0.88) / 0.12);
    for (let j = 0; j < s.rows; j += 1) {
      for (let i = 0; i < s.cols; i += 1) {
        const sh = s.shade[j * s.cols + i] ?? 0;
        const x = s.x0 + i * s.step;
        const y = s.y0 + j * s.step;
        // Shade: a shaded dot swells a little and dims toward the cool tone.
        const grow = l.motionSafe ? 1 + 0.6 * sw * sh : 1;
        const d = size * grow * (0.94 + 0.06 * lift);
        const dd = d * 1.12;
        g.globalAlpha = (1 - dm * 0.7 * sh) * (0.72 + 0.28 * s.light);
        g.drawImage(sp.sun, x - dd / 2, y - dd / 2, dd, dd);
        if (sh > 0.01) {
          g.globalAlpha = sh * dm;
          g.drawImage(sp.shade, x - dd / 2, y - dd / 2, dd, dd);
        }
      }
    }
    g.globalAlpha = 1;
    const root = rootRef.current;
    if (root && !root.hasAttribute("data-live"))
      root.setAttribute("data-live", "");
  };

  /* ---------------------------------- loop ---------------------------------- */

  const newCloud = (gathered: boolean): Cloud => {
    const s = sim.current;
    const l = latest.current;
    s.born += 1;
    const R = s.h * 0.5 * clamp(l.cloud, 0.4, 1.6);
    const puffs = makeCloud(l.seed * 31 + s.born * 7);
    if (gathered) for (const p of puffs) p.k = 1;
    // Busy begins with the cloud gathering a little in from the left; each
    // later one forms just off the edge and drifts in.
    const first = s.born === 1;
    return {
      x: l.motionSafe ? (first ? s.w * 0.22 : -R * 0.6) : s.w * 0.5,
      y: s.h * 0.5,
      age: 0,
      puffs,
      thinning: false,
    };
  };

  /** Puffs gather and the light lifts on springs.drift's constants, stepped here. */
  const springAccel = (x: number, v: number, to: number) => {
    const { stiffness, damping, mass } = springs.drift;
    return (stiffness * (to - x) - damping * v) / mass;
  };

  const step = (dt: number) => {
    const s = sim.current;
    const l = latest.current;
    s.time += dt;
    const R = s.h * 0.5 * clamp(l.cloud, 0.4, 1.6);
    const busy = l.state === "busy";
    if (busy && !s.cloud) s.cloud = newCloud(false);
    const c = s.cloud;
    if (c) {
      c.age += dt;
      if (!busy) c.thinning = true;
      let alive = false;
      for (const p of c.puffs) {
        const to = c.thinning ? 0 : c.age >= p.delay ? 1 : 0;
        p.kv += springAccel(p.k, p.kv, to) * dt;
        p.k = clamp(p.k + p.kv * dt, 0, 1.2);
        if (p.k > 0.002 || to > 0) alive = true;
      }
      if (l.motionSafe) {
        // Drifts across at a cloud's pace: about its own width every few seconds.
        c.x += dt * (18 + s.h * 0.22) * clamp(l.drift, 0.2, 3);
        c.y = s.h * 0.5 + Math.sin(s.time * 0.6) * s.h * 0.04;
      }
      if (!alive) s.cloud = null;
      else if (busy && c.x - R * 1.4 > s.w) s.cloud = newCloud(false);
    }
    // The light: a touch dimmer while working, full sun when done.
    const target = l.state === "done" ? 1 : l.state === "busy" ? 0.88 : 0.92;
    if (l.motionSafe) {
      s.lightV += springAccel(s.light, s.lightV, target) * dt;
      s.light += s.lightV * dt;
    } else {
      s.light += (target - s.light) * Math.min(1, dt / 0.25);
    }
    // Each dot eases toward the shadow over it: quickly into shade, slowly
    // out of it, so the cloud leaves a wake.
    const breathe = l.motionSafe ? 1 : 0.78 + 0.22 * Math.sin(s.time * 1.5);
    for (let j = 0; j < s.rows; j += 1) {
      for (let i = 0; i < s.cols; i += 1) {
        const n = j * s.cols + i;
        const x = s.x0 + i * s.step;
        const y = s.y0 + j * s.step;
        const target = s.cloud ? shadowAt(x, y, s.cloud, R) * breathe : 0;
        const cur = s.shade[n] ?? 0;
        const tau = !l.motionSafe ? 0.12 : target > cur ? 0.16 : 0.5;
        s.shade[n] = cur + (target - cur) * (1 - Math.exp(-dt / tau));
      }
    }
  };

  const settled = () => {
    const s = sim.current;
    const l = latest.current;
    if (l.state === "busy") return false;
    if (s.cloud) return false;
    const target = l.state === "done" ? 1 : 0.92;
    if (Math.abs(s.light - target) > 0.002 || Math.abs(s.lightV) > 0.002)
      return false;
    for (let n = 0; n < s.shade.length; n += 1)
      if ((s.shade[n] ?? 0) > 0.003) return false;
    return true;
  };

  const tick = (now: number) => {
    const s = sim.current;
    s.frame = 0;
    const l = latest.current;
    if (l.paused || !s.visible || document.hidden) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(1 / 20, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    step(dt);
    draw();
    if (settled()) {
      s.last = 0;
      if (s.settledFor !== l.state) {
        s.settledFor = l.state;
        l.onSettle?.(l.state);
      }
      return;
    }
    s.frame = window.requestAnimationFrame((t) => api.current.tick(t));
  };

  const kick = () => {
    const s = sim.current;
    if (s.frame || !s.visible || document.hidden || latest.current.paused)
      return;
    s.frame = window.requestAnimationFrame((t) => api.current.tick(t));
  };

  const api = React.useRef<{
    tick: FrameRequestCallback;
    kick: () => void;
    layout: () => void;
    readColours: () => void;
    draw: () => void;
  }>({
    tick: () => {},
    kick: () => {},
    layout: () => {},
    readColours: () => {},
    draw: () => {},
  });

  React.useEffect(() => {
    const was = latest.current;
    latest.current = config;
    api.current = { tick, kick, layout, readColours, draw };
    if (was.state !== state) sim.current.settledFor = "";
    // Laid out here too: the first size report can arrive before this
    // effect has handed the observer its real handlers.
    if (
      sim.current.w === 0 ||
      was.dotSize !== dotSize ||
      was.pitch !== pitch ||
      was.dpr !== dpr
    )
      api.current.layout();
    api.current.draw();
    api.current.kick();
  });

  React.useEffect(() => {
    const onVisibility = () => api.current.kick();
    document.addEventListener("visibilitychange", onVisibility);
    const s = sim.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (s.frame) window.cancelAnimationFrame(s.frame);
      s.frame = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current.layout();
      api.current.draw();
      api.current.kick();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      sim.current.visible = Boolean(entry?.isIntersecting);
      api.current.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      sim.current.visible = false;
    };
  }, []);

  // A new theme or colour: the carriers' colours change, and the sprites are
  // painted again from them.
  const repaint = React.useRef(0);
  const onColours = () => {
    if (repaint.current) return;
    repaint.current = window.requestAnimationFrame(() => {
      repaint.current = 0;
      api.current.readColours();
      api.current.draw();
    });
  };
  React.useEffect(
    () => () => {
      if (repaint.current) window.cancelAnimationFrame(repaint.current);
    },
    [],
  );

  const said =
    labels?.[state] ??
    (state === "busy" ? `${label}…` : state === "done" ? "Done." : "Ready.");

  return (
    <div
      ref={bindRoot}
      role="status"
      aria-live="polite"
      className={cn(
        "group/passing-cumulus relative h-28 w-full overflow-hidden",
        className,
      )}
    >
      <span className="sr-only">{said}</span>
      {/* The server's frame: the same dots, evenly lit, drawn in CSS. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 block group-data-live/passing-cumulus:hidden"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, ${sunColor} ${Math.round(clamp(dotSize, 3, 12) / 2)}px, transparent ${Math.round(clamp(dotSize, 3, 12) / 2) + 1}px)`,
          backgroundSize: `${Math.round(Math.max(clamp(dotSize, 3, 12) + 2, clamp(dotSize, 3, 12) * clamp(pitch, 1.4, 4)))}px ${Math.round(Math.max(clamp(dotSize, 3, 12) + 2, clamp(dotSize, 3, 12) * clamp(pitch, 1.4, 4)))}px`,
          backgroundPosition: "center",
          opacity: 0.85,
        }}
      />
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
        {[
          colours.sun,
          colours.sunHi,
          colours.sunLo,
          colours.shade,
          colours.shadeHi,
          colours.shadeLo,
        ].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
    </div>
  );
}
