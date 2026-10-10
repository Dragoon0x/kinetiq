"use client";

import * as React from "react";

import {
  animate,
  cancelFrame,
  frame,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PeelLabelCorner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type PeelLabelProps = {
  /** What the label covers, revealed when it comes off. It also sizes the label. */
  children?: React.ReactNode;
  /** The label's printed face. Presentational: it is drawn twice (the back shows it mirrored). @default a "Peel to reveal" face */
  label?: React.ReactNode;
  /** The corner that stands up and is lifted. @default "bottom-right" */
  corner?: PeelLabelCorner;
  /** How much the lifted paper rolls rather than folding flat, 0 to 1: a broader, brighter crease and a shorter flap. @default 0.5 */
  curl?: number;
  /** Depth of the shadow under the lifted paper, 0 to 1. @default 0.5 */
  shadow?: number;
  /** Share of the corner-to-corner pull past which a release lifts the label off. @default 0.5 */
  threshold?: number;
  /** How far the corner stands up at rest, in px; 0 lays it flat. @default 14 */
  dogEar?: number;
  /** How lively the fall back is: 0 settles once on the snap spring, 1 bounces twice on the recoil spring. @default 0.5 */
  bounce?: number;
  /** How far one arrow key peels, as a share of the pull. @default 0.125 */
  step?: number;
  /** The face's paper. Any CSS colour; a pigment so it reads the same in both themes. @default "oklch(from var(--accent-bright) 0.94 0.035 h)" */
  color?: string;
  /** The back of the label, its liner side. @default "oklch(from var(--accent-bright) 0.985 0.008 h)" */
  backColor?: string;
  /** Ink for the printed face. @default "oklch(from var(--accent-bright) 0.38 0.1 h)" */
  ink?: string;
  /** How much of the print shows through the back, mirrored, 0 to 1. @default 0.1 */
  showThrough?: number;
  /** Corner radius of the label, px. @default 10 */
  radius?: number;
  /** Lift the corner once, as an invitation, the first time it comes into view. @default true */
  intro?: boolean;
  /** Controlled: whether the label is off. */
  peeled?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPeeled?: boolean;
  /** Fires from the release, key or press that took the label off or put it back. */
  onPeeledChange?: (peeled: boolean) => void;
  /** Fires as the visitor peels, with how far, 0 to 1 (two decimals). */
  onProgressChange?: (progress: number) => void;
  /** The corner handle's accessible name. @default "Peel the label" */
  handleLabel?: string;
  /** Holds the label down: no drag, no keys. @default false */
  disabled?: boolean;
  /** Play the paper's sounds. Off unless asked for. @default false */
  sound?: boolean;
  /** Classes for the box; the children size it. */
  className?: string;
};

type Phase = "rest" | "drag" | "hold" | "fall" | "lift" | "off" | "stick";

/** Which way is inward from each corner, as signs on x and y. */
const INWARD: Record<PeelLabelCorner, readonly [number, number]> = {
  "top-left": [1, 1],
  "top-right": [-1, 1],
  "bottom-left": [1, -1],
  "bottom-right": [-1, -1],
};

/** The handle is a square anchored in the lifted corner; 44 px is a fingertip. */
const HANDLE = 44;
/** The light comes from the upper left, travelling down and to the right. */
const LIGHT = Math.SQRT1_2;
const EMPTY = "polygon(0px 0px, 0px 0px, 0px 0px)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const tone = (base: "black" | "white", share: number) =>
  `color-mix(in oklab, ${base} ${Math.round(clamp(share, 0, 1) * 100)}%, transparent)`;

/**
 * The label rectangle cut by the fold line: the vertices of [0,w]×[0,h]
 * on one side of the line through (mx, my) with normal (nx, ny), written
 * into `out` as x,y pairs. One plane of Sutherland–Hodgman, so a rectangle
 * comes back as at most five points.
 */
function cut(
  w: number,
  h: number,
  mx: number,
  my: number,
  nx: number,
  ny: number,
  side: 1 | -1,
  out: Float64Array,
): number {
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    const ax = i === 1 || i === 2 ? w : 0;
    const ay = i >= 2 ? h : 0;
    const bx = i === 0 || i === 1 ? w : 0;
    const by = i === 1 || i === 2 ? h : 0;
    const da = ((ax - mx) * nx + (ay - my) * ny) * side;
    const db = ((bx - mx) * nx + (by - my) * ny) * side;
    if (da >= 0) {
      out[n * 2] = ax;
      out[n * 2 + 1] = ay;
      n += 1;
    }
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out[n * 2] = ax + (bx - ax) * t;
      out[n * 2 + 1] = ay + (by - ay) * t;
      n += 1;
    }
  }
  return n;
}

function polygon(buffer: Float64Array, count: number): string {
  if (count < 3) return EMPTY;
  let out = "polygon(";
  for (let i = 0; i < count; i += 1) {
    if (i > 0) out += ", ";
    out += `${r2(buffer[i * 2] ?? 0)}px ${r2(buffer[i * 2 + 1] ?? 0)}px`;
  }
  return `${out})`;
}

function SealFace() {
  return (
    <span className="flex flex-col items-center gap-1.5 px-3 text-center">
      <span className="flex size-7 items-center justify-center rounded-full border border-current/30">
        <span className="size-2 rotate-45 rounded-[2px] bg-current/70" />
      </span>
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase">
        Peel to reveal
      </span>
    </span>
  );
}

/**
 * A paper label laid over any content, lifted by one corner. The fold is
 * real geometry rebuilt every frame from a single point — the tip of the
 * lifted corner, held in two motion values: the fold line is the
 * perpendicular bisector of corner and tip, the face is clipped to the half
 * beyond it, and the half on the corner's side is reflected across it with
 * one matrix (foreshortened toward the fold by `curl`) so its back shows,
 * liner-pale, with the print showing through mirrored where the ink really
 * is. A crease strip shades the roll — a dark crease, a highlight where it
 * faces the light, a soft core — the flap drops a shadow that deepens as it
 * lifts, and the bared content darkens just under the roll.
 *
 * The corner follows the finger 1:1 and rubber-bands at the edges. Released
 * short of `threshold` it falls back on a spring between snap and recoil
 * that takes the release velocity, so the corner slaps flat and pops back
 * up; released past it (with the throw projected), the fold runs on across
 * the label on the glide spring and the sheet leaves over the far edge.
 * Putting it back rolls it on from that edge and lands it on recoil. The
 * handle is a slider: arrows peel in steps, End or Enter lifts it off,
 * Home or Escape lays it back. Under reduced motion nothing springs — the
 * corner returns at once and the label fades off and on.
 */
export function PeelLabel({
  children,
  label,
  corner = "bottom-right",
  curl = 0.5,
  shadow = 0.5,
  threshold = 0.5,
  dogEar = 14,
  bounce = 0.5,
  step = 0.125,
  color = "oklch(from var(--accent-bright) 0.94 0.035 h)",
  backColor = "oklch(from var(--accent-bright) 0.985 0.008 h)",
  ink = "oklch(from var(--accent-bright) 0.38 0.1 h)",
  showThrough = 0.1,
  radius = 10,
  intro = true,
  peeled,
  defaultPeeled = false,
  onPeeledChange,
  onProgressChange,
  handleLabel = "Peel the label",
  disabled = false,
  sound = false,
  className,
}: PeelLabelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const [own, setOwn] = React.useState(defaultPeeled);
  const isPeeled = peeled ?? own;
  const [reading, setReading] = React.useState(0);

  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const fade = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const faceRef = React.useRef<HTMLDivElement | null>(null);
  const flapWrapRef = React.useRef<HTMLDivElement | null>(null);
  const flapRef = React.useRef<HTMLDivElement | null>(null);
  const creaseRef = React.useRef<HTMLDivElement | null>(null);
  const contactWrapRef = React.useRef<HTMLDivElement | null>(null);
  const contactRef = React.useRef<HTMLDivElement | null>(null);
  const handleRef = React.useRef<HTMLDivElement | null>(null);

  const params = React.useRef({
    corner,
    curl,
    shadow,
    threshold,
    dogEar,
    bounce,
    motionSafe,
    intro,
    disabled,
    audio,
    peeledAtMount: isPeeled,
  });
  React.useEffect(() => {
    params.current = {
      ...params.current,
      corner,
      curl,
      shadow,
      threshold,
      dogEar,
      bounce,
      motionSafe,
      intro,
      disabled,
      audio,
    };
  });

  const api = React.useRef<{
    paint: () => void;
    reset: () => void;
    progress: () => number;
    fall: (vx: number, vy: number) => void;
    hold: (progress: number) => void;
    lift: (vx: number, vy: number) => void;
    stick: () => void;
    tease: () => void;
    hover: (on: boolean) => void;
    grab: () => boolean;
    pull: (dx: number, dy: number) => number;
    release: () => void;
    phase: () => Phase;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const face = faceRef.current;
    const flapWrap = flapWrapRef.current;
    const flap = flapRef.current;
    const crease = creaseRef.current;
    const contactWrap = contactWrapRef.current;
    const contact = contactRef.current;
    const handle = handleRef.current;
    if (
      !root ||
      !face ||
      !flapWrap ||
      !flap ||
      !crease ||
      !contactWrap ||
      !contact ||
      !handle
    ) {
      return;
    }

    let w = 0;
    let h = 0;
    let phase: Phase = params.current.peeledAtMount ? "off" : "rest";
    let running: AnimationPlaybackControls[] = [];
    let timers: number[] = [];
    let grabbedFrom = { x: 0, y: 0 };
    let endLength = 1;
    let landArmed = false;
    let introduced = false;
    // Where a keyboard peel is being held, so quick key repeats step from
    // the target rather than from wherever the spring has got to.
    let heldAt = 0;
    const faceBuf = new Float64Array(12);
    const flapBuf = new Float64Array(12);

    const halt = () => {
      for (const c of running) c.stop();
      running = [];
      for (const t of timers) window.clearTimeout(t);
      timers = [];
    };

    const inward = () =>
      INWARD[params.current.corner] ?? INWARD["bottom-right"];
    const cornerAt = () => {
      const [sx, sy] = inward();
      return { x: sx > 0 ? 0 : w, y: sy > 0 ? 0 : h };
    };
    /** The corner-to-corner direction, unit length. */
    const diagonal = () => {
      const [sx, sy] = inward();
      const d = Math.max(1, Math.hypot(w, h));
      return { x: (sx * w) / d, y: (sy * h) / d };
    };
    const restTip = () => {
      const [sx, sy] = inward();
      const e = Math.max(0, params.current.dogEar);
      return { x: sx * e, y: sy * e };
    };
    const progressOf = (x: number, y: number) => {
      const s = diagonal();
      return clamp((x * s.x + y * s.y) / Math.max(1, Math.hypot(w, h)), 0, 1);
    };
    const audible = () => {
      const at = handle.getBoundingClientRect();
      return panFrom(at.left + at.width / 2, root);
    };

    const hide = (gone: boolean) => {
      const v = gone ? "hidden" : "visible";
      face.style.visibility = v;
      flapWrap.style.visibility = v;
      contactWrap.style.visibility = v;
    };

    const paint = () => {
      if (w < 2 || h < 2) return;
      const p = params.current;
      const [sx, sy] = inward();
      const c = cornerAt();
      const ox = tipX.get();
      const oy = tipY.get();
      const length = Math.hypot(ox, oy);
      const D = Math.max(1, Math.hypot(w, h));

      if (phase === "off") {
        hide(true);
        handle.style.transform = "none";
        return;
      }
      hide(false);

      let opacity = fade.get();
      if (phase === "lift" || phase === "stick") {
        opacity *= 1 - smooth((length / endLength - 0.72) / 0.28);
      }
      face.style.opacity = String(r2(opacity));
      flapWrap.style.opacity = String(r2(opacity));
      contactWrap.style.opacity = String(r2(opacity));

      // A tip pushed out past its own corner is a label lying flat.
      const flat = ox * sx + oy * sy <= 0.25 || length < 0.5;
      if (flat) {
        face.style.clipPath = "none";
        flapWrap.style.visibility = "hidden";
        contactWrap.style.visibility = "hidden";
        handle.style.transform = "none";
        return;
      }

      const nx = ox / length;
      const ny = oy / length;
      // The paper rolls as it lifts: a curled sheet is foreshortened toward
      // its fold by k, so to keep the corner exactly under the finger the
      // fold sits further from the corner — at a = |tip| / (1 + k) — and
      // more of the sheet is off the surface for the same pull.
      const raised = smooth(length / (0.6 * D));
      const k = 1 - 0.42 * clamp(p.curl, 0, 1) * raised;
      const reach = length / (1 + k);
      const mx = c.x + nx * reach;
      const my = c.y + ny * reach;
      face.style.clipPath = polygon(
        faceBuf,
        cut(w, h, mx, my, nx, ny, 1, faceBuf),
      );
      const corner = polygon(flapBuf, cut(w, h, mx, my, nx, ny, -1, flapBuf));
      flap.style.clipPath = corner;
      contactWrap.style.clipPath = corner;

      // The flap: reflected across the fold and foreshortened toward it —
      // A = d·dᵀ − k·n·nᵀ about a point on the fold — which carries the
      // corner onto the tip.
      const a11 = ny * ny - k * nx * nx;
      const a12 = -(1 + k) * nx * ny;
      const a22 = nx * nx - k * ny * ny;
      const e = mx - (a11 * mx + a12 * my);
      const f = my - (a12 * mx + a22 * my);
      flap.style.transform = `matrix(${r4(a11)}, ${r4(a12)}, ${r4(a12)}, ${r4(a22)}, ${r2(e)}, ${r2(f)})`;

      // The crease, in the flap's own (unreflected) frame: it runs from the
      // fold toward the corner, which the reflection carries to the tip.
      const curlK = clamp(p.curl, 0, 1);
      const roll = 3 + curlK * (8 + 22 * raised);
      const facing = 0.5 + 0.5 * (nx * LIGHT + ny * LIGHT);
      const angle = r2((Math.atan2(-ny, -nx) * 180) / Math.PI);
      const span = reach + D;
      crease.style.left = `${r2(mx)}px`;
      crease.style.top = `${r2(my - D - 20)}px`;
      crease.style.width = `${r2(span)}px`;
      crease.style.height = `${r2(2 * D + 40)}px`;
      crease.style.transform = `rotate(${angle}deg)`;
      crease.style.backgroundImage = `linear-gradient(90deg, ${tone("black", 0.14 + 0.22 * (1 - curlK))} 0px, transparent ${r2(Math.max(1, roll * 0.14))}px, ${tone("white", (0.16 + 0.5 * facing) * (0.35 + 0.65 * curlK))} ${r2(roll * 0.38)}px, ${tone("black", 0.04 + 0.12 * curlK * (1 - facing * 0.5))} ${r2(roll * 0.9)}px, transparent ${r2(roll * 1.55)}px, transparent ${r2(Math.max(roll * 1.6, reach * 0.55))}px, ${tone("white", 0.12 * raised * facing)} ${r2(Math.max(roll * 1.7, reach))}px)`;

      // Under the roll, where the sheet has just left the content.
      const depth = clamp(p.shadow, 0, 1);
      const pool = (6 + 18 * raised) * (0.5 + depth);
      contact.style.left = `${r2(mx)}px`;
      contact.style.top = `${r2(my - D - 20)}px`;
      contact.style.width = `${r2(span)}px`;
      contact.style.height = `${r2(2 * D + 40)}px`;
      contact.style.transform = `rotate(${angle}deg)`;
      contact.style.backgroundImage = `linear-gradient(90deg, ${tone("black", depth * (0.12 + 0.2 * raised))} 0px, transparent ${r2(pool)}px)`;

      // The flap's own shadow falls onto the face, pushed out past the tip
      // and deeper the higher the paper stands.
      if (depth > 0.01) {
        const off = (1 + 6 * raised) * depth;
        flapWrap.style.filter = `drop-shadow(${r2(nx * off)}px ${r2(ny * off + depth)}px ${r2((2 + 12 * raised) * depth)}px ${tone("black", depth * (0.16 + 0.22 * raised))})`;
      } else {
        flapWrap.style.filter = "none";
      }

      // The handle rides on the tip so a keyboard focus ring stays on it.
      const tipX2 = c.x + ox;
      const tipY2 = c.y + oy;
      const x0 = sx > 0 ? 0 : w - HANDLE;
      const y0 = sy > 0 ? 0 : h - HANDLE;
      const hx = clamp(tipX2 - HANDLE / 2, 0, Math.max(0, w - HANDLE));
      const hy = clamp(tipY2 - HANDLE / 2, 0, Math.max(0, h - HANDLE));
      handle.style.transform = `translate(${r2(hx - x0)}px, ${r2(hy - y0)}px)`;

      // The paper lands: heard once, when the corner first gets back down.
      const rest = restTip();
      if (
        landArmed &&
        (phase === "fall" || phase === "stick") &&
        length <= Math.hypot(rest.x, rest.y) + 0.75
      ) {
        landArmed = false;
        p.audio.play("paper", {
          pitch: phase === "stick" ? 0.82 : 0.7,
          gain: phase === "stick" ? 0.42 : 0.3,
          pan: audible(),
        });
      }
    };

    const springTo = (
      x: number,
      y: number,
      transition: {
        type: "spring";
        stiffness: number;
        damping: number;
        mass: number;
      },
      vx = 0,
      vy = 0,
      done?: () => void,
    ) => {
      halt();
      running = [
        animate(tipX, r2(x), { ...transition, velocity: vx }),
        animate(tipY, r2(y), {
          ...transition,
          velocity: vy,
          onComplete: done,
        }),
      ];
    };

    const fallSpring = () => {
      const b = clamp(params.current.bounce, 0, 1);
      return {
        type: "spring" as const,
        stiffness: r2(
          lerp(springs.snap.stiffness, springs.recoil.stiffness, b),
        ),
        damping: r2(lerp(springs.snap.damping, springs.recoil.damping, b)),
        mass: 1,
      };
    };

    const toRest = () => {
      halt();
      phase = "rest";
      const rest = restTip();
      fade.jump(1);
      tipX.jump(rest.x);
      tipY.jump(rest.y);
      paint();
    };

    const fall = (vx: number, vy: number) => {
      if (phase === "off" || phase === "lift") return;
      const rest = restTip();
      if (!params.current.motionSafe) {
        toRest();
        return;
      }
      phase = "fall";
      landArmed = Math.hypot(tipX.get() - rest.x, tipY.get() - rest.y) > 6;
      springTo(rest.x, rest.y, fallSpring(), vx, vy, () => {
        if (phase === "fall") phase = "rest";
      });
    };

    const lift = (vx: number, vy: number) => {
      if (phase === "off" || phase === "lift") return;
      const [sx, sy] = inward();
      let ux = tipX.get();
      let uy = tipY.get();
      let len = Math.hypot(ux, uy);
      if (len < 2 || ux * sx + uy * sy <= 0) {
        const s = diagonal();
        ux = s.x;
        uy = s.y;
        len = 1;
      }
      ux /= len;
      uy /= len;
      // Far enough that the fold has passed every corner of the label.
      const far = Math.max(
        0,
        ux * sx * w,
        uy * sy * h,
        ux * sx * w + uy * sy * h,
      );
      endLength = 2 * far + 24;
      const p = params.current;
      p.audio.play("paper", { pitch: 1.3, gain: 0.5, pan: audible() });
      if (!p.motionSafe) {
        halt();
        phase = "lift";
        endLength = Number.POSITIVE_INFINITY;
        running = [
          animate(fade, 0, {
            duration: durations.base,
            ease: easings.exit,
            onComplete: () => {
              phase = "off";
              fade.jump(1);
              paint();
            },
          }),
        ];
        return;
      }
      phase = "lift";
      springTo(ux * endLength, uy * endLength, springs.glide, vx, vy, () => {
        phase = "off";
        paint();
      });
    };

    const stick = () => {
      const rest = restTip();
      const s = diagonal();
      halt();
      if (!params.current.motionSafe) {
        phase = "rest";
        tipX.jump(rest.x);
        tipY.jump(rest.y);
        fade.jump(0);
        paint();
        params.current.audio.play("paper", { pitch: 0.82, gain: 0.42 });
        running = [
          animate(fade, 1, { duration: durations.base, ease: easings.enter }),
        ];
        return;
      }
      endLength = 2 * Math.hypot(w, h) + 24;
      phase = "stick";
      fade.jump(1);
      tipX.jump(s.x * endLength);
      tipY.jump(s.y * endLength);
      landArmed = true;
      paint();
      springTo(rest.x, rest.y, springs.recoil, 0, 0, () => {
        if (phase === "stick") phase = "rest";
      });
    };

    const hold = (progress: number) => {
      if (phase === "off" || phase === "lift") return;
      const s = diagonal();
      const rest = restTip();
      heldAt = progress;
      const along = progress * Math.hypot(w, h);
      const x = Math.abs(s.x * along) > Math.abs(rest.x) ? s.x * along : rest.x;
      const y = Math.abs(s.y * along) > Math.abs(rest.y) ? s.y * along : rest.y;
      phase = "hold";
      if (!params.current.motionSafe) {
        halt();
        tipX.jump(x);
        tipY.jump(y);
        paint();
        return;
      }
      springTo(x, y, springs.snap);
    };

    const tease = () => {
      const q = params.current;
      // A label held down does not invite a peel.
      if (phase !== "rest" || !q.motionSafe || q.disabled) return;
      const [sx, sy] = inward();
      const up = Math.max(26, params.current.dogEar * 2.4);
      const rest = restTip();
      phase = "fall";
      springTo(sx * up, sy * up, springs.snap, 0, 0, () => {
        if (phase !== "fall") return;
        springTo(rest.x, rest.y, springs.recoil, 0, 0, () => {
          if (phase === "fall") phase = "rest";
        });
      });
    };

    const hover = (on: boolean) => {
      if (!params.current.motionSafe) return;
      if (phase !== "rest" && phase !== "fall") return;
      const [sx, sy] = inward();
      const e = params.current.dogEar;
      const up = on ? Math.max(e * 1.8, e + 10) : e;
      springTo(sx * up, sy * up, springs.snap, 0, 0, () => {
        if (!on && phase === "fall") phase = "rest";
      });
      phase = on ? "rest" : "fall";
    };

    const measure = () => {
      w = root.clientWidth;
      h = root.clientHeight;
    };

    measure();
    if (phase === "rest") {
      const rest = restTip();
      tipX.jump(rest.x);
      tipY.jump(rest.y);
    }
    paint();

    api.current = {
      paint,
      reset: () => {
        if (phase === "off") {
          paint();
          return;
        }
        toRest();
      },
      progress: () =>
        phase === "hold" ? heldAt : progressOf(tipX.get(), tipY.get()),
      fall,
      hold,
      lift,
      stick,
      tease,
      hover,
      grab: () => {
        if (phase === "off" || phase === "lift") return false;
        halt();
        phase = "drag";
        grabbedFrom = { x: tipX.get(), y: tipY.get() };
        return true;
      },
      pull: (dx, dy) => {
        if (phase !== "drag") return progressOf(tipX.get(), tipY.get());
        const c = cornerAt();
        const x = rubberClamp(c.x + grabbedFrom.x + dx, 0, w, w) - c.x;
        const y = rubberClamp(c.y + grabbedFrom.y + dy, 0, h, h) - c.y;
        tipX.set(r2(x));
        tipY.set(r2(y));
        return progressOf(x, y);
      },
      release: () => {
        if (phase !== "drag") return;
        heldAt = progressOf(tipX.get(), tipY.get());
        phase = "hold";
      },
      phase: () => phase,
    };

    // Both halves of the tip (and the fade) change in the same frame: the
    // fold is painted once, in motion's render step.
    let queued = false;
    const flush = () => {
      queued = false;
      paint();
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      frame.render(flush);
    };
    const unsubscribe = [
      tipX.on("change", schedule),
      tipY.on("change", schedule),
      fade.on("change", schedule),
    ];
    const sizer = new ResizeObserver(() => {
      measure();
      paint();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry?.isIntersecting || introduced) return;
      introduced = true;
      if (!params.current.intro) return;
      timers.push(window.setTimeout(tease, 260));
    });
    watcher.observe(root);

    return () => {
      halt();
      for (const off of unsubscribe) off();
      cancelFrame(flush);
      sizer.disconnect();
      watcher.disconnect();
      api.current = null;
    };
  }, [tipX, tipY, fade]);

  // A new corner or dog-ear moves the rest pose; curl and shadow restyle it.
  React.useEffect(() => {
    api.current?.reset();
  }, [corner, dogEar]);
  React.useEffect(() => {
    api.current?.paint();
  }, [curl, shadow, radius, motionSafe]);

  // A host that changes `peeled` gets the same motion a release would.
  const shown = React.useRef(isPeeled);
  const pending = React.useRef({ x: 0, y: 0 });
  React.useEffect(() => {
    if (shown.current === isPeeled) return;
    shown.current = isPeeled;
    if (isPeeled) api.current?.lift(pending.current.x, pending.current.y);
    else api.current?.stick();
    pending.current = { x: 0, y: 0 };
  }, [isPeeled]);

  const report = (progress: number) => {
    onProgressChange?.(Math.round(clamp(progress, 0, 1) * 100) / 100);
  };

  const commit = (next: boolean, vx = 0, vy = 0) => {
    if (next === isPeeled) {
      if (!next) api.current?.fall(vx, vy);
      return;
    }
    setReading(next ? 100 : 0);
    report(next ? 1 : 0);
    if (peeled === undefined) {
      setOwn(next);
      shown.current = next;
      if (next) api.current?.lift(vx, vy);
      else api.current?.stick();
    } else {
      // Controlled: the label goes back to where the host says it is; if
      // the host takes the change, the effect above carries it on from
      // there with the same throw.
      pending.current = { x: vx, y: vy };
      if (next) api.current?.fall(vx, vy);
    }
    onPeeledChange?.(next);
  };

  const ticks = React.useRef(0);
  const drag = useDrag({
    threshold: 3,
    disabled: disabled || isPeeled,
    onStart: (info) => {
      if (!api.current?.grab()) return;
      ticks.current = 0;
      audio.play("paper", {
        pitch: 1.05,
        gain: 0.36,
        pan: panFrom(info.point.x, rootRef.current),
      });
    },
    onMove: ({ offset }) => {
      const progress = api.current?.pull(offset.x, offset.y) ?? 0;
      report(progress);
      // The adhesive lets go in steps: a quiet crinkle every tenth.
      const tenth = Math.floor(progress * 10);
      if (tenth > ticks.current) {
        ticks.current = tenth;
        audio.play("paper", { pitch: 0.9 + progress * 0.5, gain: 0.18 });
      } else if (tenth < ticks.current) {
        ticks.current = tenth;
      }
    },
    onEnd: ({ velocity }) => {
      const a = api.current;
      if (!a) return;
      a.release();
      const root = rootRef.current;
      const w = root?.clientWidth ?? 1;
      const h = root?.clientHeight ?? 1;
      const d = Math.max(1, Math.hypot(w, h));
      const [sx, sy] = INWARD[corner] ?? INWARD["bottom-right"];
      const along = (velocity.x * sx * w + velocity.y * sy * h) / d;
      const landing = project(a.progress() * d, along, 0.99) / d;
      if (landing >= clamp(threshold, 0.15, 0.9)) {
        commit(true, velocity.x, velocity.y);
      } else {
        setReading(0);
        report(0);
        a.fall(velocity.x, velocity.y);
      }
    },
    onCancel: () => {
      api.current?.release();
      report(0);
      api.current?.fall(0, 0);
    },
    onTap: () => api.current?.tease(),
  });

  const stepBy = (count: number) => {
    const a = api.current;
    if (!a) return;
    const unit = clamp(step, 0.02, 0.5);
    const now = Math.round(a.progress() / unit) * unit;
    const next = Math.round(clamp(now + count * unit, 0, 1) * 1000) / 1000;
    const limit = clamp(threshold, 0.15, 0.9);
    if (next >= limit - 1e-6) {
      commit(true);
      return;
    }
    audio.play("paper", { pitch: 0.9 + next * 0.5, gain: 0.3 });
    report(next);
    setReading(Math.round(next * 100));
    if (next <= 0) a.fall(0, 0);
    else a.hold(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const key = event.key;
    if (isPeeled) {
      if (
        key === "Enter" ||
        key === " " ||
        key === "Home" ||
        key === "ArrowLeft" ||
        key === "ArrowDown" ||
        key === "PageDown"
      ) {
        event.preventDefault();
        commit(false);
      }
      return;
    }
    switch (key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        stepBy(1);
        break;
      case "PageUp":
        event.preventDefault();
        stepBy(2);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        stepBy(-1);
        break;
      case "PageDown":
        event.preventDefault();
        stepBy(-2);
        break;
      case "End":
      case "Enter":
      case " ":
        event.preventDefault();
        commit(true);
        break;
      case "Home":
        event.preventDefault();
        report(0);
        setReading(0);
        api.current?.fall(0, 0);
        break;
      case "Escape":
        // Only an Escape with something to undo is ours; the rest belong to
        // whatever contains the label.
        if (api.current?.phase() === "hold") {
          event.preventDefault();
          report(0);
          setReading(0);
          api.current?.fall(0, 0);
        }
        break;
    }
  };

  const [sx, sy] = INWARD[corner] ?? INWARD["bottom-right"];
  const valueText = isPeeled
    ? "Label off"
    : reading > 0
      ? `Label peeled ${reading}%`
      : "Label sealed";
  const print = (
    <>
      <span
        className="pointer-events-none absolute inset-1.5 border border-dashed"
        style={{
          borderRadius: Math.max(2, radius - 5),
          borderColor: `color-mix(in oklab, ${ink} 26%, transparent)`,
        }}
      />
      <span className="relative flex max-w-full items-center justify-center">
        {label ?? <SealFace />}
      </span>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate overflow-clip", className)}
    >
      <div inert={!isPeeled}>{children}</div>
      <div
        ref={contactWrapRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-0 overflow-hidden"
        style={{ borderRadius: radius }}
      >
        <div
          ref={contactRef}
          className="absolute"
          style={{ transformOrigin: "0 50%" }}
        />
      </div>
      <div
        ref={faceRef}
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center overflow-hidden bg-card select-none",
          isPeeled && "invisible",
        )}
        style={{
          borderRadius: radius,
          backgroundColor: color,
          color: ink,
          backgroundImage:
            "linear-gradient(135deg, color-mix(in oklab, white 26%, transparent), transparent 46%)",
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ink} 14%, transparent)`,
        }}
      >
        {print}
      </div>
      <div
        ref={flapWrapRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-0"
      >
        <div
          ref={flapRef}
          inert
          className="absolute inset-0 flex items-center justify-center overflow-hidden bg-card select-none"
          style={{
            borderRadius: radius,
            backgroundColor: backColor,
            color: ink,
            transformOrigin: "0 0",
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ink} 10%, transparent)`,
          }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: clamp(showThrough, 0, 1) }}
          >
            {print}
          </div>
          <div
            ref={creaseRef}
            className="absolute"
            style={{ transformOrigin: "0 50%" }}
          />
        </div>
      </div>
      <div
        ref={handleRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={handleLabel}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isPeeled ? 100 : reading}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // A keyboard peel is held only while the handle has focus; leaving
          // it lets go, the way a hand would.
          if (api.current?.phase() !== "hold") return;
          report(0);
          setReading(0);
          api.current.fall(0, 0);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && !disabled && !isPeeled) {
            api.current?.hover(true);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          if (api.current?.phase() === "rest") api.current.hover(false);
        }}
        {...drag}
        className={cn(
          "absolute touch-none rounded-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : isPeeled
              ? "pointer-events-none"
              : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          width: HANDLE,
          height: HANDLE,
          left: sx > 0 ? 0 : undefined,
          right: sx > 0 ? undefined : 0,
          top: sy > 0 ? 0 : undefined,
          bottom: sy > 0 ? undefined : 0,
        }}
      />
      <span id={hintId} className="sr-only">
        {isPeeled
          ? "Enter puts the label back."
          : "Drag the corner to peel it. Arrow keys peel a step at a time, Enter lifts it off, Escape lays it back."}
      </span>
    </div>
  );
}
