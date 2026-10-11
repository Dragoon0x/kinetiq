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
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PetriItem = {
  /** A picture. Without one, `art` or a drawn specimen is shown. */
  src?: string;
  /** Describes the picture; its accessible name. */
  alt: string;
  /** A short name for the dish. Defaults to `alt`. */
  caption?: string;
  /** Your own art, filling the dish. */
  art?: React.ReactNode;
};

export type PetriGlass = "clear" | "sea" | "amber" | "smoke";

export type PetriStackProps = {
  /** The dishes, top first. @default defaultPetriItems */
  items?: PetriItem[];
  /** Controlled: the dish on top. */
  value?: number;
  /** Initial top dish when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the click, key or drag that changed the top dish, with its index. */
  onValueChange?: (index: number) => void;
  /** How far the stack leans back from you, 10 to 75 degrees: low looks down on it, high sees it side on. @default 55 */
  tilt?: number;
  /** Air between one dish and the next, px, 2 to 32. @default 12 */
  gap?: number;
  /** The glass's tint. @default "clear" */
  glass?: PetriGlass;
  /** How many dishes show in the stack, 2 to 7. @default 5 */
  visible?: number;
  /** How far hovering or focus lifts the top lid, px. @default 8 */
  lift?: number;
  /** How strongly the glass bends the picture at the rim, 0 to 1. @default 0.6 */
  refraction?: number;
  /** Height of the stage, px. @default 232 */
  height?: number;
  /** Play the glassy clack as a dish lands. Off unless asked for. @default false */
  sound?: boolean;
  /** The stack's accessible name. @default "Specimens" */
  label?: string;
  /** No clicks, keys or drags. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------- art ---------------------------------- */

export const defaultPetriItems: PetriItem[] = [
  { alt: "Pale colonies spreading over amber agar", caption: "Colony 14" },
  { alt: "Green moss cells packed like cobbles", caption: "Moss section" },
  { alt: "Spiky orange pollen grains", caption: "Lily pollen" },
  { alt: "Glowing diatoms on a dark field", caption: "Diatoms" },
  { alt: "Wavy leaf cells with paired stomata", caption: "Leaf stoma" },
  { alt: "Square salt crystals on grey", caption: "Salt crystal" },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** A small seeded generator. */
function lcg(seed: number) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x51ed270b) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A specimen drawn in code, the same on the server and in the browser. */
function Specimen({ index }: { index: number }) {
  const art = React.useMemo(() => {
    const rand = lcg(index * 7919 + 17);
    const pick = mod(index, 6);
    const shapes: React.ReactNode[] = [];
    if (pick === 0) {
      for (let i = 0; i < 34; i += 1) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * 40;
        const r = rand() < 0.2 ? 4 + rand() * 4 : 1.2 + rand() * 2.4;
        const x = r2(50 + Math.cos(a) * d);
        const y = r2(50 + Math.sin(a) * d);
        shapes.push(
          <g key={i}>
            {r > 3.5 ? (
              <circle
                cx={x}
                cy={y}
                r={r2(r * 1.6)}
                fill="oklch(0.9 0.05 85)"
                opacity="0.5"
              />
            ) : null}
            <circle
              cx={x}
              cy={y}
              r={r2(r)}
              fill={
                rand() < 0.3 ? "oklch(0.96 0.03 95)" : "oklch(0.88 0.07 75)"
              }
            />
            <circle
              cx={r2(x - r * 0.3)}
              cy={r2(y - r * 0.3)}
              r={r2(r * 0.35)}
              fill="white"
              opacity="0.6"
            />
          </g>,
        );
      }
      return { bg: "oklch(0.74 0.11 70)", shapes };
    }
    if (pick === 1) {
      for (let j = 0; j < 9; j += 1) {
        for (let i = 0; i < 9; i += 1) {
          const x = r2(6 + i * 11 + (j % 2) * 5.5 + (rand() - 0.5) * 2);
          const y = r2(6 + j * 11 + (rand() - 0.5) * 2);
          shapes.push(
            <g key={`${i}-${j}`}>
              <ellipse
                cx={x}
                cy={y}
                rx="5.4"
                ry="5"
                fill={`oklch(${r2(0.55 + rand() * 0.14)} 0.13 ${Math.round(128 + rand() * 18)})`}
              />
              <circle
                cx={r2(x + 1)}
                cy={r2(y - 0.8)}
                r={r2(1 + rand() * 0.8)}
                fill="oklch(0.4 0.11 140)"
                opacity="0.7"
              />
            </g>,
          );
        }
      }
      return { bg: "oklch(0.42 0.08 140)", shapes };
    }
    if (pick === 2) {
      for (let i = 0; i < 9; i += 1) {
        const x = r2(16 + rand() * 68);
        const y = r2(16 + rand() * 68);
        const r = r2(6 + rand() * 5);
        const spikes = Array.from({ length: 14 }, (_, k) => {
          const a = (k / 14) * Math.PI * 2;
          return `M${r2(x + Math.cos(a) * r)} ${r2(y + Math.sin(a) * r)}L${r2(x + Math.cos(a) * (r + 2.2))} ${r2(y + Math.sin(a) * (r + 2.2))}`;
        }).join("");
        shapes.push(
          <g key={i}>
            <path d={spikes} stroke="oklch(0.7 0.15 55)" strokeWidth="1" />
            <circle cx={x} cy={y} r={r} fill="oklch(0.74 0.15 60)" />
            <circle cx={x} cy={y} r={r2(r * 0.6)} fill="oklch(0.8 0.13 70)" />
            <circle
              cx={r2(x - r * 0.3)}
              cy={r2(y - r * 0.35)}
              r={r2(r * 0.25)}
              fill="white"
              opacity="0.5"
            />
          </g>,
        );
      }
      return { bg: "oklch(0.93 0.03 90)", shapes };
    }
    if (pick === 3) {
      for (let i = 0; i < 8; i += 1) {
        const x = r2(18 + rand() * 64);
        const y = r2(18 + rand() * 64);
        const rx = r2(6 + rand() * 7);
        const ry = r2(rand() < 0.5 ? rx : rx * 0.45);
        const turn = Math.round(rand() * 180);
        const ribs = Array.from({ length: 10 }, (_, k) => {
          const a = (k / 10) * Math.PI * 2;
          return `M${x} ${y}L${r2(x + Math.cos(a) * rx)} ${r2(y + Math.sin(a) * ry)}`;
        }).join("");
        shapes.push(
          <g key={i} transform={`rotate(${turn} ${x} ${y})`}>
            <ellipse
              cx={x}
              cy={y}
              rx={r2(rx + 1.5)}
              ry={r2(ry + 1.5)}
              fill="oklch(0.7 0.12 195)"
              opacity="0.25"
            />
            <ellipse
              cx={x}
              cy={y}
              rx={rx}
              ry={ry}
              fill="none"
              stroke="oklch(0.85 0.1 190)"
              strokeWidth="1"
            />
            <path d={ribs} stroke="oklch(0.78 0.1 200)" strokeWidth="0.5" />
          </g>,
        );
      }
      return { bg: "oklch(0.22 0.04 250)", shapes };
    }
    if (pick === 4) {
      for (let j = 0; j < 6; j += 1) {
        for (let i = 0; i < 6; i += 1) {
          const x = r2(8 + i * 17 + (rand() - 0.5) * 4);
          const y = r2(8 + j * 17 + (rand() - 0.5) * 4);
          shapes.push(
            <path
              key={`${i}-${j}`}
              d={`M${r2(x - 8)} ${y} q4 -5 8 -1 t8 1 q-3 6 0 9 t-8 1 q-4 -4 -8 -1 t0 -9Z`}
              fill="oklch(0.88 0.07 130)"
              stroke="oklch(0.62 0.1 135)"
              strokeWidth="0.8"
            />,
          );
          if (rand() < 0.3) {
            shapes.push(
              <g key={`s${i}-${j}`}>
                <ellipse
                  cx={r2(x - 1.6)}
                  cy={r2(y + 3)}
                  rx="1.6"
                  ry="3"
                  fill="oklch(0.55 0.13 140)"
                />
                <ellipse
                  cx={r2(x + 1.6)}
                  cy={r2(y + 3)}
                  rx="1.6"
                  ry="3"
                  fill="oklch(0.55 0.13 140)"
                />
              </g>,
            );
          }
        }
      }
      return { bg: "oklch(0.8 0.08 130)", shapes };
    }
    for (let i = 0; i < 12; i += 1) {
      const x = r2(14 + rand() * 72);
      const y = r2(14 + rand() * 72);
      const s = r2(5 + rand() * 9);
      const turn = Math.round(rand() * 90);
      shapes.push(
        <g key={i} transform={`rotate(${turn} ${x} ${y})`}>
          <rect
            x={r2(x - s / 2)}
            y={r2(y - s / 2)}
            width={s}
            height={s}
            fill="oklch(0.88 0.04 250)"
            stroke="oklch(0.97 0.02 250)"
            strokeWidth="0.8"
          />
          <rect
            x={r2(x - s / 4)}
            y={r2(y - s / 4)}
            width={r2(s / 2)}
            height={r2(s / 2)}
            fill="oklch(0.8 0.05 285)"
            opacity="0.6"
          />
        </g>,
      );
    }
    return { bg: "oklch(0.58 0.02 260)", shapes };
  }, [index]);
  return (
    <svg viewBox="0 0 100 100" className="block size-full" aria-hidden>
      <rect width="100" height="100" fill={art.bg} />
      {art.shapes}
    </svg>
  );
}

/* --------------------------------- glass ---------------------------------- */

const GLASS: Record<PetriGlass, string> = {
  clear: "oklch(0.96 0.012 220)",
  sea: "oklch(0.78 0.08 190)",
  amber: "oklch(0.8 0.11 72)",
  smoke: "oklch(0.42 0.012 260)",
};

/** A dish's wall, px: thin glass, a few rims stacked. */
const WALL = 5;
/** Air between a dish's rim and its lid at rest, px. */
const LID_GAP = 2;

/* ----------------------------------- dish --------------------------------- */

type DishHandles = {
  x: MotionValue<number>;
  z: MotionValue<number>;
  fade: MotionValue<number>;
};

type DishProps = {
  item: PetriItem;
  index: number;
  count: number;
  slot: number;
  size: number;
  /** Where this dish starts: its height in the stack and whether it shows. */
  startZ: number;
  startFade: number;
  register: (index: number, handles: DishHandles | null) => void;
  lid: MotionValue<number>;
  tint: string;
  refraction: number;
  slideId: string;
};

function Dish({
  item,
  index,
  count,
  slot,
  size,
  startZ,
  startFade,
  register,
  lid,
  tint,
  refraction,
  slideId,
}: DishProps) {
  const top = slot === 0;
  // A dish owns its place; the stack moves it through these, never React state.
  const x = useMotionValue(0);
  const z = useMotionValue(startZ);
  const fade = useMotionValue(startFade);
  const handles = React.useRef<DishHandles>({ x, z, fade });
  React.useEffect(() => {
    register(index, handles.current);
    return () => register(index, null);
  }, [index, register]);
  const picture = item.src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.src}
      alt=""
      draggable={false}
      className="block size-full object-cover"
    />
  ) : item.art ? (
    item.art
  ) : (
    <Specimen index={index} />
  );
  const lidZ = useTransform(lid, (l) => r2(WALL + LID_GAP + (top ? l : 0)));
  const lidShade = useTransform(lid, (l) => r2(top ? 0.12 + l * 0.02 : 0.12));
  const rim = "color-mix(in oklab, var(--foreground) 34%, transparent)";
  const half = size / 2;
  return (
    <motion.div
      className="absolute [transform-style:preserve-3d]"
      style={{
        left: -half,
        top: -half,
        width: size,
        height: size,
        x,
        z,
        opacity: fade,
      }}
    >
      {/* The shadow it lays on whatever is under it. */}
      <div
        aria-hidden
        className="absolute inset-[4%] rounded-full"
        style={{
          transform: "translateZ(-3px) translate(3%, 4%)",
          backgroundImage:
            "radial-gradient(closest-side, oklch(0.15 0.02 260 / 0.42), oklch(0.15 0.02 260 / 0.16) 70%, transparent)",
        }}
      />
      {/* The base and the wall: thin rims stacked into glass. */}
      {[0, 1.6, 3.2, WALL].map((zz, k) => (
        <div
          key={k}
          aria-hidden
          className="absolute inset-0 rounded-full border"
          style={{
            transform: `translateZ(${zz}px)`,
            borderColor: rim,
            backgroundColor:
              k === 0
                ? `color-mix(in oklab, ${tint} 30%, transparent)`
                : undefined,
          }}
        />
      ))}
      {/* The specimen, its bend at the rim, and the glass over it. */}
      <div
        id={top ? slideId : undefined}
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}: ${item.caption ?? item.alt}`}
        aria-hidden={top ? undefined : true}
        className="absolute inset-[5%] overflow-hidden rounded-full"
        style={{ transform: "translateZ(1px)" }}
      >
        {item.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt={item.alt}
            draggable={false}
            className="block size-full object-cover"
          />
        ) : (
          <div role="img" aria-label={item.alt} className="size-full">
            {picture}
          </div>
        )}
        {slot < 2 && refraction > 0 ? (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              transform: `scale(${r2(1 + 0.16 * refraction)})`,
              filter: `blur(${r2(0.4 + 0.6 * refraction)}px) brightness(1.08) saturate(1.1)`,
              maskImage:
                "radial-gradient(closest-side, transparent 78%, black 88%, black 100%)",
            }}
          >
            {picture}
          </div>
        ) : null}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            backgroundImage: `radial-gradient(closest-side, color-mix(in oklab, ${tint} 8%, transparent) 60%, color-mix(in oklab, ${tint} 34%, transparent) 96%)`,
          }}
        />
        {/* Dishes further down sit in the shade of those above. */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-black transition-opacity duration-300"
          style={{ opacity: r2(Math.min(0.45, slot * 0.08)) }}
        />
      </div>
      {/* The lid: a slightly larger disc of glass, its rim catching the light. */}
      <motion.div
        aria-hidden
        className="absolute -inset-[2.5%] rounded-full border"
        style={{
          z: lidZ,
          borderColor: rim,
          backgroundImage: `linear-gradient(140deg, oklch(1 0 0 / 0.42), oklch(1 0 0 / 0.06) 32%, transparent 52%, color-mix(in oklab, ${tint} 22%, transparent))`,
          boxShadow: "inset 0 0 0 1.5px oklch(1 0 0 / 0.25)",
        }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-[8%] rounded-full"
        style={{
          z: 2,
          opacity: lidShade,
          backgroundImage:
            "radial-gradient(closest-side, transparent 70%, oklch(0.1 0.02 260) 100%)",
        }}
      />
    </motion.div>
  );
}

/* -------------------------------- component ------------------------------ */

/**
 * A gallery as a tilted stack of glass petri dishes, each holding its picture
 * like a specimen under a lid, in real CSS 3D: the bench leans back by `tilt`
 * and the dishes stand `gap` apart. Glass shows as thin stacked rims, a tint,
 * a lid with a bright edge, and refraction at the rim, where the picture is
 * drawn again, a little magnified and softened, inside a ring at the edge.
 *
 * A click, a key or a flick sends the top dish off: it lifts and slides out
 * sideways on springs.glide (taking a flick's velocity), drops while the rest
 * of the stack rises a level in a cascade, and slides in underneath to land on
 * springs.recoil with a glassy clack. Backward runs the same in reverse. A
 * drag follows the finger 1:1, rubber-bands, and commits by projection or
 * springs back on snap. Hover or keyboard focus lifts the top lid on
 * springs.snap. The stack is a focusable carousel: Right, Down, Enter and
 * Space send the top dish down, Left and Up bring the bottom one up, Home and
 * End go to the first and last. Under reduced motion the stack holds still
 * and the new picture cross-fades in.
 */
export function PetriStack({
  items = defaultPetriItems,
  value,
  defaultValue = 0,
  onValueChange,
  tilt = 55,
  gap = 12,
  glass = "clear",
  visible = 5,
  lift = 8,
  refraction = 0.6,
  height = 232,
  sound = false,
  label = "Specimens",
  disabled = false,
  className,
}: PetriStackProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const list = items.length > 0 ? items : defaultPetriItems;
  const n = list.length;
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const slideId = `${uid}-slide`;
  const shown = clamp(Math.round(visible), 2, Math.min(7, n));
  const lean = clamp(tilt, 10, 75);
  const air = clamp(gap, 2, 32);
  const tint = GLASS[glass] ?? GLASS.clear;

  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), n));
  const current = value === undefined ? own : mod(Math.round(value), n);
  const [said, setSaid] = React.useState("");
  const [width, setWidth] = React.useState(360);

  // Geometry: the dish as large as the box allows at this lean and spacing.
  const level = air + WALL;
  const rad = (lean * Math.PI) / 180;
  const zTop = (shown - 1) * level;
  const reach = zTop + WALL + LID_GAP + Math.max(0, lift) + 10;
  const size = Math.round(
    clamp(
      Math.min(
        width * 0.72,
        ((height - 28 - reach * Math.sin(rad)) / Math.cos(rad)) * 0.86,
      ),
      72,
      420,
    ),
  );
  const out = Math.round(size * 0.74);
  const shiftY = r2((reach * Math.sin(rad)) / 2);
  /** Height in the stack of a slot; slots past `shown` wait unseen under it. */
  const zOf = React.useCallback(
    (slot: number) =>
      r2(slot < shown ? (shown - 1 - slot) * level : -level * 0.8),
    [level, shown],
  );
  const fadeOf = (slot: number) => (slot < shown ? 1 : 0);

  const handles = React.useRef(new Map<number, DishHandles>());
  const register = React.useCallback((index: number, h: DishHandles | null) => {
    if (h) handles.current.set(index, h);
    else handles.current.delete(index);
  }, []);
  const lid = useMotionValue(0);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  /** The dish shown on top, which may run ahead of a controlled value. */
  const onTop = React.useRef(current);
  const fling = React.useRef(0);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  const halt = React.useCallback(() => {
    for (const r of running.current) r.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const run = (a: AnimationPlaybackControls) => {
    running.current.push(a);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** Every dish straight to its slot for a top dish, at once. */
  const placeAll = React.useCallback(
    (top: number) => {
      for (const [i, h] of handles.current) {
        const slot = mod(i - top, n);
        h.x.jump(0);
        h.z.jump(zOf(slot));
        h.fade.jump(fadeOf(slot));
      }
    },
    // fadeOf reads `shown` through zOf's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, zOf],
  );

  const clack = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
    audio.play("clack", { pitch: 1.35, gain: 0.5, pan });
    audio.play("tick", { pitch: 1.7, gain: 0.22, pan });
  };

  /** The others settle into their new slots, the highest first. */
  const shiftRest = (top: number, skip: number, delay: number) => {
    const rest = [...handles.current.entries()]
      .filter(([i]) => i !== skip)
      .sort((a, b) => mod(a[0] - top, n) - mod(b[0] - top, n));
    const beat = cascade(rest.length);
    rest.forEach(([i, h], k) => {
      const slot = mod(i - top, n);
      run(
        animate(h.z, zOf(slot), { ...springs.glide, delay: delay + k * beat }),
      );
      run(
        animate(h.fade, fadeOf(slot), {
          duration: durations.base,
          ease: easings.enter,
          delay: delay + k * beat,
        }),
      );
    });
  };

  /** The top dish slides off and goes to the bottom; `dir` is the side it leaves by. */
  const sendDown = (
    from: number,
    to: number,
    dir: number,
    velocity: number,
  ) => {
    halt();
    const mover = handles.current.get(from);
    if (!mover || !motionSafe) {
      placeAll(to);
      const h = handles.current.get(to);
      if (h) {
        run(
          animate(h.fade, [0.35, 1], {
            duration: durations.base,
            ease: easings.enter,
          }),
        );
      }
      clack();
      return;
    }
    const last = mod(from - to, n);
    run(animate(mover.x, dir * out, { ...springs.glide, velocity }));
    run(animate(mover.z, zOf(0) + 10, springs.glide));
    later(170, () => {
      run(animate(mover.z, zOf(last) + 6, springs.glide));
      shiftRest(to, from, 0);
    });
    later(300, () => run(animate(mover.x, 0, springs.glide)));
    later(430, () => {
      run(animate(mover.z, zOf(last), { ...springs.recoil, velocity: -60 }));
      if (fadeOf(last) === 0) {
        run(
          animate(mover.fade, 0, {
            duration: durations.base,
            ease: easings.exit,
          }),
        );
      }
      clack();
    });
  };

  /** The bottom dish slides out, rises, and comes in on top. */
  const bringUp = (to: number, dir: number) => {
    halt();
    const mover = handles.current.get(to);
    if (!mover || !motionSafe) {
      placeAll(to);
      const h = handles.current.get(to);
      if (h) {
        run(
          animate(h.fade, [0.35, 1], {
            duration: durations.base,
            ease: easings.enter,
          }),
        );
      }
      clack();
      return;
    }
    run(
      animate(mover.fade, 1, { duration: durations.fast, ease: easings.enter }),
    );
    run(animate(mover.x, -dir * out, springs.glide));
    later(150, () => {
      run(animate(mover.z, zOf(0) + 12, springs.glide));
      shiftRest(to, to, 0);
    });
    later(310, () => run(animate(mover.x, 0, springs.glide)));
    later(430, () => {
      run(animate(mover.z, zOf(0), { ...springs.recoil, velocity: -60 }));
      clack();
    });
  };

  /** Any other jump: every dish glides to its slot; the new top arcs round. */
  const jumpTo = (to: number) => {
    halt();
    if (!motionSafe) {
      placeAll(to);
      const h = handles.current.get(to);
      if (h) {
        run(
          animate(h.fade, [0.35, 1], {
            duration: durations.base,
            ease: easings.enter,
          }),
        );
      }
      return;
    }
    const mover = handles.current.get(to);
    shiftRest(to, to, 0.12);
    if (mover) {
      run(animate(mover.fade, 1, { duration: durations.fast }));
      run(animate(mover.x, out, springs.glide));
      run(animate(mover.z, zOf(0) + 12, springs.glide));
      later(260, () => run(animate(mover.x, 0, springs.glide)));
      later(380, () => {
        run(animate(mover.z, zOf(0), { ...springs.recoil, velocity: -60 }));
        clack();
      });
    }
  };

  const show = (to: number, dir: number, velocity: number) => {
    const from = onTop.current;
    if (to === from) return;
    onTop.current = to;
    const step = mod(to - from, n);
    if (step === 1) sendDown(from, to, dir, velocity);
    else if (step === n - 1) bringUp(to, dir);
    else jumpTo(to);
  };

  const commit = (to: number, dir = 1, velocity = 0) => {
    const next = mod(to, n);
    const item = list[next];
    setSaid(`${item?.caption ?? item?.alt ?? ""}, ${next + 1} of ${n}.`);
    if (next === current) {
      // Back where it was: the dragged dish returns.
      settleTop();
      return;
    }
    if (value === undefined) {
      setOwn(next);
      show(next, dir, velocity);
    } else {
      fling.current = velocity;
      settleTop();
    }
    onValueChange?.(next);
  };

  /** The top dish back on its stack after a drag that did not commit. */
  const settleTop = () => {
    const h = handles.current.get(onTop.current);
    if (!h) return;
    if (!motionSafe) {
      h.x.jump(0);
      h.z.jump(zOf(0));
      return;
    }
    run(animate(h.x, 0, springs.snap));
    run(animate(h.z, zOf(0), springs.snap));
  };

  // A host's value, or a new one taken from a press: the stack follows it.
  React.useEffect(() => {
    if (current === onTop.current) return;
    const v = fling.current;
    fling.current = 0;
    show(current, v < 0 ? -1 : 1, v);
  });

  // New geometry: every dish straight to its place, unless one is moving.
  React.useEffect(() => {
    if (running.current.length > 0) return;
    placeAll(onTop.current);
  }, [placeAll, size]);

  React.useEffect(() => halt, [halt]);

  const bindStage = React.useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = Math.round(node.clientWidth);
      if (w > 0) setWidth((was) => (was === w ? was : w));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const lidTo = (to: number) => {
    if (!motionSafe) return;
    animate(lid, to, springs.snap);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      halt();
      const h = handles.current.get(onTop.current);
      if (h && motionSafe) run(animate(h.z, zOf(0) + 8, springs.snap));
    },
    onMove: ({ offset }) => {
      const h = handles.current.get(onTop.current);
      if (!h) return;
      const raw = offset.x;
      const x =
        Math.abs(raw) <= out
          ? raw
          : Math.sign(raw) * (out + rubberband(Math.abs(raw) - out, out));
      h.x.set(r2(x));
    },
    onEnd: ({ velocity }) => {
      const h = handles.current.get(onTop.current);
      const x = h?.x.get() ?? 0;
      const landing = project(x, velocity.x, 0.995);
      if (Math.abs(landing) > size * 0.32) {
        commit(current + 1, Math.sign(landing) || 1, velocity.x);
      } else {
        settleTop();
      }
    },
    onCancel: () => settleTop(),
    onTap: () => commit(current + 1, 1, 0),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let to: number | null = null;
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      to = current + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      to = current - 1;
    } else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to === null) return;
    event.preventDefault();
    if (event.repeat && (event.key === "Enter" || event.key === " ")) return;
    commit(
      to,
      event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1,
      0,
    );
  };

  return (
    <div
      className={cn(
        "group/petri-stack relative w-full overflow-clip select-none",
        className,
      )}
      style={{ height }}
    >
      <div
        ref={bindStage}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        aria-describedby={hintId}
        aria-controls={slideId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        {...drag}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && !disabled)
            lidTo(Math.max(0, lift));
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") lidTo(0);
        }}
        onFocus={(event) => {
          if (!disabled && event.currentTarget.matches(":focus-visible")) {
            lidTo(Math.max(0, lift));
          }
        }}
        onBlur={() => lidTo(0)}
        className={cn(
          "absolute inset-0 rounded-3 outline-none",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-grab touch-pan-y active:cursor-grabbing",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ perspective: 900, perspectiveOrigin: "50% 20%" }}
      >
        <div
          className="absolute top-1/2 left-1/2 [transform-style:preserve-3d]"
          style={{ transform: `translateY(${shiftY}px) rotateX(${lean}deg)` }}
        >
          {list.map((item, i) => {
            const slot = mod(i - current, n);
            return (
              <Dish
                key={i}
                item={item}
                index={i}
                count={n}
                slot={slot}
                size={size}
                startZ={zOf(slot)}
                startFade={fadeOf(slot)}
                register={register}
                lid={lid}
                tint={tint}
                refraction={clamp(refraction, 0, 1)}
                slideId={slideId}
              />
            );
          })}
        </div>
      </div>
      <p id={hintId} className="sr-only">
        Click or press Right to send the top dish to the bottom; Left brings the
        bottom dish back up. Home and End go to the first and last. You can also
        drag the top dish aside.
      </p>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
