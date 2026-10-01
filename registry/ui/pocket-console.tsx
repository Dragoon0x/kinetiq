"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PocketConsoleShell = "grey" | "teal" | "clear";
export type PocketConsoleButton =
  "up" | "down" | "left" | "right" | "a" | "b" | "select" | "start";

export type PocketConsoleProps = {
  /** The screen: any content, in a size container the shape of the LCD. It receives every press as a key event. */
  children?: React.ReactNode;
  /** The console's accessible name. @default "Handheld console" */
  label?: string;
  /** Controlled: whether the console is switched on. */
  power?: boolean;
  /** Initial power when uncontrolled. @default true */
  defaultPower?: boolean;
  /** Fires from the power switch with the state asked for. */
  onPowerChange?: (power: boolean) => void;
  /** A key went down (pointer, keyboard or assistive technology), while the console is on. */
  onPress?: (button: PocketConsoleButton) => void;
  /** A key came back up. */
  onRelease?: (button: PocketConsoleButton) => void;
  /** The key each button sends into the screen. @default arrows, "a", "b", "Enter" for Start, "Shift" for Select */
  keyMap?: Partial<Record<PocketConsoleButton, string>>;
  /** The plastic: warm grey, teal, or a smoked clear shell that shows the board. @default "teal" */
  shell?: PocketConsoleShell;
  /** How strongly the LCD's pixel grid shows, 0 to 1. @default 0.5 */
  grid?: number;
  /** How lit the LCD is, 0 (unlit, under a dark film) to 1 (glowing). @default 0.8 */
  backlight?: number;
  /** Play each key's click going down and coming up. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/*
 * The shell is drawn once in a 500 × 800 box; the root is a 5:8 size
 * container, so one unit is 0.2cqw and every control is placed by
 * percentages of that same box. Nothing is measured to lay it out.
 */
const UNIT = 0.2;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** A length in shell units, as container width. */
const cq = (u: number) => `${r3(u * UNIT)}cqw`;
/** A box in shell units, as percentages of the console. */
const place = (x: number, y: number, w: number, h: number) => ({
  left: `${r3(x / 5)}%`,
  top: `${r3(y / 8)}%`,
  width: `${r3(w / 5)}%`,
  height: `${r3(h / 8)}%`,
});

const BODY =
  "M 46 12 H 454 A 34 34 0 0 1 488 46 V 716 A 72 72 0 0 1 416 788 H 84 A 72 72 0 0 1 12 716 V 46 A 34 34 0 0 1 46 12 Z";
const LENS =
  "M 62 44 H 438 A 18 18 0 0 1 456 62 V 326 A 36 36 0 0 1 420 362 H 80 A 36 36 0 0 1 44 326 V 62 A 18 18 0 0 1 62 44 Z";
/** The d-pad's cross, in its own 146 × 150 box, centred on (73, 73). */
const CROSS =
  "M 50 12 Q 50 4 58 4 H 88 Q 96 4 96 12 V 50 H 134 Q 142 50 142 58 V 88 Q 142 96 134 96 H 96 V 134 Q 96 142 88 142 H 58 Q 50 142 50 134 V 96 H 12 Q 4 96 4 88 V 58 Q 4 50 12 50 H 50 Z";
const ARM_SHADE: Record<"up" | "down" | "left" | "right", string> = {
  up: "M 50 12 Q 50 4 58 4 H 88 Q 96 4 96 12 V 62 H 50 Z",
  down: "M 50 84 H 96 V 134 Q 96 142 88 142 H 58 Q 50 142 50 134 Z",
  left: "M 12 50 H 62 V 96 H 12 Q 4 96 4 88 V 58 Q 4 50 12 50 Z",
  right: "M 84 50 H 134 Q 142 50 142 58 V 88 Q 142 96 134 96 H 84 Z",
};
/** Little embossed arrows near each arm's tip. */
const ARROWS_ART = [
  "M 73 13 L 79 22 H 67 Z",
  "M 73 133 L 79 124 H 67 Z",
  "M 13 73 L 22 67 V 79 Z",
  "M 133 73 L 124 67 V 79 Z",
];

const PAD_AT = { x: 128, y: 520, w: 146, h: 150 };
const FACE = {
  a: { x: 402, y: 500 },
  b: { x: 316, y: 548 },
  select: { x: 205, y: 672 },
  start: { x: 293, y: 672 },
} as const;
const SCREEN = { x: 96, y: 94, w: 308, h: 231 };
const LED_AT = { x: 68, y: 160 };
/** Pixels across the LCD, for the grid. */
const PIXELS = 72;
/** How far the d-pad rocks toward a pressed arm, in degrees. */
const ROCK = 9;
/** Share of the pad's half-width the thumb can rest in without pressing. */
const DEAD = 0.2;
/** tan 27°: beyond this ratio of the other axis, a press reads as a diagonal. */
const DIAGONAL = 0.51;
const TAP_MS = 110;

type Shell = {
  body: string;
  light: string;
  dark: string;
  lens: string;
  well: string;
  face: string;
  faceLight: string;
  print: string;
  clear: boolean;
};

/** Fixed pigments: plastic is a material, the same in either theme. */
const SHELLS: Record<PocketConsoleShell, Shell> = {
  grey: {
    body: "oklch(0.82 0.008 85)",
    light: "oklch(0.9 0.006 85)",
    dark: "oklch(0.7 0.01 80)",
    lens: "oklch(0.36 0.012 270)",
    well: "oklch(0.7 0.01 80)",
    face: "oklch(0.6 0.15 52)",
    faceLight: "oklch(0.72 0.13 60)",
    print: "oklch(0.48 0.035 270)",
    clear: false,
  },
  teal: {
    body: "oklch(0.62 0.095 195)",
    light: "oklch(0.72 0.085 192)",
    dark: "oklch(0.5 0.085 200)",
    lens: "oklch(0.27 0.025 225)",
    well: "oklch(0.52 0.08 198)",
    face: "oklch(0.3 0.01 260)",
    faceLight: "oklch(0.44 0.01 260)",
    print: "oklch(0.3 0.045 220)",
    clear: false,
  },
  clear: {
    body: "oklch(0.86 0.015 250 / 0.4)",
    light: "oklch(0.97 0.01 250 / 0.55)",
    dark: "oklch(0.62 0.02 250 / 0.5)",
    lens: "oklch(0.22 0.01 260 / 0.94)",
    well: "oklch(0.5 0.02 250 / 0.45)",
    face: "oklch(0.52 0.13 300 / 0.88)",
    faceLight: "oklch(0.68 0.11 300 / 0.88)",
    print: "oklch(0.3 0.02 260 / 0.85)",
    clear: true,
  },
};
const PAD = "oklch(0.27 0.006 260)";
const PAD_LIGHT = "oklch(0.4 0.006 260)";
const PAD_SKIRT = "oklch(0.16 0.004 260)";
const RUBBER = "oklch(0.5 0.008 260)";
const RUBBER_LIGHT = "oklch(0.64 0.008 260)";
const SKIRT = "oklch(0.2 0.006 260)";
const LCD_OFF = "oklch(0.25 0.014 165)";
const LED_ON = "oklch(0.68 0.22 25)";
const LED_DARK = "oklch(0.32 0.06 25)";
const BOARD = "oklch(0.42 0.07 165 / 0.9)";
const COPPER = "oklch(0.74 0.11 80 / 0.75)";
const CHIP = "oklch(0.2 0.005 260)";

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type Arm = "up" | "down" | "left" | "right";
type Face = "a" | "b" | "select" | "start";

const ARMS: readonly Arm[] = ["up", "down", "left", "right"];
const FACES: readonly Face[] = ["select", "start", "b", "a"];
const isArm = (b: PocketConsoleButton): b is Arm =>
  (ARMS as readonly string[]).includes(b);

const DEFAULT_KEYS: Record<PocketConsoleButton, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "a",
  b: "b",
  start: "Enter",
  select: "Shift",
};
const ARROW_KEYS: Record<string, Arm> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
const NAMES: Record<PocketConsoleButton, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  a: "A",
  b: "B",
  select: "Select",
  start: "Start",
};
const PITCH: Record<PocketConsoleButton, number> = {
  up: 0.8,
  down: 0.8,
  left: 0.8,
  right: 0.8,
  a: 1,
  b: 0.92,
  select: 1.3,
  start: 1.3,
};
const CENTRE_X: Record<PocketConsoleButton, number> = {
  up: PAD_AT.x,
  down: PAD_AT.x,
  left: PAD_AT.x,
  right: PAD_AT.x,
  a: FACE.a.x,
  b: FACE.b.x,
  select: FACE.select.x,
  start: FACE.start.x,
};
/** Arm hit boxes inside the d-pad, as percentages of its 146 × 150 box. */
const ARM_BOX: Record<Arm, React.CSSProperties> = {
  up: { left: "27.4%", top: "0%", width: "45.2%", height: "37.3%" },
  down: { left: "27.4%", top: "62.7%", width: "45.2%", height: "37.3%" },
  left: { left: "0%", top: "28%", width: "38.4%", height: "44%" },
  right: { left: "61.6%", top: "28%", width: "38.4%", height: "44%" },
};

/** The physical `code` a key value would come from, for content that reads it. */
const codeOf = (key: string) =>
  key === "Shift"
    ? "ShiftLeft"
    : key === " "
      ? "Space"
      : /^[a-z]$/i.test(key)
        ? `Key${key.toUpperCase()}`
        : /^[0-9]$/.test(key)
          ? `Digit${key}`
          : key;

/** Events this console dispatched into its own screen; it never handles them. */
const DISPATCHED = new WeakSet<Event>();

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageShown = () => !document.hidden;
const serverShown = () => true;

type Said = { n: number; on: boolean; text: string };

type Api = {
  press: (b: PocketConsoleButton, source: string) => void;
  release: (b: PocketConsoleButton, source: string) => void;
  releaseWhere: (match: (source: string) => boolean) => void;
  settlePower: (on: boolean) => void;
  padTo: (arms: Set<Arm>) => void;
};

function ShellArt({ s, id }: { s: Shell; id: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 500 800"
      className="pointer-events-none absolute inset-0 block size-full"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: s.light }} />
          <stop offset="0.45" style={{ stopColor: s.body }} />
          <stop offset="1" style={{ stopColor: s.dark }} />
        </linearGradient>
      </defs>
      {/* Its shadow on the desk, inside the box: the body is inset 12 units. */}
      <path
        d={BODY}
        transform="translate(0 7)"
        style={{ fill: "color-mix(in oklab, black 16%, transparent)" }}
      />
      {s.clear ? (
        <g>
          <rect
            x="40"
            y="70"
            width="420"
            height="696"
            rx="26"
            style={{ fill: BOARD }}
          />
          <g
            fill="none"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: COPPER }}
          >
            <path d="M 128 600 V 640 H 196 V 610" />
            <path d="M 316 548 L 276 590 H 236" />
            <path d="M 402 500 V 452 H 330 V 590" />
            <path d="M 205 672 V 700 H 360 V 660" />
            <path d="M 293 672 V 690" />
            <path d="M 70 420 H 150 V 470" />
            <path d="M 440 420 H 360 L 330 450" />
            <path d="M 236 600 V 560" />
            <path d="M 90 700 H 150 L 180 730 H 320" />
          </g>
          <rect
            x="200"
            y="560"
            width="78"
            height="62"
            rx="4"
            style={{ fill: CHIP }}
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i} strokeWidth="2.4" style={{ stroke: COPPER }}>
              <line x1={208 + i * 12} y1="556" x2={208 + i * 12} y2="550" />
              <line x1={208 + i * 12} y1="626" x2={208 + i * 12} y2="632" />
            </g>
          ))}
          <rect
            x="330"
            y="630"
            width="44"
            height="34"
            rx="3"
            style={{ fill: CHIP }}
          />
          <rect
            x="214"
            y="352"
            width="72"
            height="52"
            rx="3"
            style={{ fill: "oklch(0.72 0.14 70 / 0.6)" }}
          />
          {[
            [128, 520, 58],
            [402, 500, 26],
            [316, 548, 26],
          ].map(([x, y, r]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={r}
              fill="none"
              strokeWidth="3"
              style={{ stroke: COPPER }}
            />
          ))}
          {[
            [70, 740],
            [430, 410],
            [70, 410],
          ].map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="7"
              style={{ fill: "oklch(0.78 0.01 250 / 0.9)" }}
            />
          ))}
        </g>
      ) : null}
      <path d={BODY} style={{ fill: `url(#${id}-body)` }} />
      <path
        d={BODY}
        fill="none"
        strokeWidth="2"
        style={{ stroke: "color-mix(in oklab, white 34%, transparent)" }}
      />

      <path d={LENS} style={{ fill: s.lens }} />
      <path
        d={LENS}
        fill="none"
        strokeWidth="2"
        style={{ stroke: "color-mix(in oklab, black 30%, transparent)" }}
      />
      <circle cx={LED_AT.x} cy={LED_AT.y} r="8" style={{ fill: LED_DARK }} />
      <circle
        cx={LED_AT.x}
        cy={LED_AT.y}
        r="8"
        fill="none"
        strokeWidth="1.5"
        style={{ stroke: "color-mix(in oklab, black 45%, transparent)" }}
      />
      <text
        x="250"
        y="408"
        textAnchor="middle"
        fontSize="17"
        fontWeight="600"
        letterSpacing="9"
        className="font-sans"
        style={{ fill: s.print }}
      >
        POCKET
      </text>

      {/* The wells the keys sit in. */}
      <circle cx={PAD_AT.x} cy={PAD_AT.y} r="80" style={{ fill: s.well }} />
      <circle
        cx={PAD_AT.x}
        cy={PAD_AT.y + 2}
        r="80"
        fill="none"
        strokeWidth="3"
        style={{ stroke: "color-mix(in oklab, black 14%, transparent)" }}
      />
      <line
        x1={FACE.b.x}
        y1={FACE.b.y}
        x2={FACE.a.x}
        y2={FACE.a.y}
        strokeWidth="96"
        strokeLinecap="round"
        style={{ stroke: s.well }}
      />
      {(["select", "start"] as const).map((k) => (
        <line
          key={k}
          x1={FACE[k].x - 29}
          y1={FACE[k].y + 13}
          x2={FACE[k].x + 29}
          y2={FACE[k].y - 13}
          strokeWidth="30"
          strokeLinecap="round"
          style={{ stroke: s.well }}
        />
      ))}

      <g
        className="font-sans"
        fontWeight="700"
        textAnchor="middle"
        style={{ fill: s.print }}
      >
        <text x={FACE.b.x} y={FACE.b.y + 66} fontSize="22">
          B
        </text>
        <text x={FACE.a.x} y={FACE.a.y + 66} fontSize="22">
          A
        </text>
        {(["select", "start"] as const).map((k) => (
          <text
            key={k}
            x={FACE[k].x - 6}
            y={FACE[k].y + 42}
            fontSize="13"
            letterSpacing="1.5"
            transform={`rotate(-24 ${FACE[k].x - 6} ${FACE[k].y + 42})`}
          >
            {k.toUpperCase()}
          </text>
        ))}
      </g>

      {/* The speaker: a grid of drilled holes. */}
      <g style={{ fill: s.well }}>
        {[0, 1, 2, 3].flatMap((row) =>
          [0, 1, 2, 3, 4].map((col) => (
            <circle
              key={`${row}-${col}`}
              cx={366 + col * 16 + (row % 2) * 8}
              cy={690 + row * 15}
              r="4.5"
            />
          )),
        )}
      </g>
    </svg>
  );
}

type CapProps = {
  press: MotionValue<number>;
  motionSafe: boolean;
  shape: "round" | "pill";
  color: string;
  light: string;
};

/**
 * A key cap over its skirt — the side wall, seen as a crescent under the
 * cap. Pressed, the cap goes down into the well and the crescent closes.
 */
function Cap({ press, motionSafe, shape, color, light }: CapProps) {
  const depth = shape === "round" ? 7 : 4.5;
  const y = useTransform(press, (p) =>
    motionSafe ? cq(r2(clamp01(p) * depth * 0.85)) : "0cqw",
  );
  const shade = useTransform(press, (p) =>
    r3(clamp01(p) * (motionSafe ? 0.16 : 0.34)),
  );
  const shadow = useTransform(press, (p) => {
    const k = motionSafe ? 1 - clamp01(p) : 1;
    return `0 ${cq(r2(1 + 2.5 * k))} ${cq(r2(2 + 3 * k))} color-mix(in oklab, black ${Math.round(18 + 14 * k)}%, transparent)`;
  });
  const size =
    shape === "round"
      ? { width: cq(68), height: cq(68) }
      : { width: cq(62), height: cq(19) };
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ ...size, rotate: shape === "pill" ? "-24deg" : undefined }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: SKIRT, translate: `0 ${cq(depth)}` }}
      />
      <motion.span
        className="absolute inset-0 overflow-clip rounded-full"
        style={{
          y,
          boxShadow: shadow,
          background: `radial-gradient(circle at 34% 28%, ${light}, ${color} 64%)`,
        }}
      >
        <motion.span
          className="absolute inset-0"
          style={{ opacity: shade, background: "oklch(0 0 0)" }}
        />
      </motion.span>
    </span>
  );
}

/**
 * A handheld console frame with keys that really press. Every key is a cap
 * on a dome: it goes down into its well on the flick spring as its side wall
 * disappears, and the dome pushes it back up on the snap spring, one crisp
 * overshoot past rest. The d-pad is one cross on a pivot that rocks toward
 * the arm under the thumb — slide a finger around it and it rolls through
 * all eight directions, clicking as each arm goes down.
 *
 * Every press reaches the screen as a real `keydown` (and its release as a
 * `keyup`) dispatched at the element focused inside it, or at the content's
 * first element, so content written for a keyboard runs unchanged; `onPress`
 * and `onRelease` say the same to a host. The LCD has a pixel grid and a
 * backlight, the power light breathes while it is on and on screen, and the
 * power switch puts it to sleep.
 *
 * The shell is one drawing in a 5:8 box and every key a real button placed
 * over it, so it scales with its container and renders the same on the
 * server. From any key the arrow keys press the d-pad and A and B press A
 * and B, held as long as the key is; Enter and Space hold the focused key.
 * Under reduced motion nothing travels or rocks: a pressed key darkens, and
 * every press still reaches the content.
 */
export function PocketConsole({
  children,
  label = "Handheld console",
  power,
  defaultPower = true,
  onPowerChange,
  onPress,
  onRelease,
  keyMap,
  shell = "teal",
  grid = 0.5,
  backlight = 0.8,
  sound = false,
  disabled = false,
  className,
}: PocketConsoleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const artId = `pocket-console-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const s = SHELLS[shell] ?? SHELLS.teal;
  const keys = { ...DEFAULT_KEYS, ...keyMap };

  const [ownPower, setOwnPower] = React.useState(defaultPower);
  const isOn = power ?? ownPower;
  const [said, setSaid] = React.useState<Said>({ n: 0, on: isOn, text: "" });
  if (said.on !== isOn) {
    setSaid({
      n: said.n + 1,
      on: isOn,
      text: isOn ? "Power on." : "Power off.",
    });
  }
  const [focusArm, setFocusArm] = React.useState<Arm>("up");
  const [onScreen, setOnScreen] = React.useState(true);
  const pageVisible = React.useSyncExternalStore(
    subscribeVisibility,
    pageShown,
    serverShown,
  );

  const padX = useMotionValue(0);
  const padY = useMotionValue(0);
  const pressA = useMotionValue(0);
  const pressB = useMotionValue(0);
  const pressSelect = useMotionValue(0);
  const pressStart = useMotionValue(0);
  const cover = useMotionValue(isOn ? 0 : 1);
  const knob = useMotionValue(isOn ? 1 : 0);
  const led = useMotionValue(isOn ? 1 : 0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const screenRef = React.useRef<HTMLDivElement | null>(null);
  const controlsRef = React.useRef<HTMLDivElement | null>(null);
  const armRefs = React.useRef(new Map<Arm, HTMLButtonElement>());
  const holds = React.useRef(new Map<PocketConsoleButton, Set<string>>());
  const sent = React.useRef(new Set<PocketConsoleButton>());
  const padArms = React.useRef(new Set<Arm>());
  const pointers = React.useRef(new Map<number, () => void>());
  const timers = React.useRef(new Set<number>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const faceValue = (b: Face) =>
    b === "a"
      ? pressA
      : b === "b"
        ? pressB
        : b === "select"
          ? pressSelect
          : pressStart;

  const held = (b: PocketConsoleButton) =>
    (holds.current.get(b)?.size ?? 0) > 0;

  const panOf = (b: PocketConsoleButton) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? panFrom(rect.left + (rect.width * CENTRE_X[b]) / 500, null)
      : 0;
  };

  /** Into the screen: at what is focused inside it, or at its content. */
  const dispatch = (type: "keydown" | "keyup", b: PocketConsoleButton) => {
    const key = keys[b];
    // The stage closes on any Escape left unhandled; the console never sends one.
    if (!key || key === "Escape") return;
    const screen = screenRef.current;
    if (!screen) return;
    const active = document.activeElement;
    const target =
      active instanceof HTMLElement &&
      active !== screen &&
      screen.contains(active)
        ? active
        : (screen.firstElementChild ?? screen);
    const event = new KeyboardEvent(type, {
      key,
      code: codeOf(key),
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    DISPATCHED.add(event);
    target.dispatchEvent(event);
  };

  /** The d-pad's pose follows whichever arms are down. */
  const rock = () => {
    const x = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    const y = (held("down") ? 1 : 0) - (held("up") ? 1 : 0);
    if (!motionSafe) {
      anims.current.get("padX")?.stop();
      anims.current.get("padY")?.stop();
      padX.set(x);
      padY.set(y);
      return;
    }
    run("padX", animate(padX, x, x === 0 ? springs.snap : springs.flick));
    run("padY", animate(padY, y, y === 0 ? springs.snap : springs.flick));
  };

  const travel = (b: PocketConsoleButton, down: boolean) => {
    if (isArm(b)) {
      rock();
      return;
    }
    const mv = faceValue(b);
    if (!motionSafe) {
      anims.current.get(b)?.stop();
      mv.set(down ? 1 : 0);
      return;
    }
    // Down it bottoms out with no overshoot; the dome pushes it back past rest once.
    run(b, animate(mv, down ? 1 : 0, down ? springs.flick : springs.snap));
  };

  const goDown = (b: PocketConsoleButton) => {
    travel(b, true);
    audio.play("click", {
      pitch: PITCH[b],
      gain: b === "select" || b === "start" ? 0.38 : 0.55,
      pan: panOf(b),
    });
    if (!isOn) return;
    sent.current.add(b);
    dispatch("keydown", b);
    onPress?.(b);
  };

  const goUp = (b: PocketConsoleButton) => {
    travel(b, false);
    audio.play("click", {
      pitch: r2(PITCH[b] * 1.3),
      gain: 0.24,
      pan: panOf(b),
    });
    if (!sent.current.has(b)) return;
    sent.current.delete(b);
    dispatch("keyup", b);
    onRelease?.(b);
  };

  const press = (b: PocketConsoleButton, source: string) => {
    if (disabled) return;
    const set = holds.current.get(b) ?? new Set<string>();
    const was = set.size > 0;
    set.add(source);
    holds.current.set(b, set);
    if (!was) goDown(b);
  };

  const release = (b: PocketConsoleButton, source: string) => {
    const set = holds.current.get(b);
    if (!set || !set.delete(source)) return;
    if (set.size === 0) goUp(b);
  };

  const releaseWhere = (match: (source: string) => boolean) => {
    for (const [b, set] of holds.current) {
      for (const source of [...set]) if (match(source)) release(b, source);
    }
  };

  /** A press with no hold behind it: assistive technology's click. */
  const tap = (b: PocketConsoleButton) => {
    const source = `tap-${b}`;
    press(b, source);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      api.current?.release(b, source);
    }, TAP_MS);
    timers.current.add(timer);
  };

  /* ------------------------------ the thumb ----------------------------- */

  /** The arms under a point on the pad: eight ways round, a dead zone in the middle. */
  const armsAt = (x: number, y: number, rect: DOMRect): Set<Arm> => {
    const nx = (x - (rect.left + rect.width / 2)) / (rect.width / 2);
    const ny = (y - (rect.top + rect.height / 2)) / (rect.height / 2);
    const out = new Set<Arm>();
    if (Math.hypot(nx, ny) < DEAD) return out;
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    if (ax >= ay * DIAGONAL) out.add(nx > 0 ? "right" : "left");
    if (ay >= ax * DIAGONAL) out.add(ny > 0 ? "down" : "up");
    return out;
  };

  const padTo = (arms: Set<Arm>) => {
    for (const arm of [...padArms.current]) {
      if (!arms.has(arm)) {
        padArms.current.delete(arm);
        release(arm, "pad");
      }
    }
    for (const arm of arms) {
      if (!padArms.current.has(arm)) {
        padArms.current.add(arm);
        press(arm, "pad");
      }
    }
  };

  const padRect = React.useRef<DOMRect | null>(null);
  const padLift = React.useRef<(() => void) | null>(null);

  const liftPad = () => {
    padLift.current?.();
    padLift.current = null;
    api.current?.padTo(new Set());
  };

  const padDrag = useDrag({
    threshold: 2,
    disabled,
    onMove: ({ point }) => {
      const rect = padRect.current;
      if (rect) padTo(armsAt(point.x, point.y, rect));
    },
    onEnd: liftPad,
    onCancel: liftPad,
    onTap: liftPad,
  });

  const onPadPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    padRect.current = rect;
    padTo(armsAt(event.clientX, event.clientY, rect));
    padDrag.onPointerDown(event);
    // Wherever this pointer lifts, the thumb is off the pad.
    padLift.current?.();
    const id = event.pointerId;
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) liftPad();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    padLift.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  };

  /* ----------------------------- face keys ------------------------------ */

  const onFacePointerDown = (
    b: Face,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const id = event.pointerId;
    const source = `p${id}`;
    pointers.current.get(id)?.();
    press(b, source);
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      pointers.current.get(id)?.();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    pointers.current.set(id, () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      pointers.current.delete(id);
      api.current?.release(b, source);
    });
  };

  /* ------------------------------ keyboard ------------------------------ */

  const keyOf = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return undefined;
    const name =
      target.closest<HTMLElement>("[data-console-key]")?.dataset.consoleKey;
    return (name as PocketConsoleButton | undefined) ?? undefined;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (DISPATCHED.has(event.nativeEvent) || disabled) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const own = keyOf(event.target);
    const source = `k:${event.code || event.key}`;
    const arm = ARROW_KEYS[event.key];
    if (arm) {
      event.preventDefault();
      if (!event.repeat) press(arm, source);
      if (own && isArm(own) && own !== arm) {
        setFocusArm(arm);
        armRefs.current.get(arm)?.focus();
      }
      return;
    }
    const letter = event.key.toLowerCase();
    if (letter === "a" || letter === "b") {
      event.preventDefault();
      if (!event.repeat) press(letter, source);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && own) {
      // Held, not clicked: the key stays down until the key comes up.
      event.preventDefault();
      if (!event.repeat) press(own, source);
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (DISPATCHED.has(event.nativeEvent)) return;
    if ((event.key === "Enter" || event.key === " ") && keyOf(event.target)) {
      event.preventDefault();
    }
    const source = `k:${event.code || event.key}`;
    releaseWhere((s) => s === source);
  };

  const onControlsBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && controlsRef.current?.contains(next)) return;
    releaseWhere((s) => s.startsWith("k:"));
  };

  /* -------------------------------- power ------------------------------- */

  const askPower = (next: boolean) => {
    if (power === undefined) setOwnPower(next);
    onPowerChange?.(next);
  };

  const settlePower = (on: boolean) => {
    run(
      "cover",
      animate(
        cover,
        on ? 0 : 1,
        on
          ? { duration: durations.slow, ease: easings.enter }
          : { duration: durations.fast, ease: easings.exit },
      ),
    );
    if (motionSafe) run("knob", animate(knob, on ? 1 : 0, springs.snap));
    else {
      anims.current.get("knob")?.stop();
      knob.set(on ? 1 : 0);
    }
    // Keys still held when it goes dark are let go inside the content.
    if (!on) {
      for (const b of [...sent.current]) {
        sent.current.delete(b);
        dispatch("keyup", b);
        onRelease?.(b);
      }
    }
  };

  React.useEffect(() => {
    api.current = { press, release, releaseWhere, settlePower, padTo };
  });

  const shownOn = React.useRef(isOn);
  React.useEffect(() => {
    if (shownOn.current === isOn) return;
    shownOn.current = isOn;
    api.current?.settlePower(isOn);
  }, [isOn]);

  // The power light breathes only while it is on, on screen, in a visible
  // page, and motion is welcome; otherwise it holds steady (or dark).
  React.useEffect(() => {
    if (!isOn) {
      const c = animate(led, 0, {
        duration: durations.fast,
        ease: easings.exit,
      });
      return () => c.stop();
    }
    if (!motionSafe || !onScreen || !pageVisible) {
      const c = animate(led, 1, { duration: durations.base });
      return () => c.stop();
    }
    const c = animate(led, [0.3, 1], {
      duration: 1.4,
      ease: easings.move,
      repeat: Infinity,
      repeatType: "mirror",
    });
    return () => c.stop();
  }, [isOn, motionSafe, onScreen, pageVisible, led]);

  // Nothing stays held while the page is away or the console is disabled.
  React.useEffect(() => {
    const letGo = () => {
      api.current?.releaseWhere(() => true);
      api.current?.padTo(new Set());
    };
    const onVisibility = () => {
      if (document.hidden) letGo();
    };
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", onVisibility);
    if (disabled) letGo();
    return () => {
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [disabled]);

  React.useEffect(() => {
    const running = anims.current;
    const held = pointers.current;
    const pending = timers.current;
    return () => {
      for (const off of [...held.values()]) off();
      held.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      padLift.current?.();
      padLift.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // On screen or not, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  /* --------------------------- derived values --------------------------- */

  const rotateX = useTransform(padY, (v) => (motionSafe ? r2(-v * ROCK) : 0));
  const rotateY = useTransform(padX, (v) => (motionSafe ? r2(v * ROCK) : 0));
  const shadeUp = useTransform(padY, (v) => r3(clamp01(-v) * 0.3));
  const shadeDown = useTransform(padY, (v) => r3(clamp01(v) * 0.3));
  const shadeLeft = useTransform(padX, (v) => r3(clamp01(-v) * 0.3));
  const shadeRight = useTransform(padX, (v) => r3(clamp01(v) * 0.3));
  const armShade: Record<Arm, MotionValue<number>> = {
    up: shadeUp,
    down: shadeDown,
    left: shadeLeft,
    right: shadeRight,
  };
  const knobX = useTransform(knob, (k) => cq(r2(k * 46)));
  const ledGlow = useTransform(led, (v) => r3(v * 0.7));

  const lit = clamp01(backlight);
  const gridStrength = clamp01(grid);
  const gridLine = "color-mix(in oklab, black 70%, transparent)";

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      data-power={isOn ? "on" : "off"}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "group/pocket-console [container-type:size] relative aspect-[5/8] w-full select-none [-webkit-touch-callout:none]",
        disabled && "opacity-60",
        className,
      )}
    >
      <ShellArt s={s} id={artId} />

      {/* The LCD: content, then the pixel grid, the backlight and the glass. */}
      <div
        className="[container-type:size] absolute overflow-clip"
        style={{
          ...place(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
          borderRadius: cq(5),
          boxShadow: `inset 0 0 0 ${cq(1.5)} color-mix(in oklab, black 40%, transparent)`,
        }}
      >
        <div
          ref={screenRef}
          inert={!isOn}
          aria-hidden={!isOn || undefined}
          className="[container-type:size] absolute inset-0 overflow-clip bg-background text-foreground"
        >
          {children}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: r3(gridStrength * 0.55),
            backgroundImage: `linear-gradient(90deg, ${gridLine} 0 16%, transparent 16%), linear-gradient(0deg, ${gridLine} 0 16%, transparent 16%)`,
            backgroundSize: `calc(100cqw / ${PIXELS}) calc(100cqw / ${PIXELS})`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `color-mix(in oklab, black ${Math.round((1 - lit) * 58)}%, transparent)`,
            boxShadow: `inset 0 0 6cqw color-mix(in oklab, white ${Math.round(lit * 16)}%, transparent)`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, color-mix(in oklab, white 12%, transparent), transparent 42%)",
          }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ opacity: cover, background: LCD_OFF }}
        />
      </div>

      <motion.span
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          ...place(LED_AT.x - 8, LED_AT.y - 8, 16, 16),
          opacity: led,
          background: `radial-gradient(circle at 40% 35%, oklch(0.9 0.1 30), ${LED_ON} 60%)`,
        }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          ...place(LED_AT.x - 16, LED_AT.y - 16, 32, 32),
          opacity: ledGlow,
          background: `radial-gradient(circle, color-mix(in oklab, ${LED_ON} 55%, transparent), transparent 70%)`,
        }}
      />

      <div
        ref={controlsRef}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onControlsBlur}
      >
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label="Power"
          disabled={disabled}
          onClick={() => {
            audio.play("click", { pitch: 0.7, gain: 0.5, pan: -0.4 });
            askPower(!isOn);
          }}
          className={cn(
            "absolute touch-manipulation rounded-[1.6cqw]",
            FOCUS_RING,
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          style={place(62, 14, 100, 30)}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: cq(10),
              top: cq(9),
              width: cq(80),
              height: cq(12),
              borderRadius: cq(6),
              background: s.well,
              boxShadow: `inset 0 ${cq(1.5)} ${cq(2)} color-mix(in oklab, black 30%, transparent)`,
            }}
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: cq(12),
              top: cq(6),
              width: cq(30),
              height: cq(18),
              borderRadius: cq(5),
              x: knobX,
              background: `linear-gradient(180deg, ${RUBBER_LIGHT}, ${RUBBER})`,
              boxShadow: `0 ${cq(1.5)} ${cq(2)} color-mix(in oklab, black 30%, transparent)`,
            }}
          />
        </button>

        <div
          role="group"
          aria-label="D-pad"
          onPointerDown={onPadPointerDown}
          onPointerMove={padDrag.onPointerMove}
          onPointerUp={padDrag.onPointerUp}
          onPointerCancel={padDrag.onPointerCancel}
          onLostPointerCapture={padDrag.onLostPointerCapture}
          className={cn(
            "absolute touch-none",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          style={{
            ...place(
              PAD_AT.x - PAD_AT.w / 2,
              PAD_AT.y - 73,
              PAD_AT.w,
              PAD_AT.h,
            ),
            perspective: cq(420),
          }}
        >
          <svg
            aria-hidden
            viewBox="0 0 146 150"
            className="pointer-events-none absolute inset-0 block size-full"
          >
            <path
              d={CROSS}
              transform="translate(0 7)"
              style={{ fill: PAD_SKIRT }}
            />
          </svg>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ rotateX, rotateY }}
          >
            <svg viewBox="0 0 146 150" className="block size-full">
              <defs>
                <linearGradient id={`${artId}-pad`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style={{ stopColor: PAD_LIGHT }} />
                  <stop offset="0.55" style={{ stopColor: PAD }} />
                </linearGradient>
              </defs>
              <path d={CROSS} style={{ fill: `url(#${artId}-pad)` }} />
              {ARMS.map((arm) => (
                <motion.path
                  key={arm}
                  d={ARM_SHADE[arm]}
                  style={{ fill: "oklch(0 0 0)", opacity: armShade[arm] }}
                />
              ))}
              {ARROWS_ART.map((d) => (
                <path key={d} d={d} style={{ fill: PAD_LIGHT }} />
              ))}
              <circle
                cx="73"
                cy="73"
                r="13"
                style={{ fill: "color-mix(in oklab, black 22%, transparent)" }}
              />
            </svg>
          </motion.div>
          {ARMS.map((arm) => (
            <button
              key={arm}
              ref={(node) => {
                if (node) armRefs.current.set(arm, node);
                else armRefs.current.delete(arm);
              }}
              type="button"
              data-console-key={arm}
              aria-label={NAMES[arm]}
              tabIndex={focusArm === arm ? 0 : -1}
              disabled={disabled}
              onFocus={() => setFocusArm(arm)}
              onClick={(event) => {
                // Pointer presses arrive through the thumb; a click with no
                // pointer behind it is assistive technology.
                if (event.detail === 0) tap(arm);
              }}
              className={cn(
                "absolute rounded-[1.6cqw]",
                FOCUS_RING,
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
              style={ARM_BOX[arm]}
            />
          ))}
        </div>

        {FACES.map((b) => {
          const round = b === "a" || b === "b";
          const at = FACE[b];
          const w = round ? 92 : 84;
          const h = round ? 92 : 46;
          return (
            <button
              key={b}
              type="button"
              data-console-key={b}
              aria-label={NAMES[b]}
              disabled={disabled}
              onPointerDown={(event) => onFacePointerDown(b, event)}
              onClick={(event) => {
                if (event.detail === 0) tap(b);
              }}
              className={cn(
                "absolute touch-manipulation",
                round ? "rounded-full" : "rounded-[2.4cqw]",
                FOCUS_RING,
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
              style={place(at.x - w / 2, at.y - h / 2, w, h)}
            >
              <Cap
                press={faceValue(b)}
                motionSafe={motionSafe}
                shape={round ? "round" : "pill"}
                color={round ? s.face : RUBBER}
                light={round ? s.faceLight : RUBBER_LIGHT}
              />
            </button>
          );
        })}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
