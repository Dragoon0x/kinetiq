"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FreightSidingsItem = {
  /** A picture to load on a car. Without one, a drawn print is used. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** A short title, read with the car. Defaults to `alt`. */
  caption?: string;
};

export type FreightSidingsProps = {
  /** The pictures, dealt round the trains in turn. @default defaultFreightItems */
  items?: FreightSidingsItem[];
  /** Controlled: the picture last rolled to the front of its train. */
  value?: number;
  /** Initial picture when uncontrolled; nothing is chosen until a car is. */
  defaultValue?: number;
  /** Fires from the click or key that rolled a car to the front, with its picture's index. */
  onValueChange?: (index: number) => void;
  /** How far the yard is turned, degrees; the tracks cross the frame on this diagonal. @default 24 */
  tilt?: number;
  /** How far the trains travel for each pixel of scroll or drag, 0 to 2. @default 1 */
  speed?: number;
  /** Space between coupled cars, px. @default 12 */
  gap?: number;
  /** How many trains run in the yard, 2 to 6. @default 3 */
  trains?: number;
  /** A car's length, px. @default 108 */
  carLength?: number;
  /** How far each train shunts back and forth on its own while you watch, 0 (still) to 1. @default 0.5 */
  drift?: number;
  /** How much a train under the pointer or keyboard slows, 0 (not at all) to 1 (to a crawl). @default 0.8 */
  slow?: number;
  /** Scrolling the page moves the trains. @default true */
  scroll?: boolean;
  /** Height of the yard, px. @default 560 */
  height?: number;
  /** The yard's accessible name. @default "Rail yard" */
  label?: string;
  /** Play the couplers' clacks, and the rail joints under a drag. Off unless asked for. @default false */
  sound?: boolean;
  /** Hold every train where it is; clicks still roll cars to the front. @default false */
  paused?: boolean;
  /** No drags, clicks or keys; the yard dims. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- prints --------------------------------- */

export const defaultFreightItems: FreightSidingsItem[] = [
  { alt: "A white salt flat under a pale sky", caption: "Salt Flats" },
  { alt: "Boats moored along a harbour wall", caption: "North Harbour" },
  { alt: "Layered red rock in a canyon", caption: "Red Canyon" },
  { alt: "Rows of round fruit trees", caption: "Orchard Rows" },
  { alt: "A street of lit windows at dusk", caption: "Lamp Street" },
  { alt: "Three kites over a green hill", caption: "Kite Hill" },
  { alt: "A dry lake bed at noon", caption: "White Pan" },
  { alt: "A ferry pier on a calm evening", caption: "Ferry Pier" },
  { alt: "An ochre gorge in shadow", caption: "Dry Gorge" },
  { alt: "Cherry trees in pink rows", caption: "Cherry Rows" },
  { alt: "A market lane under strings of lamps", caption: "Market Lane" },
  { alt: "Kites over a windy ridge at dusk", caption: "Wind Ridge" },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** A pigment: a token's hue at a fixed lightness and chroma, the same in both themes. */
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/** Six drawn prints, each in a day and an evening version. */
function PrintArt({ index }: { index: number }) {
  const late = mod(index, 12) >= 6;
  const k = late ? 0.86 : 1;
  const common = {
    viewBox: "0 0 120 72",
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
            height="72"
            style={{ fill: pig("--accent", 0.9 * k, 0.04, late ? 40 : -30) }}
          />
          <path
            d="M0 34 L18 28 L30 32 L52 24 L70 31 L96 26 L120 32 V36 H0 Z"
            style={{ fill: pig("--accent", 0.68 * k, 0.05, -40) }}
          />
          <rect
            y="36"
            width="120"
            height="36"
            style={{ fill: pig("--warn", 0.95 * k, 0.02, -40) }}
          />
          <path
            d="M0 38 L18 42 L30 39 L52 45 L70 40 L96 44 L120 39 V36 H0 Z"
            style={{ fill: pig("--accent", 0.82 * k, 0.03, -40) }}
          />
          <circle
            cx={late ? 30 : 92}
            cy="16"
            r="5"
            style={{ fill: pig("--warn", 0.92, 0.1, late ? -30 : 0) }}
          />
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="72"
            style={{ fill: pig("--accent", 0.86 * k, 0.05, late ? 30 : -20) }}
          />
          <rect
            y="34"
            width="120"
            height="38"
            style={{ fill: pig("--accent", 0.5 * k, 0.1, -10) }}
          />
          <rect
            y="54"
            width="120"
            height="18"
            style={{ fill: pig("--ink-2", 0.5 * k, 0.02) }}
          />
          {[16, 44, 78].map((x, j) => (
            <g key={x}>
              <path
                d={`M${x} 52 h22 l-4 6 h-14 Z`}
                style={{ fill: pig("--danger", 0.55 + j * 0.06, 0.13, j * 30) }}
              />
              <path
                d={`M${x + 10} 52 V36 l9 15 Z`}
                style={{ fill: pig("--accent", 0.97, 0.01) }}
              />
            </g>
          ))}
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="72"
            style={{ fill: pig("--warn", 0.88 * k, 0.06, late ? -50 : -20) }}
          />
          {[0, 1, 2, 3, 4].map((j) => (
            <path
              key={j}
              d={`M0 ${22 + j * 11} Q30 ${16 + j * 11} 60 ${24 + j * 11} T120 ${20 + j * 11} V72 H0 Z`}
              style={{
                fill: pig("--danger", (0.66 - j * 0.06) * k, 0.12, 30 - j * 4),
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
            height="72"
            style={{ fill: pig("--success", 0.82 * k, 0.07, -50) }}
          />
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <circle
                key={`${row}-${col}`}
                cx={8 + col * 21 + (row % 2) * 10}
                cy={18 + row * 20}
                r={8}
                style={{
                  fill: late
                    ? pig("--danger", 0.78 - ((row + col) % 2) * 0.05, 0.1, -20)
                    : pig(
                        "--success",
                        0.55 + ((row + col) % 3) * 0.04,
                        0.12,
                        -38,
                      ),
                }}
              />
            )),
          )}
        </svg>
      );
    case 4:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="72"
            style={{ fill: pig("--accent", 0.36 * k, 0.08, 20) }}
          />
          <path
            d="M0 72 V30 h20 V18 h22 V34 h18 V22 h26 V38 h34 V72 Z"
            style={{ fill: pig("--accent", 0.22, 0.05, 20) }}
          />
          {[
            [6, 38],
            [12, 50],
            [26, 24],
            [32, 42],
            [64, 30],
            [72, 46],
            [92, 46],
            [104, 56],
            [46, 54],
            [84, 30],
          ].map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="5"
              height="6"
              style={{ fill: pig("--warn", 0.84, 0.13, late ? -20 : 0) }}
            />
          ))}
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="72"
            style={{ fill: pig("--accent", 0.88 * k, 0.05, late ? 60 : -25) }}
          />
          <path
            d="M0 72 V52 Q50 34 120 50 V72 Z"
            style={{ fill: pig("--success", 0.6 * k, 0.12, -40) }}
          />
          {[
            [30, 18, 0],
            [62, 12, 40],
            [92, 22, 90],
          ].map(([x, y, dh]) => (
            <g key={x}>
              <path
                d={`M${x} ${(y ?? 0) - 6} l6 6 l-6 7 l-6 -7 Z`}
                style={{ fill: pig("--danger", 0.62, 0.17, dh) }}
              />
              <path
                d={`M${x} ${(y ?? 0) + 7} Q${(x ?? 0) - 4} ${(y ?? 0) + 24} ${(x ?? 0) + 6} 50`}
                fill="none"
                strokeWidth="0.6"
                style={{ stroke: pig("--ink-2", 0.4, 0.02) }}
              />
            </g>
          ))}
        </svg>
      );
  }
}

/* ---------------------------------- yard ---------------------------------- */

type CarPose = {
  dx: MotionValue<number>;
  dy: MotionValue<number>;
  jolt: MotionValue<number>;
};

type Move = { train: number; item: number; from: number; user: boolean };

type Live = {
  tilt: number;
  speed: number;
  drift: number;
  slow: number;
  scroll: boolean;
  paused: boolean;
  motionSafe: boolean;
  sound: ReturnType<typeof useTactileSound>;
};

/** One rail joint every so many px of travel: a clack under a dragging hand. */
const JOINT = 96;

/**
 * A rail yard seen from above and turned so the tracks cross the frame on a
 * diagonal: loaded lines alternate with empty sidings, and each line carries a
 * train of flat cars loaded with pictures, its head car showing a marker lamp.
 * Trains run in alternating directions at their own speeds: page scroll moves
 * them, a sideways drag scrubs the yard 1:1 under the hand with a flick carried
 * on by `project`, and left alone each train shunts slowly back and forth.
 * Every train follows its target through its own spring, and a train under the
 * pointer or the keyboard slows to a crawl, eased on springs.drift.
 *
 * Click a car and it rolls to the front of its train: its couplers open with a
 * clack and it eases forward on springs.flick, switches across onto the empty
 * siding on springs.glide, rolls along it past the cars ahead while they back
 * up a place, switches back at the head and couples with a clack, and the
 * jolt runs back down the train car by car on the recoil spring. The train
 * shunts so its new head is in view. The yard is a grid: arrows move between
 * cars and trains, Enter rolls the car to the front. Under reduced motion the
 * trains stand still and a car takes the head place with a short cross-fade.
 */
export function FreightSidings({
  items = defaultFreightItems,
  value,
  defaultValue,
  onValueChange,
  tilt = 24,
  speed = 1,
  gap = 12,
  trains = 3,
  carLength = 108,
  drift = 0.5,
  slow = 0.8,
  scroll = true,
  height = 560,
  label = "Rail yard",
  sound = false,
  paused = false,
  disabled = false,
  className,
}: FreightSidingsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const list = items.length > 0 ? items : defaultFreightItems;
  const count = list.length;
  const K = clamp(Math.round(trains), 1, Math.min(6, count));
  const carL = clamp(carLength, 60, 260);
  const carW = Math.round(carL * 0.6);
  const pitch = carL + gap;
  /** Distance between a line and the siding beside it. */
  const lane = carW + 22;
  const angle = clamp(tilt, -40, 40);
  const hintId = React.useId();

  const [own, setOwn] = React.useState<number | undefined>(defaultValue);
  const chosen = value ?? own;
  const [said, setSaid] = React.useState("");

  /** Each train's cars, by picture index, head first. */
  const [orders, setOrders] = React.useState<number[][]>(() =>
    Array.from({ length: K }, (_, j) =>
      Array.from({ length: count }, (_, i) => i).filter((i) => i % K === j),
    ),
  );
  // A new deal when the pictures or the number of trains change.
  const dealt = orders.length === K && orders.flat().length === count;
  const trainsNow = dealt
    ? orders
    : Array.from({ length: K }, (_, j) =>
        Array.from({ length: count }, (_, i) => i).filter((i) => i % K === j),
      );

  const [focus, setFocus] = React.useState<{ t: number; c: number }>({
    t: 0,
    c: 0,
  });

  const cars = React.useMemo<CarPose[]>(
    () =>
      Array.from({ length: count }, () => ({
        dx: motionValue(0),
        dy: motionValue(0),
        jolt: motionValue(0),
      })),
    [count],
  );
  /** Each train's centre along its line, px. */
  const centres = React.useMemo(
    () =>
      Array.from({ length: K }, (_, j) =>
        motionValue(r2(((j * 37) % 50) - 25)),
      ),
    [K],
  );
  const fade = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const visible = React.useRef(false);
  const box = React.useRef({ w: 0, h: 0 });
  const hover = React.useRef<number | null>(null);
  const focused = React.useRef<number | null>(null);
  const move = React.useRef<Move | null>(null);
  const running = React.useRef(new Set<AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const cellRefs = React.useRef(new Map<number, HTMLDivElement | null>());
  /** Per-train overrides: a place to hold the train at (focus, or a new head) until a time. */
  const holds = React.useRef<({ at: number; until: number } | null)[]>([]);
  const yard = React.useRef({
    drag: 0,
    dragging: false,
    pressed: 0,
    scroll: 0,
    wake: () => {},
  });
  const live = React.useRef<Live>({
    tilt: angle,
    speed,
    drift,
    slow,
    scroll,
    paused,
    motionSafe,
    sound: audio,
  });
  React.useEffect(() => {
    live.current = {
      tilt: angle,
      speed,
      drift,
      slow,
      scroll,
      paused,
      motionSafe,
      sound: audio,
    };
    yard.current.wake();
  });

  const lengthOf = (m: number) => m * carL + Math.max(0, m - 1) * gap;
  /** Each train runs one way or the other, at its own seeded pace. */
  const dirOf = (j: number) => (j % 2 === 0 ? 1 : -1);
  const paceOf = (j: number) => r3(0.65 + ((j * 0.37) % 0.6));
  /** A line's offset across the yard: loaded lines sit between sidings. */
  const lineY = (j: number) => (2 * j + 1 - K) * lane;
  /** A car's centre along the line, from its train's centre, by its place. */
  const slotX = React.useCallback(
    (j: number, k: number, m: number) =>
      dirOf(j) * (lengthOf(m) / 2 - k * pitch - carL / 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carL, gap, pitch],
  );

  /** The stretch of a line inside the frame, along the line, px. */
  const chordOf = React.useCallback(
    (j: number) => {
      const { w, h } = box.current;
      const a = (-live.current.tilt * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const vx = -Math.sin(a);
      const vy = Math.cos(a);
      const y = lineY(j);
      let lo = -Infinity;
      let hi = Infinity;
      const cut = (u: number, off: number, half: number) => {
        if (Math.abs(u) < 1e-6) {
          if (Math.abs(off) > half) {
            lo = 1;
            hi = 0;
          }
          return;
        }
        const s1 = (-half - off) / u;
        const s2 = (half - off) / u;
        lo = Math.max(lo, Math.min(s1, s2));
        hi = Math.min(hi, Math.max(s1, s2));
      };
      cut(ux, y * vx, w / 2);
      cut(uy, y * vy, h / 2);
      return { lo, hi };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [K, lane],
  );

  const track = (c: AnimationPlaybackControls) => {
    running.current.add(c);
    void c.finished.then(
      () => running.current.delete(c),
      () => running.current.delete(c),
    );
  };
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current.clear();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current.clear();
    },
    [],
  );

  // The one loop: each train's target from scroll, drag, shunt and holds, and
  // a spring that carries it there; slowed under the pointer or keyboard.
  const latestOrders = React.useRef(trainsNow);
  React.useEffect(() => {
    latestOrders.current = trainsNow;
  });
  React.useEffect(() => {
    let frame = 0;
    let last = 0;
    let disposed = false;
    const vel = new Float32Array(K);
    const phase = Float32Array.from({ length: K }, (_, j) => j * 1.7 + 0.4);
    const rate = new Float32Array(K).fill(1);
    const joints = new Float32Array(K);
    let wasDragging = false;
    let clock = 0;
    const tick = (now: number) => {
      frame = 0;
      if (disposed) return;
      const k = live.current;
      if (!visible.current || document.hidden || !k.motionSafe) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
      last = now;
      clock += dt;
      const y = yard.current;
      let busy = y.dragging;
      // A drag starts counting rail joints from where each train stands.
      const fresh = y.dragging && !wasDragging;
      wasDragging = y.dragging;
      const u = (k.scroll ? y.scroll : 0) + y.drag;
      for (let j = 0; j < K; j += 1) {
        const mv = centres[j];
        if (!mv) continue;
        const slowed = hover.current === j || focused.current === j;
        const want = slowed ? 1 - clamp01(k.slow) * 0.92 : 1;
        // The slowing itself eases in and out on the drift constants' pace.
        rate[j] =
          (rate[j] ?? 1) + (want - (rate[j] ?? 1)) * (1 - Math.exp(-dt * 4));
        if (!k.paused)
          phase[j] = (phase[j] ?? 0) + dt * (0.22 + 0.06 * j) * (rate[j] ?? 1);
        const m = latestOrders.current[j]?.length ?? 0;
        const len = lengthOf(m);
        const chord = chordOf(j);
        const room = chord.hi - chord.lo;
        const hold = holds.current[j];
        let target: number;
        if (hold && hold.until > clock) {
          target = hold.at;
          busy = true;
        } else {
          if (hold) holds.current[j] = null;
          const shunt = k.paused
            ? 0
            : Math.sin(phase[j] ?? 0) *
              clamp01(k.drift) *
              Math.min(90, room * 0.18);
          target = dirOf(j) * paceOf(j) * clamp(k.speed, 0, 2) * u + shunt;
          if (room > 0) {
            const mid = (chord.lo + chord.hi) / 2;
            const q = Math.max(0, room / 2 - Math.min(room / 2, len * 0.32));
            target = rubberClamp(target, mid - q, mid + q, 160);
          }
        }
        // Critically damped follower: glide under a free train, soft under a slowed one.
        const stiff =
          springs.glide.stiffness * Math.max(0.03, (rate[j] ?? 1) ** 2);
        const damp = 2 * Math.sqrt(stiff);
        let x = mv.get();
        let v = vel[j] ?? 0;
        let left = dt;
        while (left > 1e-6) {
          const hstep = Math.min(1 / 240, left);
          left -= hstep;
          v += (stiff * (target - x) - damp * v) * hstep;
          x += v * hstep;
        }
        vel[j] = v;
        mv.set(r2(x));
        if (Math.abs(v) > 0.5 || Math.abs(target - x) > 0.3) busy = true;
        // Rail joints under a dragging hand.
        if (y.dragging) {
          const jn = Math.floor(x / JOINT);
          if (fresh) joints[j] = jn;
          else if (jn !== joints[j]) {
            joints[j] = jn;
            k.sound.play("clack", { gain: 0.12, pitch: 1.3 + j * 0.05 });
          }
        }
      }
      if (k.drift > 0 && !k.paused) busy = true;
      if (busy) frame = window.requestAnimationFrame(tick);
      else last = 0;
    };
    const wake = () => {
      if (disposed || frame) return;
      if (!visible.current || document.hidden) return;
      frame = window.requestAnimationFrame(tick);
    };
    const y = yard.current;
    y.wake = wake;
    wake();
    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (y.wake === wake) y.wake = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [K, carL, gap, centres, chordOf]);

  // Page scroll: the yard's progress through its scroll container's view.
  const readScroll = React.useRef(() => {});
  React.useEffect(() => {
    const read = () => {
      const node = rootRef.current;
      if (!node || !visible.current) return;
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p = clamp01((vh - r.top) / (vh + r.height));
      yard.current.scroll = r2((p - 0.5) * 520);
      yard.current.wake();
    };
    readScroll.current = read;
    window.addEventListener("scroll", read, { capture: true, passive: true });
    read();
    return () => window.removeEventListener("scroll", read, { capture: true });
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) yard.current.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      box.current = { w: node.clientWidth, h: node.clientHeight };
      yard.current.wake();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        readScroll.current();
        yard.current.wake();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** Hold a train so its car at place k sits well inside the frame. */
  const bringInView = (j: number, k: number, ms: number) => {
    const m = latestOrders.current[j]?.length ?? 0;
    const chord = chordOf(j);
    if (!(chord.hi > chord.lo)) return;
    const car = slotX(j, k, m);
    const mv = centres[j];
    if (!mv) return;
    const now = mv.get() + car;
    const lo = chord.lo + carL * 0.7;
    const hi = chord.hi - carL * 0.7;
    const at = lo > hi ? (chord.lo + chord.hi) / 2 : clamp(now, lo, hi);
    const want = mv.get() + (at - now);
    if (!live.current.motionSafe) {
      mv.jump(r2(want));
      return;
    }
    // Held until the timer lets go, whatever the loop's own clock says.
    holds.current[j] = { at: want, until: Infinity };
    later(ms, () => {
      const h = holds.current[j];
      if (h && h.at === want) holds.current[j] = null;
      yard.current.wake();
    });
    yard.current.wake();
  };

  /** Roll a car to the front of its train. */
  const toFront = (item: number, user: boolean) => {
    const j = trainsNow.findIndex((o) => o.includes(item));
    if (j < 0) return;
    const order = trainsNow[j] ?? [];
    const from = order.indexOf(item);
    const card = list[item];
    setSaid(
      `${card?.caption ?? card?.alt ?? ""} rolled to the front of line ${j + 1}.`,
    );
    if (item !== chosen) {
      if (value === undefined) setOwn(item);
      onValueChange?.(item);
    }
    const rect = rootRef.current?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, rootRef.current) : 0;
    if (from <= 0) {
      // Already at the head: a nudge and a clack say so.
      const p = cars[item];
      if (p && live.current.motionSafe) {
        track(
          animate(p.jolt, [0, dirOf(j) * 4, 0], {
            duration: durations.base,
            ease: easings.move,
          }),
        );
      }
      if (user) audio.play("clack", { gain: 0.4, pan });
      return;
    }
    move.current = { train: j, item, from, user };
    setOrders(
      trainsNow.map((o, t) =>
        t === j ? [item, ...o.filter((i) => i !== item)] : o,
      ),
    );
  };

  // The new order is on screen: FLIP the cars from where they were and run
  // the uncouple, the switch across, the roll, the switch back and the jolt.
  React.useLayoutEffect(() => {
    const mv = move.current;
    if (!mv) return;
    move.current = null;
    const j = mv.train;
    const order = trainsNow[j] ?? [];
    const m = order.length;
    const dir = dirOf(j);
    const k = live.current;
    const rect = rootRef.current?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, rootRef.current) : 0;
    if (mv.user) k.sound.play("clack", { gain: 0.5, pitch: 1.1, pan });
    const roller = cars[mv.item];
    if (!roller) return;
    if (!k.motionSafe) {
      for (const i of order) {
        const p = cars[i];
        p?.dx.jump(0);
        p?.dy.jump(0);
      }
      track(
        animate(fade, [0.45, 1], {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      bringInView(j, 0, 2400);
      return;
    }
    // The cars that were ahead now sit one place further back; FLIP them.
    for (let place = 1; place <= mv.from; place += 1) {
      const p = cars[order[place] ?? -1];
      if (!p) continue;
      p.dx.jump(r2(p.dx.get() + slotX(j, place - 1, m) - slotX(j, place, m)));
      track(animate(p.dx, 0, { ...springs.glide, delay: 0.24 }));
    }
    roller.dx.jump(r2(roller.dx.get() + slotX(j, mv.from, m) - slotX(j, 0, m)));
    const start = roller.dx.get();
    // Uncouple: it eases forward out of its couplers.
    track(animate(roller.dx, start + dir * 8, springs.flick));
    // Across onto the siding, along it past the cars ahead, and back.
    // Every line has its own siding on the same side, so moves never meet.
    const side = 1;
    later(110, () => {
      track(animate(roller.dy, side * lane, springs.glide));
      track(animate(roller.dx, 0, { ...springs.drift, delay: 0.12 }));
    });
    later(880, () => {
      track(animate(roller.dy, 0, springs.glide));
    });
    // Couple: the jolt runs back down the train, car by car.
    later(1180, () => {
      if (mv.user) k.sound.play("clack", { gain: 0.65, pitch: 0.92, pan });
      order.forEach((i, place) => {
        const p = cars[i];
        if (!p) return;
        p.jolt.jump(r2(-dir * (5 - Math.min(4, place))));
        track(
          animate(p.jolt, 0, {
            ...springs.recoil,
            delay: place * 0.045,
          }),
        );
        if (mv.user && place > 0 && place < 4) {
          later(place * 45, () =>
            k.sound.play("clack", {
              gain: 0.32 * Math.pow(0.62, place),
              pitch: 0.92 + place * 0.05,
              pan,
            }),
          );
        }
      });
    });
    bringInView(j, 0, 2600);
  }, [trainsNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // A host that sets `value` gets that car rolled to the front, silently.
  const shownValue = React.useRef(chosen);
  React.useEffect(() => {
    if (shownValue.current === chosen) return;
    shownValue.current = chosen;
    if (chosen === undefined) return;
    const j = latestOrders.current.findIndex((o) => o.includes(chosen));
    if (j >= 0 && (latestOrders.current[j]?.[0] ?? -1) !== chosen) {
      const id = window.requestAnimationFrame(() => toFront(chosen, false));
      return () => window.cancelAnimationFrame(id);
    }
  }, [chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pressedTrain = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest?.("[data-train]");
    const j = el ? Number(el.getAttribute("data-train")) : NaN;
    return Number.isFinite(j) ? j : null;
  };

  const grip = React.useRef(1);
  const drag = useDrag({
    axis: "x",
    threshold: 5,
    disabled,
    onStart: ({ event }) => {
      const y = yard.current;
      y.dragging = true;
      y.pressed = y.drag;
      // The train under the hand moves 1:1; the rest at their own pace.
      const j = pressedTrain(event.target) ?? 0;
      grip.current = dirOf(j) * paceOf(j) * clamp(live.current.speed, 0.05, 2);
      y.wake();
    },
    onMove: ({ offset }) => {
      const along =
        offset.x / Math.max(0.5, Math.cos((live.current.tilt * Math.PI) / 180));
      yard.current.drag = r2(yard.current.pressed + along / grip.current);
      yard.current.wake();
    },
    onEnd: ({ velocity }) => {
      const y = yard.current;
      y.dragging = false;
      const v =
        velocity.x /
        Math.max(0.5, Math.cos((live.current.tilt * Math.PI) / 180)) /
        grip.current;
      const to = project(y.drag, v, 0.995);
      const dragMv = motionValue(y.drag);
      track(
        animate(dragMv, to, {
          ...springs.glide,
          velocity: v,
          onUpdate: (x) => {
            y.drag = x;
            y.wake();
          },
        }),
      );
    },
    onCancel: () => {
      yard.current.dragging = false;
    },
    onTap: (event) => {
      const el = (event.target as Element).closest?.("[data-car]");
      const item = el ? Number(el.getAttribute("data-car")) : NaN;
      if (!Number.isFinite(item)) return;
      const j = trainsNow.findIndex((o) => o.includes(item));
      // The car becomes its train's head: the roving stop follows it there.
      setFocus({ t: Math.max(0, j), c: 0 });
      toFront(item, true);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const { t, c } = focus;
    const order = trainsNow[t] ?? [];
    let nt = t;
    let nc = c;
    // Left and right follow the screen: toward the head of a right-running train is right.
    const screen = dirOf(t);
    if (event.key === "ArrowRight") nc = c - screen;
    else if (event.key === "ArrowLeft") nc = c + screen;
    else if (event.key === "ArrowDown") nt = t + 1;
    else if (event.key === "ArrowUp") nt = t - 1;
    else if (event.key === "Home") nc = 0;
    else if (event.key === "End") nc = order.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      const item = order[c];
      if (item !== undefined) {
        toFront(item, true);
        setFocus({ t, c: 0 });
        window.requestAnimationFrame(() => cellRefs.current.get(item)?.focus());
      }
      return;
    } else return;
    event.preventDefault();
    nt = clamp(nt, 0, K - 1);
    const row = trainsNow[nt] ?? [];
    nc = clamp(nc, 0, Math.max(0, row.length - 1));
    setFocus({ t: nt, c: nc });
    const item = row[nc];
    if (item !== undefined) {
      cellRefs.current.get(item)?.focus();
      bringInView(nt, nc, 2200);
    }
  };

  const tracksAcross = K * 2 + 1 + 6;

  return (
    <div
      ref={bindRoot}
      role="grid"
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType === "touch") return;
        const j = pressedTrain(event.target);
        if (j !== hover.current) {
          hover.current = j;
          yard.current.wake();
        }
      }}
      onPointerLeave={() => {
        hover.current = null;
        yard.current.wake();
      }}
      onFocus={(event) => {
        focused.current = pressedTrain(event.target);
        yard.current.wake();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          focused.current = null;
          yard.current.wake();
        }
      }}
      className={cn(
        "group/freight-sidings relative isolate w-full overflow-clip rounded-4 [contain:paint] select-none",
        !disabled && "cursor-grab touch-pan-y active:cursor-grabbing",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      style={{
        height,
        backgroundColor: "color-mix(in oklab, var(--ink-3) 9%, var(--card))",
        backgroundImage:
          "radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--ink-3) 22%, transparent) 0 1px, transparent 1.5px), radial-gradient(circle at 70% 75%, color-mix(in oklab, var(--ink-3) 16%, transparent) 0 1px, transparent 1.5px)",
        backgroundSize: "7px 7px, 11px 11px",
      }}
    >
      <motion.div
        className="absolute top-1/2 left-1/2 size-0"
        style={{ rotate: -angle, opacity: fade }}
      >
        {Array.from({ length: tracksAcross }, (_, i) => {
          const y = (i - (tracksAcross - 1) / 2) * lane;
          return (
            <div
              key={i}
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: -1400,
                width: 2800,
                top: r2(y - carW * 0.42),
                height: r2(carW * 0.84),
                backgroundImage: [
                  "linear-gradient(to bottom, transparent 18%, color-mix(in oklab, var(--ink-2) 75%, transparent) 18% calc(18% + 2px), transparent calc(18% + 2px) calc(82% - 2px), color-mix(in oklab, var(--ink-2) 75%, transparent) calc(82% - 2px) 82%, transparent 82%)",
                  "repeating-linear-gradient(90deg, color-mix(in oklab, var(--ink-3) 30%, transparent) 0 4px, transparent 4px 12px)",
                  "linear-gradient(to bottom, transparent 8%, color-mix(in oklab, var(--ink-3) 13%, transparent) 8% 92%, transparent 92%)",
                ].join(", "),
              }}
            />
          );
        })}
        {trainsNow.map((order, j) => {
          const m = order.length;
          const dir = dirOf(j);
          return (
            <motion.div
              key={j}
              role="row"
              data-train={j}
              aria-label={`Line ${j + 1}, ${m} ${m === 1 ? "car" : "cars"}`}
              className="absolute top-0 left-0"
              style={{ x: centres[j] ?? 0, y: lineY(j) }}
            >
              {order.map((item, k) => {
                const p = cars[item];
                const it = list[item];
                const title = it?.caption ?? it?.alt ?? "";
                const isFocus = focus.t === j && focus.c === k;
                return (
                  <motion.div
                    key={item}
                    ref={(node) => {
                      cellRefs.current.set(item, node);
                    }}
                    role="gridcell"
                    data-car={item}
                    tabIndex={disabled ? -1 : isFocus ? 0 : -1}
                    aria-label={`${title}, car ${k + 1} of ${m}${k === 0 ? ", at the front" : ""}`}
                    aria-selected={chosen === item}
                    onFocus={() => {
                      if (!isFocus) setFocus({ t: j, c: k });
                    }}
                    className="absolute cursor-pointer rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                    style={{
                      left: r2(slotX(j, k, m) - carL / 2),
                      top: -carW / 2,
                      width: carL,
                      height: carW,
                      x: p?.dx,
                      y: p?.dy,
                      zIndex: k === 0 ? 2 : 1,
                    }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{ x: p?.jolt }}
                    >
                      {/* Bogies: the wheel sets show past the deck at each end. */}
                      {[0.13, 0.87].map((at) => (
                        <span
                          key={at}
                          aria-hidden
                          className="absolute rounded-[2px]"
                          style={{
                            left: `calc(${at * 100}% - 9px)`,
                            width: 18,
                            top: -3,
                            bottom: -3,
                            backgroundColor:
                              "oklch(from var(--ink-2) 0.22 0.01 h)",
                          }}
                        />
                      ))}
                      {/* Couplers reach into the gap at both ends. */}
                      <span
                        aria-hidden
                        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                        style={{
                          left: -gap / 2,
                          right: -gap / 2,
                          backgroundColor:
                            "oklch(from var(--ink-2) 0.3 0.01 h)",
                        }}
                      />
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-[3px] shadow-[0_2px_6px_oklch(0_0_0/0.28)]"
                        style={{
                          backgroundColor:
                            "oklch(from var(--ink-2) 0.36 0.015 h)",
                          backgroundImage:
                            "repeating-linear-gradient(90deg, transparent 0 9px, oklch(1 0 0 / 0.07) 9px 10px)",
                        }}
                      />
                      <span
                        className={cn(
                          "absolute inset-y-[5px] rounded-[2px] bg-card p-[3px] shadow-[0_1px_3px_oklch(0_0_0/0.3)] transition-shadow",
                          chosen === item &&
                            "ring-2 ring-[oklch(from_var(--warn)_0.8_0.14_h)]",
                        )}
                        style={{ left: 7, right: 7 }}
                      >
                        <span className="block size-full overflow-hidden rounded-[1px]">
                          {it?.src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.src}
                              alt=""
                              draggable={false}
                              className="block size-full object-cover"
                            />
                          ) : (
                            <PrintArt index={item} />
                          )}
                        </span>
                      </span>
                      {/* The head car's marker lamp, at its leading end. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-1/2 size-2 -translate-y-1/2 rounded-full transition-opacity",
                          k === 0
                            ? "opacity-100 delay-700 duration-500"
                            : "opacity-0 duration-200",
                        )}
                        style={{
                          left: dir === 1 ? "calc(100% - 6px)" : -2,
                          backgroundColor:
                            "oklch(from var(--warn) 0.86 0.15 h)",
                          boxShadow:
                            "0 0 6px 2px oklch(from var(--warn) 0.86 0.15 h / 0.7)",
                        }}
                      />
                    </motion.div>
                  </motion.div>
                );
              })}
            </motion.div>
          );
        })}
      </motion.div>
      <p id={hintId} className="sr-only">
        Arrow keys move between cars and trains; Enter rolls a car to the front
        of its train. Drag sideways to move the trains, or scroll the page.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
