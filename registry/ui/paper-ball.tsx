"use client";

import * as React from "react";

import {
  animate,
  cancelFrame,
  frame,
  useMotionValue,
  type AnimationPlaybackControls,
  type FrameData,
  type ValueAnimationTransition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PaperBallSize = "sm" | "md" | "lg";
export type PaperBallThrow = "in" | "miss";

export type PaperBallProps = {
  /** What the note says. Wrapped to three short lines on the sheet. @default "Call the printer about Friday's proofs" */
  text?: string;
  /** The note's accessible name, before its text. @default "Discard note" */
  label?: string;
  /** The accessible name once the note is in the basket. @default "Note discarded" */
  discardedLabel?: string;
  /** Controlled: whether the note is in the basket. Setting it back to false puts a fresh note up. */
  discarded?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultDiscarded?: boolean;
  /** Fires when the ball lands in the basket (true). */
  onDiscardedChange?: (discarded: boolean) => void;
  /** Fires when a throw ends: in the basket, or at rest on the floor. */
  onThrow?: (result: PaperBallThrow) => void;
  /** Fires when the ball forms (true) and when the sheet is smoothed out again (false). */
  onCrumpleChange?: (crumpled: boolean) => void;
  /** Fires while the hold charges, with how crumpled the sheet is, in tenths. */
  onProgressChange?: (progress: number) => void;
  /** How long a hold takes to make a ball, in ms. @default 600 */
  hold?: number;
  /** How tight the ball is, 0 to 1: a loose wad (bigger, softer) to a hard, small, deeply creased ball. @default 0.8 */
  crumple?: number;
  /** The toss's height, 0 to 1: a flat line drive to a high lob. @default 0.5 */
  arc?: number;
  /** How lively the floor, walls and the basket's rim are, 0 to 1. @default 0.5 */
  bounce?: number;
  /** Gravity, in scene units per second squared (the scene is 300 wide). @default 1800 */
  gravity?: number;
  /** The crease pattern. @default 7 */
  seed?: number;
  /** The note's paper, any CSS colour; a pigment so it reads the same in both themes. @default "oklch(from var(--warn) 0.93 0.07 h)" */
  paper?: string;
  /** The note's handwriting. @default "oklch(from var(--warn) 0.36 0.07 h)" */
  ink?: string;
  /** @default "md" */
  size?: PaperBallSize;
  /** Play the crinkle of the crumple, the toss and the thud of the landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* The scene, in its own units. */
const W = 300;
const H = 180;
const FLOOR = 170;
/** Where the note hangs: its centre, and its side. */
const HX = 74;
const HY = 80;
const SIDE = 84;
const GRID = 6;
/** The basket: the middle of its mouth, the rim's height, half its mouth and base. */
const BX = 234;
const RIM = 112;
const MOUTH = 30;
const BASE = 23;
const LIP = 2.5;
/** The note hangs a few degrees off true; cos and sin of -3°, as constants. */
const COS = 0.99863;
const SIN = -0.05234;

const MAX: Record<PaperBallSize, number> = { sm: 260, md: 300, lg: 340 };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Mesh = {
  radius: number;
  /** Flat, wrinkled and balled positions of every grid point, relative to the ball's centre. */
  flat: Float64Array;
  mid: Float64Array;
  ball: Float64Array;
  tris: Int32Array;
  /** Per triangle: a seeded shade, 0 to 1. */
  shade: Float64Array;
  /** Inner mesh edges, as index pairs: the creases. */
  edges: Int32Array;
  /** The sheet's edge, in order. */
  loop: Int32Array;
};

/**
 * The note as a 6×6 grid of points. Each point knows three places: on the
 * flat sheet, on a seeded wrinkle halfway (so the sheet folds along creases
 * before it balls), and on a lumpy ball — edge points on the ball's rim,
 * inner points inside it, everything twisted — and the crumple runs a
 * quadratic curve through the three.
 */
function buildMesh(seed: number, crumple: number): Mesh {
  const rand = rng(1485 * 7919 + Math.round(seed) * 104729);
  const k = clamp(crumple, 0, 1);
  const radius = lerp(24, 14, k);
  const count = GRID * GRID;
  const flat = new Float64Array(count * 2);
  const mid = new Float64Array(count * 2);
  const ball = new Float64Array(count * 2);
  const twist = 0.5 + rand() * 0.4;
  for (let j = 0; j < GRID; j += 1) {
    for (let i = 0; i < GRID; i += 1) {
      const p = j * GRID + i;
      const lx = (i / (GRID - 1) - 0.5) * SIDE;
      const ly = (j / (GRID - 1) - 0.5) * SIDE;
      const fx = lx * COS - ly * SIN;
      const fy = lx * SIN + ly * COS;
      flat[p * 2] = fx;
      flat[p * 2 + 1] = fy;
      const edge = i === 0 || j === 0 || i === GRID - 1 || j === GRID - 1;
      let a = Math.atan2(fy, fx);
      let r: number;
      if (edge) {
        r = radius * (0.94 + (rand() - 0.5) * 0.3 * (0.4 + k));
        a += twist + (rand() - 0.5) * 0.35;
      } else {
        r = radius * (0.2 + rand() * 0.62);
        a += twist * 1.6 + (rand() - 0.5) * 1.2;
      }
      const bx = r * Math.cos(a);
      const by = r * Math.sin(a);
      ball[p * 2] = bx;
      ball[p * 2 + 1] = by;
      const jitter = 10 + 8 * k;
      mid[p * 2] = ((fx + bx) / 2) * 0.86 + (rand() - 0.5) * 2 * jitter;
      mid[p * 2 + 1] = ((fy + by) / 2) * 0.86 + (rand() - 0.5) * 2 * jitter;
    }
  }
  const tris: number[] = [];
  const shade: number[] = [];
  const edges: number[] = [];
  for (let j = 0; j < GRID - 1; j += 1) {
    for (let i = 0; i < GRID - 1; i += 1) {
      const a = j * GRID + i;
      const b = a + 1;
      const c = a + GRID + 1;
      const d = a + GRID;
      // The diagonal flips by seed, so the creases do not run in rows.
      if (rand() < 0.5) {
        tris.push(a, b, c, a, c, d);
        edges.push(a, c);
      } else {
        tris.push(a, b, d, b, c, d);
        edges.push(b, d);
      }
      shade.push(rand(), rand());
    }
  }
  for (let j = 0; j < GRID; j += 1) {
    for (let i = 0; i < GRID; i += 1) {
      const p = j * GRID + i;
      if (i < GRID - 1 && j > 0 && j < GRID - 1) edges.push(p, p + 1);
      if (j < GRID - 1 && i > 0 && i < GRID - 1) edges.push(p, p + GRID);
    }
  }
  const loop: number[] = [];
  for (let i = 0; i < GRID; i += 1) loop.push(i);
  for (let j = 1; j < GRID; j += 1) loop.push(j * GRID + GRID - 1);
  for (let i = GRID - 2; i >= 0; i -= 1) loop.push((GRID - 1) * GRID + i);
  for (let j = GRID - 2; j > 0; j -= 1) loop.push(j * GRID);
  return {
    radius,
    flat,
    mid,
    ball,
    tris: Int32Array.from(tris),
    shade: Float64Array.from(shade),
    edges: Int32Array.from(edges),
    loop: Int32Array.from(loop),
  };
}

/** Greedy wrap to `width` characters, at most three lines. */
function wrap(text: string, width = 15): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 3) {
    const kept = lines.slice(0, 3);
    kept[2] = `${(kept[2] ?? "").slice(0, width - 1)}…`;
    return kept;
  }
  return lines;
}

type Pose = {
  /** How far along the crumple the geometry is, 0 flat to 1 ball. */
  morph: number;
  /** How much crumple the shading shows (reduced motion shades a flat sheet). */
  shading: number;
  x: number;
  y: number;
  rot: number;
  lift: number;
  fade: number;
};

type Frame = {
  paper: string;
  dark: string;
  light: string;
  creases: string;
  outline: string;
  shadow: string;
  lines: string[];
  textOpacity: number;
};

const LINE_V = [0.36, 0.53, 0.7];
const TEXT_U0 = 0.12;
const TEXT_U1 = 0.88;

/** One pose of the note, as path strings and text transforms. */
function frameOf(mesh: Mesh, pose: Pose, scratch: Float64Array): Frame {
  const t = pose.morph;
  const a = (1 - t) * (1 - t);
  const b = 2 * t * (1 - t);
  const c = t * t;
  const spin = pose.rot * clamp(t, 0, 1);
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  const count = GRID * GRID;
  for (let p = 0; p < count; p += 1) {
    const rx =
      a * (mesh.flat[p * 2] ?? 0) +
      b * (mesh.mid[p * 2] ?? 0) +
      c * (mesh.ball[p * 2] ?? 0);
    const ry =
      a * (mesh.flat[p * 2 + 1] ?? 0) +
      b * (mesh.mid[p * 2 + 1] ?? 0) +
      c * (mesh.ball[p * 2 + 1] ?? 0);
    scratch[p * 2] = pose.x + rx * cs - ry * sn;
    scratch[p * 2 + 1] = pose.y - pose.lift + rx * sn + ry * cs;
  }
  const X = (p: number) => r2(scratch[p * 2] ?? 0);
  const Y = (p: number) => r2(scratch[p * 2 + 1] ?? 0);
  const shading = clamp(pose.shading, 0, 1);

  let paper = "";
  let dark = "";
  let light = "";
  for (let q = 0; q < mesh.tris.length; q += 3) {
    const i0 = mesh.tris[q] ?? 0;
    let i1 = mesh.tris[q + 1] ?? 0;
    let i2 = mesh.tris[q + 2] ?? 0;
    const cross =
      ((scratch[i1 * 2] ?? 0) - (scratch[i0 * 2] ?? 0)) *
        ((scratch[i2 * 2 + 1] ?? 0) - (scratch[i0 * 2 + 1] ?? 0)) -
      ((scratch[i1 * 2 + 1] ?? 0) - (scratch[i0 * 2 + 1] ?? 0)) *
        ((scratch[i2 * 2] ?? 0) - (scratch[i0 * 2] ?? 0));
    const flipped = cross < 0;
    // Every facet is wound the same way, so overlapping facets add up
    // under the nonzero rule instead of punching holes.
    if (flipped) {
      const swap = i1;
      i1 = i2;
      i2 = swap;
    }
    const tri = `M${X(i0)} ${Y(i0)}L${X(i1)} ${Y(i1)}L${X(i2)} ${Y(i2)}Z`;
    paper += tri;
    if (shading <= 0.001) continue;
    const s = mesh.shade[q / 3] ?? 0.5;
    if (flipped || s < 0.32) dark += tri;
    else if (s > 0.72) light += tri;
  }
  let creases = "";
  if (shading > 0.001) {
    for (let q = 0; q < mesh.edges.length; q += 2) {
      const e0 = mesh.edges[q] ?? 0;
      const e1 = mesh.edges[q + 1] ?? 0;
      creases += `M${X(e0)} ${Y(e0)}L${X(e1)} ${Y(e1)}`;
    }
  }
  let outline = "";
  let shadow = "";
  const drop = 1.6 + pose.lift * 2;
  mesh.loop.forEach((p, n) => {
    outline += `${n ? "L" : "M"}${X(p)} ${Y(p)}`;
    shadow += `${n ? "L" : "M"}${r2((scratch[p * 2] ?? 0) + drop * 0.5)} ${r2((scratch[p * 2 + 1] ?? 0) + drop)}`;
  });
  outline += "Z";
  shadow += "Z";

  // Each line of handwriting rides the sheet: an affine from where the
  // line's start, end and a point under its start have landed.
  const at = (u: number, v: number) => {
    const fu = clamp(u, 0, 1) * (GRID - 1);
    const fv = clamp(v, 0, 1) * (GRID - 1);
    const i = Math.min(GRID - 2, Math.floor(fu));
    const j = Math.min(GRID - 2, Math.floor(fv));
    const du = fu - i;
    const dv = fv - j;
    const p00 = j * GRID + i;
    const p10 = p00 + 1;
    const p01 = p00 + GRID;
    const p11 = p01 + 1;
    const mix = (o: number) =>
      (scratch[p00 * 2 + o] ?? 0) * (1 - du) * (1 - dv) +
      (scratch[p10 * 2 + o] ?? 0) * du * (1 - dv) +
      (scratch[p01 * 2 + o] ?? 0) * (1 - du) * dv +
      (scratch[p11 * 2 + o] ?? 0) * du * dv;
    return [mix(0), mix(1)] as const;
  };
  const span = (TEXT_U1 - TEXT_U0) * SIDE;
  const lines = LINE_V.map((v) => {
    const s = at(TEXT_U0, v);
    const e = at(TEXT_U1, v);
    const d = at(TEXT_U0, v + 0.1);
    const ax = (e[0] - s[0]) / span;
    const ay = (e[1] - s[1]) / span;
    const bx = (d[0] - s[0]) / (0.1 * SIDE);
    const by = (d[1] - s[1]) / (0.1 * SIDE);
    const f = (n: number) => Number(n.toFixed(3));
    return `matrix(${f(ax)} ${f(ay)} ${f(bx)} ${f(by)} ${r2(s[0])} ${r2(s[1])})`;
  });
  return {
    paper,
    dark,
    light,
    creases,
    outline,
    shadow,
    lines,
    textOpacity: r2(1 - smooth(t * 1.8)),
  };
}

type Mode =
  "flat" | "charging" | "ball" | "flying" | "returning" | "sinking" | "binned";

type Engine = {
  press: (source: "pointer" | "key") => void;
  move: (dx: number, dy: number) => void;
  release: (dragged: boolean, vx: number, vy: number) => void;
  smooth: () => boolean;
  quick: () => void;
  hover: (on: boolean) => void;
  /** The pointer was lost mid-gesture: nothing is thrown. */
  cancel: () => void;
  renew: () => void;
  bin: () => void;
  mode: () => Mode;
  reshape: () => void;
};

type Params = {
  motionSafe: boolean;
  hold: number;
  crumple: number;
  arc: number;
  bounce: number;
  gravity: number;
  seed: number;
  audio: ReturnType<typeof useTactileSound>;
  onFormed: (formed: boolean) => void;
  onProgress: (tenths: number) => void;
  onLanded: (result: PaperBallThrow) => void;
  /** Let go before the ball formed: say how it works. */
  onHint: () => void;
};

/** Where a resting ball sits inside the basket, from its radius. */
const restInBasket = (radius: number) => ({ x: BX + 3, y: FLOOR - 3 - radius });

/**
 * A discard control you crumple and throw. Press and hold the note and the
 * sheet folds inward along seeded creases into a lumpy paper ball — every
 * point of a 6×6 mesh travelling from the flat sheet through a wrinkle to
 * its spot on the ball, the facets that turn over going dark and the
 * handwriting twisting with the paper — with a crinkle at every fifth of the
 * hold. Let go early and it springs flat on springs.snap.
 *
 * Release a formed ball and it is tossed on a true ballistic arc into the
 * wire basket; drag it and it follows the finger 1:1, and letting go throws
 * it with the release velocity into a small room whose walls, floor and the
 * basket's rim lips it bounces off. A miss rolls to rest and glides back on
 * springs.glide; a ball that drops between the lips lands with a thud and
 * the basket rocks on springs.recoil. Space or Enter held crumples like a
 * press; Delete crumples and tosses in one motion; Escape smooths it out.
 * Under reduced motion the creases fade in on a flat sheet, and the ball
 * crossfades into the basket.
 */
export function PaperBall({
  text = "Call the printer about Friday's proofs",
  label = "Discard note",
  discardedLabel = "Note discarded",
  discarded,
  defaultDiscarded = false,
  onDiscardedChange,
  onThrow,
  onCrumpleChange,
  onProgressChange,
  hold = 600,
  crumple = 0.8,
  arc = 0.5,
  bounce = 0.5,
  gravity = 1800,
  seed = 7,
  paper = "oklch(from var(--warn) 0.93 0.07 h)",
  ink = "oklch(from var(--warn) 0.36 0.07 h)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: PaperBallProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const [own, setOwn] = React.useState(defaultDiscarded);
  const isDiscarded = discarded ?? own;
  const [said, setSaid] = React.useState("");
  const lines = React.useMemo(() => wrap(text), [text]);

  // The first frame is drawn on the server too, so the note is there
  // before any script runs: a flat sheet, or a ball in the basket.
  const [first] = React.useState(() => {
    const mesh = buildMesh(seed, crumple);
    const rest = restInBasket(mesh.radius);
    return frameOf(
      mesh,
      isDiscarded
        ? {
            morph: 1,
            shading: 1,
            x: rest.x,
            y: rest.y,
            rot: 0,
            lift: 0,
            fade: 1,
          }
        : { morph: 0, shading: 0, x: HX, y: HY, rot: 0, lift: 0, fade: 1 },
      new Float64Array(GRID * GRID * 2),
    );
  });
  const [startedDiscarded] = React.useState(isDiscarded);

  const rock = useMotionValue(0);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const meshRef = React.useRef<SVGGElement | null>(null);
  const paperRef = React.useRef<SVGPathElement | null>(null);
  const darkRef = React.useRef<SVGPathElement | null>(null);
  const lightRef = React.useRef<SVGPathElement | null>(null);
  const creaseRef = React.useRef<SVGPathElement | null>(null);
  const outlineRef = React.useRef<SVGPathElement | null>(null);
  const shadowRef = React.useRef<SVGPathElement | null>(null);
  const floorRef = React.useRef<SVGEllipseElement | null>(null);
  const textRefs = React.useRef<(SVGTextElement | null)[]>([]);
  const ringRef = React.useRef<SVGCircleElement | null>(null);
  const backRef = React.useRef<SVGGElement | null>(null);
  const frontRef = React.useRef<SVGGElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const shownDiscarded = React.useRef(isDiscarded);
  const keyHeld = React.useRef(false);

  const latest = React.useRef({
    onDiscardedChange,
    onThrow,
    onCrumpleChange,
    onProgressChange,
    controlled: discarded !== undefined,
  });
  React.useEffect(() => {
    latest.current = {
      onDiscardedChange,
      onThrow,
      onCrumpleChange,
      onProgressChange,
      controlled: discarded !== undefined,
    };
  });

  const params = React.useRef<Params | null>(null);
  React.useEffect(() => {
    params.current = {
      motionSafe,
      hold: Math.max(80, hold),
      crumple: clamp(crumple, 0, 1),
      arc: clamp(arc, 0, 1),
      bounce: clamp(bounce, 0, 1),
      gravity: clamp(gravity, 200, 6000),
      seed,
      audio,
      onFormed: (formed) => {
        if (formed) setSaid("Crumpled.");
        latest.current.onCrumpleChange?.(formed);
      },
      onProgress: (tenths) => latest.current.onProgressChange?.(tenths),
      onHint: () => setSaid("Hold until it balls up, then let go to toss."),
      onLanded: (result) => {
        latest.current.onThrow?.(result);
        if (result === "miss") {
          setSaid("Missed the basket.");
          return;
        }
        setSaid("Discarded.");
        shownDiscarded.current = true;
        if (!latest.current.controlled) setOwn(true);
        latest.current.onDiscardedChange?.(true);
      },
    };
  });

  React.useEffect(() => {
    const svg = svgRef.current;
    const group = meshRef.current;
    const paperPath = paperRef.current;
    const darkPath = darkRef.current;
    const lightPath = lightRef.current;
    const creasePath = creaseRef.current;
    const outlinePath = outlineRef.current;
    const shadowPath = shadowRef.current;
    const floorShadow = floorRef.current;
    const ringCircle = ringRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    if (
      !svg ||
      !group ||
      !paperPath ||
      !darkPath ||
      !lightPath ||
      !creasePath ||
      !outlinePath ||
      !shadowPath ||
      !floorShadow ||
      !ringCircle ||
      !back ||
      !front
    ) {
      return;
    }
    const P = () => params.current;
    if (!P()) return;

    let mesh = buildMesh(P()?.seed ?? 7, P()?.crumple ?? 0.8);
    const scratch = new Float64Array(GRID * GRID * 2);
    let mode: Mode = shownDiscarded.current ? "binned" : "flat";
    // The pose, in plain numbers: motion values would only add a hop.
    const rest0 = restInBasket(mesh.radius);
    const s = {
      c: mode === "binned" ? 1 : 0,
      x: mode === "binned" ? rest0.x : HX,
      y: mode === "binned" ? rest0.y : HY,
      vx: 0,
      vy: 0,
      rot: 0,
      lift: 0,
      fade: 1,
      /** Reduced motion: the geometry shown, swapped while faded out. */
      shape: mode === "binned" ? 1 : 0,
      grabX: HX,
      grabY: HY,
      dx: 0,
      dy: 0,
      ticks: 0,
      tenths: -1,
      inside: mode === "binned",
      airborne: 0,
      restFor: 0,
      lastThud: 0,
    };
    let anims: AnimationPlaybackControls[] = [];
    let queued = false;
    let looping = false;
    let autoToss = false;
    let waits: number[] = [];

    // Bumped by every stop: a stopped tween can still report finishing a
    // moment later, and a stale finish must not act.
    let epoch = 0;
    const stopAnims = () => {
      epoch += 1;
      for (const a of anims) a.stop();
      anims = [];
      autoToss = false;
    };
    const clearWaits = () => {
      for (const t of waits) window.clearTimeout(t);
      waits = [];
    };

    const paint = () => {
      const p = P();
      if (!p) return;
      const ms = p.motionSafe;
      const morph = ms ? s.c : s.shape;
      // Inside the basket the ball rocks with it, about the base.
      let x = s.x;
      let y = s.y;
      const deg = rock.get();
      if (s.inside && deg !== 0) {
        const a = (deg * Math.PI) / 180;
        const ox = x - BX;
        const oy = y - FLOOR;
        x = BX + ox * Math.cos(a) - oy * Math.sin(a);
        y = FLOOR + ox * Math.sin(a) + oy * Math.cos(a);
      }
      const f = frameOf(
        mesh,
        {
          morph,
          shading: s.c,
          x,
          y,
          rot: s.rot,
          lift: s.lift,
          fade: s.fade,
        },
        scratch,
      );
      paperPath.setAttribute("d", f.paper);
      darkPath.setAttribute("d", f.dark);
      lightPath.setAttribute("d", f.light);
      creasePath.setAttribute("d", f.creases);
      outlinePath.setAttribute("d", f.outline);
      shadowPath.setAttribute("d", f.shadow);
      const shade = clamp(s.c, 0, 1);
      darkPath.style.opacity = String(r2(shade * lerp(0.1, 0.2, p.crumple)));
      lightPath.style.opacity = String(r2(shade * 0.45));
      creasePath.style.opacity = String(
        r2(shade * lerp(0.18, 0.34, p.crumple)),
      );
      // A sheet on the wall casts a shadow on the wall; a ball, on the floor.
      shadowPath.style.opacity = String(r2((1 - smooth(morph * 1.5)) * 0.1));
      group.style.opacity = String(r2(s.fade));
      textRefs.current.forEach((node, i) => {
        if (!node) return;
        node.setAttribute("transform", f.lines[i] ?? "");
        node.style.opacity = String(f.textOpacity);
      });
      const height = clamp((FLOOR - (y + mesh.radius)) / 120, 0, 1);
      const ballness = smooth((morph - 0.6) / 0.4);
      floorShadow.setAttribute("cx", String(r2(x)));
      floorShadow.setAttribute(
        "rx",
        String(r2(mesh.radius * (1 - height * 0.4))),
      );
      floorShadow.style.opacity = String(
        r2(ballness * s.fade * (s.inside ? 0 : 0.16 * (1 - height * 0.7))),
      );
      // Reduced motion: the hold is shown as a ring filling round the note.
      const ring = !ms && (mode === "charging" || (mode === "flat" && s.c > 0));
      ringCircle.style.opacity = ring ? "1" : "0";
      ringCircle.setAttribute(
        "stroke-dashoffset",
        String(r2((1 - clamp(s.c, 0, 1)) * 2 * Math.PI * 12)),
      );
      const tilt = `rotate(${r2(deg)} ${BX} ${FLOOR})`;
      back.setAttribute("transform", tilt);
      front.setAttribute("transform", tilt);
    };
    const flush = () => {
      queued = false;
      paint();
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      frame.render(flush);
    };
    const offRock = rock.on("change", schedule);

    const play = (tone: "paper" | "thud", pitch: number, gain: number) =>
      P()?.audio.play(tone, { pitch, gain });

    // Every tween writes into the pose and asks for one paint; `done` runs
    // only when it finishes, never when something newer stops it.
    const tween = (
      from: number,
      to: number,
      options: ValueAnimationTransition<number>,
      write: (v: number) => void,
      done?: () => void,
    ) => {
      const born = epoch;
      anims.push(
        animate(from, to, {
          ...options,
          onUpdate: (n: number) => {
            write(n);
            schedule();
          },
          onComplete: done
            ? () => {
                if (born === epoch) done();
              }
            : undefined,
        }),
      );
    };

    const report = () => {
      const tenths = Math.round(clamp(s.c, 0, 1) * 10);
      if (tenths !== s.tenths) {
        s.tenths = tenths;
        P()?.onProgress(tenths);
      }
    };

    const formed = () => {
      mode = "ball";
      s.c = 1;
      report();
      P()?.onFormed(true);
      if (autoToss) {
        autoToss = false;
        engine.current?.release(false, 0, 0);
        return;
      }
      if (!P()?.motionSafe) {
        // Reduced motion: the sheet fades and the ball fades in its place.
        tween(
          1,
          0,
          { duration: durations.fast, ease: easings.exit },
          (v) => {
            s.fade = v;
          },
          () => {
            s.shape = 1;
            tween(
              0,
              1,
              { duration: durations.fast, ease: easings.enter },
              (v) => {
                s.fade = v;
              },
            );
          },
        );
      }
    };

    const charge = (fast: boolean) => {
      const p = P();
      if (!p) return;
      stopAnims();
      mode = "charging";
      const duration =
        ((fast ? Math.min(p.hold, 320) : p.hold) / 1000) *
        (1 - clamp(s.c, 0, 1));
      s.ticks = Math.floor(clamp(s.c, 0, 1) * 5);
      tween(
        s.c,
        1,
        { duration, ease: "linear" },
        (v) => {
          s.c = v;
          if (P()?.motionSafe) {
            s.x = s.grabX + s.dx * v;
            s.y = s.grabY + s.dy * v;
          }
          const tick = Math.floor(v * 5);
          if (tick > s.ticks && tick < 5) {
            s.ticks = tick;
            play("paper", 0.85 + tick * 0.1, 0.4);
          }
          report();
        },
        () => {
          if (mode === "charging") formed();
        },
      );
    };

    const smoothOut = () => {
      stopAnims();
      const wasBall = mode === "ball";
      mode = "flat";
      s.dx = 0;
      s.dy = 0;
      const p = P();
      if (!p) return;
      if (!p.motionSafe) {
        s.shape = 0;
        s.x = HX;
        s.y = HY;
        s.fade = 1;
        tween(s.c, 0, { duration: durations.fast, ease: easings.exit }, (v) => {
          s.c = v;
          report();
        });
      } else {
        const fromX = s.x;
        const fromY = s.y;
        tween(s.c, 0, springs.snap, (v) => {
          s.c = v;
          report();
        });
        tween(1, 0, springs.snap, (v) => {
          s.x = HX + (fromX - HX) * v;
          s.y = HY + (fromY - HY) * v;
        });
        tween(s.rot, 0, springs.snap, (v) => {
          s.rot = v;
        });
        tween(s.lift, 0, springs.snap, (v) => {
          s.lift = v;
        });
      }
      if (wasBall) p.onFormed(false);
    };

    // The flight: a fixed-step integrator on motion's frame loop, alive only
    // while the ball is moving.
    const STEP = 1 / 240;
    const lips = [
      { x: BX - MOUTH, y: RIM },
      { x: BX + MOUTH, y: RIM },
    ];
    const walls = [
      { ax: BX - MOUTH, ay: RIM, bx: BX - BASE, by: FLOOR, side: -1 },
      { ax: BX + MOUTH, ay: RIM, bx: BX + BASE, by: FLOOR, side: 1 },
    ];
    const thud = (impact: number, pitch: number) => {
      const now = performance.now();
      if (impact < 120 || now - s.lastThud < 90) return;
      s.lastThud = now;
      play("thud", pitch, clamp(impact / 1400, 0.15, 0.6));
    };
    const reflect = (nx: number, ny: number, e: number) => {
      const vn = s.vx * nx + s.vy * ny;
      if (vn >= 0) return 0;
      s.vx -= (1 + e) * vn * nx;
      s.vy -= (1 + e) * vn * ny;
      // A paper ball grips a little on every contact.
      const tx = -ny;
      const ty = nx;
      const vt = s.vx * tx + s.vy * ty;
      s.vx -= vt * tx * 0.12;
      s.vy -= vt * ty * 0.12;
      return -vn;
    };
    const integrate = (dt: number) => {
      const p = P();
      if (!p) return;
      const R = mesh.radius;
      const e = lerp(0.2, 0.72, p.bounce);
      const prevY = s.y;
      s.vy += p.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += (s.vx * dt) / R;
      if (s.inside) {
        // Inside: the wires hold it, the bottom catches it.
        const floor = FLOOR - 3;
        const tt = clamp((s.y - RIM) / (FLOOR - RIM), 0, 1);
        const halfW = lerp(MOUTH, BASE, tt) - LIP - R * 0.55;
        if (s.x < BX - halfW) {
          s.x = BX - halfW;
          reflect(1, 0, 0.25);
        } else if (s.x > BX + halfW) {
          s.x = BX + halfW;
          reflect(-1, 0, 0.25);
        }
        if (s.y > floor - R) {
          s.y = floor - R;
          const impact = reflect(0, -1, 0.22);
          if (impact > 60) {
            thud(Math.max(impact, 400), 0.8);
            anims.push(
              animate(rock, 0, {
                ...springs.recoil,
                velocity: clamp(s.vx * 0.06 + (s.x > BX ? 70 : -70), -140, 140),
              }),
            );
          }
          s.vx *= 0.9;
          if (Math.abs(s.vy) < 30) s.vy = 0;
        }
        return;
      }
      if (s.x < R) {
        s.x = R;
        thud(reflect(1, 0, e), 1.2);
      } else if (s.x > W - R) {
        s.x = W - R;
        thud(reflect(-1, 0, e), 1.2);
      }
      if (s.y < R) {
        s.y = R;
        reflect(0, 1, e);
      }
      if (s.y > FLOOR - R) {
        s.y = FLOOR - R;
        thud(reflect(0, -1, e), 1.3);
        s.vx *= 0.985;
        if (Math.abs(s.vy) < 50) s.vy = 0;
      }
      for (const lip of lips) {
        const dx = s.x - lip.x;
        const dy = s.y - lip.y;
        const d = Math.hypot(dx, dy);
        const reach = R + LIP;
        if (d < reach && d > 1e-6) {
          const nx = dx / d;
          const ny = dy / d;
          s.x = lip.x + nx * reach;
          s.y = lip.y + ny * reach;
          thud(reflect(nx, ny, e), 1.6);
        }
      }
      for (const wall of walls) {
        if (s.y < RIM) continue;
        const ex = wall.bx - wall.ax;
        const ey = wall.by - wall.ay;
        const len2 = ex * ex + ey * ey;
        const u = clamp(
          ((s.x - wall.ax) * ex + (s.y - wall.ay) * ey) / len2,
          0,
          1,
        );
        const qx = wall.ax + ex * u;
        const qy = wall.ay + ey * u;
        const outside = (s.x - qx) * wall.side > 0;
        if (!outside) continue;
        const dx = s.x - qx;
        const dy = s.y - qy;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1e-6) {
          const nx = dx / d;
          const ny = dy / d;
          s.x = qx + nx * R;
          s.y = qy + ny * R;
          thud(reflect(nx, ny, e), 1.4);
        }
      }
      // Through the mouth, between the lips, heading down: it is in.
      if (
        prevY < RIM &&
        s.y >= RIM &&
        s.vy > 0 &&
        s.x > BX - MOUTH + LIP &&
        s.x < BX + MOUTH - LIP
      ) {
        s.inside = true;
        mode = "sinking";
      }
    };

    const step = (data: FrameData) => {
      const dt = Math.min(0.05, Math.max(0, data.delta / 1000));
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(STEP, left);
        integrate(h);
        left -= h;
      }
      s.airborne += dt;
      const settled =
        Math.abs(s.vx) < 6 &&
        s.vy === 0 &&
        (s.inside || s.y >= FLOOR - mesh.radius - 0.01);
      s.restFor = settled ? s.restFor + dt : 0;
      schedule();
      if (s.inside && (s.restFor > 0.12 || s.airborne > 4)) {
        stopFlight();
        s.vx = 0;
        s.vy = 0;
        mode = "binned";
        P()?.onLanded("in");
        return;
      }
      if (!s.inside && (s.restFor > 0.35 || s.airborne > 3)) {
        stopFlight();
        P()?.onLanded("miss");
        goHome();
      }
    };
    const startFlight = () => {
      if (looping) return;
      looping = true;
      s.airborne = 0;
      s.restFor = 0;
      frame.update(step, true);
    };
    const stopFlight = () => {
      if (!looping) return;
      looping = false;
      cancelFrame(step);
    };

    const goHome = () => {
      mode = "returning";
      s.vx = 0;
      s.vy = 0;
      const fromX = s.x;
      const fromY = s.y;
      const fromRot = s.rot;
      tween(
        0,
        1,
        springs.glide,
        (v) => {
          s.x = lerp(fromX, HX, v);
          s.y = lerp(fromY, HY, v);
          s.rot = lerp(fromRot, 0, v);
        },
        () => {
          if (mode === "returning") {
            mode = "ball";
            s.dx = 0;
            s.dy = 0;
          }
        },
      );
    };

    const toss = () => {
      const p = P();
      if (!p) return;
      const R = mesh.radius;
      const g = p.gravity;
      const tx = BX + 2;
      const ty = RIM - 1;
      const apex = clamp(
        Math.min(s.y, ty) - lerp(6, 72, p.arc),
        R + 2,
        Math.min(s.y, ty),
      );
      const up = Math.max(0, s.y - apex);
      const vy = -Math.sqrt(2 * g * up);
      const t1 = -vy / g;
      const t2 = Math.sqrt((2 * Math.max(0, ty - apex)) / g);
      s.vx = (tx - s.x) / Math.max(0.05, t1 + t2);
      s.vy = vy;
      throwNow();
    };

    const throwNow = () => {
      stopAnims();
      mode = "flying";
      s.inside = false;
      play("paper", 1.45, 0.45);
      startFlight();
    };

    const binQuietly = () => {
      stopAnims();
      stopFlight();
      clearWaits();
      const rest = restInBasket(mesh.radius);
      mode = "binned";
      s.c = 1;
      s.shape = 1;
      s.x = rest.x;
      s.y = rest.y;
      s.vx = 0;
      s.vy = 0;
      s.inside = true;
      s.fade = 1;
      schedule();
    };

    engine.current = {
      mode: () => mode,
      press: () => {
        if (mode === "flat" || mode === "charging") {
          s.grabX = s.x;
          s.grabY = s.y;
          s.dx = 0;
          s.dy = 0;
          charge(false);
          tween(s.lift, -0.5, springs.flick, (v) => {
            s.lift = v;
          });
        } else if (mode === "ball") {
          s.grabX = s.x;
          s.grabY = s.y;
          s.dx = 0;
          s.dy = 0;
        }
      },
      move: (dx, dy) => {
        if (mode !== "charging" && mode !== "ball") return;
        if (!P()?.motionSafe) return;
        s.dx = dx;
        s.dy = dy;
        const k = mode === "ball" ? 1 : clamp(s.c, 0, 1);
        const R = mesh.radius;
        s.x = clamp(s.grabX + dx * k, R, W - R);
        s.y = clamp(s.grabY + dy * k, R, FLOOR - R);
        schedule();
      },
      release: (moved, vx, vy) => {
        const p = P();
        if (!p) return;
        if (mode === "charging") {
          smoothOut();
          p.onHint();
          return;
        }
        if (mode !== "ball") return;
        if (!p.motionSafe) {
          // Every release lands: the ball fades out here and in the basket.
          stopAnims();
          mode = "sinking";
          play("paper", 1.45, 0.45);
          tween(
            1,
            0,
            { duration: durations.base, ease: easings.exit },
            (v) => {
              s.fade = v;
            },
            () => {
              const rest = restInBasket(mesh.radius);
              s.x = rest.x;
              s.y = rest.y;
              s.inside = true;
              tween(
                0,
                1,
                { duration: durations.base, ease: easings.enter },
                (v) => {
                  s.fade = v;
                },
                () => {
                  mode = "binned";
                  play("thud", 0.8, 0.45);
                  p.onLanded("in");
                },
              );
            },
          );
          return;
        }
        tween(s.lift, 0, springs.flick, (v) => {
          s.lift = v;
        });
        if (moved && Math.hypot(s.dx, s.dy) > 8) {
          const speed = Math.hypot(vx, vy);
          const cap = 2600;
          const k = speed > cap ? cap / speed : 1;
          s.vx = vx * k;
          s.vy = vy * k;
          throwNow();
        } else {
          toss();
        }
      },
      smooth: () => {
        if (
          mode !== "charging" &&
          mode !== "ball" &&
          !(mode === "flat" && s.c > 0.01)
        ) {
          return false;
        }
        if (
          mode === "ball" &&
          (Math.abs(s.x - HX) > 1 || Math.abs(s.y - HY) > 1)
        ) {
          return false;
        }
        smoothOut();
        return true;
      },
      quick: () => {
        if (mode !== "flat" && mode !== "charging" && mode !== "ball") return;
        if (mode === "ball") {
          engine.current?.release(false, 0, 0);
          return;
        }
        s.grabX = s.x;
        s.grabY = s.y;
        s.dx = 0;
        s.dy = 0;
        // Delete is the whole gesture: crumple quickly, then toss. (The
        // flag is set after the charge, which clears it as it starts.)
        charge(true);
        autoToss = true;
      },
      hover: (on) => {
        if (mode !== "flat" || !P()?.motionSafe) return;
        tween(s.lift, on ? 1 : 0, springs.snap, (v) => {
          s.lift = v;
        });
      },
      renew: () => {
        // A fresh note goes up: the old ball fades from the basket and a
        // flat sheet fades in on the wall.
        stopAnims();
        stopFlight();
        clearWaits();
        tween(
          s.fade,
          0,
          { duration: durations.fast, ease: easings.exit },
          (v) => {
            s.fade = v;
          },
          () => {
            mode = "flat";
            s.c = 0;
            s.shape = 0;
            s.x = HX;
            s.y = HY;
            s.rot = 0;
            s.lift = 0;
            s.inside = false;
            s.tenths = -1;
            rock.jump(0);
            tween(
              0,
              1,
              { duration: durations.base, ease: easings.enter },
              (v) => {
                s.fade = v;
              },
            );
          },
        );
      },
      cancel: () => {
        if (mode === "charging") {
          smoothOut();
        } else if (mode === "ball") {
          stopAnims();
          goHome();
        }
      },
      bin: binQuietly,
      reshape: () => {
        const p = P();
        if (!p) return;
        mesh = buildMesh(p.seed, p.crumple);
        if (mode === "binned") {
          const rest = restInBasket(mesh.radius);
          s.x = rest.x;
          s.y = rest.y;
        }
        schedule();
      },
    };

    schedule();
    return () => {
      stopAnims();
      stopFlight();
      clearWaits();
      offRock();
      cancelFrame(flush);
      engine.current = null;
    };
  }, [rock]);

  React.useEffect(() => {
    engine.current?.reshape();
  }, [seed, crumple, motionSafe]);

  // A host that changes `discarded`: a fresh note, or the ball straight in.
  React.useEffect(() => {
    if (shownDiscarded.current === isDiscarded) return;
    shownDiscarded.current = isDiscarded;
    if (isDiscarded) engine.current?.bin();
    else engine.current?.renew();
  }, [isDiscarded]);

  const toScene = (px: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    return box && box.width > 0 ? (px * W) / box.width : px;
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || isDiscarded,
    onMove: ({ offset }) =>
      engine.current?.move(toScene(offset.x), toScene(offset.y)),
    onEnd: ({ velocity }) =>
      engine.current?.release(true, toScene(velocity.x), toScene(velocity.y)),
    onTap: () => engine.current?.release(false, 0, 0),
    onCancel: () => engine.current?.cancel(),
  });

  const blocked = disabled || isDiscarded;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (blocked) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat || keyHeld.current) return;
      keyHeld.current = true;
      engine.current?.press("key");
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      engine.current?.quick();
    } else if (event.key === "Escape") {
      if (engine.current?.smooth()) event.preventDefault();
    }
  };
  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (!keyHeld.current) return;
    keyHeld.current = false;
    engine.current?.release(false, 0, 0);
  };

  const wires = [-0.66, -0.33, 0, 0.33, 0.66];
  const name = isDiscarded ? discardedLabel : `${label}: ${text}`;

  return (
    <div
      className={cn("relative w-full select-none", className)}
      style={{ maxWidth: MAX[size] ?? MAX.md }}
    >
      <svg
        ref={svgRef}
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
      >
        {/* The room: a floor line and a skirting shadow. */}
        <rect
          x={0}
          y={FLOOR}
          width={W}
          height={H - FLOOR}
          className="fill-surface-2"
        />
        <line
          x1={0}
          x2={W}
          y1={FLOOR}
          y2={FLOOR}
          strokeWidth={1}
          className="stroke-hairline-strong"
        />
        {/* The pin the note hangs from. */}
        <circle cx={HX} cy={HY - SIDE / 2 + 5} r={1.4} className="fill-ink-3" />

        <ellipse
          ref={floorRef}
          cx={HX}
          cy={FLOOR}
          rx={16}
          ry={2.6}
          fill="black"
          style={{ opacity: 0 }}
        />

        {/* The basket's back: the far half of the rim and its inside. */}
        <g ref={backRef}>
          <path
            d={`M${BX - MOUTH} ${RIM}L${BX - BASE} ${FLOOR}L${BX + BASE} ${FLOOR}L${BX + MOUTH} ${RIM}Z`}
            className="fill-surface-2"
          />
          <path
            d={`M${BX - MOUTH} ${RIM}A${MOUTH} 5 0 0 1 ${BX + MOUTH} ${RIM}`}
            fill="none"
            strokeWidth={1.4}
            className="stroke-ink-3"
          />
        </g>

        <path
          ref={shadowRef}
          d={first.shadow}
          fill="black"
          style={{ opacity: startedDiscarded ? 0 : 0.1 }}
        />
        <g ref={meshRef}>
          <path
            ref={paperRef}
            d={first.paper}
            fillRule="nonzero"
            style={{ fill: paper }}
          />
          <path
            ref={darkRef}
            d={first.dark}
            fill="black"
            style={{ opacity: startedDiscarded ? 0.18 : 0 }}
          />
          <path
            ref={lightRef}
            d={first.light}
            fill="white"
            style={{ opacity: startedDiscarded ? 0.45 : 0 }}
          />
          <path
            ref={creaseRef}
            d={first.creases}
            fill="none"
            stroke="black"
            strokeWidth={0.5}
            strokeLinejoin="round"
            style={{ opacity: startedDiscarded ? 0.3 : 0 }}
          />
          <path
            ref={outlineRef}
            d={first.outline}
            fill="none"
            strokeWidth={0.6}
            strokeLinejoin="round"
            style={{ stroke: `color-mix(in oklab, ${paper} 70%, black)` }}
          />
          {lines.map((line, i) => (
            <text
              key={i}
              ref={(node) => {
                textRefs.current[i] = node;
              }}
              transform={first.lines[i]}
              fontSize={8.4}
              className="font-sans"
              style={{
                fill: ink,
                opacity: first.textOpacity,
              }}
            >
              {line}
            </text>
          ))}
        </g>

        {/* The basket's front: wires the ball shows through, and the near rim. */}
        <g ref={frontRef}>
          {wires.map((u) => (
            <line
              key={u}
              x1={r2(BX + u * MOUTH)}
              y1={RIM + 3}
              x2={r2(BX + u * BASE)}
              y2={FLOOR}
              strokeWidth={0.8}
              className="stroke-ink-3"
            />
          ))}
          <line
            x1={r2(BX - lerp(MOUTH, BASE, 0.55))}
            x2={r2(BX + lerp(MOUTH, BASE, 0.55))}
            y1={r2(lerp(RIM, FLOOR, 0.55))}
            y2={r2(lerp(RIM, FLOOR, 0.55))}
            strokeWidth={0.8}
            className="stroke-ink-3"
          />
          <path
            d={`M${BX - MOUTH} ${RIM}L${BX - BASE} ${FLOOR}L${BX + BASE} ${FLOOR}L${BX + MOUTH} ${RIM}`}
            fill="none"
            strokeWidth={1.2}
            strokeLinejoin="round"
            className="stroke-ink-3"
          />
          <path
            d={`M${BX - MOUTH} ${RIM}A${MOUTH} 5 0 0 0 ${BX + MOUTH} ${RIM}`}
            fill="none"
            strokeWidth={2}
            className="stroke-ink-2"
          />
        </g>

        <circle
          ref={ringRef}
          cx={HX}
          cy={HY}
          r={12}
          fill="none"
          strokeWidth={2}
          strokeDasharray={r2(2 * Math.PI * 12)}
          strokeDashoffset={r2(2 * Math.PI * 12)}
          strokeLinecap="round"
          transform={`rotate(-90 ${HX} ${HY})`}
          className="stroke-cobalt-bright"
          style={{ opacity: 0 }}
        />
      </svg>

      {/* The note's own hit area: the control. */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={name}
        aria-describedby={blocked ? undefined : hintId}
        aria-disabled={blocked || undefined}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          if (keyHeld.current) {
            keyHeld.current = false;
            engine.current?.release(false, 0, 0);
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && !blocked) {
            engine.current?.hover(true);
          }
        }}
        onPointerLeave={() => engine.current?.hover(false)}
        {...drag}
        onPointerDown={(event) => {
          if (blocked) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          drag.onPointerDown(event);
          engine.current?.press("pointer");
        }}
        className={cn(
          "absolute touch-none rounded-2 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          blocked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          left: `${r2(((HX - SIDE / 2) / W) * 100)}%`,
          top: `${r2(((HY - SIDE / 2) / H) * 100)}%`,
          width: `${r2((SIDE / W) * 100)}%`,
          height: `${r2((SIDE / H) * 100)}%`,
        }}
      />
      <span id={hintId} className="sr-only">
        Hold to crumple, release to toss. Delete crumples and tosses. Escape
        smooths it out.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
