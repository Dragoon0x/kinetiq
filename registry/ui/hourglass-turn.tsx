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
import { durations, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type HourglassSand = "sand" | "rose" | "mint";

export type HourglassTurnProps = {
  /** Visible text beside the glyph, and the loader's accessible name. */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px, 16 to 64. Detail is chosen by size. @default 32 */
  size?: number;
  /** How fast the sand runs and the glass turns over, 0.5 to 2. @default 1 */
  speed?: number;
  /** The sand's pigment. @default "sand" */
  sand?: HourglassSand;
  /** Determinate share run through, 0 to 1. Omit for a glass that keeps turning. */
  progress?: number;
  /** Play the glass landing when the visitor turns it. Off unless asked for. @default false */
  sound?: boolean;
  /** Keeps running, but cannot be turned by hand. @default false */
  disabled?: boolean;
  className?: string;
};

/*
 * The drawing lives in a 32-unit box scaled to `size`. Everything sits inside
 * the circle the box inscribes, so the glass can turn to any angle without
 * painting outside its button.
 */
const BOX = 32;
const CX = 16;
const NECK = 16;
/** Where the glass meets the caps. */
const GTOP = 5.6;
const GBOT = 26.4;
const BULB = NECK - GTOP;
const NECK_HALF = 0.55;
const WIDEST = 6.4;
/** Sand fills the top bulb this high above the neck when it is full. */
const FULL = 0.8 * BULB;
const CRATER = 1.6;
const CRATER_HALF = 3.2;
/** The pile's slope (its angle of repose) and the softness of its apex. */
const SLOPE = 0.62;
const APEX = 1.1;
/** A run, top full to top empty, at speed 1, in seconds. */
const RUN = 3.2;
/** The head and the tail of the thread fall this long: gravity, near enough. */
const FALL = 0.12;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The bulb's inner half-width at `d` above the neck (the bulbs mirror). */
function half(d: number): number {
  const t = clamp01(d / BULB);
  const k = 0.74;
  if (t <= k) {
    return (
      NECK_HALF +
      (WIDEST - NECK_HALF) * Math.pow(Math.sin(((t / k) * Math.PI) / 2), 1.15)
    );
  }
  const u = (t - k) / (1 - k);
  return WIDEST - WIDEST * 0.12 * u * u;
}

/*
 * The sand is conserved as drawn area: what leaves the top arrives below, so
 * the eye never sees sand appear or vanish. Two tables, built once, turn a
 * share into a level up top and into a pile's height below.
 */
const ROWS = 80;
const BELOW: number[] = (() => {
  const out = [0];
  for (let i = 0; i < ROWS; i += 1) {
    const d = ((i + 0.5) / ROWS) * BULB;
    out.push((out[i] ?? 0) + 2 * half(d) * (BULB / ROWS));
  }
  return out;
})();

const areaBelow = (d: number) => {
  const i = clamp01(d / BULB) * ROWS;
  const lo = Math.min(ROWS - 1, Math.floor(i));
  const a = BELOW[lo] ?? 0;
  const b = BELOW[lo + 1] ?? a;
  return a + (b - a) * (i - lo);
};

/** The crater opens over the first part of a run and deepens to CRATER. */
const craterOf = (d: number, run: number) =>
  Math.min(d, CRATER) * clamp01(run / 0.08);

const topArea = (d: number, run: number) =>
  areaBelow(d) - Math.min(half(d), CRATER_HALF) * craterOf(d, run);

const SAND = topArea(FULL, 0);

/** How high the sand stands in the top bulb once `run` of it has gone. */
function levelOf(run: number): number {
  const target = SAND * (1 - clamp01(run));
  let lo = 0;
  let hi = FULL;
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    if (topArea(mid, run) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A soft-apexed cone: the pile's height at x from the centre line. */
const cone = (x: number, peak: number) =>
  peak - SLOPE * (Math.sqrt(x * x + APEX * APEX) - APEX);

function pileArea(peak: number): number {
  let area = 0;
  const n = 48;
  for (let i = 0; i < n; i += 1) {
    const u = ((i + 0.5) / n) * BULB;
    const q = (peak - u) / SLOPE + APEX;
    const reach = u >= peak ? 0 : Math.sqrt(Math.max(0, q * q - APEX * APEX));
    area += 2 * Math.min(half(BULB - u), reach) * (BULB / n);
  }
  return area;
}

const PILES: { peak: number; area: number }[] = (() => {
  const out: { peak: number; area: number }[] = [];
  const top = BULB * 1.25;
  for (let i = 0; i <= 96; i += 1) {
    const peak = (top * i) / 96;
    out.push({ peak, area: pileArea(peak) });
  }
  return out;
})();

/** The pile's peak height above the bottom cap once `share` has landed. */
function peakOf(share: number): number {
  const target = SAND * clamp01(share);
  let i = 1;
  while (i < PILES.length - 1 && (PILES[i]?.area ?? 0) < target) i += 1;
  const a = PILES[i - 1] ?? { peak: 0, area: 0 };
  const b = PILES[i] ?? a;
  const f = b.area > a.area ? (target - a.area) / (b.area - a.area) : 0;
  return a.peak + (b.peak - a.peak) * clamp01(f);
}

/** Columns the sand's boundaries are sampled at; the glass clips the rest. */
const XS: number[] = Array.from(
  { length: 17 },
  (_, i) => -(WIDEST + 1) + (2 * (WIDEST + 1) * i) / 16,
);

const region = (upper: number[], lower: number[]) => {
  const top = XS.map((x, i) => `${r3(CX + x)} ${r3(upper[i] ?? 0)}`);
  const bottom = XS.map((x, i) => `${r3(CX + x)} ${r3(lower[i] ?? 0)}`);
  return `M ${top.join(" L ")} L ${bottom.reverse().join(" L ")} Z`;
};

/** The top surface at `run`: a level, and a crater down its middle. */
const surface = (run: number) => {
  const level = levelOf(run);
  const depth = craterOf(level, run);
  const width = Math.max(0.01, Math.min(half(level), CRATER_HALF));
  return XS.map((x) => {
    const a = Math.abs(x);
    return NECK - level + (a < width ? depth * (1 - a / width) : 0);
  });
};

type Sand = { top: string; bottom: string; shade: string };

/**
 * Both bulbs' sand for a drained share `d`. `hang` (1 → 0) is the slump
 * after a turn: at 1 each bulb holds what the other held, upside down —
 * the pile hanging from the top cap, the old top hanging under the neck —
 * and it falls to where it rests. Each region is the band between an upper
 * and a lower boundary that never cross, so the blend is always a clean
 * shape; the glass clips it.
 */
function sandOf(d: number, hang: number): Sand {
  const peak = peakOf(d);
  let topU = surface(d);
  let topL = XS.map(() => NECK + 0.2);
  let botU = XS.map((x) => GBOT - Math.max(0, cone(x, peak)));
  let botL = XS.map(() => GBOT + 1);
  if (hang > 0.001) {
    const lifted = peakOf(1 - d);
    const before = surface(1 - d);
    const hangTopU = XS.map(() => GTOP - 1);
    const hangTopL = XS.map((x) => GTOP + Math.max(0, cone(x, lifted)));
    const hangBotU = XS.map(() => NECK - 0.2);
    const hangBotL = before.map((y) => BOX - y);
    topU = topU.map((y, i) => lerp(y, hangTopU[i] ?? y, hang));
    topL = topL.map((y, i) => lerp(y, hangTopL[i] ?? y, hang));
    botU = botU.map((y, i) => lerp(y, hangBotU[i] ?? y, hang));
    botL = botL.map((y, i) => lerp(y, hangBotL[i] ?? y, hang));
  }
  const hasTop = d < 0.9995 || hang > 0.001;
  const hasBottom = d > 0.0005 || hang > 0.001;
  // The pile's far side is in its own shadow; not while it is falling.
  let shade = "";
  if (hasBottom && hang <= 0.001) {
    const mid = (XS.length - 1) / 2;
    const side = XS.slice(mid).map(
      (x, i) => `${r3(CX + x)} ${r3(botU[mid + i] ?? GBOT)}`,
    );
    shade = `M ${side.join(" L ")} L ${r3(CX + WIDEST + 1)} ${GBOT + 1} L ${CX} ${GBOT + 1} Z`;
  }
  return {
    top: hasTop ? region(topU, topL) : "",
    bottom: hasBottom ? region(botU, botL) : "",
    shade,
  };
}

const GLASS = (() => {
  const n = 24;
  const left: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const d = BULB - (BULB * i) / n;
    left.push([CX - half(d), NECK - d]);
  }
  for (let i = 1; i <= n; i += 1) {
    const d = (BULB * i) / n;
    left.push([CX - half(d), NECK + d]);
  }
  const right = [...left].reverse().map(([x, y]) => [2 * CX - x, y]);
  return `M ${[...left, ...right].map(([x, y]) => `${r3(x ?? 0)} ${r3(y ?? 0)}`).join(" L ")} Z`;
})();

/** A highlight down one side of each bulb, point-symmetric so a half turn leaves it in place. */
const GLINT = (() => {
  const pts = (sign: number) => {
    const out: string[] = [];
    for (let i = 0; i <= 6; i += 1) {
      const d = BULB * (0.42 + (0.4 * i) / 6);
      out.push(`${r3(CX - sign * (half(d) - 1.1))} ${r3(NECK - sign * d)}`);
    }
    return `M ${out.join(" L ")}`;
  };
  return `${pts(1)} ${pts(-1)}`;
})();

/** The thread lands on the pile's peak. */
const peakYOf = (d: number) => GBOT - peakOf(d);

// Fixed lightness from each status hue: a filled pigment, the same in both
// themes (the status tokens themselves are tuned for text).
const PIGMENT: Record<HourglassSand, string> = {
  sand: "oklch(from var(--warn) 0.8 0.09 h)",
  rose: "oklch(from var(--danger) 0.74 0.11 h)",
  mint: "oklch(from var(--success) 0.8 0.09 h)",
};

type Mode = "run" | "rest" | "turn" | "slump" | "hand";

type Api = {
  step: () => void;
  pause: () => void;
  turnOver: (by: "self" | "visitor") => void;
  stopFlow: () => void;
  landed: (target: number, by: "self" | "visitor") => void;
  slumped: () => void;
};

/**
 * An inline loader drawn as a small hourglass. Sand runs from the top bulb
 * into the bottom one as a thin thread onto a growing pile, conserved as
 * drawn area so the top's level races at the end where the bulb narrows and
 * the pile spreads to the walls before it climbs. Empty, it rests a beat and
 * turns itself over on the snap spring; the sand rides the turn and then
 * slumps onto the neck, and the next run begins.
 *
 * Drag the glass sideways to turn it early: it follows the pointer, the
 * thread breaks, and a release past a quarter turn completes the half turn
 * with the release velocity — the sand stays where it was, so what was below
 * now runs from above. Enter or Space turns it the same way. With `progress`
 * the pile is the progress, the sand runs to each new value at the glass's
 * own rate, and a turn by hand is a full tumble that lands where it began.
 *
 * The loader's semantics sit on its label: `role="status"`, or
 * `role="progressbar"` with a value when `progress` is given. Under reduced
 * motion the sand still runs and the thread is still, and a turn is a quick
 * cross-fade to the other way up.
 */
export function HourglassTurn({
  label,
  hideLabel = false,
  size = 32,
  speed = 1,
  sand = "sand",
  progress,
  sound = false,
  disabled = false,
  className,
}: HourglassTurnProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `hourglass-${uid}`;
  const hintId = `hourglass-hint-${uid}`;

  const px = Math.min(64, Math.max(16, Math.round(size)));
  const unit = BOX / px;
  const pace = Math.min(2, Math.max(0.5, speed));
  const runTime = RUN / pace;
  const determinate = progress !== undefined;
  const share = clamp01(progress ?? 0);
  const pigment = PIGMENT[sand] ?? PIGMENT.sand;
  const name = label ?? "Loading";

  const drained = useMotionValue(determinate ? share : 0.12);
  const turn = useMotionValue(0);
  const hang = useMotionValue(0);
  const head = useMotionValue(0);
  const tail = useMotionValue(0);
  const dim = useMotionValue(1);

  const [onScreen, setOnScreen] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);
  const live = onScreen && pageShown;

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timer = React.useRef<number | null>(null);
  const mode = React.useRef<Mode>("run");
  const flowing = React.useRef(false);
  const handFrom = React.useRef(0);
  const thock = React.useRef<{ target: number; gain: number } | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  /** The thread's head leaves the neck and falls onto the pile. */
  const startFlow = () => {
    if (flowing.current) return;
    flowing.current = true;
    halt("tail");
    tail.set(0);
    if (!motionSafe) {
      head.set(1);
      return;
    }
    head.set(0);
    run("head", animate(head, 1, { duration: FALL, ease: "easeIn" }));
  };

  /** The last grains let go of the neck and fall after the rest. */
  const stopFlow = (now = false) => {
    if (!flowing.current) return;
    flowing.current = false;
    const clear = () => {
      head.set(0);
      tail.set(0);
    };
    if (now || !motionSafe) {
      halt("head");
      halt("tail");
      clear();
      return;
    }
    run(
      "tail",
      animate(tail, 1, { duration: FALL, ease: "easeIn", onComplete: clear }),
    );
  };

  const pause = () => {
    clearTimer();
    halt("drain");
  };

  /** Turns the glass: a half turn (indeterminate) or a full tumble. */
  const turnOver = (
    by: "self" | "visitor",
    direction = 1,
    velocity = 0,
    from = turn.get(),
  ) => {
    clearTimer();
    halt("drain");
    halt("hang");
    hang.set(0);
    stopFlow(true);
    const target = direction * (determinate ? 360 : 180);
    mode.current = "turn";
    if (!motionSafe) {
      // A turn under reduced motion is a cross-fade to the other way up.
      halt("turn");
      turn.set(0);
      run(
        "dim",
        animate(dim, 0.25, {
          duration: durations.blink,
          onComplete: () => {
            api.current?.landed(target, by);
            run("dim", animate(dim, 1, { duration: durations.fast }));
          },
        }),
      );
      return;
    }
    turn.set(from);
    thock.current = by === "visitor" ? { target, gain: 0.62 } : null;
    run(
      "turn",
      animate(turn, target, {
        ...(determinate ? springs.glide : springs.snap),
        velocity,
        onComplete: () => api.current?.landed(target, by),
      }),
    );
  };

  /** What happens next, from wherever the glass stands. */
  const step = () => {
    if (!live || mode.current === "turn" || mode.current === "slump") return;
    if (mode.current === "hand") return;
    clearTimer();
    if (determinate) {
      mode.current = "run";
      const from = drained.get();
      if (Math.abs(share - from) < 1e-4) {
        stopFlow();
        return;
      }
      if (share < from) {
        // Sand cannot climb back up the neck: the glass is simply re-read.
        stopFlow(true);
        run(
          "drain",
          animate(
            drained,
            share,
            motionSafe ? springs.glide : { duration: durations.fast },
          ),
        );
        return;
      }
      startFlow();
      run(
        "drain",
        animate(drained, share, {
          duration: Math.min((share - from) * runTime, 0.6 + 0.2 / pace),
          ease: "linear",
          onComplete: () => {
            // A host that reports often keeps one thread running rather
            // than a stutter of them: it waits a moment for the next value.
            timer.current = window.setTimeout(() => {
              timer.current = null;
              api.current?.stopFlow();
            }, 260);
          },
        }),
      );
      return;
    }
    const from = drained.get();
    if (from < 0.9995) {
      mode.current = "run";
      startFlow();
      run(
        "drain",
        animate(drained, 1, {
          duration: (1 - from) * runTime,
          ease: "linear",
          onComplete: () => {
            stopFlow();
            mode.current = "rest";
            api.current?.step();
          },
        }),
      );
      return;
    }
    // Empty: the last grains land, it rests a beat, and it turns itself.
    mode.current = "rest";
    stopFlow();
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        api.current?.turnOver("self");
      },
      Math.round((FALL + 0.16 / pace) * 1000),
    );
  };

  /** The glass has come down. A half turn swaps the bulbs and the sand slumps. */
  const landed = (target: number, by: "self" | "visitor") => {
    halt("turn");
    turn.set(0);
    if (by === "visitor" && !motionSafe && target !== 0) {
      audio.play("thock", {
        pitch: r3(1.3 - ((px - 16) / 48) * 0.5),
        gain: 0.5,
      });
    }
    thock.current = null;
    if (Math.abs(target) === 180) {
      drained.set(r3(1 - drained.get()));
      if (motionSafe) {
        mode.current = "slump";
        hang.set(1);
        run(
          "hang",
          animate(hang, 0, {
            duration: 0.18,
            ease: "easeIn",
            onComplete: () => api.current?.slumped(),
          }),
        );
        return;
      }
    }
    mode.current = "run";
    api.current?.step();
  };

  const slumped = () => {
    mode.current = "run";
    api.current?.step();
  };

  React.useEffect(() => {
    api.current = {
      step,
      pause,
      turnOver: (by) => turnOver(by),
      stopFlow: () => stopFlow(),
      landed,
      slumped,
    };
  });

  // The thock is timed to the moment the glass comes down, not to the end
  // of the spring's settle.
  React.useEffect(
    () =>
      turn.on("change", (value) => {
        const t = thock.current;
        if (!t) return;
        if (Math.abs(value - t.target) < 4) {
          thock.current = null;
          audio.play("thock", {
            pitch: r3(1.3 - ((px - 16) / 48) * 0.5),
            gain: t.gain,
          });
        }
      }),
    [turn, audio, px],
  );

  // Running, resting and progress all pick up from where the glass stands;
  // off screen or in a hidden page nothing runs.
  React.useEffect(() => {
    if (!live) return;
    api.current?.step();
    return () => api.current?.pause();
  }, [live, determinate, share, runTime, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const bindButton = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  /** A press turns it, unless it is already turning. */
  const press = () => {
    if (disabled || mode.current === "turn" || mode.current === "slump") return;
    turnOver("visitor");
  };

  /** Half a turn per this many px of drag. */
  const travel = Math.min(96, Math.max(48, px * 1.6));
  const limit = determinate ? 360 : 180;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      halt("turn");
      halt("dim");
      dim.set(1);
      pause();
      if (mode.current === "slump") {
        halt("hang");
        hang.set(0);
      }
      stopFlow(true);
      thock.current = null;
      handFrom.current = turn.get();
      mode.current = "hand";
    },
    onMove: ({ offset }) => {
      const raw = handFrom.current + (offset.x * 180) / travel;
      turn.set(r3(rubberClamp(raw, -limit, limit, 90)));
    },
    onEnd: ({ velocity }) => {
      const now = turn.get();
      const spin = (velocity.x * 180) / travel;
      const rest = project(now, spin, 0.99);
      const target = Math.max(
        -limit,
        Math.min(limit, Math.round(rest / limit) * limit),
      );
      mode.current = "run";
      if (target === 0) {
        // Fell short: it rocks back upright and carries on.
        if (!motionSafe) {
          turn.set(0);
          api.current?.step();
          return;
        }
        mode.current = "turn";
        thock.current = Math.abs(now) > 12 ? { target: 0, gain: 0.22 } : null;
        run(
          "turn",
          animate(turn, 0, {
            ...springs.snap,
            velocity: spin,
            onComplete: () => api.current?.landed(0, "visitor"),
          }),
        );
        return;
      }
      turnOver("visitor", Math.sign(target), spin, now);
    },
    onCancel: () => {
      mode.current = "run";
      if (!motionSafe) {
        turn.set(0);
        api.current?.step();
        return;
      }
      mode.current = "turn";
      run(
        "turn",
        animate(turn, 0, {
          ...springs.snap,
          onComplete: () => api.current?.landed(0, "self"),
        }),
      );
    },
    onTap: () => press(),
  });

  const sandPaths = useTransform(
    [drained, hang] as MotionValue<number>[],
    ([d = 0, h = 0]: number[]) => sandOf(d, h),
  );
  const topPath = useTransform(sandPaths, (s) => s.top);
  const bottomPath = useTransform(sandPaths, (s) => s.bottom);
  const shadePath = useTransform(sandPaths, (s) => s.shade);
  const peakY = useTransform(drained, peakYOf);
  const threadTop = useTransform(
    [tail, peakY] as MotionValue<number>[],
    ([t = 0, y = NECK]: number[]) => r3(NECK + t * (y - NECK)),
  );
  const threadBottom = useTransform(
    [head, peakY] as MotionValue<number>[],
    ([h = 0, y = NECK]: number[]) => r3(NECK + h * (y - NECK)),
  );
  // The thread breaks the moment the glass leans; it only runs upright.
  const threadOpacity = useTransform(
    [turn, head, tail] as MotionValue<number>[],
    ([t = 0, h = 0, tl = 0]: number[]) => {
      if (h - tl < 0.01) return 0;
      const a = Math.abs(t) % 360;
      return r3(clamp01(1 - Math.min(a, 360 - a) / 6));
    },
  );
  const grains = useTransform(drained, (d) => r3(-d * 90));

  const thread = Math.max(unit, 0.8);
  const stroke = r3(Math.max(1.05 * unit, 0.75));
  const detailed = px >= 24;
  const fine = px >= 32;
  const polished = px >= 40;

  const role = determinate
    ? {
        role: "progressbar" as const,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(share * 100),
      }
    : { role: "status" as const };

  return (
    <span
      className={cn(
        "group/hourglass-turn inline-flex items-center align-middle",
        className,
      )}
      style={{ gap: Math.round(Math.max(6, px * 0.28)) }}
    >
      <button
        ref={bindButton}
        type="button"
        aria-label="Turn the hourglass"
        aria-describedby={hintId}
        disabled={disabled}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap. A click with no
          // pointer behind it — Space, Enter, assistive technology — turns it.
          if (event.detail === 0) press();
        }}
        {...drag}
        className={cn(
          "relative inline-flex shrink-0 touch-pan-y items-center justify-center rounded-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{ width: px, height: px }}
      >
        <motion.svg
          aria-hidden
          width={px}
          height={px}
          viewBox={`0 0 ${BOX} ${BOX}`}
          className="block overflow-hidden"
          style={{ rotate: turn, opacity: dim }}
        >
          <defs>
            <clipPath id={clipId}>
              <path d={GLASS} />
            </clipPath>
          </defs>
          <path d={GLASS} fill="currentColor" fillOpacity={0.06} />
          <g clipPath={`url(#${clipId})`}>
            <motion.path d={topPath} style={{ fill: pigment }} />
            <motion.path d={bottomPath} style={{ fill: pigment }} />
            {detailed ? (
              <motion.path
                d={shadePath}
                style={{
                  fill: `color-mix(in oklab, ${pigment} 70%, black)`,
                  fillOpacity: 0.35,
                }}
              />
            ) : null}
            <motion.line
              x1={CX}
              x2={CX}
              y1={threadTop}
              y2={threadBottom}
              strokeWidth={r3(thread)}
              style={{ stroke: pigment, opacity: threadOpacity }}
            />
            {fine && motionSafe ? (
              <motion.line
                x1={CX}
                x2={CX}
                y1={threadTop}
                y2={threadBottom}
                strokeWidth={r3(thread)}
                strokeDasharray="0.4 1.1"
                strokeDashoffset={grains}
                style={{
                  stroke: `color-mix(in oklab, ${pigment} 62%, black)`,
                  opacity: threadOpacity,
                }}
              />
            ) : null}
          </g>
          {polished ? (
            <path
              d={GLINT}
              fill="none"
              stroke="white"
              strokeOpacity={0.55}
              strokeWidth={r3(0.9 * unit)}
              strokeLinecap="round"
            />
          ) : null}
          <path
            d={GLASS}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.72}
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          {detailed ? (
            <g fill="currentColor" fillOpacity={0.82}>
              <rect x={8} y={GTOP} width={1.1} height={r3(GBOT - GTOP)} />
              <rect x={22.9} y={GTOP} width={1.1} height={r3(GBOT - GTOP)} />
            </g>
          ) : null}
          <g fill="currentColor">
            <rect x={7.4} y={3.2} width={17.2} height={2.4} rx={1.1} />
            <rect x={7.4} y={26.4} width={17.2} height={2.4} rx={1.1} />
          </g>
          {polished ? (
            <g
              stroke="white"
              strokeOpacity={0.35}
              strokeWidth={r3(0.6 * unit)}
              strokeLinecap="round"
            >
              <line x1={8.8} x2={23.2} y1={3.8} y2={3.8} />
              <line x1={8.8} x2={23.2} y1={28.2} y2={28.2} />
            </g>
          ) : null}
        </motion.svg>
      </button>
      <span
        {...role}
        aria-label={name}
        className={cn(
          "min-w-0",
          hideLabel || label === undefined ? "sr-only" : "truncate",
        )}
        title={hideLabel ? undefined : label}
      >
        {label}
      </span>
      <span id={hintId} className="sr-only">
        Drag it sideways to turn it early, or press Enter.
      </span>
    </span>
  );
}
