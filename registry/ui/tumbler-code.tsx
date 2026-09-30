"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TumblerCodeMetal = "brass" | "nickel" | "black";

export type TumblerCodeProps = {
  /** What the code is for. The visible label, and the name of the group of cells. */
  label: string;
  /** Controlled code: digits only, never longer than `length`. */
  value?: string;
  /** Initial code when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from the key, paste or refusal that changed the code, with the new digits. */
  onValueChange?: (value: string) => void;
  /** How many digits, and so how many pins the cylinder has, 4 to 8. @default 6 */
  length?: number;
  /** The metal of the housing, the plug and the face. The pins stay nickel over brass. @default "brass" */
  brass?: TumblerCodeMetal;
  /** Check the code when its last digit lands, and turn or refuse the lock. Needs `check`. @default true */
  verify?: boolean;
  /** The host's verifier: true opens the lock, false drops the pins. A promise holds the plug in a test turn until it settles; a rejected one leaves the pins where they are. */
  check?: (code: string) => boolean | Promise<boolean>;
  /** Fires from the key or paste that filled the last cell, with the whole code. */
  onComplete?: (code: string) => void;
  /** Fires once `check` has answered, before the lock turns or the pins drop. */
  onResult?: (accepted: boolean, code: string) => void;
  /** The form field name. A hidden input carries the code under it. */
  name?: string;
  /** Helper text under the cells. */
  hint?: string;
  /** What is wrong, in a sentence, from the host. Shown under the cells and announced once. */
  error?: string | null;
  /** What a refused code says. @default "That code didn't turn the lock. Try again." */
  wrongText?: string;
  required?: boolean;
  /** Play the pins, the plug's clunk and the refusal. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The most pins a cylinder is drawn with; motion values are made for all of them once. */
const MOST = 8;
const FEWEST = 4;

/*
 * The drawing, in viewBox units. The face (the cylinder's round end) takes the
 * first FACE units; each pin stack a column of PITCH. Everything is measured
 * from the top: the housing holds the springs and driver pins, the shear line
 * is where housing meets plug, and the key pins ride in the plug.
 */
const FACE = 56;
const PITCH = 44;
const H = 106;
const TOP = 4;
const BORE_TOP = 8;
const SHEAR = 58;
const PLUG_BOTTOM = 102;
const AXIS = (SHEAR + PLUG_BOTTOM) / 2;
const KEY_LEN = 20;
const DRIVER_LEN = 24;
/** The split (nickel on brass) with no digit under it: the driver pin blocks the shear line. */
const REST = PLUG_BOTTOM - 6 - KEY_LEN;
/** One digit of lift. Heights sit half a step off the shear line, so no digit aligns by chance. */
const STEP = 3.4;
const FX = 28;

const r2 = (v: number) => Math.round(v * 100) / 100;
const splitOf = (digit: number) => r2(SHEAR + (4.5 - digit) * STEP);

type Metal = { hi: string; body: string; lo: string; edge: string };

// Pigments, not text tokens: a cylinder is an object and must look like the
// same metal on a light page and a dark one.
const METALS: Record<TumblerCodeMetal, Metal> = {
  brass: {
    hi: "oklch(0.9 0.09 90)",
    body: "oklch(0.77 0.12 82)",
    lo: "oklch(0.58 0.1 72)",
    edge: "oklch(0.48 0.08 66)",
  },
  nickel: {
    hi: "oklch(0.95 0.005 250)",
    body: "oklch(0.8 0.01 250)",
    lo: "oklch(0.62 0.012 250)",
    edge: "oklch(0.48 0.012 250)",
  },
  black: {
    hi: "oklch(0.52 0.012 260)",
    body: "oklch(0.36 0.012 260)",
    lo: "oklch(0.26 0.01 260)",
    edge: "oklch(0.18 0.01 260)",
  },
};
const BORE = "oklch(0.2 0.012 260)";
const KEY_PIN = { fill: "oklch(0.82 0.13 84)", edge: "oklch(0.55 0.1 70)" };
const DRIVER_PIN = {
  fill: "oklch(0.88 0.008 250)",
  edge: "oklch(0.52 0.012 250)",
};
const COIL = "oklch(0.74 0.012 250)";
const OPEN = "oklch(from var(--success) 0.78 c h)";

/** The face's housing: a round body with the pin bible rising out of it. */
const FACE_PATH =
  "M 16 60.37 L 16 14 Q 16 6 24 6 L 32 6 Q 40 6 40 14 L 40 60.37 A 23 23 0 1 1 16 60.37 Z";
/** A warded keyway, centred on the plug's axis. */
const KEYWAY =
  "M -2 -13 L 2 -13 L 2 -6 L 3.6 -3.5 L 2 -1 L 2 13 L -2 13 L -2 4 L -3.6 1.5 L -2 -1 Z";

type Pin = { split: MotionValue<number>; shake: MotionValue<number> };
type Phase = "idle" | "checking" | "open" | "refused";

const isThenable = (v: unknown): v is PromiseLike<boolean> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

/**
 * One pin stack, rebuilt every frame from its split, its shake and the
 * plug's turn: the coil compresses as the driver rises, and once the plug
 * turns the key pins fold toward its axis by the cosine of the angle, the way
 * a pin pointing at you shortens, until only its end shows.
 */
function PinStack({
  cx,
  pin,
  turn,
  focused,
}: {
  cx: number;
  pin: Pin;
  turn: MotionValue<number>;
  focused: boolean;
}) {
  const shape = useTransform(
    [pin.split, pin.shake, turn] as MotionValue<number>[],
    ([s = REST, k = 0, t = 0]: number[]) => {
      const at = s + k;
      const angle = (Math.min(90, Math.max(0, t)) * Math.PI) / 180;
      const c = Math.cos(angle);
      const fold = (y: number) => r2(AXIS + (y - AXIS) * c);
      const top = BORE_TOP + 1;
      const end = at - DRIVER_LEN;
      const turns = 6;
      let coil = `M 0 ${r2(top)}`;
      for (let j = 1; j < turns * 2; j += 1) {
        const y = top + ((end - top) * j) / (turns * 2);
        coil += ` L ${j % 2 ? 4.2 : -4.2} ${r2(y)}`;
      }
      coil += ` L 0 ${r2(end)}`;
      const bottom = at + KEY_LEN;
      return {
        coil,
        driver: `M -5 ${r2(end + 1.5)} Q -5 ${r2(end)} -3.5 ${r2(end)} L 3.5 ${r2(end)} Q 5 ${r2(end)} 5 ${r2(end + 1.5)} L 5 ${r2(at)} L -5 ${r2(at)} Z`,
        key: `M -5 ${fold(at)} L 5 ${fold(at)} L 5 ${fold(bottom - 4)} L 1.6 ${fold(bottom)} L -1.6 ${fold(bottom)} L -5 ${fold(bottom - 4)} Z`,
        bore: `M -6 ${fold(SHEAR)} L 6 ${fold(SHEAR)} L 6 ${fold(PLUG_BOTTOM - 6)} L -6 ${fold(PLUG_BOTTOM - 6)} Z`,
        end: r2(Math.sin(angle) ** 2),
      };
    },
  );
  const coil = useTransform(shape, (g) => g.coil);
  const driver = useTransform(shape, (g) => g.driver);
  const key = useTransform(shape, (g) => g.key);
  const bore = useTransform(shape, (g) => g.bore);
  const end = useTransform(shape, (g) => g.end);

  return (
    <g transform={`translate(${cx} 0)`}>
      <rect
        x={-6}
        y={BORE_TOP}
        width={12}
        height={SHEAR - BORE_TOP}
        fill={BORE}
      />
      <motion.path d={bore} fill={BORE} />
      <rect
        x={-7.5}
        y={BORE_TOP - 1.5}
        width={15}
        height={PLUG_BOTTOM - BORE_TOP - 3}
        rx={3}
        fill="none"
        strokeWidth={1.5}
        className={cn(
          "stroke-cobalt-bright transition-opacity",
          focused ? "opacity-100" : "opacity-0",
        )}
      />
      <motion.path
        d={coil}
        fill="none"
        stroke={COIL}
        strokeWidth={1.3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <motion.path
        d={driver}
        fill={DRIVER_PIN.fill}
        stroke={DRIVER_PIN.edge}
        strokeWidth={0.8}
      />
      <motion.path
        d={key}
        fill={KEY_PIN.fill}
        stroke={KEY_PIN.edge}
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
      <motion.g style={{ opacity: end }}>
        <circle cy={AXIS} r={6.5} fill={BORE} />
        <circle
          cy={AXIS}
          r={5}
          fill={KEY_PIN.fill}
          stroke={KEY_PIN.edge}
          strokeWidth={0.8}
        />
      </motion.g>
    </g>
  );
}

/**
 * A one-time-code field drawn as a pin-tumbler lock. Each digit raises its
 * pin stack on the snap spring to a height set by the digit, compressing the
 * spring above it; a paste raises them left to right in a sweep. When the
 * last digit lands and `check` accepts the code, every split glides onto the
 * shear line, the line flashes, and the plug turns a quarter on snap with a
 * clunk — the face's keyway turns and the key pins fold away in the cutaway.
 * A refused code jiggles the pins, drops them on the recoil spring so they
 * bounce as they land, and clears the cells.
 *
 * The cells are real inputs, one per digit, in one tab stop: digits type
 * straight in and advance, Backspace and Delete remove, arrows and Home/End
 * move, and a paste or the platform's one-time-code autofill fills them all.
 * Under reduced motion every pin takes its height, alignment or rest at once
 * and the plug's open state is a swap; the words under the cells still say
 * what happened.
 */
export function TumblerCode({
  label,
  value,
  defaultValue = "",
  onValueChange,
  length = 6,
  brass = "brass",
  verify = true,
  check,
  onComplete,
  onResult,
  name,
  hint,
  error,
  wrongText = "That code didn't turn the lock. Try again.",
  required = false,
  sound = false,
  disabled = false,
  className,
}: TumblerCodeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const cellId = (i: number) => `${uid}-cell-${i}`;
  const housingId = `tumbler-housing-${safeId}`;
  const plugId = `tumbler-plug-${safeId}`;
  const faceId = `tumbler-face-${safeId}`;
  const n = Math.min(MOST, Math.max(FEWEST, Math.round(length)));
  const metal = METALS[brass] ?? METALS.brass;
  const W = FACE + n * PITCH;

  const [own, setOwn] = React.useState(() =>
    defaultValue.replace(/\D/g, "").slice(0, MOST),
  );
  const controlled = value !== undefined;
  const code = (value ?? own).replace(/\D/g, "").slice(0, n);

  // The lock's state belongs to the code it was reached with: typing a new
  // digit is enough to put it back to idle, with no effect to watch for it.
  const [status, setStatus] = React.useState<{ code: string; phase: Phase }>({
    code: "",
    phase: "idle",
  });
  const phase: Phase = status.code === code ? status.phase : "idle";
  const [refusals, setRefusals] = React.useState(0);
  const [focusAt, setFocusAt] = React.useState<number | null>(null);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [seenError, setSeenError] = React.useState(error ?? null);
  if ((error ?? null) !== seenError) {
    setSeenError(error ?? null);
    if (error) setSaid((s) => ({ n: s.n + 1, text: error }));
  }

  const [pins] = React.useState<Pin[]>(() =>
    Array.from({ length: MOST }, (_, i) => {
      const ch = (value ?? defaultValue).replace(/\D/g, "")[i];
      return {
        split: motionValue(
          ch !== undefined && i < n ? splitOf(Number(ch)) : REST,
        ),
        shake: motionValue(0),
      };
    }),
  );
  const shown = React.useRef<number[]>(pins.map((p) => p.split.get()));
  const turn = useMotionValue(0);
  const flash = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cells = React.useRef<(HTMLInputElement | null)[]>([]);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const token = React.useRef(0);
  const opened = React.useRef(false);
  const clunk = React.useRef(false);
  // The code as the visitor last left it. Keys can arrive faster than
  // renders (and focusing the next cell runs its handler at once), so the
  // handlers read this, set the moment a change is made, not the render's.
  const live = React.useRef(code);
  const intent = React.useRef<{ sweep: boolean; audible: boolean } | null>(
    null,
  );
  // Timers and a pending check answer later than the render that asked:
  // they call through this, so they always reach the latest props.
  const api = React.useRef<{
    settle: (t: number, checked: string, ok: boolean) => void;
    drop: () => void;
    abandon: (t: number, checked: string) => void;
  } | null>(null);

  React.useEffect(() => {
    live.current = code;
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const panOf = (i: number) => {
    const rect = cells.current[i]?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const focusCell = (i: number) => {
    const node = cells.current[Math.max(0, Math.min(n - 1, i))];
    node?.focus({ preventScroll: true });
    node?.select();
  };

  /** One pin to a new split: up on snap (it is spring-loaded), a click as it arrives. */
  const move = (
    i: number,
    target: number,
    delay: number,
    voice: number | null,
  ) => {
    const pin = pins[i];
    if (!pin) return;
    if (!motionSafe) {
      anims.current.get(`pin-${i}`)?.stop();
      pin.split.set(target);
    } else {
      run(`pin-${i}`, animate(pin.split, target, { ...springs.snap, delay }));
    }
    if (voice === null) return;
    const play = () =>
      audio.play("click", {
        pitch: r2(voice < 0 ? 0.62 : 0.8 + voice * 0.05),
        gain: voice < 0 ? 0.32 : 0.5,
        pan: panOf(i),
      });
    if (motionSafe && delay > 0) later(delay * 1000, play);
    else play();
  };

  /** Turns the plug back to locked and puts the shear line out. */
  const relock = () => {
    opened.current = false;
    clunk.current = false;
    if (!motionSafe) {
      anims.current.get("turn")?.stop();
      turn.set(0);
      flash.set(0);
      return;
    }
    run("turn", animate(turn, 0, springs.snap));
    run(
      "flash",
      animate(flash, 0, { duration: durations.fast, ease: easings.exit }),
    );
  };

  // The pins follow the code, whoever changed it. A change the visitor made
  // leaves an intent behind — a sweep for a paste, and permission to sound —
  // so a host that resets the field moves the pins in silence.
  React.useEffect(() => {
    const plan = intent.current;
    intent.current = null;
    const stagger = plan?.sweep && motionSafe ? cascade(n) : 0;
    let lead = 0;
    if (opened.current) {
      relock();
      lead = motionSafe ? 0.14 : 0;
    }
    let order = 0;
    for (let i = 0; i < MOST; i += 1) {
      const ch = i < n ? code[i] : undefined;
      const target = ch !== undefined ? splitOf(Number(ch)) : REST;
      if (shown.current[i] === target) continue;
      const rising = ch !== undefined;
      shown.current[i] = target;
      const voice = plan?.audible && i < n ? (rising ? Number(ch) : -1) : null;
      move(i, target, lead + (rising ? order++ * stagger : 0), voice);
    }
    // Only the code and the pin count move pins; the helpers are fresh every
    // render and read what they need from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, n]);

  // The clunk is heard where it happens: as the plug reaches the end of its
  // quarter turn, not when the turn is asked for.
  React.useEffect(
    () =>
      turn.on("change", (t) => {
        if (clunk.current && t >= 84) {
          clunk.current = false;
          audio.play("snap", { pitch: 0.72, gain: 0.7 });
        }
      }),
    [turn, audio],
  );

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      token.current += 1;
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const accept = (accepted: string) => {
    setStatus({ code: accepted, phase: "open" });
    say("Code accepted. The lock is open.");
    opened.current = true;
    clunk.current = true;
    const stagger = cascade(n);
    for (let i = 0; i < n; i += 1) {
      const pin = pins[i];
      if (!pin) continue;
      shown.current[i] = SHEAR;
      if (!motionSafe) {
        anims.current.get(`pin-${i}`)?.stop();
        pin.split.set(SHEAR);
      } else {
        run(
          `pin-${i}`,
          animate(pin.split, SHEAR, { ...springs.glide, delay: i * stagger }),
        );
      }
    }
    if (!motionSafe) {
      run(
        "flash",
        animate(flash, 1, { duration: durations.fast, ease: easings.enter }),
      );
      anims.current.get("turn")?.stop();
      turn.set(90);
      return;
    }
    const aligned = (n - 1) * stagger + 0.3;
    run(
      "flash",
      animate(flash, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: aligned - 0.1,
      }),
    );
    later(aligned * 1000, () => {
      if (!opened.current) return;
      run("turn", animate(turn, 90, springs.snap));
    });
  };

  const refuse = () => {
    setRefusals((r) => r + 1);
    say(wrongText);
    audio.play("shrug", { gain: 0.6 });
    clunk.current = false;
    if (!motionSafe) {
      anims.current.get("turn")?.stop();
      turn.set(0);
      drop();
      return;
    }
    run("turn", animate(turn, 0, springs.flick));
    // A shake of three or more keyframes is a tween: a spring keeps only two.
    for (let i = 0; i < n; i += 1) {
      const pin = pins[i];
      if (!pin) continue;
      const lean = i % 2 ? -1 : 1;
      run(
        `shake-${i}`,
        animate(pin.shake, [0, -2.6 * lean, 2.2 * lean, -1.4 * lean, 0], {
          duration: 0.34,
          ease: easings.move,
          delay: i * 0.02,
        }),
      );
    }
    later(360, () => api.current?.drop());
  };

  /** The refused pins fall home on recoil, and the cells empty. */
  const drop = () => {
    for (let i = 0; i < MOST; i += 1) {
      const pin = pins[i];
      if (!pin) continue;
      shown.current[i] = REST;
      if (!motionSafe) {
        anims.current.get(`pin-${i}`)?.stop();
        pin.split.set(REST);
      } else {
        run(
          `pin-${i}`,
          animate(pin.split, REST, { ...springs.recoil, delay: i * 0.03 }),
        );
      }
    }
    // The pins have already been sent home, so the emptied code finds
    // nothing left to move — and it makes no sound, the visitor did not ask.
    setStatus({ code: "", phase: "refused" });
    intent.current = { sweep: false, audible: false };
    if (!controlled) setOwn("");
    onValueChange?.("");
    if (rootRef.current?.contains(document.activeElement)) focusCell(0);
  };

  const settle = (t: number, checked: string, ok: boolean) => {
    if (t !== token.current || live.current !== checked) return;
    onResult?.(ok, checked);
    if (ok) accept(checked);
    else refuse();
  };

  /** A check that failed to answer leaves the pins where they are. */
  const abandon = (t: number, checked: string) => {
    if (t !== token.current) return;
    setStatus({ code: checked, phase: "idle" });
    run("turn", animate(turn, 0, springs.flick));
  };

  const verifyNow = (full: string, sweep: boolean) => {
    if (!verify || !check) return;
    token.current += 1;
    const t = token.current;
    // Let the last pin land before the lock answers.
    const lead = motionSafe ? (sweep ? (n - 1) * cascade(n) + 0.2 : 0.16) : 0;
    let answer: boolean | PromiseLike<boolean>;
    try {
      answer = check(full);
    } catch {
      answer = false;
    }
    if (!isThenable(answer)) {
      const ok = answer;
      later(lead * 1000, () => api.current?.settle(t, full, ok));
      return;
    }
    setStatus({ code: full, phase: "checking" });
    say("Checking the code.");
    later(lead * 1000, () => {
      if (t !== token.current || !motionSafe) return;
      // The plug tries to turn and binds on the pins until the answer comes.
      run("turn", animate(turn, 7, springs.flick));
    });
    Promise.resolve(answer).then(
      (ok) => api.current?.settle(t, full, Boolean(ok)),
      () => api.current?.abandon(t, full),
    );
  };

  React.useEffect(() => {
    api.current = { settle, drop, abandon };
  });

  /** Every change the visitor makes arrives here, from keys, input and paste. */
  const commit = (raw: string, next: { focus: number; sweep?: boolean }) => {
    if (disabled) return;
    const digits = raw.replace(/\D/g, "").slice(0, n);
    const was = live.current;
    if (digits !== was) {
      live.current = digits;
      token.current += 1;
      clearTimers();
      intent.current = { sweep: Boolean(next.sweep), audible: true };
      if (!controlled) setOwn(digits);
      onValueChange?.(digits);
      if (digits.length === n) {
        onComplete?.(digits);
        verifyNow(digits, Boolean(next.sweep));
      }
    }
    focusCell(next.focus);
  };

  const typeAt = (i: number, digit: string) => {
    const code = live.current;
    const at = Math.min(i, code.length);
    commit(code.slice(0, at) + digit + code.slice(at + 1), {
      focus: Math.min(at + 1, n - 1),
    });
  };

  const fillFrom = (i: number, digits: string) => {
    const code = live.current;
    const from = digits.length >= n ? 0 : Math.min(i, code.length);
    const next = (code.slice(0, from) + digits).slice(0, n);
    commit(next, { focus: Math.min(next.length, n - 1), sweep: true });
  };

  const removeAt = (i: number, focus: number) => {
    const code = live.current;
    if (i < 0 || i >= code.length) {
      focusCell(focus);
      return;
    }
    commit(code.slice(0, i) + code.slice(i + 1), { focus });
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    if (disabled || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    const code = live.current;
    if (/^\d$/.test(key)) {
      event.preventDefault();
      typeAt(i, key);
      return;
    }
    switch (key) {
      case "Backspace":
        event.preventDefault();
        if (i < code.length) removeAt(i, i);
        else removeAt(i - 1, i - 1);
        return;
      case "Delete":
        event.preventDefault();
        removeAt(i, i);
        return;
      case "ArrowLeft":
        event.preventDefault();
        focusCell(i - 1);
        return;
      case "ArrowRight":
        event.preventDefault();
        focusCell(Math.min(i + 1, code.length));
        return;
      case "Home":
        event.preventDefault();
        focusCell(0);
        return;
      case "End":
        event.preventDefault();
        focusCell(code.length);
        return;
    }
    // Anything else printable is not a digit: it never reaches the cell.
    if (key.length === 1) event.preventDefault();
  };

  // Keyboards that do not report their keys (on-screen ones, input methods)
  // and the platform's code autofill arrive as a changed value instead.
  const onChange = (event: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const typed = event.target.value.replace(/\D/g, "");
    const had = live.current[i];
    if (typed.length === 0) {
      removeAt(i, i);
      return;
    }
    if (typed.length === 2 && had !== undefined && typed.includes(had)) {
      typeAt(i, typed[0] === had ? typed.slice(1) : typed.slice(0, 1));
      return;
    }
    if (typed.length === 1) {
      typeAt(i, typed);
      return;
    }
    fillFrom(i, typed);
  };

  const onPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    event.preventDefault();
    if (disabled) return;
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (digits) fillFrom(i, digits);
  };

  const shear = useTransform(
    flash,
    (f) =>
      `color-mix(in oklab, ${OPEN} ${Math.round(Math.min(1, Math.max(0, f)) * 100)}%, ${metal.hi})`,
  );

  const errorText = error || (phase === "refused" ? wrongText : null);
  const message = errorText
    ? "error"
    : phase === "open"
      ? "open"
      : phase === "checking"
        ? "checking"
        : "hint";
  const hasMessage = Boolean(hint) || message !== "hint";
  const describedBy = [hint ? hintId : "", errorText ? errorId : ""]
    .filter(Boolean)
    .join(" ");
  const stop = Math.min(code.length, n - 1);
  const tabStop = focusAt ?? stop;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={labelId}
      aria-busy={phase === "checking" || undefined}
      className={cn(
        "flex w-full flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
      style={{ maxWidth: W }}
    >
      <label
        id={labelId}
        htmlFor={cellId(stop)}
        className="text-sm font-medium text-foreground"
      >
        {label}
      </label>

      <div className="flex flex-col gap-1.5">
        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          onPointerDown={(event) => {
            // A press on the drawing puts the caret where typing goes next.
            if (disabled) return;
            event.preventDefault();
            focusCell(stop);
          }}
        >
          <defs>
            <linearGradient id={housingId} x1={0} y1={0} x2={0} y2={1}>
              <stop offset={0} stopColor={metal.hi} />
              <stop offset={0.3} stopColor={metal.body} />
              <stop offset={1} stopColor={metal.lo} />
            </linearGradient>
            <linearGradient id={plugId} x1={0} y1={0} x2={0} y2={1}>
              <stop offset={0} stopColor={metal.lo} />
              <stop offset={0.28} stopColor={metal.hi} />
              <stop offset={0.62} stopColor={metal.body} />
              <stop offset={1} stopColor={metal.lo} />
            </linearGradient>
            <radialGradient id={faceId} cx={0.38} cy={0.32} r={0.75}>
              <stop offset={0} stopColor={metal.hi} />
              <stop offset={0.55} stopColor={metal.body} />
              <stop offset={1} stopColor={metal.lo} />
            </radialGradient>
          </defs>

          <path
            d={`M ${FACE - 4} ${TOP} L ${W - 8} ${TOP} Q ${W - 3} ${TOP} ${W - 3} ${TOP + 5} L ${W - 3} ${SHEAR} L ${FACE - 4} ${SHEAR} Z`}
            fill={`url(#${housingId})`}
            stroke={metal.edge}
            strokeWidth={1}
          />
          <path
            d={`M ${FACE - 4} ${SHEAR} L ${W - 3} ${SHEAR} L ${W - 3} ${PLUG_BOTTOM - 5} Q ${W - 3} ${PLUG_BOTTOM} ${W - 8} ${PLUG_BOTTOM} L ${FACE - 4} ${PLUG_BOTTOM} Z`}
            fill={`url(#${plugId})`}
            stroke={metal.edge}
            strokeWidth={1}
          />
          <motion.line
            x1={FACE - 4}
            x2={W - 3}
            y1={SHEAR}
            y2={SHEAR}
            strokeWidth={1.4}
            style={{ stroke: shear }}
          />

          {pins.slice(0, n).map((pin, i) => (
            <PinStack
              key={i}
              cx={FACE + PITCH * i + PITCH / 2}
              pin={pin}
              turn={turn}
              focused={focusAt === i}
            />
          ))}

          <path
            d={FACE_PATH}
            fill={`url(#${faceId})`}
            stroke={metal.edge}
            strokeWidth={1}
          />
          <g transform={`translate(${FX} ${AXIS})`}>
            <motion.g style={{ rotate: turn, originX: 0.5, originY: 0.5 }}>
              <circle
                r={17}
                fill={`url(#${plugId})`}
                stroke={metal.edge}
                strokeWidth={1}
              />
              <path d={KEYWAY} fill={BORE} />
            </motion.g>
          </g>
        </svg>

        <div
          className="grid"
          style={{
            gridTemplateColumns: `minmax(0, ${FACE}fr) repeat(${n}, minmax(0, ${PITCH}fr))`,
          }}
        >
          <span aria-hidden />
          {Array.from({ length: n }, (_, i) => {
            const digit = code[i] ?? "";
            return (
              <div key={i} className="relative flex justify-center px-[3px]">
                <input
                  ref={(node) => {
                    cells.current[i] = node;
                  }}
                  id={cellId(i)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${i + 1} of ${n}`}
                  aria-invalid={errorText ? true : undefined}
                  aria-describedby={describedBy || undefined}
                  required={required}
                  disabled={disabled}
                  tabIndex={i === tabStop ? 0 : -1}
                  value={digit}
                  onKeyDown={(event) => onKeyDown(event, i)}
                  onChange={(event) => onChange(event, i)}
                  onPaste={(event) => onPaste(event, i)}
                  onFocus={(event) => {
                    // Cells fill in order: a press past the code goes to
                    // the next empty cell.
                    if (i > live.current.length) {
                      focusCell(live.current.length);
                      return;
                    }
                    setFocusAt(i);
                    event.currentTarget.select();
                  }}
                  onBlur={() => setFocusAt(null)}
                  className={cn(
                    "block h-10 w-full min-w-0 rounded-2 border bg-surface-1 text-center font-mono text-lg text-foreground tabular-nums caret-transparent transition-colors outline-none placeholder:text-ink-3",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed",
                    errorText
                      ? "border-danger"
                      : phase === "open"
                        ? "border-success/60 bg-success/10"
                        : digit
                          ? "border-hairline-strong"
                          : "border-input",
                    focusAt === i && !errorText && "border-cobalt-bright",
                  )}
                />
                {digit ? null : (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-ink-3/60"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {hasMessage ? (
        <div className="grid text-xs leading-4">
          {hint ? (
            <p
              id={hintId}
              aria-hidden={message !== "hint" || undefined}
              className={cn(
                "col-start-1 row-start-1 text-ink-3 transition-opacity",
                message === "hint" ? "opacity-100" : "opacity-0",
              )}
            >
              {hint}
            </p>
          ) : null}
          <p
            id={errorId}
            className={cn(
              "col-start-1 row-start-1 text-danger transition-opacity",
              message === "error" ? "opacity-100" : "opacity-0",
            )}
          >
            <span key={refusals}>{errorText}</span>
          </p>
          <p
            aria-hidden
            className={cn(
              "col-start-1 row-start-1 text-success transition-opacity",
              message === "open" ? "opacity-100" : "opacity-0",
            )}
          >
            Unlocked.
          </p>
          <p
            aria-hidden
            className={cn(
              "col-start-1 row-start-1 text-ink-2 transition-opacity",
              message === "checking" ? "opacity-100" : "opacity-0",
            )}
          >
            Checking the code…
          </p>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
      {name ? <input type="hidden" name={name} value={code} /> : null}
    </div>
  );
}
