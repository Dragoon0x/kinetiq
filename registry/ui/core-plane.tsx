"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import {
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CorePlaneWire = "copper" | "brass" | "silver";

export type CorePlaneProps = {
  /** Controlled: the text written to the plane. */
  value?: string;
  /** Initial text when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires as the visitor types, with the new text. */
  onValueChange?: (text: string) => void;
  /** Diameter of a core, px, 6 to 18: finer cores fit more rows. @default 10 */
  cores?: number;
  /** How hard a core stutters as it flips, 0 (a clean flip) to 1. @default 0.6 */
  flicker?: number;
  /** The wires' colour: a preset, or any CSS colour. @default "copper" */
  wire?: CorePlaneWire | (string & {});
  /** How much older rows fade as new ones are written, 0 (none) to 1. @default 0.6 */
  fade?: number;
  /** Let a background job read random cores when the plane is idle. @default true */
  idle?: boolean;
  /** How many cores the idle job reads a second. @default 1.2 */
  readRate?: number;
  /** Time between bits of a write, ms. @default 26 */
  bitDelay?: number;
  /** Most characters the input takes. @default 64 */
  maxLength?: number;
  /** Shown in the empty input. @default "Type to write" */
  placeholder?: string;
  /** The input's accessible name. @default "Write to core memory" */
  label?: string;
  /** Height of the plane, px. @default 176 */
  height?: number;
  /** Play a tick for every core that flips while you type. Off unless asked for. @default false */
  sound?: boolean;
  /** Hold the plane still: writes land without sparks and the idle job rests. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** No typing; the plane dims. @default false */
  disabled?: boolean;
  className?: string;
};

const WIRES: Record<CorePlaneWire, string> = {
  copper: "oklch(from var(--warn) 0.6 0.11 calc(h - 30))",
  brass: "oklch(from var(--warn) 0.72 0.11 calc(h - 6))",
  silver: "oklch(from var(--ink-2) 0.7 0.01 h)",
};
const LIT = "oklch(from var(--warn) 0.84 0.15 h)";
const FERRITE = "oklch(from var(--ink-2) 0.43 0.014 h)";
const SPARK = "oklch(from var(--warn) 0.9 0.12 h)";
/** On a pale board a spark is drawn as a hot, darker streak so it still reads. */
const SPARK_INK = "oklch(from var(--warn) 0.6 0.18 calc(h - 12))";

const LABEL_WIDE = 52;
const LABEL_NARROW = 22;
const DRIVER = 12;
const TOP = 18;
const EDGE = 8;
/** A column spark's run from the top driver, s. */
const DROP = 0.14;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** The bytes of a string, UTF‑8, with the character each one belongs to. */
function bytesOf(
  text: string,
): { byte: number; char: string; lead: boolean }[] {
  const out: { byte: number; char: string; lead: boolean }[] = [];
  const enc = new TextEncoder();
  for (const ch of Array.from(text)) {
    const bytes = enc.encode(ch);
    bytes.forEach((b, i) => out.push({ byte: b, char: ch, lead: i === 0 }));
  }
  return out;
}

const hex = (b: number) => b.toString(16).padStart(2, "0");
const show = (ch: string) => (ch === " " ? "␠" : ch);

/** The plane's layout for a box and a core size. */
function layout(w: number, h: number, cores: number) {
  const labelW = w >= 240 ? LABEL_WIDE : LABEL_NARROW;
  const p0 = clamp(cores, 6, 18) * 2.3;
  // An inner margin on both sides, so labels never touch the frame.
  const p = Math.max(8, Math.min(p0, (w - 2 * EDGE - labelW - DRIVER) / 8));
  const rows = Math.max(2, Math.floor((h - TOP - EDGE) / p));
  const block = labelW + DRIVER + 8 * p;
  const left = Math.max(EDGE, (w - block) / 2);
  const gridH = rows * p;
  return {
    p,
    c: p / 2.3,
    rows,
    labelW,
    left,
    x0: left + labelW + DRIVER,
    y0: TOP + Math.max(0, (h - TOP - EDGE - gridH) / 2),
  };
}

type Layout = ReturnType<typeof layout>;

type Config = {
  text: string;
  user: boolean;
  cores: number;
  flicker: number;
  fade: number;
  idle: boolean;
  readRate: number;
  bitDelay: number;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
  audio: TactileSound;
};

type Flip = {
  core: number;
  start: number;
  dur: number;
  from: number;
  to: number;
  read: boolean;
};
type Spark = {
  kind: 0 | 1;
  row: number;
  col: number;
  start: number;
  dur: number;
  faint: boolean;
};
type Write = { byte: number; label: string; user: boolean; erase: boolean };

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  wake: () => void;
  readColours: () => void;
  dispose: () => void;
};

/**
 * The plane outside React: a ring of rows, each a byte, the cores' shown
 * brightness, and the flips and sparks in flight, drawn on one canvas.
 */
function createPlane(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let live = false;
  let geo: Layout = layout(0, 0, 10);
  const size = { w: 0, h: 0, dpr: 1 };
  let text = "";
  /** The current text's bytes, for restoring older rows as newer ones are erased. */
  let textBytes: ReturnType<typeof bytesOf> = [];
  let shown = new Float32Array(0);
  let bits = new Uint8Array(0);
  let labels: string[] = [];
  let seqs = new Float64Array(0);
  let labelAt = new Float64Array(0);
  let written = 0;
  let total = 0;
  let flips: Flip[] = [];
  let sparks: Spark[] = [];
  const queue: Write[] = [];
  let nextWrite = 0;
  let lastType = -1e9;
  let idleTimer = 0;
  let seed = 0x2f6b1c3d;
  const paint = {
    wire: "rgb(160, 100, 60)",
    lit: "rgb(240, 200, 110)",
    ferrite: "rgb(60, 55, 50)",
    spark: "rgb(255, 230, 170)",
    ink: "rgb(120, 120, 130)",
    sparkInk: "rgb(200, 110, 40)",
    dark: true,
    font: "monospace",
  };
  let glow: HTMLCanvasElement | null = null;

  const now = () => performance.now() / 1000;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const readColours = () => {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const pc = probe.getContext("2d", { willReadFrequently: true });
    const read = (el: Element | undefined) => {
      if (!pc || !el) return [0, 0, 0] as const;
      pc.clearRect(0, 0, 1, 1);
      pc.fillStyle = "rgb(0, 0, 0)";
      pc.fillStyle = getComputedStyle(el).color;
      pc.fillRect(0, 0, 1, 1);
      const d = pc.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] as const;
    };
    const k = carriers.children;
    const rgb = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const ground = read(k[5]);
    paint.wire = rgb(read(k[0]));
    paint.lit = rgb(read(k[1]));
    paint.ferrite = rgb(read(k[2]));
    paint.spark = rgb(read(k[3]));
    paint.ink = rgb(read(k[4]));
    paint.sparkInk = rgb(read(k[6]));
    paint.dark =
      (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 <
      0.5;
    paint.font = k[4] ? getComputedStyle(k[4]).fontFamily : "monospace";
    // The halo a lit core casts, rendered once per colour.
    const g = glow ?? document.createElement("canvas");
    g.width = 48;
    g.height = 48;
    const gc = g.getContext("2d");
    if (gc) {
      gc.clearRect(0, 0, 48, 48);
      const lit = read(k[1]);
      const grad = gc.createRadialGradient(24, 24, 0, 24, 24, 24);
      grad.addColorStop(0, `rgba(${lit[0]}, ${lit[1]}, ${lit[2]}, 0.55)`);
      grad.addColorStop(1, `rgba(${lit[0]}, ${lit[1]}, ${lit[2]}, 0)`);
      gc.fillStyle = grad;
      gc.fillRect(0, 0, 48, 48);
    }
    glow = g;
  };

  /** Rebuild the ring for the current layout, keeping the last bytes of the text. */
  const rebuild = () => {
    const R = geo.rows;
    shown = new Float32Array(R * 8);
    bits = new Uint8Array(R * 8);
    labels = Array.from({ length: R }, () => "");
    seqs = new Float64Array(R).fill(-1);
    labelAt = new Float64Array(R).fill(-1e9);
    flips = [];
    sparks = [];
    queue.length = 0;
    const list = bytesOf(text);
    textBytes = list;
    total = list.length;
    written = total;
    const from = Math.max(0, total - R);
    for (let k = from; k < total; k += 1) {
      const b = list[k];
      if (!b) continue;
      const row = k % R;
      for (let col = 0; col < 8; col += 1) {
        const on = (b.byte >> (7 - col)) & 1;
        bits[row * 8 + col] = on;
        shown[row * 8 + col] = on;
      }
      labels[row] = b.lead
        ? `${show(b.char)} ${hex(b.byte)}`
        : `· ${hex(b.byte)}`;
      seqs[row] = k;
    }
  };

  /** A new text: append writes, erase from the end, or rewrite the lot. */
  const take = (next: string, user: boolean) => {
    if (next === text) return;
    const was = bytesOf(text);
    const now2 = bytesOf(next);
    text = next;
    textBytes = now2;
    let same = 0;
    while (
      same < was.length &&
      same < now2.length &&
      was[same]?.byte === now2[same]?.byte
    )
      same += 1;
    const R = geo.rows;
    // Erase what went, newest first, then write what came.
    for (let k = was.length - 1; k >= same; k -= 1) {
      queue.push({ byte: 0, label: "", user, erase: true });
    }
    // A long paste: only the last rows are worth animating.
    const add = now2.slice(same);
    const skip = Math.max(0, add.length - R);
    for (let k = 0; k < add.length; k += 1) {
      const b = add[k];
      if (!b) continue;
      const label = b.lead
        ? `${show(b.char)} ${hex(b.byte)}`
        : `· ${hex(b.byte)}`;
      queue.push({
        byte: b.byte,
        label,
        user: user && k >= skip,
        erase: false,
      });
    }
    if (skip > 0) {
      // Land the overwritten ones at once, silently.
      for (let k = 0; k < skip; k += 1) {
        const w = queue.find((q) => !q.erase);
        if (!w) break;
        queue.splice(queue.indexOf(w), 1);
        land(w);
      }
    }
    if (user) lastType = now();
    kick();
  };

  /** A write that skips its animation. */
  const land = (w: Write) => {
    const R = geo.rows;
    if (w.erase) {
      written = Math.max(0, written - 1);
      const row = ((written % R) + R) % R;
      const older = written >= R ? textBytes[written - R] : undefined;
      for (let col = 0; col < 8; col += 1) {
        const on = older ? (older.byte >> (7 - col)) & 1 : 0;
        bits[row * 8 + col] = on;
        shown[row * 8 + col] = on;
      }
      labels[row] = older
        ? older.lead
          ? `${show(older.char)} ${hex(older.byte)}`
          : `· ${hex(older.byte)}`
        : "";
      seqs[row] = older ? written - R : -1;
      return;
    }
    const row = written % R;
    for (let col = 0; col < 8; col += 1) {
      const on = (w.byte >> (7 - col)) & 1;
      bits[row * 8 + col] = on;
      shown[row * 8 + col] = on;
    }
    labels[row] = w.label;
    seqs[row] = written;
    labelAt[row] = -1e9;
    written += 1;
  };

  /** Start one write: the row spark, the column sparks, and the flips they meet at. */
  const begin = (w: Write, t: number) => {
    const c = cfg;
    if (!c) return;
    const R = geo.rows;
    const bd = clamp(c.bitDelay, 8, 120) / 1000;
    const quiet = !c.motionSafe || c.paused;
    let row: number;
    let byte = w.byte;
    let label = w.label;
    let seq = written;
    if (w.erase) {
      written = Math.max(0, written - 1);
      row = ((written % R) + R) % R;
      // The row goes back to the older byte it held, if the text still has one.
      const older = textBytes[written - R];
      if (written >= R && older) {
        byte = older.byte;
        label = older.lead
          ? `${show(older.char)} ${hex(older.byte)}`
          : `· ${hex(older.byte)}`;
        seq = written - R;
      } else {
        byte = 0;
        label = "";
        seq = -1;
      }
    } else {
      row = written % R;
      written += 1;
    }
    const fl = clamp01(c.flicker);
    const flipDur = quiet ? durations.base : 0.06 + 0.16 * fl;
    let flipped = 0;
    for (let col = 0; col < 8; col += 1) {
      const i = row * 8 + col;
      const on = (byte >> (7 - col)) & 1;
      const at = t + DROP + (col + 1) * bd;
      if ((bits[i] ?? 0) !== on) {
        flips.push({
          core: i,
          start: quiet ? t : at,
          dur: flipDur,
          from: shown[i] ?? 0,
          to: on,
          read: false,
        });
        if (!quiet) {
          sparks.push({
            kind: 1,
            row,
            col,
            start: at - DROP,
            dur: DROP,
            faint: false,
          });
          if (w.user) {
            const pitch = 0.85 + (7 - col) * 0.06;
            const ms = Math.round((at - t) * 1000);
            window.setTimeout(() => {
              if (!disposed) cfg?.audio.play("tick", { pitch, gain: 0.32 });
            }, ms);
          }
        }
        flipped += 1;
      }
      bits[i] = on;
    }
    if (!quiet) {
      sparks.push({
        kind: 0,
        row,
        col: 8,
        start: t + DROP,
        dur: 8 * bd + 0.02,
        faint: false,
      });
    }
    labels[row] = label;
    seqs[row] = seq;
    if (label) labelAt[row] = t + DROP;
    void flipped;
  };

  /** The idle job: a destructive read and rewrite of one written core. */
  const scheduleIdle = () => {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = 0;
    const c = cfg;
    if (!c || disposed || !c.idle || !c.motionSafe || c.paused) return;
    if (!visible.current || document.hidden) return;
    const rate = clamp(c.readRate, 0.1, 8);
    const wait = (0.6 + rand() * 0.8) / rate;
    idleTimer = window.setTimeout(
      () => {
        idleTimer = 0;
        readOne();
        scheduleIdle();
      },
      Math.round(wait * 1000),
    );
  };

  const readOne = () => {
    const c = cfg;
    if (!c || !visible.current || document.hidden) return;
    const t = now();
    if (t - lastType < 1.2 || queue.length > 0 || flips.some((f) => !f.read))
      return;
    const R = geo.rows;
    const lit: number[] = [];
    for (let i = 0; i < R * 8; i += 1) if (bits[i]) lit.push(i);
    if (lit.length === 0) return;
    const i = lit[Math.floor(rand() * lit.length)] ?? 0;
    const row = Math.floor(i / 8);
    const col = i % 8;
    sparks.push({ kind: 1, row, col, start: t, dur: 0.12, faint: true });
    sparks.push({ kind: 0, row, col, start: t, dur: 0.12, faint: true });
    flips.push({
      core: i,
      start: t + 0.12,
      dur: 0.18,
      from: 1,
      to: 1,
      read: true,
    });
    kick();
  };

  const draw = (t: number) => {
    const c = cfg;
    const ctx = canvas.getContext("2d");
    if (!c || !ctx || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    const g = geo;
    const R = g.rows;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const gx = g.x0;
    const gy = g.y0;
    const gw = 8 * g.p;
    const gh = R * g.p;
    // Wires: rows from their drivers, columns from theirs.
    ctx.lineWidth = 1;
    ctx.strokeStyle = paint.wire;
    ctx.globalAlpha = paint.dark ? 0.5 : 0.42;
    ctx.beginPath();
    for (let r = 0; r < R; r += 1) {
      const y = Math.round(gy + (r + 0.5) * g.p) + 0.5;
      ctx.moveTo(gx - DRIVER + 3, y);
      ctx.lineTo(gx + gw, y);
    }
    for (let col = 0; col < 8; col += 1) {
      const x = Math.round(gx + (col + 0.5) * g.p) + 0.5;
      ctx.moveTo(x, gy - 6);
      ctx.lineTo(x, gy + gh);
    }
    ctx.stroke();
    // Drivers: small pads where each wire is fed.
    ctx.fillStyle = paint.wire;
    ctx.globalAlpha = paint.dark ? 0.75 : 0.85;
    for (let r = 0; r < R; r += 1) {
      const y = gy + (r + 0.5) * g.p;
      ctx.fillRect(gx - DRIVER, y - 2.5, 4, 5);
    }
    for (let col = 0; col < 8; col += 1) {
      const x = gx + (col + 0.5) * g.p;
      ctx.fillRect(x - 2.5, gy - 9, 5, 4);
    }
    // Bit numbers over the columns, labels by the rows.
    ctx.globalAlpha = 1;
    ctx.fillStyle = paint.ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `9px ${paint.font}`;
    for (let col = 0; col < 8; col += 1) {
      ctx.fillText(String(7 - col), gx + (col + 0.5) * g.p, gy - 14);
    }
    let newest = -1;
    for (let r = 0; r < R; r += 1) newest = Math.max(newest, seqs[r] ?? -1);
    const fade = clamp01(c.fade);
    ctx.textAlign = "left";
    ctx.font = `${g.labelW === LABEL_WIDE ? 10 : 9}px ${paint.font}`;
    for (let r = 0; r < R; r += 1) {
      const lab = labels[r];
      if (!lab) continue;
      const age = newest - (seqs[r] ?? newest);
      const keep = 1 - fade * 0.7 * Math.min(1, age / Math.max(1, R - 1));
      const appear = clamp01((t - (labelAt[r] ?? -1e9)) / 0.15);
      ctx.globalAlpha = keep * appear;
      const shownLabel =
        g.labelW === LABEL_WIDE ? lab : (lab.split(" ")[0] ?? lab);
      ctx.fillText(shownLabel, g.left + 2, gy + (r + 0.5) * g.p);
    }
    // Cores, each a ring at ±45°, threaded by its stretch of sense wire.
    const rx = g.c / 2;
    const ry = g.c * 0.36;
    const ring = Math.max(1, g.c * 0.26);
    for (let r = 0; r < R; r += 1) {
      const age = newest - (seqs[r] ?? newest);
      const keep =
        (seqs[r] ?? -1) < 0
          ? 1
          : 1 - fade * 0.65 * Math.min(1, age / Math.max(1, R - 1));
      for (let col = 0; col < 8; col += 1) {
        const i = r * 8 + col;
        const x = gx + (col + 0.5) * g.p;
        const y = gy + (r + 0.5) * g.p;
        const tilt = (r + col) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
        // Sense wire through the core, along its own axis.
        ctx.globalAlpha = paint.dark ? 0.32 : 0.3;
        ctx.strokeStyle = paint.wire;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const sx = Math.cos(tilt + Math.PI / 2) * g.p * 0.45;
        const sy = Math.sin(tilt + Math.PI / 2) * g.p * 0.45;
        ctx.moveTo(x - sx, y - sy);
        ctx.lineTo(x + sx, y + sy);
        ctx.stroke();
        const b = clamp01(shown[i] ?? 0) * keep;
        if (b > 0.02 && glow) {
          ctx.globalAlpha = b * (paint.dark ? 0.9 : 0.5);
          ctx.globalCompositeOperation = paint.dark ? "lighter" : "source-over";
          const s = g.c * 2.2;
          ctx.drawImage(glow, x - s / 2, y - s / 2, s, s);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.lineWidth = ring;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = paint.ferrite;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, tilt, 0, Math.PI * 2);
        ctx.stroke();
        if (b > 0.02) {
          ctx.globalAlpha = b;
          ctx.strokeStyle = paint.lit;
          ctx.stroke();
        }
      }
    }
    // Sparks: a bright head and a short tail along the wire.
    ctx.lineCap = "round";
    for (const s of sparks) {
      const u = (t - s.start) / s.dur;
      if (u < 0 || u > 1.25) continue;
      const k = clamp01(u);
      let hx: number;
      let hy: number;
      let tx: number;
      let ty: number;
      if (s.kind === 0) {
        const end = gx + (s.col === 8 ? gw : (s.col + 0.5) * g.p);
        const y = gy + (s.row + 0.5) * g.p;
        hx = gx - DRIVER + (end - (gx - DRIVER)) * k;
        hy = y;
        tx = Math.max(gx - DRIVER, hx - 18);
        ty = y;
      } else {
        const x = gx + (s.col + 0.5) * g.p;
        const end = gy + (s.row + 0.5) * g.p;
        hx = x;
        hy = gy - 9 + (end - (gy - 9)) * k;
        tx = x;
        ty = Math.max(gy - 9, hy - 18);
      }
      const fadeOut = u > 1 ? 1 - (u - 1) / 0.25 : 1;
      const a = (s.faint ? 0.38 : 1) * fadeOut;
      ctx.globalCompositeOperation = paint.dark ? "lighter" : "source-over";
      const grad = ctx.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, "rgba(0, 0, 0, 0)");
      const hot = paint.dark ? paint.spark : paint.sparkInk;
      grad.addColorStop(1, hot);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = a;
      ctx.lineWidth = s.faint ? 1.2 : 1.8;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      if (glow && !s.faint) {
        const gs = g.c * 1.6;
        ctx.drawImage(glow, hx - gs / 2, hy - gs / 2, gs, gs);
      }
      ctx.fillStyle = hot;
      ctx.beginPath();
      ctx.arc(hx, hy, s.faint ? 1.2 : 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    // The tiny burst where a write meets its core.
    for (const f of flips) {
      if (f.read) continue;
      const u = (t - f.start) / 0.24;
      if (u < 0 || u > 1) continue;
      const i = f.core;
      const x = gx + ((i % 8) + 0.5) * g.p;
      const y = gy + (Math.floor(i / 8) + 0.5) * g.p;
      ctx.globalAlpha = (1 - u) * 0.8 * (0.4 + 0.6 * clamp01(c.flicker));
      ctx.strokeStyle = paint.dark ? paint.spark : paint.sparkInk;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, rx * (1 + u * 1.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  /** Advance flips and the write queue; returns whether anything is in flight. */
  const step = (t: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const bd = clamp(c.bitDelay, 8, 120) / 1000;
    const spacing = Math.max(0.05, 8 * bd * 0.7);
    while (queue.length > 0 && t >= nextWrite) {
      const w = queue.shift();
      if (!w) break;
      begin(w, t);
      // A burst of typing tightens the spacing so the plane keeps up.
      nextWrite = t + spacing / (1 + queue.length / 3);
    }
    const fl = clamp01(c.flicker);
    const pulses = 2 + Math.round(fl * 3);
    const keepFlips: Flip[] = [];
    for (const f of flips) {
      const u = (t - f.start) / f.dur;
      if (u < 0) {
        keepFlips.push(f);
        continue;
      }
      if (u >= 1) {
        shown[f.core] = f.to;
        continue;
      }
      if (f.read) {
        // Read blanks the core; the rewrite restores it.
        shown[f.core] = 1 - 0.75 * Math.sin(Math.PI * u);
      } else if (!c.motionSafe || c.paused) {
        shown[f.core] = f.from + (f.to - f.from) * u;
      } else {
        const alt = Math.floor(u * pulses * 2) % 2 === 0 ? f.from : f.to;
        const settle = f.from + (f.to - f.from) * u;
        shown[f.core] = settle + (alt - settle) * fl * (1 - u);
      }
      keepFlips.push(f);
    }
    flips = keepFlips;
    sparks = sparks.filter((s) => t < s.start + s.dur * 1.25);
    return queue.length > 0 || flips.length > 0 || sparks.length > 0;
  };

  const tick = () => {
    frame = 0;
    const c = cfg;
    if (disposed || !c) return;
    if (!visible.current || document.hidden) return;
    const t = now();
    const more = step(t);
    draw(t);
    if (more) frame = window.requestAnimationFrame(tick);
    else scheduleIdle();
  };

  const kick = () => {
    if (disposed || frame || !cfg) return;
    if (!visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const next = layout(w, h, c.cores);
    const sameGrid = next.rows === geo.rows;
    if (
      w === size.w &&
      h === size.h &&
      dpr === size.dpr &&
      sameGrid &&
      next.p === geo.p
    )
      return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    geo = next;
    if (!sameGrid || shown.length !== geo.rows * 8) rebuild();
    draw(now());
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        text = next.text;
        readColours();
        resize();
        rebuild();
        scheduleIdle();
        return;
      }
      if (was.colourKey !== next.colourKey) readColours();
      if (was.cores !== next.cores || was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (next.text !== text) take(next.text, next.user);
      if (
        was.idle !== next.idle ||
        was.readRate !== next.readRate ||
        was.motionSafe !== next.motionSafe ||
        was.paused !== next.paused
      )
        scheduleIdle();
      draw(now());
      kick();
    },
    resize,
    wake() {
      draw(now());
      kick();
      scheduleIdle();
    },
    readColours() {
      readColours();
      draw(now());
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = 0;
    },
  };
}

/* ------------------------------- component ------------------------------- */

/**
 * A plane of ferrite memory cores strung on fine wires, drawn on a canvas:
 * eight columns, bit 7 to bit 0, and as many rows as fit at the core size.
 * Each core is a small ring set at ±45° and threaded by its row wire, its
 * column wire and a sense wire; a core holding a 1 glows, a 0 is bare ferrite,
 * and each row is labelled with its character and its hex.
 *
 * Typing writes each character's UTF‑8 bytes into the next row the way the
 * real thing does it: a spark runs in along the row wire from the left driver
 * while, for every bit that will change, a spark runs down its column wire
 * from the top driver to meet it, and as each pair meets — left to right, a
 * bit every `bitDelay` ms — the core flips with a stutter scaled by `flicker`
 * and a tiny burst of light, with a tick for each one. Backspace erases the
 * last row the same way. Older rows fade as new ones are written; when the
 * plane is idle a background job reads random cores, each blinking off and
 * back as the destructive read is rewritten. Under reduced motion there are
 * no sparks or stutter: cores cross-fade to their new values and the idle job
 * rests, while labels and fades still follow every keystroke.
 */
export function CorePlane({
  value,
  defaultValue = "",
  onValueChange,
  cores = 10,
  flicker = 0.6,
  wire = "copper",
  fade = 0.6,
  idle = true,
  readRate = 1.2,
  bitDelay = 26,
  maxLength = 64,
  placeholder = "Type to write",
  label = "Write to core memory",
  height = 176,
  sound = false,
  paused = false,
  dpr = 2,
  disabled = false,
  className,
}: CorePlaneProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const inputId = React.useId();
  const [own, setOwn] = React.useState(defaultValue);
  const text = value ?? own;
  const [said, setSaid] = React.useState("");

  const wireColour = WIRES[wire as CorePlaneWire] ?? wire;
  const paints = [
    wireColour,
    LIT,
    FERRITE,
    SPARK,
    "var(--ink-3)",
    "var(--background)",
    SPARK_INK,
  ] as const;
  const colourKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const typed = React.useRef(false);
  const announce = React.useRef(0);

  const config: Config = {
    text,
    user: false,
    cores,
    flicker,
    fade,
    idle,
    readRate,
    bitDelay,
    paused,
    dpr,
    motionSafe,
    colourKey,
    audio,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    // A text change the visitor typed is theirs: it ticks. A host's is silent.
    const next = { ...config, user: typed.current };
    typed.current = false;
    latest.current = next;
    engine.current?.configure(next);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createPlane(root, canvas, carriers, visible);
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

  React.useEffect(
    () => () => {
      if (announce.current) window.clearTimeout(announce.current);
    },
    [],
  );

  const bindPlane = React.useCallback((node: HTMLDivElement | null) => {
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
      visible.current = false;
    };
  }, []);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value.slice(0, Math.max(1, maxLength));
    typed.current = true;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    // Spoken once typing pauses, from the text that was just typed.
    if (announce.current) window.clearTimeout(announce.current);
    const lastChar = Array.from(next).pop();
    const sentence = lastChar
      ? (() => {
          const bytes = Array.from(new TextEncoder().encode(lastChar));
          const set = bytes.reduce(
            (n, b) => n + b.toString(2).split("1").length - 1,
            0,
          );
          return `${lastChar === " " ? "space" : lastChar}, ${bytes.map((b) => `hex ${hex(b)}`).join(" ")}, ${set} ${set === 1 ? "bit" : "bits"} set.`;
        })()
      : "Plane cleared.";
    announce.current = window.setTimeout(() => setSaid(sentence), 600);
  };

  // The plane's description: the rows it holds, oldest first.
  const held = Array.from(text).slice(-12);
  const plane = held.length
    ? `Core plane holding ${held.length} ${held.length === 1 ? "character" : "characters"}: ${held.map((ch) => (ch === " " ? "space" : ch)).join(", ")}`
    : "Core plane, empty";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={bindPlane}
        role="img"
        aria-label={plane}
        className="group/core-plane relative w-full overflow-clip rounded-3 border border-hairline"
        style={{
          height,
          backgroundColor: "color-mix(in oklab, var(--card) 88%, var(--ink-3))",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/core-plane:invisible group-data-live/core-plane:opacity-0"
        >
          <StillPlane
            text={text}
            cores={cores}
            height={height}
            wire={wireColour}
          />
        </div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
        <span
          ref={carriersRef}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden"
        >
          {paints.map((p, i) => (
            <span
              key={i}
              className="font-mono transition-colors duration-1"
              style={{ color: p }}
            />
          ))}
        </span>
      </div>
      <label
        htmlFor={inputId}
        className={cn(
          "flex h-9 items-center gap-2 rounded-2 border border-input bg-card px-3 font-mono text-xs text-foreground",
          "focus-within:border-ring",
          disabled ? "cursor-not-allowed" : "cursor-text",
        )}
      >
        <span aria-hidden className="shrink-0 text-ink-3">
          ›
        </span>
        <input
          id={inputId}
          type="text"
          value={text}
          onChange={onChange}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-6 min-w-0 flex-1 rounded-1 bg-transparent text-xs text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="shrink-0 text-[10px] text-ink-3 tabular-nums"
        >
          {new TextEncoder().encode(text).length} B
        </span>
      </label>
      <p id={hintId} className="sr-only">
        Each character you type is written to the next row of cores, one bit per
        column; Backspace erases the last row.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

/**
 * The designed still for the server render and the first paint: the plane
 * at its nominal size, its written rows lit, in SVG.
 */
function StillPlane({
  text,
  cores,
  height,
  wire,
}: {
  text: string;
  cores: number;
  height: number;
  wire: string;
}) {
  const w = 320;
  const g = layout(w, height, cores);
  const R = g.rows;
  const bytes = bytesOf(text);
  const from = Math.max(0, bytes.length - R);
  const rows: { byte: number; label: string }[] = Array.from(
    { length: R },
    () => ({ byte: -1, label: "" }),
  );
  for (let k = from; k < bytes.length; k += 1) {
    const b = bytes[k];
    if (!b) continue;
    rows[k % R] = {
      byte: b.byte,
      label: b.lead ? `${show(b.char)} ${hex(b.byte)}` : `· ${hex(b.byte)}`,
    };
  }
  const rx = r2(g.c / 2);
  const ry = r2(g.c * 0.36);
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block size-full"
    >
      <g style={{ stroke: wire }} strokeWidth="1" opacity="0.55">
        {rows.map((_, r) => (
          <path
            key={`r${r}`}
            d={`M${r2(g.x0 - DRIVER + 3)} ${r2(g.y0 + (r + 0.5) * g.p)}H${r2(g.x0 + 8 * g.p)}`}
          />
        ))}
        {Array.from({ length: 8 }, (_, col) => (
          <path
            key={`c${col}`}
            d={`M${r2(g.x0 + (col + 0.5) * g.p)} ${r2(g.y0 - 6)}V${r2(g.y0 + R * g.p)}`}
          />
        ))}
      </g>
      {rows.map((row, r) =>
        Array.from({ length: 8 }, (_, col) => {
          const on = row.byte >= 0 && (row.byte >> (7 - col)) & 1;
          return (
            <ellipse
              key={`${r}-${col}`}
              cx={r2(g.x0 + (col + 0.5) * g.p)}
              cy={r2(g.y0 + (r + 0.5) * g.p)}
              rx={rx}
              ry={ry}
              fill="none"
              strokeWidth={r2(Math.max(1, g.c * 0.26))}
              transform={`rotate(${(r + col) % 2 === 0 ? 45 : -45} ${r2(g.x0 + (col + 0.5) * g.p)} ${r2(g.y0 + (r + 0.5) * g.p)})`}
              style={{ stroke: on ? LIT : FERRITE }}
            />
          );
        }),
      )}
      {rows.map((row, r) =>
        row.label ? (
          <text
            key={`l${r}`}
            x={r2(g.left + 2)}
            y={r2(g.y0 + (r + 0.5) * g.p)}
            dominantBaseline="middle"
            className="fill-ink-3 font-mono"
            fontSize="10"
          >
            {row.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
