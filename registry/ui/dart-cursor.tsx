"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type DartCursorTone = "paper" | "kraft" | "cobalt" | "ink";

export type DartCursorProps = {
  /** The area the dart flies in. Its buttons and links keep every click, focus and key. */
  children?: React.ReactNode;
  /** The dart's length, px. @default 26 */
  size?: number;
  /** How far it rolls into a turn, 0 (flat turns) to 1 (steep, knife-edge rolls). @default 0.7 */
  bank?: number;
  /** How long its wingtip trails last, seconds; 0 draws none. @default 1.2 */
  trail?: number;
  /** The paper: a named tone from the theme, or any CSS colour. @default "paper" */
  color?: DartCursorTone | (string & {});
  /** Circle fast and it loops the loop. @default true */
  loop?: boolean;
  /** A lifted finger or a pointer that leaves throws the dart on, to glide and land. @default true */
  glide?: boolean;
  /** How quickly a glide bleeds its speed, 0 (floaty) to 1 (heavy). @default 0.5 */
  drag?: number;
  /** How high speed carries it, 0 to 1: its shadow falls further below a fast dart. @default 0.5 */
  lift?: number;
  /** Where it sits landed before anyone points, as fractions of the box. @default [0.86, 0.72] */
  restAt?: [number, number];
  /** Which way it points while landed, degrees (0 is right, -90 up). @default -150 */
  restHeading?: number;
  /** Children it flies to when they take keyboard focus, as a CSS selector. @default "a[href], button, input, select, textarea, [role='button'], [tabindex]:not([tabindex='-1'])" */
  targets?: string;
  /** Keyboard focus on a child flies the dart to it; Enter or Space there loops. @default true */
  followFocus?: boolean;
  /** Hide the system cursor while the dart leads (never over text fields, never after a key). @default true */
  hideCursor?: boolean;
  /** The pointer and touch fly the dart. @default true */
  interactive?: boolean;
  /** It looped the loop. */
  onLoop?: () => void;
  /** It touched down after a glide or a flight. */
  onLand?: () => void;
  /** Classes for the box. */
  className?: string;
};

const TONES: Record<
  DartCursorTone,
  { top: string; under: string; edge: string }
> = {
  // Paper is pigment: the same sheet on a light page or a dark one.
  paper: {
    top: "oklch(from var(--ink) 0.985 0.004 h)",
    under: "oklch(from var(--ink) 0.86 0.012 h)",
    edge: "oklch(from var(--ink) 0.5 0.02 h)",
  },
  kraft: {
    top: "oklch(from var(--warn) 0.8 0.06 calc(h - 18))",
    under: "oklch(from var(--warn) 0.66 0.06 calc(h - 18))",
    edge: "oklch(from var(--warn) 0.42 0.05 calc(h - 18))",
  },
  cobalt: {
    top: "oklch(from var(--accent) 0.66 0.15 h)",
    under: "oklch(from var(--accent) 0.5 0.13 h)",
    edge: "oklch(from var(--accent) 0.32 0.08 h)",
  },
  ink: {
    top: "oklch(from var(--ink) 0.34 0.02 h)",
    under: "oklch(from var(--ink) 0.24 0.02 h)",
    edge: "oklch(from var(--ink) 0.14 0.02 h)",
  },
};

const DEFAULT_TARGETS =
  "a[href], button, input, select, textarea, [role='button'], [tabindex]:not([tabindex='-1'])";

/** The paper dart in its own frame, in lengths: x forward, y to the right wing, z up. */
const MODEL = {
  nose: [0.55, 0, 0],
  left: [-0.45, -0.4, 0.07],
  right: [-0.45, 0.4, 0.07],
  tail: [-0.45, 0, 0],
  keel: [-0.3, 0, -0.15],
  foldL: [-0.45, -0.17, 0.02],
  foldR: [-0.45, 0.17, 0.02],
} as const;
type Vec = readonly [number, number, number];

/** Faces as vertex names; each is drawn with its own shade, the underside darker. */
const FACES: readonly (readonly (keyof typeof MODEL)[])[] = [
  ["nose", "tail", "left"],
  ["nose", "right", "tail"],
  ["nose", "keel", "tail"],
];

const LOOP_TIME = 0.7;
const LOOP_COOLDOWN = 1.2;
const G = 2600;
const TRAIL_SAMPLES = 160;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const wrap = (a: number) => {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
};
const easeInOut = (u: number) =>
  u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

type Pose = { yaw: number; pitch: number; roll: number; alt: number };

/** Projects the model for a pose: screen offsets from the dart's centre, depth, and each face's facing. */
function project(pose: Pose, length: number) {
  const cy = Math.cos(pose.yaw);
  const sy = Math.sin(pose.yaw);
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  const cr = Math.cos(pose.roll);
  const sr = Math.sin(pose.roll);
  // Body axes: forward, right wing, up (toward the viewer), after yaw, pitch, roll.
  const f0: Vec = [cy, sy, 0];
  const r0: Vec = [-sy, cy, 0];
  const u0: Vec = [0, 0, 1];
  const f: Vec = [
    f0[0] * cp + u0[0] * sp,
    f0[1] * cp + u0[1] * sp,
    f0[2] * cp + u0[2] * sp,
  ];
  const u1: Vec = [
    u0[0] * cp - f0[0] * sp,
    u0[1] * cp - f0[1] * sp,
    u0[2] * cp - f0[2] * sp,
  ];
  const r: Vec = [
    r0[0] * cr - u1[0] * sr,
    r0[1] * cr - u1[1] * sr,
    r0[2] * cr - u1[2] * sr,
  ];
  const u: Vec = [
    u1[0] * cr + r0[0] * sr,
    u1[1] * cr + r0[1] * sr,
    u1[2] * cr + r0[2] * sr,
  ];
  const lift = 1 + pose.alt / 260;
  const out = {} as Record<keyof typeof MODEL, [number, number, number]>;
  for (const key of Object.keys(MODEL) as (keyof typeof MODEL)[]) {
    const [x, y, z] = MODEL[key];
    const wx = (x * f[0] + y * r[0] + z * u[0]) * length;
    const wy = (x * f[1] + y * r[1] + z * u[1]) * length;
    const wz = (x * f[2] + y * r[2] + z * u[2]) * length;
    // A mild perspective: what is nearer the viewer is a little larger.
    const k = lift * (1 + wz / 420);
    out[key] = [wx * k, wy * k, wz];
  }
  return out;
}

type Projected = ReturnType<typeof project>;

/** Each face's outline, its depth and how lit it is, in paint order. */
function faces(p: Projected) {
  // Toward the light: up and to the left, above the page.
  const light: Vec = [-0.42, -0.52, 0.74];
  return FACES.map((names, index) => {
    const pts = names.map((n) => p[n]);
    const a: Vec = p[names[0] ?? "nose"];
    const b: Vec = p[names[1] ?? "tail"];
    const c: Vec = p[names[2] ?? "left"];
    const e1: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    // The faces wind so their top side's normal points at the viewer (+z)
    // in level flight; a face showing its underside has turned over. The
    // keel is paper on both sides and always shows its outer face.
    const top = index === 2 ? true : nz >= 0;
    const sign = index === 2 ? (nz >= 0 ? 1 : -1) : top ? 1 : -1;
    const lit = Math.max(
      0,
      sign * (nx * light[0] + ny * light[1] + nz * light[2]),
    );
    const depth = (a[2] + b[2] + c[2]) / 3;
    return {
      index,
      top,
      shade: clamp(0.92 - lit, 0, 1),
      depth,
      points: pts.map((q) => `${r1(q[0])},${r1(q[1])}`).join(" "),
    };
  }).sort((x, y) => x.depth - y.depth);
}

/** The flat silhouette its shadow casts on the page. */
function silhouette(p: Projected) {
  const order: (keyof typeof MODEL)[] = ["nose", "right", "tail", "left"];
  return order.map((k) => `${r1(p[k][0])},${r1(p[k][1])}`).join(" ");
}

type Config = {
  size: number;
  bank: number;
  trail: number;
  loop: boolean;
  glide: boolean;
  drag: number;
  lift: number;
  restAt: [number, number];
  restHeading: number;
  targets: string;
  followFocus: boolean;
  hideCursor: boolean;
  interactive: boolean;
  motionSafe: boolean;
};

type Report = {
  onLoop?: () => void;
  onLand?: () => void;
};

type Parts = {
  root: HTMLDivElement;
  craft: HTMLDivElement;
  shadow: SVGPolygonElement;
  shadowSvg: SVGSVGElement;
  slots: SVGPolygonElement[];
  shades: SVGPolygonElement[];
  crease: SVGLineElement;
  trail: HTMLCanvasElement;
  ink: HTMLSpanElement;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  touchMove: (clientX: number, clientY: number, first: boolean) => void;
  touchEnd: () => void;
  dispose: () => void;
};

function createDart(parts: Parts, report: { current: Report }): Engine {
  const { root, craft, shadow, shadowSvg, slots, shades, crease, trail, ink } =
    parts;
  const tctx = trail.getContext("2d");
  let cfg: Config | null = null;
  const box = { w: 0, h: 0, dpr: 1 };
  type Mode = "rest" | "follow" | "glide" | "flight";
  let mode: Mode = "rest";
  // The nose, where the cursor's hot spot is.
  const pos = { x: 0, y: 0, vx: 0, vy: 0, speed: 0, accel: 0 };
  const pointer = {
    x: 0,
    y: 0,
    t: 0,
    inside: false,
    touch: false,
    down: false,
  };
  // A take-off: the nose closes on the pointer from wherever it sat.
  const gap = { x: 0, y: 0, vx: 0, vy: 0 };
  const spin = {
    yaw: 0,
    yawV: 0,
    roll: 0,
    rollV: 0,
    pitch: 0,
    pitchV: 0,
    alt: 0,
    altV: 0,
  };
  let yawTarget = 0;
  const loopState = { at: -1, last: -1e9 };
  const turns: number[] = [];
  const flight = {
    fx: 0,
    fy: 0,
    cx: 0,
    cy: 0,
    tx: 0,
    ty: 0,
    at: 0,
    dur: 0.5,
    heading: 0,
  };
  // Wingtip trail: [lx, ly, rx, ry, time] per sample, a ring.
  const tips = new Float32Array(TRAIL_SAMPLES * 5);
  let tipHead = 0;
  let tipCount = 0;
  let inkColour = "rgb(120, 125, 135)";
  let keyboard = false;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let visible = false;
  let disposed = false;
  let placed = false;
  let drawnKey = "";

  const L = () => clamp(cfg?.size ?? 26, 10, 80);
  const B = () => Math.round(L() * 3.2);

  const readInk = () => {
    inkColour = getComputedStyle(ink).color || inkColour;
  };

  const setCursor = () => {
    const c = cfg;
    const on =
      !!c &&
      c.hideCursor &&
      c.interactive &&
      pointer.inside &&
      !pointer.touch &&
      !keyboard;
    if (on) root.dataset.dart = "on";
    else delete root.dataset.dart;
  };

  const restPoint = () => {
    const c = cfg;
    const m = L() * 0.7;
    return {
      x: clamp((c?.restAt[0] ?? 0.86) * box.w, m, Math.max(m, box.w - m)),
      y: clamp((c?.restAt[1] ?? 0.72) * box.h, m, Math.max(m, box.h - m)),
    };
  };

  const toRest = () => {
    const p = restPoint();
    pos.x = p.x;
    pos.y = p.y;
    pos.vx = 0;
    pos.vy = 0;
    pos.speed = 0;
    const heading = ((cfg?.restHeading ?? -150) * Math.PI) / 180;
    spin.yaw = heading;
    yawTarget = heading;
    spin.yawV = 0;
    spin.roll = 0;
    spin.rollV = 0;
    spin.pitch = 0;
    spin.pitchV = 0;
    spin.alt = 0;
    spin.altV = 0;
    mode = "rest";
  };

  /** One damped spring step toward a target, with the house constants; the result lands in `out`, so a frame allocates nothing. */
  const out = { v: 0, w: 0 };
  const spring = (
    value: number,
    vel: number,
    target: number,
    s: { stiffness: number; damping: number; mass: number },
    dt: number,
  ) => {
    let v = value;
    let w = vel;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i += 1) {
      w += ((s.stiffness * (target - v) - s.damping * w) / s.mass) * h;
      v += w * h;
    }
    out.v = v;
    out.w = w;
  };

  const land = () => {
    mode = "rest";
    pos.vx = 0;
    pos.vy = 0;
    report.current.onLand?.();
  };

  const startLoop = () => {
    if (!cfg || !cfg.loop || !cfg.motionSafe) return;
    if (loopState.at >= 0 || clock - loopState.last < LOOP_COOLDOWN) return;
    loopState.at = clock;
    loopState.last = clock;
    turns.length = 0;
    report.current.onLoop?.();
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const motion = c.motionSafe;
    const prevX = pos.x;
    const prevY = pos.y;
    if (mode === "follow") {
      const px = pointer.x;
      const py = pointer.y - (pointer.touch ? L() * 1.1 : 0);
      if (motion) {
        spring(gap.x, gap.vx, 0, springs.snap, dt);
        gap.x = out.v;
        gap.vx = out.w;
        spring(gap.y, gap.vy, 0, springs.snap, dt);
        gap.y = out.v;
        gap.vy = out.w;
      } else {
        gap.x = 0;
        gap.y = 0;
      }
      pos.x = px + gap.x;
      pos.y = py + gap.y;
    } else if (mode === "glide") {
      // Thrown: speed bleeds away, and near an edge it banks back inward.
      const decay = Math.exp(-dt * (0.45 + 1.9 * clamp(c.drag, 0, 1)));
      pos.vx *= decay;
      pos.vy *= decay;
      const margin = Math.min(90, Math.min(box.w, box.h) * 0.35);
      const near = Math.min(pos.x, box.w - pos.x, pos.y, box.h - pos.y);
      const steer = clamp((margin - near) / margin, 0, 1);
      if (steer > 0) {
        const tx = box.w / 2 - pos.x;
        const ty = box.h / 2 - pos.y;
        const cross = pos.vx * ty - pos.vy * tx;
        const w = Math.sign(cross) * steer * 4.2;
        const ca = Math.cos(w * dt);
        const sa = Math.sin(w * dt);
        const vx = pos.vx * ca - pos.vy * sa;
        pos.vy = pos.vx * sa + pos.vy * ca;
        pos.vx = vx;
      }
      pos.x = clamp(pos.x + pos.vx * dt, L() * 0.5, box.w - L() * 0.5);
      pos.y = clamp(pos.y + pos.vy * dt, L() * 0.5, box.h - L() * 0.5);
      if (Math.hypot(pos.vx, pos.vy) < 70) land();
    } else if (mode === "flight") {
      const u = clamp((clock - flight.at) / flight.dur, 0, 1);
      const e = easeInOut(u);
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const d = e * e;
      pos.x = a * flight.fx + b * flight.cx + d * flight.tx;
      pos.y = a * flight.fy + b * flight.cy + d * flight.ty;
      if (u >= 1) {
        yawTarget = flight.heading;
        land();
      }
    }
    // Velocity from the nose's own travel, eased over ~50 ms.
    if (mode !== "glide" && dt > 0) {
      const k = 1 - Math.exp(-dt / 0.05);
      pos.vx += ((pos.x - prevX) / dt - pos.vx) * k;
      pos.vy += ((pos.y - prevY) / dt - pos.vy) * k;
      if (mode === "rest") {
        pos.vx *= Math.exp(-dt / 0.06);
        pos.vy *= Math.exp(-dt / 0.06);
      }
    }
    const speed = Math.hypot(pos.vx, pos.vy);
    if (dt > 0)
      pos.accel +=
        ((speed - pos.speed) / dt - pos.accel) * (1 - Math.exp(-dt / 0.08));
    pos.speed = speed;

    // Heading: the nose points where it flies.
    if (speed > 40) yawTarget = Math.atan2(pos.vy, pos.vx);
    const before = spin.yaw;
    if (motion) {
      const d = wrap(yawTarget - spin.yaw);
      let v = spin.yawV;
      let off = -d;
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i += 1) {
        v +=
          ((springs.snap.stiffness * -off - springs.snap.damping * v) /
            springs.snap.mass) *
          h;
        off += v * h;
      }
      spin.yaw = wrap(yawTarget + off);
      spin.yawV = v;
    } else {
      spin.yaw = yawTarget;
      spin.yawV = 0;
    }
    const turnRate = dt > 0 ? wrap(spin.yaw - before) / dt : 0;

    // Bank: the coordinated-turn roll, scaled by `bank`, rolled on the snap spring.
    const rollTarget = motion
      ? clamp(Math.atan((speed * turnRate) / G) * 1.15, -1.3, 1.3) *
        clamp(c.bank, 0, 1)
      : 0;
    // Nose: dips as it slows, lifts a little as it speeds up.
    const slowing = Math.max(0, -pos.accel);
    const quickening = Math.max(0, pos.accel);
    const pitchTarget = motion
      ? clamp(-slowing * 0.0007, -0.55, 0) +
        clamp(quickening * 0.00025, 0, 0.14)
      : 0;
    const altTarget =
      motion && mode !== "rest"
        ? clamp(speed / 900, 0, 1) * 22 * clamp(c.lift, 0, 1)
        : 0;
    if (motion) {
      spring(spin.roll, spin.rollV, rollTarget, springs.snap, dt);
      spin.roll = out.v;
      spin.rollV = out.w;
      spring(spin.pitch, spin.pitchV, pitchTarget, springs.glide, dt);
      spin.pitch = out.v;
      spin.pitchV = out.w;
      spring(spin.alt, spin.altV, altTarget, springs.drift, dt);
      spin.alt = out.v;
      spin.altV = out.w;
    } else {
      spin.roll = 0;
      spin.pitch = 0;
      spin.alt = 0;
    }

    // Circling fast: more than a full turn of heading within 750 ms.
    if (motion && c.loop && speed > 380 && dt > 0) {
      turns.push(clock, turnRate * dt);
      while (turns.length > 2 && clock - (turns[0] ?? clock) > 0.75)
        turns.splice(0, 2);
      let sum = 0;
      for (let i = 1; i < turns.length; i += 2) sum += turns[i] ?? 0;
      if (Math.abs(sum) > Math.PI * 1.85) startLoop();
    } else if (speed < 200) turns.length = 0;
  };

  const loopPhase = () => {
    if (loopState.at < 0) return 0;
    const u = (clock - loopState.at) / LOOP_TIME;
    if (u >= 1) {
      loopState.at = -1;
      return 0;
    }
    return easeInOut(u);
  };

  // The wingtips' offsets from the centre, kept from the last projection.
  const tipOffset = { lx: 0, ly: 0, rx: 0, ry: 0 };

  const render = () => {
    const c = cfg;
    if (!c || box.w <= 0) return;
    const length = L();
    const phase = loopPhase();
    const pitch = spin.pitch + phase * Math.PI * 2;
    const alt = spin.alt + Math.sin(Math.PI * phase) * 30;
    // The nose sits on the pointer: place the centre behind it along the heading.
    const cx = pos.x - Math.cos(spin.yaw) * MODEL.nose[0] * length;
    const cy = pos.y - Math.sin(spin.yaw) * MODEL.nose[0] * length;
    const size = B();
    craft.style.transform = `translate3d(${r1(cx - size / 2)}px, ${r1(cy - size / 2)}px, 0)`;
    const key = `${r2(spin.yaw)}|${r2(pitch)}|${r2(spin.roll)}|${r1(alt)}|${length}`;
    if (key !== drawnKey) {
      drawnKey = key;
      const pose: Pose = { yaw: spin.yaw, pitch, roll: spin.roll, alt };
      const p = project(pose, length);
      const list = faces(p);
      list.forEach((f, k) => {
        const slot = slots[k];
        const shade = shades[k];
        if (!slot || !shade) return;
        slot.setAttribute("points", f.points);
        shade.setAttribute("points", f.points);
        slot.style.fill = f.top ? "var(--dart-top)" : "var(--dart-under)";
        shade.setAttribute(
          "fill-opacity",
          String(r3(f.shade * (f.top ? 0.42 : 0.3))),
        );
      });
      const showCrease = Math.abs(pose.roll) < 1.2 && Math.cos(pose.pitch) > 0;
      crease.setAttribute("x1", String(r1(p.nose[0])));
      crease.setAttribute("y1", String(r1(p.nose[1])));
      crease.setAttribute("x2", String(r1(p.tail[0])));
      crease.setAttribute("y2", String(r1(p.tail[1])));
      crease.setAttribute("stroke-opacity", showCrease ? "0.35" : "0");
      shadow.setAttribute(
        "points",
        silhouette(project({ ...pose, alt: 0 }, length)),
      );
      tipOffset.lx = p.left[0];
      tipOffset.ly = p.left[1];
      tipOffset.rx = p.right[0];
      tipOffset.ry = p.right[1];
    }
    // The shadow falls down and right of the dart, further and softer the higher it flies.
    const high = Math.max(0, alt);
    shadowSvg.style.transform = `translate3d(${r1(cx - size / 2 + 2 + high * 0.5)}px, ${r1(cy - size / 2 + 3 + high * 0.75)}px, 0)`;
    shadowSvg.style.opacity = String(r3(clamp(0.2 - high * 0.003, 0.07, 0.2)));

    // Wingtip trails: sample when the tips move, draw fading by age.
    const lx = cx + tipOffset.lx;
    const ly = cy + tipOffset.ly;
    const rx = cx + tipOffset.rx;
    const ry = cy + tipOffset.ry;
    const lastAt = ((tipHead - 1 + TRAIL_SAMPLES) % TRAIL_SAMPLES) * 5;
    if (
      c.trail > 0 &&
      mode !== "rest" &&
      (tipCount === 0 ||
        Math.hypot(lx - (tips[lastAt] ?? 0), ly - (tips[lastAt + 1] ?? 0)) >
          1.5)
    ) {
      const at = tipHead * 5;
      tips[at] = lx;
      tips[at + 1] = ly;
      tips[at + 2] = rx;
      tips[at + 3] = ry;
      tips[at + 4] = clock;
      tipHead = (tipHead + 1) % TRAIL_SAMPLES;
      tipCount = Math.min(TRAIL_SAMPLES, tipCount + 1);
    }
    drawTrail();
    root.setAttribute("data-live", "");
  };

  let trailAlive = false;
  const drawTrail = () => {
    if (!tctx) return;
    const d = box.dpr;
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, trail.width, trail.height);
    trailAlive = false;
    const life = cfg?.trail ?? 0;
    if (life <= 0 || tipCount < 2) return;
    tctx.setTransform(d, 0, 0, d, 0, 0);
    tctx.strokeStyle = inkColour;
    tctx.lineWidth = 1;
    tctx.lineCap = "round";
    for (let side = 0; side < 2; side += 1) {
      for (let n = tipCount - 1; n >= 1; n -= 1) {
        const a = ((tipHead - 1 - n + TRAIL_SAMPLES * 2) % TRAIL_SAMPLES) * 5;
        const b = ((tipHead - n + TRAIL_SAMPLES * 2) % TRAIL_SAMPLES) * 5;
        const age = clock - (tips[b + 4] ?? 0);
        if (age > life) continue;
        trailAlive = true;
        const k = 1 - age / life;
        tctx.globalAlpha = 0.32 * k * k;
        tctx.beginPath();
        tctx.moveTo(tips[a + side * 2] ?? 0, tips[a + side * 2 + 1] ?? 0);
        tctx.lineTo(tips[b + side * 2] ?? 0, tips[b + side * 2 + 1] ?? 0);
        tctx.stroke();
      }
    }
    tctx.globalAlpha = 1;
  };

  const settled = () => {
    if (mode === "glide" || mode === "flight" || loopState.at >= 0)
      return false;
    if (performance.now() - pointer.t < 150) return false;
    if (trailAlive) return false;
    if (mode === "follow" && (Math.abs(gap.x) > 0.3 || Math.abs(gap.y) > 0.3))
      return false;
    return (
      Math.abs(spin.yawV) < 0.02 &&
      Math.abs(wrap(yawTarget - spin.yaw)) < 0.003 &&
      Math.abs(spin.roll) < 0.003 &&
      Math.abs(spin.rollV) < 0.02 &&
      Math.abs(spin.pitch) < 0.003 &&
      Math.abs(spin.pitchV) < 0.02 &&
      Math.abs(spin.alt) < 0.1 &&
      Math.abs(spin.altV) < 0.2 &&
      pos.speed < 2
    );
  };

  const canRun = () => visible && !document.hidden && !disposed;

  const tick = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    step(dt);
    render();
    if (canRun() && !settled()) raf = requestAnimationFrame(tick);
  };

  const wake = () => {
    if (raf || !canRun()) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const local = (clientX: number, clientY: number) => {
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const takeOff = (x: number, y: number) => {
    // From wherever it sat, the nose closes on the pointer on the snap spring.
    gap.x = pos.x - x;
    gap.y = pos.y - y;
    gap.vx = 0;
    gap.vy = 0;
    mode = "follow";
  };

  const onMove = (event: PointerEvent) => {
    const c = cfg;
    if (!c || !c.interactive) return;
    // Fingers come through the drag below, never through hover.
    if (event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    pointer.x = at.x;
    pointer.y = at.y;
    pointer.t = performance.now();
    pointer.touch = event.pointerType === "touch";
    pointer.inside = true;
    if (mode !== "follow")
      takeOff(at.x, at.y - (pointer.touch ? L() * 1.1 : 0));
    keyboard = false;
    setCursor();
    wake();
  };

  const throwOn = () => {
    const c = cfg;
    if (!c) return;
    const m = L() * 0.6;
    if (c.glide && c.motionSafe) {
      if (pos.speed < 140) {
        // Let go slowly: it still has to land somewhere inside, so it is
        // nudged off gently toward the middle and glides there.
        const tx = box.w / 2 - pos.x;
        const ty = box.h / 2 - pos.y;
        const d = Math.hypot(tx, ty) || 1;
        pos.vx = pos.vx * 0.5 + (tx / d) * 200;
        pos.vy = pos.vy * 0.5 + (ty / d) * 200;
      } else {
        // Carry the throw, but never faster than a paper dart would go.
        const k = Math.min(1, 1600 / pos.speed);
        pos.vx *= k;
        pos.vy *= k;
      }
      mode = "glide";
      return;
    }
    pos.x = clamp(pos.x, m, Math.max(m, box.w - m));
    pos.y = clamp(pos.y, m, Math.max(m, box.h - m));
    mode = "rest";
  };

  const onLeave = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    pointer.inside = false;
    setCursor();
    if (mode === "follow") throwOn();
    wake();
  };

  // A finger flies it through the component's drag (useDrag): it follows
  // once the finger travels, and is thrown on when the finger lifts.
  const touchMove = (clientX: number, clientY: number, first: boolean) => {
    const c = cfg;
    if (!c || !c.interactive) return;
    const at = local(clientX, clientY);
    pointer.x = at.x;
    pointer.y = at.y;
    pointer.t = performance.now();
    pointer.touch = true;
    pointer.down = true;
    pointer.inside = true;
    if (first || mode !== "follow") takeOff(at.x, at.y - L() * 1.1);
    wake();
  };
  const touchEnd = () => {
    if (!pointer.down) return;
    pointer.down = false;
    pointer.inside = false;
    if (mode === "follow") throwOn();
    wake();
  };

  const flyTo = (el: HTMLElement) => {
    const c = cfg;
    if (!c) return;
    const r = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    const ex = r.left - b.left;
    const ey = r.top - b.top + r.height / 2;
    const m = L() * 0.6;
    // Land just left of the control, pointing at it; or right of it, when
    // there is no room on the left.
    const left = ex - L() * 0.35 > m * 1.6;
    const tx = clamp(left ? ex - 6 : ex + r.width + 6, m, box.w - m);
    const ty = clamp(ey, m, box.h - m);
    const heading = left ? 0 : Math.PI;
    if (!c.motionSafe) {
      pos.x = tx;
      pos.y = ty;
      yawTarget = heading;
      spin.yaw = heading;
      mode = "rest";
      render();
      return;
    }
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      yawTarget = heading;
      mode = "rest";
      wake();
      return;
    }
    // A banked curve: the control point stands off to the side that keeps
    // it inside the box.
    const nx = -dy / dist;
    const ny = dx / dist;
    const bulge = Math.min(dist * 0.32, 90);
    const midX = (pos.x + tx) / 2;
    const midY = (pos.y + ty) / 2;
    const side =
      midY + ny * bulge > box.h * 0.85 || midY + ny * bulge < box.h * 0.15
        ? -1
        : 1;
    flight.fx = pos.x;
    flight.fy = pos.y;
    flight.cx = clamp(midX + nx * bulge * side, m, box.w - m);
    flight.cy = clamp(midY + ny * bulge * side, m, box.h - m);
    flight.tx = tx;
    flight.ty = ty;
    flight.at = clock;
    flight.dur = clamp(dist / 900, 0.35, 0.8);
    flight.heading = heading;
    mode = "flight";
    wake();
  };

  const matchTarget = (node: EventTarget | null): HTMLElement | null => {
    if (!(node instanceof HTMLElement) || node === root) return null;
    try {
      const el = node.closest(cfg?.targets ?? DEFAULT_TARGETS);
      return el instanceof HTMLElement && root.contains(el) ? el : null;
    } catch {
      return null;
    }
  };

  const onFocusIn = (event: FocusEvent) => {
    const c = cfg;
    if (!c || !c.followFocus) return;
    const el = matchTarget(event.target);
    if (!el || !el.matches(":focus-visible")) return;
    keyboard = true;
    setCursor();
    flyTo(el);
  };
  const onKey = () => {
    if (keyboard) return;
    keyboard = true;
    setCursor();
  };
  const onClick = (event: MouseEvent) => {
    // Enter or Space on a child: a click with no pointer behind it. The dart salutes.
    if (event.detail !== 0 || !cfg?.followFocus) return;
    if (!matchTarget(event.target)) return;
    startLoop();
    wake();
  };

  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerover", onMove);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("click", onClick);
  window.addEventListener("keydown", onKey);

  const resize = () => {
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fresh = box.w === 0;
    box.w = w;
    box.h = h;
    box.dpr = dpr;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (trail.width !== bw || trail.height !== bh) {
      trail.width = bw;
      trail.height = bh;
    }
    if (fresh || mode === "rest") {
      if (!placed || mode === "rest") {
        if (!placed) toRest();
        else {
          pos.x = clamp(pos.x, L() * 0.5, w - L() * 0.5);
          pos.y = clamp(pos.y, L() * 0.5, h - L() * 0.5);
        }
      }
    }
    placed = true;
    // The engine owns the dart's place from here on.
    craft.style.left = "0px";
    craft.style.top = "0px";
    shadowSvg.style.left = "0px";
    shadowSvg.style.top = "0px";
    drawnKey = "";
    readInk();
    render();
  };

  return {
    configure: (next) => {
      const prev = cfg;
      cfg = next;
      if (
        prev &&
        mode === "rest" &&
        (prev.restAt[0] !== next.restAt[0] ||
          prev.restAt[1] !== next.restAt[1] ||
          prev.restHeading !== next.restHeading)
      ) {
        toRest();
      }
      if (!next.interactive) {
        pointer.inside = false;
        if (mode === "follow") mode = "rest";
      }
      if (!next.motionSafe) {
        loopState.at = -1;
        if (mode === "glide") mode = "rest";
      }
      setCursor();
      drawnKey = "";
      readInk();
      if (box.w > 0) {
        // The engine places the dart; a re-render must not move it back.
        craft.style.left = "0px";
        craft.style.top = "0px";
        shadowSvg.style.left = "0px";
        shadowSvg.style.top = "0px";
        render();
      }
      wake();
    },
    resize,
    setVisible: (on) => {
      visible = on;
      if (on) {
        readInk();
        wake();
      } else halt();
    },
    touchMove,
    touchEnd,
    dispose: () => {
      disposed = true;
      halt();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerover", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      delete root.dataset.dart;
    },
  };
}

/**
 * Inside its box the cursor is a folded paper dart seen from above, nose on
 * the pointer — a small 3D model (two wings with a touch of dihedral and a
 * keel folded under the spine) rotated by heading, pitch and roll each frame,
 * its faces flat-shaded from an upper-left light and its shadow falling on
 * the content below, further and softer the higher it flies. The nose
 * points where it flies on springs.snap; it banks into each turn by the
 * coordinated-turn angle, scaled by `bank`, on springs.snap; it dips its nose
 * as it slows on springs.glide and rides higher with speed on springs.drift;
 * circle it fast and it loops the loop. Two hairlines from its wingtips trail
 * behind and fade. A lifted finger or a pointer that leaves throws it on to
 * glide, turn away from the edges and land. Keyboard focus on a child flies
 * it there along a banked curve; Enter or Space on that child salutes with a
 * loop. Under reduced motion it follows 1:1 and points where it goes, with
 * no bank, loop or glide.
 */
export function DartCursor({
  children,
  size = 26,
  bank = 0.7,
  trail = 1.2,
  color = "paper",
  loop = true,
  glide = true,
  drag = 0.5,
  lift = 0.5,
  restAt = [0.86, 0.72],
  restHeading = -150,
  targets = DEFAULT_TARGETS,
  followFocus = true,
  hideCursor = true,
  interactive = true,
  onLoop,
  onLand,
  className,
}: DartCursorProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const craftRef = React.useRef<HTMLDivElement | null>(null);
  const shadowRef = React.useRef<SVGPolygonElement | null>(null);
  const shadowSvgRef = React.useRef<SVGSVGElement | null>(null);
  const slotRefs = React.useRef<(SVGPolygonElement | null)[]>([]);
  const shadeRefs = React.useRef<(SVGPolygonElement | null)[]>([]);
  const creaseRef = React.useRef<SVGLineElement | null>(null);
  const trailRef = React.useRef<HTMLCanvasElement | null>(null);
  const inkRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const tone =
    typeof color === "string" && color in TONES
      ? TONES[color as DartCursorTone]
      : {
          top: color,
          under: `color-mix(in oklab, ${color} 78%, black)`,
          edge: `color-mix(in oklab, ${color} 45%, black)`,
        };

  const cfg: Config = {
    size,
    bank,
    trail,
    loop,
    glide,
    drag,
    lift,
    restAt,
    restHeading,
    targets,
    followFocus,
    hideCursor,
    interactive,
    motionSafe,
  };
  const cfgRef = React.useRef(cfg);
  const report = React.useRef<Report>({ onLoop, onLand });
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    report.current = { onLoop, onLand };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const craft = craftRef.current;
    const shadow = shadowRef.current;
    const shadowSvg = shadowSvgRef.current;
    const crease = creaseRef.current;
    const trailCanvas = trailRef.current;
    const ink = inkRef.current;
    const slots = slotRefs.current.filter((n): n is SVGPolygonElement => !!n);
    const shades = shadeRefs.current.filter((n): n is SVGPolygonElement => !!n);
    if (
      !root ||
      !craft ||
      !shadow ||
      !shadowSvg ||
      !crease ||
      !trailCanvas ||
      !ink
    )
      return;
    const e = createDart(
      {
        root,
        craft,
        shadow,
        shadowSvg,
        slots,
        shades,
        crease,
        trail: trailCanvas,
        ink,
      },
      report,
    );
    engine.current = e;
    e.configure(cfgRef.current);
    e.resize();
    e.setVisible(visible.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // A layout effect: the engine re-places the dart before the browser paints
  // whatever a re-render wrote into its style.
  const cfgKey = JSON.stringify(cfg);
  React.useLayoutEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visible.current);
    });
    watcher.observe(node);
    const onVisibility = () =>
      engine.current?.setVisible(visible.current && !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      visible.current = false;
    };
  }, []);

  const fingers = useDrag({
    threshold: 4,
    disabled: !interactive,
    onStart: (info) =>
      engine.current?.touchMove(info.point.x, info.point.y, true),
    onMove: (info) =>
      engine.current?.touchMove(info.point.x, info.point.y, false),
    onEnd: () => engine.current?.touchEnd(),
    onCancel: () => engine.current?.touchEnd(),
  });

  // The landed dart, drawn on the server so the first paint already has it.
  const L = clamp(size, 10, 80);
  const span = Math.round(L * 3.2);
  const restPose: Pose = {
    yaw: (restHeading * Math.PI) / 180,
    pitch: 0,
    roll: 0,
    alt: 0,
  };
  const rest = project(restPose, L);
  const restFaces = faces(rest);
  const rx = clamp(restAt[0], 0, 1) * 100;
  const ry = clamp(restAt[1], 0, 1) * 100;
  const noseX = r2(-Math.cos(restPose.yaw) * MODEL.nose[0] * L - span / 2);
  const noseY = r2(-Math.sin(restPose.yaw) * MODEL.nose[0] * L - span / 2);
  const place: React.CSSProperties = {
    left: `${r2(rx)}%`,
    top: `${r2(ry)}%`,
    width: span,
    height: span,
    transform: `translate(${noseX}px, ${noseY}px)`,
  };

  return (
    <div
      ref={bindRoot}
      {...fingers}
      onPointerDown={(event) => {
        // The mouse and pen lead by hovering; only a finger flies it by dragging.
        if (event.pointerType === "touch") fingers.onPointerDown(event);
      }}
      className={cn(
        "group/dart-cursor relative isolate overflow-clip",
        "data-[dart=on]:cursor-none data-[dart=on]:[&_*]:cursor-none",
        "data-[dart=on]:[&_:is(input,textarea,select,[contenteditable])]:cursor-text",
        interactive ? "touch-pan-y" : null,
        className,
      )}
      style={
        {
          "--dart-top": tone.top,
          "--dart-under": tone.under,
        } as React.CSSProperties
      }
    >
      <div className="relative z-0 size-full">{children}</div>
      <canvas
        ref={trailRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
      />
      <span
        ref={inkRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden text-ink-3"
      />
      <svg
        ref={shadowSvgRef}
        aria-hidden
        width={span}
        height={span}
        viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
        className="pointer-events-none absolute z-10 overflow-visible"
        style={{ ...place, opacity: 0.2 }}
      >
        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={1.2} />
        </filter>
        <polygon
          ref={shadowRef}
          points={silhouette(rest)}
          fill="black"
          filter={`url(#${uid}-soft)`}
        />
      </svg>
      <div
        ref={craftRef}
        aria-hidden
        className="pointer-events-none absolute z-20"
        style={place}
      >
        <svg
          width={span}
          height={span}
          viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
          className="block overflow-visible"
          strokeLinejoin="round"
        >
          {restFaces.map((f, k) => (
            <g key={k}>
              <polygon
                ref={(node) => {
                  slotRefs.current[k] = node;
                }}
                points={f.points}
                style={{
                  fill: f.top ? "var(--dart-top)" : "var(--dart-under)",
                  stroke: tone.edge,
                }}
                strokeOpacity={0.55}
                strokeWidth={0.6}
              />
              <polygon
                ref={(node) => {
                  shadeRefs.current[k] = node;
                }}
                points={f.points}
                fill="black"
                fillOpacity={r3(f.shade * (f.top ? 0.42 : 0.3))}
              />
            </g>
          ))}
          <line
            ref={creaseRef}
            x1={r1(rest.nose[0])}
            y1={r1(rest.nose[1])}
            x2={r1(rest.tail[0])}
            y2={r1(rest.tail[1])}
            strokeWidth={0.6}
            strokeOpacity={0.35}
            strokeLinecap="round"
            style={{ stroke: tone.edge }}
          />
        </svg>
      </div>
    </div>
  );
}
