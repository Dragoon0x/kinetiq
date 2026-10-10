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
import { ArrowUp, ChevronsLeft, Mic, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TalkPillSize = "sm" | "md" | "lg";

export type TalkPillTake = {
  /** How long the take ran, in ms. */
  duration: number;
  /** The take's loudness, resampled to 32 values from 0 to 1. */
  levels: number[];
};

export type TalkPillProps = {
  /** A take was sent: by letting go of a hold, a second press, Space or Enter, or the clock running out. */
  onSend?: (take: TalkPillTake) => void;
  /** A take was thrown away: slid past `cancel`, or Escape. */
  onCancel?: () => void;
  /** Recording started (true) or ended (false). */
  onRecordingChange?: (recording: boolean) => void;
  /** How many bars the waveform tape shows. @default 24 */
  bars?: number;
  /** The longest take, in seconds; the fuse fills toward it and it sends itself at the end. @default 30 */
  duration?: number;
  /** How far left the pill must be squeezed to cancel, in px. @default 96 */
  cancel?: number;
  /** The live input level, 0 to 1. Without it the tape shows a simulated voice. */
  level?: number;
  /** The idle pill's text and the button's accessible name. @default "Hold to talk" */
  label?: string;
  /** The slide hint while recording. @default "Slide to cancel" */
  hint?: string;
  /** What the hint becomes once a release would cancel. @default "Release to cancel" */
  releaseLabel?: string;
  /** A press shorter than this, in ms, starts hands-free recording instead of a hold. @default 250 */
  holdThreshold?: number;
  /** The tape's colour. @default "var(--accent-bright)" */
  color?: string;
  /** 36, 44 or 52px tall. @default "md" */
  size?: TalkPillSize;
  /** Seeds the simulated voice. @default 3 */
  seed?: number;
  /** Click as it starts and sends, a detent at the cancel line, a swish on cancel. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
  /** The rest of the row — a text field — which the recording pill covers. */
  children?: React.ReactNode;
};

type Phase = "idle" | "recording" | "sending" | "cancelling";
type Press = {
  /** This press is what started the recording: letting go sends. */
  hold: boolean;
  at: number;
  sliding: boolean;
};
type Api = {
  start: () => void;
  /** `quiet`: not answering the visitor (the clock ran out, the page left). */
  send: (quiet?: boolean) => void;
  discard: (quiet?: boolean) => void;
  frame: (now: number) => void;
};

const HEIGHT: Record<TalkPillSize, number> = { sm: 36, md: 44, lg: 52 };
const SAMPLE = 1 / 16;
const LIFT = distances.step;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const hash = (n: number, seed: number) => {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A voice, roughly: words of syllables with gaps between, from a seed. */
function voice(t: number, seed: number): number {
  const word = Math.floor(t / 0.42);
  const speaking = hash(word, seed) < 0.74;
  if (!speaking) return 0.04 + 0.04 * hash(Math.floor(t * 20), seed + 1);
  const i = Math.floor(t * 7);
  const u = smooth(t * 7 - i);
  const syllable = hash(i, seed + 2) * (1 - u) + hash(i + 1, seed + 2) * u;
  return clamp(
    0.22 + 0.78 * syllable * (0.6 + 0.4 * hash(word, seed + 3)),
    0,
    1,
  );
}

/**
 * A voice input pill for a composer. At rest it is a compact capsule at the
 * end of the row; pressing it grows it leftward over the row into a
 * recording pill on the snap spring — a breathing dot and a timer, a
 * waveform tape whose newest sample enters at the right and scrolls left,
 * the hint, and under the finger a knob that says "let go to send". A fuse
 * along the bottom fills toward `duration` and the take sends itself there.
 *
 * Sliding left squeezes it: the knob and the pill's right edge stay under
 * the finger 1:1 and the pill shortens like a tape measure retracting, the
 * tape crowding and flattening as it goes, the edge and knob blending
 * toward danger, until past `cancel` px a detent lands, the hint says
 * "Release to cancel" and the arrow becomes an ×. Let go there — or flick
 * so the throw would carry there — and the pill snaps shut to a circle and
 * pops away; short of it, the edge springs back out with the throw's
 * speed. Letting go of a hold sends the take with a small lift. A quick tap
 * starts hands-free recording instead, which a second tap sends.
 *
 * It is a toggle button: Space or Enter starts and sends, Escape cancels,
 * and the outcome is spoken. Under reduced motion the pill swaps width on a
 * short fade, the tape updates in place, and a slide still cancels — the
 * colour and label change while the pill stays put.
 */
export function TalkPill({
  onSend,
  onCancel,
  onRecordingChange,
  bars = 24,
  duration = 30,
  cancel = 96,
  level,
  label = "Hold to talk",
  hint = "Slide to cancel",
  releaseLabel = "Release to cancel",
  holdThreshold = 250,
  color = "var(--accent-bright)",
  size = "md",
  seed = 3,
  sound = false,
  disabled = false,
  className,
  children,
}: TalkPillProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const h = HEIGHT[size] ?? HEIGHT.md;
  const count = clamp(Math.round(bars), 4, 64);
  const limit = Math.max(1, duration);
  const reach = Math.max(16, cancel);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [seconds, setSeconds] = React.useState(0);
  const [armed, setArmed] = React.useState(false);
  const [handsFree, setHandsFree] = React.useState(false);
  const [late, setLate] = React.useState(false);
  const [spoken, setSpoken] = React.useState("");
  const [idleW, setIdleW] = React.useState<number | null>(null);
  const recording = phase === "recording";

  // The pill's resting width (the capsule, or the whole row), the squeeze
  // under the finger, and the lift: the pill is always base + slide wide,
  // shifted by slide, so its left edge holds and its right edge follows.
  const base = useMotionValue(0);
  const slide = useMotionValue(0);
  const lift = useMotionValue(0);
  const fill = useMotionValue(0);
  const dot = useMotionValue(1);
  const tape = useMotionValue(0);
  const pop = useMotionValue(1);
  const fuse = useMotionValue(0);
  const squeeze = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pillRef = React.useRef<HTMLButtonElement | null>(null);
  const barsRef = React.useRef<HTMLSpanElement | null>(null);
  const rowW = React.useRef(0);
  const capsule = React.useRef(0);
  const press = React.useRef<Press | null>(null);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const frameId = React.useRef(0);
  const visible = React.useRef(true);
  const take = React.useRef({
    started: 0,
    last: 0,
    sampled: 0,
    held: 0,
    history: new Float32Array(65),
    all: new Float32Array(Math.ceil(600 / SAMPLE)),
    n: 0,
    level: 0,
    armed: false,
    late: false,
  });
  const api = React.useRef<Api | null>(null);
  const levelRef = React.useRef(level);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearLater = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  const pan = () => {
    const r = pillRef.current?.getBoundingClientRect();
    return r ? panFrom(r.right - h / 2, null) : 0;
  };
  const to = (
    key: string,
    mv: MotionValue<number>,
    target: number,
    spring: (typeof springs)[keyof typeof springs],
    velocity = 0,
  ) => {
    if (!motionSafe) {
      run(
        key,
        animate(mv, target, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    run(key, animate(mv, target, { ...spring, velocity }));
  };

  const stopLoop = () => {
    if (frameId.current) window.cancelAnimationFrame(frameId.current);
    frameId.current = 0;
  };
  const loop = () => {
    if (frameId.current || !visible.current || document.hidden) return;
    const tick = (now: number) => {
      frameId.current = 0;
      api.current?.frame(now);
      if (take.current.started && visible.current && !document.hidden) {
        frameId.current = window.requestAnimationFrame(tick);
      }
    };
    frameId.current = window.requestAnimationFrame(tick);
  };

  /** One frame of a take: sample the voice, scroll the tape, run the clock. */
  const frame = (now: number) => {
    const k = take.current;
    if (!k.started) return;
    const t = (now - k.started) / 1000;
    while (k.sampled + SAMPLE <= t) {
      k.sampled += SAMPLE;
      const raw = levelRef.current ?? voice(k.sampled, seed);
      const target = clamp(raw, 0, 1);
      // A meter's ballistics: quick to rise, slower to fall.
      k.level += (target - k.level) * (target > k.level ? 0.6 : 0.28);
      k.history.copyWithin(0, 1, count + 1);
      k.history[count] = k.level;
      if (k.n < k.all.length) k.all[k.n++] = k.level;
    }
    const frac = motionSafe ? clamp((t - k.sampled) / SAMPLE, 0, 1) : 0;
    tape.set(r3(frac));
    const nodes = barsRef.current?.children;
    const flat = 1 - 0.55 * squeeze.get();
    if (nodes) {
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i] as HTMLElement | undefined;
        const v = k.history[i] ?? 0;
        if (node) {
          node.style.transform = `scaleY(${r3(Math.max(0.1, v) * flat)})`;
        }
      }
    }
    dot.set(r3(0.55 + 0.45 * Math.cos(t * Math.PI * 1.6)));
    fuse.set(r3(clamp(t / limit, 0, 1)));
    const whole = Math.floor(t);
    if (whole !== k.held) {
      k.held = whole;
      setSeconds(whole);
    }
    if (!k.late && t >= limit * 0.8) {
      k.late = true;
      setLate(true);
    }
    if (t >= limit) api.current?.send(true);
  };

  const start = () => {
    if (disabled || phase === "recording") return;
    clearLater();
    const k = take.current;
    k.started = performance.now();
    k.sampled = 0;
    k.held = 0;
    k.n = 0;
    k.level = 0;
    k.armed = false;
    k.late = false;
    k.history.fill(0);
    setSeconds(0);
    setLate(false);
    setArmed(false);
    setPhase("recording");
    setSpoken("Recording");
    onRecordingChange?.(true);
    audio.play("click", { pitch: 1, gain: 0.55, pan: pan() });
    if (base.get() <= 0) base.jump(capsule.current);
    slide.jump(0);
    squeeze.jump(0);
    pop.jump(1);
    lift.jump(0);
    to(
      "base",
      base,
      rowW.current || rootRef.current?.clientWidth || capsule.current,
      springs.snap,
    );
    run(
      "fill",
      animate(fill, 1, { duration: durations.base, ease: easings.enter }),
    );
    loop();
  };

  /** Back to the capsule, from wherever the pill is. */
  const rest = (instant = false) => {
    take.current.started = 0;
    stopLoop();
    setArmed(false);
    setHandsFree(false);
    press.current = null;
    if (instant || !motionSafe) {
      base.jump(capsule.current);
      slide.jump(0);
      lift.jump(0);
      pop.jump(1);
      squeeze.jump(0);
      run(
        "fill",
        animate(fill, 0, { duration: durations.fast, ease: easings.exit }),
      );
      setPhase("idle");
      return;
    }
    to("base", base, capsule.current, springs.glide);
    to("slide", slide, 0, springs.glide);
    to("lift", lift, 0, springs.glide);
    run(
      "fill",
      animate(fill, 0, { duration: durations.base, ease: easings.exit }),
    );
    later(() => setPhase("idle"), 140);
  };

  const send = (quiet = false) => {
    const k = take.current;
    if (!k.started) return;
    const ms = Math.round(performance.now() - k.started);
    const levels: number[] = [];
    const n = Math.max(1, k.n);
    for (let i = 0; i < 32; i += 1) {
      const a = Math.floor((i * n) / 32);
      const b = Math.max(a + 1, Math.floor(((i + 1) * n) / 32));
      let peak = 0;
      for (let j = a; j < b && j < k.n; j += 1)
        peak = Math.max(peak, k.all[j] ?? 0);
      levels.push(r2(peak));
    }
    k.started = 0;
    stopLoop();
    setPhase("sending");
    const secs = Math.max(1, Math.round(ms / 1000));
    setSpoken(`Sent, ${secs} ${secs === 1 ? "second" : "seconds"}`);
    if (!quiet) audio.play("click", { pitch: 1.35, gain: 0.6, pan: pan() });
    onRecordingChange?.(false);
    onSend?.({ duration: ms, levels });
    if (!motionSafe) {
      rest(true);
      return;
    }
    // The small lift: up on snap with the tape frozen, then home on glide.
    to("slide", slide, 0, springs.snap);
    to("lift", lift, -LIFT, springs.snap);
    later(() => rest(), 180);
  };

  const discard = (quiet = false) => {
    const k = take.current;
    if (!k.started) return;
    k.started = 0;
    stopLoop();
    setPhase("cancelling");
    setSpoken("Cancelled");
    if (!quiet) audio.play("swish", { pitch: 0.8, gain: 0.5, pan: pan() });
    onRecordingChange?.(false);
    onCancel?.();
    if (!motionSafe) {
      run(
        "pop",
        animate(pop, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => api.current && rest(true),
        }),
      );
      return;
    }
    // Snapped shut to a circle at the left, then popped away.
    const shut = h - (base.get() + slide.get());
    to("base", base, base.get() + shut, springs.snap);
    run(
      "pop",
      animate(pop, 0, {
        duration: durations.base,
        delay: 0.16,
        ease: easings.exit,
        onComplete: () => {
          rest(true);
          // The capsule comes back where it lives.
          pop.jump(0);
          run("pop", animate(pop, 1, springs.snap));
        },
      }),
    );
  };

  React.useEffect(() => {
    api.current = { start, send, discard, frame };
    levelRef.current = level;
  });

  const progress = (x: number) => clamp(-x / reach, 0, 1);

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      if (!take.current.started) return;
      const p = press.current;
      if (p) p.sliding = true;
      running.current.get("slide")?.stop();
    },
    onMove: ({ offset }) => {
      if (!take.current.started) return;
      // The pill can squeeze down to its knob, never past it.
      const most = -(rowW.current - h);
      const x =
        offset.x > 0
          ? rubberband(offset.x, 60)
          : offset.x < most
            ? most + rubberband(offset.x - most, 60)
            : offset.x;
      const k = take.current;
      if (motionSafe) slide.set(r2(x));
      squeeze.set(r3(progress(x)));
      const now = -x >= reach;
      if (now !== k.armed) {
        k.armed = now;
        setArmed(now);
        if (now) audio.play("click", { pitch: 0.7, gain: 0.45, pan: pan() });
      }
    },
    onEnd: ({ velocity, offset }) => {
      const p = press.current;
      press.current = null;
      if (!take.current.started) return;
      const landing = project(Math.min(0, offset.x), velocity.x, 0.99);
      if (-landing >= reach || take.current.armed) {
        discard();
        return;
      }
      take.current.armed = false;
      setArmed(false);
      to("slide", slide, 0, springs.snap, velocity.x);
      run(
        "squeeze",
        animate(squeeze, 0, { duration: durations.fast, ease: easings.enter }),
      );
      if (p?.hold) send();
    },
    onCancel: () => {
      press.current = null;
      take.current.armed = false;
      setArmed(false);
      to("slide", slide, 0, springs.snap);
      run("squeeze", animate(squeeze, 0, { duration: durations.fast }));
      setHandsFree(true);
    },
    onTap: () => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      if (p.hold && performance.now() - p.at < holdThreshold) {
        // A quick tap: hands-free until a second tap.
        setHandsFree(true);
        return;
      }
      send();
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (phase === "sending" || phase === "cancelling") return;
    const hold = phase === "idle";
    press.current = { hold, at: performance.now(), sliding: false };
    if (hold) start();
    drag.onPointerDown(event);
  };

  // A hold broken by the page, not the hand, throws the take away; a
  // hands-free take keeps going.
  React.useEffect(() => {
    const interrupted = () => {
      if (press.current?.hold && take.current.started) {
        api.current?.discard(true);
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        interrupted();
        stopLoop();
      } else if (take.current.started) {
        loop();
      }
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (disabled) api.current?.discard(true);
  }, [disabled]);

  React.useEffect(() => {
    const anims = running.current;
    const k = take.current;
    return () => {
      k.started = 0;
      if (frameId.current) window.cancelAnimationFrame(frameId.current);
      frameId.current = 0;
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      for (const c of anims.values()) c.stop();
      anims.clear();
    };
  }, []);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        rowW.current = node.clientWidth;
        if (take.current.started && !press.current?.sliding) {
          base.set(node.clientWidth);
        }
      });
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
        if (visible.current && take.current.started) loop();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
      };
    },
    [base],
  );

  const bindCapsule = React.useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = node.offsetWidth;
        if (w <= 0) return;
        const was = capsule.current;
        capsule.current = w;
        if (!take.current.started && (base.get() === was || base.get() <= 0)) {
          base.jump(w);
        }
        setIdleW(w);
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [base],
  );

  const width = useTransform(
    [base, slide] as MotionValue<number>[],
    ([b = 0, s = 0]: number[]) => r2(Math.max(0, b + s)),
  );
  const tint = useTransform(squeeze, (p) => Math.round(p * 100));
  const edge = useTransform(
    tint,
    (p) => `color-mix(in oklab, var(--danger) ${p}%, var(--hairline-strong))`,
  );
  const knobBg = useTransform(
    tint,
    (p) => `color-mix(in oklab, var(--danger) ${p}%, var(--primary))`,
  );
  const hintOpacity = useTransform(squeeze, (p) => r3(1 - smooth(p * 1.4)));
  const tapeX = useTransform(tape, (f) => `${r3((-f * 100) / (count + 1))}%`);
  const shown = phase !== "idle";
  const popScale = useTransform(pop, (p) => r3(0.85 + 0.15 * p));

  const face = (
    <>
      <Mic aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </>
  );
  const capsuleClass = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 font-medium",
    size === "sm" ? "text-xs" : "text-sm",
  );

  return (
    <div
      ref={bindRoot}
      className={cn(
        "@container relative flex w-full items-center gap-2 py-2",
        className,
      )}
    >
      <span id={hintId} className="sr-only">
        Hold to record and let go to send, or press Space to start and again to
        send. Slide left or press Escape to cancel.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
      <div className="min-w-0 flex-1" inert={shown || undefined}>
        {children}
      </div>
      {/* Holds the capsule's place in the row; the pill floats over it. */}
      <span
        aria-hidden
        className={cn(capsuleClass, "invisible shrink-0")}
        style={{ height: h }}
      >
        {face}
      </span>

      <motion.button
        ref={pillRef}
        type="button"
        aria-pressed={recording}
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        onClick={(event) => {
          // Pointer presses arrive through the hold and the drag; a click
          // with no pointer behind it — Space, Enter, assistive technology —
          // toggles recording.
          if (event.detail !== 0) return;
          if (phase === "idle") {
            api.current?.start();
            setHandsFree(true);
          } else if (phase === "recording") {
            api.current?.send();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && phase === "recording") {
            event.preventDefault();
            api.current?.discard();
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "absolute right-0 flex touch-pan-y items-center justify-end overflow-hidden rounded-full border outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-[background-color,color] duration-200",
          shown
            ? "cursor-grab bg-card"
            : "cursor-pointer border-transparent bg-primary text-primary-foreground hover:brightness-110",
        )}
        style={{
          top: 8,
          height: h,
          width: idleW === null ? undefined : width,
          x: slide,
          y: lift,
          scale: popScale,
          opacity: pop,
          borderColor: shown ? edge : undefined,
        }}
      >
        <span
          ref={bindCapsule}
          aria-hidden
          className={cn(capsuleClass, "shrink-0", shown && "opacity-0")}
          style={{ height: h }}
        >
          {face}
        </span>

        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-end gap-3 pr-1 pl-4"
          style={{ opacity: fill }}
        >
          <span className="flex shrink-0 items-center gap-2">
            <motion.span
              className="size-2 rounded-full bg-danger"
              style={{ opacity: dot }}
            />
            <span
              className={cn(
                "font-mono text-xs tabular-nums transition-colors",
                late ? "text-warn" : "text-foreground",
              )}
            >
              {clock(seconds)}
            </span>
          </span>
          <span
            className="relative h-1/2 min-w-0 flex-1 overflow-hidden"
            style={{ color }}
          >
            <motion.span
              ref={barsRef}
              className="absolute inset-y-0 left-0 flex items-center"
              style={{ width: `${r3(((count + 1) / count) * 100)}%`, x: tapeX }}
            >
              {Array.from({ length: count + 1 }, (_, i) => (
                <span
                  key={i}
                  className="flex h-full flex-1 items-center justify-center"
                  style={{ transform: "scaleY(0.1)" }}
                >
                  <span className="h-full w-[min(3px,60%)] rounded-full bg-current" />
                </span>
              ))}
            </motion.span>
          </span>
          <span className="grid shrink-0 text-xs">
            <motion.span
              className="col-start-1 row-start-1 flex items-center justify-end gap-1 text-ink-3"
              style={{ opacity: hintOpacity }}
            >
              <ChevronsLeft className="size-3.5 shrink-0" />
              <span className="hidden @[22rem]:inline">
                {handsFree ? "Tap to send" : hint}
              </span>
            </motion.span>
            <span
              className={cn(
                "col-start-1 row-start-1 hidden items-center justify-end text-danger transition-opacity @[22rem]:flex",
                !armed && "opacity-0",
              )}
            >
              {releaseLabel}
            </span>
          </span>
          <motion.span
            className="relative grid shrink-0 place-items-center rounded-full text-primary-foreground"
            style={{ width: h - 10, height: h - 10, backgroundColor: knobBg }}
          >
            <ArrowUp
              className={cn(
                "col-start-1 row-start-1 size-4 transition-[opacity,transform] duration-150",
                armed && "scale-50 opacity-0",
              )}
            />
            <X
              className={cn(
                "col-start-1 row-start-1 size-4 transition-[opacity,transform] duration-150",
                !armed && "scale-50 opacity-0",
              )}
            />
          </motion.span>
          <motion.span
            className={cn(
              "absolute right-4 bottom-0 left-4 h-0.5 origin-left rounded-full",
              late ? "bg-warn" : "bg-cobalt-bright/60",
            )}
            style={{ scaleX: fuse }}
          />
        </motion.span>
      </motion.button>
    </div>
  );
}
