"use client";

import * as React from "react";

import { Shapes, Sun } from "lucide-react";
import { motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { safe, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LanyardBadgeMode = "waves" | "name" | "pictures" | "auto";
export type LanyardBadgeColor = "amber" | "red" | "green" | "blue";

export type LanyardBadgeProps = {
  /** What the screen runs (controlled): rippling waves, the messages scrolling, pictures, or all three in turn. */
  mode?: LanyardBadgeMode;
  /** The mode it starts in when uncontrolled. @default "auto" */
  defaultMode?: LanyardBadgeMode;
  /** Fires from the mode button with the new mode. */
  onModeChange?: (mode: LanyardBadgeMode) => void;
  /** How bright the LEDs are, 0.25, 0.5, 0.75 or 1 (controlled). */
  brightness?: number;
  /** The brightness it starts at when uncontrolled. @default 0.75 */
  defaultBrightness?: number;
  /** Fires from the brightness button with the new level. */
  onBrightnessChange?: (brightness: number) => void;
  /** The messages the name mode scrolls, in turn; letters, digits and simple punctuation. @default ["FIELDLINE"] */
  messages?: string[];
  /** LED pitch in px, 4 to 8: a finer pitch fits more, smaller LEDs. @default 5 */
  pitch?: number;
  /** The LEDs' colour: a preset or any CSS colour. @default "amber" */
  color?: LanyardBadgeColor | (string & {});
  /** The lanyard's colour, any CSS colour. @default a deep navy from the tokens */
  strapColor?: string;
  /** The word printed along the lanyard. @default "FIELDLINE" */
  strapText?: string;
  /** How fast the screen runs: scrolling, ripples and pictures, 0.25 to 3. @default 1 */
  speed?: number;
  /** How freely the badge swings, 0 (it settles at once) to 1 (it swings on and on). @default 0.6 */
  swing?: number;
  /** A click from the side buttons. @default false */
  sound?: boolean;
  /** The badge's accessible name. @default "LED badge" */
  label?: string;
  /** Freeze the screen. @default false */
  paused?: boolean;
  /** No buttons, swinging or keys. @default false */
  disabled?: boolean;
  /** Sizes the piece; the badge scales to its width. It is 224px tall by default. */
  className?: string;
};

const MODES: LanyardBadgeMode[] = ["waves", "name", "pictures", "auto"];
const MODE_NAME: Record<LanyardBadgeMode, string> = {
  waves: "Waves",
  name: "Name",
  pictures: "Pictures",
  auto: "Auto",
};
const LEVELS = [0.25, 0.5, 0.75, 1];

const COLORS: Record<LanyardBadgeColor, string> = {
  amber: "oklch(from var(--warn) 0.84 0.17 calc(h - 8))",
  red: "oklch(from var(--danger) 0.68 0.23 h)",
  green: "oklch(from var(--success) 0.85 0.2 h)",
  blue: "oklch(from var(--accent) 0.74 0.16 calc(h - 22))",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const DEG = 180 / Math.PI;
/** The pendulum's length, from the hook round the neck to the clip, px. */
const LENGTH = 150;
const GRAVITY = 3900;
const MAX_SWING = 0.34;
const STEP = 1 / 240;

/* A 5 × 7 pixel face, one row per number, left bit first. */
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  "-": [0, 0, 0, 14, 0, 0, 0],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "'": [4, 4, 8, 0, 0, 0, 0],
  "·": [0, 0, 0, 4, 0, 0, 0],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "#": [10, 10, 31, 10, 31, 10, 10],
  "+": [0, 4, 4, 31, 4, 4, 0],
};

/** A message as LED columns, 7 rows each: proportional, one dark column between letters. */
function typeset(text: string): number[] {
  const cols: number[] = [];
  for (const raw of text.toUpperCase()) {
    if (raw === " ") {
      cols.push(0, 0, 0);
      continue;
    }
    const rows = FONT[raw] ?? FONT["?"] ?? [];
    let lo = 4;
    let hi = 0;
    for (let c = 0; c < 5; c += 1)
      for (const row of rows)
        if (row & (16 >> c)) {
          lo = Math.min(lo, c);
          hi = Math.max(hi, c);
        }
    if (lo > hi) {
      lo = 0;
      hi = 2;
    }
    for (let c = lo; c <= hi; c += 1) {
      let col = 0;
      rows.forEach((row, r) => {
        if (row & (16 >> c)) col |= 1 << r;
      });
      cols.push(col);
    }
    cols.push(0);
  }
  return cols;
}

/* Pictures, as tests on an 11 × 11 grid centred on the screen. */
const PICTURES: ((x: number, y: number) => boolean)[] = [
  (x, y) => {
    const X = x / 4.3;
    const Y = -y / 4.3 + 0.28;
    const a = X * X + Y * Y - 1;
    return a * a * a - X * X * Y * Y * Y <= 0;
  },
  (x, y) => {
    const r = Math.hypot(x, y);
    const t = Math.atan2(y, x);
    return (
      r <= 2.3 + 3 * Math.pow(0.5 + 0.5 * Math.cos(5 * t + Math.PI / 2), 3)
    );
  },
  (x, y) => {
    const r = Math.hypot(x, y);
    if (r >= 4.3 && r <= 5.4) return true;
    if (Math.hypot(Math.abs(x) - 1.8, y + 1.6) <= 0.75) return true;
    return r >= 2.2 && r <= 3.1 && y > 0.7;
  },
  (x, y) => {
    const r = Math.hypot(x, y);
    if (r <= 2.3) return true;
    const t = Math.atan2(y, x);
    const k = Math.round(t / (Math.PI / 4)) * (Math.PI / 4);
    return r >= 3.4 && r <= 5.4 && Math.abs(t - k) * r < 0.65;
  },
  (x, y) =>
    (Math.abs(y) <= 1 && x >= -4.6 && x <= 1) ||
    (x >= 0.6 && x <= 5 && Math.abs(y) <= (5 - x) * 1.05),
];

type Screen = {
  configure: (next: ScreenConfig) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (v: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

type ScreenConfig = {
  mode: LanyardBadgeMode;
  brightness: number;
  messages: string[];
  pitch: number;
  speed: number;
  paused: boolean;
  motionSafe: boolean;
  colorKey: string;
};

/** The LED screen: content is computed per tick into a level per LED, then drawn as squares with a small bloom. */
function createScreen(
  host: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carrier: HTMLElement,
  onSwing: (dt: number) => boolean,
): Screen {
  const ctx = canvas.getContext("2d");
  let cfg: ScreenConfig | null = null;
  let disposed = false;
  let visible = false;
  let raf = 0;
  let timer = 0;
  let last = 0;
  let t = 0;
  let w = 0;
  let h = 0;
  let dprNow = 1;
  let cols = 0;
  let rows = 0;
  let ox = 0;
  let oy = 0;
  let level = new Float32Array(0);
  let led = "orange";
  let off = "rgba(255,255,255,0.06)";
  let typeset0: number[][] = [];
  let typeKey = "";
  // Where the content is: which message, how far scrolled, which picture.
  let segment = 0;
  let segmentAt = 0;
  let scroll = 0;
  let message = 0;
  let picture = 0;
  let pictureAt = 0;
  let drawnTick = -1;

  const reader = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.getContext("2d", { willReadFrequently: true });
  })();

  const readColours = () => {
    if (!reader) return;
    reader.clearRect(0, 0, 1, 1);
    reader.fillStyle = "rgb(255, 170, 60)";
    reader.fillStyle = getComputedStyle(carrier).color;
    reader.fillRect(0, 0, 1, 1);
    const d = reader.getImageData(0, 0, 1, 1).data;
    led = `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
    off = `rgba(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0}, 0.07)`;
  };

  const messagesOf = () => {
    const c = cfg;
    const list = c && c.messages.length ? c.messages : ["FIELDLINE"];
    const key = list.join("\u0000");
    if (key !== typeKey) {
      typeKey = key;
      typeset0 = list.map((m) => typeset(m));
    }
    return typeset0;
  };

  /** Which content runs now: the mode, or in auto the segment of the cycle. */
  const showing = (): "waves" | "name" | "pictures" => {
    const c = cfg;
    if (!c) return "name";
    if (c.mode !== "auto") return c.mode;
    return segment === 0 ? "waves" : segment === 1 ? "name" : "pictures";
  };

  const fill = () => {
    const c = cfg;
    if (!c) return;
    level.fill(0);
    const what = showing();
    const motion = c.motionSafe;
    if (what === "waves") {
      const ax = cols * 0.27;
      const bx = cols * 0.73;
      const cy = (rows - 1) / 2;
      const tt = motion ? t : 0.6;
      for (let r = 0; r < rows; r += 1)
        for (let k = 0; k < cols; k += 1) {
          const d1 = Math.hypot(k - ax, r - cy);
          const d2 = Math.hypot(k - bx, r - cy);
          const v =
            0.5 * Math.sin(d1 * 0.9 - tt * 4.2) +
            0.5 * Math.sin(d2 * 0.9 - tt * 4.9);
          // Four PWM steps, as a cheap LED driver would give: only the
          // crests, where the two ripples meet, light fully.
          level[r * cols + k] = Math.round(clamp(v * 0.9 - 0.05, 0, 1) * 3) / 3;
        }
      return;
    }
    if (what === "name") {
      const list = messagesOf();
      const msg = list[message % list.length] ?? [];
      const top = Math.floor((rows - 7) / 2);
      const start = motion
        ? cols - Math.floor(scroll)
        : Math.max(0, Math.floor((cols - msg.length) / 2));
      const page = motion ? 0 : Math.floor(t / 2.4);
      const shift =
        !motion && msg.length > cols ? (page * cols) % msg.length : 0;
      for (let k = 0; k < cols; k += 1) {
        const at = k - start + shift;
        const col = at >= 0 && at < msg.length ? (msg[at] ?? 0) : 0;
        if (!col) continue;
        for (let r = 0; r < 7; r += 1)
          if (col & (1 << r)) {
            const rr = top + r;
            if (rr >= 0 && rr < rows) level[rr * cols + k] = 1;
          }
      }
      return;
    }
    const test = PICTURES[picture % PICTURES.length];
    if (!test) return;
    const reveal = motion ? clamp((t - pictureAt) / 0.4, 0, 1) : 1;
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const scale = 11 / Math.max(7, Math.min(rows, 13));
    const edge = reveal * cols;
    for (let r = 0; r < rows; r += 1)
      for (let k = 0; k < cols; k += 1) {
        if (k > edge) continue;
        const x = (k - cx) * scale;
        const y = (r - cy) * scale;
        if (Math.abs(x) <= 5.6 && Math.abs(y) <= 5.6 && test(x, y))
          level[r * cols + k] = 1;
      }
  };

  /** Moves the content on by dt; returns true when the frame changed. */
  const advance = (dt: number) => {
    const c = cfg;
    if (!c || c.paused) return false;
    const sp = clamp(c.speed, 0.25, 3);
    t += dt * sp;
    const what = showing();
    if (what === "name") {
      const list = messagesOf();
      const msg = list[message % list.length] ?? [];
      scroll += dt * sp * 16;
      if (scroll > cols + msg.length + 2) {
        scroll = 0;
        message += 1;
        if (c.mode === "auto" && message % list.length === 0) nextSegment();
      }
    } else if (what === "pictures") {
      if (t - pictureAt > 1.9) {
        picture += 1;
        pictureAt = t;
        if (c.mode === "auto" && picture % PICTURES.length === 0) nextSegment();
      }
    } else if (c.mode === "auto" && t - segmentAt > 4.5) nextSegment();
    const tick = Math.floor(t * 30);
    if (tick === drawnTick) return false;
    drawnTick = tick;
    return true;
  };

  const nextSegment = () => {
    segment = (segment + 1) % 3;
    segmentAt = t;
    scroll = 0;
    pictureAt = t;
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || !visible || w < 2) return;
    fill();
    ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = clamp(c.pitch, 4, 8);
    const size = Math.max(1.5, Math.round(p * 0.62 * 2) / 2);
    const inset = (p - size) / 2;
    const b = clamp(c.brightness, 0.1, 1);
    // Unlit LEDs show faintly through the smoked lens.
    ctx.fillStyle = off;
    for (let r = 0; r < rows; r += 1)
      for (let k = 0; k < cols; k += 1)
        if ((level[r * cols + k] ?? 0) === 0)
          ctx.fillRect(ox + k * p + inset, oy + r * p + inset, size, size);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = led;
    // The bloom first: a wider, faint square round every lit LED.
    const bloom = size + p * 0.7;
    for (let r = 0; r < rows; r += 1)
      for (let k = 0; k < cols; k += 1) {
        const v = level[r * cols + k] ?? 0;
        if (!v) continue;
        ctx.globalAlpha = 0.16 * v * b;
        ctx.fillRect(
          ox + k * p + (p - bloom) / 2,
          oy + r * p + (p - bloom) / 2,
          bloom,
          bloom,
        );
      }
    for (let r = 0; r < rows; r += 1)
      for (let k = 0; k < cols; k += 1) {
        const v = level[r * cols + k] ?? 0;
        if (!v) continue;
        ctx.globalAlpha = clamp((0.25 + 0.75 * v) * b, 0, 1);
        ctx.fillRect(ox + k * p + inset, oy + r * p + inset, size, size);
      }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!host.hasAttribute("data-live")) host.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    raf = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    const swinging = onSwing(dt);
    if (c.motionSafe) {
      if (advance(dt)) draw();
      if (!c.paused || swinging) raf = window.requestAnimationFrame(tick);
      else last = 0;
      return;
    }
    // Reduced motion: still pages, turned every 2.4 s by a timer, not a loop.
    last = 0;
    draw();
    if (!c.paused) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        t += 2.4;
        if (showing() === "pictures") picture += 1;
        if (c.mode === "auto") nextSegment();
        kick();
      }, 2400);
    }
  };

  const kick = () => {
    if (disposed || raf || !visible || document.hidden || !ctx) return;
    raf = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = canvas.clientWidth;
    const nh = canvas.clientHeight;
    if (nw < 2 || nh < 2) return;
    w = nw;
    h = nh;
    dprNow = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dprNow);
    canvas.height = Math.round(h * dprNow);
    const p = clamp(c.pitch, 4, 8);
    cols = Math.max(8, Math.floor(w / p));
    rows = Math.max(7, Math.floor(h / p));
    ox = Math.round((w - cols * p) / 2);
    oy = Math.round((h - rows * p) / 2);
    level = new Float32Array(cols * rows);
    drawnTick = -1;
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        host.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        readColours();
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.pitch !== next.pitch) resize();
      if (was.mode !== next.mode) {
        segment = 0;
        segmentAt = t;
        scroll = 0;
        message = 0;
        pictureAt = t;
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    setVisible(v) {
      visible = v;
      if (v) {
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
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(timer);
    },
  };
}

/** What the screen is showing, in words, for assistive technology. */
const describeScreen = (mode: LanyardBadgeMode, messages: string[]) => {
  const words = messages.length ? messages.join(", then ") : "FIELDLINE";
  if (mode === "waves") return "Rippling waves.";
  if (mode === "name") return `Scrolling ${words}.`;
  if (mode === "pictures")
    return "Pictures: a heart, a star, a smile, a sun and an arrow.";
  return `Waves, then ${words} scrolling, then pictures, in turn.`;
};

/**
 * A small LED badge hanging on its lanyard. Behind a smoked lens a grid of
 * tiny square LEDs runs rippling waves, the messages scrolling in a 5 × 7
 * pixel face, or simple pictures wiped in column by column — or all three in
 * turn. Two buttons on its edge cycle the mode and the brightness, each press
 * travelling in on the flick spring with a click.
 *
 * Drag the badge and it swings on its lanyard: it follows your hand as a
 * pendulum held to its strap, and when you let go a damped pendulum takes the
 * throw while the badge also rocks on its clip, a lighter hinge that lags and
 * overshoots before both settle. The lens reflection slides as it turns.
 * The face is a button: Enter or Space gives it a push and the arrow keys push
 * it either way. Under reduced motion it hangs still and the screen shows
 * still pages that turn every few seconds.
 */
export function LanyardBadge({
  mode,
  defaultMode = "auto",
  onModeChange,
  brightness,
  defaultBrightness = 0.75,
  onBrightnessChange,
  messages = ["FIELDLINE"],
  pitch = 5,
  color = "amber",
  strapColor = "oklch(from var(--accent) 0.38 0.1 h)",
  strapText = "FIELDLINE",
  speed = 1,
  swing = 0.6,
  sound = false,
  label = "LED badge",
  paused = false,
  disabled = false,
  className,
}: LanyardBadgeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const [ownMode, setOwnMode] = React.useState<LanyardBadgeMode>(defaultMode);
  const [ownLevel, setOwnLevel] = React.useState(defaultBrightness);
  const currentMode = mode ?? ownMode;
  const level = clamp(brightness ?? ownLevel, 0.25, 1);
  const step = Math.max(
    0,
    LEVELS.findIndex((l) => Math.abs(l - level) < 0.13),
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [width, setWidth] = React.useState(320);
  const [height, setHeight] = React.useState(224);
  const ledColor =
    COLORS[color as LanyardBadgeColor] ?? (color as string) ?? COLORS.amber;

  // Badge size from the box: the LED count shrinks on a narrow box, not the LEDs.
  const bw = Math.round(clamp(width * 0.62, 164, 228));
  const bh = Math.round(bw * 0.5);
  const clipY = Math.round(clamp(height - bh - 30, 22, 72));
  const anchor = 13;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const screenRef = React.useRef<HTMLDivElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const screen = React.useRef<Screen | null>(null);
  const visibleRef = React.useRef(false);

  // The pendulum: strap angle and the badge's rock on its clip, radians.
  const phi = useMotionValue(0);
  const psi = useMotionValue(0);
  const state = React.useRef({ phi: 0, vphi: 0, psi: 0, vpsi: 0, held: false });
  const rotate = useTransform([phi, psi], ([a, b]) =>
    r2(((a as number) + (b as number)) * DEG),
  );
  const swingX = useTransform(phi, (a) => r2(LENGTH * Math.sin(a)));
  // Held on its strap, the clip rises a little as it swings out.
  const swingY = useTransform(phi, (a) => r2(-LENGTH * (1 - Math.cos(a))));
  const glare = useTransform([phi, psi], ([a, b]) =>
    r2(((a as number) + (b as number)) * -90),
  );
  const strand = (a: number, side: number) =>
    `M ${r2(width / 2 + side * anchor)} -4 L ${r2(width / 2 + LENGTH * Math.sin(a))} ${r2(clipY - LENGTH * (1 - Math.cos(a)))}`;
  const left = useTransform(phi, (a) => strand(a, -1));
  const right = useTransform(phi, (a) => strand(a, 1));

  const phiAtGrab = React.useRef(0);
  /** However hard it is thrown, the badge never swings past its limit: the box clips nothing. */
  const capSwing = () => {
    const s = state.current;
    const w0 = Math.sqrt(GRAVITY / LENGTH);
    const amp = Math.hypot(s.phi, s.vphi / w0);
    if (amp <= MAX_SWING) return;
    const room = Math.sqrt(Math.max(0, MAX_SWING * MAX_SWING - s.phi * s.phi));
    s.vphi = Math.sign(s.vphi) * room * w0;
  };
  const swingRef = React.useRef(swing);
  const motionRef = React.useRef(motionSafe);
  React.useEffect(() => {
    swingRef.current = swing;
    motionRef.current = motionSafe;
  });

  /** One frame of the pendulum and the hinge; returns whether it still moves. */
  const pendulum = React.useCallback(
    (dt: number) => {
      const s = state.current;
      if (s.held) return true;
      if (!motionRef.current) {
        s.phi = s.vphi = s.psi = s.vpsi = 0;
        phi.set(0);
        psi.set(0);
        return false;
      }
      const free = clamp(swingRef.current, 0, 1);
      const damp = lerp(2.4, 0.35, free);
      const n = Math.max(1, Math.ceil(dt / STEP));
      const hh = dt / n;
      for (let i = 0; i < n; i += 1) {
        const acc = -(GRAVITY / LENGTH) * Math.sin(s.phi) - damp * s.vphi;
        s.vphi += acc * hh;
        s.phi += s.vphi * hh;
        // The badge hangs from its clip: it lags the strap and rocks back.
        const k = 190;
        const c = 2 * lerp(0.6, 0.3, free) * Math.sqrt(k);
        s.vpsi += (-k * s.psi - c * s.vpsi - 0.35 * acc) * hh;
        s.psi += s.vpsi * hh;
      }
      const still =
        Math.abs(s.phi) < 0.0008 &&
        Math.abs(s.vphi) < 0.003 &&
        Math.abs(s.psi) < 0.0008 &&
        Math.abs(s.vpsi) < 0.003;
      if (still) s.phi = s.vphi = s.psi = s.vpsi = 0;
      phi.set(Math.round(s.phi * 10000) / 10000);
      psi.set(Math.round(s.psi * 10000) / 10000);
      return !still;
    },
    [phi, psi],
  );

  const config: ScreenConfig = {
    mode: currentMode,
    brightness: level,
    messages,
    pitch,
    speed,
    paused,
    motionSafe,
    colorKey: ledColor,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    screen.current?.configure(config);
  });

  React.useEffect(() => {
    const host = screenRef.current;
    const canvas = canvasRef.current;
    const carrier = carrierRef.current;
    if (!host || !canvas || !carrier) return;
    const s = createScreen(host, canvas, carrier, pendulum);
    screen.current = s;
    s.configure(latest.current);
    s.setVisible(visibleRef.current);
    const onVisibility = () => {
      if (!document.hidden) screen.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      s.dispose();
      if (screen.current === s) screen.current = null;
      host.removeAttribute("data-live");
    };
  }, [pendulum]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setWidth(Math.round(node.clientWidth));
      setHeight(Math.round(node.clientHeight));
      screen.current?.resize();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      screen.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    screen.current?.resize();
  }, [bw, bh]);

  const push = (direction: number) => {
    if (disabled) return;
    if (!motionSafe) {
      setSaid((s) => ({ n: s.n + 1, text: "The badge sways." }));
      return;
    }
    state.current.vphi += direction * 1.1;
    capSwing();
    screen.current?.wake();
  };

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || !motionSafe,
    onStart: () => {
      const s = state.current;
      s.held = true;
      s.vphi = 0;
      s.vpsi = 0;
      screen.current?.wake();
    },
    onMove: ({ offset, delta }) => {
      const s = state.current;
      const x = clamp(
        LENGTH * Math.sin(phiAtGrab.current) + offset.x,
        -LENGTH * 0.95,
        LENGTH * 0.95,
      );
      const a = rubberClamp(Math.asin(x / LENGTH), -MAX_SWING, MAX_SWING, 0.3);
      s.phi = a;
      // The badge rocks against the way it is dragged.
      s.psi = clamp(s.psi * 0.8 - delta.x * 0.004, -0.25, 0.25);
      phi.set(Math.round(a * 10000) / 10000);
      psi.set(Math.round(s.psi * 10000) / 10000);
    },
    onEnd: ({ velocity }) => {
      const s = state.current;
      s.held = false;
      s.vphi = velocity.x / (LENGTH * Math.max(0.3, Math.cos(s.phi)));
      capSwing();
      screen.current?.wake();
    },
    onCancel: () => {
      state.current.held = false;
      screen.current?.wake();
    },
    onTap: () => push(state.current.phi > 0 ? -1 : 1),
  });

  const cycleMode = () => {
    if (disabled) return;
    const next =
      MODES[(MODES.indexOf(currentMode) + 1) % MODES.length] ?? "auto";
    if (mode === undefined) setOwnMode(next);
    onModeChange?.(next);
    audio.play("click", { pitch: 1.1 });
    setSaid((s) => ({ n: s.n + 1, text: `Mode: ${MODE_NAME[next]}.` }));
  };

  const cycleBrightness = () => {
    if (disabled) return;
    const next = LEVELS[(step + 1) % LEVELS.length] ?? 1;
    if (brightness === undefined) setOwnLevel(next);
    onBrightnessChange?.(next);
    audio.play("click", { pitch: 0.9 });
    setSaid((s) => ({
      n: s.n + 1,
      text: `Brightness ${LEVELS.indexOf(next) + 1} of 4.`,
    }));
  };

  const flick = safe(springs.flick)(motionSafe);
  const nextMode =
    MODES[(MODES.indexOf(currentMode) + 1) % MODES.length] ?? "auto";
  const ring =
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      className={cn(
        "group/lanyard-badge relative isolate h-56 w-full overflow-clip select-none",
        className,
      )}
    >
      {/* The lanyard: two woven strands from the top of the box to the clip. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        {[
          [left, `${uid}-l`],
          [right, `${uid}-r`],
        ].map(([d, id]) => (
          <g key={id as string}>
            <motion.path
              id={id as string}
              d={d as typeof left}
              fill="none"
              strokeWidth={11}
              style={{ stroke: strapColor }}
            />
            <text
              className="font-mono"
              fontSize={6}
              letterSpacing={1.2}
              dominantBaseline="central"
              style={{ fill: "oklch(from var(--warn) 0.96 0.02 h / 0.72)" }}
            >
              <textPath href={`#${id as string}`} startOffset="6">
                {`${strapText} · ${strapText} · ${strapText}`}
              </textPath>
            </text>
          </g>
        ))}
      </svg>
      <motion.div
        className="absolute top-0 left-1/2"
        style={{
          x: swingX,
          y: swingY,
          rotate,
          width: bw,
          marginLeft: -bw / 2,
          marginTop: clipY,
          originX: "50%",
          originY: "0%",
        }}
      >
        {/* The clip: a ring through the badge's slot. */}
        <div
          aria-hidden
          className="mx-auto -mt-1.5 h-4 w-5 rounded-t-full border-2 border-b-0"
          style={{ borderColor: "oklch(from var(--ink-3) 0.72 0.01 h)" }}
        />
        <div
          className="relative rounded-4 p-2.5"
          style={{
            height: bh,
            backgroundColor: "oklch(from var(--ink-3) 0.24 0.012 h)",
            boxShadow:
              "inset 0 1px 0 color-mix(in oklab, white 12%, transparent), 0 10px 24px -12px color-mix(in oklab, black 55%, transparent)",
          }}
        >
          <div
            ref={screenRef}
            className="group/lanyard-screen relative size-full overflow-hidden rounded-2"
            style={{ backgroundColor: "oklch(from var(--ink-3) 0.12 0.01 h)" }}
          >
            <span
              ref={carrierRef}
              aria-hidden
              className="hidden"
              style={{ color: ledColor }}
            />
            <div
              aria-hidden
              className="absolute inset-0 opacity-40 transition-opacity duration-300 group-data-live/lanyard-screen:opacity-0"
              style={{
                backgroundImage: `radial-gradient(circle, color-mix(in oklab, ${ledColor} 22%, transparent) 0.9px, transparent 1.1px)`,
                backgroundSize: `${clamp(pitch, 4, 8)}px ${clamp(pitch, 4, 8)}px`,
              }}
            />
            <canvas
              ref={canvasRef}
              aria-hidden
              className="absolute top-1.5 left-1.5 size-[calc(100%-12px)]"
            />
            {/* The smoked lens and its reflection, which slides as the badge turns. */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-x-1/2 inset-y-0"
              style={{
                x: glare,
                backgroundImage:
                  "linear-gradient(115deg, transparent 38%, color-mix(in oklab, white 13%, transparent) 46%, transparent 56%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2"
              style={{
                boxShadow:
                  "inset 0 0 0 1px color-mix(in oklab, white 8%, transparent), inset 0 6px 14px -8px color-mix(in oklab, black 70%, transparent)",
              }}
            />
          </div>
          {/* The face: drag to swing, or press for a push. */}
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Swing the badge"
            aria-describedby={`${uid}-screen`}
            aria-disabled={disabled || undefined}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                push(state.current.phi > 0 ? -1 : 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                push(-1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                push(1);
              }
            }}
            onPointerDown={(event) => {
              phiAtGrab.current = state.current.phi;
              drag.onPointerDown(event);
            }}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={drag.onPointerCancel}
            onLostPointerCapture={drag.onLostPointerCapture}
            className={cn(
              "absolute inset-0 touch-none rounded-4",
              ring,
              disabled
                ? "cursor-not-allowed"
                : "cursor-grab active:cursor-grabbing",
            )}
          />
          <span id={`${uid}-screen`} className="sr-only">
            {describeScreen(currentMode, messages)} Arrow keys push it either
            way.
          </span>
          {/* Two buttons on the right edge, with their marks engraved beside them. */}
          <div className="absolute top-1/2 -right-3 flex -translate-y-1/2 flex-col gap-1.5">
            {(
              [
                [
                  "mode",
                  cycleMode,
                  `Mode: ${MODE_NAME[currentMode]}. Next: ${MODE_NAME[nextMode]}`,
                  Shapes,
                ],
                ["light", cycleBrightness, `Brightness ${step + 1} of 4`, Sun],
              ] as const
            ).map(([key, onPress, name, Icon]) => (
              <motion.button
                key={key}
                type="button"
                aria-label={name}
                disabled={disabled}
                onClick={onPress}
                whileTap={motionSafe ? { x: -2 } : undefined}
                transition={flick}
                className={cn(
                  "relative flex h-7 w-6 items-center justify-end rounded-1",
                  ring,
                  "disabled:cursor-not-allowed",
                )}
              >
                <span
                  aria-hidden
                  className="h-5 w-2 rounded-full border"
                  style={{
                    backgroundColor: "oklch(from var(--ink-3) 0.36 0.012 h)",
                    borderColor: "color-mix(in oklab, white 14%, transparent)",
                  }}
                />
                <Icon
                  aria-hidden
                  className="absolute top-1/2 left-full ml-0.5 size-2.5 shrink-0 -translate-y-1/2 text-ink-3"
                />
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
