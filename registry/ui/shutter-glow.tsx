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
import { cn } from "@/registry/lib/utils";

export type ShutterGlowPalette = "dawn" | "harbor" | "cobalt" | "moss";
export type ShutterGlowFace = "front" | "back";

export type ShutterGlowProps = {
  /** The content on top of the blinds: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many blinds hang across the wall, 4 to 32. @default 14 */
  blinds?: number;
  /** How far the blinds stand open at rest, degrees, 0 (closed) to 70. @default 24 */
  angle?: number;
  /** A named palette, or four CSS colours of your own: the front gradient's two ends, then the back's. @default "dawn" */
  palette?: ShutterGlowPalette | readonly string[];
  /** How often a wave of turning crosses the wall on its own, ms; 0 turns it only on a press. @default 5200 */
  interval?: number;
  /** How thick each blind is, px: the dark edge a turning blind shows. @default 6 */
  depth?: number;
  /** The light behind the blinds, seen through the gaps, 0 (none) to 1. @default 0.6 */
  glow?: number;
  /** Where the light falls from, degrees across the wall: negative from the left. @default -20 */
  lightAngle?: number;
  /** The viewer's distance for the 3D, px; smaller is more dramatic. @default 900 */
  perspective?: number;
  /** The pointer and keyboard focus part the blinds, and a press sends a wave. @default true */
  interactive?: boolean;
  /** How far the blinds near the hand turn away from it, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand reaches across the blinds, px. @default 110 */
  radius?: number;
  /** No waves on their own; the hand still parts and turns them. @default false */
  paused?: boolean;
  /** Seeds how unevenly the blinds hang, so two walls never match. @default 1 */
  seed?: number;
  /** Fires when a wave starts, with the face the wall is turning to. */
  onTurn?: (face: ShutterGlowFace) => void;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) parting the blinds. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Pigments at fixed lightness — the front gradient's two ends, then the
 * back's — so a wall is the same wall in either theme. Cobalt is drawn from
 * the accent and signal tokens.
 */
const PALETTES: Record<ShutterGlowPalette, readonly string[]> = {
  dawn: [
    "oklch(0.87 0.06 62)",
    "oklch(0.7 0.11 352)",
    "oklch(0.42 0.09 282)",
    "oklch(0.76 0.1 46)",
  ],
  harbor: [
    "oklch(0.84 0.06 198)",
    "oklch(0.5 0.09 244)",
    "oklch(0.89 0.04 88)",
    "oklch(0.65 0.12 32)",
  ],
  cobalt: [
    "oklch(from var(--accent) 0.56 0.18 h)",
    "oklch(from var(--accent) 0.84 0.07 calc(h - 40))",
    "oklch(from var(--accent) 0.3 0.07 h)",
    "oklch(from var(--signal) 0.8 0.12 h)",
  ],
  moss: [
    "oklch(0.8 0.07 118)",
    "oklch(0.47 0.07 152)",
    "oklch(0.88 0.05 86)",
    "oklch(0.58 0.09 58)",
  ],
};

/** Each pigment sits 10% into the page, so the wall belongs to its theme (oklab keeps the hue). */
const inPage = (c: string) =>
  `color-mix(in oklab, ${c} 90%, var(--background))`;

/** A warm light from the warn token's hue at a fixed lightness. */
const GLOW = "oklch(from var(--warn) 0.95 0.05 h)";
/** The narrowest a blind may hang, px: below it a wall reads as stripes. */
const MIN_BLIND = 18;
/** A blind parts at most this far around the hand, degrees. */
const LEAN = 55;
/** Light on a face: ambient plus diffuse; the sheen's tightness. */
const AMBIENT = 0.42;
const SHINE = 40;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const RAD = Math.PI / 180;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A focus this soon after a press or a lift inside came from the hand, ms. */
const PRESS_FOCUS_MS = 1000;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,video[controls],audio[controls],[role='button'],[role='link'],[role='slider'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='menuitem'],[role='option'],[role='combobox'],[role='spinbutton'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type BlindApi = {
  /** Turn half over, one way (1) or the other (−1), after a delay, s. */
  turnBy: (sense: number, delay: number) => void;
  /** Lean around the hand, degrees. */
  leanTo: (deg: number) => void;
  /** Reduced motion: cross-fade the front face to the back gradient (or back). */
  fadeTo: (back: boolean, delay: number) => void;
  /** Stand at a face at once: no turn, no fade. */
  place: (halfTurns: number, faded: boolean) => void;
};

type BlindProps = {
  id: string;
  index: number;
  count: number;
  rest: number;
  depth: number;
  light: number;
  front: string;
  back: string;
  halfTurns: number;
  register: (id: string, api: BlindApi | null) => void;
};

/** Brightness of a face whose normal is turned `a` degrees, under a light from `l` degrees. */
const lit = (a: number, l: number) =>
  AMBIENT + (1 - AMBIENT) * Math.max(0, Math.cos((a - l) * RAD));
/** The sheen where the light's reflection meets the eye (the half-angle). */
const sheen = (a: number, l: number) =>
  Math.pow(Math.max(0, Math.cos((a - l / 2) * RAD)), SHINE);

/**
 * One blind: a slab with a front, a back and two edges, turning on its long
 * axis. Its angle is its turn (whole half-turns, on snap), its lean (around
 * the hand) and its resting angle; each face's shade and sheen come from
 * that angle, derived per frame by motion, never by React state.
 */
const Blind = React.memo(function Blind({
  id,
  index,
  count,
  rest,
  depth,
  light,
  front,
  back,
  halfTurns,
  register,
}: BlindProps) {
  const turn = useMotionValue(halfTurns * 180);
  /** Where the turn is heading: whole half-turns, so a wave mid-turn adds to it. */
  const aim = React.useRef(halfTurns * 180);
  const lean = useMotionValue(0);
  const fade = useMotionValue(0);
  const running = React.useRef<{
    turn: AnimationPlaybackControls | null;
    lean: AnimationPlaybackControls | null;
    fade: AnimationPlaybackControls | null;
  }>({ turn: null, lean: null, fade: null });

  React.useEffect(() => {
    const run = running.current;
    const api: BlindApi = {
      turnBy(sense, delay) {
        run.turn?.stop();
        aim.current += sense * 180;
        run.turn = animate(turn, aim.current, {
          ...springs.snap,
          delay,
          onComplete: () => {
            // Whole turns are the same face: fold the angle back so it never
            // grows, with jump() so no spring reads the fold as speed.
            if (Math.abs(aim.current) >= 360) {
              aim.current %= 360;
              turn.jump(aim.current);
            }
          },
        });
      },
      leanTo(deg) {
        run.lean?.stop();
        run.lean = animate(lean, deg, springs.snap);
      },
      fadeTo(toBack, delay) {
        run.fade?.stop();
        run.fade = animate(fade, toBack ? 1 : 0, {
          duration: durations.slow,
          ease: easings.move,
          delay,
        });
      },
      place(target, faded) {
        run.turn?.stop();
        run.lean?.stop();
        run.fade?.stop();
        aim.current = target * 180;
        turn.jump(aim.current);
        lean.jump(0);
        fade.jump(faded ? 1 : 0);
      },
    };
    register(id, api);
    return () => {
      run.turn?.stop();
      run.lean?.stop();
      run.fade?.stop();
      register(id, null);
    };
  }, [fade, id, lean, register, turn]);

  const angle = useTransform([turn, lean] as MotionValue<number>[], ([t, l]) =>
    r2((t as number) + (l as number) + rest),
  );
  // Each face is one layer: its light is drawn into its own background, a
  // sheen over a shade over its slice of the gradient, so a turning wall is
  // a few dozen composited planes, not hundreds.
  const slice = count > 1 ? r3((index / (count - 1)) * 100) : 0;
  const lay = (image: string, shade: number, shine: number) =>
    `linear-gradient(rgba(255, 255, 255, ${r3(shine)}), rgba(255, 255, 255, ${r3(shine)})), linear-gradient(rgba(0, 0, 0, ${r3(shade)}), rgba(0, 0, 0, ${r3(shade)})), ${image}`;
  const frontImage = useTransform(angle, (a) =>
    lay(front, (1 - lit(a, light)) * 0.92, sheen(a, light) * 0.34),
  );
  // Under reduced motion the back gradient fades in on the front face, lit
  // as that face is, so the wall keeps its shading through the change.
  const fadeImage = useTransform(angle, (a) =>
    lay(back, (1 - lit(a, light)) * 0.92, sheen(a, light) * 0.34),
  );
  const backImage = useTransform(angle, (a) =>
    lay(back, (1 - lit(a + 180, light)) * 0.92, sheen(a + 180, light) * 0.34),
  );
  // The edges face sideways: lit only when turned toward the light, and
  // otherwise the dark seam between the faces.
  const rightImage = useTransform(angle, (a) =>
    lay(front, 0.3 + (1 - lit(a + 90, light)) * 0.66, 0),
  );
  const leftImage = useTransform(angle, (a) =>
    lay(front, 0.3 + (1 - lit(a - 90, light)) * 0.66, 0),
  );
  // Which faces turn toward the eye. Chromium does not reliably hide a
  // face's back in a 3D wall, so each face is shown or hidden from the
  // angle itself.
  const frontSeen = useTransform(angle, (a) =>
    Math.cos(a * RAD) > 0 ? "visible" : "hidden",
  );
  const backSeen = useTransform(angle, (a) =>
    Math.cos(a * RAD) > 0 ? "hidden" : "visible",
  );
  const leftSeen = useTransform(angle, (a) =>
    Math.sin(a * RAD) > 0 ? "visible" : "hidden",
  );
  const rightSeen = useTransform(angle, (a) =>
    Math.sin(a * RAD) < 0 ? "visible" : "hidden",
  );

  const size = `100% 100%, 100% 100%, ${count * 100}% 100%`;
  const at = `0% 0%, 0% 0%, ${slice}% 0%`;
  const half = r2(depth / 2);

  return (
    <div className="relative h-full min-w-0 flex-1 transform-3d">
      <motion.div
        className="absolute inset-0 transform-3d"
        style={{ rotateY: angle }}
      >
        <motion.div
          className="absolute inset-0 backface-hidden"
          style={{
            backgroundImage: frontImage,
            backgroundSize: size,
            backgroundPosition: at,
            z: half,
            visibility: frontSeen,
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: fadeImage,
              backgroundSize: size,
              backgroundPosition: at,
              opacity: fade,
            }}
          />
        </motion.div>
        <motion.div
          className="absolute inset-0 backface-hidden"
          style={{
            backgroundImage: backImage,
            backgroundSize: size,
            backgroundPosition: at,
            z: -half,
            rotateY: 180,
            visibility: backSeen,
          }}
        />
        <motion.div
          className="absolute inset-y-0 left-0 backface-hidden"
          style={{
            backgroundImage: leftImage,
            backgroundSize: size,
            backgroundPosition: at,
            width: depth,
            x: -half,
            rotateY: -90,
            visibility: leftSeen,
          }}
        />
        <motion.div
          className="absolute inset-y-0 right-0 backface-hidden"
          style={{
            backgroundImage: rightImage,
            backgroundSize: size,
            backgroundPosition: at,
            width: depth,
            x: half,
            rotateY: 90,
            visibility: rightSeen,
          }}
        />
      </motion.div>
    </div>
  );
});

/**
 * A background of vertical blinds made of real 3D slabs — a front face, a
 * back face and two edges each, turning on their long axes in one shared
 * perspective — with a glow of light behind them and the content on top in
 * its own layer. The fronts carry slices of one gradient and the backs
 * slices of another, so the closed wall reads as one gradient and a
 * half-turn of every blind as the other. A light from one side shades every
 * face from its normal and puts a sheen on it where its reflection meets the
 * eye; edges are the dark seams between faces, and open blinds show the glow
 * through their gaps.
 *
 * A wave of turning crosses the wall on its own every `interval` ms: blind
 * after blind turns half over on the snap spring — one crisp overshoot, like
 * a shutter landing — staggered by the house cascade so the whole wall turns
 * inside 600 ms. A press sends the wave out both ways from the blind under
 * it. The blinds near the pointer part around it, each on its own snap
 * spring, so they swing open and closed as the hand passes. Keyboard focus on
 * a control inside parts the blinds around it and sends a wave from there.
 * Every angle is a motion value and every shade is derived from it; nothing
 * runs between waves, off screen or in a hidden page. Under reduced motion
 * the blinds hang still and a wave is a cross-fade between the gradients.
 */
export function ShutterGlow({
  children,
  blinds = 14,
  angle = 24,
  palette = "dawn",
  interval = 5200,
  depth = 6,
  glow = 0.6,
  lightAngle = -20,
  perspective = 900,
  interactive = true,
  pointerStrength = 0.6,
  radius = 110,
  paused = false,
  seed = 1,
  onTurn,
  onActiveChange,
  className,
}: ShutterGlowProps) {
  const motionSafe = useMotionSafe();
  /** How many blinds the box can hold at MIN_BLIND px each; unmeasured, any count. */
  const [room, setRoom] = React.useState(32);
  const count = clamp(Math.round(blinds), 4, Math.min(32, room));
  const colours = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette] ?? PALETTES.dawn)
        : palette.length >= 4
          ? palette.slice(0, 4)
          : PALETTES.dawn;
    return list.map(inPage);
  }, [palette]);
  const [f0, f1, b0, b1] = colours;
  const front = `linear-gradient(104deg, ${f0}, color-mix(in oklch, ${f0}, ${f1}) 48%, ${f1})`;
  const back = `linear-gradient(104deg, ${b0}, color-mix(in oklch, ${b0}, ${b1}) 52%, ${b1})`;

  const rests = React.useMemo(() => {
    const rand = lcg(seed * 23 + 9);
    const open = clamp(angle, 0, 70);
    // Each blind hangs a few degrees off true, as real ones do.
    return Array.from({ length: count }, () => r2(open + (rand() - 0.5) * 5));
  }, [angle, count, seed]);

  /** The face the wall shows (or is turning to), as half-turns: even is the front. */
  const [face, setFace] = React.useState(0);
  const faceRef = React.useRef(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const apis = React.useRef(new Map<string, BlindApi>());
  const visible = React.useRef(true);
  const timer = React.useRef(0);
  const direction = React.useRef(1);
  const hovering = React.useRef<"pointer" | "focus" | null>(null);
  const latest = React.useRef({
    count,
    interval,
    paused,
    motionSafe,
    interactive,
    pointerStrength,
    radius,
    onTurn,
    onActiveChange,
  });
  React.useEffect(() => {
    latest.current = {
      count,
      interval,
      paused,
      motionSafe,
      interactive,
      pointerStrength,
      radius,
      onTurn,
      onActiveChange,
    };
  });

  const register = React.useCallback((id: string, api: BlindApi | null) => {
    if (api) apis.current.set(id, api);
    else apis.current.delete(id);
  }, []);
  const blindAt = (i: number) => apis.current.get(`${count}:${i}`);

  /** A wave of turning from one blind outward (or across from an end). */
  const wave = React.useCallback((from: number, ends = false) => {
    const l = latest.current;
    const n = l.count;
    const next = faceRef.current + 1;
    faceRef.current = next;
    setFace(next);
    const stagger = cascade(n);
    for (let i = 0; i < n; i += 1) {
      const api = apis.current.get(`${n}:${i}`);
      if (!api) continue;
      const delay = Math.abs(i - from) * stagger;
      if (l.motionSafe) {
        // Blinds turn away from where the wave starts, so it opens outward.
        api.turnBy(ends ? direction.current : i < from ? -1 : 1, delay);
      } else {
        api.fadeTo(next % 2 === 1, delay);
      }
    }
    l.onTurn?.(next % 2 === 1 ? "back" : "front");
  }, []);

  // A new count or a new motion preference puts every blind at the wall's face.
  React.useEffect(() => {
    const odd = faceRef.current % 2 === 1;
    for (let i = 0; i < count; i += 1) {
      const api = apis.current.get(`${count}:${i}`);
      if (!api) continue;
      if (motionSafe) api.place(odd ? 1 : 0, false);
      else api.place(0, odd);
    }
  }, [count, motionSafe]);

  // The idle wave: a timer that waits while unseen, never a loop.
  const schedule = React.useCallback(() => {
    const arm = () => {
      window.clearTimeout(timer.current);
      timer.current = 0;
      const l = latest.current;
      if (l.paused || l.interval <= 0 || !l.motionSafe) return;
      timer.current = window.setTimeout(
        () => {
          timer.current = 0;
          // Unseen, the wall waits; the observer re-arms it on return.
          if (!visible.current || document.hidden) return;
          const n = latest.current.count;
          direction.current = -direction.current;
          wave(direction.current > 0 ? 0 : n - 1, true);
          arm();
        },
        Math.max(1200, l.interval),
      );
    };
    arm();
  }, [wave]);

  React.useEffect(() => {
    schedule();
    return () => {
      window.clearTimeout(timer.current);
      timer.current = 0;
    };
  }, [schedule, interval, paused, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [schedule]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const was = visible.current;
        visible.current = Boolean(entry?.isIntersecting);
        if (visible.current && !was) schedule();
      });
      watcher.observe(node);
      const sizer = new ResizeObserver(() => {
        setRoom(Math.max(4, Math.floor(node.clientWidth / MIN_BLIND)));
      });
      sizer.observe(node);
      return () => {
        watcher.disconnect();
        sizer.disconnect();
      };
    },
    [schedule],
  );

  /** When the hand last pressed or lifted inside, so the focus it causes is not taken for the keyboard. */
  const pressedAt = React.useRef(-Infinity);

  const local = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, index: 0 };
    const r = root.getBoundingClientRect();
    const x = clientX - r.left - root.clientLeft;
    const w = Math.max(1, root.clientWidth);
    return { x, index: clamp(Math.floor((x / w) * count), 0, count - 1) };
  };

  /** The blinds near the hand turn away from it, so they part around it. */
  const part = (x: number) => {
    const root = rootRef.current;
    const l = latest.current;
    if (!root || !l.motionSafe) return;
    const w = Math.max(1, root.clientWidth);
    const reach = Math.max(24, l.radius);
    const strength = clamp(l.pointerStrength, 0, 1);
    for (let i = 0; i < count; i += 1) {
      const d = (((i + 0.5) / count) * w - x) / reach;
      blindAt(i)?.leanTo(r2(LEAN * strength * d * Math.exp(0.5 - 0.5 * d * d)));
    }
  };

  const release = () => {
    for (let i = 0; i < count; i += 1) blindAt(i)?.leanTo(0);
  };

  const setHover = (next: "pointer" | "focus" | null) => {
    const was = hovering.current;
    hovering.current = next;
    if (Boolean(was) !== Boolean(next))
      latest.current.onActiveChange?.(Boolean(next));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // Under reduced motion the blinds do not part, so the hand is not reported.
    if (!interactive || !motionSafe) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    setHover("pointer");
    part(local(event.clientX).x);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedAt.current = performance.now();
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX);
    if (motionSafe) {
      setHover("pointer");
      part(at.x);
    }
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) {
      wave(at.index);
      schedule();
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    // A tap focuses its target after the finger lifts.
    pressedAt.current = performance.now();
    if (event.pointerType !== "touch" || hovering.current !== "pointer") return;
    setHover(null);
    release();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || hovering.current !== "pointer") return;
    setHover(null);
    release();
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    // A text field shows a focus ring even when clicked; a press is not the keyboard.
    if (performance.now() - pressedAt.current < PRESS_FOCUS_MS) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2);
    if (motionSafe) {
      setHover("focus");
      part(at.x);
    }
    wave(at.index);
    schedule();
  };

  // A key pressed inside means the next focus is the keyboard's, however
  // recently the hand pressed.
  const onKeyDown = () => {
    pressedAt.current = -Infinity;
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    if (hovering.current !== "focus") return;
    setHover(null);
    release();
  };

  // Disabling the hand (or reducing motion) lets the blinds hang again.
  React.useEffect(() => {
    if ((interactive && motionSafe) || !hovering.current) return;
    hovering.current = null;
    latest.current.onActiveChange?.(false);
    for (const api of apis.current.values()) api.leanTo(0);
  }, [interactive, motionSafe]);

  const glowAlpha = Math.round(clamp(glow, 0, 1) * 85);

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDownCapture={onKeyDown}
      className={cn(
        // Nothing is dragged here; the page keeps its vertical scroll on touch.
        "group/shutter-glow relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor:
            "color-mix(in oklab, color-mix(in oklab, var(--background) 82%, var(--foreground)) 70%, black)",
          backgroundImage: `radial-gradient(ellipse 70% 120% at 70% 30%, color-mix(in oklab, ${GLOW} ${glowAlpha}%, transparent), transparent 72%), radial-gradient(ellipse 40% 60% at 22% 80%, color-mix(in oklab, ${GLOW} ${Math.round(glowAlpha * 0.35)}%, transparent), transparent 70%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex"
        style={{
          perspective: `${Math.round(clamp(perspective, 200, 4000))}px`,
        }}
      >
        {rests.map((rest, i) => (
          <Blind
            key={`${count}:${i}`}
            id={`${count}:${i}`}
            index={i}
            count={count}
            rest={rest}
            depth={clamp(depth, 0, 24)}
            light={clamp(lightAngle, -80, 80)}
            front={front}
            back={back}
            halfTurns={motionSafe ? face % 2 : 0}
            register={register}
          />
        ))}
      </div>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}
