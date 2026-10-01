"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LidLaptopFinish = "space" | "silver" | "midnight";

export type LidLaptopProps = {
  /** The screen: any content, laid out in a size container the shape of the screen. */
  children?: React.ReactNode;
  /** The device's accessible name; the lid control is named after it. @default "Laptop" */
  label?: string;
  /** Controlled: whether the lid is open. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from a tap, a drag, a key, or the laptop coming into view, with the state asked for. */
  onOpenChange?: (open: boolean) => void;
  /** Open a shut lid the first time the laptop is mostly on screen. @default true */
  openOnView?: boolean;
  /** Where the lid rests open, in degrees from the deck, 90 to 130. @default 110 */
  angle?: number;
  /** The aluminium: deck, lip and the lid's shell. @default "space" */
  finish?: LidLaptopFinish;
  /** The screen wakes from black as the lid rises, and sleeps as it falls. Off: always lit. @default true */
  wake?: boolean;
  /** Play the latch and the landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/*
 * One camera for every plane, in deck widths: the perspective is 5 deck
 * widths deep and its origin sits 1.4 above the hinge, about 16° over the
 * desk. Each plane is a sibling with its own 3D transform under it.
 */
/** Lid height, and the deck's depth (a shut lid covers the deck exactly). */
const LH = 0.64;
const DD = 0.64;
/** The base's thickness, seen as the lip at the front. */
const T = 0.024;
const EYE = 1.4;
/*
 * The projected extent, worked out from that camera once: the lid's top is
 * highest about 8° past upright (0.647 above the hinge); the desk shadow's
 * front edge is lowest (0.248 below) and widest (1.157 deck widths).
 */
const FIT_W = 1.157;
const FIT_H = 0.8947;
const ABOVE = 0.6472;
const BELOW = 0.2475;
const DW = "min((100cqw - 6cqmin) / 1.157, (100cqh - 6cqmin) / 0.8947)";
const HINGE = `calc(50cqh + var(--dw) * ${Number(((ABOVE - BELOW) / 2).toFixed(4))})`;
/** Screen-space travel from a shut lid's front edge to an upright lid's top. */
const TRAVEL = 0.2055 + LH;
/** The hinge's own stop when pushed back by hand. */
const HINGE_MAX = 140;
const WAKE_AT = 60;
const SLEEP_AT = 40;

type Finish = { base: string; light: string; dark: string };

/** Fixed pigments: anodised metal looks the same in either theme. */
const FINISHES: Record<LidLaptopFinish, Finish> = {
  space: {
    base: "oklch(0.52 0.006 265)",
    light: "oklch(0.68 0.006 265)",
    dark: "oklch(0.37 0.006 265)",
  },
  silver: {
    base: "oklch(0.86 0.004 250)",
    light: "oklch(0.95 0.002 250)",
    dark: "oklch(0.7 0.005 250)",
  },
  midnight: {
    base: "oklch(0.33 0.026 262)",
    light: "oklch(0.46 0.03 258)",
    dark: "oklch(0.23 0.02 262)",
  },
};

const GLASS = "oklch(0.14 0.004 265)";
const KEYCAP = "oklch(0.19 0.004 265)";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** A length in deck widths. */
const dw = (k: number) => `calc(var(--dw) * ${Number(k.toFixed(4))})`;

/*
 * The keyboard, laid out once: a row of function keys and five rows in key
 * units, each row 14.5 units across, drawn into an 828 × 310 box.
 */
const ROWS: { h: number; units: number[] }[] = [
  { h: 30, units: Array.from({ length: 14 }, () => 14.5 / 14) },
  { h: 48, units: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5] },
  { h: 48, units: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { h: 48, units: [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75] },
  { h: 48, units: [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25] },
  { h: 48, units: [1, 1, 1, 1.25, 5, 1.25, 1, 1, 1, 1] },
];
const KEY_GAP = 8;
const KEY_UNIT = (820 + KEY_GAP) / 14.5;
const KEYS: { x: number; y: number; w: number; h: number }[] = [];
{
  let y = 0;
  for (const row of ROWS) {
    let x = 0;
    for (const u of row.units) {
      KEYS.push({
        x: r2(x),
        y,
        w: r2(u * KEY_UNIT - KEY_GAP),
        h: row.h,
      });
      x += u * KEY_UNIT;
    }
    y += row.h + KEY_GAP;
  }
}

type Api = {
  commit: (next: boolean, velocity: number, how: "visitor" | "view") => void;
  settle: (toOpen: boolean, velocity: number, how: Source) => void;
  onAngle: (v: number) => void;
};

type Source = "visitor" | "view" | "host";

/**
 * A laptop in real CSS 3D that holds any screen on its lid. It opens on a
 * hinge the first time it scrolls into view — slowly, on the drift spring —
 * or when it is clicked, and the screen wakes from black as the lid passes
 * 60°. The lid can be moved by hand: a vertical drag turns the hinge with the
 * finger, rubber-bands past the hinge's stop, and a release commits open or
 * shut wherever the throw would come to rest. Shutting is a landing: the lid
 * falls on the glide spring, strikes the deck still moving, and bounces off it
 * on the recoil spring, with a thock at each contact. The deck catches the
 * light — a sheen that follows the pointer, and the screen's own glow
 * spilling onto it.
 *
 * Every plane (deck, lip, desk shadow, both faces of the lid) has its own 3D
 * transform under one perspective, sized from one CSS `min()` of the
 * container, so it fits any box and renders the same on the server. A real
 * button over the laptop is the keyboard's lid: Enter or Space opens and
 * shuts it, the arrows lift and lower it. Under reduced motion the lid moves
 * without travelling and the screen still fades from black.
 */
export function LidLaptop({
  children,
  label = "Laptop",
  open,
  defaultOpen = false,
  onOpenChange,
  openOnView = true,
  angle = 110,
  finish = "space",
  wake = true,
  sound = false,
  disabled = false,
  className,
}: LidLaptopProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const screenId = `${uid}-screen`;
  const hintId = `${uid}-hint`;
  const f = FINISHES[finish] ?? FINISHES.space;
  const rest = Math.min(130, Math.max(90, angle));

  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const [said, setSaid] = React.useState({ n: 0, open: isOpen, text: "" });
  if (said.open !== isOpen) {
    setSaid({
      n: said.n + 1,
      open: isOpen,
      text: isOpen ? "Lid open." : "Lid closed.",
    });
  }

  const hinge = useMotionValue(isOpen ? rest : 0);
  const cover = useMotionValue(wake && !isOpen ? 1 : 0);
  const sheenAim = useMotionValue(0.3);
  const sheen = useSpring(sheenAim, {
    stiffness: springs.drift.stiffness,
    damping: springs.drift.damping,
    mass: springs.drift.mass,
  });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const shown = React.useRef(isOpen);
  const pending = React.useRef<Source | null>(null);
  const lit = React.useRef(!wake || isOpen);
  const viewed = React.useRef(false);
  const drag0 = React.useRef({ angle: 0, gain: 1 });
  const dragging = React.useRef(false);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const pan = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** The screen's backlight, from the hinge's angle as it passes. */
  const onAngle = (v: number) => {
    if (!wake) return;
    if (!lit.current && v >= WAKE_AT) {
      lit.current = true;
      // A beat of backlight, then the picture comes up out of the black.
      run(
        "cover",
        animate(cover, 0, {
          duration: durations.slow,
          delay: durations.blink,
          ease: easings.enter,
        }),
      );
    } else if (lit.current && v < SLEEP_AT) {
      lit.current = false;
      run(
        "cover",
        animate(cover, 1, { duration: durations.fast, ease: easings.exit }),
      );
    }
  };

  /** Drives the lid to where the state says, the way its source asks. */
  const settle = (toOpen: boolean, velocity: number, how: Source) => {
    halt("lid");
    const audible = how === "visitor";
    if (!motionSafe) {
      hinge.set(toOpen ? rest : 0);
      return;
    }
    const v = Math.max(-600, Math.min(600, velocity));
    if (toOpen) {
      run(
        "lid",
        animate(hinge, rest, {
          ...(how === "view" ? springs.drift : springs.glide),
          velocity: v,
        }),
      );
      return;
    }
    // Shutting is a landing. The lid falls on the glide spring toward a rest
    // a little past the deck, so it arrives moving; at contact the deck stops
    // it and hands part of that speed back as a bounce on the recoil spring,
    // whose own overshoot is turned back up again — a thock at each contact.
    if (hinge.get() <= 0.01) {
      hinge.set(0);
      return;
    }
    const thock = (contact: number) => {
      if (!audible || contact > 2) return;
      audio.play("thock", {
        pitch: contact === 1 ? 0.8 : 0.95,
        gain: contact === 1 ? 0.65 : 0.2,
        pan: pan(),
      });
    };
    let last = hinge.get();
    let lastAt = performance.now();
    let speed = 0;
    const fall = animate(hinge.get(), -20, {
      ...springs.glide,
      velocity: v,
      onUpdate: (raw) => {
        const now = performance.now();
        if (now > lastAt) speed = ((raw - last) / (now - lastAt)) * 1000;
        last = raw;
        lastAt = now;
        if (raw > 0) {
          hinge.set(r2(raw));
          return;
        }
        fall.stop();
        hinge.set(0);
        thock(1);
        let prev = 0.001;
        let contacts = 1;
        run(
          "lid",
          animate(0.001, 0, {
            ...springs.recoil,
            velocity: Math.min(320, Math.abs(speed) * 0.7),
            onUpdate: (b) => {
              if ((prev > 0 && b <= 0) || (prev < 0 && b >= 0)) {
                contacts += 1;
                thock(contacts);
              }
              prev = b;
              hinge.set(r2(Math.abs(b)));
            },
            onComplete: () => hinge.set(0),
          }),
        );
      },
    });
    run("lid", fall);
  };

  const commit = (next: boolean, velocity: number, how: "visitor" | "view") => {
    if (how === "visitor" && next && !isOpen) {
      // The latch lets go.
      audio.play("thock", { pitch: 1.5, gain: 0.22, pan: pan() });
    }
    if (next === isOpen) {
      settle(next, velocity, how);
      return;
    }
    if (open === undefined) {
      setOwn(next);
      shown.current = next;
      settle(next, velocity, how);
    } else {
      // Controlled: back to where the host says it is, until it answers.
      pending.current = how;
      settle(isOpen, velocity, "host");
    }
    onOpenChange?.(next);
  };

  React.useEffect(() => {
    api.current = { commit, settle, onAngle };
  });

  // A host that changes `open` gets the same lid a press would; a change the
  // visitor asked for keeps its sound.
  React.useEffect(() => {
    if (shown.current === isOpen) return;
    shown.current = isOpen;
    const how = pending.current ?? "host";
    pending.current = null;
    if (!dragging.current) api.current?.settle(isOpen, 0, how);
  }, [isOpen]);

  // A new resting angle moves an open lid there.
  React.useEffect(() => {
    if (!shown.current || dragging.current) return;
    api.current?.settle(true, 0, "host");
  }, [rest]);

  // Turning `wake` off lights the screen; turning it on reads the hinge.
  React.useEffect(() => {
    if (!wake) {
      halt("cover");
      cover.set(0);
      lit.current = true;
      return;
    }
    lit.current = hinge.get() >= WAKE_AT;
    halt("cover");
    cover.set(lit.current ? 0 : 1);
  }, [wake, cover, hinge]);

  React.useEffect(
    () => hinge.on("change", (v) => api.current?.onAngle(v)),
    [hinge],
  );

  // Opens the first time it is mostly on screen. Only an open that happened
  // is remembered, so StrictMode's second observer still opens a lid the
  // first one never reached.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || !openOnView || disabled) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry?.isIntersecting || viewed.current) return;
        viewed.current = true;
        api.current?.commit(true, 0, "view");
      },
      { threshold: 0.6 },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [openOnView, disabled]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /** Pixels of drag per degree: the lid's own travel on screen. */
  const gainNow = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1) return 0.5;
    const m = 0.03 * Math.min(rect.width, rect.height);
    const deck = Math.min(
      (rect.width - 2 * m) / FIT_W,
      (rect.height - 2 * m) / FIT_H,
    );
    return 90 / Math.max(1, deck * TRAVEL);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => {
      dragging.current = true;
      halt("lid");
      drag0.current = { angle: hinge.get(), gain: gainNow() };
    },
    onMove: ({ offset }) => {
      const { angle: from, gain } = drag0.current;
      const raw = from - offset.y * gain;
      // The deck stops a lid outright; the hinge's far stop gives a little.
      const next =
        raw < 0
          ? 0
          : raw > HINGE_MAX
            ? HINGE_MAX + rubberband(raw - HINGE_MAX, 45)
            : raw;
      hinge.set(r2(next));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const spin = -velocity.y * drag0.current.gain;
      const landing = project(hinge.get(), spin, 0.99);
      api.current?.commit(landing > 45, spin, "visitor");
    },
    onCancel: () => {
      dragging.current = false;
      api.current?.settle(shown.current, 0, "host");
    },
    onTap: () => api.current?.commit(!shown.current, 0, "visitor"),
  });

  const lidFront = useTransform(hinge, (a) => `rotateX(${r2(a - 90)}deg)`);
  const lidBack = useTransform(
    hinge,
    (a) => `rotateX(${r2(a - 90)}deg) rotateY(180deg)`,
  );
  const glow = useTransform(
    [cover, hinge] as MotionValue<number>[],
    ([c = 1, a = 0]: number[]) => r2((1 - c) * clamp01(a / 100) * 0.85),
  );
  const sheenX = useTransform(sheen, (s) => `${r2(-60 + clamp01(s) * 180)}%`);

  const metal = `linear-gradient(to bottom, ${f.dark}, ${f.base} 22%, ${f.base} 70%, ${f.light})`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      data-open={isOpen ? "" : undefined}
      onPointerMove={(event) => {
        if (!motionSafe) return;
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect || rect.width < 1) return;
        sheenAim.set(
          Number(clamp01((event.clientX - rect.left) / rect.width).toFixed(3)),
        );
      }}
      className={cn(
        "group/lid-laptop [container-type:size] relative aspect-[4/3] w-full select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ ["--dw" as string]: DW } as React.CSSProperties}
    >
      <div
        {...drag}
        onPointerDown={(event) => {
          // Only the laptop itself is a handle: not the empty box around it,
          // and not live content on an open screen, which keeps its presses.
          const target = event.target as Element | null;
          if (target === event.currentTarget) return;
          if (shown.current && target?.closest("[data-lid-screen]")) return;
          drag.onPointerDown(event);
        }}
        className={cn(
          "absolute inset-0 touch-pan-x",
          disabled
            ? "cursor-not-allowed"
            : "[&>*]:cursor-grab active:[&>*]:cursor-grabbing",
        )}
        style={{
          perspective: dw(5),
          perspectiveOrigin: `50% calc(${HINGE} - var(--dw) * ${EYE})`,
        }}
      >
        {/* The desk shadow: only its front edge shows past the base. */}
        <div
          aria-hidden
          className="absolute"
          style={{
            left: "calc(50% - var(--dw) / 2)",
            top: `calc(${HINGE} + var(--dw) * ${T})`,
            width: "var(--dw)",
            height: dw(DD * 1.06),
            transformOrigin: "50% 0",
            transform: "rotateX(90deg)",
            background:
              "radial-gradient(ellipse 56% 9% at 50% 93%, color-mix(in oklab, black 34%, transparent), transparent)",
          }}
        />

        {/* The deck, lying flat from the hinge toward the camera. */}
        <div
          aria-hidden
          className="absolute overflow-clip"
          style={{
            left: "calc(50% - var(--dw) / 2)",
            top: HINGE,
            width: "var(--dw)",
            height: dw(DD),
            transformOrigin: "50% 0",
            transform: "rotateX(90deg)",
            background: metal,
            borderRadius: `0 0 ${dw(0.03)} ${dw(0.03)}`,
          }}
        >
          <div
            className="absolute"
            style={{
              left: dw(0.085),
              right: dw(0.085),
              top: dw(0.05),
              height: dw(0.33),
              borderRadius: dw(0.012),
              background: `color-mix(in oklab, ${f.dark} 70%, black)`,
              padding: dw(0.008),
            }}
          >
            <svg
              viewBox="0 0 820 310"
              preserveAspectRatio="none"
              className="block size-full"
            >
              {KEYS.map((k) => (
                <rect
                  key={`${k.x}-${k.y}`}
                  x={k.x}
                  y={k.y}
                  width={k.w}
                  height={k.h}
                  rx={5}
                  fill={KEYCAP}
                />
              ))}
            </svg>
          </div>
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: dw(0.4),
              width: dw(0.36),
              height: dw(0.21),
              borderRadius: dw(0.014),
              background: `linear-gradient(to bottom, ${f.base}, ${f.light})`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${f.dark} 60%, transparent)`,
            }}
          />
          {/* The screen's light falls on the deck below the hinge. */}
          <motion.div
            className="absolute inset-x-0 top-0 h-3/5"
            style={{
              opacity: glow,
              background:
                "radial-gradient(ellipse 60% 80% at 50% 0%, color-mix(in oklab, white 34%, transparent), transparent 72%)",
            }}
          />
          {/* A sheen that slides along the metal with the pointer. */}
          <motion.div
            className="absolute inset-y-0 w-1/2"
            style={{
              left: sheenX,
              background:
                "linear-gradient(100deg, transparent 15%, color-mix(in oklab, white 22%, transparent) 48%, transparent 82%)",
            }}
          />
        </div>

        {/* The lip: the base's front edge, standing at the deck's depth. */}
        <div
          aria-hidden
          className="absolute"
          style={{
            left: "calc(50% - var(--dw) / 2)",
            top: HINGE,
            width: "var(--dw)",
            height: dw(T),
            transform: `translateZ(${dw(DD)})`,
            background: `linear-gradient(to bottom, ${f.light}, ${f.dark})`,
            borderRadius: `0 0 ${dw(0.012)} ${dw(0.012)}`,
          }}
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2"
            style={{
              width: dw(0.12),
              height: "45%",
              borderRadius: `0 0 ${dw(0.01)} ${dw(0.01)}`,
              background: `color-mix(in oklab, ${f.dark} 80%, black)`,
            }}
          />
        </div>

        {/* The lid's shell, seen when it is shut. */}
        <motion.div
          aria-hidden
          className="absolute backface-hidden"
          style={{
            left: "calc(50% - var(--dw) / 2)",
            top: `calc(${HINGE} - var(--dw) * ${LH})`,
            width: "var(--dw)",
            height: dw(LH),
            transformOrigin: "50% 100%",
            transform: lidBack,
            borderRadius: `${dw(0.03)} ${dw(0.03)} ${dw(0.01)} ${dw(0.01)}`,
            background: `radial-gradient(ellipse 80% 70% at 50% 45%, ${f.light}, ${f.base} 62%, ${f.dark})`,
          }}
        />

        {/* The lid's face: glass, bezel and the screen. */}
        <motion.div
          className="absolute backface-hidden"
          style={{
            left: "calc(50% - var(--dw) / 2)",
            top: `calc(${HINGE} - var(--dw) * ${LH})`,
            width: "var(--dw)",
            height: dw(LH),
            transformOrigin: "50% 100%",
            transform: lidFront,
            borderRadius: `${dw(0.03)} ${dw(0.03)} ${dw(0.01)} ${dw(0.01)}`,
            background: f.base,
            padding: dw(0.004),
          }}
        >
          <div
            className="relative size-full"
            style={{
              borderRadius: `${dw(0.027)} ${dw(0.027)} ${dw(0.008)} ${dw(0.008)}`,
              background: GLASS,
            }}
          >
            <span
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 rounded-full"
              style={{
                top: dw(0.013),
                width: dw(0.01),
                height: dw(0.01),
                background: "oklch(0.3 0.02 250)",
              }}
            />
            <div
              data-lid-screen=""
              className={cn(
                "absolute overflow-clip bg-background text-foreground",
                isOpen && "cursor-auto",
              )}
              style={{
                left: dw(0.026),
                right: dw(0.026),
                top: dw(0.032),
                bottom: dw(0.05),
                borderRadius: dw(0.006),
              }}
            >
              <div
                id={screenId}
                inert={!isOpen}
                aria-hidden={!isOpen || undefined}
                className="[container-type:size] absolute inset-0 overflow-clip"
              >
                {children}
              </div>
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ opacity: cover, background: GLASS }}
              />
            </div>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0"
              style={{
                height: dw(0.018),
                borderRadius: `0 0 ${dw(0.008)} ${dw(0.008)}`,
                background: `linear-gradient(to bottom, oklch(0.24 0.004 265), oklch(0.1 0.003 265))`,
              }}
            />
          </div>
        </motion.div>
      </div>

      {/* The keyboard's lid: over the laptop's footprint, its ring outlines
          the laptop; pointer gestures pass through to the drawing. */}
      <button
        type="button"
        aria-label={`${label} lid`}
        aria-expanded={isOpen}
        aria-controls={screenId}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={() => commit(!isOpen, 0, "visitor")}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "End") {
            event.preventDefault();
            if (!isOpen) commit(true, 0, "visitor");
          } else if (event.key === "ArrowDown" || event.key === "Home") {
            event.preventDefault();
            if (isOpen) commit(false, 0, "visitor");
          }
        }}
        className={cn(
          "pointer-events-none absolute rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{
          left: `calc(50% - var(--dw) * ${FIT_W / 2})`,
          width: dw(FIT_W),
          top: `calc(${HINGE} - var(--dw) * ${ABOVE})`,
          height: dw(FIT_H),
        }}
      />
      <p id={hintId} className="sr-only">
        Enter opens or shuts the lid; the arrow keys lift and lower it. With a
        pointer, click the laptop or drag the lid by hand.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
