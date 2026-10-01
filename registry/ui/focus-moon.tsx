"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  motionValue,
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
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FocusMoonSize = "sm" | "md" | "lg";
/** A moment as a Date or epoch milliseconds. */
export type FocusMoonTime = Date | number;

export type FocusMoonProps = {
  /** Controlled state: true while notifications are held. */
  pressed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the tap, the hold or the key that changed it, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** Controlled end of the focus. */
  until?: FocusMoonTime;
  /** Initial end of the focus when uncontrolled. @default now plus `minutes` once it starts */
  defaultUntil?: FocusMoonTime;
  /** Fires when a tap, a released hold or an arrow key sets a new end time. */
  onUntilChange?: (until: Date) => void;
  /** The current time. Pass it from your clock so server and client agree; without it a press reads the clock when it happens. */
  now?: FocusMoonTime;
  /** How long a tap focuses for, in minutes. @default 60 */
  minutes?: number;
  /** What one hold step or arrow key adds, in minutes; steps land on this grid (15:07 → 15:30). @default 30 */
  step?: number;
  /** The furthest a hold can push the end, in minutes from now. @default 480 */
  maxMinutes?: number;
  /** How long a press must be held before it starts extending, in ms. @default 450 */
  holdDelay?: number;
  /** Time between steps while held, in ms. @default 420 */
  holdInterval?: number;
  /** How many stars come out around the eclipse, 0 to 8. @default 5 */
  stars?: number;
  /** Strength of the light, 0 to 1: the sun's bloom, the corona and its breathing. @default 0.6 */
  glow?: number;
  /** The button's accessible name and its words while off. @default "Do not disturb" */
  label?: string;
  /** The words before the end time while on. @default "Focusing until" */
  focusLabel?: string;
  /** How the end time is written. @default 24-hour "15:00" in `timeZone` */
  format?: (date: Date) => string;
  /** The IANA time zone the default format writes in. @default "UTC" */
  timeZone?: string;
  /** Icon only; the name stays and the end time moves to the description and title. @default false */
  compact?: boolean;
  /** @default "md" */
  size?: FocusMoonSize;
  /** The sun, the corona and the bloom, any CSS colour. @default a warm pigment taken from `--warn` */
  sun?: string;
  /** The night the face turns while focusing, any CSS colour. @default a deep pigment taken from `--accent` */
  night?: string;
  /** Play the chime and the hold's ticks. Off unless asked for. @default false */
  sound?: boolean;
  /** Greys the toggle out and ignores presses, holds and keys. @default false */
  disabled?: boolean;
  /** Extra classes for the root, which wraps the button. */
  className?: string;
};

const MAX_STARS = 8;
const MINUTE = 60_000;
/** Pixels a press may wander before it counts as a scroll, not a hold. */
const SLOP_MOUSE = 4;
const SLOP_TOUCH = 9;
/** Where the moon waits, out of sight up and to the left of the sun. */
const MOON_AWAY = { x: -12, y: -4 };

const SIZES: Record<
  FocusMoonSize,
  { icon: number; pill: string; round: string }
> = {
  sm: { icon: 24, pill: "h-8 gap-1.5 pr-3 pl-1 text-xs", round: "size-8" },
  md: { icon: 30, pill: "h-10 gap-2 pr-4 pl-1.5 text-sm", round: "size-10" },
  lg: { icon: 36, pill: "h-12 gap-2.5 pr-5 pl-2 text-base", round: "size-12" },
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const timeOf = (t: FocusMoonTime | undefined) =>
  t === undefined ? undefined : t instanceof Date ? t.getTime() : t;
const pad = (n: number) => String(n).padStart(2, "0");
/** "1 minute", "45 minutes", "1 hour", "1 hour 30 minutes". */
const spanText = (ms: number) => {
  const total = Math.round(ms / MINUTE);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
};
const utcClock = (date: Date) =>
  `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;

/** A small seeded hash, so the stars sit in the same places on server and client. */
const seeded = (n: number) => {
  let h = (n * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type StarSpot = { x: number; y: number; size: number; offset: number };

const STAR_SPOTS: StarSpot[] = Array.from({ length: MAX_STARS }, (_, i) => {
  // Spread evenly round the eclipse, each nudged a little off its slot.
  const angle =
    ((-100 + i * (360 / MAX_STARS) + (seeded(i + 1) - 0.5) * 22) * Math.PI) /
    180;
  const radius = 11.8 + seeded(i + 11) * 1.6;
  return {
    x: r3(16 + radius * Math.cos(angle)),
    y: r3(16 + radius * Math.sin(angle)),
    size: r3(1.05 + seeded(i + 21) * 0.75),
    offset: r3(seeded(i + 31)),
  };
});

/** A four-point sparkle centred on (x, y). */
const sparkle = (x: number, y: number, s: number) =>
  `M ${r3(x)} ${r3(y - s)} Q ${r3(x)} ${r3(y)} ${r3(x + s)} ${r3(y)} Q ${r3(x)} ${r3(y)} ${r3(x)} ${r3(y + s)} Q ${r3(x)} ${r3(y)} ${r3(x - s)} ${r3(y)} Q ${r3(x)} ${r3(y)} ${r3(x)} ${r3(y - s)} Z`;

const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = ((i * 45 + 22.5) * Math.PI) / 180;
  return {
    x1: r3(16 + 7.3 * Math.cos(a)),
    y1: r3(16 + 7.3 * Math.sin(a)),
    x2: r3(16 + 9.4 * Math.cos(a)),
    y2: r3(16 + 9.4 * Math.sin(a)),
  };
});

/** Where the last of the sun shows as the moon covers it: the lower right. */
const DIAMOND = { x: 19.54, y: 19.54 };

function Star({
  spot,
  on,
  phase,
  motionSafe,
}: {
  spot: StarSpot;
  on: MotionValue<number>;
  phase: MotionValue<number>;
  motionSafe: boolean;
}) {
  // Each star twinkles on the same breath, a little out of step with the next.
  const opacity = useTransform(
    [on, phase] as MotionValue<number>[],
    ([o = 0, p = 0]: number[]) =>
      r3(
        clamp(o, 0, 1) *
          (0.62 + 0.38 * Math.sin(2 * Math.PI * (p * 2 + spot.offset))),
      ),
  );
  const scale = useTransform(on, (o) => r3(Math.max(0, o)));
  return (
    <motion.path
      d={sparkle(spot.x, spot.y, spot.size)}
      style={{
        fill: "var(--focus-moon-star)",
        opacity,
        scale: motionSafe ? scale : 1,
        originX: 0.5,
        originY: 0.5,
      }}
    />
  );
}

function DigitSlot({
  digit,
  dir,
  motionSafe,
}: {
  digit: string;
  dir: number;
  motionSafe: boolean;
}) {
  return (
    <span className="relative inline-grid overflow-clip">
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={digit}
          custom={dir}
          variants={{
            enter: (d: number) =>
              motionSafe ? { y: `${d * 100}%`, opacity: 0 } : { opacity: 0 },
            rest: {
              y: "0%",
              opacity: 1,
              transition: motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast },
            },
            leave: (d: number) =>
              motionSafe
                ? {
                    y: `${-d * 100}%`,
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }
                : { opacity: 0, transition: { duration: durations.fast } },
          }}
          initial="enter"
          animate="rest"
          exit="leave"
          className="col-start-1 row-start-1"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The end time, its digits rolling one slot in the direction it moved. */
function TimeRoll({
  text,
  dir,
  motionSafe,
}: {
  text: string;
  dir: number;
  motionSafe: boolean;
}) {
  return (
    <span className="inline-flex tabular-nums">
      {Array.from(text).map((char, i) =>
        /\d/.test(char) ? (
          <DigitSlot key={i} digit={char} dir={dir} motionSafe={motionSafe} />
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </span>
  );
}

type Hold = {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  engaged: boolean;
  timer: number;
  /** Where the end time had got to while held. */
  draft: number;
  steps: number;
};

type Armed = { to: boolean; at: number };

type Api = {
  transition: (to: boolean, voiced: boolean) => void;
  pose: () => void;
  engage: () => void;
  stepUp: () => void;
  release: (commit: boolean) => void;
};

/**
 * A do-not-disturb toggle that eclipses its own sun. Pressed, a moon slides
 * across the sun on a snap whose one overshoot carries it a hair past centre,
 * so the last of the sun flashes on the far limb — the diamond ring — before
 * the corona comes up around the dark disc, the face turns to night and stars
 * twinkle in round the icon. The label becomes "Focusing until 15:00". While
 * focusing and on screen, the corona breathes and the stars twinkle from one
 * phase value; off screen or in a hidden tab, nothing runs.
 *
 * Holding the button extends the end in steps on a grid (15:00, 15:30,
 * 16:00), a tick per step as the changed digits roll; letting go sets it, and
 * a tap toggles with the default length. Pressed off, the moon slides away,
 * the stars go out, the rays grow back and the sunlight blooms then settles.
 *
 * Times come from `now`, never from the clock during render. It is a real
 * toggle button: Space and Enter toggle it, the Up and Down arrows move the
 * end time a step, the end time is its description and a polite status
 * speaks each committed change. Under reduced motion the moon fades in over
 * the sun, nothing slides or breathes, and the night, the label and the time
 * still change.
 */
export function FocusMoon({
  pressed,
  defaultPressed = false,
  onPressedChange,
  until,
  defaultUntil,
  onUntilChange,
  now,
  minutes = 60,
  step = 30,
  maxMinutes = 480,
  holdDelay = 450,
  holdInterval = 420,
  stars = 5,
  glow = 0.6,
  label = "Do not disturb",
  focusLabel = "Focusing until",
  format,
  timeZone,
  compact = false,
  size = "md",
  sun,
  night,
  sound = false,
  disabled = false,
  className,
}: FocusMoonProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const descriptionId = `${uid}-description`;
  const bloomId = `focus-moon-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const geometry = SIZES[size] ?? SIZES.md;
  const starCount = Math.round(clamp(stars, 0, MAX_STARS));
  const light = clamp(glow, 0, 1);
  const length = Math.max(1, minutes) * MINUTE;
  const stepMs = Math.max(1, step) * MINUTE;
  const nowTime = timeOf(now);

  const [own, setOwn] = React.useState(defaultPressed);
  const [ownUntil, setOwnUntil] = React.useState<number | null>(() => {
    const initial = timeOf(defaultUntil);
    if (initial !== undefined) return initial;
    return defaultPressed && nowTime !== undefined ? nowTime + length : null;
  });
  const [draft, setDraft] = React.useState<number | null>(null);
  const [rollDir, setRollDir] = React.useState(1);
  const isOn = pressed ?? own;
  const untilTime = until !== undefined ? (timeOf(until) ?? null) : ownUntil;
  /** On, or being held on: what the icon shows. */
  const visualOn = isOn || draft !== null;
  const shownTime = draft ?? untilTime;

  const write = React.useMemo(() => {
    if (format) return format;
    if (!timeZone || timeZone === "UTC") return utcClock;
    try {
      const f = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone,
      });
      return (date: Date) => f.format(date);
    } catch {
      return utcClock;
    }
  }, [format, timeZone]);
  const timeText = shownTime === null ? "" : write(new Date(shownTime));
  const committedText = untilTime === null ? "" : write(new Date(untilTime));
  const hint = isOn
    ? "Hold, or press the Up and Down arrows, to change the end time."
    : `Press to focus for ${spanText(length)}; hold to choose how long.`;
  const description =
    isOn && committedText ? `Until ${committedText}. ${hint}` : hint;

  // Spoken once a change has committed — never per hold step — from the new
  // value, in the render that changed it.
  const sayKey = isOn ? `on ${committedText}` : "off";
  const [said, setSaid] = React.useState({ key: sayKey, text: "" });
  if (said.key !== sayKey) {
    setSaid({
      key: sayKey,
      text: isOn
        ? committedText
          ? `${focusLabel} ${committedText}`
          : focusLabel
        : `${label} off`,
    });
  }

  const away = visualOn ? 0 : 1;
  const moonX = useMotionValue(away * MOON_AWAY.x);
  const moonY = useMotionValue(away * MOON_AWAY.y);
  const moonOpacity = useMotionValue(1 - away);
  const corona = useMotionValue(1 - away);
  const coronaIn = useMotionValue(1);
  const bump = useMotionValue(0);
  const rays = useMotionValue(away);
  const rayScale = useMotionValue(visualOn ? 0.6 : 1);
  const bloom = useMotionValue(away);
  const diamond = useMotionValue(0);
  const dusk = useMotionValue(1 - away);
  const phase = useMotionValue(0);
  const squeeze = useMotionValue(1);
  const [starOn] = React.useState(() =>
    Array.from({ length: MAX_STARS }, (_, i) =>
      motionValue(visualOn && i < starCount ? 1 : 0),
    ),
  );

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const hold = React.useRef<Hold | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const suppressClick = React.useRef(false);
  const shown = React.useRef(visualOn);
  const armed = React.useRef<Armed | null>(null);
  const hovered = React.useRef(false);
  const quiet = React.useRef(false);
  const busyUntil = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const [inView, setInView] = React.useState(false);
  const pageVisible = React.useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => true,
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.round(ms)));
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.length = 0;
  };
  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.height / 2, null) : 0;
  };
  const clock = () => nowTime ?? Date.now();
  const snapUp = (t: number) => (Math.floor(t / stepMs) + 1) * stepMs;
  const snapDown = (t: number) => (Math.ceil(t / stepMs) - 1) * stepMs;
  const latest = () => clock() + Math.max(length, maxMinutes * MINUTE);

  const squeezeTo = (to: number) => {
    if (!motionSafe) return;
    run("squeeze", animate(squeeze, to, to < 1 ? springs.flick : springs.snap));
  };

  /** The resting pose for the shown state and the pointer over it. */
  const pose = () => {
    if (performance.now() < busyUntil.current || !motionSafe) return;
    const peeking = hovered.current && !quiet.current && !disabled;
    if (shown.current) {
      // On: the moon eases aside a hair, a sliver of sun showing.
      run("moonX", animate(moonX, peeking ? 1.2 : 0, springs.glide));
      run("moonY", animate(moonY, 0, springs.glide));
    } else {
      // Off: the moon leans into view at the sun's edge.
      run("moonX", animate(moonX, peeking ? -10 : MOON_AWAY.x, springs.glide));
      run("moonY", animate(moonY, peeking ? -3.3 : MOON_AWAY.y, springs.glide));
      run(
        "moonOpacity",
        animate(moonOpacity, peeking ? 0.45 : 0, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
    }
  };

  const transition = (to: boolean, voiced: boolean) => {
    for (const c of running.current.values()) c.stop();
    running.current.clear();
    clearTimers();
    const where = pan();
    const tween = { duration: durations.base, ease: easings.enter };
    if (!motionSafe) {
      busyUntil.current = 0;
      moonX.jump(to ? 0 : MOON_AWAY.x);
      moonY.jump(to ? 0 : MOON_AWAY.y);
      run("moonOpacity", animate(moonOpacity, to ? 1 : 0, tween));
      run("corona", animate(corona, to ? 1 : 0, tween));
      coronaIn.jump(1);
      rayScale.jump(to ? 0.6 : 1);
      run("rays", animate(rays, to ? 0 : 1, tween));
      run("bloom", animate(bloom, to ? 0 : 1, tween));
      run("dusk", animate(dusk, to ? 1 : 0, tween));
      starOn.forEach((s, i) =>
        run(`star${i}`, animate(s, to && i < starCount ? 1 : 0, tween)),
      );
      if (voiced) {
        audio.play("chime", {
          pitch: to ? 1 : 0.75,
          gain: to ? 0.4 : 0.25,
          pan: where,
        });
      }
      return;
    }
    if (to) {
      busyUntil.current = performance.now() + 650;
      // From out of sight unless the moon is already on its way back.
      if (moonOpacity.get() < 0.05) {
        moonX.jump(MOON_AWAY.x);
        moonY.jump(MOON_AWAY.y);
      }
      run("moonX", animate(moonX, 0, springs.snap));
      run("moonY", animate(moonY, 0, springs.snap));
      run(
        "moonOpacity",
        animate(moonOpacity, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      run("rays", animate(rays, 0, tween));
      run("rayScale", animate(rayScale, 0.6, springs.glide));
      run("bloom", animate(bloom, 0, tween));
      run(
        "dusk",
        animate(dusk, 1, { duration: durations.slow, ease: easings.enter }),
      );
      run("corona", animate(corona, 1, { ...tween, delay: 0.14 }));
      coronaIn.jump(0.8);
      run("coronaIn", animate(coronaIn, 1, { ...springs.snap, delay: 0.14 }));
      // The diamond ring: the last bead of sun as the moon closes over it.
      diamond.jump(0);
      run(
        "diamond",
        animate(diamond, [0, 1, 0], {
          duration: 0.46,
          times: [0, 0.35, 1],
          ease: "easeOut",
          delay: 0.12,
        }),
      );
      const gap = cascade(Math.max(2, starCount));
      starOn.forEach((s, i) => {
        if (i >= starCount) {
          s.jump(0);
          return;
        }
        run(
          `star${i}`,
          animate(s, 1, { ...springs.snap, delay: 0.22 + i * gap }),
        );
      });
      if (voiced) {
        later(200, () =>
          audio.play("chime", { pitch: 1, gain: 0.4, pan: where }),
        );
      }
    } else {
      busyUntil.current = performance.now() + 650;
      const exit = { duration: durations.slow, ease: easings.exit };
      run("moonX", animate(moonX, -MOON_AWAY.x, exit));
      run("moonY", animate(moonY, -MOON_AWAY.y, exit));
      run(
        "moonOpacity",
        animate(moonOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
          delay: 0.25,
          onComplete: () => {
            moonX.jump(MOON_AWAY.x);
            moonY.jump(MOON_AWAY.y);
          },
        }),
      );
      run("corona", animate(corona, 0, exitFor(durations.base)));
      const gap = cascade(Math.max(2, starCount));
      starOn.forEach((s, i) => {
        const order = Math.max(0, starCount - 1 - i);
        run(
          `star${i}`,
          animate(s, 0, {
            ...exitFor(durations.base),
            delay: order * gap * 0.5,
          }),
        );
      });
      run("rays", animate(rays, 1, { ...tween, delay: 0.12 }));
      run("rayScale", animate(rayScale, 1, { ...springs.glide, delay: 0.12 }));
      // Sunlight blooms back: it swells past its rest, then settles.
      run(
        "bloom",
        animate(bloom, 1.4, {
          duration: durations.base,
          ease: easings.enter,
          delay: 0.12,
          onComplete: () => run("bloom", animate(bloom, 1, springs.drift)),
        }),
      );
      run(
        "dusk",
        animate(dusk, 0, { duration: durations.slow, ease: easings.enter }),
      );
      if (voiced) {
        audio.play("chime", { pitch: 0.75, gain: 0.25, pan: where });
      }
    }
    later(busyUntil.current - performance.now() + 20, () =>
      api.current?.pose(),
    );
  };

  const report = (on: boolean, end: number | null, dir = 1) => {
    armed.current = { to: on, at: performance.now() };
    setRollDir(dir);
    if (end !== null) {
      if (until === undefined) setOwnUntil(end);
      onUntilChange?.(new Date(end));
    }
    if (on !== isOn) {
      if (pressed === undefined) setOwn(on);
      onPressedChange?.(on);
    }
  };

  const tick = (n: number) =>
    audio.play("tick", {
      pitch: Number(semitones(Math.min(n, 12)).toFixed(3)),
      gain: 0.3,
      pan: pan(),
    });

  const pulse = () => {
    if (!motionSafe) return;
    run(
      "bump",
      animate(bump, 1, {
        ...springs.flick,
        onComplete: () => run("bump", animate(bump, 0, springs.snap)),
      }),
    );
  };

  const stepUp = () => {
    const h = hold.current;
    if (!h) return;
    const next = Math.min(snapUp(h.draft), latest());
    if (next <= h.draft) return;
    h.draft = next;
    h.steps += 1;
    setRollDir(1);
    setDraft(next);
    tick(h.steps);
    pulse();
  };

  /** A held press passes `holdDelay`: from here it extends instead of toggling. */
  const engage = () => {
    const h = hold.current;
    if (!h || h.engaged) return;
    h.engaged = true;
    suppressClick.current = true;
    if (!isOn) {
      // Held from off: it goes on at the default length first.
      h.draft = Math.min(clock() + length, latest());
      armed.current = { to: true, at: performance.now() };
      setRollDir(1);
      setDraft(h.draft);
    } else {
      // A stale end (already past) steps from now, not from the past.
      h.draft = Math.max(untilTime ?? clock() + length, clock());
      stepUp();
    }
    const repeat = () => {
      if (!hold.current?.engaged) return;
      api.current?.stepUp();
      hold.current.timer = window.setTimeout(
        repeat,
        Math.max(80, holdInterval),
      );
    };
    h.timer = window.setTimeout(repeat, Math.max(80, holdInterval));
  };

  /** The hold ends: an engaged one sets what it reached, a short one does nothing here. */
  const release = (commit: boolean) => {
    const h = hold.current;
    hold.current = null;
    detach.current?.();
    detach.current = null;
    if (!h) return;
    window.clearTimeout(h.timer);
    squeezeTo(1);
    if (!h.engaged) return;
    if (commit) {
      setDraft(null);
      report(true, h.draft);
    } else {
      setDraft(null);
    }
  };

  const adjust = (dir: 1 | -1) => {
    if (disabled) return;
    if (!isOn) {
      if (dir < 0) return;
      tick(1);
      report(true, Math.min(clock() + length, latest()));
      return;
    }
    const from = Math.max(untilTime ?? clock() + length, clock());
    const next =
      dir > 0
        ? Math.min(snapUp(from), latest())
        : Math.max(snapDown(from), snapUp(clock()));
    if (next === from) return;
    tick(dir > 0 ? 2 : 0);
    pulse();
    report(true, next, dir);
  };

  React.useEffect(() => {
    api.current = { transition, pose, engage, stepUp, release };
  });

  // Whoever turned it — a tap, a hold, a key or a host — the sky follows.
  // Only what the visitor did is heard.
  React.useEffect(() => {
    if (shown.current === visualOn) return;
    shown.current = visualOn;
    const ask = armed.current;
    armed.current = null;
    const voiced =
      !!ask && ask.to === visualOn && performance.now() - ask.at < 1500;
    api.current?.transition(visualOn, voiced);
  }, [visualOn]);

  // A new star count shows at once in the state the sky is in.
  React.useEffect(() => {
    starOn.forEach((s, i) => {
      const to = shown.current && i < starCount ? 1 : 0;
      if (s.get() !== to && !s.isAnimating()) s.jump(to);
    });
  }, [starCount, starOn]);

  // On but no end time yet (pressed from the start, no `now`): read the clock
  // once, after render.
  React.useEffect(() => {
    if (!isOn || untilTime !== null || until !== undefined) return;
    const timer = window.setTimeout(() => setOwnUntil(Date.now() + length), 0);
    return () => window.clearTimeout(timer);
  }, [isOn, untilTime, until, length]);

  // The corona breathes and the stars twinkle only while focusing, on
  // screen, in a visible tab, with motion allowed.
  React.useEffect(() => {
    if (!visualOn || !inView || !pageVisible || !motionSafe) return;
    const breath = animate(phase, phase.get() + 1, {
      duration: 3.6,
      ease: "linear",
      repeat: Infinity,
    });
    return () => breath.stop();
  }, [visualOn, inView, pageVisible, motionSafe, phase]);

  React.useEffect(() => {
    const node = buttonRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setInView(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  // A held finger slides without scrolling the page once the hold engages;
  // before that, moving scrolls and cancels the hold.
  React.useEffect(() => {
    const node = buttonRef.current;
    if (!node) return;
    const onTouchMove = (event: TouchEvent) => {
      if (hold.current?.engaged && event.cancelable) event.preventDefault();
    };
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => node.removeEventListener("touchmove", onTouchMove);
  }, []);

  // Anything that takes the page away ends a hold, keeping what it reached.
  React.useEffect(() => {
    const interrupted = () => api.current?.release(true);
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (disabled) api.current?.release(false);
  }, [disabled]);

  React.useEffect(() => {
    const anims = running.current;
    const pending = timers.current;
    return () => {
      detach.current?.();
      detach.current = null;
      if (hold.current) window.clearTimeout(hold.current.timer);
      hold.current = null;
      for (const c of anims.values()) c.stop();
      anims.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClick.current = false;
    release(false);
    squeezeTo(0.97);
    const pointerId = event.pointerId;
    hold.current = {
      pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      engaged: false,
      timer: window.setTimeout(
        () => api.current?.engage(),
        Math.max(0, holdDelay),
      ),
      draft: 0,
      steps: 0,
    };
    const move = (e: PointerEvent) => {
      const h = hold.current;
      if (!h || e.pointerId !== pointerId || h.engaged) return;
      const slop = h.pointerType === "mouse" ? SLOP_MOUSE : SLOP_TOUCH;
      if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > slop) {
        api.current?.release(false);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointerId) api.current?.release(true);
    };
    const cancel = (e: PointerEvent) => {
      // A held finger the browser takes back still set what it reached.
      if (e.pointerId === pointerId) api.current?.release(true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    detach.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  };

  const onClick = () => {
    // The release of a hold that extended is not a tap.
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (disabled) return;
    if (hovered.current) quiet.current = true;
    if (isOn) report(false, null);
    else report(true, Math.min(clock() + length, latest()));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        event.preventDefault();
        adjust(1);
        return;
      case "ArrowDown":
      case "ArrowLeft":
        event.preventDefault();
        adjust(-1);
        return;
      case "Enter":
        // A held Enter repeats clicks; one press is one toggle.
        if (event.repeat) event.preventDefault();
        return;
    }
  };

  const pointerOver = (over: boolean) => {
    if (hovered.current === over) return;
    hovered.current = over;
    if (!over) quiet.current = false;
    pose();
  };

  const face = useTransform(
    dusk,
    (d) =>
      `color-mix(in oklab, var(--card) ${r3(100 - 100 * clamp(d, 0, 1))}%, var(--focus-moon-night))`,
  );
  const ink = useTransform(
    dusk,
    (d) =>
      `color-mix(in oklab, var(--foreground) ${r3(100 - 100 * clamp(d, 0, 1))}%, var(--focus-moon-ink))`,
  );
  const edge = useTransform(
    dusk,
    (d) =>
      `color-mix(in oklab, var(--hairline-strong) ${r3(100 - 100 * clamp(d, 0, 1))}%, transparent)`,
  );
  const bloomOpacity = useTransform(bloom, (b) =>
    r3(Math.max(0, b) * (0.2 + 0.7 * light)),
  );
  const bloomScale = useTransform(bloom, (b) =>
    r3(0.8 + 0.2 * clamp(b, 0, 1.4)),
  );
  const coronaScale = useTransform(
    [coronaIn, bump, phase] as MotionValue<number>[],
    ([c = 1, b = 0, p = 0]: number[]) =>
      r3(c * (1 + 0.1 * b + 0.05 * light * Math.sin(2 * Math.PI * p))),
  );
  const coronaOpacity = useTransform(corona, (c) =>
    r3(clamp(c, 0, 1) * (0.5 + 0.5 * light)),
  );
  const haloOpacity = useTransform(
    [corona, phase] as MotionValue<number>[],
    ([c = 0, p = 0]: number[]) =>
      r3(
        clamp(c, 0, 1) *
          light *
          (0.7 + 0.3 * Math.sin(2 * Math.PI * p + Math.PI / 2)),
      ),
  );
  const diamondScale = useTransform(diamond, (d) => r3(0.4 + 0.8 * d));

  const style = {
    "--focus-moon-face": face,
    "--focus-moon-sun": sun ?? "oklch(from var(--warn) 0.84 0.13 h)",
    "--focus-moon-night": night ?? "oklch(from var(--accent) 0.27 0.07 h)",
    "--focus-moon-ink": "oklch(from var(--ink) 0.96 0.01 h)",
    "--focus-moon-star": "oklch(from var(--ink) 0.97 0.02 h)",
    color: ink,
    borderColor: edge,
    scale: squeeze,
  } as unknown as React.ComponentProps<typeof motion.button>["style"];

  return (
    <span className={cn("relative inline-flex max-w-full shrink-0", className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-pressed={isOn}
        aria-label={label}
        aria-describedby={descriptionId}
        aria-keyshortcuts="ArrowUp ArrowDown"
        title={
          compact && isOn && committedText
            ? `${focusLabel} ${committedText}`
            : undefined
        }
        disabled={disabled}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") pointerOver(true);
        }}
        onPointerLeave={(event) => {
          if (!hold.current) squeezeTo(1);
          if (event.pointerType === "mouse") pointerOver(false);
        }}
        onContextMenu={(event) => event.preventDefault()}
        style={style}
        className={cn(
          "group/focus-moon relative isolate inline-flex max-w-full shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full border bg-(--focus-moon-face) font-medium outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
          compact ? geometry.round : geometry.pill,
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-current opacity-0 transition-opacity duration-150 group-enabled/focus-moon:group-hover/focus-moon:opacity-[0.05]"
        />
        <svg
          aria-hidden
          width={geometry.icon}
          height={geometry.icon}
          viewBox="0 0 32 32"
          className="block shrink-0"
        >
          <defs>
            <radialGradient id={bloomId}>
              <stop
                offset="0%"
                style={{ stopColor: "var(--focus-moon-sun)", stopOpacity: 0.7 }}
              />
              <stop
                offset="45%"
                style={{
                  stopColor: "var(--focus-moon-sun)",
                  stopOpacity: 0.28,
                }}
              />
              <stop
                offset="100%"
                style={{ stopColor: "var(--focus-moon-sun)", stopOpacity: 0 }}
              />
            </radialGradient>
            {/* The corona's glow: nothing inside the ring, a soft fall outside it. */}
            <radialGradient id={`${bloomId}-corona`}>
              <stop
                offset="38%"
                style={{ stopColor: "var(--focus-moon-sun)", stopOpacity: 0 }}
              />
              <stop
                offset="50%"
                style={{ stopColor: "var(--focus-moon-sun)", stopOpacity: 0.6 }}
              />
              <stop
                offset="72%"
                style={{
                  stopColor: "var(--focus-moon-sun)",
                  stopOpacity: 0.14,
                }}
              />
              <stop
                offset="100%"
                style={{ stopColor: "var(--focus-moon-sun)", stopOpacity: 0 }}
              />
            </radialGradient>
          </defs>
          <motion.circle
            cx={16}
            cy={16}
            r={14}
            fill={`url(#${bloomId})`}
            style={{
              opacity: bloomOpacity,
              scale: bloomScale,
              originX: 0.5,
              originY: 0.5,
            }}
          />
          <motion.g
            style={{
              opacity: haloOpacity,
              scale: coronaScale,
              originX: 0.5,
              originY: 0.5,
            }}
          >
            <circle cx={16} cy={16} r={14} fill={`url(#${bloomId}-corona)`} />
          </motion.g>
          <motion.g
            style={{
              opacity: coronaOpacity,
              scale: coronaScale,
              originX: 0.5,
              originY: 0.5,
            }}
          >
            <circle
              cx={16}
              cy={16}
              r={7.1}
              fill="none"
              strokeWidth={1.1}
              style={{ stroke: "var(--focus-moon-sun)" }}
            />
          </motion.g>
          <motion.g
            strokeWidth={1.4}
            strokeLinecap="round"
            style={{
              stroke: "var(--focus-moon-sun)",
              opacity: rays,
              scale: rayScale,
              originX: 0.5,
              originY: 0.5,
            }}
          >
            {RAYS.map((ray) => (
              <line key={`${ray.x2}-${ray.y2}`} {...ray} />
            ))}
          </motion.g>
          <circle
            cx={16}
            cy={16}
            r={5}
            style={{ fill: "var(--focus-moon-sun)" }}
          />
          <motion.g style={{ x: moonX, y: moonY, opacity: moonOpacity }}>
            <circle
              cx={16}
              cy={16}
              r={5.5}
              style={{
                fill: "color-mix(in oklab, var(--focus-moon-night) 80%, black)",
              }}
            />
            {/* Earthshine: a thin lit rim, so the disc reads as a moon. */}
            <path
              d="M 16 10.5 A 5.5 5.5 0 0 0 16 21.5 A 4.4 5.5 0 0 1 16 10.5 Z"
              style={{ fill: "var(--focus-moon-ink)", opacity: 0.55 }}
            />
          </motion.g>
          <motion.path
            d={sparkle(DIAMOND.x, DIAMOND.y, 2.6)}
            style={{
              fill: "var(--focus-moon-star)",
              opacity: diamond,
              scale: diamondScale,
              originX: 0.5,
              originY: 0.5,
            }}
          />
          {STAR_SPOTS.slice(0, starCount).map((spot, i) => (
            <Star
              key={i}
              spot={spot}
              on={starOn[i] as MotionValue<number>}
              phase={phase}
              motionSafe={motionSafe}
            />
          ))}
        </svg>

        {compact ? null : (
          <span aria-hidden className="grid">
            {[false, true].map((state) => {
              const current = visualOn === state;
              const offset = motionSafe
                ? state
                  ? distances.nudge
                  : -distances.nudge
                : 0;
              return (
                <motion.span
                  key={String(state)}
                  initial={false}
                  animate={{
                    opacity: current ? 1 : 0,
                    y: current ? 0 : offset,
                  }}
                  transition={
                    !motionSafe
                      ? { duration: durations.fast }
                      : current
                        ? {
                            ...springs.snap,
                            opacity: { duration: durations.base },
                          }
                        : exitFor(durations.base)
                  }
                  className="col-start-1 row-start-1 text-left whitespace-nowrap"
                >
                  {state ? (
                    <>
                      {focusLabel}{" "}
                      {timeText ? (
                        <TimeRoll
                          text={timeText}
                          dir={rollDir}
                          motionSafe={motionSafe}
                        />
                      ) : (
                        <span className="invisible tabular-nums">00:00</span>
                      )}
                    </>
                  ) : (
                    label
                  )}
                </motion.span>
              );
            })}
          </span>
        )}
      </motion.button>
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said.text}
      </span>
    </span>
  );
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
