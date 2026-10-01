"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StandMonitorFinish = "silver" | "black" | "white";
export type StandMonitorOrientation = "landscape" | "portrait";

export type StandMonitorProps = {
  /** The screen: any content, in a size container the shape of the screen in its current orientation. */
  children?: React.ReactNode;
  /** The display's accessible name. @default "Monitor" */
  label?: string;
  /** Where the panel sits on the column, 0 (lowest) to 1 (highest). Drags start from here, and a new value moves it. @default 0.5 */
  height?: number;
  /** Fires from a drag or a key with the height the panel settles at. */
  onHeightChange?: (height: number) => void;
  /** How far the top leans back, 0 to 15 degrees. Drags start from here, and a new value moves it. @default 4 */
  tilt?: number;
  /** Fires from a drag or a key with the tilt the hinge settles at. */
  onTiltChange?: (tilt: number) => void;
  /** Controlled orientation. */
  orientation?: StandMonitorOrientation;
  /** Initial orientation when uncontrolled. @default "landscape" */
  defaultOrientation?: StandMonitorOrientation;
  /** Fires from the turn button with the orientation asked for. */
  onOrientationChange?: (orientation: StandMonitorOrientation) => void;
  /** Stand, back and bezel. @default "silver" */
  finish?: StandMonitorFinish;
  /** Play the hinge's creak while the panel is moved. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/*
 * One unit is 1cqh of the 16:9 root, so the box is 177.78 × 100 and the
 * cable's SVG shares the same numbers. The panel is 70 × 43.75 (16:10) and
 * pivots about its centre, which rides on the column.
 */
const BOX_W = 177.78;
const X0 = BOX_W / 2;
const L = 70;
const S = 43.75;
const BEZEL = 1.5;
const CHIN = 3;
/** The pivot's height, lowest and highest, landscape and portrait. */
const RANGE = {
  landscape: { low: 56, high: 37 },
  portrait: { low: 54, high: 39 },
};
const BASE_TOP = 91.5;
const DESK = 96.5;
const COLUMN = { w: 6, top: 35 };
const TOP_MARGIN = 2.5;
const BASE_GAP = 1.5;
const MAX_TILT = 15;
/** Degrees of tilt per pixel of drag on the top edge. */
const TILT_PER_PX = 0.15;
/** The cable's attachment on the panel's back, from its centre. */
const ATTACH = { x: 12.6, y: 13.1 };
/** The cable's loop: a soft, underdamped pendulum. */
const SWING = { stiffness: 50, damping: 3.5, mass: 1 };
/** Where the cable drops behind the base. */
const DROP = { x: X0 + 3, y: BASE_TOP + 0.5 };

type Finish = {
  stand: string;
  light: string;
  dark: string;
  back: string;
  bezel: string;
  cable: string;
};

/** Fixed pigments: metal and plastic, the same in either theme. */
const FINISHES: Record<StandMonitorFinish, Finish> = {
  silver: {
    stand: "oklch(0.84 0.004 250)",
    light: "oklch(0.95 0.003 250)",
    dark: "oklch(0.66 0.006 250)",
    back: "oklch(0.78 0.005 250)",
    bezel: "oklch(0.16 0.004 265)",
    cable: "oklch(0.24 0.004 265)",
  },
  black: {
    stand: "oklch(0.3 0.004 265)",
    light: "oklch(0.44 0.004 265)",
    dark: "oklch(0.2 0.004 265)",
    back: "oklch(0.26 0.004 265)",
    bezel: "oklch(0.13 0.004 265)",
    cable: "oklch(0.2 0.004 265)",
  },
  white: {
    stand: "oklch(0.94 0.004 90)",
    light: "oklch(0.99 0.002 90)",
    dark: "oklch(0.8 0.006 90)",
    back: "oklch(0.9 0.004 90)",
    bezel: "oklch(0.97 0.003 90)",
    cable: "oklch(0.9 0.004 90)",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ch = (v: number) => `${r2(v)}cqh`;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * The pivot's height for a height setting and a turn (0 landscape, 1
 * portrait): the two ranges blended, then held clear of the desk and the top
 * of the box by the turned panel's reach at that angle — the stand lifts the
 * panel as it turns rather than let a corner touch the base.
 */
function pivotY(h: number, turn: number) {
  const t = clamp01(turn);
  const a = (Math.PI / 2) * t;
  const reach =
    (L / 2) * Math.abs(Math.sin(a)) + (S / 2) * Math.abs(Math.cos(a));
  const wanted = lerp(
    lerp(RANGE.landscape.low, RANGE.landscape.high, h),
    lerp(RANGE.portrait.low, RANGE.portrait.high, h),
    t,
  );
  return clamp(wanted, reach + TOP_MARGIN, BASE_TOP - BASE_GAP - reach);
}

type Said = { n: number; portrait: boolean; text: string };

type Api = {
  settleTurn: (portrait: boolean) => void;
  settleHeight: (to: number) => void;
  settleTilt: (to: number) => void;
  interrupt: () => void;
};

/**
 * A desktop display on a height-adjustable stand, holding any screen. Grab
 * the screen and lift it: the panel rides the column 1:1 under the finger,
 * rubber-bands at the stops, and a counterbalanced arm coasts it on the
 * glide spring with the release velocity. Grab the top edge and push it
 * back: the panel tilts in 3D on a friction hinge that holds where it is
 * left and clicks to the nearest degree. The turn button pivots it to
 * portrait on the glide spring; the stand lifts it clear of the desk as it
 * turns (the pivot height is worked out each frame from the turned panel's
 * reach), and once it settles the picture re-orients upright, as a real
 * display's does. A cable hangs from the panel's back to the base and
 * swings, underdamped like a rope, at every move.
 *
 * The screen and its top edge are real sliders (height in percent, tilt in
 * degrees) with arrow, Page, Home and End keys, and the turn button is a
 * toggle. Under reduced motion the hand still moves the panel 1:1 and it
 * lands where it is let go; keys jump, the turn is a cross-fade, and the
 * cable hangs still.
 */
export function StandMonitor({
  children,
  label = "Monitor",
  height = 0.5,
  onHeightChange,
  tilt = 4,
  onTiltChange,
  orientation,
  defaultOrientation = "landscape",
  onOrientationChange,
  finish = "silver",
  sound = false,
  disabled = false,
  className,
}: StandMonitorProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const f = FINISHES[finish] ?? FINISHES.silver;

  const [ownOrientation, setOwnOrientation] =
    React.useState(defaultOrientation);
  const isPortrait = (orientation ?? ownOrientation) === "portrait";
  // The picture re-orients only once the panel has settled.
  const [upright, setUpright] = React.useState(isPortrait);

  // Height and tilt follow a new value passed in; the hand moves them from there.
  const [level, setLevel] = React.useState(() => r2(clamp01(height)));
  const [seenHeight, setSeenHeight] = React.useState(height);
  if (seenHeight !== height) {
    setSeenHeight(height);
    setLevel(r2(clamp01(height)));
  }
  const [lean, setLean] = React.useState(() =>
    Math.round(clamp(tilt, 0, MAX_TILT)),
  );
  const [seenTilt, setSeenTilt] = React.useState(tilt);
  if (seenTilt !== tilt) {
    setSeenTilt(tilt);
    setLean(Math.round(clamp(tilt, 0, MAX_TILT)));
  }

  const [said, setSaid] = React.useState<Said>({
    n: 0,
    portrait: isPortrait,
    text: "",
  });
  if (said.portrait !== isPortrait) {
    setSaid({
      n: said.n + 1,
      portrait: isPortrait,
      text: isPortrait ? "Portrait." : "Landscape.",
    });
  }

  const h = useMotionValue(level);
  const tiltMv = useMotionValue(lean);
  const turn = useMotionValue(isPortrait ? 1 : 0);
  const dim = useMotionValue(1);
  const picture = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const creak = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef(0);
  const turnStop = React.useRef(0);
  const drag = React.useRef({ from: 0, px: 1, last: 0, t: 0 });
  /** Where the panel is already headed, so a value it was sent to is not sent twice. */
  const aimH = React.useRef(level);
  const aimTilt = React.useRef(lean);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const say = (text: string) => setSaid((s) => ({ ...s, n: s.n + 1, text }));

  /* -------------------------------- sound -------------------------------- */

  const quiet = () => {
    window.clearTimeout(hush.current);
    window.clearTimeout(turnStop.current);
    creak.current?.stop();
    creak.current = null;
  };
  /** The hinge creaks with the speed of the hand, and hushes when it stops. */
  const voice = (speed: number, pitch: number) => {
    if (!creak.current)
      creak.current = audio.start("creak", { gain: 0, pitch });
    creak.current.set({
      gain: r2(Math.min(0.6, speed * 0.0016)),
      pitch: r2(pitch + Math.min(0.5, speed * 0.0008)),
    });
    window.clearTimeout(hush.current);
    hush.current = window.setTimeout(() => creak.current?.set({ gain: 0 }), 70);
  };

  /* ------------------------------- settling ------------------------------ */

  const settleHeight = (to: number, velocity = 0) => {
    aimH.current = to;
    if (!motionSafe) {
      halt("h");
      h.set(to);
      return;
    }
    run("h", animate(h, to, { ...springs.glide, velocity }));
  };
  const settleTilt = (to: number) => {
    aimTilt.current = to;
    if (!motionSafe) {
      halt("tilt");
      tiltMv.set(to);
      return;
    }
    run("tilt", animate(tiltMv, to, springs.snap));
  };

  const reorient = (portrait: boolean) => {
    // A quick fade, then the picture comes back upright in the new shape.
    run(
      "picture",
      animate(picture, 0, {
        duration: durations.blink,
        ease: easings.exit,
        onComplete: () => {
          setUpright(portrait);
          run(
            "picture",
            animate(picture, 1, {
              duration: durations.base,
              ease: easings.enter,
            }),
          );
        },
      }),
    );
  };

  const settleTurn = (portrait: boolean) => {
    const target = portrait ? 1 : 0;
    if (!motionSafe) {
      halt("turn");
      run(
        "dim",
        animate(dim, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            turn.set(target);
            setUpright(portrait);
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
      "turn",
      animate(turn, target, {
        ...springs.glide,
        velocity: turn.getVelocity(),
        onComplete: () => {
          window.clearTimeout(turnStop.current);
          creak.current?.stop();
          creak.current = null;
          reorient(portrait);
        },
      }),
    );
  };

  /* ------------------------------- changes ------------------------------- */

  const commitHeight = (to: number) => {
    const v = r2(clamp01(to));
    setLevel(v);
    if (v !== level) onHeightChange?.(v);
    return v;
  };
  const commitTilt = (to: number) => {
    const v = Math.round(clamp(to, 0, MAX_TILT));
    setLean(v);
    if (v !== lean) onTiltChange?.(v);
    return v;
  };

  const askTurn = () => {
    if (disabled) return;
    const next: StandMonitorOrientation = isPortrait ? "landscape" : "portrait";
    quiet();
    creak.current = audio.start("creak", { gain: 0.32, pitch: 0.85 });
    // The turn ends the creak when it lands; this only catches a host that
    // refuses the change.
    turnStop.current = window.setTimeout(() => {
      creak.current?.stop();
      creak.current = null;
    }, 900);
    if (orientation === undefined) setOwnOrientation(next);
    onOrientationChange?.(next);
  };

  /* -------------------------------- drags -------------------------------- */

  const pxPerUnit = () => (rootRef.current?.clientHeight ?? 100) / 100;
  const span = () => {
    const r = isPortrait ? RANGE.portrait : RANGE.landscape;
    return r.low - r.high;
  };

  const lift = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: ({ event }) => {
      halt("h");
      drag.current = {
        from: h.get(),
        px: Math.max(1, span() * pxPerUnit()),
        last: 0,
        t: event.timeStamp,
      };
    },
    onMove: ({ offset, event }) => {
      const d = drag.current;
      const raw = d.from - offset.y / d.px;
      h.set(r3(rubberClamp(raw, 0, 1, 0.35)));
      const dt = Math.max(8, event.timeStamp - d.t);
      voice((Math.abs(offset.y - d.last) / dt) * 1000, 0.8);
      d.last = offset.y;
      d.t = event.timeStamp;
    },
    onEnd: ({ velocity }) => {
      quiet();
      const d = drag.current;
      const v = -velocity.y / d.px;
      // A counterbalanced arm is heavy: it coasts a little, and where it
      // would stop is where it goes.
      const to = clamp01(motionSafe ? project(h.get(), v, 0.95) : h.get());
      const landed = commitHeight(to);
      settleHeight(landed, motionSafe ? v : 0);
      say(`Height ${Math.round(landed * 100)}%.`);
    },
    onCancel: () => {
      quiet();
      settleHeight(aimH.current);
    },
  });

  const lean3d = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: ({ event }) => {
      halt("tilt");
      drag.current = { from: tiltMv.get(), px: 1, last: 0, t: event.timeStamp };
    },
    onMove: ({ offset, event }) => {
      const d = drag.current;
      const raw = d.from + offset.y * TILT_PER_PX;
      tiltMv.set(r2(rubberClamp(raw, 0, MAX_TILT, 4)));
      const dt = Math.max(8, event.timeStamp - d.t);
      voice((Math.abs(offset.y - d.last) / dt) * 1000, 1.25);
      d.last = offset.y;
      d.t = event.timeStamp;
    },
    onEnd: () => {
      quiet();
      // A friction hinge holds where it is let go, to the nearest degree.
      const landed = commitTilt(tiltMv.get());
      settleTilt(landed);
      say(`Tilt ${landed}°.`);
    },
    onCancel: () => {
      quiet();
      settleTilt(aimTilt.current);
    },
  });

  const onHeightKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const steps: Record<string, number> = {
      ArrowUp: 0.05,
      ArrowRight: 0.05,
      ArrowDown: -0.05,
      ArrowLeft: -0.05,
      PageUp: 0.25,
      PageDown: -0.25,
    };
    let to: number | null = null;
    if (event.key in steps) to = level + (steps[event.key] ?? 0);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = 1;
    if (to === null) return;
    event.preventDefault();
    settleHeight(commitHeight(to));
  };

  const onTiltKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const steps: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 5,
      PageDown: -5,
    };
    let to: number | null = null;
    if (event.key in steps) to = lean + (steps[event.key] ?? 0);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = MAX_TILT;
    if (to === null) return;
    event.preventDefault();
    settleTilt(commitTilt(to));
  };

  const interrupt = () => quiet();

  React.useEffect(() => {
    api.current = { settleTurn, settleHeight, settleTilt, interrupt };
  });

  const shownTurn = React.useRef(isPortrait);
  React.useEffect(() => {
    if (shownTurn.current === isPortrait) return;
    shownTurn.current = isPortrait;
    api.current?.settleTurn(isPortrait);
  }, [isPortrait]);

  // A height or tilt from outside (the props, a key) moves the panel there;
  // a drag has already put it there, so nothing moves twice.
  React.useEffect(() => {
    if (aimH.current !== level) api.current?.settleHeight(level);
  }, [level]);
  React.useEffect(() => {
    if (aimTilt.current !== lean) api.current?.settleTilt(lean);
  }, [lean]);

  React.useEffect(() => {
    const away = () => api.current?.interrupt();
    const onVisibility = () => {
      if (document.hidden) away();
    };
    window.addEventListener("blur", away);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", away);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      window.clearTimeout(hush.current);
      window.clearTimeout(turnStop.current);
      creak.current?.stop();
      creak.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ---------------------------- derived values --------------------------- */

  const pivot = useTransform(() => r2(pivotY(h.get(), turn.get())));
  const pivotTop = useTransform(pivot, ch);
  const angle = useTransform(turn, (t) => r2(90 * t));
  const tiltDeg = useTransform(tiltMv, (v) => r2(v));
  const glareY = useTransform(tiltMv, (v) => `${r2(-30 + v * 2)}%`);
  const glareOpacity = useTransform(tiltMv, (v) => r3(0.14 + v * 0.012));
  const edgeLight = useTransform(tiltMv, (v) => r3(clamp01(v / MAX_TILT)));

  // Where the cable leaves the panel's back, and where its loop would hang.
  const anchor = useTransform(() => {
    const a = (Math.PI / 2) * turn.get();
    const c = Math.cos(a);
    const s = Math.sin(a);
    const foreshorten = Math.cos((tiltMv.get() * Math.PI) / 180);
    const x = X0 + ATTACH.x * c - ATTACH.y * s;
    const y =
      pivotY(h.get(), turn.get()) + (ATTACH.x * s + ATTACH.y * c) * foreshorten;
    return { x, y };
  });
  const restX = useTransform(anchor, ({ x, y }) => {
    const side = x >= X0 ? 1 : -1;
    const dist = Math.hypot(x - DROP.x, y - DROP.y);
    return r2((x + DROP.x) / 2 + side * (5 + dist * 0.18));
  });
  const restY = useTransform(anchor, ({ x, y }) => {
    const dist = Math.hypot(x - DROP.x, y - DROP.y);
    return r2(Math.min(DESK - 1, (y + DROP.y) / 2 + 3 + dist * 0.12));
  });
  // ζ ≈ 0.25 at about one swing a second: a hanging rope, not a spring.
  // The house springs are for things that are pushed; this one only hangs.
  const swingX = useSpring(restX, SWING);
  const swingY = useSpring(restY, SWING);
  const cable = useTransform(() => {
    const { x, y } = anchor.get();
    const swung = { x: swingX.get(), y: swingY.get() };
    const rest = { x: restX.get(), y: restY.get() };
    const cx = motionSafe ? swung.x : rest.x;
    const cy = Math.min(DESK - 0.5, motionSafe ? swung.y : rest.y);
    return `M ${r2(x)} ${r2(y)} Q ${r2(cx)} ${r2(cy)} ${r2(DROP.x)} ${r2(DROP.y)}`;
  });

  const box = isPortrait ? { w: S, h: L } : { w: L, h: S };
  const screen = upright
    ? { w: S - BEZEL * 2 - CHIN + BEZEL, h: L - BEZEL * 2 }
    : { w: L - BEZEL * 2, h: S - BEZEL - CHIN };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      data-orientation={isPortrait ? "portrait" : "landscape"}
      className={cn(
        "group/stand-monitor [container-type:size] relative aspect-[16/9] w-full select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${BOX_W} 100`}
        className="pointer-events-none absolute inset-0 block size-full"
        fill="none"
      >
        <ellipse
          cx={X0}
          cy={DESK + 0.6}
          rx={30}
          ry={1.6}
          style={{ fill: "color-mix(in oklab, black 18%, transparent)" }}
        />
        {/* Motion keeps an SVG element's static style from its first render;
            the colour sits on a plain group so a new finish reaches it. */}
        <g style={{ stroke: f.cable }}>
          <motion.path d={cable} strokeWidth={1.3} strokeLinecap="round" />
        </g>
        <rect
          x={X0 - COLUMN.w / 2}
          y={COLUMN.top}
          width={COLUMN.w}
          height={BASE_TOP - COLUMN.top + 0.5}
          rx={1.6}
          style={{ fill: f.stand }}
        />
        <rect
          x={X0 - COLUMN.w / 2 + 0.8}
          y={COLUMN.top}
          width={1.1}
          height={BASE_TOP - COLUMN.top}
          rx={0.5}
          style={{ fill: f.light }}
        />
        <rect
          x={X0 + COLUMN.w / 2 - 1.6}
          y={COLUMN.top}
          width={1}
          height={BASE_TOP - COLUMN.top}
          rx={0.5}
          style={{ fill: f.dark }}
        />
        <path
          d={`M ${r2(X0 - 23)} ${BASE_TOP} H ${r2(X0 + 23)} L ${r2(X0 + 26)} ${DESK} H ${r2(X0 - 26)} Z`}
          style={{ fill: f.stand }}
        />
        <path
          d={`M ${r2(X0 - 23)} ${BASE_TOP} H ${r2(X0 + 23)} L ${r2(X0 + 23.6)} ${BASE_TOP + 1} H ${r2(X0 - 23.6)} Z`}
          style={{ fill: f.light }}
        />
        <path
          d={`M ${r2(X0 - 26)} ${DESK} H ${r2(X0 + 26)}`}
          strokeWidth={0.6}
          style={{ stroke: f.dark }}
        />
      </svg>

      <div
        className="absolute inset-0"
        style={{ perspective: ch(220), perspectiveOrigin: "50% 45%" }}
      >
        <motion.div
          className="absolute left-1/2 size-0"
          style={{ top: pivotTop, rotateX: tiltDeg, opacity: dim }}
        >
          {/* The panel: back edge, bezel, screen. It turns on the pivot. */}
          <motion.div
            className="absolute"
            style={{
              left: ch(-L / 2),
              top: ch(-S / 2),
              width: ch(L),
              height: ch(S),
              rotate: angle,
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                borderRadius: ch(1.4),
                background: f.back,
                boxShadow: `0 ${ch(1.2)} ${ch(2.4)} color-mix(in oklab, black 22%, transparent)`,
                transform: `translateY(${ch(0.6)})`,
              }}
            />
            <div
              className="absolute inset-0 overflow-clip"
              style={{ borderRadius: ch(1.2), background: f.bezel }}
            >
              <div
                className="absolute overflow-clip bg-background text-foreground"
                style={{
                  left: ch(BEZEL),
                  top: ch(BEZEL),
                  right: ch(BEZEL),
                  bottom: ch(CHIN),
                  borderRadius: ch(0.3),
                }}
              >
                <motion.div
                  className="[container-type:size] absolute top-1/2 left-1/2 overflow-clip"
                  style={{
                    width: ch(screen.w),
                    height: ch(screen.h),
                    x: "-50%",
                    y: "-50%",
                    rotate: upright ? -90 : 0,
                    opacity: picture,
                  }}
                >
                  {children}
                </motion.div>
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(160deg, transparent 30%, color-mix(in oklab, white 55%, transparent) 48%, transparent 62%)",
                    backgroundSize: "100% 200%",
                    backgroundPositionY: glareY,
                    opacity: glareOpacity,
                  }}
                />
              </div>
              <span
                aria-hidden
                className="absolute rounded-full"
                style={{
                  right: ch(3),
                  bottom: ch(CHIN / 2 - 0.35),
                  width: ch(0.7),
                  height: ch(0.7),
                  background: "oklch(0.75 0.14 150)",
                }}
              />
              <motion.span
                aria-hidden
                className="absolute inset-x-0 top-0"
                style={{
                  height: ch(0.5),
                  opacity: edgeLight,
                  background: "color-mix(in oklab, white 70%, transparent)",
                }}
              />
            </div>
          </motion.div>

          {/* The handles: the top edge tilts, the rest lifts. They sit over
              the screen, not around it, so its content is read as itself. */}
          <div
            role="slider"
            aria-label="Tilt"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={MAX_TILT}
            aria-valuenow={lean}
            aria-valuetext={`${lean}°`}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={onTiltKey}
            {...lean3d}
            className={cn(
              "absolute touch-pan-x rounded-2",
              FOCUS_RING,
              disabled ? "cursor-not-allowed" : "cursor-ns-resize",
            )}
            style={{
              left: ch(-box.w / 2),
              top: ch(-box.h / 2 - 2),
              width: ch(box.w),
              height: ch(box.h * 0.24 + 2),
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-foreground/0 transition-colors group-hover/stand-monitor:bg-foreground/35"
              style={{ top: ch(0.6), width: ch(10), height: ch(0.8) }}
            />
          </div>
          <div
            role="slider"
            aria-label="Height"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
            aria-valuetext={`Height ${Math.round(level * 100)}%`}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={onHeightKey}
            {...lift}
            className={cn(
              "absolute touch-pan-x rounded-2",
              FOCUS_RING,
              disabled
                ? "cursor-not-allowed"
                : "cursor-grab active:cursor-grabbing",
            )}
            style={{
              left: ch(-box.w / 2),
              top: ch(-box.h / 2 + box.h * 0.24),
              width: ch(box.w),
              height: ch(box.h * 0.76),
            }}
          />
        </motion.div>
      </div>

      <button
        type="button"
        aria-label="Portrait"
        aria-pressed={isPortrait}
        disabled={disabled}
        onClick={askTurn}
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
          style={{ rotate: angle, originX: 0.5, originY: 0.5 }}
        >
          <rect x="2.5" y="4.5" width="11" height="7" rx="1.2" />
          <path d="M 8 11.5 V 13.5 M 5.5 13.5 H 10.5" />
        </motion.svg>
      </button>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
