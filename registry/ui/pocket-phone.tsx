"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionStyle,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PocketPhoneFinish = "graphite" | "silver" | "sand";
export type PocketPhoneOrientation = "portrait" | "landscape";

export type PocketPhoneProps = {
  /** The screen: any content, laid out in a size container the shape of the screen. */
  children?: React.ReactNode;
  /** The device's accessible name. @default "Phone" */
  label?: string;
  /** What the island shows when it opens. Without it the island is only the camera. */
  island?: React.ReactNode;
  /** The island button's accessible name. @default "Live activity" */
  islandLabel?: string;
  /** The clock in the status bar. @default "9:41" */
  time?: string;
  /** Controlled orientation. */
  orientation?: PocketPhoneOrientation;
  /** Initial orientation when uncontrolled. @default "portrait" */
  defaultOrientation?: PocketPhoneOrientation;
  /** Fires from the turn button with the orientation asked for. */
  onOrientationChange?: (orientation: PocketPhoneOrientation) => void;
  /** Controlled volume, 0 to 1 in sixteenths. */
  volume?: number;
  /** Initial volume when uncontrolled. @default 0.5 */
  defaultVolume?: number;
  /** Fires from the volume buttons with the new level. */
  onVolumeChange?: (volume: number) => void;
  /** Controlled: whether the screen is on. */
  awake?: boolean;
  /** Initial screen state when uncontrolled. @default true */
  defaultAwake?: boolean;
  /** Fires from the side button (or a tap on the dark glass) with the new state. */
  onAwakeChange?: (awake: boolean) => void;
  /** Controlled: whether the island is open. */
  islandOpen?: boolean;
  /** Initial island state when uncontrolled. @default false */
  defaultIslandOpen?: boolean;
  /** Fires from a tap on the island, Escape, or a press outside it. */
  onIslandOpenChange?: (open: boolean) => void;
  /** How far the phone leans toward the pointer, in degrees, 0 to 15. @default 8 */
  tilt?: number;
  /** The metal band and keys. @default "graphite" */
  finish?: PocketPhoneFinish;
  /** Light across the glass that moves with the tilt. @default true */
  glare?: boolean;
  /** Play the keys' clicks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/*
 * Every part of the frame is a multiple of the body width, `--bw`, so the
 * phone is drawn the same at any size and the server needs no measurement.
 */
/** Body height, in body widths. */
const BH = 2.06;
/** The metal band seen from the front. */
const RIM = 0.012;
/** Body edge to screen edge. */
const BEZEL = 0.038;
const SW = 1 - 2 * BEZEL;
const SH = BH - 2 * BEZEL;
const R_BODY = 0.155;
const R_GLASS = R_BODY - RIM;
const R_SCREEN = R_BODY - BEZEL;
/** The body plus the side keys' hit boxes, across. */
const REACH = 1.1;
/** Key hit box, outside the body. */
const KEY = 0.05;
/** Status bar: screen top to just under the island. */
const STATUS = 0.128;
/** Landscape safe inset on each side, clear of the island. */
const SIDE = 0.12;
const HOME = 0.055;
const ISLAND_TOP = 0.062;
/** Island sizes: closed, open upright, open on its side. */
const ISLAND = {
  w0: 0.3,
  h0: 0.088,
  wPortrait: 0.86,
  hPortrait: 0.27,
  wLandscape: 0.44,
  hLandscape: 0.96,
  r0: 0.044,
  r1: 0.12,
};
const STEPS = 16;
const MAX_TILT = 15;
const HOLD_MS = 420;
const REPEAT_MS = 90;
const HUD_MS = 1400;

const GLASS = "oklch(0.15 0.004 265)";
const ISLAND_BLACK = "oklch(0.07 0.002 265)";

type Finish = { band: string; light: string; dark: string; key: string };

/** Fixed pigments: a finish is a material, the same in either theme. */
const FINISHES: Record<PocketPhoneFinish, Finish> = {
  graphite: {
    band: "oklch(0.42 0.008 265)",
    light: "oklch(0.63 0.008 265)",
    dark: "oklch(0.27 0.008 265)",
    key: "oklch(0.36 0.008 265)",
  },
  silver: {
    band: "oklch(0.85 0.004 250)",
    light: "oklch(0.96 0.002 250)",
    dark: "oklch(0.66 0.006 250)",
    key: "oklch(0.76 0.005 250)",
  },
  sand: {
    band: "oklch(0.8 0.036 75)",
    light: "oklch(0.92 0.026 80)",
    dark: "oklch(0.62 0.04 70)",
    key: "oklch(0.72 0.04 72)",
  },
};

/*
 * A highlight with a faint shade on either flank: white alone vanishes over a
 * white screen, and the shade is what makes it read as curved glass there.
 */
const GLARE_BAND =
  "linear-gradient(115deg, transparent 30%, color-mix(in oklab, black 7%, transparent) 41%, color-mix(in oklab, white 30%, transparent) 47.5%, color-mix(in oklab, white 9%, transparent) 52%, color-mix(in oklab, black 5%, transparent) 59%, transparent 70%)";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
/** A length in body widths. */
const bw = (k: number) => `calc(var(--bw) * ${r4(k)})`;

/**
 * The body width at a turn of `p` (0 upright, 1 on its side): the turned
 * body's bounding box, keys included, fitted inside the box with a margin for
 * the tilt's projection and the shadow.
 */
const bodyWidthAt = (p: number) => {
  const a = (Math.PI / 2) * p;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const across = r4(REACH * c + BH * s);
  const down = r4(REACH * s + BH * c);
  return `min((100cqw - 10cqmin) / ${across}, (100cqh - 10cqmin) / ${down})`;
};

const cssVar = (name: `--${string}`, value: MotionValue<string>) =>
  ({ [name]: value }) as MotionStyle;

const stepsOf = (v: number) => Math.round(clamp01(v) * STEPS);

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type KeyId = "up" | "down" | "side";

type Said = {
  n: number;
  landscape: boolean;
  steps: number;
  awake: boolean;
  text: string;
};

type Api = {
  settleTurn: (landscape: boolean) => void;
  settleAwake: (awake: boolean) => void;
  settleIsland: (open: boolean) => void;
  settleFill: (steps: number, show: boolean) => void;
  closeIsland: () => void;
  interrupt: () => void;
};

type FrameKeyProps = {
  edge: "left" | "right";
  /** Where the key starts down the body, in body widths. */
  top: number;
  length: number;
  name: string;
  scaleX: MotionValue<number>;
  shade: MotionValue<string>;
  fill: string;
  disabled: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onBlur: () => void;
};

/**
 * A key on the frame's edge: the hit box reaches out past the body, so a key
 * a few pixels proud is still easy to press; the key itself sinks toward the
 * body from its outer edge.
 */
function FrameKey({
  edge,
  top,
  length,
  name,
  scaleX,
  shade,
  fill,
  disabled,
  ...handlers
}: FrameKeyProps) {
  return (
    <button
      type="button"
      data-pocket-control=""
      aria-label={name}
      disabled={disabled}
      {...handlers}
      className={cn(
        "pointer-events-auto absolute touch-manipulation rounded-1 select-none",
        FOCUS_RING,
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
      style={{
        top: bw(top),
        height: bw(length),
        width: bw(KEY),
        left: edge === "left" ? bw(-KEY) : undefined,
        right: edge === "right" ? bw(-KEY) : undefined,
      }}
    >
      <motion.span
        aria-hidden
        className={cn(
          "absolute inset-y-0 rounded-[2px]",
          edge === "left" ? "right-0" : "left-0",
        )}
        style={{
          width: bw(0.014),
          background: fill,
          scaleX,
          originX: edge === "left" ? 1 : 0,
          filter: shade,
        }}
      />
    </button>
  );
}

/**
 * A phone frame that holds any screen. It leans toward the pointer under a
 * sheet of glare, turns to landscape from a corner button — the body rotates
 * on the glide spring while the screen counter-rotates and re-lays its
 * content out in real pixels, easing back mid-turn so it never leaves its
 * box — its keys travel into the frame when pressed, the volume keys raise a
 * level on the glass beside them, the side key puts the screen to sleep and
 * wakes it, and the island opens on the snap spring into a live activity.
 *
 * The frame is drawn from one length, the body width, as a CSS `min()` of its
 * container in both directions, so it fits any box and renders the same on
 * the server. Every key is a real button; the island is a disclosure; the
 * turn button is a toggle. Under reduced motion nothing leans or travels: the
 * phone cross-fades between orientations and every state still shows.
 */
export function PocketPhone({
  children,
  label = "Phone",
  island,
  islandLabel = "Live activity",
  time = "9:41",
  orientation,
  defaultOrientation = "portrait",
  onOrientationChange,
  volume,
  defaultVolume = 0.5,
  onVolumeChange,
  awake,
  defaultAwake = true,
  onAwakeChange,
  islandOpen,
  defaultIslandOpen = false,
  onIslandOpenChange,
  tilt = 8,
  finish = "graphite",
  glare = true,
  sound = false,
  disabled = false,
  className,
}: PocketPhoneProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const islandId = `${uid}-island`;
  const f = FINISHES[finish] ?? FINISHES.graphite;
  const lean =
    disabled || !motionSafe ? 0 : Math.min(MAX_TILT, Math.max(0, tilt));

  const [ownOrientation, setOwnOrientation] =
    React.useState(defaultOrientation);
  const [ownVolume, setOwnVolume] = React.useState(() =>
    stepsOf(defaultVolume),
  );
  const [ownAwake, setOwnAwake] = React.useState(defaultAwake);
  const [ownIsland, setOwnIsland] = React.useState(defaultIslandOpen);
  const isLandscape = (orientation ?? ownOrientation) === "landscape";
  const steps = volume === undefined ? ownVolume : stepsOf(volume);
  const isAwake = awake ?? ownAwake;
  const isIslandOpen = island !== undefined && (islandOpen ?? ownIsland);

  // What the live region says is frozen from the new value in the render that
  // flips it, so it never speaks before a controlling host has answered.
  const [said, setSaid] = React.useState<Said>({
    n: 0,
    landscape: isLandscape,
    steps,
    awake: isAwake,
    text: "",
  });
  if (
    said.landscape !== isLandscape ||
    said.steps !== steps ||
    said.awake !== isAwake
  ) {
    setSaid({
      n: said.n + 1,
      landscape: isLandscape,
      steps,
      awake: isAwake,
      text:
        said.landscape !== isLandscape
          ? isLandscape
            ? "Landscape."
            : "Portrait."
          : said.awake !== isAwake
            ? isAwake
              ? "Screen on."
              : "Screen off."
            : `Volume ${steps} of ${STEPS}.`,
    });
  }

  const turn = useMotionValue(isLandscape ? 1 : 0);
  const dim = useMotionValue(1);
  const cover = useMotionValue(isAwake ? 0 : 1);
  const wakeScale = useMotionValue(1);
  const q = useMotionValue(isIslandOpen ? 1 : 0);
  const islandFade = useMotionValue(isIslandOpen ? 1 : 0);
  const hudShow = useMotionValue(0);
  const hudX = useMotionValue(0);
  const hudFill = useMotionValue(steps / STEPS);
  const pressUp = useMotionValue(0);
  const pressDown = useMotionValue(0);
  const pressSide = useMotionValue(0);
  const aimX = useMotionValue(0);
  const aimY = useMotionValue(0);
  const leanSpring = {
    stiffness: springs.glide.stiffness,
    damping: springs.glide.damping,
    mass: springs.glide.mass,
  };
  const sx = useSpring(aimX, leanSpring);
  const sy = useSpring(aimY, leanSpring);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const islandRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const repeat = React.useRef(0);
  const hudTimer = React.useRef(0);
  const release = React.useRef<(() => void) | null>(null);
  const level = React.useRef(steps);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const click = (pitch: number, gain: number, el: Element | null) => {
    const rect = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  /* ------------------------------ the lean ------------------------------ */

  const aimAt = (x: number, y: number) => {
    if (lean === 0) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    let nx = ((x - rect.left) / rect.width) * 2 - 1;
    let ny = ((y - rect.top) / rect.height) * 2 - 1;
    const m = Math.hypot(nx, ny);
    if (m > 1) {
      nx /= m;
      ny /= m;
    }
    aimX.set(Number(nx.toFixed(3)));
    aimY.set(Number(ny.toFixed(3)));
  };
  const rest = () => {
    aimX.set(0);
    aimY.set(0);
  };

  /* ------------------------------ settling ------------------------------ */

  const settleTurn = (landscape: boolean) => {
    const target = landscape ? 1 : 0;
    if (!motionSafe) {
      // A cross-fade, not a turn: out, swap, back in.
      halt("turnSpring");
      run(
        "dim",
        animate(dim, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            turn.set(target);
            run(
              "dim",
              animate(dim, 1, {
                duration: durations.fast,
                ease: easings.enter,
              }),
            );
          },
        }),
      );
      return;
    }
    halt("dim");
    dim.set(1);
    run(
      "turnSpring",
      animate(turn, target, { ...springs.glide, velocity: turn.getVelocity() }),
    );
  };

  const settleAwake = (on: boolean) => {
    if (on) {
      if (motionSafe) {
        wakeScale.set(0.97);
        run("wakeScale", animate(wakeScale, 1, springs.glide));
      }
      run(
        "cover",
        animate(cover, 0, { duration: durations.slow, ease: easings.enter }),
      );
      return;
    }
    halt("wakeScale");
    wakeScale.set(1);
    run(
      "cover",
      animate(cover, 1, { duration: durations.fast, ease: easings.exit }),
    );
  };

  const settleIsland = (open: boolean) => {
    if (open) {
      if (motionSafe) run("q", animate(q, 1, springs.snap));
      else {
        halt("q");
        q.set(1);
      }
      run(
        "islandFade",
        animate(islandFade, 1, {
          duration: durations.base,
          delay: motionSafe ? 0.08 : 0,
          ease: easings.enter,
        }),
      );
      return;
    }
    if (motionSafe) run("q", animate(q, 0, springs.glide));
    run(
      "islandFade",
      animate(islandFade, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          if (!motionSafe) q.set(0);
        },
      }),
    );
  };

  const showHud = () => {
    window.clearTimeout(hudTimer.current);
    if (motionSafe) {
      if (hudShow.get() < 0.05) hudX.set(-distances.nudge);
      run("hudX", animate(hudX, 0, springs.snap));
    } else {
      halt("hudX");
      hudX.set(0);
    }
    run(
      "hudShow",
      animate(hudShow, 1, { duration: durations.fast, ease: easings.enter }),
    );
    hudTimer.current = window.setTimeout(() => {
      run(
        "hudShow",
        animate(hudShow, 0, { duration: durations.base, ease: easings.exit }),
      );
    }, HUD_MS);
  };

  const settleFill = (n: number, show: boolean) => {
    const to = n / STEPS;
    run(
      "fill",
      motionSafe
        ? animate(hudFill, to, springs.snap)
        : animate(hudFill, to, { duration: durations.fast }),
    );
    if (show) showHud();
  };

  /* ------------------------------- changes ------------------------------ */

  const askOrientation = (landscape: boolean) => {
    const next: PocketPhoneOrientation = landscape ? "landscape" : "portrait";
    if (orientation === undefined) setOwnOrientation(next);
    onOrientationChange?.(next);
  };

  const askAwake = (on: boolean) => {
    if (awake === undefined) setOwnAwake(on);
    onAwakeChange?.(on);
  };

  const askIsland = (open: boolean) => {
    if (islandOpen === undefined) setOwnIsland(open);
    onIslandOpenChange?.(open);
  };

  const stepVolume = (dir: 1 | -1) => {
    const next = Math.min(STEPS, Math.max(0, level.current + dir));
    // Shown even at the stops: a press at full volume still says "full".
    showHud();
    if (next === level.current) return;
    level.current = next;
    if (volume === undefined) setOwnVolume(next);
    onVolumeChange?.(Number((next / STEPS).toFixed(6)));
  };

  /* -------------------------------- keys -------------------------------- */

  const pressOf = (id: KeyId) =>
    id === "up" ? pressUp : id === "down" ? pressDown : pressSide;

  const pressKey = (id: KeyId, down: boolean) => {
    const mv = pressOf(id);
    if (!motionSafe) {
      halt(`key-${id}`);
      mv.set(down ? 1 : 0);
      return;
    }
    run(`key-${id}`, animate(mv, down ? 1 : 0, springs.flick));
  };

  const stopRepeat = () => {
    window.clearTimeout(repeat.current);
    repeat.current = 0;
  };

  /** Lets go of every held key: the pointer lifted, or the page went away. */
  const interrupt = () => {
    stopRepeat();
    release.current?.();
    release.current = null;
    for (const id of ["up", "down", "side"] as const) {
      if (pressOf(id).get() > 0) pressKey(id, false);
    }
    rest();
  };

  /** Holds a key down until this pointer lifts, wherever it lifts. */
  const holdKey = (id: KeyId, pointerId: number) => {
    release.current?.();
    pressKey(id, true);
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      release.current?.();
      release.current = null;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    release.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stopRepeat();
      pressKey(id, false);
    };
  };

  const volumePointerDown = (
    dir: 1 | -1,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    holdKey(dir > 0 ? "up" : "down", event.pointerId);
    click(dir > 0 ? 1.15 : 1, 0.6, event.currentTarget);
    stepVolume(dir);
    // Held, it keeps stepping, as a real rocker does.
    const again = () => {
      stepVolume(dir);
      click(dir > 0 ? 1.15 : 1, 0.45, rootRef.current);
      repeat.current = window.setTimeout(again, REPEAT_MS);
    };
    stopRepeat();
    repeat.current = window.setTimeout(again, HOLD_MS);
  };

  const keyDown = (
    id: KeyId,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
      pressKey(id, true);
    }
  };
  const keyUp = (id: KeyId, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") pressKey(id, false);
  };
  const keyBlur = (id: KeyId) => {
    if (pressOf(id).get() > 0) pressKey(id, false);
  };

  React.useEffect(() => {
    api.current = {
      settleTurn,
      settleAwake,
      settleIsland,
      settleFill,
      closeIsland: () => askIsland(false),
      interrupt,
    };
  });

  // Each value, from a press or from the host, is drawn the same way. Equal
  // on mount, so StrictMode's second run does nothing.
  const shown = React.useRef({
    landscape: isLandscape,
    awake: isAwake,
    island: isIslandOpen,
    steps,
  });
  React.useEffect(() => {
    if (shown.current.landscape === isLandscape) return;
    shown.current.landscape = isLandscape;
    api.current?.settleTurn(isLandscape);
  }, [isLandscape]);
  React.useEffect(() => {
    if (shown.current.awake === isAwake) return;
    shown.current.awake = isAwake;
    api.current?.settleAwake(isAwake);
  }, [isAwake]);
  React.useEffect(() => {
    if (shown.current.island === isIslandOpen) return;
    shown.current.island = isIslandOpen;
    api.current?.settleIsland(isIslandOpen);
  }, [isIslandOpen]);
  React.useEffect(() => {
    level.current = steps;
    if (shown.current.steps === steps) return;
    shown.current.steps = steps;
    api.current?.settleFill(steps, true);
  }, [steps]);

  // An open island closes on a press anywhere else.
  React.useEffect(() => {
    if (!isIslandOpen) return;
    const onDown = (event: PointerEvent) => {
      const node = islandRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) {
        return;
      }
      api.current?.closeIsland();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [isIslandOpen]);

  // Nothing stays held while the page is away, and a lean the visitor can no
  // longer see or that reduced motion forbids goes flat.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.interrupt();
    };
    const onBlur = () => api.current?.interrupt();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  React.useEffect(() => {
    if (lean === 0) {
      aimX.set(0);
      aimY.set(0);
    }
  }, [lean, aimX, aimY]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      window.clearTimeout(repeat.current);
      window.clearTimeout(hudTimer.current);
      release.current?.();
      release.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ---------------------------- derived values --------------------------- */

  const bodyWidth = useTransform(turn, (p) => bodyWidthAt(p));
  const theta = useTransform(turn, (p) => r2(-90 * p));
  const counter = useTransform(turn, (p) => r2(90 * p));
  const contentW = useTransform(turn, (p) => bw(lerp(SW, SH, p)));
  const contentH = useTransform(turn, (p) => bw(lerp(SH, SW, p)));
  const insetTop = useTransform(turn, (p) => bw((1 - clamp01(p)) * STATUS));
  const insetSide = useTransform(turn, (p) => bw(clamp01(p) * SIDE));
  const statusOpacity = useTransform(turn, (p) => r2(clamp01(1 - 2 * p)));

  const rotX = useTransform(sy, (v) => r2(-v * lean));
  const rotY = useTransform(sx, (v) => r2(v * lean));
  const glareX = useTransform(sx, (v) => `${r2(-50 - v * 9)}%`);
  const glareY = useTransform(sy, (v) => `${r2(-50 - v * 9)}%`);
  const glareOpacity = useTransform(
    [sx, sy] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) =>
      glare ? r2(0.32 + 0.6 * Math.min(1, Math.hypot(x, y))) : 0,
  );

  const islandBox = useTransform(
    [q, turn] as MotionValue<number>[],
    ([o = 0, p = 0]: number[]) => {
      const k = Math.max(0, o);
      const t = clamp01(p);
      const w = lerp(
        ISLAND.w0,
        lerp(ISLAND.wPortrait, ISLAND.wLandscape, t),
        k,
      );
      const h = lerp(
        ISLAND.h0,
        lerp(ISLAND.hPortrait, ISLAND.hLandscape, t),
        k,
      );
      return {
        w: bw(w),
        h: bw(h),
        r: bw(Math.min(lerp(ISLAND.r0, ISLAND.r1, Math.min(1, k)), h / 2)),
        // The content stays upright: its box is the island's, turned back.
        cw: bw(lerp(w, h, t)),
        ch: bw(lerp(h, w, t)),
      };
    },
  );
  const islandW = useTransform(islandBox, (b) => b.w);
  const islandH = useTransform(islandBox, (b) => b.h);
  const islandR = useTransform(islandBox, (b) => b.r);
  const islandCW = useTransform(islandBox, (b) => b.cw);
  const islandCH = useTransform(islandBox, (b) => b.ch);

  const hudHeight = useTransform(hudFill, (v) => `${r2(clamp01(v) * 100)}%`);
  // A pressed key sinks into the frame; under reduced motion it only darkens.
  const keyScale = (v: number) => (motionSafe ? r2(1 - 0.55 * v) : 1);
  const upScale = useTransform(pressUp, keyScale);
  const downScale = useTransform(pressDown, keyScale);
  const sideScale = useTransform(pressSide, keyScale);
  const keyShade = (v: number) => `brightness(${r2(1 - 0.28 * v)})`;
  const upShade = useTransform(pressUp, keyShade);
  const downShade = useTransform(pressDown, keyShade);
  const sideShade = useTransform(pressSide, keyShade);

  const keyFill = `linear-gradient(90deg, ${f.dark}, ${f.key} 40%, ${f.light} 70%, ${f.key})`;

  return (
    <motion.div
      ref={rootRef}
      role="group"
      aria-label={label}
      data-orientation={isLandscape ? "landscape" : "portrait"}
      data-awake={isAwake ? "" : undefined}
      onPointerMove={(event) => aimAt(event.clientX, event.clientY)}
      onPointerLeave={rest}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") rest();
      }}
      onPointerCancel={rest}
      onFocus={(event) => {
        const el = event.target;
        if (!el.hasAttribute("data-pocket-control")) return;
        let visible = false;
        try {
          visible = el.matches(":focus-visible");
        } catch {
          visible = false;
        }
        if (!visible) return;
        // The keyboard gets the lean too: the phone turns to the key in focus.
        const r = el.getBoundingClientRect();
        aimAt(r.left + r.width / 2, r.top + r.height / 2);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (
          next instanceof Element &&
          next.hasAttribute("data-pocket-control")
        ) {
          return;
        }
        rest();
      }}
      className={cn(
        "group/pocket-phone [container-type:size] relative aspect-[3/5] w-full select-none",
        disabled && "opacity-60",
        className,
      )}
      style={cssVar("--bw", bodyWidth)}
    >
      <div className="absolute inset-0 [perspective:400cqh]">
        <motion.div
          className="absolute inset-0 grid place-items-center"
          style={{ rotateX: rotX, rotateY: rotY, opacity: dim }}
        >
          {/* The body: the metal band and the black glass. */}
          <motion.div
            aria-hidden
            className="relative [grid-area:1/1]"
            style={{
              width: "var(--bw)",
              height: bw(BH),
              rotate: theta,
              borderRadius: bw(R_BODY),
              background: `linear-gradient(145deg, ${f.light}, ${f.band} 24%, ${f.dark} 52%, ${f.band} 78%, ${f.light})`,
              boxShadow: `0 ${bw(0.012)} ${bw(0.03)} color-mix(in oklab, black 26%, transparent), inset 0 0 0 ${bw(0.003)} color-mix(in oklab, white 34%, transparent)`,
            }}
          >
            <div
              className="absolute"
              style={{
                inset: bw(RIM),
                borderRadius: bw(R_GLASS),
                background: GLASS,
              }}
            />
          </motion.div>

          {/* The screen: turns with the body, its content turns back. */}
          <motion.div
            className="relative overflow-clip bg-background text-foreground [grid-area:1/1]"
            style={{
              width: bw(SW),
              height: bw(SH),
              rotate: theta,
              borderRadius: bw(R_SCREEN),
            }}
          >
            <motion.div
              className="absolute top-1/2 left-1/2"
              style={{
                width: contentW,
                height: contentH,
                x: "-50%",
                y: "-50%",
                rotate: counter,
                scale: wakeScale,
              }}
            >
              <motion.div
                aria-hidden
                className="absolute inset-x-0 top-0 flex items-center justify-between font-semibold text-foreground tabular-nums"
                style={{
                  height: bw(STATUS),
                  paddingInline: bw(0.085),
                  fontSize: bw(0.046),
                  opacity: statusOpacity,
                }}
              >
                <span>{time}</span>
                <span className="flex items-center" style={{ gap: bw(0.016) }}>
                  <svg
                    viewBox="0 0 18 12"
                    style={{ width: bw(0.058), height: bw(0.04) }}
                    className="block fill-current"
                  >
                    <rect x="0" y="8" width="3.4" height="4" rx="1" />
                    <rect x="4.8" y="5.5" width="3.4" height="6.5" rx="1" />
                    <rect x="9.6" y="3" width="3.4" height="9" rx="1" />
                    <rect x="14.4" y="0" width="3.4" height="12" rx="1" />
                  </svg>
                  <svg
                    viewBox="0 0 27 13"
                    style={{ width: bw(0.084), height: bw(0.04) }}
                    className="block"
                  >
                    <rect
                      x="0.6"
                      y="0.6"
                      width="22.8"
                      height="11.8"
                      rx="3.4"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.45"
                      strokeWidth="1.2"
                    />
                    <rect
                      x="2.4"
                      y="2.4"
                      width="15"
                      height="8.2"
                      rx="2"
                      fill="currentColor"
                    />
                    <path
                      d="M25 4.4 v4.2 a2.2 2.2 0 0 0 0 -4.2 z"
                      fill="currentColor"
                      fillOpacity="0.45"
                    />
                  </svg>
                </span>
              </motion.div>

              <motion.div
                inert={!isAwake}
                aria-hidden={!isAwake || undefined}
                className="[container-type:size] absolute overflow-clip"
                style={{
                  top: insetTop,
                  left: insetSide,
                  right: insetSide,
                  bottom: bw(HOME),
                }}
              >
                {children}
              </motion.div>

              <div
                aria-hidden
                className="absolute left-1/2 -translate-x-1/2 rounded-full bg-foreground/70"
                style={{
                  bottom: bw(0.018),
                  width: bw(0.34),
                  height: bw(0.012),
                }}
              />

              {/* Asleep, the glass is dark; a tap on it wakes the screen. The
                  side key is the keyboard's way to the same place. */}
              <motion.div
                aria-hidden
                onClick={() => {
                  if (!isAwake && !disabled) askAwake(true);
                }}
                className={cn(
                  "absolute inset-0",
                  isAwake || disabled
                    ? "pointer-events-none"
                    : "cursor-pointer",
                )}
                style={{ opacity: cover, background: GLASS }}
              />
            </motion.div>
          </motion.div>

          {/* In front of the glass: glare, the volume level, the island, keys. */}
          <motion.div
            className="pointer-events-none relative [grid-area:1/1]"
            style={{ width: "var(--bw)", height: bw(BH), rotate: theta }}
          >
            <div
              aria-hidden
              className="absolute overflow-clip"
              style={{ inset: bw(RIM), borderRadius: bw(R_GLASS) }}
            >
              <motion.div
                className="absolute top-1/2 left-1/2"
                style={{
                  width: bw(4.4),
                  height: bw(4.4),
                  x: glareX,
                  y: glareY,
                  rotate: counter,
                  opacity: glareOpacity,
                  background: GLARE_BAND,
                }}
              />
            </div>

            <motion.div
              aria-hidden
              className="absolute overflow-clip rounded-full"
              style={{
                left: bw(BEZEL + 0.03),
                top: bw(0.48),
                width: bw(0.055),
                height: bw(0.4),
                opacity: hudShow,
                x: hudX,
                background: "color-mix(in oklab, black 55%, transparent)",
                // An outer dark ring as well as an inner light one: the level
                // reads over a white screen as well as a black one.
                boxShadow:
                  "inset 0 0 0 1px color-mix(in oklab, white 16%, transparent), 0 0 0 1px color-mix(in oklab, black 22%, transparent)",
              }}
            >
              <motion.div
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: hudHeight,
                  background: "color-mix(in oklab, white 92%, transparent)",
                }}
              />
            </motion.div>

            <motion.div
              ref={islandRef}
              onKeyDown={(event) => {
                // Wherever focus is in the island, Escape closes it here and
                // goes no further.
                if (event.key === "Escape" && isIslandOpen) {
                  event.preventDefault();
                  askIsland(false);
                }
              }}
              className={cn(
                "absolute left-1/2",
                island !== undefined && "pointer-events-auto",
              )}
              style={{
                top: bw(ISLAND_TOP),
                width: islandW,
                height: islandH,
                borderRadius: islandR,
                x: "-50%",
                background: ISLAND_BLACK,
              }}
            >
              {island !== undefined ? (
                <>
                  <button
                    type="button"
                    data-pocket-control=""
                    aria-label={islandLabel}
                    aria-expanded={isIslandOpen}
                    aria-controls={islandId}
                    disabled={disabled}
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse" && event.button !== 0) {
                        return;
                      }
                      click(1.4, 0.35, event.currentTarget);
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) {
                        click(1.4, 0.35, event.currentTarget);
                      }
                      askIsland(!isIslandOpen);
                    }}
                    className={cn(
                      "absolute inset-0 size-full rounded-[inherit] select-none",
                      FOCUS_RING,
                      disabled ? "cursor-not-allowed" : "cursor-pointer",
                    )}
                  />
                  <motion.div
                    id={islandId}
                    aria-hidden={!isIslandOpen}
                    inert={!isIslandOpen}
                    className="pointer-events-none absolute top-1/2 left-1/2 overflow-clip"
                    style={{
                      width: islandCW,
                      height: islandCH,
                      x: "-50%",
                      y: "-50%",
                      rotate: counter,
                      opacity: islandFade,
                      padding: bw(0.04),
                      color: "oklch(0.97 0 0)",
                    }}
                  >
                    {island}
                  </motion.div>
                </>
              ) : null}
            </motion.div>

            <FrameKey
              edge="left"
              top={0.5}
              length={0.15}
              name="Volume up"
              scaleX={upScale}
              shade={upShade}
              fill={keyFill}
              disabled={disabled}
              onPointerDown={(event) => volumePointerDown(1, event)}
              onClick={(event) => {
                // Pointer presses step on the way down; a click with no
                // pointer behind it is the keyboard or assistive technology.
                if (event.detail !== 0) return;
                click(1.15, 0.6, event.currentTarget);
                stepVolume(1);
              }}
              onKeyDown={(event) => keyDown("up", event)}
              onKeyUp={(event) => keyUp("up", event)}
              onBlur={() => keyBlur("up")}
            />
            <FrameKey
              edge="left"
              top={0.7}
              length={0.15}
              name="Volume down"
              scaleX={downScale}
              shade={downShade}
              fill={keyFill}
              disabled={disabled}
              onPointerDown={(event) => volumePointerDown(-1, event)}
              onClick={(event) => {
                if (event.detail !== 0) return;
                click(1, 0.6, event.currentTarget);
                stepVolume(-1);
              }}
              onKeyDown={(event) => keyDown("down", event)}
              onKeyUp={(event) => keyUp("down", event)}
              onBlur={() => keyBlur("down")}
            />
            <FrameKey
              edge="right"
              top={0.58}
              length={0.3}
              name="Side button"
              scaleX={sideScale}
              shade={sideShade}
              fill={keyFill}
              disabled={disabled}
              onPointerDown={(event) => {
                if (disabled) return;
                if (event.pointerType === "mouse" && event.button !== 0) return;
                holdKey("side", event.pointerId);
                click(0.85, 0.65, event.currentTarget);
              }}
              onClick={(event) => {
                if (event.detail === 0) click(0.85, 0.65, event.currentTarget);
                askAwake(!isAwake);
              }}
              onKeyDown={(event) => keyDown("side", event)}
              onKeyUp={(event) => keyUp("side", event)}
              onBlur={() => keyBlur("side")}
            />
          </motion.div>
        </motion.div>
      </div>

      <button
        type="button"
        data-pocket-control=""
        aria-label="Landscape"
        aria-pressed={isLandscape}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          click(1.2, 0.45, event.currentTarget);
        }}
        onClick={(event) => {
          if (event.detail === 0) click(1.2, 0.45, event.currentTarget);
          askOrientation(!isLandscape);
        }}
        className={cn(
          "absolute right-0 bottom-0 inline-flex size-8 items-center justify-center rounded-full border border-hairline bg-card text-ink-2 transition-colors",
          "hover:border-hairline-strong hover:text-foreground aria-pressed:text-cobalt-bright",
          FOCUS_RING,
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <motion.svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ rotate: theta, originX: 0.5, originY: 0.5 }}
        >
          <rect x="5" y="2.5" width="6" height="11" rx="1.6" />
          <path d="M2.6 6.2 A6 6 0 0 1 4.4 3.2" />
          <path d="M2.2 3.6 L4.4 3.2 L4.6 5.4" />
        </motion.svg>
      </button>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </motion.div>
  );
}
