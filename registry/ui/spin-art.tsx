"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import {
  useTactileSound,
  type LoopHandle,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SpinArtPalette = "primary" | "sunset" | "sea" | "ink";

export type SpinArtProps = {
  /** How quickly the disc coasts down, 0 (it spins on for many seconds) to 1 (it stops almost at once). @default 0.4 */
  friction?: number;
  /** The size of each drip, px of blot: small drips throw fine threads, big ones heavy ribbons. @default 9 */
  drips?: number;
  /** The paints, used in turn. @default "primary" */
  palette?: SpinArtPalette;
  /** CSS colours to drip in turn, overriding `palette`. */
  colors?: string[];
  /** The speed the disc starts at, turns a minute (negative is anticlockwise). @default 0 */
  defaultSpin?: number;
  /** Fires as the spin passes each 10 turns a minute and when it stops, from the hand, key or friction that changed it. */
  onSpinChange?: (rpm: number) => void;
  /** The fastest a throw or a key can spin it, turns a minute, 60 to 600. @default 360 */
  maxSpin?: number;
  /** How runny the paint is, 0 (thick: short, stubby throws) to 1 (thin: long threads). @default 0.6 */
  runniness?: number;
  /** How long paint stays wet and glossy (and can still be flung), ms. @default 3000 */
  dryTime?: number;
  /** The first time it is seen the disc spins up and three drips land. @default true */
  intro?: boolean;
  /** Fires after each drip lands, with the drips on the card. */
  onDrip?: (count: number) => void;
  /** Fires when the card is cleared. */
  onClear?: () => void;
  /** A whir while the disc turns, after you spin it. @default false */
  sound?: boolean;
  /** The turntable's accessible name. @default "Spin-art turntable" */
  label?: string;
  /** No spinning, dripping or clearing. @default false */
  disabled?: boolean;
  /** Seeds where keyboard drips land and how each one breaks up. @default 4 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the piece; the disc fits inside and centres. It is 224px tall by default. */
  className?: string;
};

const PALETTES: Record<SpinArtPalette, string[]> = {
  primary: [
    "oklch(from var(--danger) 0.6 0.2 h)",
    "oklch(from var(--warn) 0.84 0.16 calc(h + 12))",
    "oklch(from var(--accent) 0.5 0.19 h)",
  ],
  sunset: [
    "oklch(from var(--warn) 0.74 0.16 calc(h - 30))",
    "oklch(from var(--danger) 0.66 0.18 calc(h - 25))",
    "oklch(from var(--accent) 0.48 0.15 calc(h + 45))",
  ],
  sea: [
    "oklch(from var(--success) 0.62 0.11 calc(h + 30))",
    "oklch(from var(--accent) 0.5 0.15 calc(h - 20))",
    "oklch(from var(--success) 0.84 0.08 calc(h + 20))",
  ],
  ink: [
    "oklch(from var(--ink-3) 0.25 0.02 h)",
    "oklch(from var(--ink-3) 0.55 0.015 h)",
    "oklch(from var(--danger) 0.55 0.19 h)",
  ],
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;
const RPM = TAU / 60;
const RIVULETS = 160;
const TRAIL = 18;
const STEP = 1 / 240;

type Config = {
  friction: number;
  drips: number;
  runniness: number;
  dryTime: number;
  maxSpin: number;
  intro: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
  audio: TactileSound;
  colours: number;
};

type Report = {
  spin: (rpm: number) => void;
  drip: (count: number) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  seen: (inView: boolean) => void;
  wake: () => void;
  /** Adds to the spin, rad/s; `byHand` lets the whir answer it. */
  impulse: (delta: number, byHand: boolean) => void;
  brake: () => void;
  hold: (angle: number | null, velocity?: number) => void;
  angle: () => number;
  /** Drips at a point in the box; returns false if it missed the card. */
  drip: (x: number, y: number) => boolean;
  dripSomewhere: () => void;
  clear: () => void;
  geometry: () => { cx: number; cy: number; r: number };
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  report: { current: Report },
  byHandRef: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  const layer = document.createElement("canvas");
  const paint = layer.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let raf = 0;
  let last = 0;
  let w = 0;
  let h = 0;
  let dprNow = 1;
  let cx = 0;
  let cy = 0;
  let R = 0;
  let angle = 0;
  let omega = 0;
  let braking = false;
  let held: number | null = null;
  let heldPrev = 0;
  let lastReported = 0;
  let drips = 0;
  let colourTurn = 0;
  let introDone = false;
  let introAt = -1;
  let introDrops = 0;
  let clock = 0;
  let clearAt = -1;
  let whir: LoopHandle | null = null;
  let whirAudio: TactileSound | null = null;
  let seed = 1;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  /* Rivulets, in the card's own frame (px from its centre). */
  const rx = new Float32Array(RIVULETS);
  const ry = new Float32Array(RIVULETS);
  const rvx = new Float32Array(RIVULETS);
  const rvy = new Float32Array(RIVULETS);
  const rm = new Float32Array(RIVULETS);
  const rw = new Float32Array(RIVULETS);
  const rage = new Float32Array(RIVULETS);
  const rcol = new Uint8Array(RIVULETS);
  /** 0 free, 1 wet and able to run, 2 dried. */
  const rstate = new Uint8Array(RIVULETS);
  const trailX = new Float32Array(RIVULETS * TRAIL);
  const trailY = new Float32Array(RIVULETS * TRAIL);
  const trailN = new Uint8Array(RIVULETS);
  /* Splash rings, in the card's frame. */
  const splash = { x: 0, y: 0, r: 0, at: -1, col: 0 };

  let paints: string[] = ["red", "gold", "blue"];
  let look = {
    paper: "white",
    platter: "black",
    rim: "gray",
    pin: "silver",
    gloss: "rgba(255,255,255,0.7)",
  };

  const reader = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.getContext("2d", { willReadFrequently: true });
  })();
  const resolve = (colour: string) => {
    if (!reader) return "gray";
    reader.clearRect(0, 0, 1, 1);
    reader.fillStyle = "rgb(128, 128, 128)";
    reader.fillStyle = colour;
    reader.fillRect(0, 0, 1, 1);
    const d = reader.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
  };

  const toLocal = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    return { x: c * dx - s * dy, y: s * dx + c * dy };
  };

  /** Paint is deposited on the layer, which is the card at its own scale. */
  const deposit = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    col: number,
  ) => {
    if (!paint) return;
    paint.strokeStyle = paints[col % paints.length] ?? "red";
    paint.lineWidth = width;
    paint.beginPath();
    paint.moveTo(R + x0, R + y0);
    paint.lineTo(R + x1, R + y1);
    paint.stroke();
  };

  const blot = (x: number, y: number, r: number, col: number) => {
    if (!paint) return;
    paint.fillStyle = paints[col % paints.length] ?? "red";
    paint.beginPath();
    paint.arc(R + x, R + y, r, 0, TAU);
    paint.fill();
  };

  const free = () => {
    for (let i = 0; i < RIVULETS; i += 1) if (rstate[i] !== 1) return i;
    return -1;
  };

  /** A drip lands at a card-local point and breaks into rivulets round its edge. */
  const land = (x: number, y: number) => {
    const c = cfg;
    if (!c) return;
    // A drip during a clear lands on the fresh card, not the fading one.
    if (clearAt >= 0) {
      clearAt = -1;
      wipe();
    }
    const size = clamp(c.drips, 3, 20);
    const col = colourTurn % Math.max(1, paints.length);
    colourTurn += 1;
    blot(x, y, size, col);
    const count = 5 + Math.floor(rand() * 5);
    const spin = rand() * TAU;
    for (let k = 0; k < count; k += 1) {
      const i = free();
      if (i < 0) break;
      const a = spin + (k / count) * TAU + (rand() - 0.5) * 0.5;
      rx[i] = x + Math.cos(a) * size * 0.75;
      ry[i] = y + Math.sin(a) * size * 0.75;
      rvx[i] = Math.cos(a) * 12;
      rvy[i] = Math.sin(a) * 12;
      rm[i] = 0.6 + rand() * 0.4;
      rw[i] = size * (0.55 + rand() * 0.25);
      rage[i] = 0;
      rcol[i] = col;
      rstate[i] = 1;
      trailN[i] = 0;
    }
    splash.x = x;
    splash.y = y;
    splash.r = size;
    splash.at = clock;
    splash.col = col;
    drips += 1;
    report.current.drip(drips);
    if (!c.motionSafe) settleNow();
    kick();
  };

  /** One substep of every wet rivulet, in the turning card's own frame. */
  const run = (dt: number) => {
    const c = cfg;
    if (!c) return false;
    const runny = clamp(c.runniness, 0, 1);
    const drag = lerp(48, 14, runny);
    const yieldA = lerp(900, 220, runny);
    const dry = Math.max(200, c.dryTime) / 1000;
    const om = omega;
    let any = false;
    for (let i = 0; i < RIVULETS; i += 1) {
      if (rstate[i] !== 1) continue;
      rage[i] = (rage[i] ?? 0) + dt;
      if ((rage[i] ?? 0) > dry) {
        rstate[i] = 2;
        continue;
      }
      any = true;
      if ((rm[i] ?? 0) <= 0.02) continue;
      const x = rx[i] ?? 0;
      const y = ry[i] ?? 0;
      const r = Math.hypot(x, y) || 1e-3;
      const pull = om * om * r;
      let vx = rvx[i] ?? 0;
      let vy = rvy[i] ?? 0;
      if (pull > yieldA) {
        // Centrifugal outward, Coriolis bending the thread back against the
        // spin, and the paint's own drag holding it to a creep.
        const ax = om * om * x + 2 * om * vy;
        const ay = om * om * y - 2 * om * vx;
        vx += (ax - drag * vx) * dt;
        vy += (ay - drag * vy) * dt;
      } else {
        vx *= Math.exp(-drag * 2 * dt);
        vy *= Math.exp(-drag * 2 * dt);
      }
      const sp = Math.hypot(vx, vy);
      if (sp > 2400) {
        vx = (vx / sp) * 2400;
        vy = (vy / sp) * 2400;
      }
      rvx[i] = vx;
      rvy[i] = vy;
      const nx = x + vx * dt;
      const ny = y + vy * dt;
      const moved = Math.hypot(nx - x, ny - y);
      if (moved > 0.05) {
        const m = rm[i] ?? 0;
        deposit(
          x,
          y,
          nx,
          ny,
          Math.max(0.6, (rw[i] ?? 3) * Math.sqrt(m)),
          rcol[i] ?? 0,
        );
        rm[i] = Math.max(
          0,
          m - moved * lerp(0.012, 0.004, runny) * (8 / Math.max(3, rw[i] ?? 3)),
        );
        rx[i] = nx;
        ry[i] = ny;
        const n = trailN[i] ?? 0;
        const base = i * TRAIL;
        if (n < TRAIL) {
          trailX[base + n] = nx;
          trailY[base + n] = ny;
          trailN[i] = n + 1;
        } else {
          trailX.copyWithin(base, base + 1, base + TRAIL);
          trailY.copyWithin(base, base + 1, base + TRAIL);
          trailX[base + TRAIL - 1] = nx;
          trailY[base + TRAIL - 1] = ny;
        }
        if (Math.hypot(nx, ny) >= R - 1.5) {
          // Off the edge: a few flecks where it left.
          for (let k = 0; k < 3; k += 1) {
            const a = Math.atan2(ny, nx) + (rand() - 0.5) * 0.3;
            const rr = R - 2 - rand() * 6;
            blot(
              Math.cos(a) * rr,
              Math.sin(a) * rr,
              0.6 + rand() * 1.2,
              rcol[i] ?? 0,
            );
          }
          rm[i] = 0;
        }
      }
    }
    return any;
  };

  /** Reduced motion: every wet rivulet runs to where it would end, at once. */
  const settleNow = () => {
    for (let k = 0; k < 600; k += 1) {
      let moving = false;
      for (let i = 0; i < RIVULETS; i += 1)
        if (rstate[i] === 1 && (rm[i] ?? 0) > 0.02) moving = true;
      if (!moving) break;
      run(1 / 240);
    }
  };

  const updateWhir = () => {
    const c = cfg;
    if (!c) return;
    const speed = Math.abs(omega) / (Math.max(60, c.maxSpin) * RPM);
    if (!byHandRef.current || speed < 0.02) {
      whir?.stop();
      whir = null;
      if (speed < 0.02) byHandRef.current = false;
      return;
    }
    const gain = clamp(0.15 + speed * 0.55, 0, 0.7);
    const pitch = 0.6 + speed * 1.5;
    if (!whir || whirAudio !== c.audio) {
      whir?.stop();
      whirAudio = c.audio;
      whir = c.audio.start("whir", { gain, pitch });
    } else whir.set({ gain, pitch });
  };

  const spinStep = (dt: number) => {
    const c = cfg;
    if (!c) return false;
    if (held !== null) {
      omega = (held - heldPrev) / Math.max(dt, 1e-4);
      heldPrev = held;
      angle = held;
      return true;
    }
    if (omega === 0) return false;
    const f = clamp(c.friction, 0, 1);
    const bearing = braking ? 40 : lerp(0.35, 7, f);
    const air = lerp(0.015, 0.7, f);
    const slow = (bearing + air * Math.abs(omega)) * dt;
    if (Math.abs(omega) <= slow) {
      omega = 0;
      braking = false;
    } else omega -= Math.sign(omega) * slow;
    if (c.motionSafe) angle += omega * dt;
    return omega !== 0;
  };

  const reportSpin = () => {
    const rpm = Math.round(omega / RPM / 10) * 10;
    if (rpm !== lastReported) {
      lastReported = rpm;
      report.current.spin(rpm);
    }
  };

  const step = (dt: number): boolean => {
    clock += dt;
    let moving = spinStep(dt);
    const n = Math.max(1, Math.ceil(dt / STEP));
    for (let i = 0; i < n; i += 1) if (run(dt / n)) moving = true;
    if (splash.at >= 0) {
      if (clock - splash.at > 0.45) splash.at = -1;
      else moving = true;
    }
    if (clearAt >= 0) {
      if (clock - clearAt >= durations.base) {
        clearAt = -1;
        wipe();
      } else moving = true;
    }
    // The intro: spin up, then three drips a beat apart.
    if (introAt >= 0) {
      const t = clock - introAt;
      if (introDrops < 3 && t > 0.45 + introDrops * 0.42) {
        const a = rand() * TAU;
        const r = R * (0.12 + 0.3 * rand());
        land(Math.cos(a) * r, Math.sin(a) * r);
        introDrops += 1;
      }
      if (introDrops >= 3) introAt = -1;
      moving = true;
    }
    reportSpin();
    updateWhir();
    return moving;
  };

  const wipe = () => {
    paint?.clearRect(0, 0, layer.width, layer.height);
    for (let i = 0; i < RIVULETS; i += 1) rstate[i] = 0;
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || !visible || w < 2) return;
    ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // The platter and its rim.
    ctx.fillStyle = look.platter;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = look.rim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 5, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
    // The card, then its paint, turned to the card's angle.
    ctx.fillStyle = look.paper;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    const fading = clearAt >= 0 ? 1 - (clock - clearAt) / durations.base : 1;
    const blur = c.motionSafe ? Math.abs(omega) * (1 / 75) : 0;
    const copies = blur > 0.08 ? Math.min(6, 2 + Math.floor(blur / 0.35)) : 1;
    for (let k = 0; k < copies; k += 1) {
      const a =
        angle - (copies > 1 ? (blur * k) / (copies - 1) : 0) * Math.sign(omega);
      ctx.globalAlpha = clamp(fading, 0, 1) / (k + 1);
      ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.drawImage(layer, -R, -R, 2 * R, 2 * R);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // Wet paint is glossy: a highlight on the light's side of every wet
    // thread, fading as it dries matte.
    const dry = Math.max(200, c.dryTime) / 1000;
    const lx = -0.6;
    const ly = -0.8;
    const ca = Math.cos(-angle);
    const sa = Math.sin(-angle);
    const ox = (ca * lx - sa * ly) * 1.2;
    const oy = (sa * lx + ca * ly) * 1.2;
    ctx.strokeStyle = look.gloss;
    ctx.lineCap = "round";
    for (let i = 0; i < RIVULETS; i += 1) {
      if (rstate[i] !== 1) continue;
      const n = trailN[i] ?? 0;
      if (n < 2) continue;
      const wet = 1 - (rage[i] ?? 0) / dry;
      if (wet <= 0) continue;
      ctx.globalAlpha = wet * 0.5 * clamp(fading, 0, 1);
      ctx.lineWidth = Math.max(0.5, (rw[i] ?? 3) * 0.18);
      ctx.beginPath();
      const base = i * TRAIL;
      for (let k = 0; k < n; k += 1) {
        const x = (trailX[base + k] ?? 0) + ox;
        const y = (trailY[base + k] ?? 0) + oy;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (splash.at >= 0 && c.motionSafe) {
      const t = (clock - splash.at) / 0.45;
      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.strokeStyle = paints[splash.col % paints.length] ?? "red";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      // Overshoots and settles, like a drop landing.
      const grow = 1 - Math.exp(-6 * t) * Math.cos(9 * t);
      ctx.arc(splash.x, splash.y, splash.r * (0.9 + 0.9 * grow), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    // The centre pin.
    ctx.fillStyle = look.platter;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = look.pin;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, 2.6, 0, TAU);
    ctx.fill();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    draw();
    if (moving) raf = window.requestAnimationFrame(tick);
    else {
      last = 0;
      whir?.stop();
      whir = null;
    }
  };

  const kick = () => {
    if (disposed || raf || !visible || document.hidden || !ctx) return;
    raf = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const css = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "gray";
    };
    look = {
      paper: resolve(css(0)),
      platter: resolve(css(1)),
      rim: resolve(css(2)),
      pin: resolve(css(3)),
      gloss: "rgba(255, 255, 255, 0.9)",
    };
    const n = cfg?.colours ?? 3;
    paints = [];
    for (let i = 0; i < n; i += 1) paints.push(resolve(css(4 + i)));
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx || !paint) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 2 || nh < 2) return;
    w = nw;
    h = nh;
    dprNow = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dprNow);
    canvas.height = Math.round(h * dprNow);
    cx = w / 2;
    cy = h / 2;
    const nextR = Math.max(20, Math.floor(Math.min(w, h) / 2 - 8));
    const size = Math.round(2 * nextR * dprNow);
    if (layer.width !== size) {
      // Keep the painting across a resize: scale the old card into the new.
      let keep: HTMLCanvasElement | null = null;
      if (layer.width > 0 && R > 0) {
        keep = document.createElement("canvas");
        keep.width = layer.width;
        keep.height = layer.height;
        keep.getContext("2d")?.drawImage(layer, 0, 0);
      }
      layer.width = size;
      layer.height = size;
      if (keep) paint.drawImage(keep, 0, 0, size, size);
    }
    R = nextR;
    paint.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    paint.lineCap = "round";
    draw();
    kick();
  };

  const startIntro = () => {
    const c = cfg;
    if (!c || introDone || !c.intro) return;
    introDone = true;
    if (drips > 0) return;
    omega = Math.max(omega, 220 * RPM);
    if (!c.motionSafe) {
      for (let k = 0; k < 3; k += 1) {
        const a = rand() * TAU;
        const r = R * (0.12 + 0.3 * rand());
        land(Math.cos(a) * r, Math.sin(a) * r);
      }
      return;
    }
    introAt = clock;
    introDrops = 0;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx || !paint) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        seed = Math.imul(next.seed + 11, 2654435761) >>> 0 || 1;
        readColours();
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.dpr !== next.dpr) resize();
      if (was.audio !== next.audio) {
        whir?.stop();
        whir = null;
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    seen(inView) {
      visible = inView;
      if (!inView) return;
      startIntro();
      draw();
      kick();
    },
    wake() {
      draw();
      kick();
    },
    impulse(delta, byHand) {
      const c = cfg;
      if (!c) return;
      const max = clamp(c.maxSpin, 60, 600) * RPM;
      omega = clamp(omega + delta, -max, max);
      braking = false;
      if (byHand) byHandRef.current = true;
      if (!c.motionSafe) settleNow();
      kick();
    },
    brake() {
      braking = true;
      if (cfg && !cfg.motionSafe) {
        omega = 0;
        braking = false;
      }
      kick();
    },
    hold(next, velocity) {
      const c = cfg;
      if (next === null) {
        held = null;
        if (c && velocity !== undefined) {
          const max = clamp(c.maxSpin, 60, 600) * RPM;
          omega = clamp(velocity, -max, max);
          byHandRef.current = true;
          if (!c.motionSafe) settleNow();
        }
      } else {
        if (held === null) heldPrev = next;
        held = next;
        if (c && !c.motionSafe) angle = next;
      }
      kick();
    },
    angle: () => angle,
    drip(x, y) {
      const p = toLocal(x, y);
      if (Math.hypot(p.x, p.y) > R - 2) return false;
      land(p.x, p.y);
      return true;
    },
    dripSomewhere() {
      const a = rand() * TAU;
      const r = R * (0.08 + 0.32 * rand());
      land(Math.cos(a) * r, Math.sin(a) * r);
    },
    clear() {
      // The count is cleared at once; the paint fades off the card.
      drips = 0;
      introAt = -1;
      report.current.drip(0);
      if (cfg?.motionSafe) clearAt = clock;
      else wipe();
      kick();
    },
    geometry: () => ({ cx, cy, r: R }),
    dispose() {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      whir?.stop();
      whir = null;
    },
  };
}

/**
 * A spin-art turntable: a round paper card on a dark platter. Drag round the
 * card and it turns 1:1 under your hand; let go and it coasts on, slowing on
 * bearing friction and air drag. Tap to drip paint: the drip lands as a blot
 * with a little splash, then breaks into threads that run outward under the
 * spin's centrifugal pull while, in the card's own frame, the Coriolis effect
 * bends them back against it — a slow spin throws loose petals, a fast one
 * long tight spirals. Wet paint carries a gloss highlight that fades as it
 * dries matte, and until it has dried a fresh spin flings it further. A fast
 * card is drawn with rotational blur, the paint smearing into rings.
 *
 * It is a `role="slider"` for the spin in turns a minute: ←/→ spin it up
 * either way, Home/End flat out, Space brakes, Enter drips, Escape clears.
 * Under reduced motion the card does not visibly turn and each drip resolves
 * straight to its finished spiral.
 */
export function SpinArt({
  friction = 0.4,
  drips = 9,
  palette = "primary",
  colors,
  defaultSpin = 0,
  onSpinChange,
  maxSpin = 360,
  runniness = 0.6,
  dryTime = 3000,
  intro = true,
  onDrip,
  onClear,
  sound = false,
  label = "Spin-art turntable",
  disabled = false,
  seed = 4,
  dpr = 2,
  className,
}: SpinArtProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const top = Math.round(clamp(maxSpin, 60, 600));
  const bottom = -top;
  const [rpm, setRpm] = React.useState(
    () => Math.round(clamp(defaultSpin, -top, top) / 10) * 10,
  );
  const [count, setCount] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const inks =
    colors && colors.length ? colors : (PALETTES[palette] ?? PALETTES.primary);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const byHand = React.useRef(false);
  const startSpin = React.useRef(defaultSpin);
  const grab = React.useRef({
    angle: 0,
    raw: 0,
    tracker: createVelocityTracker(),
  });

  const config: Config = {
    friction,
    drips,
    runniness,
    dryTime,
    maxSpin: top,
    intro,
    seed,
    dpr,
    motionSafe,
    colorKey: inks.join("|"),
    audio,
    colours: inks.length,
  };
  const latest = React.useRef(config);
  const onReport = React.useRef<Report>({ spin: () => {}, drip: () => {} });
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
    onReport.current = {
      spin: (next) => {
        setRpm(next);
        onSpinChange?.(next);
      },
      drip: (next) => {
        setCount(next);
        if (next > 0) onDrip?.(next);
      },
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, onReport, byHand);
    engine.current = e;
    e.configure(latest.current);
    if (startSpin.current) e.impulse(startSpin.current * RPM, false);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        engine.current?.seen(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.35 },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (x: number, y: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: x - r.left, y: y - r.top } : { x: 0, y: 0 };
  };

  const pointerAngle = (x: number, y: number) => {
    const e = engine.current;
    if (!e) return 0;
    const g = e.geometry();
    const p = local(x, y);
    return Math.atan2(p.y - g.cy, p.x - g.cx);
  };

  const clear = () => {
    if (disabled) return;
    engine.current?.clear();
    onClear?.();
    setSaid((s) => ({ n: s.n + 1, text: "Card cleared." }));
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => {
      const e = engine.current;
      if (!e) return;
      const g = grab.current;
      g.angle = pointerAngle(point.x, point.y);
      g.raw = e.angle();
      g.tracker.reset();
      g.tracker.push(g.raw, 0, performance.now());
      byHand.current = true;
      e.hold(g.raw);
    },
    onMove: ({ point }) => {
      const e = engine.current;
      if (!e) return;
      const g = grab.current;
      const a = pointerAngle(point.x, point.y);
      let d = a - g.angle;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      g.angle = a;
      g.raw += d;
      g.tracker.push(g.raw, 0, performance.now());
      e.hold(g.raw);
    },
    onEnd: () => {
      const v = grab.current.tracker.velocity().x;
      engine.current?.hold(null, v);
    },
    onCancel: () => engine.current?.hold(null, 0),
    onTap: (event) => {
      const p = local(event.clientX, event.clientY);
      engine.current?.drip(p.x, p.y);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const e = engine.current;
    if (!e) return;
    const by = (event.shiftKey ? 90 : 30) * RPM;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.impulse(by, true);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.impulse(-by, true);
        break;
      case "End":
        e.impulse(top * 2 * RPM, true);
        break;
      case "Home":
        e.impulse(-top * 2 * RPM, true);
        break;
      case " ":
        e.brake();
        break;
      case "Enter":
        e.dripSomewhere();
        break;
      case "Escape":
        clear();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const turning =
    rpm === 0
      ? "Still"
      : `Spinning ${rpm > 0 ? "clockwise" : "anticlockwise"} at ${Math.abs(rpm)} turns a minute`;
  const valueText = `${turning}, ${count} ${count === 1 ? "drip" : "drips"} on the card`;

  return (
    <div
      ref={bindRoot}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      aria-valuemin={bottom}
      aria-valuemax={top}
      aria-valuenow={rpm}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/spin-art relative isolate h-56 w-full touch-none rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed" : "cursor-crosshair",
        className,
      )}
    >
      {/* The still: the server's frame and the first paint. */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/spin-art:opacity-0"
      >
        <circle
          cx={50}
          cy={50}
          r={48}
          style={{ fill: "oklch(from var(--ink-3) 0.28 0.012 h)" }}
        />
        <circle
          cx={50}
          cy={50}
          r={44}
          style={{ fill: "oklch(from var(--warn) 0.97 0.012 h)" }}
        />
        <circle
          cx={50}
          cy={50}
          r={2.4}
          style={{ fill: "oklch(from var(--ink-3) 0.28 0.012 h)" }}
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/spin-art:opacity-100"
      />
      <span id={`${uid}-hint`} className="sr-only">
        Drag round the card to spin it and tap to drip paint, or use the arrow
        keys to spin it, Enter to drip, Space to brake and Escape to clear.
      </span>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        {[
          "oklch(from var(--warn) 0.97 0.012 h)",
          "oklch(from var(--ink-3) 0.28 0.012 h)",
          "oklch(from var(--ink-3) 0.55 0.012 h)",
          "oklch(from var(--ink-3) 0.86 0.008 h)",
          ...inks,
        ].map((colour, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
