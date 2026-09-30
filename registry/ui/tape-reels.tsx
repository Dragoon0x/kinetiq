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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TapeReelsShell = "clear" | "smoke" | "ivory";

export type TapeReelsProps = {
  /**
   * What is loading: the loader's accessible name, shown beside the cassette
   * unless `hideLabel`. @default "Loading"
   */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px. Detail is simplified below 24 and below 44. @default 24 */
  size?: number;
  /** How fast the motor winds and rewinds, 0.5 to 2. @default 1 */
  speed?: number;
  /** How much tape is on the take-up reel, 0 to 1. Omitted, the tape winds and rewinds on a loop. */
  progress?: number;
  /** The cassette's plastic: clear shows the whole mechanism, smoke darkens it, ivory hides all but the window. @default "clear" */
  shell?: TapeReelsShell;
  /** The paper label across the shell, ruled and written on, with the window cut through it. @default true */
  sticker?: boolean;
  /** A click when a scrub grabs and lets go of the tape, and a whir while it is pulled. Off unless asked for. @default false */
  sound?: boolean;
  /** The tape keeps winding but cannot be scrubbed. @default false */
  disabled?: boolean;
  className?: string;
};

type Pt = [number, number];
type Tier = 0 | 1 | 2;
type Mode = "play" | "rewind" | "held" | "settle" | "idle";

/* The cassette, in a 64-unit box: 60 × 40, centred. */
const HUB_L: Pt = [19.5, 30];
const HUB_R: Pt = [44.5, 30];
const HUB = 4.4;
const FULL = 11.2;
const ROLL_L: Pt = [8.5, 45.2];
const ROLL_R: Pt = [55.5, 45.2];
const ROLL = 1.6;
/** Tape length in drawing units: sets how many turns a whole wind takes. */
const TAPE = 480;
/** Seconds for the motor to wind the whole tape, and to rewind it, at speed 1. */
const WIND_S = 9;
const REWIND_S = 1.4;
const WINDOW = "M 20 23 L 44 23 A 7 7 0 0 1 44 37 L 20 37 A 7 7 0 0 1 20 23 Z";
const LABEL_OUTER =
  "M 6.5 14.5 L 57.5 14.5 A 1.5 1.5 0 0 1 59 16 L 59 39 A 1.5 1.5 0 0 1 57.5 40.5 L 6.5 40.5 A 1.5 1.5 0 0 1 5 39 L 5 16 A 1.5 1.5 0 0 1 6.5 14.5 Z";
const SHELL_PATH =
  "M 5.5 12 L 58.5 12 A 3.5 3.5 0 0 1 62 15.5 L 62 48.5 A 3.5 3.5 0 0 1 58.5 52 L 5.5 52 A 3.5 3.5 0 0 1 2 48.5 L 2 15.5 A 3.5 3.5 0 0 1 5.5 12 Z";
const HEAD = "M 15 52 L 17.5 45 L 46.5 45 L 49 52 Z";
const HOLES = [
  [21, 1.6],
  [25.5, 1.6],
  [30.5, 3],
  [36.9, 1.6],
  [41.4, 1.6],
] as const;
const SCRIBBLE =
  "M 9 21.2 C 10 19.6 11 22.4 12.2 20.8 C 13.2 19.4 13.8 22 15 21 C 16.4 19.8 17 21.8 18.4 20.6 M 20.4 21.4 C 21.4 19.8 22.8 22.2 24 20.6 C 25 19.4 26.2 21.8 27.6 20.8 C 28.8 20 29.4 21.6 30.8 20.9 M 33 21 C 34 19.8 35.2 21.8 36.4 20.6";

type ShellLook = {
  back: string;
  front: string;
  edge: string;
  head: string;
};

// A clear shell takes the page's own colour; smoke and ivory are pigments
// that keep one lightness in both themes.
const SHELLS: Record<TapeReelsShell, ShellLook> = {
  clear: {
    back: "color-mix(in oklab, var(--ink-3) 12%, transparent)",
    front: "color-mix(in oklab, var(--ink-3) 6%, transparent)",
    edge: "color-mix(in oklab, var(--ink-2) 70%, transparent)",
    head: "color-mix(in oklab, var(--ink-3) 22%, transparent)",
  },
  smoke: {
    back: "oklch(0.3 0.01 260 / 0.6)",
    front: "oklch(0.26 0.01 260 / 0.5)",
    edge: "oklch(0.22 0.01 260)",
    head: "oklch(0.24 0.01 260 / 0.85)",
  },
  ivory: {
    back: "oklch(0.92 0.03 90)",
    front: "oklch(0.92 0.03 90)",
    edge: "oklch(0.6 0.03 80)",
    head: "oklch(0.84 0.035 85)",
  },
};

const TAPE_BROWN = "oklch(0.36 0.05 50)";
const TAPE_SHEEN = "oklch(0.48 0.05 55)";
const HUB_WHITE = "oklch(0.95 0.005 90)";
const HUB_HOLE = "oklch(0.3 0.01 260)";
const PAPER = "oklch(0.96 0.02 92)";
const BAND = "oklch(0.64 0.15 28)";
const RULE = "oklch(0.8 0.04 240)";
const INK = "oklch(0.42 0.13 262)";
const ROLLER = "oklch(0.86 0.01 90)";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;

/** Pack radii from the share of tape on the take-up reel: the two areas always add up to the same tape. */
const packs = (pos: number): [number, number] => {
  const p = clamp01(pos);
  const span = FULL * FULL - HUB * HUB;
  return [
    Math.sqrt(HUB * HUB + (1 - p) * span),
    Math.sqrt(HUB * HUB + p * span),
  ];
};

/** Where a line from `from` touches the circle, on the side `turn` picks. */
function tangent(from: Pt, c: Pt, r: number, turn: 1 | -1): Pt {
  const dx = from[0] - c[0];
  const dy = from[1] - c[1];
  const d = Math.max(r + 0.01, Math.hypot(dx, dy));
  const a = Math.atan2(dy, dx) + turn * Math.acos(r / d);
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
}

/** The tape: off the supply pack, round the left roller, across the heads, round the right roller, onto the take-up pack. */
function tapePath(pos: number): string {
  const [rl, rr] = packs(pos);
  const inL: Pt = [ROLL_L[0] - ROLL, ROLL_L[1]];
  const inR: Pt = [ROLL_R[0] + ROLL, ROLL_R[1]];
  const offL = tangent(inL, HUB_L, rl, 1);
  const onR = tangent(inR, HUB_R, rr, -1);
  const low = r2(ROLL_L[1] + ROLL);
  return `M ${f(offL)} L ${f(inL)} A ${ROLL} ${ROLL} 0 0 0 ${ROLL_L[0]} ${low} L ${ROLL_R[0]} ${low} A ${ROLL} ${ROLL} 0 0 0 ${f(inR)} L ${f(onR)}`;
}

/** Six teeth round a hub's hole: they are what shows it turning. */
const TEETH = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const w = 0.5;
  const inner = HUB * 0.36;
  const outer = HUB * 0.62;
  const pts: Pt[] = [
    [inner * c - w * s, inner * s + w * c],
    [outer * c - w * s, outer * s + w * c],
    [outer * c + w * s, outer * s - w * c],
    [inner * c + w * s, inner * s - w * c],
  ];
  return `M ${pts.map((p) => `${Number(p[0].toFixed(3))} ${Number(p[1].toFixed(3))}`).join(" L ")} Z`;
}).join(" ");

/**
 * An inline loader drawn as a cassette whose tape winds from one reel to the
 * other. The two packs are sized from the tape itself — their areas always
 * add up to the same length — and each reel turns by the tape that moves over
 * its own pack's radius, so the emptying reel speeds up while the filling
 * one slows, as real tape does. Given `progress`, the tape follows it on the
 * glide spring; without it a motor winds at a steady tape speed and rewinds
 * fast on a move ease, on a loop.
 *
 * Dragging the cassette sideways pulls the tape 1:1, rubber-banded at the
 * ends. Let go, the tape coasts to where the throw would rest on the glide
 * spring with the release velocity and the motor takes over from there; with
 * `progress` it glides back instead, since the job owns the tape. Holding
 * Left or Right winds it the same way, Home and End rewind or wind it
 * through, and Space or Enter jogs it. Under reduced motion the reels do
 * not turn: the packs step, and a scrub still follows the hand.
 */
export function TapeReels({
  label = "Loading",
  hideLabel = false,
  size = 24,
  speed = 1,
  progress,
  shell = "clear",
  sticker = true,
  sound = false,
  disabled = false,
  className,
}: TapeReelsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const clipId = `${uid}-shell`;

  const px = Math.max(12, Math.round(size));
  const tier: Tier = px < 24 ? 0 : px < 44 ? 1 : 2;
  const unit = 64 / px;
  const sp = clamp(speed, 0.5, 2);
  const determinate = typeof progress === "number" && Number.isFinite(progress);
  const share = determinate ? clamp01(progress) : null;
  const look = SHELLS[shell] ?? SHELLS.clear;
  // A full wind per this many px of drag: never twitchy on a small glyph.
  const span = Math.max(px * 2, 120);

  const pos = useMotionValue(share ?? 0.3);
  const rotL = useMotionValue(12);
  const rotR = useMotionValue(-20);
  const radiusL = useTransform(pos, (p) => r2(packs(p)[0]));
  const radiusR = useTransform(pos, (p) => r2(packs(p)[1]));
  const sheenL = useTransform(radiusL, (r) =>
    r2(Math.max(HUB + 0.3, r * 0.74)),
  );
  const sheenR = useTransform(radiusR, (r) =>
    r2(Math.max(HUB + 0.3, r * 0.74)),
  );
  const tape = useTransform(pos, (p) => tapePath(p));

  const glyphRef = React.useRef<HTMLButtonElement | null>(null);
  const mode = React.useRef<Mode>(share === null ? "play" : "idle");
  const loop = React.useRef({ raf: 0, last: 0, seen: false, acc: 0 });
  const step = React.useRef<(dt: number) => boolean>(() => false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const spin = React.useRef({ l: 12, r: -20, at: share ?? 0.3, t: 0 });
  const scrub = React.useRef<{
    source: "pointer" | "key";
    from: number;
    target: number;
  } | null>(null);
  const whir = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef(0);
  const keyAt = React.useRef(0);

  const motionSafeRef = React.useRef(motionSafe);
  const shareRef = React.useRef(share);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
    shareRef.current = share;
  }, [motionSafe, share]);

  const run = React.useCallback(
    (key: string, controls: AnimationPlaybackControls) => {
      anims.current.get(key)?.stop();
      anims.current.set(key, controls);
    },
    [],
  );
  const halt = React.useCallback((key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  }, []);

  const sleep = React.useCallback(() => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  }, []);

  // The motor's frame loop runs only while the cassette is on screen in a
  // visible page, and only while the motor is winding.
  const wake = React.useCallback(() => {
    const l = loop.current;
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 0;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (step.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  }, []);

  const quiet = React.useCallback(() => {
    window.clearTimeout(hush.current);
    whir.current?.stop();
    whir.current = null;
  }, []);

  React.useEffect(() => {
    step.current = (dt: number) => {
      if (mode.current !== "play") return false;
      const p = pos.get();
      if (!motionSafe) {
        // Reduced motion: the packs step instead of the reels turning.
        const l = loop.current;
        l.acc += dt;
        if (l.acc < 0.6 / sp) return true;
        l.acc = 0;
        pos.set(p >= 0.999 ? 0 : Math.min(1, r2(p + 0.05)));
        return true;
      }
      const next = Math.min(1, p + (dt * sp) / WIND_S);
      pos.set(Number(next.toFixed(5)));
      if (next < 1) return true;
      mode.current = "rewind";
      run(
        "pos",
        animate(pos, 0, {
          duration: REWIND_S / sp,
          ease: easings.move,
          onComplete: () => {
            if (mode.current !== "rewind") return;
            mode.current = "play";
            wake();
          },
        }),
      );
      return false;
    };
  });

  const panHere = () => {
    const rect = glyphRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** Where the tape goes when nothing holds it: the job's share, or on with the motor. */
  const resume = (velocity = 0, rest?: number) => {
    const target = share !== null ? share : clamp01(rest ?? pos.get());
    if (!motionSafe) {
      halt("pos");
      pos.set(target);
      mode.current = share === null ? "play" : "idle";
      wake();
      return;
    }
    mode.current = "settle";
    run(
      "pos",
      animate(pos, target, {
        ...springs.glide,
        velocity,
        onComplete: () => {
          if (mode.current !== "settle") return;
          mode.current = shareRef.current === null ? "play" : "idle";
          wake();
        },
      }),
    );
  };

  const api = React.useRef({ resume });
  React.useEffect(() => {
    api.current = { resume };
  });

  // The reels turn by the tape that moves: each change of the position turns
  // each hub by that length of tape over its own pack's radius. Both turn the
  // same way, as on a real transport. A scrub also hears it.
  React.useEffect(() => {
    return pos.on("change", (v) => {
      const s = spin.current;
      const now = performance.now();
      // Past either end the tape is all on one reel: a rubber-banded pull
      // stretches, it does not turn the hubs.
      const moved = (clamp01(v) - clamp01(s.at)) * TAPE;
      const dt = s.t ? Math.max(0.008, (now - s.t) / 1000) : 0.016;
      s.at = v;
      s.t = now;
      const [rl, rr] = packs(v);
      const dl = (moved / rl) * (180 / Math.PI);
      const dr = (moved / rr) * (180 / Math.PI);
      if (motionSafeRef.current) {
        s.l = (s.l - dl) % 360;
        s.r = (s.r - dr) % 360;
        rotL.set(r2(s.l));
        rotR.set(r2(s.r));
      }
      const w = whir.current;
      if (w && scrub.current) {
        const turns = Math.max(Math.abs(dl), Math.abs(dr)) / 360 / dt;
        w.set({
          pitch: r2(0.55 + Math.min(2.4, turns * 0.35)),
          gain: r2(Math.min(0.7, turns * 0.12)),
        });
        window.clearTimeout(hush.current);
        hush.current = window.setTimeout(() => {
          whir.current?.set({ gain: 0 });
        }, 70);
      }
    });
  }, [pos, rotL, rotR]);

  // The job's share, or the motor, whichever the host asked for.
  React.useEffect(() => {
    if (scrub.current) return;
    if (share === null) {
      if (mode.current === "idle") {
        mode.current = "play";
      }
      wake();
      return;
    }
    if (mode.current === "play" || mode.current === "rewind") {
      halt("pos");
    }
    mode.current = "idle";
    if (!motionSafe) {
      halt("pos");
      pos.set(share);
      return;
    }
    run("pos", animate(pos, share, springs.glide));
  }, [share, motionSafe, pos, run, halt, wake]);

  React.useEffect(() => {
    wake();
  }, [sp, wake]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        sleep();
        quiet();
      } else {
        wake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sleep, wake, quiet]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      sleep();
      for (const c of running.values()) c.stop();
      running.clear();
      window.clearTimeout(hush.current);
      whir.current?.stop();
      whir.current = null;
    };
  }, [sleep]);

  const bindGlyph = React.useCallback(
    (node: HTMLButtonElement | null) => {
      glyphRef.current = node;
      if (!node) return;
      const l = loop.current;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        l.seen = Boolean(entry?.isIntersecting);
        if (l.seen) wake();
        else sleep();
      });
      watcher.observe(node);
      return () => {
        watcher.disconnect();
        l.seen = false;
        sleep();
      };
    },
    [wake, sleep],
  );

  /** A hand takes the tape: the motor lets go and the pinch roller clicks. */
  const grab = (source: "pointer" | "key") => {
    if (disabled) return;
    halt("pos");
    halt("key");
    mode.current = "held";
    const from = pos.get();
    scrub.current = { source, from, target: from };
    const pan = panHere();
    audio.play("click", { pitch: 1.1, gain: 0.5, pan });
    quiet();
    whir.current = audio.start("whir", { pitch: 0.6, gain: 0, pan });
  };

  /** The hand lets go: the tape coasts, then the motor or the job has it. */
  const letGo = (velocity: number) => {
    const s = scrub.current;
    if (!s) return;
    scrub.current = null;
    quiet();
    audio.play("click", { pitch: 0.85, gain: 0.45, pan: panHere() });
    const keyed = anims.current.get("key");
    anims.current.delete("key");
    if (
      share !== null &&
      motionSafe &&
      keyed &&
      Math.abs(pos.get() - s.target) > 0.002
    ) {
      // A key's wind still under way arrives before the tape goes back.
      run(
        "pos",
        animate(pos, s.target, {
          ...springs.snap,
          onComplete: () => api.current.resume(0),
        }),
      );
      return;
    }
    const rest =
      share === null
        ? clamp01(
            s.source === "key" ? s.target : project(pos.get(), velocity, 0.99),
          )
        : undefined;
    resume(velocity, rest);
  };

  /** A tap or Space: the tape jogs forward a little. */
  const jog = () => {
    if (disabled || scrub.current) return;
    audio.play("click", { pitch: 1, gain: 0.45, pan: panHere() });
    const from = pos.get();
    const ahead = Math.min(1, from + 0.05);
    if (!motionSafe) {
      pos.set(share ?? ahead);
      if (share === null) mode.current = "play";
      return;
    }
    halt("pos");
    mode.current = "settle";
    run(
      "pos",
      animate(pos, ahead, {
        ...springs.snap,
        onComplete: () => api.current.resume(0, ahead),
      }),
    );
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => grab("pointer"),
    onMove: ({ offset }) => {
      const s = scrub.current;
      if (!s) return;
      const raw = s.from + offset.x / span;
      s.target = raw;
      pos.set(Number(rubberClamp(raw, 0, 1, 0.12).toFixed(5)));
    },
    onEnd: ({ velocity }) => letGo(velocity.x / span),
    onCancel: () => letGo(0),
    onTap: () => jog(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const k = event.key;
    if (k === " " || k === "Enter") {
      event.preventDefault();
      keyAt.current = event.timeStamp;
      if (!event.repeat) jog();
      return;
    }
    const dir =
      k === "ArrowRight"
        ? 1
        : k === "ArrowLeft"
          ? -1
          : k === "End" || k === "Home"
            ? 0
            : null;
    if (dir === null) return;
    event.preventDefault();
    if (!scrub.current) grab("key");
    const s = scrub.current;
    if (!s || s.source !== "key") return;
    s.target =
      k === "Home" ? 0 : k === "End" ? 1 : clamp01(s.target + dir * 0.035);
    if (!motionSafe) {
      pos.set(s.target);
      return;
    }
    run("key", animate(pos, s.target, springs.snap));
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = event.key;
    if (k === " " || k === "Enter") keyAt.current = event.timeStamp;
    if (
      k !== "ArrowRight" &&
      k !== "ArrowLeft" &&
      k !== "Home" &&
      k !== "End"
    ) {
      return;
    }
    if (scrub.current?.source === "key") letGo(0);
  };

  const stroke = r2(Math.max(0.8, 0.9 * unit));
  const fine = r2(Math.max(0.6, 0.7 * unit));
  const role = share === null ? "status" : "progressbar";
  const hub = (at: Pt, rotate: typeof rotL) => (
    <motion.g style={{ rotate, originX: 0.5, originY: 0.5 }}>
      <circle cx={at[0]} cy={at[1]} r={HUB} style={{ fill: HUB_WHITE }} />
      <circle
        cx={at[0]}
        cy={at[1]}
        r={r2(HUB * 0.62)}
        style={{ fill: HUB_HOLE }}
      />
      {tier === 0 ? (
        <circle
          cx={r2(at[0] + HUB * 0.62)}
          cy={at[1]}
          r={r2(HUB * 0.34)}
          style={{ fill: HUB_WHITE }}
        />
      ) : (
        <path
          d={TEETH}
          transform={`translate(${at[0]} ${at[1]})`}
          style={{ fill: HUB_WHITE }}
        />
      )}
    </motion.g>
  );

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 align-middle",
        className,
      )}
    >
      <button
        ref={bindGlyph}
        type="button"
        disabled={disabled}
        aria-label="Cassette"
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          if (scrub.current?.source === "key") letGo(0);
        }}
        onClick={(event) => {
          // Pointer taps arrive through the drag and keys through keydown; a
          // click with neither behind it — assistive technology — is a jog.
          if (event.detail !== 0 || scrub.current) return;
          if (event.timeStamp - keyAt.current < 400) return;
          jog();
        }}
        {...drag}
        className={cn(
          "relative shrink-0 touch-pan-y rounded-2 outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{ width: px, height: px }}
      >
        <svg
          aria-hidden
          width={px}
          height={px}
          viewBox="0 0 64 64"
          className="block overflow-hidden"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={SHELL_PATH} />
            </clipPath>
          </defs>

          <path d={SHELL_PATH} style={{ fill: look.back }} />

          <g clipPath={`url(#${clipId})`}>
            <motion.circle
              cx={HUB_L[0]}
              cy={HUB_L[1]}
              r={radiusL}
              style={{ fill: TAPE_BROWN }}
            />
            <motion.circle
              cx={HUB_R[0]}
              cy={HUB_R[1]}
              r={radiusR}
              style={{ fill: TAPE_BROWN }}
            />
            {tier === 2 ? (
              <>
                <motion.circle
                  cx={HUB_L[0]}
                  cy={HUB_L[1]}
                  r={sheenL}
                  fill="none"
                  strokeWidth={0.6}
                  style={{ stroke: TAPE_SHEEN }}
                />
                <motion.circle
                  cx={HUB_R[0]}
                  cy={HUB_R[1]}
                  r={sheenR}
                  fill="none"
                  strokeWidth={0.6}
                  style={{ stroke: TAPE_SHEEN }}
                />
              </>
            ) : null}
            {hub(HUB_L, rotL)}
            {hub(HUB_R, rotR)}
            {tier > 0 ? (
              <>
                <motion.path
                  d={tape}
                  fill="none"
                  strokeWidth={fine}
                  strokeLinejoin="round"
                  style={{ stroke: TAPE_BROWN }}
                />
                <circle
                  cx={ROLL_L[0]}
                  cy={ROLL_L[1]}
                  r={ROLL}
                  style={{ fill: ROLLER }}
                />
                <circle
                  cx={ROLL_R[0]}
                  cy={ROLL_R[1]}
                  r={ROLL}
                  style={{ fill: ROLLER }}
                />
              </>
            ) : null}
          </g>

          <path
            d={`${SHELL_PATH} ${WINDOW}`}
            fillRule="evenodd"
            style={{ fill: look.front }}
          />

          {sticker ? (
            <g>
              <path
                d={`${LABEL_OUTER} ${WINDOW}`}
                fillRule="evenodd"
                style={{ fill: PAPER }}
              />
              <path
                d="M 5 18 L 5 16 A 1.5 1.5 0 0 1 6.5 14.5 L 57.5 14.5 A 1.5 1.5 0 0 1 59 16 L 59 18 Z"
                style={{ fill: BAND }}
              />
              {tier > 0 ? (
                <path
                  d="M 8 22.4 L 56 22.4 M 8 38.8 L 56 38.8"
                  strokeWidth={fine}
                  style={{ stroke: RULE }}
                />
              ) : null}
              {tier === 2 ? (
                <path
                  d={SCRIBBLE}
                  fill="none"
                  strokeWidth={0.8}
                  strokeLinecap="round"
                  style={{ stroke: INK }}
                />
              ) : null}
            </g>
          ) : null}

          <path
            d={WINDOW}
            fill="none"
            strokeWidth={fine}
            style={{ stroke: look.edge }}
          />
          {tier === 2 ? (
            <path
              d="M 22 25.4 L 30 25.4"
              strokeWidth={0.8}
              strokeLinecap="round"
              opacity={0.55}
              style={{ stroke: HUB_WHITE }}
            />
          ) : null}

          <path
            d={HEAD}
            strokeWidth={fine}
            strokeLinejoin="round"
            style={{ fill: look.head, stroke: look.edge }}
          />
          {tier === 2
            ? HOLES.map(([x, w]) => (
                <rect
                  key={x}
                  x={x}
                  y={47.8}
                  width={w}
                  height={2.2}
                  rx={0.4}
                  style={{ fill: HUB_HOLE }}
                />
              ))
            : null}
          {tier > 0 ? (
            <path
              d={`M 17.4 ${r2(ROLL_L[1] + ROLL)} L 46.6 ${r2(ROLL_L[1] + ROLL)}`}
              strokeWidth={fine}
              style={{ stroke: TAPE_BROWN }}
            />
          ) : null}
          {tier === 2
            ? (
                [
                  [5.6, 15.6],
                  [58.4, 15.6],
                  [5.6, 48.4],
                  [58.4, 48.4],
                ] as const
              ).map(([x, y]) => (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r={0.9}
                  style={{ fill: look.edge }}
                />
              ))
            : null}

          <path
            d={SHELL_PATH}
            fill="none"
            strokeWidth={stroke}
            style={{ stroke: look.edge }}
          />
        </svg>
      </button>
      <span
        role={role}
        aria-label={label}
        aria-valuemin={share === null ? undefined : 0}
        aria-valuemax={share === null ? undefined : 100}
        aria-valuenow={share === null ? undefined : Math.round(share * 100)}
        className={
          hideLabel ? "sr-only" : "min-w-0 text-sm leading-snug text-foreground"
        }
      >
        {label}
      </span>
      <span id={hintId} className="sr-only">
        Drag sideways, or hold Left or Right, to wind the tape by hand.
      </span>
    </span>
  );
}
