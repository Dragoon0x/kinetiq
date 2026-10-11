"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControlsWithThen,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SweepStudioRig = "soft" | "rim" | "top" | "window";
export type SweepStudioFinish = "graphite" | "silver" | "sand" | "cobalt";
export type SweepStudioSide = "front" | "edge" | "back";

export type SweepStudioColors = {
  /** The sweep where it rises behind the phone. */
  wall?: string;
  /** The sweep where it runs under the phone. */
  floor?: string;
};

export type SweepStudioProps = {
  /** What the screen shows. Real content: it stays readable and focusable while it faces you. Defaults to a transit app. */
  children?: React.ReactNode;
  /** The lights: a big softbox, two rim strips, a top spot, or window light. @default "soft" */
  lightRig?: SweepStudioRig;
  /** The pose it rests in, degrees; 0 is square on. @default -18 */
  angle?: number;
  /** The body's finish. @default "graphite" */
  finish?: SweepStudioFinish;
  /** Degrees per second of a slow showcase turn; 0 rests in the pose. @default 0 */
  autoTurn?: number;
  /** How long it holds a pose turned by the keys before easing back, ms. @default 900 */
  hold?: number;
  /** How far above the eye sits, 0 to 20 degrees. @default 8 */
  tilt?: number;
  /** How glossy the floor is: the reflection's strength, 0 to 1. @default 0.5 */
  gloss?: number;
  /** Distance of the eye from the phone, px. @default 1400 */
  perspective?: number;
  /** The sweep's colours; tokens by default, so both themes read. */
  colors?: SweepStudioColors;
  /** Fires as a turn brings the front, an edge or the back to face you. */
  onSideChange?: (side: SweepStudioSide) => void;
  /** Drag and the keys turn it. @default true */
  interactive?: boolean;
  /** The studio's accessible name. @default "Phone on a turntable" */
  label?: string;
  /** Sizes the studio. @default "h-[30rem] w-full" */
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const wrap180 = (d: number) => mod(d + 180, 360) - 180;
const DEG = Math.PI / 180;

/** Where the phone stands: its base on this line, as a share of the height. */
const FLOOR = 0.74;
/** Strips per rounded corner of the edge band. */
const ARC = 5;

type Rig = {
  /** Key light, in view space (x right, y down, z toward the eye). */
  key: [number, number, number];
  keyPower: number;
  /** Rim lamps behind the phone. */
  rims: [number, number, number][];
  rimPower: number;
  ambient: number;
  /** Layers over the sweep: where the lights fall on it. */
  sweep: string;
  /** How dark the contact shadow is. */
  shadow: number;
};

const norm = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

const RIGS: Record<SweepStudioRig, Rig> = {
  soft: {
    key: norm(-0.55, -0.6, 0.6),
    keyPower: 0.62,
    rims: [norm(0.9, -0.2, -0.4)],
    rimPower: 0.25,
    ambient: 0.48,
    sweep:
      "radial-gradient(70% 60% at 22% 8%, oklch(1 0 0 / 0.2), transparent 70%), radial-gradient(45% 18% at 50% 76%, oklch(1 0 0 / 0.12), transparent 70%)",
    shadow: 0.32,
  },
  rim: {
    key: norm(0.1, -0.4, 0.9),
    keyPower: 0.28,
    rims: [norm(-1, -0.15, -0.35), norm(1, -0.15, -0.35)],
    rimPower: 0.95,
    ambient: 0.32,
    sweep:
      "linear-gradient(90deg, transparent 10%, oklch(1 0 0 / 0.16) 16%, transparent 22%, transparent 78%, oklch(1 0 0 / 0.16) 84%, transparent 90%), linear-gradient(oklch(0 0 0 / 0.16), oklch(0 0 0 / 0.08))",
    shadow: 0.24,
  },
  top: {
    key: norm(0, -1, 0.3),
    keyPower: 0.7,
    rims: [],
    rimPower: 0,
    ambient: 0.36,
    sweep:
      "radial-gradient(34% 22% at 50% 76%, oklch(1 0 0 / 0.26), transparent 72%), radial-gradient(90% 60% at 50% 0%, oklch(0 0 0 / 0.14), transparent 70%)",
    shadow: 0.45,
  },
  window: {
    key: norm(0.75, -0.35, 0.55),
    keyPower: 0.66,
    rims: [norm(-0.8, -0.2, -0.5)],
    rimPower: 0.2,
    ambient: 0.42,
    sweep:
      "linear-gradient(112deg, transparent 50%, oklch(0.97 0.04 80 / 0.22) 53%, oklch(0.97 0.04 80 / 0.22) 60%, transparent 63%, transparent 66%, oklch(0.97 0.04 80 / 0.2) 69%, oklch(0.97 0.04 80 / 0.2) 76%, transparent 79%)",
    shadow: 0.3,
  },
};

type Finish = { back: string; edge: string; glint: string };

const FINISHES: Record<SweepStudioFinish, Finish> = {
  graphite: {
    back: "oklch(0.3 0.008 260)",
    edge: "oklch(0.45 0.006 260)",
    glint: "oklch(0.85 0.005 260)",
  },
  silver: {
    back: "oklch(0.88 0.004 260)",
    edge: "oklch(0.8 0.006 260)",
    glint: "oklch(0.99 0.002 260)",
  },
  sand: {
    back: "oklch(0.84 0.035 75)",
    edge: "oklch(0.74 0.035 70)",
    glint: "oklch(0.97 0.02 80)",
  },
  cobalt: {
    back: "oklch(from var(--accent) 0.42 0.12 h)",
    edge: "oklch(from var(--accent) 0.56 0.1 h)",
    glint: "oklch(from var(--accent) 0.9 0.05 h)",
  },
};

/* --------------------------------- geometry ------------------------------ */

type Strip = {
  key: string;
  /** Outward direction in the phone's plane, CSS angle (x right, y down). */
  a: number;
  /** Centre, as CSS lengths in the phone's box. */
  x: string;
  y: string;
  /** Length along the band. */
  len: string;
};

/**
 * The edge band: four straight sides and ARC strips round each corner, every
 * one turned so its face points straight out from the phone. One formula
 * places them all — `rotateZ(a − 90°) rotateX(−90°)` stands a strip on its
 * long edge facing angle a — so the band closes with no gaps at any angle.
 */
function edgeStrips(): Strip[] {
  const out: Strip[] = [
    {
      key: "r",
      a: 0,
      x: "var(--pw)",
      y: "calc(var(--ph) / 2)",
      len: "calc(var(--ph) - 2 * var(--rc))",
    },
    {
      key: "b",
      a: 90,
      x: "calc(var(--pw) / 2)",
      y: "var(--ph)",
      len: "calc(var(--pw) - 2 * var(--rc))",
    },
    {
      key: "l",
      a: 180,
      x: "0px",
      y: "calc(var(--ph) / 2)",
      len: "calc(var(--ph) - 2 * var(--rc))",
    },
    {
      key: "t",
      a: 270,
      x: "calc(var(--pw) / 2)",
      y: "0px",
      len: "calc(var(--pw) - 2 * var(--rc))",
    },
  ];
  const corners: [string, string, number][] = [
    ["calc(var(--pw) - var(--rc))", "calc(var(--ph) - var(--rc))", 0],
    ["var(--rc)", "calc(var(--ph) - var(--rc))", 90],
    ["var(--rc)", "var(--rc)", 180],
    ["calc(var(--pw) - var(--rc))", "var(--rc)", 270],
  ];
  const span = 90 / ARC;
  const reach = r3(Math.cos((span / 2) * DEG));
  const chord = r3(2 * Math.sin((span / 2) * DEG));
  for (const [cx, cy, from] of corners) {
    for (let k = 0; k < ARC; k += 1) {
      const a = from + span * (k + 0.5);
      const c = r3(Math.cos(a * DEG) * reach);
      const s = r3(Math.sin(a * DEG) * reach);
      out.push({
        key: `${from}-${k}`,
        a,
        x: `calc(${cx} + var(--rc) * ${c})`,
        y: `calc(${cy} + var(--rc) * ${s})`,
        // A hair long, so neighbours overlap instead of leaving a seam.
        len: `calc(var(--rc) * ${chord} + 0.6px)`,
      });
    }
  }
  return out;
}

const STRIPS = edgeStrips();

/** Brightness of a face whose outward normal is n (view space), under a rig. */
function lit(rig: Rig, n: [number, number, number]) {
  const [nx, ny, nz] = n;
  const d = Math.max(0, nx * rig.key[0] + ny * rig.key[1] + nz * rig.key[2]);
  let rim = 0;
  for (const r of rig.rims) {
    const t = Math.max(0, nx * r[0] + ny * r[1] + nz * r[2]);
    rim += t * t;
  }
  // Specular: the half vector between the key and the eye.
  const hx = rig.key[0];
  const hy = rig.key[1];
  const hz = rig.key[2] + 1;
  const hl = Math.hypot(hx, hy, hz) || 1;
  const sp = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl) ** 28;
  return {
    shade: r3(clamp01(1 - (rig.ambient + rig.keyPower * d)) * 0.72),
    glint: r3(clamp01(sp * 0.8 + rim * rig.rimPower * 0.7)),
  };
}

/** A face's outward normal after the turn and the view's tilt. */
function turned(
  n: [number, number, number],
  turnDeg: number,
  tiltDeg: number,
): [number, number, number] {
  const t = turnDeg * DEG;
  const x1 = n[0] * Math.cos(t) + n[2] * Math.sin(t);
  const z1 = -n[0] * Math.sin(t) + n[2] * Math.cos(t);
  const b = -tiltDeg * DEG;
  const y2 = n[1] * Math.cos(b) - z1 * Math.sin(b);
  const z2 = n[1] * Math.sin(b) + z1 * Math.cos(b);
  return [x1, y2, z2];
}

/* ---------------------------------- screen ------------------------------- */

/** The default screen: a small transit app, sized in em so it fits any phone. */
function TransitScreen() {
  return (
    <div className="flex size-full flex-col gap-[0.7em] bg-background px-[0.9em] pt-[2.2em] pb-[0.8em] text-foreground">
      <div className="flex items-center justify-between font-mono text-[0.62em] text-ink-3">
        <span>08:14</span>
        <span>Waylight</span>
      </div>
      <div className="flex flex-col gap-[0.15em]">
        <p className="text-[0.7em] text-ink-3">Good morning</p>
        <p className="text-[1.15em] leading-tight font-semibold">Your trips</p>
      </div>
      <div className="flex flex-col gap-[0.5em] rounded-[0.7em] bg-primary p-[0.8em] text-primary-foreground">
        <div className="flex items-center justify-between text-[0.66em]">
          <span>Line 4 · Fieldline</span>
          <span className="font-mono">Plat. 2</span>
        </div>
        <p className="text-[1.45em] leading-none font-semibold">4 min</p>
        <div className="h-[0.3em] overflow-hidden rounded-full bg-primary-foreground/25">
          <div className="h-full w-2/3 rounded-full bg-primary-foreground" />
        </div>
      </div>
      {[
        ["Coldbrook", "08:31"],
        ["Basinworks", "08:47"],
        ["Gaugeworks", "09:05"],
      ].map(([stop, time]) => (
        <div
          key={stop}
          className="flex items-center justify-between border-b border-hairline pb-[0.45em] text-[0.7em]"
        >
          <span>{stop}</span>
          <span className="font-mono text-ink-2">{time}</span>
        </div>
      ))}
      <div className="mt-auto flex items-center justify-around pt-[0.3em]">
        {[0, 1, 2, 3].map((k) => (
          <span
            key={k}
            className={cn(
              "size-[0.45em] rounded-full",
              k === 0 ? "bg-foreground" : "bg-ink-3/50",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- phone -------------------------------- */

type PhoneProps = {
  turn: MotionValue<number>;
  rig: Rig;
  finish: Finish;
  tilt: number;
  /** The reflection: no live content, no focus. */
  mirror?: boolean;
  away: boolean;
  children: React.ReactNode;
};

/**
 * The phone body in CSS 3D: a screen face, a back plate and the edge band,
 * every face shaded from the one turn value. Styles are written straight from
 * the turn's change events, so turning re-renders nothing.
 */
function Phone({
  turn,
  rig,
  finish,
  tilt,
  mirror,
  away,
  children,
}: PhoneProps) {
  const frontShade = React.useRef<HTMLSpanElement | null>(null);
  const frontGlint = React.useRef<HTMLSpanElement | null>(null);
  const backShade = React.useRef<HTMLSpanElement | null>(null);
  const backGlint = React.useRef<HTMLSpanElement | null>(null);
  const stripRefs = React.useRef<Map<string, HTMLSpanElement>>(new Map());
  const view = mirror ? -tilt : tilt;

  const paint = React.useCallback(
    (deg: number) => {
      const front = lit(rig, turned([0, 0, 1], deg, view));
      const back = lit(rig, turned([0, 0, -1], deg, view));
      if (frontShade.current)
        frontShade.current.style.opacity = String(front.shade * 0.8);
      if (backShade.current)
        backShade.current.style.opacity = String(back.shade);
      // The glass highlight slides across as the screen turns past the key.
      const slide = r3(50 - wrap180(deg) * 0.9);
      if (frontGlint.current) {
        frontGlint.current.style.backgroundPosition = `${slide}% 0%`;
        frontGlint.current.style.opacity = String(r3(0.35 + front.glint));
      }
      if (backGlint.current) {
        backGlint.current.style.backgroundPosition = `${r3(100 - slide)}% 0%`;
        backGlint.current.style.opacity = String(r3(0.25 + back.glint));
      }
      for (const s of STRIPS) {
        const el = stripRefs.current.get(s.key);
        if (!el) continue;
        const l = lit(
          rig,
          turned([Math.cos(s.a * DEG), Math.sin(s.a * DEG), 0], deg, view),
        );
        el.style.setProperty("--shade", String(l.shade));
        el.style.setProperty("--glint", String(l.glint));
      }
    },
    [rig, view],
  );
  useMotionValueEvent(turn, "change", paint);
  React.useLayoutEffect(() => paint(turn.get()), [paint, turn]);

  return (
    <motion.div
      data-phone
      className="absolute [transform-style:preserve-3d]"
      style={{
        left: "calc(50% - var(--pw) / 2)",
        top: `calc(${FLOOR * 100}% - var(--ph))`,
        width: "var(--pw)",
        height: "var(--ph)",
        rotateY: turn,
      }}
    >
      {/* Screen face */}
      <div
        className="absolute inset-0 overflow-clip [backface-visibility:hidden]"
        style={{
          borderRadius: "var(--rc)",
          transform: "translateZ(calc(var(--th) / 2))",
          backgroundColor: "oklch(0.17 0.01 260)",
          boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.14)",
        }}
      >
        <div
          aria-hidden={mirror || away || undefined}
          inert={mirror || away}
          className="[container-type:size] absolute overflow-clip"
          style={{
            inset: "calc(var(--pw) * 0.035)",
            borderRadius: "calc(var(--rc) - var(--pw) * 0.035)",
            fontSize: "calc(var(--pw) / 14)",
          }}
        >
          {children}
        </div>
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            top: "calc(var(--pw) * 0.06)",
            width: "calc(var(--pw) * 0.28)",
            height: "calc(var(--pw) * 0.075)",
            backgroundColor: "oklch(0.12 0.01 260)",
          }}
        />
        <span
          ref={frontGlint}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(115deg, transparent 36%, oklch(1 0 0 / 0.16) 46%, oklch(1 0 0 / 0.04) 54%, transparent 62%)",
            backgroundSize: "260% 100%",
          }}
        />
        <span
          ref={frontShade}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black"
        />
      </div>
      {/* Back plate */}
      <div
        aria-hidden
        className="absolute inset-0 overflow-clip [backface-visibility:hidden]"
        style={{
          borderRadius: "var(--rc)",
          transform: "rotateY(180deg) translateZ(calc(var(--th) / 2))",
          backgroundColor: finish.back,
        }}
      >
        <span
          className="absolute rounded-[22%] shadow-sm"
          style={{
            top: "calc(var(--pw) * 0.07)",
            left: "calc(var(--pw) * 0.07)",
            width: "calc(var(--pw) * 0.36)",
            height: "calc(var(--pw) * 0.36)",
            backgroundColor: `color-mix(in oklab, ${finish.back} 82%, black)`,
          }}
        >
          {[
            [26, 28],
            [26, 72],
            [72, 50],
          ].map(([x, y]) => (
            <span
              key={`${x}-${y}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: "34%",
                height: "34%",
                backgroundColor: "oklch(0.16 0.01 260)",
                boxShadow: `0 0 0 2px color-mix(in oklab, ${finish.back} 60%, white)`,
              }}
            />
          ))}
        </span>
        <span
          ref={backGlint}
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(100deg, transparent 30%, oklch(1 0 0 / 0.18) 48%, transparent 66%)",
            backgroundSize: "240% 100%",
          }}
        />
        <span
          ref={backShade}
          className="pointer-events-none absolute inset-0 bg-black"
        />
      </div>
      {/* Edge band */}
      {STRIPS.map((s) => (
        <span
          key={s.key}
          ref={(node) => {
            if (node) stripRefs.current.set(s.key, node);
            else stripRefs.current.delete(s.key);
          }}
          aria-hidden
          className="absolute [backface-visibility:hidden]"
          style={{
            left: `calc(${s.x} - ${s.len} / 2)`,
            top: `calc(${s.y} - var(--th) / 2)`,
            width: s.len,
            height: "var(--th)",
            transform: `rotateZ(${r3(s.a - 90)}deg) rotateX(-90deg)`,
            backgroundColor: finish.edge,
            backgroundImage: `linear-gradient(180deg, oklch(0 0 0 / calc(0.25 + var(--shade, 0.2))), oklch(0 0 0 / var(--shade, 0.2)) 45%, color-mix(in oklab, ${finish.glint} calc(var(--glint, 0) * 100%), transparent) 55%, oklch(0 0 0 / calc(0.3 + var(--shade, 0.2))))`,
          }}
        />
      ))}
    </motion.div>
  );
}

/* --------------------------------- turntable ----------------------------- */

const TICKS = Array.from({ length: 36 }, (_, k) => {
  const a = (k / 36) * Math.PI * 2;
  const major = k % 9 === 0;
  return {
    k,
    major,
    x1: r3(Math.cos(a) * (major ? 40 : 43)),
    y1: r3(Math.sin(a) * (major ? 40 : 43)),
    x2: r3(Math.cos(a) * 46),
    y2: r3(Math.sin(a) * 46),
  };
});

const RIM = Array.from({ length: 20 }, (_, k) => ({
  k,
  a: r3((k * 360) / 20),
  shade: r3(0.2 + 0.25 * (1 - Math.cos(((k * 360) / 20) * DEG)) * 0.5),
}));

/* ------------------------------- component ------------------------------- */

/**
 * A product shot you can handle: a phone standing on a turntable on a
 * seamless studio sweep under a light rig, its screen real content. The phone
 * is a CSS 3D body — screen face, back plate in its finish, and an edge band
 * of strips that rounds every corner — and every face is shaded from one turn
 * value: diffuse from the key, rim light on the edges as they pass the lamps,
 * a highlight sliding across the glass. A mirrored copy lies in the glossy
 * floor and a contact shadow narrows and widens as it turns.
 *
 * Drag turns the turntable 1:1, all the way round. Released, the throw is
 * projected and the phone eases back to face you at the nearest copy of its
 * rest pose on springs.drift with the release velocity, so a hard flick spins
 * it round once more before it settles. The turntable plate is a slider: the
 * arrow keys turn it 30° on springs.snap and it eases home after `hold`; Home
 * faces it, End shows the back. Under reduced motion a drag still turns it, and
 * every return is a cross-fade.
 */
export function SweepStudio({
  children,
  lightRig = "soft",
  angle = -18,
  finish = "graphite",
  autoTurn = 0,
  hold = 900,
  tilt = 8,
  gloss = 0.5,
  perspective = 1400,
  colors,
  onSideChange,
  interactive = true,
  label = "Phone on a turntable",
  className,
}: SweepStudioProps) {
  const motionSafe = useMotionSafe();
  const rig = RIGS[lightRig] ?? RIGS.soft;
  const body = FINISHES[finish] ?? FINISHES.graphite;
  const rest = clamp(angle, -60, 60);
  const view = clamp(tilt, 0, 20);
  const shine = clamp01(gloss);
  const hintId = React.useId();

  const turn = useMotionValue(rest);
  const dim = useMotionValue(1);
  const footprint = useTransform(turn, (d) => r3(-d));
  const [shown, setShown] = React.useState(() => Math.round(wrap180(rest)));
  const [side, setSide] = React.useState<SweepStudioSide>(() => sideOf(rest));

  const anim = React.useRef<AnimationPlaybackControlsWithThen | null>(null);
  const holdTimer = React.useRef(0);
  const target = React.useRef(rest);
  const dragging = React.useRef(false);
  const grab = React.useRef({ deg: 0, half: 80 });
  const phoneRef = React.useRef<HTMLDivElement | null>(null);
  const visible = React.useRef(true);
  const sideCb = React.useRef(onSideChange);
  const live = React.useRef({ rest, hold, autoTurn, motionSafe });
  React.useEffect(() => {
    sideCb.current = onSideChange;
    live.current = { rest, hold, autoTurn, motionSafe };
  });

  const sideNow = React.useRef(side);
  useMotionValueEvent(turn, "change", (d) => {
    const next = sideOf(d);
    if (next === sideNow.current) return;
    sideNow.current = next;
    setSide(next);
    sideCb.current?.(next);
  });

  const stop = React.useCallback(() => {
    anim.current?.stop();
    anim.current = null;
    window.clearTimeout(holdTimer.current);
  }, []);
  React.useEffect(() => stop, [stop]);

  /** The nearest copy of the rest pose to an angle. */
  const home = (from: number) => {
    const r = live.current.rest;
    return r + 360 * Math.round((from - r) / 360);
  };

  const fadeTo = React.useCallback(
    (deg: number) => {
      stop();
      target.current = deg;
      anim.current = animate(dim, 0, {
        duration: durations.fast,
        ease: easings.exit,
      });
      void anim.current.then(() => {
        turn.jump(deg);
        setShown(Math.round(wrap180(deg)));
        anim.current = animate(dim, 1, {
          duration: durations.base,
          ease: easings.enter,
        });
      });
    },
    [dim, stop, turn],
  );

  const settleHome = React.useCallback(
    (velocity = 0) => {
      const v = live.current;
      const from = turn.get();
      const landing = v.motionSafe ? project(from, velocity, 0.995) : from;
      const to = home(landing);
      target.current = to;
      setShown(Math.round(wrap180(to)));
      if (!v.motionSafe) {
        if (Math.abs(to - from) > 0.5) fadeTo(to);
        return;
      }
      stop();
      anim.current = animate(turn, to, { ...springs.drift, velocity });
    },
    [fadeTo, stop, turn],
  );

  // A new rest pose: it turns there, as a release would.
  const lastRest = React.useRef(rest);
  React.useEffect(() => {
    if (lastRest.current === rest) return;
    lastRest.current = rest;
    if (!dragging.current && autoTurn <= 0) settleHome();
  }, [autoTurn, rest, settleHome]);

  // The showcase turn: only on screen, with the page visible and motion allowed.
  const wake = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    if (autoTurn <= 0 || !motionSafe) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = 0;
      if (!visible.current || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!dragging.current && !anim.current) {
        turn.set(turn.get() + autoTurn * dt);
      }
      frame = window.requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!frame) frame = window.requestAnimationFrame(tick);
    };
    wake.current = kick;
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    kick();
    return () => {
      wake.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [autoTurn, motionSafe, turn]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) wake.current();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !interactive,
    onStart: () => {
      stop();
      dragging.current = true;
      const width =
        phoneRef.current?.querySelector<HTMLElement>("[data-phone]")
          ?.offsetWidth ?? 160;
      grab.current = { deg: turn.get(), half: Math.max(40, width / 2) };
    },
    onMove: ({ offset }) => {
      // Half a phone's width of travel is one radian, all the way round.
      turn.set(grab.current.deg + offset.x / grab.current.half / DEG);
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = velocity.x / grab.current.half / DEG;
      if (live.current.autoTurn > 0 && live.current.motionSafe) {
        // A showcase picks up its slow turn again from wherever it was left.
        anim.current = animate(turn, project(turn.get(), v, 0.99), {
          ...springs.drift,
          velocity: v,
        });
        void anim.current.then(() => {
          anim.current = null;
        });
        return;
      }
      settleHome(v);
    },
    onCancel: () => {
      dragging.current = false;
      settleHome(0);
    },
  });

  const turnBy = (to: number, spring: "snap" | "glide") => {
    stop();
    target.current = to;
    setShown(Math.round(wrap180(to)));
    if (motionSafe) {
      anim.current = animate(turn, to, springs[spring]);
    } else {
      turn.jump(to);
      animate(dim, [0.6, 1], { duration: durations.base, ease: easings.enter });
    }
    holdTimer.current = window.setTimeout(
      () => {
        if (!dragging.current) settleHome();
      },
      clamp(hold, 0, 10000),
    );
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const base = anim.current ? target.current : turn.get();
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      turnBy(base - 30, "snap");
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      turnBy(base + 30, "snap");
    } else if (event.key === "Home") {
      event.preventDefault();
      stop();
      settleHome();
    } else if (event.key === "End") {
      event.preventDefault();
      turnBy(home(base) + 180, "glide");
    }
  };

  const away = side === "back";
  const palette = {
    wall:
      colors?.wall ?? "color-mix(in oklab, var(--secondary) 64%, var(--ink-3))",
    floor:
      colors?.floor ??
      "color-mix(in oklab, var(--secondary) 84%, var(--ink-3))",
  };
  const valueText = `Turned ${Math.abs(shown)} degrees${
    shown === 0 ? "" : shown > 0 ? " to the right" : " to the left"
  }, showing ${
    side === "front"
      ? "the screen"
      : side === "back"
        ? "the back"
        : shown > 0
          ? "the left edge"
          : "the right edge"
  }.`;
  const screen = children ?? <TransitScreen />;
  const geometry = {
    "--ph": "min(58cqh, calc(44cqw * 2.06))",
    "--pw": "calc(var(--ph) / 2.06)",
    "--rc": "calc(var(--pw) * 0.16)",
    "--th": "max(6px, calc(var(--pw) * 0.058))",
    "--td": "calc(var(--pw) * 1.7)",
  } as React.CSSProperties;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      {...(interactive ? drag : {})}
      className={cn(
        "group/sweep-studio [container-type:size] relative isolate h-[30rem] w-full overflow-clip rounded-4 select-none",
        interactive && "cursor-grab touch-pan-y active:cursor-grabbing",
        className,
      )}
      style={{
        ...geometry,
        backgroundColor: palette.floor,
        // The sweep: darker up the wall, brightest in the cove where the
        // lights meet the floor, falling off toward the front.
        backgroundImage: `${rig.sweep}, radial-gradient(70% 40% at 50% 62%, oklch(1 0 0 / 0.1), transparent 70%), linear-gradient(180deg, color-mix(in oklab, ${palette.wall} 84%, black) 0%, ${palette.wall} 40%, color-mix(in oklab, ${palette.floor} 82%, white) 64%, ${palette.floor} 78%, color-mix(in oklab, ${palette.floor} 82%, black) 100%)`,
      }}
    >
      {/* The turntable: a plate in the floor's plane, its ticks turning with the phone. */}
      <div
        aria-hidden
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{ perspective, perspectiveOrigin: `50% ${FLOOR * 100 - 22}%` }}
      >
        <motion.div
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{
            transformOrigin: `50% ${FLOOR * 100}%`,
            rotateX: -view,
            opacity: dim,
          }}
        >
          {RIM.map((s) => (
            <span
              key={s.k}
              className="absolute [backface-visibility:hidden]"
              style={{
                left: "calc(50% - var(--td) * 0.079)",
                top: `${FLOOR * 100}%`,
                width: "calc(var(--td) * 0.157 + 1px)",
                height: "calc(var(--th) * 0.8)",
                transform: `rotateY(${s.a}deg) translateZ(calc(var(--td) / 2 * 0.988))`,
                backgroundColor: `color-mix(in oklab, ${palette.floor} ${r3(100 - s.shade * 100)}%, black)`,
              }}
            />
          ))}
          <div
            className="absolute rounded-full"
            style={{
              left: "calc(50% - var(--td) / 2)",
              top: `calc(${FLOOR * 100}% - var(--td) / 2)`,
              width: "var(--td)",
              height: "var(--td)",
              transform: "rotateX(90deg)",
              backgroundImage: `radial-gradient(closest-side, color-mix(in oklab, ${palette.floor} 78%, white), color-mix(in oklab, ${palette.floor} 94%, black) 88%, color-mix(in oklab, ${palette.floor} 70%, black) 97%, color-mix(in oklab, ${palette.floor} 60%, white))`,
            }}
          >
            <motion.svg
              viewBox="-50 -50 100 100"
              className="absolute inset-0 size-full"
              style={{ rotate: footprint }}
            >
              {TICKS.map((t) => (
                <line
                  key={t.k}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  className="stroke-ink-3"
                  strokeOpacity={t.major ? 0.7 : 0.35}
                  strokeWidth={t.major ? 1 : 0.6}
                />
              ))}
            </motion.svg>
            <motion.span
              className="absolute top-1/2 left-1/2 rounded-full bg-black"
              style={{
                width: "62%",
                height: "8%",
                x: "-50%",
                y: "-50%",
                rotate: footprint,
                opacity: rig.shadow,
                filter: "blur(6px)",
              }}
            />
          </div>
        </motion.div>
      </div>

      {/* The reflection in the glossy floor: the phone seen from below, flipped. */}
      {shine > 0 ? (
        <motion.div
          aria-hidden
          inert
          className="pointer-events-none absolute inset-0"
          style={{
            transformOrigin: `50% ${FLOOR * 100}%`,
            scaleY: -1,
            opacity: r3(shine * 0.42),
            maskImage: `linear-gradient(180deg, transparent ${r3(FLOOR * 100 - 26)}%, black ${FLOOR * 100}%)`,
            WebkitMaskImage: `linear-gradient(180deg, transparent ${r3(FLOOR * 100 - 26)}%, black ${FLOOR * 100}%)`,
          }}
        >
          <motion.div
            className="absolute inset-0 [transform-style:preserve-3d]"
            style={{
              perspective,
              perspectiveOrigin: `50% ${r3(FLOOR * 100 + 22)}%`,
              opacity: dim,
            }}
          >
            <div
              className="absolute inset-0 [transform-style:preserve-3d]"
              style={{
                transformOrigin: `50% ${FLOOR * 100}%`,
                transform: `rotateX(${view}deg)`,
              }}
            >
              <Phone
                turn={turn}
                rig={rig}
                finish={body}
                tilt={view}
                mirror
                away
              >
                {screen}
              </Phone>
            </div>
          </motion.div>
        </motion.div>
      ) : null}

      {/* The phone. */}
      <div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{ perspective, perspectiveOrigin: `50% ${FLOOR * 100 - 22}%` }}
      >
        <motion.div
          ref={phoneRef}
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{
            transformOrigin: `50% ${FLOOR * 100}%`,
            rotateX: -view,
            opacity: dim,
          }}
        >
          <Phone turn={turn} rig={rig} finish={body} tilt={view} away={away}>
            {screen}
          </Phone>
        </motion.div>
      </div>

      {/* The turntable's plate is the keyboard control. */}
      <div
        role="slider"
        tabIndex={interactive ? 0 : -1}
        aria-label="Turn the phone"
        aria-describedby={hintId}
        aria-valuemin={-180}
        aria-valuemax={180}
        aria-valuenow={shown}
        aria-valuetext={valueText}
        aria-disabled={!interactive || undefined}
        onKeyDown={onKeyDown}
        className="absolute rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid"
        style={{
          left: "calc(50% - var(--td) / 2)",
          width: "var(--td)",
          top: `calc(${FLOOR * 100}% - var(--td) * ${r3(Math.sin(view * DEG) / 2)})`,
          height: `calc(var(--td) * ${r3(Math.sin(view * DEG))} + var(--th))`,
        }}
      />
      <span id={hintId} className="sr-only">
        Drag sideways or use the arrow keys to turn the phone; it eases back to
        face you. Home faces it now, End shows the back.
      </span>
    </div>
  );
}

function sideOf(deg: number): SweepStudioSide {
  const a = Math.abs(wrap180(deg));
  return a < 62 ? "front" : a > 118 ? "back" : "edge";
}
