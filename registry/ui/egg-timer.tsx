"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EggTimerShell = "pear" | "lemon" | "mint";

export type EggTimerProps = {
  /** Controlled seconds left. */
  value?: number;
  /** Initial seconds left when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires with the seconds left: on each detent while setting, and once a second while running. */
  onValueChange?: (value: number) => void;
  /** Controlled: whether it is counting down. */
  running?: boolean;
  /** Initial running state when uncontrolled. @default false */
  defaultRunning?: boolean;
  /** Fires from the release, key, tap or ring that started or stopped it. */
  onRunningChange?: (running: boolean) => void;
  /** Fires when the count reaches zero and the bell rings. */
  onRing?: () => void;
  /** The scale, in minutes, 15 to 60: the graduations and the size of each ratchet step. @default 60 */
  max?: number;
  /** The shell's colour. @default "lemon" */
  shell?: EggTimerShell;
  /** Step once a second with the escapement rocking (and ticking, with sound); off, the dial sweeps back silently. @default true */
  ticking?: boolean;
  /** What is being timed: shown over the reading and in the dial's name. @default "Timer" */
  label?: string;
  /** Detents while setting, a tick a second while running, and the bell. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The drawing's box: the timer, its feet and its shake all stay inside it. */
const W = 176;
const CX = 88;
const CY = 86;
const BODY = 64;
const DIAL = 52;
const BAND = 47;
/** Degrees of travel for the whole scale; the rest is the gap at the stop. */
const SPAN = 330;
const RAD = Math.PI / 180;

const r2 = (v: number) => Math.round(v * 100) / 100;
/** The clock the count runs on; read only from effects, timers and handlers. */
const clockNow = () => performance.now();
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Angle a pointer makes with the dial's centre: 0 at the top, clockwise. */
const norm = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * The ratchet: within each minute the dial lingers on its detent and crosses
 * to the next over the middle 40% of the step, never more than half a step
 * from the hand.
 */
function ratchet(x: number) {
  const n = Math.floor(x);
  const t = clamp((x - n - 0.3) / 0.4, 0, 1);
  return n + t * t * (3 - 2 * t);
}

/** The red band from the pointer, clockwise, to where the 0 mark now sits. */
function bandPath(deg: number) {
  if (deg < 0.3) return "";
  const a = Math.min(deg, 359.5) * RAD;
  const x = r2(CX + BAND * Math.sin(a));
  const y = r2(CY - BAND * Math.cos(a));
  return `M ${CX} ${CY - BAND} A ${BAND} ${BAND} 0 ${deg > 180 ? 1 : 0} 1 ${x} ${y}`;
}

type Pigment = { base: string; light: string; dark: string };

/*
 * The shell is a lit object, so each colour is a token's hue at a fixed
 * lightness and reads the same in either theme: pear is the success hue
 * turned toward yellow, lemon the warn hue turned toward green.
 */
const SHELLS: Record<EggTimerShell, Pigment> = {
  pear: {
    base: "oklch(from var(--success) 0.8 0.13 calc(h - 42))",
    light: "oklch(from var(--success) 0.89 0.1 calc(h - 42))",
    dark: "oklch(from var(--success) 0.64 0.12 calc(h - 42))",
  },
  lemon: {
    base: "oklch(from var(--warn) 0.87 0.15 calc(h + 18))",
    light: "oklch(from var(--warn) 0.94 0.1 calc(h + 18))",
    dark: "oklch(from var(--warn) 0.72 0.14 calc(h + 12))",
  },
  mint: {
    base: "oklch(from var(--success) 0.85 0.08 calc(h + 8))",
    light: "oklch(from var(--success) 0.93 0.05 calc(h + 8))",
    dark: "oklch(from var(--success) 0.68 0.09 calc(h + 8))",
  },
};
const FACE = "oklch(from var(--warn) 0.97 0.012 h)";
const INK = "oklch(from var(--ink) 0.3 0.02 h)";
const RED = "oklch(from var(--danger) 0.6 0.19 h)";
const BRASS = "oklch(from var(--warn) 0.76 0.12 h)";
const SLOT = "oklch(from var(--ink) 0.24 0.02 h)";

const pad = (n: number) => String(n).padStart(2, "0");
const clockOf = (s: number) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

function spoken(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  const mins = m > 0 ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  const secs = r > 0 ? `${r} ${r === 1 ? "second" : "seconds"}` : "";
  return [mins, secs].filter(Boolean).join(" ") || "no time";
}

type Engine = {
  /** The clock reading at which the count reaches zero, while running. */
  deadline: number | null;
  /** Seconds left while not running (exact, not rounded). */
  rem: number;
  /** The last whole seconds reported, so the host's echo is not news. */
  reported: number;
  /** The last running state this timer set, likewise. */
  runReported: boolean;
  chain: number;
  ringTimer: number;
  chimes: number[];
  visible: boolean;
};

type Api = {
  stepTick: () => void;
  ring: () => void;
  resume: () => void;
  pause: () => void;
};

/**
 * A mechanical kitchen timer, face on. Drag round the dial to set it: it
 * turns 1:1 with the hand and ratchets — lingering on each minute's detent,
 * crossing to the next with a click — rubber-bands past 0 and the top of the
 * scale, and lands on the nearest detent on the snap spring when let go,
 * which starts it, as a real one does. While it runs the dial turns back to
 * zero, stepping once a second on the flick spring as the escapement rocks
 * (or, with `ticking` off, sweeping back silently), and a red band shows the
 * time left. At zero the shell shakes about its feet and the bell rings. A
 * tap pauses and resumes it.
 *
 * The dial is a slider in whole minutes: arrows add or take a minute, Page
 * keys five, Home clears it and End sets the whole scale; like a hand on the
 * dial, a held key holds the count, and letting go starts it. Space or Enter
 * pauses. The count runs from a deadline, so it keeps real time behind a
 * hidden page; its once-a-second steps only run on screen. It is silent until
 * someone sets it. Under reduced motion nothing springs, rocks or shakes:
 * the dial jumps to each detent and second, and the bell's marks still flare.
 */
export function EggTimer({
  value,
  defaultValue = 0,
  onValueChange,
  running,
  defaultRunning = false,
  onRunningChange,
  onRing,
  max = 60,
  shell = "lemon",
  ticking = true,
  label = "Timer",
  sound = false,
  disabled = false,
  className,
}: EggTimerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const shellId = `egg-shell-${uid}`;
  const hintId = `egg-hint-${uid}`;
  const scale = Math.round(clamp(max, 1, 120));
  const top = scale * 60;
  const dpm = SPAN / scale;
  const angleOf = (seconds: number) => (seconds / 60) * dpm;
  const paint = SHELLS[shell] ?? SHELLS.lemon;

  const [ownSecs, setOwnSecs] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, top),
  );
  const [ownRun, setOwnRun] = React.useState(defaultRunning);
  const [holding, setHolding] = React.useState(false);
  const [rang, setRang] = React.useState(false);
  const [check, setCheck] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const controlledValue = value !== undefined;
  const controlledRun = running !== undefined;
  const secs = clamp(Math.round(controlledValue ? value : ownSecs), 0, top);
  const isRunning = (controlledRun ? running : ownRun) && secs > 0;
  // The bell's state lasts only while the count is at zero: a host that
  // restarts the timer has moved past it.
  const ringing = rang && secs === 0;

  const turn = useMotionValue(angleOf(secs));
  const lever = useMotionValue(0);
  const shake = useMotionValue(0);
  const press = useMotionValue(1);
  const ringOn = useMotionValue(0);

  const engine = React.useRef<Engine>({
    deadline: null,
    rem: secs,
    reported: secs,
    runReported: isRunning,
    chain: 0,
    ringTimer: 0,
    chimes: [],
    visible: true,
  });
  const held = React.useRef(false);
  const heldByKey = React.useRef(false);
  const changed = React.useRef(false);
  const armed = React.useRef(false);
  const mounted = React.useRef(false);
  const drag = React.useRef({ last: 0, start: 0, accum: 0, detent: 0 });
  const leverSide = React.useRef(1);
  const turning = React.useRef<AnimationPlaybackControls | null>(null);
  const effects = React.useRef(new Set<AnimationPlaybackControls>());
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const announce = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /** The shake, the lever, the press and the ring marks: kept so they stop with the timer. */
  const play = (controls: AnimationPlaybackControls) => {
    const running = effects.current;
    running.add(controls);
    void controls.finished.then(() => running.delete(controls));
    // One interrupted by the next (a lever rocked again) may never finish;
    // the oldest reference goes rather than piling up over a long run.
    if (running.size > 12) {
      const oldest = running.values().next().value;
      if (oldest) running.delete(oldest);
    }
  };

  const dialTo = (
    seconds: number,
    how: "set" | "flick" | "snap" | "glide" | { linear: number },
  ) => {
    turning.current?.stop();
    turning.current = null;
    const to = r2(angleOf(seconds));
    if (how === "set" || !motionSafe) {
      turn.set(to);
      return;
    }
    turning.current = animate(
      turn,
      to,
      typeof how === "object"
        ? { duration: how.linear, ease: "linear" }
        : springs[how],
    );
  };

  const report = (s: number) => {
    const e = engine.current;
    if (s === e.reported) return;
    e.reported = s;
    if (!controlledValue) setOwnSecs(s);
    onValueChange?.(s);
    // A controlled host answers on its own schedule; once it has had its
    // turn, a host that refused gets its own value back.
    if (controlledValue) React.startTransition(() => setCheck((c) => c + 1));
  };

  const setRunningTo = (next: boolean) => {
    const e = engine.current;
    if (next === e.runReported) return;
    e.runReported = next;
    if (!controlledRun) setOwnRun(next);
    onRunningChange?.(next);
  };

  const remainingNow = () => {
    const e = engine.current;
    if (e.deadline === null) return e.rem;
    return Math.max(0, (e.deadline - clockNow()) / 1000);
  };

  const clearChain = () => {
    const e = engine.current;
    if (e.chain) window.clearTimeout(e.chain);
    e.chain = 0;
  };

  /** Waits for the next whole second, sweeping the dial toward it if it does not tick. */
  const schedule = () => {
    clearChain();
    const e = engine.current;
    if (e.deadline === null || !e.visible || document.hidden) return;
    const left = (e.deadline - clockNow()) / 1000;
    if (left <= 0.02) {
      ring();
      return;
    }
    const whole = Math.ceil(left - 1e-6);
    const delay = Math.max(16, (left - (whole - 1)) * 1000);
    if (!ticking && motionSafe) dialTo(whole - 1, { linear: delay / 1000 });
    e.chain = window.setTimeout(() => api.current?.stepTick(), delay);
  };

  /** One second gone: the reading, the dial's step and the escapement. */
  const stepTick = () => {
    const e = engine.current;
    e.chain = 0;
    if (e.deadline === null) return;
    const left = (e.deadline - clockNow()) / 1000;
    if (left <= 0.02) {
      ring();
      return;
    }
    const whole = Math.ceil(left - 1e-6);
    report(whole);
    if (ticking) {
      dialTo(whole, "flick");
      leverSide.current = -leverSide.current;
      if (motionSafe)
        play(animate(lever, 22 * leverSide.current, springs.snap));
      if (armed.current) {
        audio.play("tick", {
          pitch: leverSide.current > 0 ? 1 : 0.84,
          gain: 0.22,
        });
      }
    } else if (!motionSafe) {
      dialTo(whole, "set");
    }
    schedule();
  };

  /** Back on screen: catch the reading and the dial up, then carry on. */
  const resume = () => {
    const e = engine.current;
    if (e.deadline === null) return;
    const left = (e.deadline - clockNow()) / 1000;
    if (left <= 0.02) {
      ring();
      return;
    }
    const whole = Math.ceil(left - 1e-6);
    report(whole);
    dialTo(ticking ? whole : left, "set");
    schedule();
  };

  const begin = () => {
    const e = engine.current;
    if (e.deadline !== null || e.rem <= 0) return;
    e.deadline = clockNow() + e.rem * 1000;
    if (e.ringTimer) window.clearTimeout(e.ringTimer);
    // The bell is its own timeout, so it rings on time behind a hidden page
    // even though the once-a-second steps are resting.
    e.ringTimer = window.setTimeout(
      () => api.current?.ring(),
      e.rem * 1000 + 20,
    );
    schedule();
  };

  const pause = () => {
    const e = engine.current;
    if (e.deadline === null) return;
    e.rem = remainingNow();
    e.deadline = null;
    clearChain();
    if (e.ringTimer) window.clearTimeout(e.ringTimer);
    e.ringTimer = 0;
    turning.current?.stop();
    turning.current = null;
  };

  const ring = () => {
    const e = engine.current;
    if (e.deadline === null) return;
    e.deadline = null;
    e.rem = 0;
    clearChain();
    if (e.ringTimer) window.clearTimeout(e.ringTimer);
    e.ringTimer = 0;
    report(0);
    setRunningTo(false);
    setRang(true);
    dialTo(0, "flick");
    for (const t of e.chimes) window.clearTimeout(t);
    e.chimes = [];
    if (motionSafe) {
      // A keyframed rattle about the feet: a tween, since a spring takes
      // only two keyframes.
      play(
        animate(shake, [0, -6, 5.5, -5, 4.5, -3.5, 2.5, -1.5, 0], {
          duration: 0.9,
          ease: "easeInOut",
        }),
      );
    }
    play(
      animate(ringOn, [0, 1, 1, 0], { duration: 1.2, times: [0, 0.1, 0.7, 1] }),
    );
    if (armed.current) {
      e.chimes = [0, 280, 560].map((at, i) =>
        window.setTimeout(
          () => audio.play("chime", { pitch: i === 1 ? 1.06 : 1, gain: 0.55 }),
          at,
        ),
      );
    }
    onRing?.();
    announce(`${label}: time is up.`);
  };

  React.useEffect(() => {
    api.current = { stepTick, ring, resume, pause };
  });

  // The count follows the value and the running state, whoever set them. A
  // value that is not this timer's own report is the host's: the dial glides
  // there, and a running count restarts from it.
  React.useEffect(() => {
    const e = engine.current;
    const now = api.current;
    if (!now) return;
    if (secs !== e.reported) {
      e.reported = secs;
      e.rem = secs;
      if (mounted.current) armed.current = true;
      if (e.deadline !== null) {
        now.pause();
        e.rem = secs;
      }
      if (!held.current) dialTo(secs, "glide");
    }
    if (isRunning !== e.runReported) {
      e.runReported = isRunning;
      if (mounted.current) armed.current = true;
    }
    const want = isRunning && !holding && e.rem > 0;
    if (want && e.deadline === null) begin();
    else if (!want && e.deadline !== null) now.pause();
    // dialTo and begin read the latest values through the engine ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, isRunning, holding, check]);

  // A new scale moves every mark: the dial goes to the same time on it.
  React.useEffect(() => {
    if (held.current) return;
    const e = engine.current;
    turning.current?.stop();
    turn.set(r2(((e.deadline === null ? e.rem : remainingNow()) / 60) * dpm));
  }, [dpm, turn]);

  // Mounted from here on: a host change after this is someone's request.
  // On the way out (and in StrictMode's rehearsal) everything stops, keeping
  // the time left so a remount carries on from it.
  React.useEffect(() => {
    mounted.current = true;
    const e = engine.current;
    const running = effects.current;
    return () => {
      mounted.current = false;
      turning.current?.stop();
      turning.current = null;
      for (const c of running) c.stop();
      running.clear();
      if (e.deadline !== null) {
        e.rem = Math.max(0, (e.deadline - clockNow()) / 1000);
        e.deadline = null;
      }
      if (e.chain) window.clearTimeout(e.chain);
      if (e.ringTimer) window.clearTimeout(e.ringTimer);
      for (const t of e.chimes) window.clearTimeout(t);
      e.chain = 0;
      e.ringTimer = 0;
      e.chimes = [];
    };
  }, []);

  React.useEffect(() => {
    const e = engine.current;
    const onVisibility = () => {
      if (document.hidden) {
        if (e.chain) window.clearTimeout(e.chain);
        e.chain = 0;
      } else api.current?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Off screen the once-a-second steps rest; the deadline keeps the time.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const e = engine.current;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const visible = Boolean(entry?.isIntersecting);
      if (visible === e.visible) return;
      e.visible = visible;
      if (!visible) {
        if (e.chain) window.clearTimeout(e.chain);
        e.chain = 0;
      } else api.current?.resume();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const toggle = () => {
    if (disabled) return;
    armed.current = true;
    if (ringing) {
      // A press during the ring quiets it: the rattle, the marks and any
      // chime still to come stop, and there is nothing left to pause.
      quiet();
      setRang(false);
      return;
    }
    if (secs <= 0) {
      if (motionSafe) {
        play(
          animate(shake, [0, -2.5, 2.5, -1.5, 0], {
            duration: 0.32,
            ease: "easeInOut",
          }),
        );
      }
      return;
    }
    if (motionSafe) {
      play(animate(press, [1, 0.93, 1], { duration: 0.2, ease: easings.move }));
    }
    const next = !isRunning;
    // The engine stops or starts in step with the state, and the spoken
    // time is read from it now.
    const left = Math.ceil(remainingNow() - 1e-6);
    setRunningTo(next);
    announce(
      next ? `Running, ${spoken(left)} left.` : `Paused, ${spoken(left)} left.`,
    );
  };

  const quiet = () => {
    const e = engine.current;
    for (const t of e.chimes) window.clearTimeout(t);
    e.chimes = [];
    for (const c of effects.current) c.stop();
    effects.current.clear();
    shake.set(0);
    ringOn.set(0);
  };

  const angleAt = (x: number, y: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const cx = rect.left + (CX / W) * rect.width;
    const cy = rect.top + (CY / W) * rect.height;
    return Math.atan2(x - cx, -(y - cy)) / RAD;
  };

  const grab = () => {
    armed.current = true;
    held.current = true;
    setHolding(true);
    if (ringing) {
      quiet();
      setRang(false);
    }
    const e = engine.current;
    if (e.deadline !== null) pause();
    turning.current?.stop();
    turning.current = null;
  };

  const letGo = () => {
    held.current = false;
    setHolding(false);
  };

  const dialDrag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => {
      grab();
      const d = drag.current;
      d.last = angleAt(point.x, point.y);
      d.start = turn.get();
      d.accum = 0;
      d.detent = Math.round(engine.current.rem / 60);
    },
    onMove: ({ point }) => {
      const d = drag.current;
      const a = angleAt(point.x, point.y);
      d.accum += norm(a - d.last);
      d.last = a;
      const raw = d.start + d.accum;
      const shown =
        raw < 0
          ? rubberband(raw, 30)
          : raw > SPAN
            ? SPAN + rubberband(raw - SPAN, 30)
            : ratchet(raw / dpm) * dpm;
      turn.set(r2(shown));
      const minute = clamp(Math.round(raw / dpm), 0, scale);
      if (minute !== d.detent) {
        d.detent = minute;
        engine.current.rem = minute * 60;
        report(minute * 60);
        audio.play("detent", {
          pitch: r2(0.8 + (0.6 * minute) / scale),
          gain: 0.5,
        });
      }
    },
    onEnd: () => {
      const d = drag.current;
      const s = d.detent * 60;
      engine.current.rem = s;
      report(s);
      // A ratchet does not coast: it lands on the detent under the hand.
      dialTo(s, "snap");
      letGo();
      setRunningTo(s > 0);
      announce(s > 0 ? `Set for ${spoken(s)}. Running.` : "Timer cleared.");
    },
    onCancel: () => {
      dialTo(engine.current.rem, "glide");
      letGo();
    },
    onTap: () => toggle(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) toggle();
      return;
    }
    const steps: Record<string, (base: number) => number> = {
      ArrowUp: (b) => (Math.floor(b / 60 + 1e-6) + 1) * 60,
      ArrowRight: (b) => (Math.floor(b / 60 + 1e-6) + 1) * 60,
      ArrowDown: (b) => (Math.ceil(b / 60 - 1e-6) - 1) * 60,
      ArrowLeft: (b) => (Math.ceil(b / 60 - 1e-6) - 1) * 60,
      PageUp: (b) => (Math.floor(b / 60 + 1e-6) + 5) * 60,
      PageDown: (b) => (Math.ceil(b / 60 - 1e-6) - 5) * 60,
      Home: () => 0,
      End: () => top,
    };
    const stepFor = steps[event.key];
    if (!stepFor) return;
    event.preventDefault();
    // A held key is a hand on the dial: the count waits until it lets go.
    if (!held.current) {
      grab();
      heldByKey.current = true;
    }
    const e = engine.current;
    const next = clamp(stepFor(e.rem), 0, top);
    if (next === e.rem) return;
    e.rem = next;
    changed.current = true;
    report(next);
    dialTo(next, "snap");
    audio.play("detent", {
      pitch: r2(0.8 + (0.6 * next) / top),
      gain: 0.5,
    });
  };

  const releaseKey = () => {
    if (!heldByKey.current) return;
    heldByKey.current = false;
    letGo();
    if (changed.current) {
      changed.current = false;
      setRunningTo(engine.current.rem > 0);
    }
  };

  const band = useTransform(turn, (t) => bandPath(Math.max(0, t)));

  const ticks: { a: number; major: boolean }[] = [];
  for (let m = 0; m <= scale; m += 1) {
    ticks.push({ a: r2(-m * dpm), major: m % 5 === 0 });
  }
  const every = scale > 30 ? 10 : 5;
  const numbers: { m: number; x: number; y: number; a: number }[] = [];
  for (let m = 0; m <= scale; m += every) {
    const a = -m * dpm;
    numbers.push({
      m,
      a: r2(a),
      x: r2(CX + 35 * Math.sin(a * RAD)),
      y: r2(CY - 35 * Math.cos(a * RAD)),
    });
  }

  const minutesLeft = Math.ceil(secs / 60);
  const stateText = holding
    ? "Setting"
    : ringing
      ? "Time's up"
      : isRunning
        ? "Running"
        : secs > 0
          ? "Paused"
          : "Set a time";
  const valueText =
    secs > 0
      ? `${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"} left, ${isRunning ? "running" : "paused"}`
      : "No time set";

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-4 text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} timer`}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={minutesLeft}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onKeyUp={releaseKey}
        onBlur={releaseKey}
        {...dialDrag}
        className={cn(
          "relative size-37 shrink-0 touch-none rounded-full outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : holding
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
      >
        <svg
          ref={svgRef}
          aria-hidden
          viewBox={`0 0 ${W} ${W}`}
          className="block size-full overflow-visible"
        >
          <defs>
            <radialGradient id={shellId} cx={0.38} cy={0.32} r={0.75}>
              <stop offset={0} style={{ stopColor: paint.light }} />
              <stop offset={0.55} style={{ stopColor: paint.base }} />
              <stop offset={1} style={{ stopColor: paint.dark }} />
            </radialGradient>
          </defs>

          <motion.g
            className="stroke-ink-2"
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
            style={{ opacity: ringOn }}
          >
            {[72, 80].map((r) => (
              <React.Fragment key={r}>
                <path
                  d={`M ${r2(CX - r * Math.sin(62 * RAD))} ${r2(CY - r * Math.cos(62 * RAD))} A ${r} ${r} 0 0 1 ${r2(CX - r * Math.sin(44 * RAD))} ${r2(CY - r * Math.cos(44 * RAD))}`}
                />
                <path
                  d={`M ${r2(CX + r * Math.sin(44 * RAD))} ${r2(CY - r * Math.cos(44 * RAD))} A ${r} ${r} 0 0 1 ${r2(CX + r * Math.sin(62 * RAD))} ${r2(CY - r * Math.cos(62 * RAD))}`}
                />
              </React.Fragment>
            ))}
          </motion.g>

          <motion.g style={{ rotate: shake, originX: 0.5, originY: 1 }}>
            {[61, 115].map((x) => (
              <rect
                key={x}
                x={x - 10}
                y={138}
                width={20}
                height={19}
                rx={6}
                style={{ fill: paint.dark }}
              />
            ))}
            <circle cx={CX} cy={CY} r={BODY} fill={`url(#${shellId})`} />
            <circle
              cx={CX}
              cy={CY}
              r={BODY - 0.75}
              fill="none"
              strokeWidth={1.5}
              opacity={0.5}
              style={{ stroke: paint.dark }}
            />
            <circle
              cx={CX}
              cy={CY}
              r={DIAL + 1.5}
              style={{ fill: paint.dark }}
              opacity={0.55}
            />
            <circle cx={CX} cy={CY} r={DIAL} style={{ fill: FACE }} />
            <motion.path
              d={band}
              fill="none"
              strokeWidth={6}
              opacity={0.8}
              style={{ stroke: RED }}
            />

            <motion.g style={{ rotate: turn, originX: 0.5, originY: 0.5 }}>
              <circle cx={CX} cy={CY} r={DIAL} fill="none" />
              <g strokeLinecap="round" style={{ stroke: INK }}>
                {ticks.map((t) => (
                  <line
                    key={t.a}
                    x1={CX}
                    x2={CX}
                    y1={CY - (t.major ? 40.5 : 44)}
                    y2={CY - 49.5}
                    strokeWidth={t.major ? 1.6 : 0.9}
                    transform={`rotate(${t.a} ${CX} ${CY})`}
                  />
                ))}
              </g>
              <g
                className="font-sans"
                fontSize={10.5}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: INK }}
              >
                {numbers.map((n) => (
                  <text
                    key={n.m}
                    x={n.x}
                    y={n.y}
                    transform={`rotate(${n.a} ${n.x} ${n.y})`}
                  >
                    {n.m}
                  </text>
                ))}
              </g>
              <motion.g style={{ scale: press, originX: 0.5, originY: 0.5 }}>
                <rect
                  x={CX - 7}
                  y={CY - 27}
                  width={14}
                  height={54}
                  rx={7}
                  style={{ fill: paint.dark }}
                />
                <rect
                  x={CX - 5}
                  y={CY - 25}
                  width={10}
                  height={50}
                  rx={5}
                  fill={`url(#${shellId})`}
                />
                <circle cx={CX} cy={CY} r={3.2} style={{ fill: paint.dark }} />
              </motion.g>
            </motion.g>

            <path
              d={`M ${CX - 6} ${CY - BODY + 3} L ${CX + 6} ${CY - BODY + 3} L ${CX} ${CY - DIAL + 2} Z`}
              strokeLinejoin="round"
              strokeWidth={1.5}
              style={{ fill: RED, stroke: RED }}
            />

            <rect
              x={CX - 10}
              y={CY + DIAL + 3}
              width={20}
              height={8}
              rx={4}
              style={{ fill: SLOT }}
            />
            <motion.rect
              x={CX - 0.9}
              y={CY + DIAL + 3.5}
              width={1.8}
              height={7}
              rx={0.9}
              style={{
                fill: BRASS,
                rotate: lever,
                originX: 0.5,
                originY: 1,
              }}
            />
          </motion.g>
        </svg>
      </div>

      <div className="flex min-w-0 flex-col items-start gap-1">
        <p
          className="max-w-full truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          title={label}
        >
          {label}
        </p>
        <p
          role="timer"
          className="font-mono text-3xl leading-none text-foreground tabular-nums"
        >
          {clockOf(secs)}
        </p>
        <p
          className={cn(
            "text-xs",
            ringing ? "font-medium text-danger" : "text-ink-3",
          )}
        >
          {stateText}
        </p>
        <button
          type="button"
          disabled={disabled || secs === 0}
          onClick={() => toggle()}
          className={cn(
            "mt-2 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "enabled:cursor-pointer enabled:hover:bg-surface-2 enabled:hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-3.5 shrink-0"
            fill="currentColor"
          >
            {isRunning ? (
              <path d="M4.5 3h2.2v10H4.5zM9.3 3h2.2v10H9.3z" />
            ) : (
              <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" />
            )}
          </svg>
          {isRunning ? "Pause" : "Start"}
        </button>
      </div>

      <p id={hintId} className="sr-only">
        Turn the dial, or use the arrow keys, to set the minutes; it starts when
        you let go. Space or Enter pauses and resumes.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
