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
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MuteConeSize = "sm" | "md" | "lg";
export type MuteConeSlash = "line" | "cross" | "none";

export type MuteConeProps = {
  /** Controlled: whether the sound is muted. */
  pressed?: boolean;
  /** Initial muted state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press, drag or key that muted or unmuted, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** Controlled volume, 0 to 100. Muting keeps it; 0 is silence. */
  level?: number;
  /** Initial volume when uncontrolled, 0 to 100. @default 60 */
  defaultLevel?: number;
  /** Fires from the drag or key that changed the volume, with the new level. */
  onLevelChange?: (level: number) => void;
  /** How many sound waves the cone can hold, 1 to 4; the level fills them in turn. @default 4 */
  waves?: number;
  /** The mark drawn once the waves have folded away: a slash through the cone, a cross where the waves were, or none. @default "line" */
  slash?: MuteConeSlash;
  /** How far one arrow key moves the level. @default 10 */
  step?: number;
  /** The word while sound plays. @default "Sound on" */
  label?: string;
  /** The word while muted. @default "Muted" */
  pressedLabel?: string;
  /** The toggle's accessible name, the same in both states. @default "Mute" */
  name?: string;
  /** How the level is written while it is being scrubbed, and spoken. @default `${level}%` */
  formatLevel?: (level: number) => string;
  /** How long a press is held before it starts scrubbing the level, in ms. @default 420 */
  holdDelay?: number;
  /** How far a vertical drag travels to cross the whole range, in px. @default 120 */
  scrubDistance?: number;
  /** The beat between one wave and the next as they fold or release, in ms. @default a cascade of the wave count */
  stagger?: number;
  /** Icon only: the cone over a row of five dots, the words in its accessible name. @default false */
  compact?: boolean;
  /** @default "md" */
  size?: MuteConeSize;
  /** The waves and the meter, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The muted mark and word. @default "var(--danger)" */
  mutedColor?: string;
  /** Play the fold, the release and the meter's detents. Off unless asked for. @default false */
  sound?: boolean;
  /** Not pressable, and drawn at half strength. @default false */
  disabled?: boolean;
  /** Classes for the button. */
  className?: string;
};

type Pt = readonly [number, number];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampLevel = (v: number) => Math.min(100, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where the waves spread from: just past the cone's mouth. */
const MOUTH: Pt = [12, 12];
/** Each wave a little wider and a little flatter than the one inside it. */
const RADII = [3.6, 6.8, 10, 13.2];
const ANGLES = [46, 42, 39, 36];
/** The fold: a wave curls tight against the cone. */
const FOLD_RADIUS = 1.2;
const FOLD_ANGLE = 64;
const STROKE = 1.8;
const PILLS = 5;
/** The pill under the drawing; the slash's halo is painted in the same colour. */
const BASE = "var(--bg-2)";

/** The drawing's width for a wave count: the outermost wave and a margin. */
const widthFor = (waves: number, slash: MuteConeSlash) =>
  Math.max(
    Math.ceil(MOUTH[0] + (RADII[waves - 1] ?? 3.6) + STROKE),
    slash === "cross" ? 22 : 0,
  );

function arc(radius: number, angle: number): string {
  const a = (angle * Math.PI) / 180;
  const x = r2(MOUTH[0] + radius * Math.cos(a));
  const dy = r2(radius * Math.sin(a));
  const r = r2(radius);
  return `M${x} ${r2(MOUTH[1] - dy)}A${r} ${r} 0 0 1 ${x} ${r2(MOUTH[1] + dy)}`;
}

type SizeSpec = {
  box: string;
  square: string;
  icon: number;
  words: string;
  pill: string;
  dot: string;
  meter: string;
};

const SIZES: Record<MuteConeSize, SizeSpec> = {
  sm: {
    box: "h-10 gap-2 pr-3.5 pl-2.5",
    square: "size-10 gap-0.5",
    icon: 18,
    words: "text-xs leading-4",
    pill: "h-1 w-2.5",
    dot: "h-[3px] w-1",
    meter: "gap-0.5",
  },
  md: {
    box: "h-12 gap-2.5 pr-4 pl-3",
    square: "size-12 gap-1",
    icon: 22,
    words: "text-sm leading-5",
    pill: "h-1 w-3",
    dot: "h-[3px] w-1.5",
    meter: "gap-[3px]",
  },
  lg: {
    box: "h-14 gap-3 pr-5 pl-3.5",
    square: "size-14 gap-1",
    icon: 26,
    words: "text-[15px] leading-6",
    pill: "h-[5px] w-3.5",
    dot: "h-1 w-2",
    meter: "gap-1",
  },
};

/** One pill of the meter: a track, and a fill that grows from its left edge. */
function Pill({
  meter,
  index,
  className,
  accent,
}: {
  meter: MotionValue<number>;
  index: number;
  className: string;
  accent: string;
}) {
  const share = useTransform(meter, (m) => r3(clamp01(m / 20 - index)));
  return (
    <span
      className={cn("relative block overflow-clip rounded-full", className)}
      style={{
        background: "color-mix(in oklab, var(--ink-3) 26%, transparent)",
      }}
    >
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: accent, scaleX: share, originX: 0 }}
      />
    </span>
  );
}

/** One wave: its reach and its curl both come from `e`, its ink from the level in its band. */
function Wave({
  e,
  meter,
  index,
  count,
}: {
  e: MotionValue<number>;
  meter: MotionValue<number>;
  index: number;
  count: number;
}) {
  const radius = RADII[index] ?? 3.6;
  const angle = ANGLES[index] ?? 40;
  const d = useTransform(e, (v) =>
    arc(
      Math.max(0.4, lerp(FOLD_RADIUS, radius, v)),
      lerp(FOLD_ANGLE, angle, clamp01(v)),
    ),
  );
  const opacity = useTransform(
    [e, meter] as MotionValue<number>[],
    ([v = 0, m = 0]: number[]) => {
      const band = clamp01((m / 100) * count - index);
      return r3(clamp01(v * 2.2) * (0.3 + 0.7 * band));
    },
  );
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      style={{ opacity }}
    />
  );
}

type Api = {
  toggle: () => void;
  setVisible: (next: number, via: "drag" | "key") => void;
};

/**
 * A mute toggle drawn as a speaker cone with up to four waves, and a meter of
 * five pills under its label. Muting folds the waves back into the cone,
 * outermost first, a cascade apart on the exit ease, and then a pen draws the
 * slash. Unmuting lifts the pen, releases the waves one by one on the snap
 * spring — each overshooting its own radius, each wider than the last — and
 * refills the meter to the volume it kept on the glide spring.
 *
 * The volume is the control's second value. A long press arms a scrub, a
 * vertical drag on the button moves it 1:1 under the finger (rubber-banding
 * past either end), and the arrow keys step it; the waves follow the level
 * band by band and the pills fill, and reaching 0 mutes. Under reduced
 * motion the waves and the slash appear and disappear in place by opacity
 * and the meter changes on a short tween — the level and the muted state
 * still show, because they are the information.
 */
export function MuteCone({
  pressed,
  defaultPressed = false,
  onPressedChange,
  level,
  defaultLevel = 60,
  onLevelChange,
  waves = 4,
  slash = "line",
  step = 10,
  label = "Sound on",
  pressedLabel = "Muted",
  name = "Mute",
  formatLevel = (v: number) => `${v}%`,
  holdDelay = 420,
  scrubDistance = 120,
  stagger,
  compact = false,
  size = "md",
  accent = "var(--accent-bright)",
  mutedColor = "var(--danger)",
  sound = false,
  disabled = false,
  className,
}: MuteConeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const descId = `${uid}-desc`;
  const g = SIZES[size] ?? SIZES.md;
  const n = Math.min(4, Math.max(1, Math.round(waves)));
  const beat = Math.max(0, stagger ?? cascade(n) * 1000) / 1000;
  const unitStep = Math.max(1, Math.round(step));
  const travel = Math.max(24, scrubDistance);

  const [ownPressed, setOwnPressed] = React.useState(defaultPressed);
  const [ownLevel, setOwnLevel] = React.useState(() =>
    Math.round(clampLevel(defaultLevel)),
  );
  const [scrubbing, setScrubbing] = React.useState(false);
  const [spoken, setSpoken] = React.useState("");
  const isMuted = pressed ?? ownPressed;
  const current = Math.round(clampLevel(level ?? ownLevel));
  const visible = isMuted ? 0 : current;
  const silent = visible === 0;
  const present = Array.from({ length: n }, (_, i) =>
    !silent && visible > (i * 100) / n ? "1" : "0",
  ).join("");

  const e = [
    useMotionValue(present[0] === "1" ? 1 : 0),
    useMotionValue(present[1] === "1" ? 1 : 0),
    useMotionValue(present[2] === "1" ? 1 : 0),
    useMotionValue(present[3] === "1" ? 1 : 0),
  ];
  const meter = useMotionValue(visible);
  const draw = useMotionValue(silent && slash !== "none" ? 1 : 0);
  const mark = useMotionValue(1);
  const arm = useMotionValue(0);
  const stretch = useMotionValue(0);
  const wordY = [useMotionValue(0), useMotionValue(0), useMotionValue(0)];
  const wordIndex = scrubbing ? 2 : isMuted ? 1 : 0;
  const wordOpacity = [
    useMotionValue(wordIndex === 0 ? 1 : 0),
    useMotionValue(wordIndex === 1 ? 1 : 0),
    useMotionValue(wordIndex === 2 ? 1 : 0),
  ];

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const live = React.useRef({
    present,
    silent,
    visible,
    word: wordIndex,
    /** The last level that made a sound: what unmuting from 0 goes back to. */
    audible: current > 0 ? current : 60,
    /** Set by the visitor's own press, drag or key: what follows may be heard. */
    voice: 0,
    dragging: false,
    held: false,
    start: 0,
    detent: Math.floor(visible / 20),
    timer: 0,
    sfx: 0,
    running: new Map<string, AnimationPlaybackControls>(),
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    const map = live.current.running;
    map.get(key)?.stop();
    map.set(key, controls);
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const heard = () => performance.now() < live.current.voice;
  const speak = () => {
    live.current.voice = performance.now() + 1000;
  };

  const reportPressed = (next: boolean) => {
    if (next === isMuted) return;
    if (pressed === undefined) setOwnPressed(next);
    onPressedChange?.(next);
  };
  const reportLevel = (next: number) => {
    if (next === current) return;
    if (level === undefined) setOwnLevel(next);
    onLevelChange?.(next);
  };

  const toggle = () => {
    if (disabled) return;
    speak();
    if (isMuted || visible === 0) {
      const back = current > 0 ? current : live.current.audible;
      reportLevel(back);
      reportPressed(false);
      return;
    }
    reportPressed(true);
  };

  /** A level from a drag or a key: 0 is muted, anything else plays. */
  const setVisible = (next: number, via: "drag" | "key") => {
    if (disabled) return;
    const v = Math.round(clampLevel(next));
    speak();
    if (v > 0) live.current.audible = v;
    reportLevel(v);
    reportPressed(v === 0);
    if (via === "key") {
      setSpoken(v === 0 ? "Muted" : `Volume ${formatLevel(v)}`);
      audio.play("click", {
        pitch: r2(semitones(v / 10)),
        gain: 0.35,
        pan: pan(),
      });
    }
  };

  React.useEffect(() => {
    api.current = { toggle, setVisible };
  });

  // The level a host gives is remembered too, so a later unmute from 0 can
  // go back to it.
  React.useEffect(() => {
    if (current > 0) live.current.audible = current;
  }, [current]);

  // Waves and mark: what folds, what releases, and in what order.
  React.useEffect(() => {
    const s = live.current;
    const before = s.present;
    const wasSilent = s.silent;
    s.present = present;
    s.silent = silent;
    if (before === present && wasSilent === silent) return;
    const voiced = heard();
    const folding: number[] = [];
    const releasing: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const was = before[i] === "1";
      const now = present[i] === "1";
      if (was && !now) folding.push(i);
      if (!was && now) releasing.push(i);
    }
    // Outermost first on the way in; innermost first on the way out.
    folding.sort((a, b) => b - a);
    releasing.sort((a, b) => a - b);
    const lead = wasSilent && !silent ? 0.08 : 0;
    folding.forEach((i, k) => {
      const v = e[i];
      if (!v) return;
      if (!motionSafe) {
        run(`e${i}`, animate(v, 0, { duration: durations.fast }));
        return;
      }
      run(
        `e${i}`,
        animate(v, 0, { ...exitFor(durations.base), delay: k * beat }),
      );
    });
    releasing.forEach((i, k) => {
      const v = e[i];
      if (!v) return;
      if (!motionSafe) {
        run(`e${i}`, animate(v, 1, { duration: durations.fast }));
        return;
      }
      run(`e${i}`, animate(v, 1, { ...springs.snap, delay: lead + k * beat }));
    });
    // A mute or unmute is heard as the waves moving; a scrub crossing one
    // band is heard through its detent clicks instead.
    const muting = silent && !wasSilent;
    const unmuting = wasSilent && !silent;
    if (voiced && folding.length > 0 && (muting || folding.length > 1)) {
      audio.play("swish", { pitch: 0.7, gain: 0.32, pan: pan() });
    }
    if (voiced && releasing.length > 0 && (unmuting || releasing.length > 1)) {
      window.clearTimeout(s.sfx);
      s.sfx = window.setTimeout(
        () => audio.play("swish", { pitch: 1.25, gain: 0.32, pan: pan() }),
        Math.round(lead * 1000),
      );
    }

    if (wasSilent !== silent && slash !== "none") {
      if (silent) {
        // The pen goes down once the last wave has started home.
        const after = Math.max(0, folding.length - 1) * beat + 0.08;
        if (!motionSafe) {
          draw.jump(1);
          mark.jump(0);
          run("mark", animate(mark, 1, { duration: durations.base }));
        } else {
          mark.jump(1);
          run(
            "draw",
            animate(draw, 1, {
              duration: durations.base,
              ease: easings.enter,
              delay: after,
              onComplete: () => {
                if (voiced)
                  audio.play("click", { pitch: 0.9, gain: 0.5, pan: pan() });
              },
            }),
          );
        }
      } else if (!motionSafe) {
        run(
          "mark",
          animate(mark, 0, {
            duration: durations.fast,
            onComplete: () => draw.jump(0),
          }),
        );
      } else {
        run("draw", animate(draw, 0, exitFor(durations.base)));
        if (voiced) audio.play("click", { pitch: 1.2, gain: 0.4, pan: pan() });
      }
    }
    // Runs on a change of shape only; the wave values never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, silent]);

  // A slash style picked while muted is drawn whole at once.
  React.useEffect(() => {
    const s = live.current;
    if (!s.silent) return;
    s.running.get("draw")?.stop();
    draw.jump(slash === "none" ? 0 : 1);
    mark.jump(1);
  }, [slash, draw, mark]);

  // The meter: drained on the exit ease, refilled on glide, 1:1 under a drag.
  React.useEffect(() => {
    const s = live.current;
    const from = s.visible;
    s.visible = visible;
    s.detent = Math.floor(visible / 20);
    if (s.dragging) return;
    if (!motionSafe) {
      run(
        "meter",
        animate(meter, visible, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      return;
    }
    if (visible < from && visible === 0) {
      run(
        "meter",
        animate(meter, 0, { duration: durations.base, ease: easings.exit }),
      );
      return;
    }
    run(
      "meter",
      animate(meter, visible, {
        ...springs.glide,
        delay: from === 0 ? 0.08 : 0,
      }),
    );
    // Runs on a change of level only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The words share one slot: the old one leaves through an edge, the new
  // one arrives through the other.
  React.useLayoutEffect(() => {
    const s = live.current;
    const from = s.word;
    const to = wordIndex;
    if (from === to) return;
    s.word = to;
    const scrub = from === 2 || to === 2;
    const dir = to > from ? 1 : -1;
    const dist = scrub ? distances.nudge : distances.shift;
    const outY = wordY[from];
    const outO = wordOpacity[from];
    const inY = wordY[to];
    const inO = wordOpacity[to];
    if (!outY || !outO || !inY || !inO) return;
    const arrive = scrub ? 0 : 0.03;
    run(`o${from}`, animate(outO, 0, exitFor(durations.fast)));
    run(
      `o${to}`,
      animate(inO, 1, {
        duration: durations.fast,
        ease: easings.enter,
        delay: arrive,
      }),
    );
    if (!motionSafe) {
      outY.jump(0);
      inY.jump(0);
      return;
    }
    run(`y${from}`, animate(outY, -dir * dist, exitFor(durations.fast)));
    inY.jump(dir * dist);
    run(`y${to}`, animate(inY, 0, { ...springs.snap, delay: arrive }));
    // Runs once per change of word; the word values never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordIndex]);

  // Finish, never freeze: whatever is interrupted lands on its state.
  React.useEffect(() => {
    const s = live.current;
    return () => {
      for (const c of s.running.values()) c.stop();
      s.running.clear();
      window.clearTimeout(s.timer);
      window.clearTimeout(s.sfx);
      e.forEach((v, i) => v.jump(s.present[i] === "1" ? 1 : 0));
      meter.jump(s.visible);
      draw.jump(s.silent && slash !== "none" ? 1 : 0);
      mark.jump(1);
      arm.jump(0);
      stretch.jump(0);
      wordY.forEach((y) => y.jump(0));
      wordOpacity.forEach((o, i) => o.jump(i === s.word ? 1 : 0));
    };
    // Teardown only; it reads the latest state from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endScrub = () => {
    const s = live.current;
    window.clearTimeout(s.timer);
    s.dragging = false;
    setScrubbing(false);
    if (motionSafe) {
      run("arm", animate(arm, 0, springs.snap));
      run("stretch", animate(stretch, 0, springs.snap));
    } else {
      arm.jump(0);
      stretch.jump(0);
    }
    // Wherever the host left it — the drag's level, or its own if it refused.
    run(
      "meter",
      animate(
        meter,
        s.visible,
        motionSafe ? springs.glide : { duration: durations.fast },
      ),
    );
  };

  const armScrub = () => {
    const s = live.current;
    s.held = true;
    s.start = s.visible;
    setScrubbing(true);
    if (motionSafe) run("arm", animate(arm, 1, springs.snap));
    else arm.jump(1);
    audio.play("click", { pitch: 1.4, gain: 0.3, pan: pan() });
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => {
      const s = live.current;
      window.clearTimeout(s.timer);
      if (!s.held) {
        s.start = s.visible;
        setScrubbing(true);
        if (motionSafe) run("arm", animate(arm, 1, springs.snap));
        else arm.jump(1);
      }
      s.held = true;
      s.dragging = true;
      s.running.get("meter")?.stop();
    },
    onMove: ({ offset }) => {
      const s = live.current;
      const raw = s.start - (offset.y * 100) / travel;
      const held = clampLevel(raw);
      // The level follows 1:1; past either end the meter stretches instead
      // of stopping dead.
      meter.set(r2(held));
      const excess = ((raw - held) * travel) / 100;
      stretch.set(motionSafe ? r3((rubberband(excess, 40) / 40) * 0.06) : 0);
      const v = Math.round(held);
      const detent = Math.floor(v / 20);
      if (detent !== s.detent || (v === 0) !== (s.visible === 0)) {
        audio.play("click", {
          pitch: r2(semitones(v / 10)),
          gain: 0.3,
          pan: pan(),
        });
      }
      s.detent = detent;
      if (v !== s.visible) api.current?.setVisible(v, "drag");
    },
    onEnd: () => {
      const s = live.current;
      endScrub();
      setSpoken(s.visible === 0 ? "Muted" : `Volume ${formatLevel(s.visible)}`);
    },
    onCancel: () => endScrub(),
    onTap: () => {
      const s = live.current;
      window.clearTimeout(s.timer);
      if (s.held) {
        // A long press that never moved: the scrub ends, nothing toggles.
        s.held = false;
        endScrub();
        return;
      }
      api.current?.toggle();
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    drag.onPointerDown(event);
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const s = live.current;
    s.held = false;
    window.clearTimeout(s.timer);
    // The hold charges the meter a little, then arms it.
    if (motionSafe) {
      run(
        "arm",
        animate(arm, 0.25, {
          duration: Math.max(0.05, holdDelay / 1000),
          ease: "linear",
        }),
      );
    }
    s.timer = window.setTimeout(armScrub, Math.max(0, holdDelay));
  };

  const finishPointer = () => {
    const s = live.current;
    window.clearTimeout(s.timer);
    if (!s.dragging && !s.held && arm.get() > 0) {
      run("arm", animate(arm, 0, { duration: durations.fast }));
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const s = live.current;
    const big = 25;
    const keys: Record<string, number> = {
      ArrowUp: s.visible + unitStep,
      ArrowRight: s.visible + unitStep,
      ArrowDown: s.visible - unitStep,
      ArrowLeft: s.visible - unitStep,
      PageUp: s.visible + big,
      PageDown: s.visible - big,
      Home: 0,
      End: 100,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setVisible(next, "key");
  };

  const pillScaleY = useTransform(arm, (a) => r3(1 + 0.6 * a));
  const meterScaleX = useTransform(stretch, (s) => r3(1 + Math.abs(s)));
  const meterOrigin = useTransform(stretch, (s) => (s < 0 ? 1 : 0));

  const W = widthFor(n, slash);
  const iconW = Math.round((W * g.icon) / 24);
  const slashFrom: Pt = [2.5, 3.5];
  const slashTo: Pt = [Math.min(W - 2.5, 21.5), 20.5];
  const lineX = useTransform(draw, (d) =>
    r2(lerp(slashFrom[0], slashTo[0], clamp01(d))),
  );
  const lineY = useTransform(draw, (d) =>
    r2(lerp(slashFrom[1], slashTo[1], clamp01(d))),
  );
  const cx = W - 5.5;
  const half = 3;
  const crossA = useTransform(draw, (d) => {
    const t = clamp01(d / 0.55);
    return `M${r2(cx - half)} ${12 - half}L${r2(cx - half + 2 * half * t)} ${r2(12 - half + 2 * half * t)}`;
  });
  const crossB = useTransform(draw, (d) => {
    const t = clamp01((d - 0.45) / 0.55);
    return t <= 0
      ? ""
      : `M${r2(cx + half)} ${12 - half}L${r2(cx + half - 2 * half * t)} ${r2(12 - half + 2 * half * t)}`;
  });
  const markOpacity = useTransform(
    [draw, mark] as MotionValue<number>[],
    ([d = 0, m = 1]: number[]) => (d > 0.001 ? r3(m) : 0),
  );

  const words = [label, pressedLabel, formatLevel(visible)];
  const description = `${isMuted ? "Muted" : `Volume ${formatLevel(current)}`}. Hold, drag up or down, or use the arrow keys to change the volume.`;

  return (
    <>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-pressed={isMuted}
        aria-label={name}
        aria-describedby={descId}
        disabled={disabled}
        {...drag}
        onPointerDown={onPointerDown}
        onPointerUp={(event) => {
          drag.onPointerUp(event);
          finishPointer();
        }}
        onPointerCancel={(event) => {
          drag.onPointerCancel(event);
          finishPointer();
          if (live.current.held) endScrub();
        }}
        onPointerLeave={() => {
          // Left before the drag took hold of the pointer: the hold is off.
          const s = live.current;
          if (s.dragging) return;
          window.clearTimeout(s.timer);
          if (s.held) {
            s.held = false;
            endScrub();
          } else finishPointer();
        }}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap. A click with no
          // pointer behind it — Space, Enter, assistive technology — is a
          // press too.
          if (event.detail === 0) toggle();
        }}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "group/mute-cone relative inline-flex shrink-0 cursor-pointer touch-pan-x items-center justify-center rounded-full border border-hairline-strong outline-none select-none [-webkit-touch-callout:none]",
          "transition-[border-color] duration-150 hover:border-ink-3/50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
          compact ? cn(g.square, "flex-col") : g.box,
          className,
        )}
        style={{ background: BASE }}
      >
        <span
          aria-hidden
          className="block shrink-0 transition-colors duration-150"
          style={{
            width: iconW,
            height: g.icon,
            color: isMuted ? "var(--ink-3)" : "var(--foreground)",
          }}
        >
          <svg
            width={iconW}
            height={g.icon}
            viewBox={`0 0 ${W} 24`}
            fill="none"
            className="block"
          >
            <path
              d="M2.75 9.2H6.6L11.4 5V19L6.6 14.8H2.75Z"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinejoin="round"
              fill="currentColor"
              fillOpacity={0.14}
            />
            <g style={{ color: accent }}>
              {Array.from({ length: n }, (_, i) => (
                <Wave
                  key={i}
                  e={e[i] as MotionValue<number>}
                  meter={meter}
                  index={i}
                  count={n}
                />
              ))}
            </g>
            {slash === "line" ? (
              <motion.g style={{ opacity: markOpacity }}>
                <motion.line
                  x1={slashFrom[0]}
                  y1={slashFrom[1]}
                  x2={lineX}
                  y2={lineY}
                  strokeWidth={STROKE + 2.4}
                  strokeLinecap="round"
                  style={{ stroke: BASE }}
                />
                <motion.line
                  x1={slashFrom[0]}
                  y1={slashFrom[1]}
                  x2={lineX}
                  y2={lineY}
                  strokeWidth={STROKE + 0.2}
                  strokeLinecap="round"
                  style={{ stroke: mutedColor }}
                />
              </motion.g>
            ) : null}
            {slash === "cross" ? (
              <motion.g
                style={{ opacity: markOpacity, stroke: mutedColor }}
                strokeWidth={STROKE + 0.2}
                strokeLinecap="round"
              >
                <motion.path d={crossA} />
                <motion.path d={crossB} />
              </motion.g>
            ) : null}
          </svg>
        </span>

        {compact ? (
          <motion.span
            aria-hidden
            className={cn("flex", g.meter)}
            style={{ scaleX: meterScaleX, originX: meterOrigin }}
          >
            {Array.from({ length: PILLS }, (_, i) => (
              <motion.span
                key={i}
                className="block"
                style={{ scaleY: pillScaleY }}
              >
                <Pill
                  meter={meter}
                  index={i}
                  className={g.dot}
                  accent={accent}
                />
              </motion.span>
            ))}
          </motion.span>
        ) : (
          <span aria-hidden className="flex flex-col items-start gap-1">
            <span
              className={cn(
                "grid overflow-clip text-left font-medium",
                g.words,
              )}
            >
              <span className="invisible col-start-1 row-start-1 font-mono tabular-nums">
                {formatLevel(100)}
              </span>
              {words.map((word, i) => (
                <motion.span
                  key={i}
                  className={cn(
                    "col-start-1 row-start-1 whitespace-nowrap",
                    i === 2 && "font-mono tabular-nums",
                  )}
                  style={{
                    y: wordY[i],
                    opacity: wordOpacity[i],
                    color: i === 1 ? mutedColor : "var(--foreground)",
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </span>
            <motion.span
              className={cn("flex", g.meter)}
              style={{ scaleX: meterScaleX, originX: meterOrigin }}
            >
              {Array.from({ length: PILLS }, (_, i) => (
                <motion.span
                  key={i}
                  className="block"
                  style={{ scaleY: pillScaleY }}
                >
                  <Pill
                    meter={meter}
                    index={i}
                    className={g.pill}
                    accent={accent}
                  />
                </motion.span>
              ))}
            </motion.span>
          </span>
        )}

        <span id={descId} className="sr-only">
          {description}
        </span>
      </motion.button>
      {/* Outside the button: a button's contents are not read as live text. */}
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </>
  );
}
