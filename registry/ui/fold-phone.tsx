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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FoldPhoneFinish = "ink" | "cream" | "sage";

export type FoldPhoneProps = {
  /**
   * The screen. It is laid out in a size container: narrow on the cover
   * screen, wide on the inner one, so container queries re-flow it. While the
   * phone moves it is drawn more than once, so keep it presentational.
   */
  children?: React.ReactNode;
  /** The phone's accessible name. @default "Foldable phone" */
  label?: string;
  /** The clock in the status bar. @default "10:24" */
  time?: string;
  /** Controlled posture: 0 folded shut, 1 open flat, anything between a hinge angle. */
  fold?: number;
  /** Initial posture when uncontrolled. @default 0 */
  defaultFold?: number;
  /** Fires from the drag, key or button that moved the hinge, with the posture it comes to rest at. */
  onFoldChange?: (fold: number) => void;
  /** The frame and hinge. @default "ink" */
  finish?: FoldPhoneFinish;
  /** A crease down the inner screen that catches the light as it opens. Off: a seamless screen. @default true */
  crease?: boolean;
  /** Play the clap shut and the flat stop. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/*
 * Geometry, in cqw of the stage (the stage is 100 wide and 114 tall): each
 * half is HALF wide, the phone PH tall from TOP. Folded, the phone is one
 * half wide and centred; open, two halves.
 */
const HALF = 44;
const PH = 98;
const TOP = 8;
const CORNER = 6;
const RIM = 0.7;
/** Cover screen inset from the body's edge. */
const COVER = 2.6;
/** Inner screen inset from the body's outer edges (none at the hinge). */
const INNER = 1.8;
const SPINE = 1.8;
const PERSPECTIVE = 320;
/** Free-stop magnets: a rest this close to an end is pulled to it. */
const MAGNET = 0.12;
/** A release faster than this, in postures per second, is a throw. */
const FLICK = 1.6;
const STATUS = 18;

type Finish = { base: string; light: string; dark: string };

/** Fixed pigments: a finish is a material, the same in either theme. */
const FINISHES: Record<FoldPhoneFinish, Finish> = {
  ink: {
    base: "oklch(0.3 0.03 262)",
    light: "oklch(0.46 0.035 262)",
    dark: "oklch(0.2 0.025 262)",
  },
  cream: {
    base: "oklch(0.9 0.025 85)",
    light: "oklch(0.97 0.015 90)",
    dark: "oklch(0.74 0.035 80)",
  },
  sage: {
    base: "oklch(0.7 0.045 150)",
    light: "oklch(0.83 0.035 150)",
    dark: "oklch(0.52 0.045 150)",
  },
};

const GLASS = "oklch(0.13 0.004 260)";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const cq = (v: number) => `${r2(v)}cqw`;

/** The posture as drawn: a spring's overshoot reflects off either stop. */
const drawn = (p: number) =>
  p < 0 ? Math.min(1, -p) : p > 1 ? Math.max(0, 2 - p) : p;

/** The hinge's x in the stage, so the visible phone stays centred. */
const hingeAt = (d: number) =>
  50 - (HALF / 2) * (1 + Math.min(0, Math.cos(Math.PI * d)));

/**
 * The front half's free edge, from the stage's centre, in half-widths: it
 * swings from +½ (folded) through −½ (edge-on) to −1 (flat).
 */
const edgeOf = (d: number) => {
  const c = Math.cos(Math.PI * d);
  return c >= 0 ? -0.5 + c : -0.5 + c / 2;
};
/** The posture whose free edge is at `e` (half-widths from the centre). */
const postureAt = (e: number) => {
  const c = e >= -0.5 ? e + 0.5 : 2 * (e + 0.5);
  return Math.acos(Math.min(1, Math.max(-1, c))) / Math.PI;
};

/** How brightly the crease catches the light: strongest near 150°. */
const creaseLight = (d: number) => {
  const s = clamp01((d - 0.5) / 0.5);
  return 0.15 * s + 0.85 * Math.exp(-(((s - 0.66) / 0.2) ** 2));
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type Phase = { state: "folded" | "between" | "open"; face: "cover" | "inner" };

const phaseOf = (d: number, was?: Phase): Phase => {
  const face = d < 0.5 ? "cover" : "inner";
  // Hysteresis: a landing's small bounce off either stop is still "there".
  let state: Phase["state"] = "between";
  if (was?.state === "folded" ? d < 0.03 : d < 0.003) state = "folded";
  else if (was?.state === "open" ? d > 0.99 : d > 0.997) state = "open";
  return { state, face };
};

const sayOf = (v: number) =>
  v <= 0
    ? "Folded, cover screen."
    : v >= 1
      ? "Open flat, wide screen."
      : `Open ${Math.round(v * 180)} degrees.`;

type Api = {
  follow: (c: number) => void;
  onFold: (p: number) => void;
};

function StatusBar({ time }: { time: string }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-between px-3 text-[9px] leading-none font-semibold text-foreground tabular-nums"
      style={{ height: STATUS }}
    >
      <span>{time}</span>
      <svg viewBox="0 0 22 10" className="block h-2 w-[18px]">
        <rect
          x="0.5"
          y="0.5"
          width="18"
          height="9"
          rx="2.6"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.45"
        />
        <rect x="2" y="2" width="12" height="6" rx="1.4" fill="currentColor" />
        <path
          d="M20.2 3.4v3.2a1.6 1.6 0 0 0 0-3.2z"
          fill="currentColor"
          fillOpacity="0.45"
        />
      </svg>
    </div>
  );
}

/**
 * A book-style foldable phone holding any content. Folded it is a tall,
 * narrow phone showing its cover screen; drag it open — anywhere on it, the
 * front half's free edge following the finger — and the half swings round
 * its hinge in real perspective, its face darkening as it turns edge-on,
 * into one wide inner screen with a crease down the middle that catches the
 * light as the halves pass 150°. The content re-flows between the cover's
 * narrow screen and the wide one, because each is a size container.
 *
 * The hinge is a free-stop: let go slowly and it stays where it is (near an
 * end it is pulled there); flick it and it goes the way it was thrown.
 * Closing snaps shut on the snap spring and claps off the other half; opening
 * runs out on the glide spring to its flat stop. The hinge is a real
 * `role="slider"` in degrees and the Unfold button opens or folds it. Under
 * reduced motion the button and keys cross-fade between postures and a drag
 * still turns the half under the finger.
 */
export function FoldPhone({
  children,
  label = "Foldable phone",
  time = "10:24",
  fold,
  defaultFold = 0,
  onFoldChange,
  finish = "ink",
  crease = true,
  sound = false,
  disabled = false,
  className,
}: FoldPhoneProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const f = FINISHES[finish] ?? FINISHES.ink;

  const [own, setOwn] = React.useState(() => r3(clamp01(defaultFold)));
  const [check, setCheck] = React.useState(0);
  const controlled = fold !== undefined;
  const current = r3(clamp01(fold ?? own));

  const [said, setSaid] = React.useState({ n: 0, key: current, text: "" });
  if (said.key !== current) {
    setSaid({ n: said.n + 1, key: current, text: sayOf(current) });
  }

  const p = useMotionValue(current);
  const bend = useMotionValue(0);
  const push = useMotionValue(0);
  const dim = useMotionValue(1);
  const [phase, setPhase] = React.useState<Phase>(() => phaseOf(current));
  const [held, setHeld] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const target = React.useRef(current);
  const reported = React.useRef(current);
  const voice = React.useRef(false);
  const claps = React.useRef(0);
  const lastDrawn = React.useRef(drawn(current));
  const phaseRef = React.useRef(phase);
  const grab = React.useRef({ e0: 0, w: 1, width: 1 });
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  /** Moves the hinge to `to`: shut on snap, open or part-open on glide. */
  const settle = (to: number, velocity = 0, swap = false) => {
    halt("p");
    run("bend", animate(bend, 0, motionSafe ? springs.snap : { duration: 0 }));
    run("push", animate(push, 0, motionSafe ? springs.snap : { duration: 0 }));
    if (motionSafe) {
      run(
        "p",
        animate(p, to, {
          ...(to <= 0 ? springs.snap : springs.glide),
          velocity,
        }),
      );
      return;
    }
    if (!swap) {
      p.set(to);
      return;
    }
    // Reduced motion: no swing. Out, change posture, back in.
    run(
      "dim",
      animate(dim, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          p.set(to);
          run(
            "dim",
            animate(dim, 1, { duration: durations.fast, ease: easings.enter }),
          );
        },
      }),
    );
  };

  const commit = (to: number, velocity = 0, swap = false) => {
    const v = r3(clamp01(to));
    target.current = v;
    voice.current = true;
    claps.current = 0;
    settle(v, velocity, swap);
    if (v !== reported.current) {
      reported.current = v;
      if (!controlled) setOwn(v);
      onFoldChange?.(v);
    }
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  const follow = (c: number) => {
    if (held) return;
    if (c === reported.current && c === target.current) return;
    reported.current = c;
    if (c === target.current) return;
    target.current = c;
    voice.current = false;
    settle(c, 0, true);
  };

  /** The clap shut and the flat stop, heard where they happen. */
  const onFold = (raw: number) => {
    const d = drawn(raw);
    const prev = lastDrawn.current;
    lastDrawn.current = d;
    const next = phaseOf(d, phaseRef.current);
    if (
      next.state !== phaseRef.current.state ||
      next.face !== phaseRef.current.face
    ) {
      phaseRef.current = next;
      setPhase(next);
    }
    if (d > 0.05 && d < 0.95) claps.current = 0;
    if (!voice.current) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
    if (prev > 0.004 && d <= 0.004 && claps.current < 2) {
      audio.play("thock", {
        pitch: 1,
        gain: claps.current === 0 ? 0.65 : 0.22,
        pan,
      });
      claps.current += 1;
    } else if (prev < 0.996 && d >= 0.996 && claps.current < 1) {
      audio.play("thock", { pitch: 1.3, gain: 0.4, pan });
      claps.current += 1;
    }
  };

  React.useEffect(() => {
    api.current = { follow, onFold };
  });

  // What the host says; our own report echoed back is not news. Equal on
  // mount, so StrictMode's second run does nothing.
  React.useEffect(() => {
    api.current?.follow(current);
  }, [current, check]);

  React.useEffect(() => p.on("change", (v) => api.current?.onFold(v)), [p]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled,
    onStart: () => {
      const rect = stageRef.current?.getBoundingClientRect();
      const width = Math.max(1, rect?.width ?? 300);
      const w = (width * HALF) / 100;
      for (const key of ["p", "bend", "push", "dim"]) halt(key);
      dim.set(1);
      const d = clamp01(drawn(p.get()));
      p.set(d);
      grab.current = { e0: edgeOf(d) * w, w, width };
      voice.current = true;
      claps.current = 0;
      setHeld(true);
    },
    onMove: ({ offset }) => {
      const { e0, w, width } = grab.current;
      const e = e0 + offset.x;
      if (e > w / 2) {
        // Past shut: the phone is pushed along a little, not bent.
        p.set(0);
        bend.set(0);
        push.set(
          motionSafe ? r2((rubberband(e - w / 2, w) * 0.3 * 100) / width) : 0,
        );
        return;
      }
      if (e < -w) {
        // Past flat: the halves bend back a few degrees, and give.
        p.set(1);
        push.set(0);
        bend.set(motionSafe ? r2((rubberband(-w - e, w) / w) * 16) : 0);
        return;
      }
      bend.set(0);
      push.set(0);
      p.set(r3(postureAt(e / w)));
    },
    onEnd: ({ offset, velocity }) => {
      setHeld(false);
      const { e0, w } = grab.current;
      const e = Math.min(w / 2, Math.max(-w, e0 + offset.x));
      // The throw in postures per second: how fast the angle was changing.
      const slope = (postureAt((e + 1) / w) - postureAt((e - 1) / w)) / 2;
      const vp = Math.max(-6, Math.min(6, velocity.x * slope));
      const now = clamp01(p.get());
      // A throw goes all the way; a slow release is held where it is by
      // the hinge's friction, unless an end is close enough to pull it in.
      const land =
        Math.abs(vp) > FLICK
          ? vp > 0
            ? 1
            : 0
          : motionSafe
            ? project(now, vp, 0.99)
            : now;
      const to = land <= MAGNET ? 0 : land >= 1 - MAGNET ? 1 : clamp01(land);
      commit(to, motionSafe ? vp : 0);
    },
    onCancel: () => {
      setHeld(false);
      settle(target.current);
    },
  });

  const toggle = () => {
    if (disabled) return;
    commit(target.current < 0.5 ? 1 : 0, 0, true);
  };

  const onHingeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const sixth = Math.round(target.current * 6);
    let to: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        to = Math.min(6, sixth + 1) / 6;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        to = Math.max(0, sixth - 1) / 6;
        break;
      case "PageUp":
        to = Math.min(6, sixth + 3) / 6;
        break;
      case "PageDown":
        to = Math.max(0, sixth - 3) / 6;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!event.repeat) toggle();
        return;
      default:
        return;
    }
    event.preventDefault();
    if (r3(to) !== target.current) commit(to, 0, true);
  };

  /* ---------------------------- derived values --------------------------- */

  const d = useTransform(p, drawn);
  const hingeX = useTransform(
    [d, push] as MotionValue<number>[],
    ([v = 0, n = 0]: number[]) => hingeAt(v) + n,
  );
  const frontX = useTransform(hingeX, (h) => cq(h));
  const backX = frontX;
  const spineX = useTransform(hingeX, (h) => cq(h - SPINE));
  const liveX = useTransform(hingeX, (h) => cq(h - HALF + INNER));
  const slotX = useTransform(hingeX, (h) => cq(h - 5));
  const lineX = useTransform(hingeX, (h) => cq(h - 0.15));
  const creaseX = useTransform(
    [hingeX, d] as MotionValue<number>[],
    // The highlight rides the turning half's side of the crease, sliding
    // toward the line as the halves come flat.
    ([h = 0, v = 0]: number[]) => cq(h - 3.6 + clamp01((v - 0.5) / 0.5) * 1.8),
  );
  const angle = useTransform(
    [d, bend] as MotionValue<number>[],
    ([v = 0, b = 0]: number[]) => r2(-(180 * v + b)),
  );
  const coverVis = useTransform(d, (v) => (v < 0.5 ? "visible" : "hidden"));
  const innerVis = useTransform(d, (v) => (v < 0.5 ? "hidden" : "visible"));
  const coverShade = useTransform(d, (v) =>
    r3(0.6 * (1 - Math.max(0, Math.cos(Math.PI * v)))),
  );
  const innerShade = useTransform(
    [d, bend] as MotionValue<number>[],
    ([v = 0, b = 0]: number[]) =>
      r3(0.5 * (1 - Math.abs(Math.min(0, Math.cos(Math.PI * v)))) + b * 0.01),
  );
  const castShadow = useTransform(d, (v) =>
    r3(0.3 * Math.sin(Math.PI * clamp01(v))),
  );
  const creaseGlow = useTransform(d, (v) =>
    crease && v > 0.5 ? r3(0.85 * creaseLight(v)) : 0,
  );
  const creaseLine = useTransform(d, (v) =>
    crease && v > 0.5 ? r3(0.18 + 0.3 * (1 - clamp01((v - 0.5) / 0.5))) : 0,
  );

  const metal = `linear-gradient(160deg, ${f.light}, ${f.base} 30%, ${f.dark} 70%, ${f.base})`;
  const edge = `0 0 0 0.25cqw color-mix(in oklab, ${f.dark} 70%, black)`;
  const degrees = Math.round(current * 180);
  const reading =
    current <= 0 ? "Folded" : current >= 1 ? "Open flat" : `Open ${degrees}°`;
  const open = phase.state === "open";
  const folded = phase.state === "folded";

  const wideScreen = (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <StatusBar time={time} />
      <div className="[container-type:size] relative flex-1">{children}</div>
    </div>
  );

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col items-center gap-2",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={stageRef}
        {...drag}
        className={cn(
          "[container-type:inline-size] relative aspect-[100/114] w-full touch-pan-y overflow-clip select-none",
          disabled
            ? "cursor-not-allowed"
            : held
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: dim,
            perspective: `${PERSPECTIVE}cqw`,
          }}
        >
          {/* The spine: proud of the folded phone's left side, behind the
              open one. */}
          <motion.div
            aria-hidden
            className="absolute z-[1]"
            style={{
              left: 0,
              top: cq(TOP + 1.2),
              width: cq(SPINE + 1),
              height: cq(PH - 2.4),
              x: spineX,
              borderRadius: cq(SPINE),
              background: `linear-gradient(90deg, ${f.dark}, ${f.light} 45%, ${f.base} 70%, ${f.dark})`,
            }}
          />

          {/* The back half: the right of the inner screen. */}
          <motion.div
            aria-hidden
            className="absolute z-[2]"
            style={{
              left: 0,
              top: cq(TOP),
              width: cq(HALF),
              height: cq(PH),
              x: backX,
              borderRadius: `0 ${cq(CORNER)} ${cq(CORNER)} 0`,
              background: metal,
              boxShadow: `${edge}, 0 1.2cqw 3cqw color-mix(in oklab, black 22%, transparent)`,
            }}
          >
            <div
              className="absolute"
              style={{
                top: cq(RIM),
                bottom: cq(RIM),
                left: 0,
                right: cq(RIM),
                borderRadius: `0 ${cq(CORNER - RIM)} ${cq(CORNER - RIM)} 0`,
                background: GLASS,
              }}
            />
          </motion.div>

          {/* The inner screen, live: its right half until the phone lies
              flat, then all of it, over both halves. */}
          {folded ? null : (
            <motion.div
              aria-hidden={phase.face === "cover" || undefined}
              inert={!open || disabled}
              className={cn("absolute overflow-clip", open ? "z-30" : "z-[3]")}
              style={{
                left: 0,
                top: cq(TOP + INNER),
                width: cq(2 * (HALF - INNER)),
                height: cq(PH - 2 * INNER),
                x: liveX,
                borderRadius: cq(CORNER - INNER),
                clipPath: open ? "none" : "inset(0 0 0 50%)",
              }}
            >
              {wideScreen}
            </motion.div>
          )}

          {/* The opening half's shadow on the other half, by the hinge. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-[4]"
            style={{
              left: 0,
              top: cq(TOP + INNER),
              width: cq(HALF * 0.45),
              height: cq(PH - 2 * INNER),
              x: frontX,
              opacity: open || folded ? 0 : castShadow,
              background:
                "linear-gradient(90deg, color-mix(in oklab, black 70%, transparent), transparent)",
            }}
          />

          {/* The front half: the cover screen outside, the inner screen's
              left half inside. It turns about the hinge. */}
          <motion.div
            className="absolute z-20"
            style={{
              left: 0,
              top: cq(TOP),
              width: cq(HALF),
              height: cq(PH),
              x: frontX,
              rotateY: angle,
              originX: 0,
              originY: 0.5,
            }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                visibility: coverVis,
                borderRadius: `0 ${cq(CORNER)} ${cq(CORNER)} 0`,
                background: metal,
                boxShadow: edge,
              }}
            >
              <div
                className="absolute overflow-clip"
                style={{
                  inset: cq(RIM),
                  left: 0,
                  borderRadius: `0 ${cq(CORNER - RIM)} ${cq(CORNER - RIM)} 0`,
                  background: GLASS,
                }}
              />
              <div
                inert={!folded || disabled}
                className="absolute flex flex-col overflow-clip bg-background text-foreground"
                style={{
                  inset: cq(COVER),
                  left: cq(COVER - 1),
                  borderRadius: cq(CORNER - COVER + 0.6),
                }}
              >
                <StatusBar time={time} />
                <div className="[container-type:size] relative flex-1">
                  {children}
                </div>
                <span
                  aria-hidden
                  className="absolute top-[5px] left-1/2 size-[7px] -translate-x-1/2 rounded-full"
                  style={{ background: GLASS }}
                />
              </div>
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-black"
                style={{
                  opacity: coverShade,
                  borderRadius: "inherit",
                }}
              />
            </motion.div>

            <motion.div
              aria-hidden
              className="absolute inset-0"
              style={{
                visibility: innerVis,
                scaleX: -1,
                borderRadius: `${cq(CORNER)} 0 0 ${cq(CORNER)}`,
                background: metal,
                boxShadow: edge,
              }}
            >
              <div
                className="absolute"
                style={{
                  top: cq(RIM),
                  bottom: cq(RIM),
                  left: cq(RIM),
                  right: 0,
                  borderRadius: `${cq(CORNER - RIM)} 0 0 ${cq(CORNER - RIM)}`,
                  background: GLASS,
                }}
              />
              {phase.face === "inner" && !open ? (
                <div
                  inert
                  className="absolute overflow-clip"
                  style={{
                    top: cq(INNER),
                    bottom: cq(INNER),
                    left: cq(INNER),
                    right: 0,
                    borderRadius: `${cq(CORNER - INNER)} 0 0 ${cq(CORNER - INNER)}`,
                  }}
                >
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: cq(2 * (HALF - INNER)) }}
                  >
                    {wideScreen}
                  </div>
                </div>
              ) : null}
              <motion.div
                className="pointer-events-none absolute inset-0 bg-black"
                style={{ opacity: innerShade, borderRadius: "inherit" }}
              />
            </motion.div>
          </motion.div>

          {/* The crease: a hairline, and the light it catches. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-[35] bg-black"
            style={{
              left: 0,
              top: cq(TOP + INNER),
              width: "0.3cqw",
              height: cq(PH - 2 * INNER),
              x: lineX,
              opacity: creaseLine,
            }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-[35]"
            style={{
              left: 0,
              top: cq(TOP + INNER),
              width: "4cqw",
              height: cq(PH - 2 * INNER),
              x: creaseX,
              opacity: creaseGlow,
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, white 80%, transparent) 55%, transparent)",
            }}
          />
        </motion.div>

        {/* The hinge, for the keyboard: pointer gestures go to the phone. */}
        <motion.div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Hinge"
          aria-orientation="horizontal"
          aria-describedby={hintId}
          aria-valuemin={0}
          aria-valuemax={180}
          aria-valuenow={degrees}
          aria-valuetext={reading}
          aria-disabled={disabled || undefined}
          onKeyDown={onHingeKeyDown}
          className={cn(
            "pointer-events-none absolute z-40 rounded-3",
            FOCUS_RING,
          )}
          style={{
            left: 0,
            top: cq(TOP),
            width: "10cqw",
            height: cq(PH),
            x: slotX,
          }}
        />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-hairline bg-card px-3 text-xs text-ink-2 transition-colors",
          "hover:border-hairline-strong hover:text-foreground",
          FOCUS_RING,
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          className="size-4 shrink-0"
        >
          {current < 0.5 ? (
            <>
              <rect x="5" y="2.5" width="6" height="11" rx="1.4" />
              <path d="M3.5 5v6" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect x="2" y="2.5" width="12" height="11" rx="1.4" />
              <path d="M8 2.5v11" strokeDasharray="1.5 1.5" />
            </>
          )}
        </svg>
        {current < 0.5 ? "Unfold" : "Fold"}
      </button>

      <p id={hintId} className="sr-only">
        Drag the phone sideways to open or close it. Arrow keys turn the hinge
        30 degrees, Page keys 90, Home folds it, End opens it flat, and Enter
        opens or folds it all the way.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
