"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type TurnstileCard = {
  /** A picture. Without one, `art` or a drawn room is shown. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** The card's title. Defaults to `alt`. */
  caption?: string;
  /** A short line under the title. */
  detail?: string;
  /** Your own art, filling the picture area. */
  art?: React.ReactNode;
};

export type TurnstileCardsProps = {
  /** The cards; any number ride on any number of wings. @default defaultTurnstileCards */
  items?: TurnstileCard[];
  /** Controlled: the card facing you. */
  value?: number;
  /** Initial card when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the push, click or key that chose the next card, with the card it will settle on. */
  onValueChange?: (index: number) => void;
  /** How many glass wings the turnstile has, 3 to 6. @default 4 */
  wings?: number;
  /** How quickly a push dies away, 0 (coasts long) to 1 (stops short). @default 0.45 */
  friction?: number;
  /** How clear the glass is, 0 (frosted) to 1 (clear: the wings behind show through). @default 0.55 */
  glass?: number;
  /** How firmly each wing is pulled square at its detent, 0 to 1. @default 0.5 */
  detent?: number;
  /** How far above the eye looks down, 0 to 24 degrees. @default 12 */
  tilt?: number;
  /** Distance of the eye from the turnstile, px. @default 1800 */
  perspective?: number;
  /** Height of the stage, px. @default 440 */
  height?: number;
  /** The floor plate, its turning ring of ticks and the wings' base shadows. @default true */
  floor?: boolean;
  /** A reflection that slides across the glass as each wing turns. @default true */
  sheen?: boolean;
  /** The turnstile's accessible name. @default "Cards" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

/** Radius of the post, px: wings hang from its surface. */
const POST = 4;
/** Integration step, seconds. The live loop and the landing prediction share it. */
const STEP = 1 / 240;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const wrapDeg = (d: number) => mod(d + 180, 360) - 180;

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/* --------------------------------- physics ------------------------------- */

type Physics = { K: number; c: number; low: number };
type State = { s: number; v: number };

/**
 * The turnstile's physics, in wings (one unit is one wing's turn): a soft cam
 * at every wing (a sinusoidal well, so a fast turn ticks over each one and a
 * slow one is caught), viscous friction, and a damper that bites only at low
 * speed — the way a revolving door coasts freely and then settles softly
 * instead of ringing in its detent.
 */
const physicsOf = (friction: number, detent: number): Physics => {
  const omega = lerp(3.5, 8.5, clamp01(detent));
  return {
    K: omega * omega,
    c: lerp(0.45, 4.5, clamp01(friction)),
    low: 2 * 0.62 * omega,
  };
};

function stepFree(st: State, p: Physics) {
  const slow = 1 / (1 + (st.v / 1.4) ** 4);
  const a =
    (-p.K * Math.sin(2 * Math.PI * st.s)) / (2 * Math.PI) -
    (p.c + p.low * slow) * st.v;
  st.v += a * STEP;
  st.s += st.v * STEP;
}

const atRest = (st: State) =>
  Math.abs(st.v) < 0.01 && Math.abs(st.s - Math.round(st.s)) < 0.0015;

/** Runs the same fixed steps ahead to find the wing a release will land on. */
function predict(s: number, v: number, p: Physics): number {
  const st = { s, v };
  for (let i = 0; i < 240 * 30; i += 1) {
    stepFree(st, p);
    if (atRest(st)) break;
  }
  return Math.round(st.s);
}

/** Which card each wing carries at a turn: the step nearest it when it faces you. */
function slotsFor(s: number, wings: number, cards: number): number[] {
  return Array.from({ length: wings }, (_, j) => {
    const k = -j + wings * Math.round((s + j) / wings);
    return mod(k, Math.max(1, cards));
  });
}

/* ----------------------------------- art --------------------------------- */

export const defaultTurnstileCards: TurnstileCard[] = [
  {
    alt: "A harbour at first light, two boats at the quay",
    caption: "North Quay",
    detail: "Harbour room · sleeps 2",
  },
  {
    alt: "A white salt flat mirroring a pale sky",
    caption: "Salt Flats",
    detail: "Studio · sleeps 2",
  },
  {
    alt: "Plants growing under an arched glass roof",
    caption: "Glasshouse",
    detail: "Garden suite · sleeps 3",
  },
  {
    alt: "A cedar-panelled room with a reading lamp",
    caption: "Cedar Hall",
    detail: "Library room · sleeps 2",
  },
  {
    alt: "Ripples in the sand at low tide under a low sun",
    caption: "Low Tide",
    detail: "Beach cabin · sleeps 4",
  },
  {
    alt: "Warm windows along a narrow lane at dusk",
    caption: "Ember Lane",
    detail: "Town loft · sleeps 2",
  },
];

/** A drawn room or view for each default card: shapes in pigments, no files. */
function RoomArt({ index }: { index: number }) {
  const common = {
    viewBox: "0 0 120 90",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  switch (mod(index, 6)) {
    case 0:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="90"
            style={{ fill: pig("--accent", 0.9, 0.04) }}
          />
          <circle
            cx="86"
            cy="34"
            r="9"
            style={{ fill: pig("--warn", 0.9, 0.09) }}
          />
          <rect
            y="50"
            width="120"
            height="40"
            style={{ fill: pig("--accent", 0.62, 0.09) }}
          />
          {[56, 62, 68].map((y) => (
            <path
              key={y}
              d={`M${10 + y} ${y} h${30 - (y - 56)}`}
              style={{ stroke: pig("--accent", 0.82, 0.05) }}
              strokeWidth="1"
            />
          ))}
          <path
            d="M0 74 H120 V90 H0 Z"
            style={{ fill: pig("--ink-2", 0.45, 0.02) }}
          />
          {[14, 34, 54].map((x) => (
            <rect
              key={x}
              x={x}
              y="69"
              width="4"
              height="6"
              rx="1"
              style={{ fill: pig("--ink-2", 0.3, 0.02) }}
            />
          ))}
          <path
            d="M66 62 h26 l-4 6 h-18 Z"
            style={{ fill: pig("--danger", 0.55, 0.12) }}
          />
          <path
            d="M78 62 V44 l9 16 Z"
            style={{ fill: pig("--accent", 0.97, 0.01) }}
          />
          <path
            d="M22 60 h18 l-3 5 h-12 Z"
            style={{ fill: pig("--ink-2", 0.35, 0.03) }}
          />
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="46"
            style={{ fill: pig("--accent", 0.88, 0.05, -20) }}
          />
          <rect
            y="46"
            width="120"
            height="44"
            style={{ fill: pig("--accent", 0.95, 0.02, -20) }}
          />
          <path
            d="M0 46 L18 38 L34 44 L52 34 L70 43 L90 37 L120 45 V46 H0 Z"
            style={{ fill: pig("--accent", 0.7, 0.06, -10) }}
          />
          <path
            d="M0 46 L18 54 L34 48 L52 58 L70 49 L90 55 L120 47 V46 H0 Z"
            style={{ fill: pig("--accent", 0.86, 0.03, -10) }}
          />
          <rect
            x="60"
            y="38"
            width="2"
            height="8"
            style={{ fill: pig("--ink-2", 0.3, 0.02) }}
          />
          <rect
            x="60"
            y="46"
            width="2"
            height="8"
            opacity="0.35"
            style={{ fill: pig("--ink-2", 0.3, 0.02) }}
          />
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="90"
            style={{ fill: pig("--success", 0.9, 0.04) }}
          />
          <path
            d="M8 90 V40 Q60 -6 112 40 V90"
            fill="none"
            style={{ stroke: pig("--ink-2", 0.5, 0.02) }}
            strokeWidth="2"
          />
          {[30, 60, 90].map((x) => (
            <path
              key={x}
              d={`M${x} 90 V${x === 60 ? 18 : 30}`}
              style={{ stroke: pig("--ink-2", 0.55, 0.02) }}
              strokeWidth="1.2"
            />
          ))}
          <path
            d="M8 56 H112"
            style={{ stroke: pig("--ink-2", 0.55, 0.02) }}
            strokeWidth="1"
          />
          {[
            [24, 74, 14],
            [46, 70, 18],
            [72, 76, 13],
            [94, 70, 16],
            [60, 80, 10],
          ].map(([x, y, r]) => (
            <circle
              key={x}
              cx={x}
              cy={y}
              r={r}
              style={{
                fill: pig("--success", 0.55 + ((x ?? 0) % 3) * 0.06, 0.13),
              }}
            />
          ))}
        </svg>
      );
    case 3:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="90"
            style={{ fill: pig("--warn", 0.5, 0.07, -25) }}
          />
          {Array.from({ length: 12 }, (_, k) => (
            <rect
              key={k}
              x={k * 10}
              y="0"
              width="9"
              height="62"
              style={{ fill: pig("--warn", 0.46 + (k % 3) * 0.03, 0.07, -25) }}
            />
          ))}
          <rect
            y="62"
            width="120"
            height="28"
            style={{ fill: pig("--warn", 0.34, 0.05, -25) }}
          />
          <circle
            cx="84"
            cy="34"
            r="22"
            style={{ fill: pig("--warn", 0.85, 0.12) }}
            opacity="0.35"
          />
          <path
            d="M78 30 h12 l-3 -8 h-6 Z"
            style={{ fill: pig("--warn", 0.92, 0.1) }}
          />
          <path
            d="M84 30 V62"
            style={{ stroke: pig("--ink-2", 0.25, 0.01) }}
            strokeWidth="1.5"
          />
          <path
            d="M20 60 q0 -16 14 -16 h12 q14 0 14 16 v10 h-40 Z"
            style={{ fill: pig("--danger", 0.45, 0.1, 20) }}
          />
        </svg>
      );
    case 4:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="40"
            style={{ fill: pig("--warn", 0.9, 0.06) }}
          />
          <circle
            cx="40"
            cy="38"
            r="10"
            style={{ fill: pig("--warn", 0.84, 0.13) }}
          />
          <rect
            y="38"
            width="120"
            height="10"
            style={{ fill: pig("--accent", 0.72, 0.07) }}
          />
          <rect
            y="48"
            width="120"
            height="42"
            style={{ fill: pig("--warn", 0.8, 0.06, -10) }}
          />
          {[54, 62, 71, 81].map((y, k) => (
            <path
              key={y}
              d={`M0 ${y} Q30 ${y - 3} 60 ${y} T120 ${y}`}
              fill="none"
              style={{ stroke: pig("--warn", 0.68 - k * 0.02, 0.06, -10) }}
              strokeWidth={r3(1.2 + k * 0.3)}
            />
          ))}
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="90"
            style={{ fill: pig("--accent", 0.35, 0.07, 20) }}
          />
          <path
            d="M0 90 V30 h22 V18 h18 V36 h20 V24 h24 V40 h36 V90 Z"
            style={{ fill: pig("--accent", 0.22, 0.04, 20) }}
          />
          {[
            [6, 40],
            [12, 52],
            [26, 26],
            [32, 44],
            [66, 32],
            [74, 48],
            [92, 50],
            [104, 60],
            [46, 56],
          ].map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="5"
              height="7"
              style={{ fill: pig("--warn", 0.82, 0.13) }}
            />
          ))}
          <path
            d="M50 90 L58 66 h4 L70 90 Z"
            style={{ fill: pig("--warn", 0.6, 0.08) }}
            opacity="0.5"
          />
        </svg>
      );
  }
}

/* ------------------------------- simulation ------------------------------ */

type SpringDef = { stiffness: number; damping: number; mass: number };

type Sim = {
  /** Let go with a velocity, in wings per second: the physics carries it. */
  free: (v: number) => void;
  /** Spring to a step (keys, clicks, a host's value). */
  steer: (target: number, spring: SpringDef) => void;
  stop: () => void;
  wake: () => void;
  dispose: () => void;
};

/**
 * The one loop: free (inertia, friction, detents — in whole fixed steps, so it
 * lands exactly where `predict` said) or steering on a spring. It runs only
 * while the turnstile moves and is on screen, and stops at rest.
 */
function createSim(
  turn: MotionValue<number>,
  physics: () => Physics,
  visible: () => boolean,
  onRest: (step: number) => void,
): Sim {
  let mode: "idle" | "free" | "steer" = "idle";
  let v = 0;
  let target = 0;
  let acc = 0;
  let frame = 0;
  let last = 0;
  let spring: SpringDef = springs.glide;
  let disposed = false;
  const state: State = { s: 0, v: 0 };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || mode === "idle") return;
    if (!visible() || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    state.s = turn.get();
    state.v = v;
    let done = false;
    if (mode === "free") {
      // Whole fixed steps, exactly as the prediction ran them.
      acc += dt;
      const p = physics();
      while (acc >= STEP && !done) {
        acc -= STEP;
        stepFree(state, p);
        if (atRest(state)) done = true;
      }
    } else {
      let left = dt;
      while (left > 1e-7) {
        const h = Math.min(STEP, left);
        left -= h;
        const a =
          (-spring.stiffness * (state.s - target) - spring.damping * state.v) /
          spring.mass;
        state.v += a * h;
        state.s += state.v * h;
      }
      if (Math.abs(state.s - target) < 0.001 && Math.abs(state.v) < 0.01) {
        done = true;
      }
    }
    v = state.v;
    if (done) {
      const landed = Math.round(state.s);
      turn.set(landed);
      v = 0;
      mode = "idle";
      last = 0;
      onRest(landed);
      return;
    }
    turn.set(state.s);
    frame = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (disposed || frame || mode === "idle") return;
    frame = window.requestAnimationFrame(tick);
  };

  const stop = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    mode = "idle";
    v = 0;
  };

  return {
    free(velocity) {
      mode = "free";
      v = velocity;
      acc = 0;
      kick();
    },
    steer(to, sp) {
      // Keeps the speed it had, so a retarget mid-turn does not jolt.
      mode = "steer";
      target = to;
      spring = sp;
      kick();
    },
    stop,
    wake: kick,
    dispose() {
      disposed = true;
      stop();
    },
  };
}

/* ---------------------------------- wing --------------------------------- */

type WingProps = {
  index: number;
  wings: number;
  turn: MotionValue<number>;
  card: TurnstileCard | undefined;
  cardIndex: number;
  cards: number;
  facing: boolean;
  glass: number;
  sheen: boolean;
  slideId: string;
};

/**
 * One glass wing: a front face with the card mounted on it, and a bare back.
 * Its angle, its shade from a light at the upper left and the sheen on its
 * glass are read from the turnstile's one turn value.
 */
function Wing({
  index,
  wings,
  turn,
  card,
  cardIndex,
  cards,
  facing,
  glass,
  sheen,
  slideId,
}: WingProps) {
  const angle = useTransform(turn, (s) =>
    r3(wrapDeg(((s + index) * 360) / wings)),
  );
  // Light from the upper right and in front: the face toward the eye is lit,
  // a wing turning edge-on or away dims, and no face ever goes black.
  const light = (deg: number, back: boolean) => {
    const a = (deg * Math.PI) / 180;
    const n = back ? -1 : 1;
    const d = clamp01(n * (0.5 * Math.sin(a) + 0.86 * Math.cos(a)));
    return r3((1 - d) * 0.36);
  };
  const shadeFront = useTransform(angle, (deg) => light(deg, false));
  const shadeBack = useTransform(angle, (deg) => light(deg, true));
  const sheenX = useTransform(
    angle,
    (deg) => `${r3(50 + clamp(deg, -100, 100) * 0.9)}% 0%`,
  );
  const pane = Math.round(lerp(92, 20, clamp01(glass)));
  const mount = r3(lerp(1, 0.95, clamp01(glass)));
  const title = card?.caption ?? card?.alt ?? "";

  return (
    <motion.div
      data-wing={index}
      className="absolute [transform-style:preserve-3d]"
      style={{
        left: `calc(var(--ax) + ${POST}px)`,
        top: "calc(var(--cy) - var(--wh) / 2)",
        width: `calc(var(--ww) - ${POST}px)`,
        height: "var(--wh)",
        transformOrigin: `${-POST}px 50%`,
        rotateY: angle,
      }}
    >
      <div
        id={facing ? slideId : undefined}
        role="group"
        aria-roledescription="slide"
        aria-label={`${cardIndex + 1} of ${cards}: ${title}`}
        aria-hidden={facing ? undefined : true}
        className="absolute inset-0 overflow-clip rounded-3 border border-hairline-strong [backface-visibility:hidden]"
        style={{
          background: `color-mix(in oklab, var(--card) ${pane}%, transparent)`,
        }}
      >
        {/* Inert content, not an inert face: a tap on a wing still finds it. */}
        <div
          inert={!facing}
          className="absolute inset-2 flex flex-col overflow-clip rounded-2 bg-card shadow-sm"
          style={{ opacity: mount }}
        >
          <div className="relative flex-1 basis-0 overflow-hidden bg-muted">
            {card?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.src}
                alt={card.alt}
                draggable={false}
                className="block size-full object-cover"
              />
            ) : card?.art ? (
              card.art
            ) : (
              <RoomArt index={cardIndex} />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
            <p className="truncate text-sm font-medium text-foreground">
              {title}
            </p>
            {card?.detail ? (
              <p className="truncate text-xs text-ink-3">{card.detail}</p>
            ) : null}
          </div>
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-ink-3/50 via-ink-2/20 to-ink-3/50"
        />
        {sheen ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(105deg, transparent 38%, oklch(1 0 0 / 0.22) 47%, oklch(1 0 0 / 0.06) 53%, transparent 62%)",
              backgroundSize: "260% 100%",
              backgroundPosition: sheenX,
            }}
          />
        ) : null}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: shadeFront }}
        />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 [transform:rotateY(180deg)] overflow-clip rounded-3 border border-hairline-strong [backface-visibility:hidden]"
        style={{
          background: `color-mix(in oklab, var(--card) ${pane}%, transparent)`,
        }}
      >
        <div className="absolute inset-2 rounded-2 border border-hairline bg-muted/40" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(120deg, oklch(1 0 0 / 0.14), transparent 40%, oklch(1 0 0 / 0.05) 70%, transparent)",
          }}
        />
        <motion.span
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: shadeBack }}
        />
      </div>
    </motion.div>
  );
}

/* ------------------------------- component ------------------------------- */

/**
 * Cards on the glass wings of a turnstile seen from slightly above. The wing
 * facing you is square to the eye; the others recede behind the post and swing
 * round in front of it in real perspective, each shaded by its angle with a
 * sheen sliding across its glass and a shadow turning on the floor. A wing that
 * passes straight behind the post shows its bare back and silently picks up the
 * next card, so any number of cards ride on any number of wings.
 *
 * Push it: the turn follows the hand along the arc it grabbed, and on release
 * a fixed-step integrator takes over — inertia, viscous friction and a soft
 * cam detent at every wing with a damper that bites only when slow — so a
 * gentle push settles into the next wing with a soft overshoot and a hard one
 * spins through several, ticking over each, before one is caught square. The
 * landing is found at release by running the same steps ahead, so the new card
 * is reported from the gesture. Arrow keys turn one wing on springs.snap; a
 * click on another wing brings it round on springs.glide. Under reduced motion
 * a drag still turns it, and every landing is an instant swap with a short dip.
 */
export function TurnstileCards({
  items = defaultTurnstileCards,
  value,
  defaultValue = 0,
  onValueChange,
  wings = 4,
  friction = 0.45,
  glass = 0.55,
  detent = 0.5,
  tilt = 12,
  perspective = 1800,
  height = 440,
  floor = true,
  sheen = true,
  label = "Cards",
  disabled = false,
  className,
}: TurnstileCardsProps) {
  const motionSafe = useMotionSafe();
  const list = items.length > 0 ? items : defaultTurnstileCards;
  const M = list.length;
  const N = clamp(Math.round(wings), 3, 6);
  const hintId = React.useId();
  const slideId = React.useId();

  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), M));
  const current = value === undefined ? own : mod(Math.round(value), M);
  const [said, setSaid] = React.useState("");

  const turn = useMotionValue(current);
  const dim = useMotionValue(1);
  // Wings swap cards behind the post, where only their bare backs show, so
  // the swap is read at quarter-wing resolution: React renders only then.
  const [quarter, setQuarter] = React.useState(() => Math.round(current * 4));
  useMotionValueEvent(turn, "change", (s) => setQuarter(Math.round(s * 4)));
  const slots = slotsFor(quarter / 4, N, M);
  const front = mod(-Math.round(quarter / 4), N);

  /** The step the turnstile rests on or is heading for. */
  const heading = React.useRef(current);
  const sim = React.useRef<Sim | null>(null);
  const grab = React.useRef({ s: 0, r: 1 });
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  /** Called when a turn comes to rest; reconciles with a host that refused it. */
  const settled = React.useRef<(step: number) => void>(() => {});
  const visible = React.useRef(true);
  const physics = physicsOf(friction, detent);
  const live = React.useRef({ physics, motionSafe });
  React.useEffect(() => {
    live.current = { physics, motionSafe };
  });

  React.useEffect(() => {
    const engine = createSim(
      turn,
      () => live.current.physics,
      () => visible.current,
      (step) => {
        heading.current = step;
        settled.current(step);
      },
    );
    sim.current = engine;
    return () => {
      engine.dispose();
      if (sim.current === engine) sim.current = null;
    };
  }, [turn]);

  const dip = React.useCallback(() => {
    animate(dim, [1, 0.55, 1], {
      duration: durations.base,
      ease: easings.move,
    });
  }, [dim]);

  /** Glide or snap to a step; under reduced motion, jump there with a dip. */
  const steerTo = React.useCallback(
    (target: number, spring: "snap" | "glide") => {
      heading.current = target;
      if (!live.current.motionSafe) {
        sim.current?.stop();
        turn.jump(target);
        dip();
        return;
      }
      sim.current?.steer(target, springs[spring]);
    },
    [dip, turn],
  );

  const commit = (step: number) => {
    const index = mod(step, M);
    const card = list[index];
    setSaid(`${card?.caption ?? card?.alt ?? ""}, ${index + 1} of ${M}.`);
    if (index === current) return;
    if (value === undefined) setOwn(index);
    onValueChange?.(index);
  };

  // A controlled host that did not take the new card gets its own card back.
  React.useEffect(() => {
    settled.current = (step) => {
      const at = mod(step, M);
      if (at === current) return;
      let delta = current - at;
      if (delta > M / 2) delta -= M;
      if (delta < -M / 2) delta += M;
      steerTo(step + delta, Math.abs(delta) > 1 ? "glide" : "snap");
    };
  });

  // A host that changes `value` turns the turnstile the short way round.
  React.useEffect(() => {
    const at = mod(heading.current, M);
    if (at === current) return;
    let delta = current - at;
    if (delta > M / 2) delta -= M;
    if (delta < -M / 2) delta += M;
    steerTo(heading.current + delta, Math.abs(delta) > 1 ? "glide" : "snap");
  }, [M, current, steerTo]);

  // Back on screen mid-turn: carry on from where it was.
  const bindStage = React.useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) sim.current?.wake();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) sim.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const alpha = (Math.PI * 2) / N;

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: ({ point, offset }) => {
      sim.current?.stop();
      const stage = stageRef.current;
      const rect = stage?.getBoundingClientRect();
      const wingEl = stage?.querySelector<HTMLElement>("[data-wing]");
      // Layout boxes, not transformed ones: the wing's width and where the post stands.
      const wingWidth = wingEl
        ? wingEl.offsetWidth + POST
        : (rect?.width ?? 400) * 0.5;
      const axis = (rect?.left ?? 0) + (wingEl ? wingEl.offsetLeft - POST : 0);
      // Pushing at the outer edge turns it slowly; near the post, quickly.
      grab.current = {
        s: turn.get(),
        r: clamp(
          Math.abs(point.x - offset.x - axis),
          wingWidth * 0.4,
          wingWidth,
        ),
      };
    },
    onMove: ({ offset }) => {
      turn.set(grab.current.s - offset.x / (grab.current.r * alpha));
    },
    onEnd: ({ velocity }) => {
      const v = clamp(-velocity.x / (grab.current.r * alpha), -14, 14);
      const s = turn.get();
      const p = live.current.physics;
      const landing = live.current.motionSafe
        ? predict(s, v, p)
        : Math.round(s + clamp(v * 0.35, -3, 3));
      heading.current = landing;
      commit(landing);
      if (!live.current.motionSafe) {
        sim.current?.stop();
        turn.jump(landing);
        dip();
        return;
      }
      sim.current?.free(v);
    },
    onCancel: () => steerTo(Math.round(turn.get()), "snap"),
    onTap: (event) => {
      const wingEl = (event.target as Element).closest?.("[data-wing]");
      const j = wingEl ? Number(wingEl.getAttribute("data-wing")) : NaN;
      if (!Number.isFinite(j)) return;
      const s = turn.get();
      const k = -j + N * Math.round((s + j) / N);
      if (k === Math.round(s)) return;
      commit(k);
      steerTo(k, "glide");
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const base = heading.current;
    let target: number | null = null;
    if (event.key === "ArrowRight") target = base + 1;
    else if (event.key === "ArrowLeft") target = base - 1;
    else if (event.key === "Home" || event.key === "End") {
      const want = event.key === "Home" ? 0 : M - 1;
      let delta = want - mod(base, M);
      if (delta > M / 2) delta -= M;
      if (delta < -M / 2) delta += M;
      target = base + delta;
    }
    if (target === null) return;
    event.preventDefault();
    commit(target);
    steerTo(target, Math.abs(target - base) > 1 ? "glide" : "snap");
  };

  const rotor = useTransform(turn, (s) => r3((-s * 360) / N));
  const shadowId = `turnstile-shade-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ticks = React.useMemo(
    () =>
      Array.from({ length: N * 6 }, (_, k) => {
        const a = (k / (N * 6)) * Math.PI * 2;
        const major = k % 6 === 0;
        const r0 = major ? 39 : 42;
        return {
          k,
          major,
          x1: r3(Math.cos(a) * r0),
          y1: r3(Math.sin(a) * r0),
          x2: r3(Math.cos(a) * 45.5),
          y2: r3(Math.sin(a) * 45.5),
        };
      }),
    [N],
  );
  const sceneTilt = clamp(tilt, 0, 24);
  const wingStyle = {
    "--ww": "clamp(108px, min(60cqw, calc((100cqh - 56px) * 0.62)), 300px)",
    "--wh": "min(calc(var(--ww) * 1.4), 72cqh)",
    "--ax": "calc(50% - var(--ww) / 2)",
    "--cy": "45%",
  } as React.CSSProperties;

  return (
    <div
      className={cn(
        "group/turnstile-cards relative w-full overflow-clip rounded-4 select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height }}
    >
      <div
        ref={bindStage}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hintId}
        aria-controls={slideId}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "[container-type:size] absolute inset-0 rounded-4 outline-none",
          !disabled && "cursor-grab touch-pan-y active:cursor-grabbing",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{
          ...wingStyle,
          perspective,
          perspectiveOrigin: "50% 40%",
        }}
      >
        <motion.div
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{
            transformOrigin: "calc(50% - var(--ww) / 2) 45%",
            rotateX: -sceneTilt,
            opacity: dim,
          }}
        >
          {floor ? (
            <div
              aria-hidden
              className="absolute [transform-style:preserve-3d]"
              style={{
                left: "calc(var(--ax) - var(--ww) - 14px)",
                top: "calc(var(--cy) + var(--wh) / 2 - var(--ww) - 14px)",
                width: "calc(var(--ww) * 2 + 28px)",
                height: "calc(var(--ww) * 2 + 28px)",
                transform: "translateY(2px) rotateX(90deg)",
              }}
            >
              <div
                className="absolute inset-0 rounded-full border border-hairline-strong"
                style={{
                  background:
                    "radial-gradient(closest-side, color-mix(in oklab, var(--ink-3) 18%, transparent), color-mix(in oklab, var(--ink-3) 8%, transparent) 72%, transparent)",
                }}
              />
              <motion.svg
                viewBox="-50 -50 100 100"
                className="absolute inset-[6%] overflow-visible"
                style={{ rotate: rotor }}
              >
                <defs>
                  <linearGradient id={shadowId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="black" stopOpacity="0" />
                    <stop offset="0.5" stopColor="black" stopOpacity="0.2" />
                    <stop offset="1" stopColor="black" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <circle
                  r="47"
                  fill="none"
                  className="stroke-hairline-strong"
                  strokeWidth="0.6"
                />
                {ticks.map((t) => (
                  <line
                    key={t.k}
                    x1={t.x1}
                    y1={t.y1}
                    x2={t.x2}
                    y2={t.y2}
                    className="stroke-ink-3"
                    strokeOpacity={t.major ? 0.75 : 0.35}
                    strokeWidth={t.major ? 0.9 : 0.5}
                  />
                ))}
                {Array.from({ length: N }, (_, j) => (
                  <rect
                    key={j}
                    x="2"
                    y="-3.5"
                    width="40"
                    height="7"
                    fill={`url(#${shadowId})`}
                    transform={`rotate(${r3((-j * 360) / N)})`}
                  />
                ))}
              </motion.svg>
              <span className="absolute bottom-[3%] left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full bg-ink-2" />
            </div>
          ) : null}
          <div
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: `calc(var(--ax) - ${POST}px)`,
              top: "calc(var(--cy) - var(--wh) / 2 - 8px)",
              width: POST * 2,
              height: "calc(var(--wh) + 10px)",
              background:
                "linear-gradient(90deg, color-mix(in oklab, var(--ink-2) 70%, black), color-mix(in oklab, var(--ink-2) 30%, white) 45%, color-mix(in oklab, var(--ink-3) 80%, black))",
            }}
          />
          {Array.from({ length: N }, (_, j) => {
            const cardIndex = slots[j] ?? 0;
            return (
              <Wing
                key={j}
                index={j}
                wings={N}
                turn={turn}
                card={list[cardIndex]}
                cardIndex={cardIndex}
                cards={M}
                facing={j === front}
                glass={glass}
                sheen={sheen && motionSafe}
                slideId={slideId}
              />
            );
          })}
        </motion.div>
      </div>
      <span id={hintId} className="sr-only">
        Push the wings sideways, or use the arrow keys to turn one wing at a
        time. Home and End go to the first and last card.
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
