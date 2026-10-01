"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type LoomWeave = "plain" | "twill" | "basket";
export type LoomThread = "indigo" | "rust" | "moss";

export type LoomFieldProps = {
  /** The content on top of the cloth: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How the threads interlace: a checker, a diagonal rib, or paired blocks. @default "twill" */
  weave?: LoomWeave;
  /** How hard the hand presses, 0 to 1: how wide the threads part and how deep the dent reads. @default 0.6 */
  press?: number;
  /** The warp's dye. The weft is the same dye washed into the page. @default "indigo" */
  thread?: LoomThread;
  /** The cloth's accessible name, for the keyboard's way in. @default "Woven cloth" */
  label?: string;
  /** The hand pressed into the cloth (true) or let go (false), from the pointer or the keys that did it. */
  onPressChange?: (pressed: boolean) => void;
  /** The cloth is drawn and holds still; the hand is ignored. */
  disabled?: boolean;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
};

type Rgb = readonly [number, number, number];

type Palette = {
  /** Warp float bodies in three slub tones, then the warp's under shade and crown. */
  warp: [string, string, string];
  warpUnder: string;
  warpCrown: string;
  weft: [string, string, string];
  weftUnder: string;
  weftCrown: string;
  shade: Rgb;
  ring: string;
};

type Cloth = {
  w: number;
  h: number;
  dpr: number;
  pitch: number;
  /** Warps across (x) and wefts down (y). */
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  /** Per crossing (j * nx + i): the warp's sideways push and the weft's. */
  u: Float32Array;
  vu: Float32Array;
  v: Float32Array;
  vv: Float32Array;
  /** Each thread's slub tone, 0 to 2. */
  warpTone: Uint8Array;
  weftTone: Uint8Array;
  /** Where each crossing is drawn this frame. */
  px: Float32Array;
  py: Float32Array;
};

type Hand = {
  x: number;
  y: number;
  /** Smoothed travel, px/s: a drag pulls the threads along a little. */
  vx: number;
  vy: number;
  at: number;
  present: boolean;
  pressed: boolean;
  depth: number;
  source: "pointer" | "key" | null;
  /** The keyboard's hand shows a ring; a pointer is its own marker. */
  ring: boolean;
};

/** Pigments at fixed lightness: a dye is a dye in either theme. */
const DYES: Record<LoomThread, string> = {
  indigo: "oklch(0.44 0.13 266)",
  rust: "oklch(0.56 0.15 42)",
  moss: "oklch(0.54 0.1 130)",
};

/**
 * The cloth's colours live on the canvas element as its own colours, so they
 * resolve against whatever theme the cloth sits in and the canvas can read
 * them back. Mixes toward black, white or the page are in oklab, which keeps
 * the dye's hue.
 */
function colours(dye: string): React.CSSProperties {
  return {
    color: dye,
    borderTopColor: `color-mix(in oklab, ${dye} 26%, var(--background))`,
    borderRightColor: `color-mix(in oklab, ${dye} 30%, black)`,
    borderBottomColor: `color-mix(in oklab, ${dye} 10%, white)`,
    borderLeftColor: "var(--ring)",
    backgroundColor: `color-mix(in oklab, color-mix(in oklab, ${dye} 32%, var(--background)) 48%, black)`,
  };
}

/** What stands in for the cloth before the canvas has painted it. */
const standIn = (c: React.CSSProperties) =>
  `repeating-linear-gradient(90deg, ${String(c.color)} 0 6px, transparent 6px 9px), repeating-linear-gradient(0deg, ${String(c.borderTopColor)} 0 6px, transparent 6px 9px), linear-gradient(${String(c.backgroundColor)}, ${String(c.backgroundColor)})`;

/** Fixed-step physics: the springs are integrated at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** Restoring pull to the target, tension along the thread, and damping: ζ ≈ 0.45 at the node, near the recoil spring's, so a released eye overshoots twice, small, and settles. */
const STIFF = 240;
const TENSION = 620;
const DAMP = 14;
/** A hover is a light touch; a press goes the whole way. */
const TOUCH = 0.35;
const KEY_STEP = 16;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same slubs every time. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Whether the warp floats over the weft at crossing (i, j). */
function warpOver(weave: LoomWeave, i: number, j: number): boolean {
  if (weave === "plain") return (i + j) % 2 === 0;
  // 3/1 twill: the weft shows once in four, stepping a thread each row, so
  // its dashes climb to the right like denim.
  if (weave === "twill") return (i + j) % 4 !== 0;
  return ((i >> 1) + (j >> 1)) % 2 === 0;
}

const css = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

/** The props a backdrop must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Api = {
  resize: () => void;
  paint: () => void;
  kick: () => void;
};

/**
 * A background that is woven cloth seen close up: warp and weft threads
 * interlaced at every crossing in a plain, twill or basket weave, with the
 * content sitting on top in its own layer. The hand presses through it: a
 * hovering pointer is a light touch and a press goes in deep, and the
 * threads part around the finger into an eye — the warps pushed sideways,
 * the wefts up and down — bunch at its rim, and drag a little with a moving
 * finger. Every crossing is a spring held to its thread by tension, so the
 * threads lag the hand, a flick runs a ripple along them, and a lifted hand
 * leaves the eye to close with two small overshoots and settle.
 *
 * Canvas 2D, drawn in ten batched strokes a frame; the loop runs only while
 * something moves, on screen, in a visible page. Colours are the canvas's
 * own computed colours, re-read when the theme changes. The keyboard's way
 * in is a transparent button behind the content: arrow keys move the hand,
 * Space or Enter held presses in. Under reduced motion the threads part to
 * the eye's exact shape on every move and close at once when the hand lifts;
 * nothing moves between events.
 */
export function LoomField({
  children,
  weave = "twill",
  press = 0.6,
  thread = "indigo",
  label = "Woven cloth",
  onPressChange,
  disabled = false,
  className,
}: LoomFieldProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const seed = hashText(uid);
  const depthOf = clamp(press, 0, 1);
  const carriers = colours(DYES[thread] ?? DYES.indigo);

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const cloth = React.useRef<Cloth | null>(null);
  const palette = React.useRef<Palette | null>(null);
  const reader = React.useRef<((colour: string) => Rgb) | null>(null);
  const hand = React.useRef<Hand>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    at: 0,
    present: false,
    pressed: false,
    depth: 0,
    source: null,
    ring: false,
  });
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const carry = React.useRef(0);
  const visible = React.useRef(true);
  const dirty = React.useRef(true);
  const lastKey = React.useRef(0);
  const tapTimer = React.useRef<number | null>(null);
  /** Stops listening for the pressing pointer's release. */
  const unlisten = React.useRef<(() => void) | null>(null);
  const latest = React.useRef({
    weave,
    depthOf,
    motionSafe,
    disabled,
    onPressChange,
  });
  React.useEffect(() => {
    latest.current = { weave, depthOf, motionSafe, disabled, onPressChange };
  });

  /** The hole the finger opens at full press, in px. */
  const holeOf = (c: Cloth) => c.pitch * (0.7 + 2.5 * latest.current.depthOf);

  const readPalette = (): Palette | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!reader.current) reader.current = rgbReader();
    const read = reader.current;
    const s = getComputedStyle(canvas);
    const warp = read(s.color);
    const weftRgb = read(s.borderTopColor);
    const shade = read(s.borderRightColor);
    const light = read(s.borderBottomColor);
    return {
      warp: [
        css(mixRgb(warp, light, 0.1)),
        css(warp),
        css(mixRgb(warp, shade, 0.12)),
      ],
      warpUnder: css(mixRgb(warp, shade, 0.5)),
      warpCrown: css(mixRgb(warp, light, 0.3)),
      weft: [
        css(mixRgb(weftRgb, light, 0.12)),
        css(weftRgb),
        css(mixRgb(weftRgb, shade, 0.1)),
      ],
      weftUnder: css(mixRgb(weftRgb, shade, 0.36)),
      weftCrown: css(mixRgb(weftRgb, light, 0.45)),
      shade,
      ring: s.borderLeftColor,
    };
  };

  /** One frame of cloth, from the crossings as they stand. */
  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const c = cloth.current;
    const p = palette.current;
    if (!canvas || !ctx || !c || !p) return;
    if (!visible.current) {
      dirty.current = true;
      return;
    }
    dirty.current = false;
    const { w, h, dpr, pitch, nx, ny, x0, y0, u, v } = c;
    const wv = latest.current.weave;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Basket threads work in pairs: each pair sits a little closer together.
    const pair = wv === "basket" ? pitch * 0.07 : 0;
    const X = c.px;
    const Y = c.py;
    for (let j = 0; j < ny; j += 1) {
      const ry = y0 + j * pitch + (j % 2 ? -pair : pair);
      for (let i = 0; i < nx; i += 1) {
        const k = j * nx + i;
        X[k] = x0 + i * pitch + (i % 2 ? -pair : pair) + (u[k] ?? 0);
        Y[k] = ry + (v[k] ?? 0);
      }
    }

    const underWarp = new Path2D();
    const underWeft = new Path2D();
    const overWarp = [new Path2D(), new Path2D(), new Path2D()];
    const overWeft = [new Path2D(), new Path2D(), new Path2D()];
    const crownWarp = new Path2D();
    const crownWeft = new Path2D();

    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const k = j * nx + i;
        const cx = X[k] ?? 0;
        const cy = Y[k] ?? 0;
        const over = warpOver(wv, i, j);
        // The warp's piece runs between the midpoints to the crossings
        // above and below; the weft's between those left and right. The
        // outermost crossings lie off the box, so their ends just stop.
        const up = j > 0 ? k - nx : k;
        const down = j < ny - 1 ? k + nx : k;
        const left = i > 0 ? k - 1 : k;
        const right = i < nx - 1 ? k + 1 : k;
        const wax = ((X[up] ?? cx) + cx) / 2;
        const way = ((Y[up] ?? cy) + cy) / 2;
        const wbx = ((X[down] ?? cx) + cx) / 2;
        const wby = ((Y[down] ?? cy) + cy) / 2;
        const fax = ((X[left] ?? cx) + cx) / 2;
        const fay = ((Y[left] ?? cy) + cy) / 2;
        const fbx = ((X[right] ?? cx) + cx) / 2;
        const fby = ((Y[right] ?? cy) + cy) / 2;
        if (over) {
          underWeft.moveTo(fax, fay);
          underWeft.lineTo(cx, cy);
          underWeft.lineTo(fbx, fby);
          const path = overWarp[c.warpTone[i] ?? 1] ?? overWarp[1];
          path?.moveTo(wax, way);
          path?.lineTo(cx, cy);
          path?.lineTo(wbx, wby);
        } else {
          underWarp.moveTo(wax, way);
          underWarp.lineTo(cx, cy);
          underWarp.lineTo(wbx, wby);
          const path = overWeft[c.weftTone[j] ?? 1] ?? overWeft[1];
          path?.moveTo(fax, fay);
          path?.lineTo(cx, cy);
          path?.lineTo(fbx, fby);
        }
      }
    }

    // The crown: one highlight along each float, from where the thread
    // rises to where it dives, so a long twill float reads as one smooth
    // length of yarn and a plain weave as beads.
    const crown = (
      path: Path2D,
      runs: number,
      along: number,
      index: (run: number, a: number) => number,
      over: (run: number, a: number) => boolean,
    ) => {
      for (let r = 0; r < runs; r += 1) {
        let open = false;
        for (let a = 0; a < along; a += 1) {
          if (!over(r, a)) continue;
          const k = index(r, a);
          const cx = X[k] ?? 0;
          const cy = Y[k] ?? 0;
          if (!open) {
            const before = index(r, Math.max(0, a - 1));
            path.moveTo(
              cx + ((X[before] ?? cx) - cx) * 0.22,
              cy + ((Y[before] ?? cy) - cy) * 0.22,
            );
            open = true;
          }
          path.lineTo(cx, cy);
          if (a === along - 1 || !over(r, a + 1)) {
            const after = index(r, Math.min(along - 1, a + 1));
            path.lineTo(
              cx + ((X[after] ?? cx) - cx) * 0.22,
              cy + ((Y[after] ?? cy) - cy) * 0.22,
            );
            open = false;
          }
        }
      }
    };
    crown(
      crownWarp,
      nx,
      ny,
      (i, j) => j * nx + i,
      (i, j) => warpOver(wv, i, j),
    );
    crown(
      crownWeft,
      ny,
      nx,
      (j, i) => j * nx + i,
      (j, i) => !warpOver(wv, i, j),
    );

    const width =
      pitch * (wv === "twill" ? 0.86 : wv === "basket" ? 0.8 : 0.82);
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.lineWidth = width;
    ctx.strokeStyle = p.warpUnder;
    ctx.stroke(underWarp);
    ctx.strokeStyle = p.weftUnder;
    ctx.stroke(underWeft);
    for (let t = 0; t < 3; t += 1) {
      ctx.strokeStyle = p.warp[t] ?? p.warp[1];
      ctx.stroke(overWarp[t] ?? overWarp[1] ?? underWarp);
      ctx.strokeStyle = p.weft[t] ?? p.weft[1];
      ctx.stroke(overWeft[t] ?? overWeft[1] ?? underWeft);
    }
    ctx.lineCap = "round";
    ctx.lineWidth = width * 0.26;
    ctx.strokeStyle = p.warpCrown;
    ctx.stroke(crownWarp);
    ctx.strokeStyle = p.weftCrown;
    ctx.stroke(crownWeft);

    const hd = hand.current;
    const hole = holeOf(c);
    // The dent: where the finger is in, the cloth is in its own shadow.
    if (hd.depth > 0.01) {
      const reach = Math.max(4, hole * hd.depth * 2.6);
      const [r, g, b] = p.shade;
      const dark = r2(
        (0.22 + 0.3 * latest.current.depthOf) * Math.min(1, hd.depth * 1.4),
      );
      const shade = ctx.createRadialGradient(hd.x, hd.y, 0, hd.x, hd.y, reach);
      shade.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${dark})`);
      shade.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${r2(dark * 0.4)})`);
      shade.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = shade;
      ctx.fillRect(hd.x - reach, hd.y - reach, reach * 2, reach * 2);
    }
    if (hd.ring && hd.present) {
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, Math.max(pitch * 1.6, hole * 1.15), 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = p.ring;
      ctx.stroke();
    }
    rootRef.current?.setAttribute("data-painted", "");
  };

  /** Where the hole field wants crossing k to be, given the hand. */
  const integrate = (dt: number): boolean => {
    const c = cloth.current;
    if (!c) return false;
    const hd = hand.current;
    const target = hd.pressed ? 1 : hd.present ? TOUCH : 0;
    // A press lands in a blink; a lift lets go over the base duration.
    const ease = target > hd.depth ? durations.blink : durations.base;
    hd.depth += (target - hd.depth) * (1 - Math.exp(-dt / ease));
    // Within a quarter pixel of hole the eye is where it is going.
    if (Math.abs(target - hd.depth) * holeOf(c) < 0.25) hd.depth = target;
    const fade = Math.exp(-dt / 0.08);
    hd.vx *= fade;
    hd.vy *= fade;

    const { nx, ny, pitch, x0, y0, u, vu, v, vv } = c;
    const H = holeOf(c) * hd.depth;
    const reach = H * 5;
    const reach2 = reach * reach;
    const pull = hd.pressed ? 0.035 : 0;
    const dragX = clamp(hd.vx * pull, -pitch, pitch);
    const dragY = clamp(hd.vy * pull, -pitch, pitch);
    const sigma2 = Math.max(1, (H * 1.6) ** 2);
    const i0 =
      H > 0.05 ? Math.max(0, Math.floor((hd.x - reach - x0) / pitch)) : 1;
    const i1 =
      H > 0.05 ? Math.min(nx - 1, Math.ceil((hd.x + reach - x0) / pitch)) : 0;
    const j0 =
      H > 0.05 ? Math.max(0, Math.floor((hd.y - reach - y0) / pitch)) : 1;
    const j1 =
      H > 0.05 ? Math.min(ny - 1, Math.ceil((hd.y + reach - y0) / pitch)) : 0;

    let moving =
      Math.abs(target - hd.depth) > 0 || Math.abs(hd.vx) + Math.abs(hd.vy) > 2;
    let residual = 0;
    for (let j = 0; j < ny; j += 1) {
      const inRows = j >= j0 && j <= j1;
      const ry = y0 + j * pitch - hd.y;
      for (let i = 0; i < nx; i += 1) {
        const k = j * nx + i;
        let tu = 0;
        let tv = 0;
        if (inRows && i >= i0 && i <= i1) {
          const rx = x0 + i * pitch - hd.x;
          const d2 = rx * rx + ry * ry;
          if (d2 < reach2) {
            const r = Math.sqrt(d2);
            const grow =
              (Math.sqrt(d2 + H * H) - r) * (1 - smooth(0.4, 1, r / reach));
            // Dead centre parts to the right and down rather than nowhere.
            const ux = r > 1e-3 ? rx / r : 0.7071;
            const uy = r > 1e-3 ? ry / r : 0.7071;
            const along = Math.exp(-d2 / sigma2);
            tu = ux * grow + dragX * along;
            tv = uy * grow + dragY * along;
          }
        }
        const uk = u[k] ?? 0;
        const vk = v[k] ?? 0;
        // The warp is held straight by its neighbours above and below, the
        // weft by those left and right: a wave equation along each thread.
        const uAbove = j > 0 ? (u[k - nx] ?? 0) : 0;
        const uBelow = j < ny - 1 ? (u[k + nx] ?? 0) : 0;
        const vLeft = i > 0 ? (v[k - 1] ?? 0) : 0;
        const vRight = i < nx - 1 ? (v[k + 1] ?? 0) : 0;
        const au =
          STIFF * (tu - uk) +
          TENSION * (uAbove + uBelow - 2 * uk) -
          DAMP * (vu[k] ?? 0);
        const av =
          STIFF * (tv - vk) +
          TENSION * (vLeft + vRight - 2 * vk) -
          DAMP * (vv[k] ?? 0);
        const nvu = (vu[k] ?? 0) + au * dt;
        const nvv = (vv[k] ?? 0) + av * dt;
        vu[k] = nvu;
        vv[k] = nvv;
        u[k] = uk + nvu * dt;
        v[k] = vk + nvv * dt;
        const off =
          Math.abs(tu - uk) +
          Math.abs(tv - vk) +
          Math.abs(nvu) * 0.03 +
          Math.abs(nvv) * 0.03;
        if (off > residual) residual = off;
      }
    }
    // A twelfth of a pixel is nothing anyone can see; past that the loop
    // would only be polishing.
    if (residual > 0.08) moving = true;
    else if (!moving && hd.depth === 0) {
      u.fill(0);
      vu.fill(0);
      v.fill(0);
      vv.fill(0);
    }
    return moving;
  };

  /** Reduced motion: the threads stand exactly where the hand puts them. */
  const place = () => {
    const c = cloth.current;
    if (!c) return;
    const hd = hand.current;
    hd.depth = hd.pressed ? 1 : hd.present ? TOUCH : 0;
    hd.vx = 0;
    hd.vy = 0;
    c.vu.fill(0);
    c.vv.fill(0);
    const { nx, ny, pitch, x0, y0, u, v } = c;
    const H = holeOf(c) * hd.depth;
    const reach = H * 5;
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const k = j * nx + i;
        const rx = x0 + i * pitch - hd.x;
        const ry = y0 + j * pitch - hd.y;
        const d2 = rx * rx + ry * ry;
        if (H <= 0.05 || d2 >= reach * reach) {
          u[k] = 0;
          v[k] = 0;
          continue;
        }
        const r = Math.sqrt(d2);
        const grow =
          (Math.sqrt(d2 + H * H) - r) * (1 - smooth(0.4, 1, r / reach));
        u[k] = (r > 1e-3 ? rx / r : 0.7071) * grow;
        v[k] = (r > 1e-3 ? ry / r : 0.7071) * grow;
      }
    }
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    if (!latest.current.motionSafe) {
      place();
      draw();
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(1 / 30, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    carry.current += dt;
    let moving = false;
    let steps = 0;
    while (carry.current >= STEP && steps < 6) {
      carry.current -= STEP;
      steps += 1;
      if (integrate(STEP)) moving = true;
    }
    if (steps === 0) moving = true;
    draw();
    if (moving) frame.current = window.requestAnimationFrame(tick);
    else {
      last.current = 0;
      carry.current = 0;
    }
  };

  const kick = () => {
    if (frame.current || !cloth.current) return;
    if (!visible.current || document.hidden) {
      dirty.current = true;
      return;
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  const paint = () => {
    palette.current = readPalette();
    draw();
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const was = cloth.current;
    if (was && was.w === w && was.h === h && was.dpr === dpr) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const pitch = clamp(Math.round(Math.sqrt(w * h) / 40), 9, 18);
    const nx = Math.ceil(w / pitch) + 3;
    const ny = Math.ceil(h / pitch) + 3;
    const rand = seeded(seed);
    const warpTone = new Uint8Array(nx);
    const weftTone = new Uint8Array(ny);
    for (let i = 0; i < nx; i += 1) warpTone[i] = Math.floor(rand() * 3);
    for (let j = 0; j < ny; j += 1) weftTone[j] = Math.floor(rand() * 3);
    cloth.current = {
      w,
      h,
      dpr,
      pitch,
      nx,
      ny,
      x0: (w - (nx - 1) * pitch) / 2,
      y0: (h - (ny - 1) * pitch) / 2,
      u: new Float32Array(nx * ny),
      vu: new Float32Array(nx * ny),
      v: new Float32Array(nx * ny),
      vv: new Float32Array(nx * ny),
      warpTone,
      weftTone,
      px: new Float32Array(nx * ny),
      py: new Float32Array(nx * ny),
    };
    if (!palette.current) palette.current = readPalette();
    draw();
    if (hand.current.present || hand.current.depth > 0) kick();
  };

  const api = React.useRef<Api>({ resize, paint, kick });
  React.useEffect(() => {
    api.current = { resize, paint, kick };
  });

  // Changing the weave or the depth redraws; a hand still on the cloth
  // moves to the new eye.
  React.useEffect(() => {
    api.current.paint();
    api.current.kick();
  }, [weave, depthOf, motionSafe]);

  const tellPress = (pressed: boolean) => {
    latest.current.onPressChange?.(pressed);
    if (pressed)
      setSaid((s) => ({ n: s.n + 1, text: "Pressed into the cloth." }));
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    if (!root || !rect) return { x: 0, y: 0, inside: false };
    const x = clientX - rect.left - root.clientLeft;
    const y = clientY - rect.top - root.clientTop;
    return {
      x,
      y,
      inside:
        x >= 0 && y >= 0 && x <= root.clientWidth && y <= root.clientHeight,
    };
  };

  /** The hand moves: from a pointer (1:1) or a key. */
  const moveTo = (
    x: number,
    y: number,
    at: number,
    source: "pointer" | "key",
  ) => {
    const hd = hand.current;
    const dt = hd.at ? Math.max(8, at - hd.at) / 1000 : 0;
    if (dt > 0 && hd.present) {
      const k = Math.min(1, dt / 0.05);
      hd.vx += ((x - hd.x) / dt - hd.vx) * k;
      hd.vy += ((y - hd.y) / dt - hd.vy) * k;
    }
    hd.x = x;
    hd.y = y;
    hd.at = at;
    hd.present = true;
    hd.source = source;
    if (source === "pointer") hd.ring = false;
    kick();
  };

  const pressIn = (source: "pointer" | "key") => {
    const hd = hand.current;
    if (hd.pressed) return;
    hd.pressed = true;
    hd.present = true;
    hd.source = source;
    kick();
    tellPress(true);
  };

  const letGo = (source: "pointer" | "key", stay: boolean) => {
    const hd = hand.current;
    if (hd.source !== source) return;
    const was = hd.pressed;
    hd.pressed = false;
    if (!stay) hd.present = false;
    rootRef.current?.removeAttribute("data-pressing");
    kick();
    if (was) latest.current.onPressChange?.(false);
  };

  const away = () => {
    const hd = hand.current;
    if (hd.pressed) letGo(hd.source ?? "pointer", false);
    hd.present = false;
    hd.ring = false;
    kick();
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onEnd: ({ point }) => {
      const at = local(point.x, point.y);
      letGo("pointer", at.inside);
    },
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      letGo("pointer", event.pointerType !== "touch" && at.inside);
    },
    onCancel: () => letGo("pointer", false),
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && hit !== surfaceRef.current && rootRef.current?.contains(hit))
      return;
    const at = local(event.clientX, event.clientY);
    rootRef.current?.setAttribute("data-pressing", "");
    moveTo(at.x, at.y, event.timeStamp, "pointer");
    pressIn("pointer");
    drag.onPointerDown(event);
    // A press that ends before it became a drag, off the cloth or by a
    // cancel, never reaches the drag's own end; it still lets go.
    unlisten.current?.();
    const id = event.pointerId;
    const release = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      const hd = hand.current;
      if (hd.pressed && hd.source === "pointer") {
        const spot = local(e.clientX, e.clientY);
        letGo(
          "pointer",
          e.type === "pointerup" && e.pointerType !== "touch" && spot.inside,
        );
      }
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    unlisten.current = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      unlisten.current = null;
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (disabled) return;
    const hd = hand.current;
    if (hd.pressed && hd.source === "pointer") {
      const at = local(event.clientX, event.clientY);
      moveTo(at.x, at.y, event.timeStamp, "pointer");
    } else if (event.pointerType !== "touch" && !hd.pressed) {
      const at = local(event.clientX, event.clientY);
      moveTo(at.x, at.y, event.timeStamp, "pointer");
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const c = cloth.current;
    const hd = hand.current;
    const stepBy = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stepBy, 0],
      ArrowRight: [stepBy, 0],
      ArrowUp: [0, -stepBy],
      ArrowDown: [0, stepBy],
    };
    const move = moves[event.key];
    // A hand already pressed in by a pointer is the pointer's.
    if (hd.pressed && hd.source === "pointer") return;
    if (move && c) {
      event.preventDefault();
      lastKey.current = event.timeStamp;
      if (!hd.present) {
        hd.x = c.w / 2;
        hd.y = c.h / 2;
      }
      hd.ring = true;
      moveTo(
        clamp(hd.x + move[0], 0, c.w),
        clamp(hd.y + move[1], 0, c.h),
        event.timeStamp,
        "key",
      );
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      lastKey.current = event.timeStamp;
      if (event.repeat || !c) return;
      if (!hd.present || hd.source !== "key") {
        hd.x = hd.present ? hd.x : c.w / 2;
        hd.y = hd.present ? hd.y : c.h / 2;
      }
      hd.ring = true;
      hd.at = 0;
      hd.present = true;
      pressIn("key");
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    lastKey.current = event.timeStamp;
    letGo("key", true);
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    const c = cloth.current;
    if (!c || disabled || !event.currentTarget.matches(":focus-visible"))
      return;
    const hd = hand.current;
    if (!hd.present) {
      hd.x = c.w / 2;
      hd.y = c.h / 2;
    }
    hd.ring = true;
    hd.at = 0;
    hd.present = true;
    hd.source = "key";
    kick();
  };

  const onBlur = () => {
    const hd = hand.current;
    if (hd.source !== "key") return;
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    tapTimer.current = null;
    away();
  };

  // A click with no pointer and no key behind it — assistive technology —
  // presses for a moment, the same as a tap.
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || disabled) return;
    if (event.timeStamp - lastKey.current < 500) return;
    const c = cloth.current;
    const hd = hand.current;
    if (!c) return;
    if (!hd.present) {
      hd.x = c.w / 2;
      hd.y = c.h / 2;
    }
    hd.present = true;
    hd.at = 0;
    pressIn("key");
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null;
      letGo("key", true);
    }, 260);
  };

  // A disabled cloth lets go of whatever it was holding.
  React.useEffect(() => {
    if (!disabled) return;
    const hd = hand.current;
    const was = hd.pressed;
    hd.pressed = false;
    hd.present = false;
    hd.ring = false;
    rootRef.current?.removeAttribute("data-pressing");
    api.current.kick();
    if (was) latest.current.onPressChange?.(false);
  }, [disabled]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        const hd = hand.current;
        const was = hd.pressed;
        hd.pressed = false;
        hd.present = false;
        rootRef.current?.removeAttribute("data-pressing");
        if (was) latest.current.onPressChange?.(false);
      } else if (dirty.current) {
        api.current.paint();
      }
      api.current.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    const tap = tapTimer;
    const listening = unlisten;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      if (tap.current !== null) window.clearTimeout(tap.current);
      tap.current = null;
      listening.current?.();
    };
  }, []);

  // Size and visibility, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        if (dirty.current) api.current.paint();
        api.current.kick();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // A new theme or dye changes the canvas's colours; the 1ms colour
  // transition says when, and the cloth is drawn again from them.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current.paint();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        const hd = hand.current;
        if (hd.source === "pointer" && !hd.pressed) away();
      }}
      className={cn(
        "group/loom-field relative isolate h-full w-full overflow-clip data-pressing:cursor-grabbing data-pressing:select-none",
        // The hand presses and ploughs in any direction; a disabled cloth
        // gives the page its scrolling back.
        disabled ? "touch-auto" : "touch-none",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={carriers}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/loom-field:hidden"
        style={{ backgroundImage: standIn(carriers) }}
      />
      <div className="relative z-10 size-full">{children}</div>
      <button
        ref={surfaceRef}
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        Move over the cloth and the threads give way. Press, or hold Space or
        Enter, to press into it. Arrow keys move your hand.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
