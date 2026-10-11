"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ArmillaryWordsFinish = "brass" | "bronze" | "steel" | "gilt";

export type ArmillaryWordsProps = {
  /** One line per ring, engraved round its band; cycled when there are more rings than lines. */
  lines?: string[];
  /** How many rings, 2 to 6. @default 4 */
  ringCount?: number;
  /** Degrees between neighbouring rings' tilts, 0 to 45: a small tilt nests them, a large one opens the sphere. @default 26 */
  tilt?: number;
  /** The metal. @default "brass" */
  finish?: ArmillaryWordsFinish;
  /** The ring facing you, or null. */
  value?: number | null;
  /** The ring facing you at first, when uncontrolled. @default null */
  defaultValue?: number | null;
  /** From the tap, key or focus that turned a ring to face you or let it go. */
  onValueChange?: (ring: number | null) => void;
  /** Idle turn, degrees a second; 0 holds the sphere still. @default 9 */
  spin?: number;
  /** How quickly a throw slows, 0 (coasts) to 1 (stops short). @default 0.5 */
  friction?: number;
  /** How far above the sphere you look from, degrees. @default 14 */
  view?: number;
  /** Engrave the lines in capitals. @default true */
  caps?: boolean;
  /** Degree ticks on the rest of each band. @default true */
  graduations?: boolean;
  /** A small globe and the polar rod at the centre. @default true */
  globe?: boolean;
  /** Height of the sphere's stage, px. @default 196 */
  height?: number;
  /** Device pixel ratio cap for the canvas. @default 2 */
  dpr?: number;
  /** Hold the idle turn. @default false */
  paused?: boolean;
  /** No dragging, tapping or keys. @default false */
  disabled?: boolean;
  /** Accessible name of the sphere. @default "Armillary sphere" */
  label?: string;
  className?: string;
};

export const defaultArmillaryLines = [
  "Fernworks Observatory · 1891",
  "Open Friday nights from dusk",
  "Telescope tours on the hour",
  "The dome opens at nine",
  "Members see the first light",
  "Clear skies, the Fernworks way",
];

type Finish = { base: string; light: string; dark: string; engrave: string };

/** Metals are pigments: a ring looks like brass on any page. */
const FINISHES: Record<ArmillaryWordsFinish, Finish> = {
  brass: {
    base: "oklch(0.74 0.1 85)",
    light: "oklch(0.95 0.07 95)",
    dark: "oklch(0.4 0.07 68)",
    engrave: "oklch(0.3 0.05 62)",
  },
  bronze: {
    base: "oklch(0.6 0.1 52)",
    light: "oklch(0.86 0.08 68)",
    dark: "oklch(0.32 0.06 42)",
    engrave: "oklch(0.24 0.04 38)",
  },
  steel: {
    base: "oklch(0.73 0.012 250)",
    light: "oklch(0.96 0.008 250)",
    dark: "oklch(0.4 0.016 256)",
    engrave: "oklch(0.27 0.016 256)",
  },
  gilt: {
    base: "oklch(0.8 0.13 88)",
    light: "oklch(0.97 0.08 100)",
    dark: "oklch(0.5 0.1 72)",
    engrave: "oklch(0.36 0.07 66)",
  },
};

const NUMERALS = ["I", "II", "III", "IV", "V", "VI"];
/** Segments round each band. */
const SEG = 72;
/** Camera distance, in outer-ring radii. */
const CAM = 3.6;
/** The band's height, in outer-ring radii. */
const BAND = 0.13;
/** How far a facing ring comes toward you, in outer-ring radii. */
const FORWARD = 0.5;
/** The pose the sphere rests in before anyone turns it, degrees. */
const YAW0 = 28;
const MAX_ITEMS = 6 * SEG + 3;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const RAD = Math.PI / 180;

/* ---- Quaternions, written into caller-owned arrays: no per-frame garbage. */

type Q = Float64Array;

function qAxis(out: Q, x: number, y: number, z: number, angle: number) {
  const s = Math.sin(angle / 2);
  out[0] = x * s;
  out[1] = y * s;
  out[2] = z * s;
  out[3] = Math.cos(angle / 2);
  return out;
}

/** out = a · b (b applied first). */
function qMul(out: Q, a: Q, b: Q) {
  const ax = a[0] as number,
    ay = a[1] as number,
    az = a[2] as number,
    aw = a[3] as number;
  const bx = b[0] as number,
    by = b[1] as number,
    bz = b[2] as number,
    bw = b[3] as number;
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

/** Shortest-arc slerp; t past 1 carries on along the same arc (a spring's overshoot). */
function qSlerp(out: Q, a: Q, b: Q, t: number) {
  let bx = b[0] as number,
    by = b[1] as number,
    bz = b[2] as number,
    bw = b[3] as number;
  const ax = a[0] as number,
    ay = a[1] as number,
    az = a[2] as number,
    aw = a[3] as number;
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let k0: number;
  let k1: number;
  if (cos > 0.9995) {
    k0 = 1 - t;
    k1 = t;
  } else {
    const omega = Math.acos(Math.min(1, cos));
    const sin = Math.sin(omega);
    k0 = Math.sin((1 - t) * omega) / sin;
    k1 = Math.sin(t * omega) / sin;
  }
  out[0] = k0 * ax + k1 * bx;
  out[1] = k0 * ay + k1 * by;
  out[2] = k0 * az + k1 * bz;
  out[3] = k0 * aw + k1 * bw;
  const n = Math.hypot(
    out[0] as number,
    out[1] as number,
    out[2] as number,
    out[3] as number,
  );
  for (let i = 0; i < 4; i += 1) out[i] = (out[i] as number) / n;
  return out;
}

/** Row-major 3×3 rotation from a unit quaternion. */
function qMat(out: Float64Array, q: Q) {
  const x = q[0] as number,
    y = q[1] as number,
    z = q[2] as number,
    w = q[3] as number;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y - z * w);
  out[2] = 2 * (x * z + y * w);
  out[3] = 2 * (x * y + z * w);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z - x * w);
  out[6] = 2 * (x * z - y * w);
  out[7] = 2 * (y * z + x * w);
  out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

/** Each ring's own orientation: tilted from upright by `i × tilt`, spread round the pole. */
function ringOrientations(count: number, tilt: number): Q[] {
  const a = new Float64Array(4);
  const b = new Float64Array(4);
  return Array.from({ length: count }, (_, i) => {
    const alpha = Math.min(88, i * tilt) * RAD;
    const beta = (i * 360) / Math.max(count, 1) / 2 + i * 31;
    qAxis(a, 0, 1, 0, beta * RAD);
    qAxis(b, 1, 0, 0, alpha);
    return qMul(new Float64Array(4), a, b);
  });
}

/**
 * The server's frame: each ring's outline as an ellipse, from the resting
 * pose under an orthographic view. Rounded, so server and client agree.
 */
function stillRings(count: number, tilt: number, view: number) {
  const orient = ringOrientations(count, tilt);
  const qs = new Float64Array(4);
  const qv = new Float64Array(4);
  const tmp = new Float64Array(4);
  const m = new Float64Array(9);
  qAxis(qs, 0, 1, 0, YAW0 * RAD);
  qAxis(qv, 1, 0, 0, view * RAD);
  return orient.map((o, i) => {
    qMul(tmp, qs, o);
    qMul(tmp, qv, tmp);
    qMat(m, tmp);
    // The ring's axis in view space: its foreshortening and lean.
    const ax = m[1] as number;
    const ay = m[4] as number;
    const az = m[7] as number;
    const r = 1 - 0.085 * i;
    const lean = Math.atan2(ax, ay);
    return {
      r: r3(r),
      ry: r3(Math.max(0.02, Math.abs(az) * r)),
      angle: r3(lean / RAD),
    };
  });
}

type Shade = { outer: string[]; inner: string[]; engrave: string; lip: string };

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  draw: () => void;
  kick: () => void;
  tick: (now: number) => void;
  resize: () => void;
  shades: () => void;
  layout: () => void;
};

type Letter = { ch: string; theta: number; adv: number; seg: number };
type RingText = {
  letters: Letter[];
  /** Letters by segment, so each is drawn right after its piece of band. */
  bySeg: number[][];
  font: number;
  /** The canvas font string, built once. */
  css: string;
  /** Angular span of the line, radians, centred on 0. */
  half: number;
};

/**
 * An armillary sphere of thin metal bands, each engraved round its outer face
 * with one line, the rest of the band graduated in degrees. It is drawn on a
 * canvas with its own perspective: every segment of every band, the globe and
 * the polar rod are depth-sorted together each frame, so rings cross each
 * other properly, and each band is lit from the upper left with the finish's
 * own sheen, darker on its inner face.
 *
 * The sphere turns slowly. A drag spins it 1:1 under the finger and a throw
 * coasts down by `friction` to the idle turn. Tap a ring — or choose it from
 * the plates beneath, or Tab to its plate — and it swings to face you:
 * its orientation slerps on the snap spring's constants, one crisp overshoot,
 * to level with its line centred toward you, and it comes a little forward
 * so nothing crosses its words, while the other rings slow to a stop on the
 * drift spring and dim. Tap it again or press Escape to let it go.
 *
 * The sphere is a slider (Left and Right throw it, Page Up and Page Down a
 * quarter turn); the plates are a toolbar of toggle buttons named by their
 * lines. The loop runs only on screen while something moves. Under reduced
 * motion the sphere holds still, a drag turns it 1:1 without coasting, and a
 * ring faces you at once.
 */
export function ArmillaryWords({
  lines = defaultArmillaryLines,
  ringCount = 4,
  tilt = 26,
  finish = "brass",
  value,
  defaultValue = null,
  onValueChange,
  spin = 9,
  friction = 0.5,
  view = 14,
  caps = true,
  graduations = true,
  globe = true,
  height = 196,
  dpr = 2,
  paused = false,
  disabled = false,
  label = "Armillary sphere",
  className,
}: ArmillaryWordsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const n = Math.round(clamp(ringCount, 2, 6));
  const spread = clamp(tilt, 0, 45);
  const metal = FINISHES[finish] ?? FINISHES.brass;
  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const facing = value !== undefined ? value : own;
  const current = facing !== null && facing >= 0 && facing < n ? facing : null;
  const [live, setLive] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);
  const [plate, setPlate] = React.useState(0);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );

  // Keyed by content, so a host passing a fresh array each render keeps its rings.
  const lineSig = lines.join("\u0000");
  const texts = React.useMemo(() => {
    const list = lineSig ? lineSig.split("\u0000") : [];
    return Array.from({ length: n }, (_, i) => {
      const line = list.length ? (list[i % list.length] ?? "") : "";
      return caps ? line.toUpperCase() : line;
    });
  }, [lineSig, n, caps]);
  const still = React.useMemo(
    () => stillRings(n, spread, clamp(view, 0, 40)),
    [n, spread, view],
  );

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const plates = React.useRef<(HTMLButtonElement | null)[]>([]);
  const frame = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onValueChange);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const sim = React.useRef({
    yaw: YAW0,
    pitch: 0,
    /** Yaw and pitch velocity, degrees a second. */
    v: 0,
    pv: 0,
    /** How much of the idle turn applies: 1 free, 0 while a ring faces you. */
    cruise: 1,
    cruiseV: 0,
    face: new Float64Array(6),
    faceV: new Float64Array(6),
    target: -1,
    drag: false,
    hover: -1,
    last: 0,
    shown: -1,
  });
  const geo = React.useRef({ w: 1, h: 1, s: 1, cx: 0, cy: 0, ratio: 1 });
  const shade = React.useRef<Shade | null>(null);
  /** The globe's shading, rebuilt only when the size or metal changes. */
  const globeFill = React.useRef<CanvasGradient | null>(null);
  const ringText = React.useRef<RingText[]>([]);
  const orient = React.useRef<Q[]>([]);
  // Scratch space, allocated once.
  const scratch = React.useRef({
    qs: new Float64Array(4),
    qa: new Float64Array(4),
    qb: new Float64Array(4),
    qv: new Float64Array(4),
    id: new Float64Array([0, 0, 0, 1]),
    ring: new Float64Array(4),
    mats: Array.from({ length: 6 }, () => new Float64Array(9)),
    z: new Float64Array(6),
    /** Projected band vertices: ring × segment × (top, bottom) × (x, y, z). */
    vx: new Float32Array(6 * SEG * 2 * 3),
    depth: new Float32Array(MAX_ITEMS),
    order: Array.from({ length: MAX_ITEMS }, (_, i) => i),
    /** Last frame's quads for hit testing: ring, 4 corners, depth. */
    hit: new Float32Array(6 * SEG * 10),
    /** This frame: which segments are down, how squarely each faces you. */
    drawn: new Uint8Array(6 * SEG),
    facing: new Float32Array(6 * SEG),
    /** Letters already engraved this frame, per ring. */
    done: new Uint8Array(6 * 256),
    sin: Float64Array.from({ length: SEG + 1 }, (_, k) =>
      Math.sin((k / SEG) * Math.PI * 2),
    ),
    cos: Float64Array.from({ length: SEG + 1 }, (_, k) =>
      Math.cos((k / SEG) * Math.PI * 2),
    ),
  });

  const k = {
    spin: motionSafe && !paused ? Math.max(0, spin) : 0,
    fr: 0.5 + 4.5 * clamp01(friction),
    view: clamp(view, 0, 40),
    dpr: clamp(dpr, 0.5, 2),
  };

  /** The finish as ramps of ready-made colour strings: nothing built per frame. */
  const shades = () => {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const rgb = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    };
    const dark = rgb(metal.dark);
    const base = rgb(metal.base);
    const light = rgb(metal.light);
    const mix = (a: number[], b: number[], t: number) =>
      a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * t));
    const css = (c: number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
    const ramp = (lo: number[], hi: number[], top: number[]) =>
      Array.from({ length: 48 }, (_, i) => {
        const t = i / 47;
        return css(
          t < 0.7 ? mix(lo, hi, t / 0.7) : mix(hi, top, (t - 0.7) / 0.3),
        );
      });
    globeFill.current = null;
    shade.current = {
      outer: ramp(dark, base, light),
      inner: ramp(mix(dark, [0, 0, 0], 0.35), mix(dark, base, 0.55), base),
      engrave: css(rgb(metal.engrave)),
      lip: css(mix(light, base, 0.3)),
    };
  };

  /** Measures every line and lays its letters round its band. */
  const layout = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { s } = geo.current;
    const family =
      getComputedStyle(stageRef.current ?? canvas).fontFamily ||
      "ui-sans-serif, system-ui, sans-serif";
    const bandPx = BAND * s;
    ringText.current = texts.map((line, i) => {
      const radius = (1 - 0.085 * i) * s;
      let font = Math.max(6, bandPx * 0.6);
      const track = 0.08;
      ctx.font = `600 ${font}px ${family}`;
      const chars = Array.from(line);
      const widthAt = (f: number) =>
        chars.reduce(
          (sum, ch) => sum + ctx.measureText(ch).width * (f / font) + track * f,
          0,
        );
      // The line reads straight across the front 150° of its band.
      const room = radius * 150 * RAD;
      const w = widthAt(font);
      if (w > room) font = Math.max(5, font * (room / w));
      ctx.font = `600 ${font}px ${family}`;
      const advances = chars.map(
        (ch) => ctx.measureText(ch).width + track * font,
      );
      const total = advances.reduce((a, b) => a + b, 0);
      let at = -total / 2;
      const bySeg: number[][] = Array.from({ length: SEG }, () => []);
      const letters = chars.map((ch, j) => {
        const adv = advances[j] ?? 0;
        const theta = (at + adv / 2) / radius;
        at += adv;
        const turn = ((theta / (Math.PI * 2)) % 1) + 1;
        const seg = Math.floor((turn % 1) * SEG) % SEG;
        (bySeg[seg] as number[]).push(j);
        return { ch, theta, adv, seg };
      });
      return {
        letters,
        bySeg,
        font,
        css: `600 ${font}px ${family}`,
        half: total / 2 / radius,
      };
    });
  };

  const resize = () => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, k.dpr);
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
    globeFill.current = null;
    geo.current = {
      w,
      h,
      s: Math.min(w, h) * 0.42,
      cx: w / 2,
      cy: h / 2,
      ratio,
    };
    layout();
  };

  /** Where everything is now, drawn back to front. */
  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const sh = shade.current;
    if (!canvas || !ctx || !sh) return;
    const st = sim.current;
    const sc = scratch.current;
    const { s, cx, cy, ratio, w, h } = geo.current;
    const F = s * CAM;
    const bandHalf = BAND / 2;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Sphere: yaw about the pole, then pitch; the camera looks down by `view`.
    qAxis(sc.qa, 0, 1, 0, st.yaw * RAD);
    qAxis(sc.qb, 1, 0, 0, st.pitch * RAD);
    qMul(sc.qs, sc.qb, sc.qa);
    qAxis(sc.qv, 1, 0, 0, k.view * RAD);
    let lifted = 0;
    for (let i = 0; i < n; i += 1) {
      const o = orient.current[i];
      if (!o) continue;
      qMul(sc.ring, sc.qs, o);
      const f = st.face[i] ?? 0;
      if (f !== 0) qSlerp(sc.ring, sc.ring, sc.id, f);
      qMul(sc.ring, sc.qv, sc.ring);
      qMat(sc.mats[i] as Float64Array, sc.ring);
      sc.z[i] = FORWARD * clamp(f, 0, 1.2);
      lifted = Math.max(lifted, clamp01(f));
    }

    // Every band vertex, projected once.
    for (let i = 0; i < n; i += 1) {
      const m = sc.mats[i] as Float64Array;
      const radius = 1 - 0.085 * i;
      const dz = sc.z[i] ?? 0;
      for (let kk = 0; kk < SEG; kk += 1) {
        const sn = (sc.sin[kk] as number) * radius;
        const cs = (sc.cos[kk] as number) * radius;
        for (let e = 0; e < 2; e += 1) {
          const y = e === 0 ? bandHalf : -bandHalf;
          const X =
            (m[0] as number) * sn +
            (m[1] as number) * y +
            (m[2] as number) * cs;
          const Y =
            (m[3] as number) * sn +
            (m[4] as number) * y +
            (m[5] as number) * cs;
          const Z =
            (m[6] as number) * sn +
            (m[7] as number) * y +
            (m[8] as number) * cs +
            dz;
          const d = CAM - Z;
          const at = ((i * SEG + kk) * 2 + e) * 3;
          sc.vx[at] = cx + (F * X) / d;
          sc.vx[at + 1] = cy - (F * Y) / d;
          sc.vx[at + 2] = Z;
        }
      }
    }

    // Depth of each piece: band segments, the globe, the rod's two halves.
    for (let i = 0; i < n; i += 1) {
      for (let kk = 0; kk < SEG; kk += 1) {
        const k2 = (kk + 1) % SEG;
        const a = (i * SEG + kk) * 2 * 3;
        const b = (i * SEG + k2) * 2 * 3;
        let depth =
          ((sc.vx[a + 2] as number) +
            (sc.vx[a + 5] as number) +
            (sc.vx[b + 2] as number) +
            (sc.vx[b + 5] as number)) /
          4;
        // The ring that faces you has come forward: the near half of its band
        // is drawn over everything, so no other ring crosses its words.
        if (i === st.target && depth > (sc.z[i] ?? 0)) {
          depth += 4 * clamp01(st.face[i] ?? 0);
        }
        sc.depth[i * SEG + kk] = depth;
      }
    }
    const globeId = n * SEG;
    sc.depth[globeId] = globe ? 0 : -99;
    // The polar rod rides the sphere: its two ends' depths decide its halves.
    const poleX =
      2 *
      ((sc.qs[0] as number) * (sc.qs[1] as number) -
        (sc.qs[2] as number) * (sc.qs[3] as number));
    const poleY =
      1 - 2 * ((sc.qs[0] as number) ** 2 + (sc.qs[2] as number) ** 2);
    const poleZ =
      2 *
      ((sc.qs[1] as number) * (sc.qs[2] as number) +
        (sc.qs[0] as number) * (sc.qs[3] as number));
    const cv = Math.cos(k.view * RAD);
    const sv = Math.sin(k.view * RAD);
    const px = poleX;
    const py = poleY * cv - poleZ * sv;
    const pz = poleY * sv + poleZ * cv;
    sc.depth[globeId + 1] = globe ? pz * 0.6 : -99;
    sc.depth[globeId + 2] = globe ? -pz * 0.6 : -99;
    const total = globeId + 3;
    const order = sc.order;
    for (let i = 0; i < total; i += 1) order[i] = i;
    order.length = total;
    order.sort((a, b) => (sc.depth[a] as number) - (sc.depth[b] as number));

    const lx = -0.5;
    const ly = 0.62;
    const lz = 0.6;
    const ll = Math.hypot(lx, ly, lz);
    const hx = lx / ll;
    const hy = ly / ll;
    const hz = lz / ll + 1;
    const hl = Math.hypot(hx, hy, hz);

    ctx.lineJoin = "round";
    sc.drawn.fill(0);
    sc.done.fill(0);
    for (const id of order) {
      if (id >= globeId) {
        if (!globe) continue;
        if (id === globeId) {
          const r = s * 0.2;
          if (!globeFill.current) {
            const g = ctx.createRadialGradient(
              cx - r * 0.35,
              cy - r * 0.4,
              r * 0.1,
              cx,
              cy,
              r,
            );
            g.addColorStop(0, sh.outer[47] as string);
            g.addColorStop(0.55, sh.outer[30] as string);
            g.addColorStop(1, sh.outer[6] as string);
            globeFill.current = g;
          }
          ctx.globalAlpha = 1 - 0.35 * lifted;
          ctx.fillStyle = globeFill.current;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        // A rod half: from the centre to one pole.
        const sign = id === globeId + 1 ? 1 : -1;
        const reach = 1.1;
        const ex = sign * px * reach;
        const ey = sign * py * reach;
        const ez = sign * pz * reach;
        const d = CAM - ez;
        ctx.globalAlpha = 1 - 0.35 * lifted;
        ctx.strokeStyle = sh.outer[14] as string;
        ctx.lineWidth = Math.max(1, s * 0.022);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (F * ex) / d, cy - (F * ey) / d);
        ctx.stroke();
        continue;
      }
      const i = Math.floor(id / SEG);
      const kk = id % SEG;
      const k2 = (kk + 1) % SEG;
      const m = sc.mats[i] as Float64Array;
      const a = (i * SEG + kk) * 2 * 3;
      const b = (i * SEG + k2) * 2 * 3;
      const ax = sc.vx[a] as number;
      const ay = sc.vx[a + 1] as number;
      const bx = sc.vx[b] as number;
      const by = sc.vx[b + 1] as number;
      const cxp = sc.vx[b + 3] as number;
      const cyp = sc.vx[b + 4] as number;
      const dxp = sc.vx[a + 3] as number;
      const dyp = sc.vx[a + 4] as number;
      // The segment's outward normal and where it sits, in view space.
      const mid = (kk + 0.5) / SEG;
      const sn = Math.sin(mid * Math.PI * 2);
      const cs = Math.cos(mid * Math.PI * 2);
      const nx = (m[0] as number) * sn + (m[2] as number) * cs;
      const ny = (m[3] as number) * sn + (m[5] as number) * cs;
      const nz = (m[6] as number) * sn + (m[8] as number) * cs;
      const radius = 1 - 0.085 * i;
      const Px = nx * radius;
      const Py = ny * radius;
      const Pz = nz * radius + (sc.z[i] ?? 0);
      const tx = -Px;
      const ty = -Py;
      const tz = CAM - Pz;
      const tl = Math.hypot(tx, ty, tz);
      const facingCam = (nx * tx + ny * ty + nz * tz) / tl;
      const outer = facingCam > 0;
      const sx = outer ? nx : -nx;
      const sy = outer ? ny : -ny;
      const sz = outer ? nz : -nz;
      const diffuse = Math.max(0, (sx * lx + sy * ly + sz * lz) / ll);
      const spec = Math.pow(
        Math.max(0, (sx * hx + sy * hy + sz * hz) / hl),
        outer ? 26 : 10,
      );
      const hovered = st.hover === i && st.target !== i ? 0.08 : 0;
      const tone = clamp01(0.22 + 0.58 * diffuse + 0.32 * spec + hovered);
      const isFacing = st.target === i;
      const ringAlpha = isFacing || st.target < 0 ? 1 : 1 - 0.5 * lifted;
      ctx.globalAlpha = ringAlpha;
      ctx.fillStyle = (outer ? sh.outer : sh.inner)[
        Math.round(tone * 47)
      ] as string;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cxp, cyp);
      ctx.lineTo(dxp, dyp);
      ctx.closePath();
      ctx.fill();
      // The rims: a darker edge along the top and bottom of the band.
      ctx.strokeStyle = sh.outer[outer ? 8 : 2] as string;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.moveTo(dxp, dyp);
      ctx.lineTo(cxp, cyp);
      ctx.stroke();

      const hb = (i * SEG + kk) * 10;
      sc.hit[hb] = i;
      sc.hit[hb + 1] = ax;
      sc.hit[hb + 2] = ay;
      sc.hit[hb + 3] = bx;
      sc.hit[hb + 4] = by;
      sc.hit[hb + 5] = cxp;
      sc.hit[hb + 6] = cyp;
      sc.hit[hb + 7] = dxp;
      sc.hit[hb + 8] = dyp;
      sc.hit[hb + 9] = sc.depth[id] as number;

      sc.drawn[i * SEG + kk] = 1;
      sc.facing[i * SEG + kk] = outer ? facingCam : -1;
      const rt = ringText.current[i];
      if (!rt) continue;

      // Graduations on the bare band: every 5°, longer every 30°.
      const theta0 = (kk / SEG) * Math.PI * 2;
      const wrapped = theta0 > Math.PI ? theta0 - Math.PI * 2 : theta0;
      if (
        outer &&
        facingCam > 0.06 &&
        graduations &&
        (rt.letters.length === 0 || Math.abs(wrapped) > rt.half + 0.09)
      ) {
        ctx.globalAlpha = ringAlpha * clamp01((facingCam - 0.06) / 0.22);
        const long = kk % 6 === 0;
        const t0 = -bandHalf * 0.88;
        const t1 = -bandHalf * 0.88 + BAND * (long ? 0.5 : 0.28);
        const sn0 = (sc.sin[kk] as number) * radius;
        const cs0 = (sc.cos[kk] as number) * radius;
        const bx0 = (m[0] as number) * sn0 + (m[2] as number) * cs0;
        const by0 = (m[3] as number) * sn0 + (m[5] as number) * cs0;
        const bz0 =
          (m[6] as number) * sn0 + (m[8] as number) * cs0 + (sc.z[i] ?? 0);
        const d0 = CAM - (bz0 + (m[7] as number) * t0);
        const d1 = CAM - (bz0 + (m[7] as number) * t1);
        ctx.strokeStyle = sh.engrave;
        ctx.lineWidth = long ? 0.9 : 0.6;
        ctx.beginPath();
        ctx.moveTo(
          cx + (F * (bx0 + (m[1] as number) * t0)) / d0,
          cy - (F * (by0 + (m[4] as number) * t0)) / d0,
        );
        ctx.lineTo(
          cx + (F * (bx0 + (m[1] as number) * t1)) / d1,
          cy - (F * (by0 + (m[4] as number) * t1)) / d1,
        );
        ctx.stroke();
      }

      // A letter overhangs its piece of band, so it is engraved once that
      // piece and both its neighbours are down — never painted over by them.
      for (let off = -1; off <= 1; off += 1) {
        const seg = (kk + off + SEG) % SEG;
        const list = rt.bySeg[seg];
        if (!list || list.length === 0) continue;
        const base = i * SEG;
        if (
          !sc.drawn[base + seg] ||
          !sc.drawn[base + ((seg + 1) % SEG)] ||
          !sc.drawn[base + ((seg + SEG - 1) % SEG)]
        ) {
          continue;
        }
        const face = sc.facing[base + seg] as number;
        if (face < 0.06) continue;
        ctx.globalAlpha = ringAlpha * clamp01((face - 0.06) / 0.22);
        ctx.font = rt.css;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const j of list) {
          const L = rt.letters[j];
          if (!L || j >= 256 || sc.done[i * 256 + j]) continue;
          sc.done[i * 256 + j] = 1;
          const st2 = Math.sin(L.theta);
          const ct2 = Math.cos(L.theta);
          // Centre, tangent (reading direction) and the band's axis.
          const Cx = ((m[0] as number) * st2 + (m[2] as number) * ct2) * radius;
          const Cy = ((m[3] as number) * st2 + (m[5] as number) * ct2) * radius;
          const Cz =
            ((m[6] as number) * st2 + (m[8] as number) * ct2) * radius +
            (sc.z[i] ?? 0);
          const Tx = (m[0] as number) * ct2 - (m[2] as number) * st2;
          const Ty = (m[3] as number) * ct2 - (m[5] as number) * st2;
          const Tz = (m[6] as number) * ct2 - (m[8] as number) * st2;
          const Ux = m[1] as number;
          const Uy = m[4] as number;
          const Uz = m[7] as number;
          const d = CAM - Cz;
          const sxp = cx + (F * Cx) / d;
          const syp = cy - (F * Cy) / d;
          const per = F / d / s;
          ctx.setTransform(
            ratio * per * (Tx + (Cx * Tz) / d),
            ratio * -per * (Ty + (Cy * Tz) / d),
            ratio * -per * (Ux + (Cx * Uz) / d),
            ratio * per * (Uy + (Cy * Uz) / d),
            ratio * sxp,
            ratio * syp,
          );
          // Incised: a light lip under a dark cut.
          ctx.fillStyle = sh.lip;
          ctx.fillText(L.ch, 0, rt.font * 0.07);
          ctx.fillStyle = sh.engrave;
          ctx.fillText(L.ch, 0, 0);
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    }
    ctx.globalAlpha = 1;
    // The slider's value follows the turn, written straight to the node.
    const deg = Math.round(((st.yaw % 360) + 360) % 360);
    if (deg !== st.shown && stageRef.current) {
      st.shown = deg;
      stageRef.current.setAttribute("aria-valuenow", String(deg));
      stageRef.current.setAttribute("aria-valuetext", `Turned ${deg} degrees`);
    }
  };

  /** Whether anything is still moving. */
  const moving = () => {
    const st = sim.current;
    if (st.drag) return true;
    const idle = st.target < 0 ? k.spin : 0;
    if (Math.abs(st.v - idle * st.cruise) > 0.05) return true;
    if (Math.abs(st.pitch) > 0.01 || Math.abs(st.pv) > 0.01) return true;
    if (Math.abs(st.cruise - (st.target < 0 ? 1 : 0)) > 0.001) return true;
    if (idle > 0 && st.cruise > 0.001) return true;
    for (let i = 0; i < 6; i += 1) {
      const goal = i === st.target ? 1 : 0;
      if (Math.abs((st.face[i] ?? 0) - goal) > 0.0005) return true;
      if (Math.abs(st.faceV[i] ?? 0) > 0.0005) return true;
    }
    return false;
  };

  const step = (dt: number) => {
    const st = sim.current;
    const snap = springs.snap;
    const drift = springs.drift;
    if (!motionSafe) {
      for (let i = 0; i < 6; i += 1) {
        st.face[i] = i === st.target ? 1 : 0;
        st.faceV[i] = 0;
      }
      st.cruise = st.target < 0 ? 1 : 0;
      st.cruiseV = 0;
      st.pitch = st.drag ? st.pitch : 0;
      st.pv = 0;
      st.v = 0;
      return;
    }
    // Small fixed steps: the snap spring is stiff.
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240);
      left -= h;
      for (let i = 0; i < 6; i += 1) {
        const goal = i === st.target ? 1 : 0;
        const x = st.face[i] ?? 0;
        const v = st.faceV[i] ?? 0;
        const a = (-snap.stiffness * (x - goal) - snap.damping * v) / snap.mass;
        const nv = v + a * h;
        st.faceV[i] = nv;
        st.face[i] = x + nv * h;
      }
      // The others slow on the drift spring's constants: no overshoot.
      const cg = st.target < 0 ? 1 : 0;
      const ca =
        (-drift.stiffness * (st.cruise - cg) - drift.damping * st.cruiseV) /
        drift.mass;
      st.cruiseV += ca * h;
      st.cruise += st.cruiseV * h;
      if (!st.drag) {
        const pa =
          (-drift.stiffness * st.pitch - drift.damping * st.pv) / drift.mass;
        st.pv += pa * h;
        st.pitch += st.pv * h;
        const idle = (st.target < 0 ? k.spin : 0) * clamp01(st.cruise);
        st.v += (idle - st.v) * (1 - Math.exp(-k.fr * h));
        // The last whisper of a coast is not worth a frame.
        if (
          Math.abs(st.v - idle) < 0.05 &&
          Math.abs(st.cruise - (st.target < 0 ? 1 : 0)) < 0.001
        ) {
          st.v = idle;
        }
        st.yaw += st.v * h;
      }
    }
  };

  const tick = (now: number) => {
    frame.current = 0;
    const st = sim.current;
    const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 1 / 60;
    st.last = now;
    step(dt);
    draw();
    // A kick during this frame may already have queued the next one.
    if (frame.current) return;
    if (onScreen && !hidden && moving()) {
      frame.current = window.requestAnimationFrame(loop);
    } else {
      st.last = 0;
    }
  };

  const kick = () => {
    if (!onScreen || hidden) return;
    if (frame.current) return;
    sim.current.last = 0;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, tick, resize, shades, layout };
    report.current = onValueChange;
  });

  /** Commits a facing ring (or none) from the gesture that chose it. */
  const choose = (ring: number | null) => {
    if (disabled) return;
    const next = ring !== null && ring >= 0 && ring < n ? ring : null;
    if (next === current) return;
    if (value === undefined) setOwn(next);
    report.current?.(next);
  };

  // The ring the host says faces you swings round.
  React.useEffect(() => {
    sim.current.target = current ?? -1;
    api.current?.kick();
  }, [current]);

  React.useEffect(() => {
    orient.current = ringOrientations(n, spread);
    api.current?.draw();
    api.current?.kick();
  }, [n, spread]);

  React.useEffect(() => {
    api.current?.layout();
    api.current?.draw();
  }, [texts, live]);

  React.useEffect(() => {
    api.current?.shades();
    api.current?.draw();
  }, [finish]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
    api.current?.kick();
  }, [k.dpr, height]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [onScreen, hidden, k.spin, k.view, graduations, globe, motionSafe]);

  // The canvas is live once it has a context and a first frame.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.getContext("2d")) return;
    orient.current = ringOrientations(n, spread);
    api.current?.shades();
    api.current?.resize();
    api.current?.draw();
    setLive(true);
    const loopRef = frame;
    return () => {
      if (loopRef.current) window.cancelAnimationFrame(loopRef.current);
      loopRef.current = 0;
      setLive(false);
    };
    // Built once; the effects above keep it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bindStage = React.useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => {
      api.current?.layout();
      api.current?.draw();
    });
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  /** The ring under a point on the stage, front-most first. */
  const ringAt = (x: number, y: number): number => {
    const sc = scratch.current;
    let best = -1;
    let bestDepth = -Infinity;
    for (let q = 0; q < n * SEG; q += 1) {
      const b = q * 10;
      const depth = sc.hit[b + 9] as number;
      if (depth <= bestDepth) continue;
      // An edge-on piece has no area to hit.
      const area =
        ((sc.hit[b + 5] as number) - (sc.hit[b + 1] as number)) *
          ((sc.hit[b + 8] as number) - (sc.hit[b + 4] as number)) -
        ((sc.hit[b + 6] as number) - (sc.hit[b + 2] as number)) *
          ((sc.hit[b + 7] as number) - (sc.hit[b + 3] as number));
      if (Math.abs(area) < 1) continue;
      // Inside the quad: same side of all four edges.
      let sign = 0;
      let inside = true;
      for (let e = 0; e < 4; e += 1) {
        const x0 = sc.hit[b + 1 + e * 2] as number;
        const y0 = sc.hit[b + 2 + e * 2] as number;
        const e2 = (e + 1) % 4;
        const x1 = sc.hit[b + 1 + e2 * 2] as number;
        const y1 = sc.hit[b + 2 + e2 * 2] as number;
        const cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
        if (Math.abs(cross) < 1e-9) continue;
        const sg = cross > 0 ? 1 : -1;
        if (sign === 0) sign = sg;
        else if (sg !== sign) {
          inside = false;
          break;
        }
      }
      if (!inside) continue;
      best = sc.hit[b] as number;
      bestDepth = depth;
    }
    return best;
  };

  /** The nearest band within a few pixels, for taps on thin, edge-on rings. */
  const ringNear = (x: number, y: number): number => {
    const hit = ringAt(x, y);
    if (hit >= 0) return hit;
    for (const [dx, dy] of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
    ] as const) {
      const r = ringAt(x + dx, y + dy);
      if (r >= 0) return r;
    }
    return -1;
  };

  const local = (clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  const dragStart = React.useRef({ yaw: 0, pitch: 0, touch: false });

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ event }) => {
      const st = sim.current;
      st.drag = true;
      st.v = 0;
      st.pv = 0;
      dragStart.current = {
        yaw: st.yaw,
        pitch: st.pitch,
        touch: event.pointerType === "touch",
      };
      kick();
    },
    onMove: ({ offset }) => {
      const st = sim.current;
      const per = 1 / Math.max(1, geo.current.s) / RAD;
      st.yaw = dragStart.current.yaw + offset.x * per;
      if (!dragStart.current.touch) {
        st.pitch = clamp(dragStart.current.pitch + offset.y * per, -55, 55);
      }
      kick();
    },
    onEnd: ({ velocity }) => {
      const st = sim.current;
      st.drag = false;
      if (motionSafe) {
        const per = 1 / Math.max(1, geo.current.s) / RAD;
        st.v = velocity.x * per;
        st.pv = dragStart.current.touch ? 0 : velocity.y * per * 0.5;
      }
      kick();
    },
    onCancel: () => {
      sim.current.drag = false;
      kick();
    },
    onTap: (event) => {
      const p = local(event.clientX, event.clientY);
      const ring = ringNear(p.x, p.y);
      choose(ring < 0 || ring === current ? null : ring);
    },
  });

  const onStageKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const st = sim.current;
    // A throw that comes to rest a step on: distance = v / friction rate.
    const throwBy = (deg: number) => {
      if (!motionSafe) {
        st.yaw += deg;
        api.current?.draw();
        return;
      }
      st.v += deg * k.fr;
      kick();
    };
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        throwBy(-15);
        break;
      case "ArrowRight":
      case "ArrowUp":
        throwBy(15);
        break;
      case "PageUp":
        throwBy(90);
        break;
      case "PageDown":
        throwBy(-90);
        break;
      case "Home": {
        const back = -(((st.yaw % 360) + 360) % 360);
        throwBy(back < -180 ? back + 360 : back);
        break;
      }
      case "Escape":
        if (current === null) return;
        choose(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onPlatesKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let to = -1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = (plate + 1) % n;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = (plate - 1 + n) % n;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      case "Escape":
        if (current === null) return;
        event.preventDefault();
        choose(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    setPlate(to);
    plates.current[to]?.focus();
  };

  const hover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || sim.current.drag || disabled) return;
    const p = local(event.clientX, event.clientY);
    const ring = ringNear(p.x, p.y);
    if (ring !== sim.current.hover) {
      sim.current.hover = ring;
      event.currentTarget.style.cursor = ring >= 0 ? "pointer" : "";
      api.current?.draw();
    }
  };

  const strokeW = r3(BAND * 0.9);

  return (
    <div className={cn("relative flex w-full flex-col gap-2", className)}>
      <div
        ref={bindStage}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={YAW0}
        aria-valuetext={`Turned ${YAW0} degrees`}
        aria-disabled={disabled || undefined}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          hover(event);
        }}
        onPointerLeave={() => {
          if (sim.current.hover !== -1) {
            sim.current.hover = -1;
            api.current?.draw();
          }
        }}
        onKeyDown={onStageKey}
        className={cn(
          "relative w-full touch-pan-y rounded-3 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-default opacity-60"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ height: Math.round(clamp(height, 120, 640)) }}
      >
        {/* The resting pose as outlines: the server's frame, under the canvas. */}
        <svg
          aria-hidden
          viewBox="-1.19 -1.19 2.38 2.38"
          className={cn(
            "pointer-events-none absolute inset-0 size-full transition-opacity duration-300",
            live && "opacity-0",
          )}
        >
          {still.map((ring, i) => (
            <ellipse
              key={i}
              cx={0}
              cy={0}
              rx={ring.r}
              ry={ring.ry}
              transform={`rotate(${ring.angle})`}
              fill="none"
              stroke={metal.base}
              strokeWidth={r3(strokeW * 0.55)}
              opacity={0.85}
            />
          ))}
          {globe ? (
            <>
              <line
                x1={0}
                y1={-1.1}
                x2={0}
                y2={1.1}
                stroke={metal.dark}
                strokeWidth={0.02}
                opacity={0.7}
              />
              <circle cx={0} cy={0} r={0.2} fill={metal.dark} opacity={0.7} />
            </>
          ) : null}
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
      </div>
      <div
        role="toolbar"
        aria-label="Rings"
        onKeyDown={onPlatesKey}
        className="flex flex-wrap items-center justify-center gap-1.5"
      >
        {texts.map((line, i) => {
          const on = current === i;
          return (
            <button
              key={i}
              ref={(node) => {
                plates.current[i] = node;
              }}
              type="button"
              tabIndex={i === (current ?? plate) ? 0 : -1}
              aria-pressed={on}
              aria-label={`Ring ${i + 1}: ${lines[i % Math.max(1, lines.length)] ?? line}`}
              title={lines[i % Math.max(1, lines.length)] ?? line}
              disabled={disabled}
              onFocus={(event) => {
                setPlate(i);
                // Tabbing to a plate turns its ring to face you.
                if (event.currentTarget.matches(":focus-visible") && !on) {
                  choose(i);
                }
              }}
              onClick={() => choose(on ? null : i)}
              className={cn(
                "inline-flex h-6 min-w-7 items-center justify-center rounded-full border px-2 font-mono text-[10px] tracking-[0.06em] transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed disabled:opacity-50",
                on
                  ? "border-transparent text-[oklch(0.25_0.04_70)]"
                  : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
              style={on ? { background: metal.base } : undefined}
            >
              {NUMERALS[i]}
            </button>
          );
        })}
      </div>
      <span id={hintId} className="sr-only">
        Drag or use Left and Right to turn the sphere. Choose a ring below to
        turn it to face you; Escape lets it go.
      </span>
    </div>
  );
}
